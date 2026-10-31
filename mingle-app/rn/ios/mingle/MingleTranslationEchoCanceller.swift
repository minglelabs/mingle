import Accelerate
import Foundation
import OSLog
import QuartzCore

/// Removes this app's own translation from the device-audio capture.
///
/// ReplayKit's app audio is the mix of every app, this one included, and iOS
/// offers no way to leave one app out. But the app knows exactly what it
/// played, so it subtracts it:
/// - the TTS module registers every clip (16 kHz mono, exactly as played) with
///   the host time it reaches the output;
/// - the broadcast extension stamps every capture frame with the host time of
///   its first sample;
/// - once per clip a cross-correlation search finds the exact offset between
///   the two, and a short least-squares filter (9 taps) then follows the gain
///   and the sub-sample offset while the clip plays.
/// The other app's sound is uncorrelated with the clip, so it passes through
/// and the filter is not misled by it.
///
/// `process` runs on the STT module's wsQueue; `registerClip` / `stopClip`
/// run on the main queue. Everything is guarded by `lock`.
final class MingleTranslationEchoCanceller {
    static let shared = MingleTranslationEchoCanceller()
    /// Persisted device log (NSLog lines do not reach `log collect`).
    private static let log = Logger(subsystem: "com.minglelabs.mingle.rn", category: "EchoCanceller")
    private static func note(_ message: String) {
        log.notice("\(message, privacy: .public)")
    }

    private static let sampleRate = Double(MingleBroadcastChannel.sampleRate)
    private static let tapCount = 17
    private static let centerTap = 8
    /// Residual echo suppression works on 10 ms frames.
    private static let suppressionFrame = 160
    /// Frame output / predicted echo energy below this: nothing but echo is
    /// left in the frame (no other app speaking), so it is pressed down.
    private static let echoOnlyRatio: Float = 0.04
    /// Above this the other app clearly speaks over the clip: left as it is.
    private static let doubleTalkRatio: Float = 0.15
    /// Gain for an echo-only frame (about -50 dB on top of the subtraction):
    /// at -30 dB a recognizer still transcribed the clip in a quiet room.
    private static let echoOnlyGain: Float = 0.003
    /// Echo-only frames in a row before the gain starts to close (30 ms).
    private static let closeAfterFrames = 3
    /// Capture past the latest candidate offset that the search wants.
    private static let searchSeconds = 0.25
    /// Longest the capture is held back while a new clip is lined up. Kept
    /// under the STT module's 1 s device-audio buffer, so a held burst is
    /// delayed, never dropped.
    private static let maxHoldSeconds = 0.9
    /// Offset range searched before any clip was lined up (or after a miss),
    /// and around the last offset once one was found.
    private static let wideSearchSeconds = 0.5
    private static let narrowSearchSeconds = 0.12
    /// Normalized correlation below this: the clip was not found in the capture.
    private static let minCorrelation: Float = 0.3
    /// The peak must stand this far above any other offset (outside its own
    /// lobe), so a pitch period or a look-alike is never taken for the clip.
    private static let minPeakProminence: Float = 1.25
    private static let peakLobeSamples = 400
    private static let maxSearchAttempts = 5
    /// Per-sample forgetting of the filter statistics (about 0.4 s memory).
    private static let forgetting: Float = 0.99985
    private static let solveInterval = 160
    /// A clip is kept this long past its end for late capture.
    private static let retainSeconds = 2.0

    private final class Reference {
        let samples: [Float]
        let startHostTime: Double
        /// Played samples; shortened when the clip is stopped early.
        var length: Int
        var searchAttempts = 0
        /// After a miss, capture must reach this host time before the next try.
        var retryAfterHostTime: Double?
        /// Capture lag in samples once found; nil = not lined up (no cancelling).
        var delay: Int?
        var weights = [Float](repeating: 0, count: MingleTranslationEchoCanceller.tapCount)
        var correlation = [Float](repeating: 0, count: MingleTranslationEchoCanceller.tapCount * MingleTranslationEchoCanceller.tapCount)
        var crossCorrelation = [Float](repeating: 0, count: MingleTranslationEchoCanceller.tapCount)
        var samplesSinceSolve = 0
        /// Residual suppression gain carried from frame to frame.
        var suppressionGain: Float = 1
        var suppressedFrames = 0
        var echoOnlyFrameRun = 0
        /// Diagnostics over the samples the clip overlapped: capture energy
        /// before and after removal, and how many samples that was.
        var energyIn = 0.0
        var energyOut = 0.0
        /// Capture energy after residual suppression (what reaches STT).
        var energySent = 0.0
        var overlapSamples = 0
        /// Microphone energy while the clip plays (the clip leaking from the
        /// earphones into the microphone is not removed here).
        var micEnergy = 0.0
        var micSamples = 0

        init(samples: [Float], startHostTime: Double) {
            self.samples = samples
            self.startHostTime = startHostTime
            length = samples.count
        }

        var endHostTime: Double {
            startHostTime + Double(length) / MingleTranslationEchoCanceller.sampleRate
        }

        var searchFinished: Bool {
            delay != nil || searchAttempts >= MingleTranslationEchoCanceller.maxSearchAttempts
        }
    }

    private let lock = NSLock()
    private var references: [Reference] = []
    /// Offset found for the last clip: the next one is searched around it.
    private var learnedDelay: Int?
    private var pending: [(samples: [Float], hostTime: Double)] = []
    private var lastCaptureEndHostTime: Double?

    private init() {}

    /// A new device-audio session: nothing of an earlier one applies.
    func reset() {
        lock.lock()
        references.removeAll()
        learnedDelay = nil
        pending.removeAll()
        lastCaptureEndHostTime = nil
        lock.unlock()
    }

    /// `samples`: 16 kHz mono, as played. `startHostTime`: when its first
    /// sample reaches the output (CACurrentMediaTime base).
    func registerClip(_ samples: [Float], startHostTime: Double) {
        guard !samples.isEmpty else { return }
        lock.lock()
        references.append(Reference(samples: samples, startHostTime: startHostTime))
        lock.unlock()
        Self.note(String(format: "clip registered samples=%d", samples.count))
    }

    /// Microphone PCM recorded now, for the per-clip diagnostics only.
    func noteMicrophone(_ pcm: Data) {
        let count = pcm.count / MemoryLayout<Int16>.size
        guard count > 0 else { return }
        let now = CACurrentMediaTime()
        lock.lock()
        defer { lock.unlock() }
        let playing = references.filter { now >= $0.startHostTime && now < $0.endHostTime }
        guard !playing.isEmpty else { return }
        var energy = 0.0
        pcm.withUnsafeBytes { raw in
            for index in 0 ..< count {
                let value = Double(Int16(littleEndian: raw.loadUnaligned(
                    fromByteOffset: index * MemoryLayout<Int16>.size,
                    as: Int16.self
                ))) / 32768
                energy += value * value
            }
        }
        for reference in playing {
            reference.micEnergy += energy
            reference.micSamples += count
        }
    }

    /// The clip playing at `hostTime` stopped there (stop, or a newer clip).
    func stopClip(atHostTime hostTime: Double) {
        lock.lock()
        for reference in references where hostTime < reference.endHostTime {
            let played = Int(((hostTime - reference.startHostTime) * Self.sampleRate).rounded())
            reference.length = max(0, min(reference.length, played))
        }
        lock.unlock()
    }

    /// 16-bit mono capture at `hostTime` in, the same with this app's
    /// translation removed out, in capture order. Returns less (even nothing)
    /// while a new clip is being lined up and makes it up on a later call.
    func process(pcm: Data, hostTime rawHostTime: Double) -> Data {
        let count = pcm.count / MemoryLayout<Int16>.size
        guard count > 0 else { return Data() }
        let now = CACurrentMediaTime()
        // A stamp off the host clock would place every sample wrongly: fall
        // back to the arrival time (the search absorbs the difference).
        let hostTime = abs(rawHostTime - now) < 5 ? rawHostTime : now - Double(count) / Self.sampleRate

        lock.lock()
        defer { lock.unlock() }
        // Device tuning: ReplayKit pauses while nothing plays; log the jumps.
        if let lastEnd = lastCaptureEndHostTime {
            let jump = hostTime - lastEnd
            if abs(jump) > 0.1 {
                Self.note(String(format: "capture time jump=%.0fms frameSamples=%d stamped=%d refs=%d",
                                 jump * 1000, count, rawHostTime == hostTime ? 1 : 0, references.count))
            }
        }
        lastCaptureEndHostTime = hostTime + Double(count) / Self.sampleRate
        for reference in references where reference.endHostTime + Self.retainSeconds < hostTime {
            logSummary(reference)
        }
        references.removeAll { $0.endHostTime + Self.retainSeconds < hostTime }
        if references.isEmpty && pending.isEmpty {
            return pcm
        }

        var samples = [Float](repeating: 0, count: count)
        pcm.withUnsafeBytes { raw in
            for index in 0 ..< count {
                let value = Int16(littleEndian: raw.loadUnaligned(
                    fromByteOffset: index * MemoryLayout<Int16>.size,
                    as: Int16.self
                ))
                samples[index] = Float(value) / 32768
            }
        }
        pending.append((samples, hostTime))
        if lineUpNewClips() {
            return Data()
        }

        var output = Data(capacity: pending.reduce(0) { $0 + $1.samples.count } * MemoryLayout<Int16>.size)
        for block in pending {
            var cleaned = block.samples
            for reference in references where reference.delay != nil {
                cancel(&cleaned, at: block.hostTime, with: reference)
            }
            for sample in cleaned {
                var value = Int16(max(-1, min(1, sample)) * 32767).littleEndian
                withUnsafeBytes(of: &value) { output.append(contentsOf: $0) }
            }
        }
        pending.removeAll(keepingCapacity: true)
        return output
    }

    /// One line per clip once it is done, for tuning on a device: whether it
    /// was lined up, and how much quieter the overlapped capture got.
    private func logSummary(_ reference: Reference) {
        let reductionDb = reference.energyOut > 0 && reference.energyIn > 0
            ? 10 * log10(reference.energyIn / reference.energyOut)
            : 0
        let centerWeight = reference.weights[Self.centerTap]
        let weightSum = reference.weights.reduce(0, +)
        func dbfs(_ energy: Double, _ samples: Int) -> Double {
            samples > 0 && energy > 0 ? 10 * log10(energy / Double(samples)) : -120
        }
        Self.note(String(format: "clip levels inDbfs=%.1f sentDbfs=%.1f micDbfs=%.1f micMs=%d",
            dbfs(reference.energyIn, reference.overlapSamples),
            dbfs(reference.energySent, reference.overlapSamples),
            dbfs(reference.micEnergy, reference.micSamples),
            reference.micSamples / 16))
        Self.note(String(format: "clip done lined=%d attempts=%d delayMs=%.1f overlapMs=%.0f reductionDb=%.1f centerWeight=%.2f weightSum=%.2f suppressedMs=%d",
            reference.delay != nil ? 1 : 0,
            reference.searchAttempts,
            Double(reference.delay ?? 0) / Self.sampleRate * 1000,
            Double(reference.overlapSamples) / Self.sampleRate * 1000,
            reductionDb,
            centerWeight,
            weightSum,
            reference.suppressedFrames * 10
        ))
    }

    // MARK: - Lining a clip up with the capture

    /// Searches the offset of every clip the pending capture reaches. True
    /// when the capture must wait for more before a clip can be searched.
    private func lineUpNewClips() -> Bool {
        guard let first = pending.first, let last = pending.last else { return false }
        let pendingStart = first.hostTime
        let pendingEnd = last.hostTime + Double(last.samples.count) / Self.sampleRate
        for reference in references where !reference.searchFinished {
            let prior = Double(searchCenter(for: reference)) / Self.sampleRate
            let range = searchRangeSeconds(for: reference)
            let echoStart = reference.startHostTime + prior - range
            let echoEnd = reference.endHostTime + prior + range
            guard pendingEnd > echoStart, pendingStart < echoEnd else { continue }
            // The window must hold the clip's opening for every candidate
            // offset, up to the latest one; after a miss, more capture.
            let latestEchoStart = reference.startHostTime + prior + range
            let wantedEnd = min(echoEnd, reference.retryAfterHostTime ?? (latestEchoStart + Self.searchSeconds))
            let canHold = pendingEnd - pendingStart < Self.maxHoldSeconds
            if pendingEnd < wantedEnd, canHold {
                return true
            }
            search(reference)
            if reference.delay == nil, !reference.searchFinished {
                // Not found yet: a longer window holds more of the clip.
                reference.retryAfterHostTime = pendingEnd + Self.searchSeconds
                if canHold { return true }
            }
        }
        return false
    }

    /// Around the last clip's offset; after a miss the whole range again.
    private func searchCenter(for reference: Reference) -> Int {
        reference.searchAttempts > 0 ? 0 : (learnedDelay ?? 0)
    }

    private func searchRangeSeconds(for reference: Reference) -> Double {
        learnedDelay == nil || reference.searchAttempts > 0 ? Self.wideSearchSeconds : Self.narrowSearchSeconds
    }

    private func search(_ reference: Reference) {
        let prior = searchCenter(for: reference)
        let range = Int((searchRangeSeconds(for: reference) * Self.sampleRate).rounded())
        reference.searchAttempts += 1
        let capture = pending.flatMap(\.samples)
        let captureCount = capture.count
        guard captureCount > Self.tapCount, reference.length > Self.tapCount else { return }

        let minDelay = prior - range
        let maxDelay = prior + range
        let lagCount = maxDelay - minDelay + 1
        // Reference index of capture[0] at delay 0.
        let base = Int(((pending[0].hostTime - reference.startHostTime) * Self.sampleRate).rounded())

        // segment[k + j] lines up with capture[j] at delay maxDelay - k.
        let segmentStart = base - maxDelay
        let segmentCount = lagCount + captureCount - 1
        var segment = [Float](repeating: 0, count: segmentCount)
        let copyFrom = max(0, segmentStart)
        let copyTo = min(reference.length, segmentStart + segmentCount)
        if copyFrom < copyTo {
            for index in copyFrom ..< copyTo {
                segment[index - segmentStart] = reference.samples[index]
            }
        }

        var lagCorrelation = [Float](repeating: 0, count: lagCount)
        vDSP_conv(segment, 1, capture, 1, &lagCorrelation, 1, vDSP_Length(lagCount), vDSP_Length(captureCount))

        var squaredPrefix = [Double](repeating: 0, count: segmentCount + 1)
        for index in 0 ..< segmentCount {
            squaredPrefix[index + 1] = squaredPrefix[index] + Double(segment[index] * segment[index])
        }
        let captureEnergy = capture.reduce(0.0) { $0 + Double($1 * $1) }
        guard captureEnergy > 1e-6 else { return }

        var scores = [Float](repeating: 0, count: lagCount)
        var bestLag = -1
        var bestScore: Float = 0
        var bestEnergy = 0.0
        for lag in 0 ..< lagCount {
            let energy = squaredPrefix[lag + captureCount] - squaredPrefix[lag]
            guard energy > 1e-6 else { continue }
            let score = Float(Double(lagCorrelation[lag]) / (energy * captureEnergy).squareRoot())
            scores[lag] = score
            if score > bestScore {
                bestScore = score
                bestLag = lag
                bestEnergy = energy
            }
        }
        var runnerUp: Float = 0
        for lag in 0 ..< lagCount where abs(lag - bestLag) > Self.peakLobeSamples {
            runnerUp = max(runnerUp, scores[lag])
        }
        guard bestLag >= 0,
              bestScore >= Self.minCorrelation,
              bestScore >= runnerUp * Self.minPeakProminence
        else {
            Self.note(String(format: "clip not found attempt=%d bestCorrelation=%.2f runnerUp=%.2f",
                  reference.searchAttempts, bestScore, runnerUp))
            return
        }
        let delay = maxDelay - bestLag
        let gain = Float(Double(lagCorrelation[bestLag]) / bestEnergy)
        reference.delay = delay
        reference.weights[Self.centerTap] = gain
        learnedDelay = delay
        Self.note(String(format: "clip lined up delayMs=%.1f correlation=%.2f gain=%.2f",
              Double(delay) / Self.sampleRate * 1000, bestScore, gain))
    }

    // MARK: - Removing a lined-up clip

    private func cancel(_ block: inout [Float], at hostTime: Double, with reference: Reference) {
        guard let delay = reference.delay else { return }
        let first = Int(((hostTime - reference.startHostTime) * Self.sampleRate).rounded()) - delay
        let count = block.count
        let taps = Self.tapCount
        guard first + count + taps > 0, first - taps < reference.length else { return }

        var window = [Float](repeating: 0, count: taps)
        var predictedEcho = [Float](repeating: 0, count: count)
        for offset in 0 ..< count {
            let center = first + offset
            var windowEnergy: Float = 0
            for tap in 0 ..< taps {
                let index = center + tap - Self.centerTap
                let value = index >= 0 && index < reference.length ? reference.samples[index] : 0
                window[tap] = value
                windowEnergy += value * value
            }
            guard windowEnergy > 0 else { continue }

            let captured = block[offset]
            var echo: Float = 0
            for tap in 0 ..< taps {
                echo += reference.weights[tap] * window[tap]
            }
            predictedEcho[offset] = echo
            block[offset] = captured - echo
            reference.energyIn += Double(captured * captured)
            reference.energyOut += Double(block[offset] * block[offset])
            reference.overlapSamples += 1

            // Least-squares statistics against the capture as received.
            let lambda = Self.forgetting
            for row in 0 ..< taps {
                reference.crossCorrelation[row] = lambda * reference.crossCorrelation[row] + window[row] * captured
                let rowBase = row * taps
                for column in 0 ..< taps {
                    reference.correlation[rowBase + column] = lambda * reference.correlation[rowBase + column]
                        + window[row] * window[column]
                }
            }
            reference.samplesSinceSolve += 1
            if reference.samplesSinceSolve >= Self.solveInterval {
                reference.samplesSinceSolve = 0
                solveWeights(reference)
            }
        }
        suppressResidualEcho(&block, predictedEcho: predictedEcho, reference: reference)
        for offset in 0 ..< count where predictedEcho[offset] != 0 {
            reference.energySent += Double(block[offset] * block[offset])
        }
    }

    /// Subtraction leaves a faint copy of the clip (about -17 to -20 dB on a
    /// device), which a recognizer still transcribes when nothing else plays.
    /// Per 10 ms frame: when what is left is small next to the echo just
    /// removed, the frame holds nothing but that echo and is pressed down;
    /// when the other app clearly speaks over the clip it is left alone.
    private func suppressResidualEcho(_ block: inout [Float], predictedEcho: [Float], reference: Reference) {
        let frameSize = Self.suppressionFrame
        var start = 0
        while start < block.count {
            let end = min(block.count, start + frameSize)
            var echoEnergy: Float = 0
            var residualEnergy: Float = 0
            for index in start ..< end {
                echoEnergy += predictedEcho[index] * predictedEcho[index]
                residualEnergy += block[index] * block[index]
            }
            let samples = Float(end - start)
            var target: Float = 1
            // Only where the clip is actually audible in this frame.
            if echoEnergy / samples > 1e-7 {
                let ratio = residualEnergy / echoEnergy
                if ratio <= Self.echoOnlyRatio {
                    target = Self.echoOnlyGain
                } else if ratio < Self.doubleTalkRatio {
                    let position = (ratio - Self.echoOnlyRatio) / (Self.doubleTalkRatio - Self.echoOnlyRatio)
                    target = Self.echoOnlyGain + (1 - Self.echoOnlyGain) * position
                }
            }
            // Opens at once, so the start of the other app's speech is never
            // clipped; closes only after a few echo-only frames in a row, so a
            // short pause in that speech is not pressed down. Ramped across the
            // frame so no step is audible.
            let previous = reference.suppressionGain
            if target < previous {
                reference.echoOnlyFrameRun += 1
            } else {
                reference.echoOnlyFrameRun = 0
            }
            let next: Float
            if target >= previous {
                next = target
            } else if reference.echoOnlyFrameRun >= Self.closeAfterFrames {
                next = max(target, previous * 0.5)
            } else {
                next = previous
            }
            for index in start ..< end {
                let progress = Float(index - start + 1) / samples
                block[index] *= previous + (next - previous) * progress
            }
            reference.suppressionGain = next
            if next < 0.5 { reference.suppressedFrames += 1 }
            start = end
        }
    }

    /// weights = (R + δI)⁻¹ p, by Gaussian elimination; kept only when sane.
    private func solveWeights(_ reference: Reference) {
        let taps = Self.tapCount
        var trace: Float = 0
        for tap in 0 ..< taps {
            trace += reference.correlation[tap * taps + tap]
        }
        guard trace > 0.05 else { return }
        let loading = trace / Float(taps) * 1e-3
        var matrix = reference.correlation
        var vector = reference.crossCorrelation
        for tap in 0 ..< taps {
            matrix[tap * taps + tap] += loading
        }
        for pivot in 0 ..< taps {
            var best = pivot
            for row in pivot + 1 ..< taps where abs(matrix[row * taps + pivot]) > abs(matrix[best * taps + pivot]) {
                best = row
            }
            guard abs(matrix[best * taps + pivot]) > 1e-9 else { return }
            if best != pivot {
                for column in 0 ..< taps {
                    matrix.swapAt(pivot * taps + column, best * taps + column)
                }
                vector.swapAt(pivot, best)
            }
            let divisor = matrix[pivot * taps + pivot]
            for row in pivot + 1 ..< taps {
                let factor = matrix[row * taps + pivot] / divisor
                guard factor != 0 else { continue }
                for column in pivot ..< taps {
                    matrix[row * taps + column] -= factor * matrix[pivot * taps + column]
                }
                vector[row] -= factor * vector[pivot]
            }
        }
        var weights = [Float](repeating: 0, count: taps)
        for row in stride(from: taps - 1, through: 0, by: -1) {
            var sum = vector[row]
            for column in row + 1 ..< taps {
                sum -= matrix[row * taps + column] * weights[column]
            }
            weights[row] = sum / matrix[row * taps + row]
        }
        guard weights.allSatisfy({ $0.isFinite && abs($0) < 8 }) else { return }
        reference.weights = weights
    }
}
