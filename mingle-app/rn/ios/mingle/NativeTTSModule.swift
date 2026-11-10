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

    // Streamed clip (`streamStart` / `streamAppend` / `streamEnd`): PCM that
    // arrives while it is being generated and plays as it arrives. Main queue
    // only, like `audioPlayer`. At most one of `audioPlayer` and the stream
    // is playing.
    private var streamEngine: AVAudioEngine?
    private var streamNode: AVAudioPlayerNode?
    private var streamFormat: AVAudioFormat?
    /// Bumped whenever the stream is torn down, so late callbacks are ignored.
    private var streamGeneration = 0
    private var streamActive = false
    private var streamStarted = false
    private var streamEnded = false
    private var streamScheduledBuffers = 0
    private var streamQueuedFrames = 0
    private var streamCarryByte: UInt8?
    private var streamStartResolve: RCTPromiseResolveBlock?
    private var streamSampleRate: Double = 24000
    /// Device-audio sessions need the whole clip for the echo canceller: the
    /// PCM is collected here and played as one clip at `streamEnd`.
    private var streamCollectedPcm: Data?

    /// Audio queued before the stream starts playing, so a late network
    /// chunk does not break the first word.
    private static let streamPrebufferSeconds = 0.12
    /// The stream starts by this time even if the prebuffer is not full.
    private static let streamPrebufferTimeout = 0.25

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
        streamNode?.stop()
        streamEngine?.stop()
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

    /// Readies the audio session for a clip and returns whether a
    /// device-audio session is active (it owns the session as it is).
    private func activateSessionForClip(playbackId: String) -> Bool {
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
                resolveOutputRouteLabel()
            )
        } catch {
            NSLog("[NativeTTSModule] setActive(true) failed: %@", error.localizedDescription)
        }
        return deviceAudioActive
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
            self.tearDownStream()
            self.releaseTtsSessionTokenIfNeeded()
            self.clearCurrentPlaybackIdentity()
            self.currentPlaybackId = playbackId
            self.currentUtteranceId = rawUtteranceId.isEmpty ? nil : rawUtteranceId
            self.currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

            if self.refuseIfEarphonesGone(playbackId: playbackId, resolve: resolve) { return }

            do {
                try self.startWholeClip(audioData, playbackId: playbackId)
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

    /// Earphone mode (contract A.5): a flagged clip never starts on a
    /// non-earphone output. Checked before the session is touched, so a
    /// refused clip leaves the audio session exactly as it was. Returns true
    /// when the clip was refused (and `resolve` answered).
    private func refuseIfEarphonesGone(playbackId: String, resolve: RCTPromiseResolveBlock) -> Bool {
        guard currentStopsOnEarphoneDisconnect else { return false }
        let route = MingleAudioRouteClassifier.currentSnapshot()
        guard !route.earphonesConnected else { return false }
        NSLog(
            "[NativeTTSModule] refused playbackId=%@ reason=%@ outputs=[%@]",
            playbackId,
            Self.earphonesDisconnectedReason,
            route.outputTypes.joined(separator: ",")
        )
        let stoppedPayload = playbackPayload(base: ["reason": Self.earphonesDisconnectedReason])
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        emit("ttsPlaybackStopped", payload: stoppedPayload)
        resolve(["ok": false, "reason": Self.earphonesDisconnectedReason])
        return true
    }

    /// Plays one complete clip with AVAudioPlayer. Main queue.
    private func startWholeClip(_ audioData: Data, playbackId: String) throws {
        let session = AVAudioSession.sharedInstance()
        let deviceAudioActive = activateSessionForClip(playbackId: playbackId)

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
        audioPlayer = player
        acquireTtsSessionTokenIfNeeded()
        NSLog("[NativeTTSModule] playing playbackId=%@ duration=%.2f", playbackId, player.duration)
    }

    // MARK: - Streamed clip

    /// Starts a clip whose PCM (16-bit little-endian mono at `sampleRate`)
    /// arrives in pieces: `pcmBase64` here is the first piece, the rest comes
    /// through `streamAppend`, and `streamEnd` says no more will come. Resolves
    /// `{ ok: true }` once sound really starts, like `play`. Events are the
    /// same as for a whole clip.
    @objc(streamStart:resolver:rejecter:)
    func streamStart(
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
        let stopsOnEarphoneDisconnect = (options["stopOnEarphoneDisconnect"] as? Bool) ?? false
        let requestedRate = (options["sampleRate"] as? NSNumber)?.doubleValue ?? 24000
        let sampleRate = requestedRate >= 8000 && requestedRate <= 48000 ? requestedRate : 24000
        let firstPiece = (options["pcmBase64"] as? String).flatMap { Data(base64Encoded: $0) } ?? Data()

        NSLog(
            "[NativeTTSModule] streamStart playbackId=%@ utteranceId=%@ sampleRate=%.0f firstBytes=%d stopOnEarphoneDisconnect=%d",
            playbackId,
            rawUtteranceId,
            sampleRate,
            firstPiece.count,
            stopsOnEarphoneDisconnect ? 1 : 0
        )

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            if self.audioPlayer?.isPlaying == true {
                self.noteClipStopped()
            }
            self.audioPlayer?.stop()
            self.audioPlayer = nil
            self.tearDownStream()
            self.releaseTtsSessionTokenIfNeeded()
            self.clearCurrentPlaybackIdentity()
            self.currentPlaybackId = playbackId
            self.currentUtteranceId = rawUtteranceId.isEmpty ? nil : rawUtteranceId
            self.currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

            if self.refuseIfEarphonesGone(playbackId: playbackId, resolve: resolve) { return }

            self.streamGeneration += 1
            self.streamActive = true
            self.streamStarted = false
            self.streamEnded = false
            self.streamScheduledBuffers = 0
            self.streamQueuedFrames = 0
            self.streamCarryByte = nil
            self.streamSampleRate = sampleRate
            self.streamStartResolve = resolve

            if MingleDeviceAudioState.shared.isActive {
                // The echo canceller needs the clip whole: collect, play at the end.
                self.streamCollectedPcm = Data()
                self.appendStreamPcm(firstPiece)
                return
            }

            _ = self.activateSessionForClip(playbackId: playbackId)
            do {
                guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
                    throw NSError(
                        domain: "NativeTTSModule",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: "Unsupported stream format"]
                    )
                }
                let engine = AVAudioEngine()
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: format)
                engine.prepare()
                try engine.start()
                self.streamEngine = engine
                self.streamNode = node
                self.streamFormat = format
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(self.handleStreamEngineConfigurationChange(_:)),
                    name: .AVAudioEngineConfigurationChange,
                    object: engine
                )
                self.acquireTtsSessionTokenIfNeeded()
                self.appendStreamPcm(firstPiece)
                let generation = self.streamGeneration
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.streamPrebufferTimeout) { [weak self] in
                    guard let self, self.streamGeneration == generation else { return }
                    self.startStreamPlaybackIfReady(force: true)
                }
            } catch {
                NSLog("[NativeTTSModule] streamStart failed: %@", error.localizedDescription)
                self.streamStartResolve = nil
                self.tearDownStream()
                self.clearCurrentPlaybackIdentity()
                self.currentStopsOnEarphoneDisconnect = false
                self.releaseTtsSessionTokenIfNeeded()
                reject("playback_error", "Failed to start stream: \(error.localizedDescription)", error)
            }
        }
    }

    @objc(streamAppend:pcmBase64:)
    func streamAppend(_ playbackId: String, pcmBase64: String) {
        guard let piece = Data(base64Encoded: pcmBase64), !piece.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.streamActive, self.currentPlaybackId == playbackId else { return }
            self.appendStreamPcm(piece)
        }
    }

    @objc(streamEnd:)
    func streamEnd(_ playbackId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.streamActive, self.currentPlaybackId == playbackId, !self.streamEnded else { return }
            self.streamEnded = true
            if let collected = self.streamCollectedPcm {
                self.playCollectedStream(collected, playbackId: playbackId)
                return
            }
            self.startStreamPlaybackIfReady(force: true)
            self.finishStreamIfPlayedOut()
        }
    }

    /// Queues one piece of PCM on the player node (or collects it for a
    /// device-audio session). Main queue.
    private func appendStreamPcm(_ piece: Data) {
        guard streamActive, !piece.isEmpty else { return }
        if streamCollectedPcm != nil {
            streamCollectedPcm?.append(piece)
            return
        }
        guard let node = streamNode, let format = streamFormat else { return }

        // A sample may be cut between two pieces.
        var bytes = Data()
        if let carry = streamCarryByte {
            bytes.append(carry)
            streamCarryByte = nil
        }
        bytes.append(piece)
        if bytes.count % 2 == 1 {
            streamCarryByte = bytes.removeLast()
        }
        let frames = bytes.count / 2
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let channel = buffer.floatChannelData?[0]
        else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        // Same gain and soft limit as a whole clip (see `prepareClip`).
        let gain = Self.translationGain
        let knee: Float = 0.85
        bytes.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            for frame in 0 ..< frames {
                let low = UInt16(raw[frame * 2])
                let high = UInt16(raw[frame * 2 + 1])
                var sample = Float(Int16(bitPattern: low | (high << 8))) / 32768 * gain
                let magnitude = abs(sample)
                if magnitude > knee {
                    let limited = knee + (1 - knee) * tanh((magnitude - knee) / (1 - knee))
                    sample = sample < 0 ? -limited : limited
                }
                channel[frame] = max(-1, min(1, sample))
            }
        }

        let generation = streamGeneration
        streamScheduledBuffers += 1
        streamQueuedFrames += frames
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.streamGeneration == generation else { return }
                self.streamScheduledBuffers -= 1
                self.finishStreamIfPlayedOut()
            }
        }
        startStreamPlaybackIfReady(force: false)
    }

    /// Starts the node once enough audio is queued (or `force`), and answers
    /// `streamStart`. Main queue.
    private func startStreamPlaybackIfReady(force: Bool) {
        guard streamActive, !streamStarted, streamCollectedPcm == nil, let node = streamNode else { return }
        let prebufferFrames = Int(streamSampleRate * Self.streamPrebufferSeconds)
        guard streamQueuedFrames > 0, force || streamEnded || streamQueuedFrames >= prebufferFrames else {
            if force, streamEnded, streamQueuedFrames == 0 {
                // Ended without a single sample: nothing to play.
                failStream(message: "empty_stream")
            }
            return
        }
        streamStarted = true
        node.play()
        NSLog(
            "[NativeTTSModule] stream playing playbackId=%@ queuedFrames=%d",
            currentPlaybackId ?? "",
            streamQueuedFrames
        )
        streamStartResolve?(["ok": true])
        streamStartResolve = nil
    }

    /// The stream is over and everything queued was played: report it like a
    /// finished whole clip. Main queue.
    private func finishStreamIfPlayedOut() {
        guard streamActive, streamEnded, streamCollectedPcm == nil else { return }
        if !streamStarted {
            startStreamPlaybackIfReady(force: true)
            guard streamStarted else { return }
        }
        guard streamScheduledBuffers <= 0 else { return }
        let payload = playbackPayload(base: ["success": true])
        NSLog("[NativeTTSModule] stream finished playbackId=%@", payload["playbackId"] as? String ?? "")
        tearDownStream()
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        emit("ttsPlaybackFinished", payload: payload)
    }

    private func failStream(message: String) {
        let payload = playbackPayload(base: ["message": message])
        NSLog("[NativeTTSModule] stream failed playbackId=%@ message=%@", payload["playbackId"] as? String ?? "", message)
        let resolve = streamStartResolve
        streamStartResolve = nil
        tearDownStream()
        clearCurrentPlaybackIdentity()
        currentStopsOnEarphoneDisconnect = false
        releaseTtsSessionTokenIfNeeded()
        resolve?(["ok": false, "reason": message])
        emit("ttsError", payload: payload)
    }

    /// Device-audio session: the collected stream plays as one whole clip,
    /// so the echo canceller gets its reference. Main queue.
    private func playCollectedStream(_ pcm: Data, playbackId: String) {
        let resolve = streamStartResolve
        streamStartResolve = nil
        let sampleRate = Int(streamSampleRate)
        tearDownStream()
        guard pcm.count >= 2 else {
            let payload = playbackPayload(base: ["message": "empty_stream"])
            clearCurrentPlaybackIdentity()
            currentStopsOnEarphoneDisconnect = false
            resolve?(["ok": false, "reason": "empty_stream"])
            emit("ttsError", payload: payload)
            return
        }
        do {
            let whole = Self.wavData(pcm: pcm.prefix(pcm.count - pcm.count % 2), sampleRate: sampleRate, channels: 1)
            try startWholeClip(whole, playbackId: playbackId)
            resolve?(["ok": true])
        } catch {
            NSLog("[NativeTTSModule] collected stream failed: %@", error.localizedDescription)
            let payload = playbackPayload(base: ["message": error.localizedDescription])
            clearCurrentPlaybackIdentity()
            currentStopsOnEarphoneDisconnect = false
            releaseTtsSessionTokenIfNeeded()
            resolve?(["ok": false, "reason": "playback_error"])
            emit("ttsError", payload: payload)
        }
    }

    /// Whether a streamed clip is producing (or about to produce) sound.
    private var isStreamPlaying: Bool {
        streamActive
    }

    /// Stops and forgets the streamed clip without reporting anything. An
    /// unanswered `streamStart` is answered as not started. Main queue.
    private func tearDownStream() {
        streamGeneration += 1
        if let engine = streamEngine {
            NotificationCenter.default.removeObserver(self, name: .AVAudioEngineConfigurationChange, object: engine)
        }
        streamNode?.stop()
        streamEngine?.stop()
        streamNode = nil
        streamEngine = nil
        streamFormat = nil
        streamActive = false
        streamStarted = false
        streamEnded = false
        streamScheduledBuffers = 0
        streamQueuedFrames = 0
        streamCarryByte = nil
        streamCollectedPcm = nil
        if let resolve = streamStartResolve {
            streamStartResolve = nil
            resolve(["ok": false, "reason": "superseded"])
        }
    }

    /// The output changed under the engine (route or format): it stopped.
    /// Restart it so the rest of the stream plays on the new output.
    @objc
    private func handleStreamEngineConfigurationChange(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.streamActive, let engine = self.streamEngine, let node = self.streamNode,
                  (notification.object as? AVAudioEngine) === engine
            else { return }
            do {
                if !engine.isRunning { try engine.start() }
                if self.streamStarted { node.play() }
                NSLog("[NativeTTSModule] stream engine restarted after a configuration change")
            } catch {
                self.failStream(message: "engine_restart_failed")
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
            let wasPlaying = self.audioPlayer?.isPlaying == true || self.isStreamPlaying
            let stoppedPayload = self.playbackPayload()
            if let player = self.audioPlayer, player.isPlaying {
                player.stop()
                self.noteClipStopped()
            }
            self.audioPlayer = nil
            self.tearDownStream()
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
        guard currentStopsOnEarphoneDisconnect, audioPlayer != nil || isStreamPlaying else { return }
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
        tearDownStream()
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
