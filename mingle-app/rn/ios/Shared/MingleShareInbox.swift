import Foundation

/// Hand-off folder between the share extension and the app, inside the App
/// Group container. The extension writes one entry per share (a manifest plus
/// an optional JPEG); the app reads the newest entry and empties the folder.
///
/// The extension cannot send by itself: the session lives in the app's WebView
/// cookies, which another process cannot read. So it only stores what was
/// shared and opens the app, which sends from the conversation room.
enum MingleShareInbox {
    static let appGroupIdentifier = "group.com.minglelabs.mingle.rn"
    /// The app is opened with this URL after an entry is written.
    static let openURL = URL(string: "mingle://share-inbox")!
    /// An entry older than this is dropped, not delivered: the user has moved on.
    static let entryLifetime: TimeInterval = 10 * 60

    private static let folderName = "ShareInbox"
    private static let manifestFileName = "manifest.json"
    private static let imageFileName = "image.jpg"

    struct Entry {
        let id: String
        /// The conversation the user picked in the share sheet, if they picked one.
        let conversationId: String?
        let text: String?
        let imageData: Data?
    }

    private static func folderURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(folderName, isDirectory: true)
    }

    /// Stores one share. Returns false when there is nothing to store or the
    /// container is unavailable.
    @discardableResult
    static func write(conversationId: String?, text: String?, imageJPEG: Data?) -> Bool {
        let trimmedText = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmedText.isEmpty || imageJPEG != nil, let folder = folderURL() else { return false }

        // One pending share at a time: a newer share replaces an older one.
        clear()

        let id = UUID().uuidString.lowercased()
        let entryFolder = folder.appendingPathComponent(id, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: entryFolder, withIntermediateDirectories: true)
            var manifest: [String: Any] = [
                "id": id,
                "createdAt": Date().timeIntervalSince1970,
            ]
            if let conversationId, !conversationId.isEmpty {
                manifest["conversationId"] = conversationId
            }
            if !trimmedText.isEmpty {
                manifest["text"] = trimmedText
            }
            if let imageJPEG {
                try imageJPEG.write(to: entryFolder.appendingPathComponent(imageFileName), options: .atomic)
                manifest["hasImage"] = true
            }
            let data = try JSONSerialization.data(withJSONObject: manifest)
            try data.write(to: entryFolder.appendingPathComponent(manifestFileName), options: .atomic)
            return true
        } catch {
            try? FileManager.default.removeItem(at: entryFolder)
            return false
        }
    }

    /// Returns the newest entry that has not expired and empties the folder.
    static func takeLatest() -> Entry? {
        guard let folder = folderURL() else { return nil }
        defer { clear() }

        let entryFolders = (try? FileManager.default.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: nil
        )) ?? []

        var newest: (createdAt: TimeInterval, entry: Entry)?
        for entryFolder in entryFolders {
            guard
                let data = try? Data(contentsOf: entryFolder.appendingPathComponent(manifestFileName)),
                let manifest = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                let id = manifest["id"] as? String,
                let createdAt = manifest["createdAt"] as? TimeInterval
            else { continue }

            if Date().timeIntervalSince1970 - createdAt > entryLifetime { continue }
            if let current = newest, current.createdAt >= createdAt { continue }

            let imageData = manifest["hasImage"] as? Bool == true
                ? try? Data(contentsOf: entryFolder.appendingPathComponent(imageFileName))
                : nil
            let text = manifest["text"] as? String
            if imageData == nil && (text ?? "").isEmpty { continue }

            newest = (createdAt, Entry(
                id: id,
                conversationId: manifest["conversationId"] as? String,
                text: text,
                imageData: imageData
            ))
        }
        return newest?.entry
    }

    static func clear() {
        guard let folder = folderURL() else { return }
        try? FileManager.default.removeItem(at: folder)
    }
}
