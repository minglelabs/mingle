// Unit tests for ios/mingle/MingleBackgroundAudioPolicy.swift. The policy is
// Foundation only, so it runs as a macOS command-line binary. From mingle-app/rn:
//
//   xcrun swiftc -swift-version 5 -parse-as-library -o "$TMPDIR/mingle-background-audio-policy-tests" \
//     ios/mingle/MingleBackgroundAudioPolicy.swift \
//     ios/NativeLogicTests/MingleBackgroundAudioPolicyTests.swift \
//     && "$TMPDIR/mingle-background-audio-policy-tests"
import AVFoundation
import Foundation

@main
enum MingleBackgroundAudioPolicyTests {
    private static var checks = 0
    private static var failures = 0

    private static func expect(
        _ condition: @autoclosure () -> Bool,
        _ message: String,
        line: UInt = #line
    ) {
        checks += 1
        if !condition() {
            failures += 1
            print("FAIL line \(line): \(message)")
        }
    }

    static func main() {
        testKeepAliveKillSwitch()
        testKeepAliveRunsOnlyInBackgroundWithoutStt()
        testKeepAliveSessionPlan()
        testSilentWav()
        testSttSilenceKeepalive()
        testCaptureRestartFailureAction()
        if failures == 0 {
            print("PASS \(checks) checks")
            exit(0)
        }
        print("FAILED \(failures) of \(checks) checks")
        exit(1)
    }

    private static func testKeepAliveKillSwitch() {
        for value in ["", "1", "true", "YES", " on ", "anything"] {
            expect(MingleBackgroundAudioPolicy.isKeepAliveEnabled(configValue: value), "'\(value)' keeps it on")
        }
        for value in ["0", "false", "NO", " Off "] {
            expect(!MingleBackgroundAudioPolicy.isKeepAliveEnabled(configValue: value), "'\(value)' turns it off")
        }
    }

    private static func testKeepAliveRunsOnlyInBackgroundWithoutStt() {
        expect(
            MingleBackgroundAudioPolicy.shouldRunKeepAlive(isEnabled: true, isInBackground: true, sttOwners: 0),
            "runs in the background while STT is not recording"
        )
        expect(
            !MingleBackgroundAudioPolicy.shouldRunKeepAlive(isEnabled: true, isInBackground: true, sttOwners: 1),
            "never runs while STT holds the session"
        )
        expect(
            !MingleBackgroundAudioPolicy.shouldRunKeepAlive(isEnabled: true, isInBackground: false, sttOwners: 0),
            "never runs in the foreground"
        )
        expect(
            !MingleBackgroundAudioPolicy.shouldRunKeepAlive(isEnabled: false, isInBackground: true, sttOwners: 0),
            "the kill switch wins"
        )
    }

    private static func testKeepAliveSessionPlan() {
        typealias Plan = MingleBackgroundAudioPolicy.KeepAliveSessionPlan
        func plan(playback: Bool, mix: Bool, tts: Int = 0, pip: Int = 0) -> Plan {
            MingleBackgroundAudioPolicy.keepAliveSessionPlan(
                isPlaybackCategory: playback,
                mixesWithOthers: mix,
                ttsOwners: tts,
                pipOwners: pip
            )
        }
        expect(plan(playback: false, mix: true, tts: 1) == .keepOwnersSession, "TTS keeps its play-and-record session")
        expect(plan(playback: true, mix: true, pip: 1) == .keepOwnersSession, "PiP keeps its session")
        expect(plan(playback: false, mix: false, tts: 1, pip: 1) == .keepOwnersSession, "owners always win")
        expect(plan(playback: true, mix: true) == .keepMixablePlayback, "a mixable playback session is reused")
        expect(plan(playback: true, mix: false) == .switchToMixablePlayback, "non-mixable playback would stop other apps")
        expect(
            plan(playback: false, mix: true) == .switchToMixablePlayback,
            "a leftover play-and-record session is switched (no mic, no Bluetooth hands-free route)"
        )
        expect(plan(playback: false, mix: false) == .switchToMixablePlayback, "the launch default category is switched")
    }

    private static func testSilentWav() {
        let wav = MingleBackgroundAudioPolicy.silentWav(sampleRate: 8_000, durationMs: 1_000)
        let bytes = [UInt8](wav)
        func ascii(_ offset: Int) -> String {
            String(decoding: bytes[offset ..< offset + 4], as: UTF8.self)
        }
        func uint32(_ offset: Int) -> UInt32 {
            bytes[offset ..< offset + 4].enumerated().reduce(0) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) }
        }
        func uint16(_ offset: Int) -> UInt16 {
            UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
        }

        expect(bytes.count == 44 + 16_000, "one second of 8 kHz 16-bit mono plus the header, got \(bytes.count)")
        expect(ascii(0) == "RIFF" && ascii(8) == "WAVE" && ascii(12) == "fmt " && ascii(36) == "data", "RIFF/WAVE layout")
        expect(uint32(4) == UInt32(36 + 16_000), "RIFF size")
        expect(uint32(16) == 16 && uint16(20) == 1, "PCM fmt chunk")
        expect(uint16(22) == 1, "mono")
        expect(uint32(24) == 8_000 && uint32(28) == 16_000, "sample and byte rate")
        expect(uint16(32) == 2 && uint16(34) == 16, "block align and bit depth")
        expect(uint32(40) == 16_000, "data size")
        expect(bytes[44...].allSatisfy { $0 == 0 }, "digital silence")
        expect(
            MingleBackgroundAudioPolicy.silentWav(sampleRate: 8_000, durationMs: 20).count == 44 + 320,
            "20 ms is 160 frames"
        )

        // The same CoreAudio file parser AVAudioPlayer uses on iOS must accept it.
        do {
            let player = try AVAudioPlayer(data: wav, fileTypeHint: AVFileType.wav.rawValue)
            expect(abs(player.duration - 1.0) < 0.01, "AVAudioPlayer reads a 1 s clip, got \(player.duration)")
            expect(player.numberOfChannels == 1, "AVAudioPlayer reads mono")
        } catch {
            expect(false, "AVAudioPlayer rejected the clip: \(error)")
        }
    }

    private static func testSttSilenceKeepalive() {
        expect(
            !MingleBackgroundAudioPolicy.shouldSendSttSilenceKeepalive(secondsSinceLastAudioChunk: 0.05),
            "no keepalive while microphone audio flows"
        )
        expect(
            !MingleBackgroundAudioPolicy.shouldSendSttSilenceKeepalive(secondsSinceLastAudioChunk: 4.9),
            "no keepalive before 5 s"
        )
        expect(
            MingleBackgroundAudioPolicy.shouldSendSttSilenceKeepalive(secondsSinceLastAudioChunk: 5),
            "keepalive after 5 s without audio"
        )
        // The ping runs every 15 s, so the server sees audio at most ~20 s apart,
        // inside its 30 s audio_input_timeout.
        expect(
            15 + MingleBackgroundAudioPolicy.sttSilenceKeepaliveAfterSeconds < 30,
            "worst-case gap stays under the server timeout"
        )

        let chunk48k = Data(base64Encoded: MingleBackgroundAudioPolicy.silentPcm16Base64(sampleRate: 48_000, durationMs: 20))
        expect(chunk48k?.count == 1_920, "20 ms at 48 kHz is 960 PCM16 frames")
        expect(chunk48k?.allSatisfy { $0 == 0 } == true, "the chunk is silence")
        let chunk16k = Data(base64Encoded: MingleBackgroundAudioPolicy.silentPcm16Base64(sampleRate: 16_000, durationMs: 20))
        expect(chunk16k?.count == 640, "20 ms at 16 kHz is 320 PCM16 frames")
        let degenerate = Data(base64Encoded: MingleBackgroundAudioPolicy.silentPcm16Base64(sampleRate: 0, durationMs: 0))
        expect((degenerate?.count ?? 0) > 0, "never an empty chunk (the server ignores those)")
    }

    private static func testCaptureRestartFailureAction() {
        typealias Action = MingleBackgroundAudioPolicy.CaptureRestartFailureAction
        func action(suspended: Bool, active: Bool) -> Action {
            MingleBackgroundAudioPolicy.captureRestartFailureAction(isCaptureSuspended: suspended, isAppActive: active)
        }
        expect(action(suspended: false, active: false) == .deferAndRetry, "background failures never end live STT")
        expect(action(suspended: true, active: true) == .deferAndRetry, "a pending interruption is retried in the foreground too")
        expect(action(suspended: true, active: false) == .deferAndRetry, "a pending interruption is retried in the background")
        expect(action(suspended: false, active: true) == .reportError, "a foreground failure is still reported")
    }
}
