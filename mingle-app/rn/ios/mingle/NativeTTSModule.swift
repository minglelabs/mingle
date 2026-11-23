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
    /// A clip played while it is still arriving (`playStream`). Main queue only.
    private var streamPlayer: NativeTtsPcmStreamPlayer?
    /// Device-audio sessions need the whole clip for the echo canceller, so a
    /// stream is collected here and played as one clip once it ends.
    private var collectedStream: (playbackId: String, sampleRate: Int, pcm: Data)?
    /// On-device speech (`speak`): the synthesizer rendering the latest
    /// request, and that request's playbackId. A newer `speak`, `play`,
    /// `playStream` or `stop` supersedes it. Main queue only.
    private var speechSynthesizer: AVSpeechSynthesizer?
    private var pendingSpeechPlaybackId: String?

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
        streamPlayer?.stop()
        streamPlayer = nil
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
            self.cancelPendingSpeech()

            if self.audioPlayer?.isPlaying == true {
                self.noteClipStopped()
            }
            self.audioPlayer?.stop()
            self.audioPlayer = nil
            self.releaseStream()
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

            let session = AVAudioSession.sharedInstance()
            let deviceAudioActive = self.preparePlaybackSession(playbackId: playbackId)

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

    /// Puts the shared session in shape for a clip (whole or streamed) and
    /// returns whether a device-audio session owns it.
    private func preparePlaybackSession(playbackId: String) -> Bool {
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
        return deviceAudioActive
    }

    @objc(stop:rejecter:)
    func stop(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let wasPlaying = self.audioPlayer?.isPlaying == true
                || self.streamPlayer != nil
                || self.collectedStream != nil
            let stoppedPayload = self.playbackPayload()
            self.cancelPendingSpeech()
            if let player = self.audioPlayer, player.isPlaying {
                player.stop()
                self.noteClipStopped()
            }
            self.audioPlayer = nil
            self.releaseStream()
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
            var pcm = Data(capacity: frames * channelCount * MemoryLayout<Int16>.size)
            // What the player outputs, mixed to mono: the echo canceller's reference.
            var mono = [Float](repeating: 0, count: frames)
            for frame in 0 ..< frames {
                var monoSum: Float = 0
                for channel in 0 ..< channelCount {
                    let clamped = amplified(channels[channel][frame], gain: gain)
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

    /// `sample` times `gain`, with a soft limit near full scale so peaks round
    /// off instead of clipping, clamped to [-1, 1].
    static func amplified(_ sample: Float, gain: Float) -> Float {
        let knee: Float = 0.85
        var value = sample * gain
        let magnitude = abs(value)
        if magnitude > knee {
            let limited = knee + (1 - knee) * tanh((magnitude - knee) / (1 - knee))
            value = value < 0 ? -limited : limited
        }
        return max(-1, min(1, value))
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

    // MARK: - Streamed clips

    /// Opens a clip that is still arriving: headerless 16-bit mono PCM handed
    /// over with `appendStream` and closed with `endStream`. Same session,
    /// gain, events and earphone guard as `play`.
    @objc(playStream:resolver:rejecter:)
    func playStream(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let rawPlaybackId = (options["playbackId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawUtteranceId = (options["utteranceId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let playbackId = rawPlaybackId.isEmpty
            ? (rawUtteranceId.isEmpty ? UUID().uuidString : rawUtteranceId)
            : rawPlaybackId
        let requestedRate = (options["sampleRate"] as? NSNumber)?.intValue ?? 0
        let sampleRate = requestedRate > 0 ? requestedRate : 24_000
        let stopsOnEarphoneDisconnect = (options["stopOnEarphoneDisconnect"] as? Bool) ?? false

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.cancelPendingSpeech()
            if self.audioPlayer?.isPlaying == true {
                self.noteClipStopped()
            }
            self.audioPlayer?.stop()
            self.audioPlayer = nil
            self.releaseStream()
            self.releaseTtsSessionTokenIfNeeded()
            self.clearCurrentPlaybackIdentity()
            self.currentPlaybackId = playbackId
            self.currentUtteranceId = rawUtteranceId.isEmpty ? nil : rawUtteranceId
            self.currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

            if stopsOnEarphoneDisconnect, !MingleAudioRouteClassifier.currentSnapshot().earphonesConnected {
                NSLog("[NativeTTSModule] refused stream playbackId=%@ reason=%@", playbackId, Self.earphonesDisconnectedReason)
                let stoppedPayload = self.playbackPayload(base: ["reason": Self.earphonesDisconnectedReason])
                self.clearCurrentPlaybackIdentity()
                self.currentStopsOnEarphoneDisconnect = false
                self.emit("ttsPlaybackStopped", payload: stoppedPayload)
                resolve(["ok": false, "reason": Self.earphonesDisconnectedReason])
                return
            }

            let deviceAudioActive = self.preparePlaybackSession(playbackId: playbackId)
            if deviceAudioActive {
                // The echo canceller needs the whole clip up front.
                self.collectedStream = (playbackId, sampleRate, Data())
                self.acquireTtsSessionTokenIfNeeded()
                NSLog("[NativeTTSModule] collecting stream playbackId=%@ (device audio)", playbackId)
                resolve(["ok": true])
                return
            }
            do {
                let opened = try NativeTtsPcmStreamPlayer(
                    sampleRate: Double(sampleRate),
                    gain: Self.translationGain,
                    onFinished: { [weak self] finished in
                        guard let self, self.streamPlayer === finished else { return }
                        self.finishStream(finished)
                    }
                )
                self.streamPlayer = opened
                self.acquireTtsSessionTokenIfNeeded()
                NSLog("[NativeTTSModule] streaming playbackId=%@ sampleRate=%d", playbackId, sampleRate)
                resolve(["ok": true])
            } catch {
                NSLog("[NativeTTSModule] playStream failed: %@", error.localizedDescription)
                self.clearCurrentPlaybackIdentity()
                self.currentStopsOnEarphoneDisconnect = false
                self.releaseTtsSessionTokenIfNeeded()
                reject("playback_error", "Failed to open audio stream: \(error.localizedDescription)", error)
            }
        }
    }

    @objc(appendStream:audioBase64:)
    func appendStream(_ playbackId: String, audioBase64: String) {
        guard let pcm = Data(base64Encoded: audioBase64), !pcm.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            // Pieces of a clip that was stopped or replaced meanwhile are dropped.
            guard let self, self.currentPlaybackId == playbackId else { return }
            if self.collectedStream != nil {
                self.collectedStream?.pcm.append(pcm)
            } else {
                self.streamPlayer?.append(pcm)
            }
        }
    }

    @objc(endStream:)
    func endStream(_ playbackId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.currentPlaybackId == playbackId else { return }
            if let collected = self.collectedStream {
                self.collectedStream = nil
                self.playCollectedStream(collected)
                return
            }
            self.streamPlayer?.end()
        }
    }

    private func finishStream(_ finished: NativeTtsPcmStreamPlayer) {
        let payload = playbackPayload(base: ["success": true])
        NSLog(
            "[NativeTTSModule] stream finished playbackId=%@ bytes=%d",
            payload["playbackId"] as? String ?? "",
            finished.receivedBytes
        )
        finished.stop()
        streamPlayer = nil
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsPlaybackFinished", payload: payload)
    }

    /// A stream collected for a device-audio session, played as one clip
    /// through `play` (which registers it with the echo canceller).
    private func playCollectedStream(_ collected: (playbackId: String, sampleRate: Int, pcm: Data)) {
        let utteranceId = currentUtteranceId ?? ""
        let stopsOnEarphoneDisconnect = currentStopsOnEarphoneDisconnect
        let wav = Self.wavData(pcm: collected.pcm, sampleRate: collected.sampleRate, channels: 1)
        releaseTtsSessionTokenIfNeeded()
        let options: NSDictionary = [
            "audioBase64": wav.base64EncodedString(),
            "playbackId": collected.playbackId,
            "utteranceId": utteranceId,
            "stopOnEarphoneDisconnect": stopsOnEarphoneDisconnect,
        ]
        play(options, resolver: { _ in }, rejecter: { [weak self] _, message, _ in
            DispatchQueue.main.async {
                self?.emit("ttsError", payload: [
                    "message": message ?? "playback_error",
                    "playbackId": collected.playbackId,
                    "utteranceId": utteranceId,
                ])
            }
        })
    }

    private func releaseStream() {
        streamPlayer?.stop()
        streamPlayer = nil
        collectedStream = nil
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
        guard currentStopsOnEarphoneDisconnect,
              audioPlayer != nil || streamPlayer != nil || collectedStream != nil
        else { return }
        let route = MingleAudioRouteClassifier.currentSnapshot()
        guard !route.earphonesConnected else { return }

        let stoppedPayload = playbackPayload(base: ["reason": Self.earphonesDisconnectedReason])
        NSLog(
            "[NativeTTSModule] stopped playbackId=%@ reason=%@ outputs=[%@]",
            stoppedPayload["playbackId"] as? String ?? "",
            Self.earphonesDisconnectedReason,
            route.outputTypes.joined(separator: ",")
        )
        if let player = audioPlayer {
            player.stop()
            noteClipStopped()
        }
        audioPlayer = nil
        releaseStream()
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsPlaybackStopped", payload: stoppedPayload)
    }

    // MARK: - On-device speech (AVSpeechSynthesizer)

    /// Speaks `text` with the system voice for `language`, without a server.
    /// The sentence is rendered to PCM first (much faster than real time) and
    /// then played through `play`, so it gets the same gain, earphone guard,
    /// echo-canceller reference and events as a server clip.
    @objc(speak:resolver:rejecter:)
    func speak(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let text = ((options["text"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let language = ((options["language"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            reject("invalid_text", "Nothing to speak", nil)
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

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.cancelPendingSpeech()
            let utterance = AVSpeechUtterance(string: text)
            let voice = Self.bestSpeechVoice(for: language)
            utterance.voice = voice
            NSLog(
                "[NativeTTSModule] speak playbackId=%@ language=%@ voice=%@ quality=%d chars=%d",
                playbackId,
                language,
                voice?.identifier ?? "default",
                voice?.quality.rawValue ?? 0,
                text.count
            )
            let synthesizer = AVSpeechSynthesizer()
            self.speechSynthesizer = synthesizer
            self.pendingSpeechPlaybackId = playbackId
            let startedAt = CACurrentMediaTime()
            let collector = SpeechPcmCollector()
            collector.onDone = { [weak self] pcm, sampleRate in
                DispatchQueue.main.async {
                    guard let self, self.pendingSpeechPlaybackId == playbackId else {
                        resolve(["ok": false, "reason": "superseded"])
                        return
                    }
                    self.pendingSpeechPlaybackId = nil
                    self.speechSynthesizer = nil
                    guard !pcm.isEmpty, sampleRate > 0 else {
                        NSLog("[NativeTTSModule] speak produced no audio playbackId=%@", playbackId)
                        reject("speech_empty", "The system voice produced no audio", nil)
                        return
                    }
                    NSLog(
                        "[NativeTTSModule] speak rendered playbackId=%@ ms=%.0f audioMs=%.0f",
                        playbackId,
                        (CACurrentMediaTime() - startedAt) * 1000,
                        Double(pcm.count / 2) / Double(sampleRate) * 1000
                    )
                    let wav = Self.wavData(pcm: pcm, sampleRate: sampleRate, channels: 1)
                    let playOptions: NSDictionary = [
                        "audioBase64": wav.base64EncodedString(),
                        "playbackId": playbackId,
                        "utteranceId": rawUtteranceId,
                        "stopOnEarphoneDisconnect": stopsOnEarphoneDisconnect,
                    ]
                    self.play(playOptions, resolver: resolve, rejecter: reject)
                }
            }
            synthesizer.write(utterance) { buffer in
                collector.append(buffer)
            }
            collector.armIdleTimeout()
        }
    }

    private func cancelPendingSpeech() {
        pendingSpeechPlaybackId = nil
        speechSynthesizer?.stopSpeaking(at: .immediate)
        speechSynthesizer = nil
    }

    /// The app's language code (`ko`, `zh-Hant`, `pt-BR`) as a BCP-47 tag the
    /// system voices use.
    static func speechLanguageTag(for language: String) -> String {
        let normalized = language.replacingOccurrences(of: "_", with: "-").lowercased()
        switch normalized {
        case "zh-hant", "zh-tw": return "zh-TW"
        case "zh-hk", "yue": return "zh-HK"
        case "zh", "zh-hans", "zh-cn": return "zh-CN"
        default: break
        }
        if normalized.contains("-") {
            let parts = normalized.split(separator: "-")
            return "\(parts[0])-\(parts[1].uppercased())"
        }
        let defaults: [String: String] = [
            "ko": "ko-KR", "en": "en-US", "ja": "ja-JP", "es": "es-ES", "fr": "fr-FR",
            "de": "de-DE", "vi": "vi-VN", "th": "th-TH", "id": "id-ID", "ru": "ru-RU",
            "pt": "pt-BR", "ar": "ar-SA", "hi": "hi-IN", "it": "it-IT", "tr": "tr-TR",
        ]
        return defaults[normalized] ?? normalized
    }

    /// The best installed voice for `language`: premium, then enhanced, then
    /// the default one; the exact region first, then any region of the
    /// language. Novelty voices (Bells, Bubbles...) are never picked.
    static func bestSpeechVoice(for language: String) -> AVSpeechSynthesisVoice? {
        let tag = speechLanguageTag(for: language)
        let base = tag.split(separator: "-").first.map(String.init)?.lowercased() ?? tag.lowercased()
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { voice in
            if #available(iOS 17.0, *), voice.voiceTraits.contains(.isNoveltyVoice) { return false }
            return true
        }
        let exact = voices.filter { $0.language.caseInsensitiveCompare(tag) == .orderedSame }
        let sameLanguage = voices.filter {
            let code = $0.language.lowercased()
            return code == base || code.hasPrefix(base + "-")
        }
        let pool = exact.isEmpty ? sameLanguage : exact
        let best = pool.max { $0.quality.rawValue < $1.quality.rawValue }
        return best ?? AVSpeechSynthesisVoice(language: tag)
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

/// Plays 16-bit mono PCM while it is still arriving: each piece is scheduled
/// on an AVAudioPlayerNode right away (louder by `gain`, like whole clips), and
/// `onFinished` fires (on the main queue) once `end()` was called and the last
/// piece has played. A gap in the stream is silence, not an end. Main queue only.
///
/// When the session changes under the engine (STT switching modes, a route
/// change) the engine stops and may drop what was scheduled, so the pieces not
/// yet played are kept and scheduled again on the restarted engine (the one
/// that was playing starts over). If the engine cannot restart, the clip ends
/// so the queue moves on.
final class NativeTtsPcmStreamPlayer {
    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private let gain: Float
    private let onFinished: (NativeTtsPcmStreamPlayer) -> Void
    /// Scheduled pieces not yet played, oldest first.
    private var unplayed: [(id: Int, buffer: AVAudioPCMBuffer)] = []
    private var nextPieceId = 0
    /// Bumped on every restart: callbacks from before it are ignored.
    private var generation = 0
    private var ended = false
    private var stopped = false
    private var finished = false
    private var leftover: UInt8?
    private var configurationObserver: NSObjectProtocol?
    private(set) var receivedBytes = 0

    init(sampleRate: Double, gain: Float, onFinished: @escaping (NativeTtsPcmStreamPlayer) -> Void) throws {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
            throw NSError(
                domain: "NativeTTSModule",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "Unsupported stream sample rate \(sampleRate)"]
            )
        }
        self.format = format
        self.gain = gain
        self.onFinished = onFinished
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.prepare()
        try engine.start()
        node.play()
        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: .main
        ) { [weak self] _ in
            // Only a stopped engine lost its pieces; a running one plays on.
            guard let self, !self.engine.isRunning else { return }
            self.restart(reason: "configuration_change")
        }
    }

    deinit {
        if let configurationObserver {
            NotificationCenter.default.removeObserver(configurationObserver)
        }
    }

    func append(_ pcm: Data) {
        guard !stopped, !ended else { return }
        receivedBytes += pcm.count
        var bytes = [UInt8]()
        bytes.reserveCapacity(pcm.count + 1)
        if let leftover { bytes.append(leftover) }
        bytes.append(contentsOf: pcm)
        if bytes.count % 2 == 1 {
            leftover = bytes.removeLast()
        } else {
            leftover = nil
        }
        let frames = bytes.count / 2
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let samples = buffer.floatChannelData?[0]
        else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        for frame in 0 ..< frames {
            let raw = Int16(bitPattern: UInt16(bytes[frame * 2]) | (UInt16(bytes[frame * 2 + 1]) << 8))
            samples[frame] = NativeTTSModule.amplified(Float(raw) / 32768, gain: gain)
        }
        let id = nextPieceId
        nextPieceId += 1
        unplayed.append((id, buffer))
        if engine.isRunning {
            schedule(id: id, buffer: buffer)
        } else {
            // Stopped without a notification: restarting schedules it too.
            restart(reason: "engine_not_running")
        }
    }

    func end() {
        guard !stopped else { return }
        ended = true
        finishIfDone()
    }

    func stop() {
        guard !stopped else { return }
        stopped = true
        node.stop()
        engine.stop()
    }

    private func schedule(id: Int, buffer: AVAudioPCMBuffer) {
        let scheduledGeneration = generation
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, !self.stopped, self.generation == scheduledGeneration else { return }
                self.unplayed.removeAll { $0.id == id }
                self.finishIfDone()
            }
        }
    }

    private func restart(reason: String) {
        guard !stopped, !finished else { return }
        generation += 1
        // Drops whatever the stopped engine still held; its callbacks are ignored.
        node.stop()
        do {
            if !engine.isRunning { try engine.start() }
            for piece in unplayed { schedule(id: piece.id, buffer: piece.buffer) }
            node.play()
            NSLog("[NativeTTSModule] stream engine restarted reason=%@ pieces=%d", reason, unplayed.count)
        } catch {
            NSLog("[NativeTTSModule] stream engine restart failed reason=%@: %@", reason, error.localizedDescription)
            unplayed.removeAll()
            ended = true
            finishIfDone()
        }
    }

    private func finishIfDone() {
        guard ended, unplayed.isEmpty, !stopped, !finished else { return }
        finished = true
        onFinished(self)
    }
}

/// Gathers what `AVSpeechSynthesizer.write` renders as 16-bit mono PCM. The
/// render ends with an empty buffer; some iOS versions never send it, so a
/// short pause with no new audio also ends it. `onDone` fires once.
final class SpeechPcmCollector {
    private let queue = DispatchQueue(label: "mingle.tts.speech-collector")
    private var pcm = Data()
    private var sampleRate = 0
    private var done = false
    private var idleWork: DispatchWorkItem?
    var onDone: ((Data, Int) -> Void)?

    /// No audio at all for this long ends the render too (voice missing).
    private static let firstAudioTimeout: TimeInterval = 4.0
    /// Silence after the last buffer that counts as the end.
    private static let trailingIdleTimeout: TimeInterval = 0.6

    func armIdleTimeout() {
        queue.async { self.scheduleIdle(after: Self.firstAudioTimeout) }
    }

    func append(_ buffer: AVAudioBuffer) {
        guard let buffer = buffer as? AVAudioPCMBuffer else { return }
        let frames = Int(buffer.frameLength)
        let format = buffer.format
        var chunk = Data(capacity: frames * 2)
        if frames > 0 {
            let channels = Int(format.channelCount)
            if let int16 = buffer.int16ChannelData {
                for frame in 0 ..< frames {
                    var sum: Int32 = 0
                    for channel in 0 ..< channels { sum += Int32(int16[channel][frame]) }
                    var value = Int16(clamping: sum / Int32(max(channels, 1))).littleEndian
                    withUnsafeBytes(of: &value) { chunk.append(contentsOf: $0) }
                }
            } else if let float = buffer.floatChannelData {
                for frame in 0 ..< frames {
                    var sum: Float = 0
                    for channel in 0 ..< channels { sum += float[channel][frame] }
                    let sample = max(-1, min(1, sum / Float(max(channels, 1))))
                    var value = Int16(sample * 32767).littleEndian
                    withUnsafeBytes(of: &value) { chunk.append(contentsOf: $0) }
                }
            }
        }
        let rate = Int(format.sampleRate)
        queue.async {
            guard !self.done else { return }
            if frames == 0 {
                self.finish()
                return
            }
            if self.sampleRate == 0 { self.sampleRate = rate }
            self.pcm.append(chunk)
            self.scheduleIdle(after: Self.trailingIdleTimeout)
        }
    }

    private func scheduleIdle(after delay: TimeInterval) {
        idleWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.finish() }
        idleWork = work
        queue.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func finish() {
        guard !done else { return }
        done = true
        idleWork?.cancel()
        idleWork = nil
        onDone?(pcm, sampleRate)
        onDone = nil
    }
}
