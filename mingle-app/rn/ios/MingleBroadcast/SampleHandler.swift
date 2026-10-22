import CoreMedia
import ReplayKit

/// Broadcast Upload Extension for device-audio translation.
///
/// ReplayKit hands this process the sound other apps play. Only that audio is
/// used (video frames and the microphone are ignored): it is converted to
/// 16 kHz mono PCM and written to the socket the app listens on.
final class SampleHandler: RPBroadcastSampleHandler {
    private static let errorDomain = "com.minglelabs.mingle.broadcast"
    /// About two seconds of audio may wait for a busy app before new audio is dropped.
    private static let maxPendingBytes = 64 * 1024
    /// The app not reading for this long means its session is gone.
    private static let deliveryStallLimit: TimeInterval = 15
    private static let connectAttempts = 15
    /// How often the channel is checked while no audio is being written.
    private static let probeInterval: TimeInterval = 1
    private static let connectRetryDelayMicros: useconds_t = 200_000

    /// Every callback touches the socket and converter through this queue.
    private let queue = DispatchQueue(label: "com.minglelabs.mingle.broadcast.audio")
    private var socketFD: Int32 = -1
    private var pending = Data()
    private var lastDeliveredAt = Date()
    private var finished = false
    /// Read from ReplayKit's thread so audio that arrives while the channel is
    /// still connecting is skipped instead of waiting on `queue`.
    private let streamingLock = NSLock()
    private var streaming = false
    private var lastProbeAt = Date.distantPast
    private let audioConverter = BroadcastAudioConverter()

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        queue.async { [weak self] in
            guard let self else { return }
            if !self.connectToApp() {
                self.finish(
                    code: 1,
                    message: "Open Mingle, choose the sound playing on this device, and press Start first."
                )
            }
        }
    }

    override func broadcastFinished() {
        queue.sync {
            finished = true
            closeSocket()
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard isStreaming() else { return }
        guard sampleBufferType == .audioApp else {
            // Nothing is written while no app plays sound, so a closed
            // channel would go unnoticed and the broadcast would linger.
            // Screen frames keep arriving; they pace a check instead.
            if isProbeDue() {
                queue.sync { probeChannel() }
            }
            return
        }
        queue.sync {
            guard !finished, socketFD >= 0 else { return }
            guard let pcm = audioConverter.convert(sampleBuffer) else { return }
            send(pcm)
        }
    }

    // MARK: - Channel to the app

    private func isStreaming() -> Bool {
        streamingLock.lock()
        defer { streamingLock.unlock() }
        return streaming
    }

    private func setStreaming(_ value: Bool) {
        streamingLock.lock()
        streaming = value
        streamingLock.unlock()
    }

    private func isProbeDue() -> Bool {
        streamingLock.lock()
        defer { streamingLock.unlock() }
        let now = Date()
        guard now.timeIntervalSince(lastProbeAt) >= Self.probeInterval else { return false }
        lastProbeAt = now
        return true
    }

    /// The app never writes to the channel, so a read that reports end of
    /// stream means it closed it: the session is over.
    private func probeChannel() {
        guard !finished, socketFD >= 0 else { return }
        var byte: UInt8 = 0
        let received = recv(socketFD, &byte, 1, MSG_PEEK | MSG_DONTWAIT)
        if received == 0 {
            finish(code: 2, message: "Translation ended in Mingle.")
        } else if received < 0, errno != EAGAIN, errno != EWOULDBLOCK, errno != EINTR {
            finish(code: 2, message: "Translation ended in Mingle.")
        }
    }

    private func connectToApp() -> Bool {
        guard let path = MingleBroadcastChannel.socketPath() else { return false }

        for _ in 0 ..< Self.connectAttempts {
            if finished { return true }
            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { return false }
            // A closed app must surface as a write error, not kill this process.
            var noSigPipe: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, socklen_t(MemoryLayout<Int32>.size))

            let connected = MingleBroadcastChannel.withSocketAddress(path: path) { address, length in
                Darwin.connect(fd, address, length)
            }
            if connected == 0 {
                let flags = fcntl(fd, F_GETFL, 0)
                _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
                socketFD = fd
                pending = Data(MingleBroadcastChannel.streamHeader)
                lastDeliveredAt = Date()
                flush()
                setStreaming(socketFD >= 0)
                return socketFD >= 0
            }
            Darwin.close(fd)
            usleep(Self.connectRetryDelayMicros)
        }
        return false
    }

    private func send(_ pcm: Data) {
        if pending.count > Self.maxPendingBytes {
            // The app is not keeping up. Dropping whole new chunks (never part
            // of what is already queued) keeps the 16-bit samples aligned.
            if Date().timeIntervalSince(lastDeliveredAt) > Self.deliveryStallLimit {
                finish(code: 2, message: "Mingle stopped translating.")
            }
            return
        }
        pending.append(pcm)
        flush()
    }

    private func flush() {
        while !pending.isEmpty, socketFD >= 0 {
            let written = pending.withUnsafeBytes { buffer in
                Darwin.write(socketFD, buffer.baseAddress, buffer.count)
            }
            if written > 0 {
                pending.removeFirst(written)
                lastDeliveredAt = Date()
                continue
            }
            if written < 0, errno == EINTR { continue }
            if written < 0, errno == EAGAIN || errno == EWOULDBLOCK { return }
            // The app closed the channel: its session ended, so end the broadcast.
            finish(code: 2, message: "Translation ended in Mingle.")
            return
        }
    }

    private func closeSocket() {
        setStreaming(false)
        if socketFD >= 0 {
            Darwin.close(socketFD)
            socketFD = -1
        }
        pending.removeAll(keepingCapacity: false)
    }

    private func finish(code: Int, message: String) {
        guard !finished else { return }
        finished = true
        closeSocket()
        finishBroadcastWithError(NSError(
            domain: Self.errorDomain,
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        ))
    }
}
