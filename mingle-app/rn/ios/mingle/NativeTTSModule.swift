import AVFoundation
import Foundation
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
                let player = try AVAudioPlayer(data: audioData)
                player.delegate = self
                if deviceAudioActive {
                    // The broadcast extension transcribes the right channel
                    // only; the translation stays out of it, in the left ear.
                    player.pan = MingleDeviceAudioState.translationPan
                }
                player.prepareToPlay()
                if !player.play() {
                    throw NSError(
                        domain: "NativeTTSModule",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "AVAudioPlayer failed to start playback"]
                    )
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
