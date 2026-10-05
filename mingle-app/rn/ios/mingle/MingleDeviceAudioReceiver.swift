import Foundation

/// Whether this build can translate device audio: the App Group container is
/// reachable and the broadcast extension is embedded in the app.
enum MingleDeviceAudioSupport {
    static var isSupported: Bool {
        guard MingleBroadcastChannel.socketPath() != nil,
              let extensionId = MingleBroadcastChannel.extensionBundleIdentifier,
              let plugInsURL = Bundle.main.builtInPlugInsURL,
              let plugIns = try? FileManager.default.contentsOfDirectory(
                  at: plugInsURL,
                  includingPropertiesForKeys: nil
              )
        else {
            return false
        }
        return plugIns.contains { Bundle(url: $0)?.bundleIdentifier == extensionId }
    }
}

/// Shared between the STT and TTS modules: while a device-audio session runs,
/// the translation must be played where the capture will not pick it up.
final class MingleDeviceAudioState {
    static let shared = MingleDeviceAudioState()

    /// The extension transcribes the RIGHT channel, so the app's own speech
    /// goes hard left.
    static let translationPan: Float = -1

    private let lock = NSLock()
    private var active = false

    private init() {}

    var isActive: Bool {
        get {
            lock.lock()
            defer { lock.unlock() }
            return active
        }
        set {
            lock.lock()
            active = newValue
            lock.unlock()
        }
    }
}

/// App side of the broadcast channel: listens on a Unix socket in the App
/// Group container and hands over the PCM the broadcast extension writes.
/// Callbacks run on a private queue.
final class MingleDeviceAudioReceiver {
    enum ReceiverError: Error {
        case appGroupUnavailable
        case socketPathTooLong
        case socketFailed(Int32)
    }

    /// The extension connected and identified itself: the broadcast is live.
    var onConnected: (() -> Void)?
    /// 16-bit little-endian mono PCM at `MingleBroadcastChannel.sampleRate`.
    var onAudio: ((Data) -> Void)?
    /// The extension went away (the user ended the broadcast, or it crashed).
    var onDisconnected: (() -> Void)?

    private let queue = DispatchQueue(label: "com.minglelabs.mingle.deviceAudioReceiver")
    private var listenSource: DispatchSourceRead?
    private var clientSource: DispatchSourceRead?
    private var clientFD: Int32 = -1
    private var socketPath: String?
    private var headerBytes: [UInt8] = []
    private var headerAccepted = false
    private var readBuffer = [UInt8](repeating: 0, count: 16 * 1024)

    deinit {
        stopLocked()
    }

    func start() throws {
        try queue.sync {
            stopLocked()
            guard let path = MingleBroadcastChannel.socketPath() else {
                throw ReceiverError.appGroupUnavailable
            }
            // A socket file left by an earlier run would make bind fail.
            unlink(path)

            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { throw ReceiverError.socketFailed(errno) }
            guard let bound = MingleBroadcastChannel.withSocketAddress(path: path, { address, length in
                Darwin.bind(fd, address, length)
            }) else {
                Darwin.close(fd)
                throw ReceiverError.socketPathTooLong
            }
            guard bound == 0, listen(fd, 1) == 0 else {
                let code = errno
                Darwin.close(fd)
                throw ReceiverError.socketFailed(code)
            }
            Self.makeNonBlocking(fd)

            let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
            source.setEventHandler { [weak self] in
                self?.acceptClient(listenFD: fd)
            }
            source.setCancelHandler {
                Darwin.close(fd)
            }
            source.resume()
            listenSource = source
            socketPath = path
        }
    }

    /// Closes the channel. The extension sees its writes fail and ends the
    /// broadcast. No callback is made for a stop asked for here.
    func stop() {
        queue.sync {
            stopLocked()
        }
    }

    private func stopLocked() {
        dropClient(notify: false)
        listenSource?.cancel()
        listenSource = nil
        if let socketPath {
            unlink(socketPath)
        }
        socketPath = nil
    }

    private static func makeNonBlocking(_ fd: Int32) {
        let flags = fcntl(fd, F_GETFL, 0)
        _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
    }

    private func acceptClient(listenFD: Int32) {
        let fd = accept(listenFD, nil, nil)
        guard fd >= 0 else { return }
        // One broadcast at a time: a second connection is turned away.
        guard clientFD < 0 else {
            Darwin.close(fd)
            return
        }
        Self.makeNonBlocking(fd)
        clientFD = fd
        headerBytes = []
        headerAccepted = false

        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in
            self?.readClient()
        }
        source.setCancelHandler {
            Darwin.close(fd)
        }
        source.resume()
        clientSource = source
    }

    private func readClient() {
        while clientFD >= 0 {
            let capacity = readBuffer.count
            let count = readBuffer.withUnsafeMutableBytes { buffer in
                Darwin.read(clientFD, buffer.baseAddress, capacity)
            }
            if count > 0 {
                consume(readBuffer[0 ..< count])
                continue
            }
            if count < 0, errno == EINTR { continue }
            if count < 0, errno == EAGAIN || errno == EWOULDBLOCK { return }
            // End of stream or a broken connection: the extension is gone.
            dropClient(notify: true)
            return
        }
    }

    private func consume(_ bytes: ArraySlice<UInt8>) {
        var audio = bytes
        if !headerAccepted {
            let expected = MingleBroadcastChannel.streamHeader
            let missing = expected.count - headerBytes.count
            headerBytes.append(contentsOf: audio.prefix(missing))
            audio = audio.dropFirst(missing)
            guard headerBytes.count == expected.count else { return }
            guard headerBytes == expected else {
                // Not the extension: never treat its bytes as audio.
                dropClient(notify: false)
                return
            }
            headerAccepted = true
            onConnected?()
        }
        if !audio.isEmpty {
            onAudio?(Data(audio))
        }
    }

    private func dropClient(notify: Bool) {
        guard clientFD >= 0 else { return }
        let wasLive = headerAccepted
        clientSource?.cancel()
        clientSource = nil
        clientFD = -1
        headerBytes = []
        headerAccepted = false
        if notify, wasLive {
            onDisconnected?()
        }
    }
}
