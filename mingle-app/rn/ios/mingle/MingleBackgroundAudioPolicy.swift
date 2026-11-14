import Foundation

/// Pure decisions behind the background keep-alive and the live STT transport.
/// Foundation only, so the logic is unit-tested outside the app:
/// `ios/NativeLogicTests/MingleBackgroundAudioPolicyTests.swift` documents the command.
enum MingleBackgroundAudioPolicy {
    // MARK: - Background keep-alive

    /// Info.plist kill switch. Missing or empty means ON; only an explicit
    /// "0", "false", "no" or "off" turns the keep-alive off.
    static let keepAliveInfoPlistKey = "MingleBackgroundAudioKeepAlive"

    /// Length of the silent clip the keep-alive player loops.
    static let keepAliveClipSampleRate = 8_000
    static let keepAliveClipDurationMs = 1_000

    static func isKeepAliveEnabled(configValue: String) -> Bool {
        switch configValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "0", "false", "no", "off":
            return false
        default:
            return true
        }
    }

    /// The keep-alive plays only while the app is in the background and live
    /// STT does not hold the session: a running capture already keeps the app
    /// alive, and the keep-alive must never touch a recording session.
    static func shouldRunKeepAlive(isEnabled: Bool, isInBackground: Bool, sttOwners: Int) -> Bool {
        isEnabled && isInBackground && sttOwners == 0
    }

    enum KeepAliveSessionPlan: String, Equatable {
        /// TTS or PiP configured the session: keep its category and mode, only activate it.
        case keepOwnersSession
        /// The session is already a mixable playback session: only activate it.
        case keepMixablePlayback
        /// Switch to `.playback` + `.mixWithOthers`: no microphone, no Bluetooth
        /// hands-free route, and other apps' audio is neither stopped nor ducked.
        case switchToMixablePlayback
    }

    static func keepAliveSessionPlan(
        isPlaybackCategory: Bool,
        mixesWithOthers: Bool,
        ttsOwners: Int,
        pipOwners: Int
    ) -> KeepAliveSessionPlan {
        if ttsOwners > 0 || pipOwners > 0 {
            return .keepOwnersSession
        }
        if isPlaybackCategory && mixesWithOthers {
            return .keepMixablePlayback
        }
        return .switchToMixablePlayback
    }

    /// A mono 16-bit PCM WAV file of digital silence.
    static func silentWav(sampleRate: Int, durationMs: Int) -> Data {
        let rate = max(1, sampleRate)
        let frameCount = max(1, rate * max(1, durationMs) / 1_000)
        let bytesPerFrame = 2
        let dataSize = frameCount * bytesPerFrame

        var data = Data(capacity: 44 + dataSize)
        func appendASCII(_ text: String) {
            data.append(contentsOf: Array(text.utf8))
        }
        func appendUInt32(_ value: UInt32) {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        func appendUInt16(_ value: UInt16) {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }

        appendASCII("RIFF")
        appendUInt32(UInt32(36 + dataSize))
        appendASCII("WAVE")
        appendASCII("fmt ")
        appendUInt32(16)
        appendUInt16(1) // PCM
        appendUInt16(1) // mono
        appendUInt32(UInt32(rate))
        appendUInt32(UInt32(rate * bytesPerFrame))
        appendUInt16(UInt16(bytesPerFrame))
        appendUInt16(16)
        appendASCII("data")
        appendUInt32(UInt32(dataSize))
        data.append(Data(count: dataSize))
        return data
    }

    // MARK: - Live STT microphone

    /// Which microphone live STT records from.
    enum SttMicrophonePlan: String, Equatable {
        /// Whatever the route gives: the phone's microphone on the speaker or
        /// receiver, an external USB microphone, a car's.
        case routeDefault
        /// The phone's own microphone while the sound plays through earphones.
        case phoneMicrophone
    }

    /// An earphone microphone is built to pick up its wearer only: it sits at
    /// the wearer's ear and filters out other voices, so the person being
    /// translated (who talks toward the phone) comes in faint or not at all.
    /// Bluetooth earphones also drop to the 16 kHz hands-free profile to
    /// record. So with earphones in, the phone records and the earphones only
    /// play, unless the user picked the earphone microphone (the web asks
    /// once). `outputRouteKind` is `MingleAudioRouteClassifier.kind(of:)`.
    static func sttMicrophonePlan(
        outputRouteKind: String,
        prefersEarphoneMicrophone: Bool
    ) -> SttMicrophonePlan {
        guard !prefersEarphoneMicrophone else { return .routeDefault }
        switch outputRouteKind {
        case "bluetooth", "wired":
            return .phoneMicrophone
        default:
            return .routeDefault
        }
    }

    // MARK: - Live STT transport

    /// mingle-stt closes a stream after 30 s without client audio
    /// (`audio_input_timeout`). While iOS holds the microphone (call, Siri) or
    /// a capture restart is pending, the 15 s WebSocket ping also sends a short
    /// silent chunk once no audio went out for this long.
    static let sttSilenceKeepaliveAfterSeconds: TimeInterval = 5
    static let sttSilenceKeepaliveChunkMs = 20

    static func shouldSendSttSilenceKeepalive(secondsSinceLastAudioChunk: TimeInterval) -> Bool {
        secondsSinceLastAudioChunk >= sttSilenceKeepaliveAfterSeconds
    }

    /// Base64 of mono 16-bit PCM silence, the payload of an `audio_chunk` message.
    static func silentPcm16Base64(sampleRate: Int, durationMs: Int) -> String {
        let frameCount = max(1, max(1, sampleRate) * max(1, durationMs) / 1_000)
        return Data(count: frameCount * 2).base64EncodedString()
    }

    enum CaptureRestartFailureAction: String, Equatable {
        /// Try again in a moment, silently. A route change can leave the new
        /// input unready for a few hundred milliseconds.
        case retrySoon
        /// Keep the STT session, report it as silenced and retry from the health check.
        case deferAndRetry
        /// Surface the failure to the WebView as before.
        case reportError
    }

    /// A failed capture restart (a new microphone, an AEC switch, an
    /// interruption) never ends live STT for the user: it is retried quickly
    /// first, then kept as silenced and retried from the health check while
    /// the room still shows the microphone on. Only a foreground failure that
    /// keeps failing for about a minute (no pending interruption) is reported.
    static let captureRestartQuickRetries = 3
    static let captureRestartQuickRetryDelaySeconds: TimeInterval = 0.3
    static let captureRestartFailuresBeforeReport = 15

    static func captureRestartFailureAction(
        isCaptureSuspended: Bool,
        isAppActive: Bool,
        quickRetriesLeft: Int = 0,
        consecutiveFailures: Int = captureRestartFailuresBeforeReport
    ) -> CaptureRestartFailureAction {
        if quickRetriesLeft > 0 {
            return .retrySoon
        }
        if isCaptureSuspended || !isAppActive {
            return .deferAndRetry
        }
        if consecutiveFailures < captureRestartFailuresBeforeReport {
            return .deferAndRetry
        }
        return .reportError
    }

    /// A route change restarts capture only when the microphone that records
    /// changed (or the engine stopped). Earphones going in or out while the
    /// phone's microphone records change the output only: live STT carries on
    /// untouched instead of blinking off and on.
    static func shouldRestartCaptureOnRouteChange(
        previousInputs: [String],
        currentInputs: [String],
        engineRunning: Bool
    ) -> Bool {
        guard engineRunning else { return true }
        guard !currentInputs.isEmpty else { return true }
        return previousInputs != currentInputs
    }
}
