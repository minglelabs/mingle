import ImageIO
import Intents
import UIKit
import UniformTypeIdentifiers

/// Share extension: receives one image, a link, or text from another app.
///
/// It appears in the share sheet twice: as the HashChat icon in the app row,
/// and as conversation suggestions in the top row (the conversations the app
/// donated with `NativeShareTargetModule`). A tapped suggestion arrives here
/// as an `INSendMessageIntent` carrying the conversation id.
///
/// The extension stores what was shared in the App Group container and opens
/// the app, which shows it in that conversation's composer for the user to send.
final class ShareViewController: UIViewController {
    /// Longest side of the stored image. The room's upload limit is 10 MB.
    private static let maxImagePixelSize = 2_048
    private static let imageJPEGQuality = 0.85

    private var didStart = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)
        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = .white
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        spinner.startAnimating()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didStart else { return }
        didStart = true

        let conversationId = (extensionContext?.intent as? INSendMessageIntent)?
            .conversationIdentifier?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        collectSharedContent { [weak self] text, imageJPEG in
            guard let self else { return }
            let stored = MingleShareInbox.write(
                conversationId: conversationId,
                text: text,
                imageJPEG: imageJPEG
            )
            guard stored else {
                self.extensionContext?.cancelRequest(withError: NSError(
                    domain: "MingleShare",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Nothing to share"]
                ))
                return
            }
            self.openHostApp()
            // Give the app switch a moment to start before the sheet closes.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    // MARK: - Reading the shared items

    private func collectSharedContent(completion: @escaping (_ text: String?, _ imageJPEG: Data?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }

        let group = DispatchGroup()
        let lock = NSLock()
        var imageJPEG: Data?
        var textParts: [String] = []

        func appendText(_ value: String?) {
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !trimmed.isEmpty else { return }
            lock.lock()
            if !textParts.contains(trimmed) { textParts.append(trimmed) }
            lock.unlock()
        }

        if let imageProvider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
        }) {
            group.enter()
            imageProvider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
                let data = Self.makeJPEG(from: item)
                lock.lock()
                imageJPEG = data
                lock.unlock()
                group.leave()
            }
        }

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) { continue }
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let url = item as? URL, !url.isFileURL {
                        appendText(url.absoluteString)
                    }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    appendText(item as? String)
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            // A shared web page carries its title here; a shared photo carries
            // nothing useful, so it is read only when there is no image.
            if imageJPEG == nil && textParts.isEmpty {
                for item in items {
                    appendText(item.attributedContentText?.string)
                }
            }
            completion(textParts.isEmpty ? nil : textParts.joined(separator: "\n"), imageJPEG)
        }
    }

    /// Decodes at reduced size straight from the source, so a large photo does
    /// not exceed the extension's memory limit.
    private static func makeJPEG(from item: NSSecureCoding?) -> Data? {
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxImagePixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ]

        var source: CGImageSource?
        if let url = item as? URL {
            source = CGImageSourceCreateWithURL(url as CFURL, nil)
        } else if let data = item as? Data {
            source = CGImageSourceCreateWithData(data as CFData, nil)
        } else if let image = item as? UIImage {
            // Already decoded (e.g. a screenshot shared from its preview).
            guard let data = image.jpegData(compressionQuality: 1) else { return nil }
            source = CGImageSourceCreateWithData(data as CFData, nil)
        }

        guard
            let source,
            let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary)
        else { return nil }
        return UIImage(cgImage: cgImage).jpegData(compressionQuality: imageJPEGQuality)
    }

    // MARK: - Opening the app

    /// An extension has no `UIApplication.shared`, so the open call goes to the
    /// application object found on the responder chain.
    private func openHostApp() {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if current is UIApplication, current.responds(to: selector) {
                typealias OpenURL = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
                let implementation = current.method(for: selector)
                let open = unsafeBitCast(implementation, to: OpenURL.self)
                open(current, selector, MingleShareInbox.openURL as NSURL, NSDictionary(), nil)
                return
            }
            responder = current.next
        }
        // Not opened: the entry stays in the inbox and the app picks it up the
        // next time it comes to the foreground.
    }
}
