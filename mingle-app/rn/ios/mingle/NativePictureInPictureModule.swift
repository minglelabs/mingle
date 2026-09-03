import AVFoundation
import AVKit
import CoreMedia
import CoreVideo
import Foundation
import QuartzCore
import React
import UIKit

@objc(NativePictureInPictureModule)
final class NativePictureInPictureModule: NSObject, AVPictureInPictureSampleBufferPlaybackDelegate, AVPictureInPictureControllerDelegate {
    private static let renderSize = CGSize(width: 960, height: 540)
    private static let frameDuration = CMTime(value: 1, timescale: 30)

    private let displayLayer = AVSampleBufferDisplayLayer()
    private var pictureInPictureController: AVPictureInPictureController?
    private var activeConversationId: String?
    private var latestState: PictureInPictureState?

    @objc
    static func requiresMainQueueSetup() -> Bool {
        true
    }

    @objc(start:resolver:rejecter:)
    func start(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let state = PictureInPictureState(dictionary: options) else {
            reject(
                "native_pip_invalid_state",
                "Picture in Picture needs a conversation and at least a valid preview state.",
                nil
            )
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                reject("native_pip_unavailable", "Picture in Picture is unavailable.", nil)
                return
            }

            do {
                let result = try self.startPictureInPicture(with: state)
                resolve(result)
            } catch {
                reject(
                    "native_pip_start_failed",
                    error.localizedDescription,
                    error
                )
            }
        }
    }

    @objc(update:)
    func update(_ options: NSDictionary) {
        guard let state = PictureInPictureState(dictionary: options) else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.activeConversationId == state.conversationId else { return }
            self.latestState = state
            self.render(state: state)
        }
    }

    @objc(stop:resolver:rejecter:)
    func stop(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        let requestedConversationId = (options["conversationId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                resolve(["ok": true])
                return
            }

            if let requestedConversationId,
               !requestedConversationId.isEmpty,
               requestedConversationId != self.activeConversationId {
                resolve(["ok": true, "ignored": true])
                return
            }

            if let controller = self.pictureInPictureController,
               controller.isPictureInPictureActive {
                controller.stopPictureInPicture()
            } else {
                self.clearPictureInPictureState()
            }
            resolve(["ok": true])
        }
    }

    private func startPictureInPicture(with state: PictureInPictureState) throws -> [String: Any] {
        if let controller = pictureInPictureController,
           controller.isPictureInPictureActive {
            guard activeConversationId == state.conversationId else {
                throw PictureInPictureError.anotherConversationIsActive
            }
            latestState = state
            render(state: state)
            return ["ok": true, "active": true]
        }

        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            throw PictureInPictureError.notSupported
        }

        pictureInPictureController = nil
        activeConversationId = state.conversationId
        latestState = state
        displayLayer.videoGravity = .resizeAspect
        render(state: state)

        let contentSource = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: contentSource)
        controller.delegate = self
        controller.requiresLinearPlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = false
        pictureInPictureController = controller

        guard controller.isPictureInPicturePossible else {
            clearPictureInPictureState()
            throw PictureInPictureError.notPossible
        }

        controller.startPictureInPicture()
        return ["ok": true, "active": false]
    }

    private func clearPictureInPictureState() {
        pictureInPictureController = nil
        activeConversationId = nil
        latestState = nil

        if #available(iOS 17.0, *) {
            displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
        } else {
            displayLayer.flushAndRemoveImage()
        }
    }

    private func render(state: PictureInPictureState) {
        guard let sampleBuffer = makeSampleBuffer(from: makePreviewImage(state: state)) else {
            NSLog("[NativePictureInPictureModule] failed to make a sample buffer")
            return
        }

        if #available(iOS 17.0, *) {
            let renderer = displayLayer.sampleBufferRenderer
            if renderer.status == .failed {
                renderer.flush(removingDisplayedImage: false, completionHandler: nil)
            }
            renderer.enqueue(sampleBuffer)
        } else {
            if displayLayer.status == .failed {
                displayLayer.flush()
            }
            displayLayer.enqueue(sampleBuffer)
        }
    }

    private func makePreviewImage(state: PictureInPictureState) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(size: Self.renderSize, format: format)
        return renderer.image { context in
            let bounds = CGRect(origin: .zero, size: Self.renderSize)
            let backgroundColor = UIColor(red: 0.965, green: 0.965, blue: 0.975, alpha: 1)
            backgroundColor.setFill()
            context.fill(bounds)

            let headerRect = CGRect(x: 28, y: 22, width: bounds.width - 56, height: 54)
            drawText(
                "Mingle",
                in: CGRect(x: headerRect.minX, y: headerRect.minY, width: 170, height: 24),
                font: .systemFont(ofSize: 22, weight: .bold),
                color: UIColor(red: 0.08, green: 0.08, blue: 0.1, alpha: 1)
            )
            drawText(
                state.title.isEmpty ? "Conversation" : state.title,
                in: CGRect(x: headerRect.minX, y: headerRect.minY + 28, width: 500, height: 20),
                font: .systemFont(ofSize: 13, weight: .medium),
                color: UIColor(red: 0.38, green: 0.38, blue: 0.42, alpha: 1)
            )

            let statusLabel = state.statusLabel.isEmpty ? "Live" : state.statusLabel
            let statusWidth = min(150, max(72, statusLabel.size(withAttributes: [
                .font: UIFont.systemFont(ofSize: 12, weight: .semibold),
            ]).width + 28))
            let statusRect = CGRect(
                x: bounds.width - 28 - statusWidth,
                y: headerRect.minY + 4,
                width: statusWidth,
                height: 28
            )
            UIColor(red: 0.9, green: 0.96, blue: 0.92, alpha: 1).setFill()
            UIBezierPath(roundedRect: statusRect, cornerRadius: 14).fill()
            drawText(
                statusLabel,
                in: statusRect.insetBy(dx: 12, dy: 5),
                font: .systemFont(ofSize: 12, weight: .semibold),
                color: UIColor(red: 0.1, green: 0.46, blue: 0.25, alpha: 1),
                alignment: .center
            )

            if state.messages.isEmpty {
                drawText(
                    state.emptyLabel.isEmpty ? "No messages yet." : state.emptyLabel,
                    in: CGRect(x: 50, y: 250, width: bounds.width - 100, height: 40),
                    font: .systemFont(ofSize: 17, weight: .medium),
                    color: UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1),
                    alignment: .center
                )
                return
            }

            let cardX: CGFloat = 28
            let cardWidth = bounds.width - 56
            let cardHeight: CGFloat = 94
            let cardGap: CGFloat = 8
            let firstCardY: CGFloat = 96

            for (index, message) in state.messages.enumerated() {
                let cardY = firstCardY + CGFloat(index) * (cardHeight + cardGap)
                let cardRect = CGRect(x: cardX, y: cardY, width: cardWidth, height: cardHeight)
                UIColor.white.setFill()
                UIBezierPath(roundedRect: cardRect, cornerRadius: 18).fill()

                if message.isInterim {
                    UIColor(red: 1, green: 0.72, blue: 0.2, alpha: 1).setStroke()
                    let border = UIBezierPath(roundedRect: cardRect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 17.25)
                    border.lineWidth = 1.5
                    border.stroke()
                }

                let speaker = message.speaker.isEmpty ? "" : message.speaker
                if !speaker.isEmpty {
                    drawText(
                        speaker,
                        in: CGRect(x: cardRect.minX + 18, y: cardRect.minY + 12, width: cardRect.width - 36, height: 18),
                        font: .systemFont(ofSize: 12, weight: .semibold),
                        color: UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1)
                    )
                }

                let textY = speaker.isEmpty ? cardRect.minY + 18 : cardRect.minY + 33
                drawText(
                    message.text,
                    in: CGRect(x: cardRect.minX + 18, y: textY, width: cardRect.width - 36, height: 48),
                    font: .systemFont(ofSize: 15, weight: .medium),
                    color: UIColor(red: 0.12, green: 0.12, blue: 0.15, alpha: 1)
                )
            }
        }
    }

    private func drawText(
        _ text: String,
        in rect: CGRect,
        font: UIFont,
        color: UIColor,
        alignment: NSTextAlignment = .left
    ) {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = alignment
        paragraphStyle.lineBreakMode = .byTruncatingTail
        (text as NSString).draw(
            in: rect,
            withAttributes: [
                .font: font,
                .foregroundColor: color,
                .paragraphStyle: paragraphStyle,
            ]
        )
    }

    private func makeSampleBuffer(from image: UIImage) -> CMSampleBuffer? {
        guard let cgImage = image.cgImage else { return nil }

        let width = Int(Self.renderSize.width)
        let height = Int(Self.renderSize.height)
        let attributes: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ]

        var pixelBuffer: CVPixelBuffer?
        guard CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            attributes as CFDictionary,
            &pixelBuffer
        ) == kCVReturnSuccess,
        let pixelBuffer else {
            return nil
        }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer),
              let context = CGContext(
                  data: baseAddress,
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                      | CGBitmapInfo.byteOrder32Little.rawValue
              ) else {
            return nil
        }

        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .high
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        var formatDescription: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        ) == noErr,
        let formatDescription else {
            return nil
        }

        var timing = CMSampleTimingInfo(
            duration: Self.frameDuration,
            presentationTimeStamp: CMTime(
                seconds: CACurrentMediaTime(),
                preferredTimescale: 600
            ),
            decodeTimeStamp: .invalid
        )
        var sampleBuffer: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        ) == noErr else {
            return nil
        }

        return sampleBuffer
    }

    // MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        setPlaying playing: Bool
    ) {
        // The preview is a live snapshot stream. PiP play/pause controls do not
        // change the WebView's STT session, so the current frame remains visible.
    }

    func pictureInPictureControllerTimeRangeForPlayback(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> CMTimeRange {
        CMTimeRange(start: .zero, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> Bool {
        false
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        didTransitionToRenderSize newRenderSize: CMVideoDimensions
    ) {
        // The renderer uses one compact 16:9 layout for every PiP size.
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        skipByInterval skipInterval: CMTime,
        completion: @escaping () -> Void
    ) {
        completion()
    }

    // MARK: - AVPictureInPictureControllerDelegate

    func pictureInPictureControllerDidStopPictureInPicture(
        _ pictureInPictureController: AVPictureInPictureController
    ) {
        clearPictureInPictureState()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }
}

private struct PictureInPictureMessage {
    let id: String
    let speaker: String
    let text: String
    let isInterim: Bool

    init?(dictionary: NSDictionary) {
        let id = (dictionary["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let text = (dictionary["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !id.isEmpty, !text.isEmpty else { return nil }

        self.id = id
        self.speaker = (dictionary["speaker"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.text = text
        self.isInterim = dictionary["isInterim"] as? Bool ?? false
    }
}

private struct PictureInPictureState {
    let conversationId: String
    let title: String
    let statusLabel: String
    let emptyLabel: String
    let messages: [PictureInPictureMessage]

    init?(dictionary: NSDictionary) {
        let conversationId = (dictionary["conversationId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !conversationId.isEmpty else { return nil }

        let rawMessages = dictionary["messages"] as? [Any] ?? []
        let messages = rawMessages.compactMap { rawMessage -> PictureInPictureMessage? in
            guard let dictionary = rawMessage as? NSDictionary else { return nil }
            return PictureInPictureMessage(dictionary: dictionary)
        }

        self.conversationId = conversationId
        self.title = (dictionary["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.statusLabel = (dictionary["statusLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.emptyLabel = (dictionary["emptyLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.messages = Array(messages.suffix(4))
    }
}

private enum PictureInPictureError: LocalizedError {
    case notSupported
    case notPossible
    case anotherConversationIsActive

    var errorDescription: String? {
        switch self {
        case .notSupported:
            return "Picture in Picture is not supported on this device."
        case .notPossible:
            return "Picture in Picture is not available in the current app state."
        case .anotherConversationIsActive:
            return "Another conversation is already shown in Picture in Picture."
        }
    }
}
