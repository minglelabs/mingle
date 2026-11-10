import Foundation

/// What the app and its broadcast extension agree on. Compiled into both.
///
/// Device-audio capture: the extension receives the sound other apps play
/// (ReplayKit), turns it into 16-bit mono PCM and writes it to a Unix socket in
/// the shared App Group container, where the app is listening.
enum MingleBroadcastChannel {
    /// The extension's bundle id is the app's plus this suffix.
    static let extensionBundleSuffix = ".broadcast"
    /// PCM the extension sends: 16-bit little-endian mono at this rate.
    static let sampleRate = 16_000
    /// First bytes of every connection, so a stray writer is never taken for
    /// audio. After it the stream is a sequence of frames:
    /// `[UInt32 LE pcm byte count][Float64 LE host time of the first sample][pcm]`.
    /// The host time (CACurrentMediaTime base, shared by both processes) lets
    /// the app line its own translation up with the capture to remove it.
    static let streamHeader: [UInt8] = Array("MGLPCMT1".utf8)
    /// Bytes before each frame's PCM.
    static let frameHeaderSize = MemoryLayout<UInt32>.size + MemoryLayout<Float64>.size
    /// A frame larger than this is not from the extension.
    static let maxFramePcmBytes = 256 * 1024

    static func encodeFrame(pcm: Data, hostTime: Double) -> Data {
        var frame = Data(capacity: frameHeaderSize + pcm.count)
        withUnsafeBytes(of: UInt32(pcm.count).littleEndian) { frame.append(contentsOf: $0) }
        withUnsafeBytes(of: hostTime.bitPattern.littleEndian) { frame.append(contentsOf: $0) }
        frame.append(pcm)
        return frame
    }
    /// Kept short: the whole path must fit in `sockaddr_un.sun_path` (104 bytes).
    private static let socketFileName = "mgl_bcast.sock"

    /// The containing app's bundle id, from either process.
    static var appBundleIdentifier: String? {
        guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else { return nil }
        if bundleId.hasSuffix(extensionBundleSuffix) {
            return String(bundleId.dropLast(extensionBundleSuffix.count))
        }
        return bundleId
    }

    static var appGroupIdentifier: String? {
        appBundleIdentifier.map { "group.\($0)" }
    }

    static var extensionBundleIdentifier: String? {
        appBundleIdentifier.map { $0 + extensionBundleSuffix }
    }

    /// nil when this build has no access to the App Group container.
    static func socketPath() -> String? {
        guard let group = appGroupIdentifier,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
        else {
            return nil
        }
        return container.appendingPathComponent(socketFileName).path
    }

    /// Calls `body` with a `sockaddr_un` for `path`; nil when the path does not fit.
    static func withSocketAddress<T>(
        path: String,
        _ body: (UnsafePointer<sockaddr>, socklen_t) -> T
    ) -> T? {
        var address = sockaddr_un()
        let pathBytes = Array(path.utf8)
        // One byte is left for the terminating NUL.
        guard pathBytes.count < MemoryLayout.size(ofValue: address.sun_path) else { return nil }
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        withUnsafeMutableBytes(of: &address.sun_path) { buffer in
            buffer.copyBytes(from: pathBytes)
        }
        let length = socklen_t(MemoryLayout<sockaddr_un>.size)
        return withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { body($0, length) }
        }
    }
}
