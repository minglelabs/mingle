import Foundation
import Intents
import React

/// Share-sheet integration for the app side.
///
/// - Donates a conversation to iOS so it shows up in the share sheet's top row
///   (the conversation suggestions). iOS ranks donated conversations by how
///   recently and how often they were donated.
/// - Hands the app what the share extension stored (see `MingleShareInbox`).
@objc(NativeShareTargetModule)
class NativeShareTargetModule: NSObject {
    /// Avatars above this size are skipped; iOS then draws initials.
    private static let maxAvatarBytes = 2 * 1024 * 1024
    private static let avatarTimeout: TimeInterval = 8

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(donateConversation:displayName:avatarUrl:resolver:rejecter:)
    func donateConversation(
        _ conversationId: String,
        displayName: String,
        avatarUrl: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let trimmedId = conversationId.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedId.isEmpty, !trimmedName.isEmpty else {
            resolve(false)
            return
        }

        loadAvatar(avatarUrl) { avatarData in
            let intent = INSendMessageIntent(
                recipients: nil,
                outgoingMessageType: .outgoingMessageText,
                content: nil,
                speakableGroupName: INSpeakableString(spokenPhrase: trimmedName),
                conversationIdentifier: trimmedId,
                serviceName: nil,
                sender: nil,
                attachments: nil
            )
            if let avatarData {
                intent.setImage(INImage(imageData: avatarData), forParameterNamed: \.speakableGroupName)
            }

            let interaction = INInteraction(intent: intent, response: nil)
            interaction.direction = .outgoing
            // Lets one conversation's donations be deleted without the others.
            interaction.groupIdentifier = trimmedId
            interaction.donate { error in
                resolve(error == nil)
            }
        }
    }

    /// The user left or deleted the conversation: stop suggesting it.
    @objc(removeConversation:resolver:rejecter:)
    func removeConversation(
        _ conversationId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let trimmedId = conversationId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedId.isEmpty else {
            resolve(false)
            return
        }
        INInteraction.delete(with: trimmedId) { error in
            resolve(error == nil)
        }
    }

    /// Sign-out: another account must not see this account's conversations.
    @objc(removeAllConversations:rejecter:)
    func removeAllConversations(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        MingleShareInbox.clear()
        INInteraction.deleteAll { error in
            resolve(error == nil)
        }
    }

    /// Returns what the share extension stored last, or null. The entry is
    /// removed, so it is delivered once.
    @objc(consumePendingShare:rejecter:)
    func consumePendingShare(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let entry = MingleShareInbox.takeLatest() else {
                resolve(NSNull())
                return
            }
            var payload: [String: Any] = ["id": entry.id]
            if let conversationId = entry.conversationId {
                payload["conversationId"] = conversationId
            }
            if let text = entry.text {
                payload["text"] = text
            }
            if let imageData = entry.imageData {
                payload["imageBase64"] = imageData.base64EncodedString()
                payload["imageMimeType"] = "image/jpeg"
            }
            resolve(payload)
        }
    }

    private func loadAvatar(_ rawUrl: String?, completion: @escaping (Data?) -> Void) {
        guard
            let rawUrl,
            let url = URL(string: rawUrl.trimmingCharacters(in: .whitespacesAndNewlines)),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http"
        else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = Self.avatarTimeout
        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard
                let data,
                !data.isEmpty,
                data.count <= Self.maxAvatarBytes,
                (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false,
                response?.mimeType?.hasPrefix("image/") ?? false
            else {
                completion(nil)
                return
            }
            completion(data)
        }.resume()
    }
}
