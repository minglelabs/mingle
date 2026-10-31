import AVFoundation
import Foundation
import QuartzCore
import React

@objc(NativeTTSModule)
class NativeTTSModule: RCTEventEmitter, AVAudioPlayerDelegate {
    /// `reason` of the stopped event sent by the earphone guard (contract A.5).
    private static let earphonesDisconnectedReason = "earphones_disconnected"

    private var audioPlayer: AVAudioPlayer?
    private var hasListeners = false
    private var ttsSessionTokenAcquired = false
    private var currentPlaybackId: String?
    private var currentUtteranceId: String?
    /// Earphone mode (contract A.5): the current clip was played with
    /// `stopOnEarphoneDisconnect`, so it must never continue on a non-earphone
    /// output. Main queue only, like `audioPlayer`.
    private var currentStopsOnEarphoneDisconnect = false

    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    override static func requiresMainQueueSetup() -> Bool {
        false
    }

    override func supportedEvents() -> [String]! {
        ["ttsPlaybackFinished", "ttsPlaybackStopped", "ttsError"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        audioPlayer?.stop()
        audioPlayer = nil
        releaseTtsSessionTokenIfNeeded()
    }

    private func emit(_ event: String, payload: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: event, body: payload)
    }

    private func acquireTtsSessionTokenIfNeeded() {
        if ttsSessionTokenAcquired { return }
        MingleAudioSessionCoordinator.shared.acquireTTS()
        ttsSessionTokenAcquired = true
    }

    private func clearCurrentPlaybackIdentity() {
        currentPlaybackId = nil
        currentUtteranceId = nil
    }

    private func playbackPayload(base: [String: Any] = [:]) -> [String: Any] {
        var payload = base
        if let playbackId = currentPlaybackId, !playbackId.isEmpty {
            payload["playbackId"] = playbackId
        }
        if let utteranceId = currentUtteranceId, !utteranceId.isEmpty {
            payload["utteranceId"] = utteranceId
        }
        return payload
    }

    // No ducking of other apps on iOS: changing the category options of the
    // active session (adding or removing `.duckOthers`) makes iOS interrupt a
    // non-mixable player such as a YouTube video, which pauses on every clip
    // (observed on device: `cmsInterruptSession ... INTERRUPTING WebKit
    // MediaPlayback` right after each option change). The translation plays
    // mixed over the other app instead.

    private func releaseTtsSessionTokenIfNeeded() {
        if !ttsSessionTokenAcquired { return }
        MingleAudioSessionCoordinator.shared.releaseTTS()
        ttsSessionTokenAcquired = false
        MingleAudioSessionCoordinator.shared.scheduleDeactivateAudioSessionIfIdle(
            trigger: "tts_release"
        )
    }

    private func resolveOutputRouteLabel() -> String {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        if outputs.isEmpty {
            return "none"
        }
        return outputs
            .map { "\($0.portName)(\($0.portType.rawValue))" }
            .joined(separator: ",")
    }

    @objc(play:resolver:rejecter:)
    func play(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let audioBase64 = options["audioBase64"] as? String,
              let audioData = Data(base64Encoded: audioBase64)
        else {
            reject("decode_error", "Failed to decode base64 audio data", nil)
            return
        }
        let rawPlaybackId = (options["playbackId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawUtteranceId = (options["utteranceId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let playbackId = rawPlaybackId.isEmpty
            ? (rawUtteranceId.isEmpty ? UUID().uuidString : rawUtteranceId)
            : rawPlaybackId
        let stopsOnEarphoneDisconnect = (options["stopOnEarphoneDisconnect"] as? Bool) ?? false

        NSLog(
            "[NativeTTSModule] play playbackId=%@ utteranceId=%@ audioBytes=%d stopOnEarphoneDisconnect=%d",
            playbackId,
            rawUtteranceId,
            audioData.count,
            stopsOnEarphoneDisconnect ? 1 : 0
        )

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            if self.audioPlayer?.isPlaying == true {
                self.noteClipStopped()
            }
            self.audioPlayer?.stop()
            self.audioPlayer = nil
            self.releaseTtsSessionTokenIfNeeded()
            self.clearCurrentPlaybackIdentity()
            self.currentPlaybackId = playbackId
            self.currentUtteranceId = rawUtteranceId.isEmpty ? nil : rawUtteranceId
            self.currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

            // Earphone mode (contract A.5): a flagged clip never starts on a
            // non-earphone output. Checked before the session is touched, so a
            // refused clip leaves the audio session exactly as it was.
            if stopsOnEarphoneDisconnect {
                let route = MingleAudioRouteClassifier.currentSnapshot()
                if !route.earphonesConnected {
                    NSLog(
                        "[NativeTTSModule] refused playbackId=%@ reason=%@ outputs=[%@]",
                        playbackId,
                        Self.earphonesDisconnectedReason,
                        route.outputTypes.joined(separator: ",")
                    )
                    let stoppedPayload = self.playbackPayload(base: ["reason": Self.earphonesDisconnectedReason])
                    self.clearCurrentPlaybackIdentity()
                    self.currentStopsOnEarphoneDisconnect = false
                    self.emit("ttsPlaybackStopped", payload: stoppedPayload)
                    resolve(["ok": false, "reason": Self.earphonesDisconnectedReason])
                    return
                }
            }

            // Ensure .playAndRecord with .default mode for full-volume TTS.
            // After STT stops it may leave the session in .voiceChat mode (quiet).
            // Always reconfigure to .default when STT is not running (coordinator
            // snapshot shows stt==0).  When STT IS running it has already set the
            // mode (.voiceChat or .default depending on AEC).
            let session = AVAudioSession.sharedInstance()
            let owners = MingleAudioSessionCoordinator.shared.snapshot()
            // A device-audio session owns a mixable playback session (no
            // microphone); the clip plays inside it as it is.
            let deviceAudioActive = MingleDeviceAudioState.shared.isActive
            let needsReconfigure = !deviceAudioActive
                && (session.category != .playAndRecord
                    || (owners.stt == 0 && session.mode != .default))
            if needsReconfigure {
                do {
                    try session.setCategory(
                        .playAndRecord,
                        mode: .default,
                        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
                    )
                    try session.setActive(true, options: [])
                    NSLog("[NativeTTSModule] reconfigured session to .default mode for TTS")
                } catch {
                    NSLog("[NativeTTSModule] session fallback failed: %@", error.localizedDescription)
                }
            }
            do {
                try session.setActive(true, options: [])
                NSLog(
                    "[NativeTTSModule] session active playbackId=%@ outputs=[%@]",
                    playbackId,
                    self.resolveOutputRouteLabel()
                )
            } catch {
                NSLog("[NativeTTSModule] setActive(true) failed: %@", error.localizedDescription)
            }

            do {
                // iOS cannot lower the other app while a clip plays without
                // pausing it, so the translation itself is played louder.
                let prepared = Self.prepareClip(audioData, gain: Self.translationGain)
                let player = try AVAudioPlayer(data: prepared?.playable ?? audioData)
                player.delegate = self
                player.prepareToPlay()
                if !player.play() {
                    throw NSError(
                        domain: "NativeTTSModule",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "AVAudioPlayer failed to start playback"]
                    )
                }
                if deviceAudioActive {
                    // The broadcast captures this clip too (in both ears);
                    // the STT side removes it using exactly what was played.
                    if let reference = prepared?.reference, !reference.isEmpty {
                        MingleTranslationEchoCanceller.shared.registerClip(
                            reference,
                            startHostTime: CACurrentMediaTime() + Self.outputDelay(session)
                        )
                    } else {
                        NSLog("[NativeTTSModule] no echo reference playbackId=%@", playbackId)
                    }
                }
                self.audioPlayer = player
                self.acquireTtsSessionTokenIfNeeded()
                NSLog("[NativeTTSModule] playing playbackId=%@ duration=%.2f", playbackId, player.duration)
                resolve(["ok": true])
            } catch {
                NSLog("[NativeTTSModule] play failed: %@", error.localizedDescription)
                self.clearCurrentPlaybackIdentity()
                self.currentStopsOnEarphoneDisconnect = false
                self.releaseTtsSessionTokenIfNeeded()
                reject("playback_error", "Failed to play audio: \(error.localizedDescription)", error)
            }
        }
    }

    @objc(stop:rejecter:)
    func stop(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let wasPlaying = self.audioPlayer?.isPlaying == true
            let stoppedPayload = self.playbackPayload()
            if let player = self.audioPlayer, player.isPlaying {
                player.stop()
                self.noteClipStopped()
            }
            self.audioPlayer = nil
            self.clearCurrentPlaybackIdentity()
            self.currentStopsOnEarphoneDisconnect = false
            self.releaseTtsSessionTokenIfNeeded()
            if wasPlaying {
                NSLog("[NativeTTSModule] stopped playbackId=%@", stoppedPayload["playbackId"] as? String ?? "")
                self.emit("ttsPlaybackStopped", payload: stoppedPayload)
            }
            resolve(["ok": true])
        }
    }

    /// From starting or stopping the player to the sound leaving the output.
    private static func outputDelay(_ session: AVAudioSession) -> Double {
        session.outputLatency + session.ioBufferDuration
    }

    /// The clip that was playing stops now: the echo canceller stops removing
    /// it once its last played sound has passed through the capture.
    private func noteClipStopped() {
        MingleTranslationEchoCanceller.shared.stopClip(
            atHostTime: CACurrentMediaTime() + Self.outputDelay(AVAudioSession.sharedInstance())
        )
    }

    // MARK: - Louder translation

    /// Linear gain applied to every clip (2x amplitude, about +6 dB).
    static let translationGain: Float = 2.0

    struct PreparedClip {
        /// 16-bit WAV to play.
        let playable: Data
        /// The same sound as 16 kHz mono, for MingleTranslationEchoCanceller.
        let reference: [Float]
    }

    /// The clip decoded, multiplied by `gain` with a soft limit near full
    /// scale (so peaks round off instead of clipping), and re-encoded as
    /// 16-bit WAV, with its echo-canceller reference. nil when the clip cannot
    /// be decoded; the caller then plays the original.
    static func prepareClip(_ data: Data, gain: Float) -> PreparedClip? {
        let fileExtension: String
        if data.starts(with: Array("RIFF".utf8)) {
            fileExtension = "wav"
        } else if data.starts(with: Array("OggS".utf8)) {
            fileExtension = "ogg"
        } else if data.count > 8, data[data.startIndex + 4 ..< data.startIndex + 8] == Data("ftyp".utf8) {
            fileExtension = "m4a"
        } else {
            fileExtension = "mp3"
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("native-tts-\(UUID().uuidString).\(fileExtension)")
        defer { try? FileManager.default.removeItem(at: url) }
        do {
            try data.write(to: url)
            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let frameCount = AVAudioFrameCount(file.length)
            guard frameCount > 0,
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
            else { return nil }
            try file.read(into: buffer)
            guard let channels = buffer.floatChannelData else { return nil }
            let channelCount = Int(format.channelCount)
            let frames = Int(buffer.frameLength)
            let knee: Float = 0.85
            var pcm = Data(capacity: frames * channelCount * MemoryLayout<Int16>.size)
            // What the player outputs, mixed to mono: the echo canceller's reference.
            var mono = [Float](repeating: 0, count: frames)
            for frame in 0 ..< frames {
                var monoSum: Float = 0
                for channel in 0 ..< channelCount {
                    var sample = channels[channel][frame] * gain
                    let magnitude = abs(sample)
                    if magnitude > knee {
                        let limited = knee + (1 - knee) * tanh((magnitude - knee) / (1 - knee))
                        sample = sample < 0 ? -limited : limited
                    }
                    let clamped = max(-1, min(1, sample))
                    monoSum += clamped
                    var value = Int16(clamped * 32767).littleEndian
                    withUnsafeBytes(of: &value) { pcm.append(contentsOf: $0) }
                }
                mono[frame] = monoSum / Float(channelCount)
            }
            let playable = wavData(pcm: pcm, sampleRate: Int(format.sampleRate), channels: channelCount)
            return PreparedClip(
                playable: playable,
                reference: resampledForEchoReference(mono, sampleRate: format.sampleRate)
            )
        } catch {
            NSLog("[NativeTTSModule] amplify skipped: %@", error.localizedDescription)
            return nil
        }
    }

    /// `mono` at `sampleRate` as 16 kHz mono (the capture's format); empty
    /// when it cannot be converted (the clip then plays without cancelling).
    private static func resampledForEchoReference(_ mono: [Float], sampleRate: Double) -> [Float] {
        guard !mono.isEmpty,
              let inputFormat = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let outputFormat = AVAudioFormat(
                  standardFormatWithSampleRate: Double(MingleBroadcastChannel.sampleRate),
                  channels: 1
              ),
              let converter = AVAudioConverter(from: inputFormat, to: outputFormat),
              let input = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(mono.count))
        else { return [] }
        input.frameLength = AVAudioFrameCount(mono.count)
        mono.withUnsafeBufferPointer { source in
            input.floatChannelData?[0].update(from: source.baseAddress!, count: mono.count)
        }
        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        let capacity = AVAudioFrameCount((Double(mono.count) * ratio).rounded(.up)) + 1024
        guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return [] }
        var supplied = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
            if supplied {
                // The whole clip is here: flush the converter's tail too.
                inputStatus.pointee = .endOfStream
                return nil
            }
            supplied = true
            inputStatus.pointee = .haveData
            return input
        }
        guard status != .error, conversionError == nil, let samples = output.floatChannelData?[0] else {
            return []
        }
        return Array(UnsafeBufferPointer(start: samples, count: Int(output.frameLength)))
    }

    private static func wavData(pcm: Data, sampleRate: Int, channels: Int) -> Data {
        var wav = Data(capacity: 44 + pcm.count)
        func append<T: FixedWidthInteger>(_ value: T) {
            withUnsafeBytes(of: value.littleEndian) { wav.append(contentsOf: $0) }
        }
        let blockAlign = channels * MemoryLayout<Int16>.size
        wav.append(contentsOf: Array("RIFF".utf8))
        append(UInt32(36 + pcm.count))
        wav.append(contentsOf: Array("WAVEfmt ".utf8))
        append(UInt32(16))
        append(UInt16(1))
        append(UInt16(channels))
        append(UInt32(sampleRate))
        append(UInt32(sampleRate * blockAlign))
        append(UInt16(blockAlign))
        append(UInt16(16))
        wav.append(contentsOf: Array("data".utf8))
        append(UInt32(pcm.count))
        wav.append(pcm)
        return wav
    }

    // MARK: - Earphone guard (contract A.5)

    @objc
    private func handleAudioRouteChange(_ notification: Notification) {
        // Posted on an arbitrary thread; the player is main-queue state.
        DispatchQueue.main.async { [weak self] in
            self?.stopFlaggedPlaybackIfEarphonesGone()
        }
    }

    /// A clip played with `stopOnEarphoneDisconnect` stops at once when a route
    /// change leaves no earphone output. Other clips behave as before.
    private func stopFlaggedPlaybackIfEarphonesGone() {
        guard currentStopsOnEarphoneDisconnect, let player = audioPlayer else { return }
        let route = MingleAudioRouteClassifier.currentSnapshot()
        guard !route.earphonesConnected else { return }

        let stoppedPayload = playbackPayload(base: ["reason": Self.earphonesDisconnectedReason])
        NSLog(
            "[NativeTTSModule] stopped playbackId=%@ reason=%@ outputs=[%@]",
            stoppedPayload["playbackId"] as? String ?? "",
            Self.earphonesDisconnectedReason,
            route.outputTypes.joined(separator: ",")
        )
        player.stop()
        noteClipStopped()
        audioPlayer = nil
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsPlaybackStopped", payload: stoppedPayload)
    }

    // MARK: - AVAudioPlayerDelegate

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let payload = playbackPayload(base: ["success": flag])
        NSLog(
            "[NativeTTSModule] didFinishPlaying playbackId=%@ success=%d",
            payload["playbackId"] as? String ?? "",
            flag ? 1 : 0
        )
        audioPlayer = nil
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsPlaybackFinished", payload: payload)
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        let payload = playbackPayload(base: ["message": error?.localizedDescription ?? "decode_error"])
        NSLog(
            "[NativeTTSModule] decodeError playbackId=%@ message=%@",
            payload["playbackId"] as? String ?? "",
            error?.localizedDescription ?? "unknown"
        )
        audioPlayer = nil
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsError", payload: payload)
    }
}
