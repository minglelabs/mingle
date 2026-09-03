import AVFoundation
import AVKit
import CoreMedia
import CoreVideo
import Foundation
import QuartzCore
import React
import UIKit

private final class PictureInPictureSampleBufferView: UIView {
    override class var layerClass: AnyClass {
        AVSampleBufferDisplayLayer.self
    }

    var sampleBufferDisplayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }
}

@objc(NativePictureInPictureModule)
final class NativePictureInPictureModule: NSObject, AVPictureInPictureSampleBufferPlaybackDelegate, AVPictureInPictureControllerDelegate {
    private static let renderSize = CGSize(width: 960, height: 540)
    private static let frameDuration = CMTime(value: 1, timescale: 30)
    private static let maximumStartAttempts = 80
    private static let startRetryDelay: TimeInterval = 0.05
    private static let requiredStablePossibleChecks = 3
    private static let startDelegateTimeout: TimeInterval = 5
    private static let frameRefreshInterval = DispatchTimeInterval.milliseconds(300)
    private static let previewContentInset: CGFloat = 24
    private static let previewBubbleHorizontalPadding: CGFloat = 16
    private static let previewBubbleVerticalPadding: CGFloat = 7
    private static let previewBubbleGap: CGFloat = 8
    private static let previewMaximumMessageCount = 4
    private static let previewMaximumSingleMessageLines = 4
    private static let previewMinimumFontSize: CGFloat = 22

    private struct PreviewMessageLayout {
        let message: PictureInPictureMessage
        let messageFont: UIFont
        let speakerFont: UIFont?
        let speakerHeight: CGFloat
        let speakerGap: CGFloat
        let textHeight: CGFloat
        let bubbleHeight: CGFloat
    }

    private let displayLayerHostView = PictureInPictureSampleBufferView(frame: .zero)
    private var displayLayer: AVSampleBufferDisplayLayer {
        displayLayerHostView.sampleBufferDisplayLayer
    }
    private var pictureInPictureController: AVPictureInPictureController?
    private var activeConversationId: String?
    private var latestState: PictureInPictureState?
    private var pendingStartResolve: RCTPromiseResolveBlock?
    private var pendingStartReject: RCTPromiseRejectBlock?
    private var startRetryWorkItem: DispatchWorkItem?
    private var startTimeoutWorkItem: DispatchWorkItem?
    private var frameRefreshTimer: DispatchSourceTimer?
    private var hasPictureInPictureAudioSession = false

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

            self.startPictureInPicture(with: state, resolve: resolve, reject: reject)
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

            self.cancelPendingStart()
            if let controller = self.pictureInPictureController,
               controller.isPictureInPictureActive {
                controller.stopPictureInPicture()
            } else {
                self.clearPictureInPictureState()
            }
            resolve(["ok": true])
        }
    }

    private func startPictureInPicture(
        with state: PictureInPictureState,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if let controller = pictureInPictureController,
           controller.isPictureInPictureActive {
            guard activeConversationId == state.conversationId else {
                reject(
                    "native_pip_start_failed",
                    PictureInPictureError.anotherConversationIsActive.localizedDescription,
                    PictureInPictureError.anotherConversationIsActive
                )
                return
            }
            latestState = state
            render(state: state)
            resolve(["ok": true, "active": true])
            return
        }

        if pendingStartResolve != nil {
            guard activeConversationId == state.conversationId else {
                reject(
                    "native_pip_start_failed",
                    PictureInPictureError.anotherConversationIsActive.localizedDescription,
                    PictureInPictureError.anotherConversationIsActive
                )
                return
            }

            // A start request is already waiting for iOS. Keep the newest frame
            // and resolve this duplicate tap without replacing the real request.
            latestState = state
            render(state: state)
            resolve(["ok": true, "pending": true])
            return
        }

        if pictureInPictureController != nil {
            clearPictureInPictureState()
        }

        let isSupported = AVPictureInPictureController.isPictureInPictureSupported()
        let audioSession = AVAudioSession.sharedInstance()
        let audioOwners = MingleAudioSessionCoordinator.shared.snapshot()
        NSLog(
            "[NativePictureInPictureModule] start request supported=%d appState=%ld audioCategory=%@ audioMode=%@ audioOtherPlaying=%d owners stt=%d tts=%d",
            isSupported ? 1 : 0,
            UIApplication.shared.applicationState.rawValue,
            audioSession.category.rawValue,
            audioSession.mode.rawValue,
            audioSession.isOtherAudioPlaying ? 1 : 0,
            audioOwners.stt,
            audioOwners.tts
        )

        guard isSupported else {
            reject(
                "native_pip_start_failed",
                PictureInPictureError.notSupported.localizedDescription,
                PictureInPictureError.notSupported
            )
            return
        }

        do {
            try acquirePictureInPictureAudioSession()
        } catch {
            NSLog(
                "[NativePictureInPictureModule] failed to prepare audio session: %@",
                error.localizedDescription
            )
            reject(
                "native_pip_start_failed",
                PictureInPictureError.audioSessionFailed(error.localizedDescription).localizedDescription,
                error
            )
            clearPictureInPictureState()
            return
        }

        activeConversationId = state.conversationId
        latestState = state
        attachDisplayLayerToActiveWindow()
        displayLayer.videoGravity = .resizeAspect
        displayLayer.bounds = CGRect(origin: .zero, size: Self.renderSize)
        displayLayer.preventsDisplaySleepDuringVideoPlayback = true
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

        pendingStartResolve = resolve
        pendingStartReject = reject
        startFrameRefreshTimer()
        schedulePictureInPictureStart(for: controller, attempt: 0)
    }

    private func schedulePictureInPictureStart(
        for controller: AVPictureInPictureController,
        attempt: Int,
        stablePossibleChecks: Int = 0
    ) {
        guard pictureInPictureController === controller,
              pendingStartResolve != nil else {
            return
        }

        let isPossible = controller.isPictureInPicturePossible
        let nextStablePossibleChecks = isPossible ? stablePossibleChecks + 1 : 0
        if attempt == 0 || attempt % 10 == 0 {
            let readiness = displayLayerReadiness
            let audioSession = AVAudioSession.sharedInstance()
            NSLog(
                "[NativePictureInPictureModule] waiting for PiP attempt=%d possible=%d stableChecks=%d appState=%ld ready=%d layerStatus=%ld rendererStatus=%ld audioCategory=%@ audioMode=%@",
                attempt,
                isPossible ? 1 : 0,
                nextStablePossibleChecks,
                UIApplication.shared.applicationState.rawValue,
                readiness.ready,
                readiness.layerStatus,
                readiness.rendererStatus,
                audioSession.category.rawValue,
                audioSession.mode.rawValue
            )
        }

        if isPossible && nextStablePossibleChecks >= Self.requiredStablePossibleChecks {
            startRetryWorkItem = nil
            let readiness = displayLayerReadiness
            NSLog(
                "[NativePictureInPictureModule] starting PiP possible=1 stableChecks=%d ready=%d layerStatus=%ld rendererStatus=%ld",
                nextStablePossibleChecks,
                readiness.ready,
                readiness.layerStatus,
                readiness.rendererStatus
            )
            controller.startPictureInPicture()
            schedulePictureInPictureStartTimeout(for: controller)
            return
        }

        guard attempt < Self.maximumStartAttempts else {
            let readiness = displayLayerReadiness
            NSLog(
                "[NativePictureInPictureModule] PiP remained unavailable possible=0 ready=%d layerStatus=%ld rendererStatus=%ld rendererError=%@",
                readiness.ready,
                readiness.layerStatus,
                readiness.rendererStatus,
                readiness.error
            )
            rejectPendingStart(with: PictureInPictureError.notPossible)
            clearPictureInPictureState()
            return
        }

        let workItem = DispatchWorkItem { [weak self, weak controller] in
            guard let self, let controller else { return }
            self.startRetryWorkItem = nil
            self.schedulePictureInPictureStart(
                for: controller,
                attempt: attempt + 1,
                stablePossibleChecks: nextStablePossibleChecks
            )
        }
        startRetryWorkItem?.cancel()
        startRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.startRetryDelay,
            execute: workItem
        )
    }

    private func schedulePictureInPictureStartTimeout(for controller: AVPictureInPictureController) {
        startTimeoutWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self, weak controller] in
            guard let self,
                  let controller,
                  self.pictureInPictureController === controller,
                  !controller.isPictureInPictureActive,
                  self.pendingStartResolve != nil else {
                return
            }

            NSLog("[NativePictureInPictureModule] PiP start delegate timed out")
            self.rejectPendingStart(with: PictureInPictureError.notPossible)
            self.clearPictureInPictureState()
        }
        startTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.startDelegateTimeout,
            execute: workItem
        )
    }

    private func cancelStartScheduling() {
        startRetryWorkItem?.cancel()
        startRetryWorkItem = nil
        startTimeoutWorkItem?.cancel()
        startTimeoutWorkItem = nil
    }

    private func startFrameRefreshTimer() {
        frameRefreshTimer?.cancel()

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(
            deadline: .now() + Self.frameRefreshInterval,
            repeating: Self.frameRefreshInterval,
            leeway: .milliseconds(50)
        )
        timer.setEventHandler { [weak self] in
            guard let self,
                  self.pictureInPictureController != nil,
                  let state = self.latestState else {
                return
            }
            self.render(state: state)
        }
        frameRefreshTimer = timer
        timer.resume()
    }

    private func stopFrameRefreshTimer() {
        frameRefreshTimer?.cancel()
        frameRefreshTimer = nil
    }

    private func cancelPendingStart() {
        cancelStartScheduling()
        guard let resolve = pendingStartResolve else {
            pendingStartReject = nil
            return
        }

        pendingStartResolve = nil
        pendingStartReject = nil
        resolve(["ok": true, "cancelled": true])
    }

    private func resolvePendingStart(with result: [String: Any]) {
        cancelStartScheduling()
        let resolve = pendingStartResolve
        pendingStartResolve = nil
        pendingStartReject = nil
        resolve?(result)
    }

    private func rejectPendingStart(with error: PictureInPictureError) {
        cancelStartScheduling()
        let reject = pendingStartReject
        pendingStartResolve = nil
        pendingStartReject = nil
        reject?("native_pip_start_failed", error.localizedDescription, error)
    }

    private func clearPictureInPictureState() {
        cancelStartScheduling()
        stopFrameRefreshTimer()
        pictureInPictureController = nil
        activeConversationId = nil
        latestState = nil
        displayLayer.preventsDisplaySleepDuringVideoPlayback = false
        detachDisplayLayerFromActiveWindow()
        releasePictureInPictureAudioSessionIfNeeded()

        if #available(iOS 17.0, *) {
            displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
        } else {
            displayLayer.flushAndRemoveImage()
        }
    }

    private func attachDisplayLayerToActiveWindow() {
        guard let rootView = activeRootView() else {
            NSLog("[NativePictureInPictureModule] could not attach display layer: no active root view")
            return
        }

        if displayLayerHostView.superview !== rootView {
            displayLayerHostView.removeFromSuperview()
            rootView.insertSubview(displayLayerHostView, at: 0)
        }

        // AVKit expects the sample-buffer layer to belong to an active view
        // hierarchy. Keep this host offscreen so it does not cover the WebView;
        // PiP receives the same layer as its content source.
        displayLayerHostView.isHidden = false
        displayLayerHostView.alpha = 0.01
        displayLayerHostView.isUserInteractionEnabled = false
        displayLayerHostView.frame = CGRect(
            x: -Self.renderSize.width,
            y: -Self.renderSize.height,
            width: Self.renderSize.width,
            height: Self.renderSize.height
        )

        NSLog(
            "[NativePictureInPictureModule] attached display layer host root=%@ hostFrame=%@ layerFrame=%@",
            String(describing: type(of: rootView)),
            String(describing: displayLayerHostView.frame),
            String(describing: displayLayer.frame)
        )
    }

    private func detachDisplayLayerFromActiveWindow() {
        displayLayerHostView.removeFromSuperview()
    }

    private func activeRootView() -> UIView? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .sorted { lhs, rhs in
                lhs.activationState.rawValue > rhs.activationState.rawValue
            }

        for scene in scenes {
            if let keyWindow = scene.windows.first(where: { $0.isKeyWindow }),
               let rootView = keyWindow.rootViewController?.viewIfLoaded {
                return rootView
            }
            if let firstWindow = scene.windows.first(where: { !$0.isHidden }),
               let rootView = firstWindow.rootViewController?.viewIfLoaded {
                return rootView
            }
        }

        return nil
    }

    private func acquirePictureInPictureAudioSession() throws {
        guard !hasPictureInPictureAudioSession else { return }

        let coordinator = MingleAudioSessionCoordinator.shared
        coordinator.acquirePiP()

        do {
            let session = AVAudioSession.sharedInstance()
            let owners = coordinator.snapshot()

            // Do not replace the play-and-record session while STT/TTS owns it.
            // A standalone visual PiP still needs an active playback session so
            // AVKit can keep the sample-buffer source alive across app changes.
            if owners.stt == 0 && owners.tts == 0 {
                try session.setCategory(
                    .playback,
                    mode: .moviePlayback,
                    options: [.mixWithOthers]
                )
            }
            try session.setActive(true, options: [])
            hasPictureInPictureAudioSession = true

            NSLog(
                "[NativePictureInPictureModule] PiP audio session active category=%@ mode=%@ owners stt=%d tts=%d",
                session.category.rawValue,
                session.mode.rawValue,
                owners.stt,
                owners.tts
            )
        } catch {
            coordinator.releasePiP()
            coordinator.scheduleDeactivateAudioSessionIfIdle(trigger: "pip_prepare_failed")
            throw error
        }
    }

    private func releasePictureInPictureAudioSessionIfNeeded() {
        guard hasPictureInPictureAudioSession else { return }

        hasPictureInPictureAudioSession = false
        let coordinator = MingleAudioSessionCoordinator.shared
        coordinator.releasePiP()
        coordinator.scheduleDeactivateAudioSessionIfIdle(trigger: "pip_release")
        NSLog("[NativePictureInPictureModule] PiP audio session released")
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

    private var displayLayerReadiness: (
        ready: Int,
        layerStatus: Int,
        rendererStatus: Int,
        error: String
    ) {
        if #available(iOS 17.0, *) {
            let renderer = displayLayer.sampleBufferRenderer
            let ready: Int
            if #available(iOS 17.4, *) {
                ready = displayLayer.isReadyForDisplay ? 1 : 0
            } else {
                ready = renderer.status == .rendering ? 1 : 0
            }
            return (
                ready: ready,
                layerStatus: displayLayer.status.rawValue,
                rendererStatus: renderer.status.rawValue,
                error: renderer.error?.localizedDescription ?? "none"
            )
        }

        return (
            ready: displayLayer.status == .rendering ? 1 : 0,
            layerStatus: displayLayer.status.rawValue,
            rendererStatus: displayLayer.status.rawValue,
            error: displayLayer.error?.localizedDescription ?? "none"
        )
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

            let contentRect = bounds.insetBy(dx: Self.previewContentInset, dy: Self.previewContentInset)
            let textWidth = contentRect.width - Self.previewBubbleHorizontalPadding * 2
            let maxMessageCount = state.displayMode == .expanded ? 2 : Self.previewMaximumMessageCount
            let maxLinesPerMessage = state.displayMode == .expanded ? 2 : 1
            let messages = selectPreviewMessages(
                state.messages,
                textWidth: textWidth,
                maxMessageCount: maxMessageCount,
                maxLinesPerMessage: maxLinesPerMessage
            )

            if messages.isEmpty {
                drawText(
                    state.emptyLabel.isEmpty ? "No messages yet." : state.emptyLabel,
                    in: contentRect.insetBy(dx: 24, dy: 0),
                    font: .systemFont(ofSize: 22, weight: .medium),
                    color: UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1),
                    alignment: .center
                )
                return
            }

            let messageFontSize = resolvePreviewMessageFontSize(
                messages,
                textWidth: textWidth,
                availableHeight: contentRect.height,
                maxLinesPerMessage: maxLinesPerMessage
            )
            let layouts = makePreviewMessageLayouts(
                messages,
                fontSize: messageFontSize,
                textWidth: textWidth,
                maxLinesPerMessage: maxLinesPerMessage
            )
            let totalHeight = layouts.reduce(CGFloat.zero) { $0 + $1.bubbleHeight }
                + CGFloat(max(0, layouts.count - 1)) * Self.previewBubbleGap
            var cardY = max(contentRect.minY, contentRect.maxY - totalHeight)

            for layout in layouts {
                let cardRect = CGRect(
                    x: contentRect.minX,
                    y: cardY,
                    width: contentRect.width,
                    height: layout.bubbleHeight
                )
                UIColor.white.setFill()
                UIBezierPath(roundedRect: cardRect, cornerRadius: 14).fill()

                if layout.message.isInterim {
                    UIColor(red: 1, green: 0.72, blue: 0.2, alpha: 1).setStroke()
                    let border = UIBezierPath(roundedRect: cardRect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 13.25)
                    border.lineWidth = 1.5
                    border.stroke()
                }

                var textY = cardRect.minY + Self.previewBubbleVerticalPadding
                if let speakerFont = layout.speakerFont {
                    drawText(
                        layout.message.speaker,
                        in: CGRect(
                            x: cardRect.minX + Self.previewBubbleHorizontalPadding,
                            y: textY,
                            width: textWidth,
                            height: layout.speakerHeight
                        ),
                        font: speakerFont,
                        color: UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1)
                    )
                    textY += layout.speakerHeight + layout.speakerGap
                }

                drawText(
                    layout.message.text,
                    in: CGRect(
                        x: cardRect.minX + Self.previewBubbleHorizontalPadding,
                        y: textY,
                        width: textWidth,
                        height: layout.textHeight
                    ),
                    font: layout.messageFont,
                    color: UIColor(red: 0.12, green: 0.12, blue: 0.15, alpha: 1)
                )

                cardY += layout.bubbleHeight + Self.previewBubbleGap
            }
        }
    }

    private func selectPreviewMessages(
        _ messages: [PictureInPictureMessage],
        textWidth: CGFloat,
        maxMessageCount: Int,
        maxLinesPerMessage: Int
    ) -> [PictureInPictureMessage] {
        let recentMessages = Array(messages.suffix(maxMessageCount))
        guard let latestMessage = recentMessages.last else { return [] }

        let classificationFont = UIFont.systemFont(
            ofSize: maxLinesPerMessage > 1 ? 28 : 32,
            weight: .semibold
        )
        var selectedMessages = [latestMessage]

        // Keep the newest message visible at a readable size. If it needs more
        // lines than the current display mode allows, do not squeeze older
        // messages into the same preview.
        guard previewLineCount(latestMessage.text, font: classificationFont, width: textWidth)
            <= maxLinesPerMessage else {
            return selectedMessages
        }

        for message in recentMessages.dropLast().reversed() {
            guard selectedMessages.count < maxMessageCount,
                  previewLineCount(message.text, font: classificationFont, width: textWidth)
                    <= maxLinesPerMessage else {
                break
            }
            selectedMessages.insert(message, at: 0)
        }

        return selectedMessages
    }

    private func resolvePreviewMessageFontSize(
        _ messages: [PictureInPictureMessage],
        textWidth: CGFloat,
        availableHeight: CGFloat,
        maxLinesPerMessage: Int
    ) -> CGFloat {
        let maximumFontSize: CGFloat
        switch messages.count {
        case 1:
            maximumFontSize = 52
        case 2:
            maximumFontSize = 44
        case 3:
            maximumFontSize = 38
        default:
            maximumFontSize = 34
        }

        var fontSize = maximumFontSize

        while fontSize >= Self.previewMinimumFontSize {
            let messageFont = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
            if messages.count > 1,
               messages.contains(where: {
                   previewLineCount($0.text, font: messageFont, width: textWidth) > maxLinesPerMessage
               }) {
                fontSize -= 1
                continue
            }

            let layouts = makePreviewMessageLayouts(
                messages,
                fontSize: fontSize,
                textWidth: textWidth,
                maxLinesPerMessage: maxLinesPerMessage
            )
            let totalHeight = layouts.reduce(CGFloat.zero) { $0 + $1.bubbleHeight }
                + CGFloat(max(0, layouts.count - 1)) * Self.previewBubbleGap
            if totalHeight <= availableHeight {
                return fontSize
            }
            fontSize -= 1
        }

        return Self.previewMinimumFontSize
    }

    private func makePreviewMessageLayouts(
        _ messages: [PictureInPictureMessage],
        fontSize: CGFloat,
        textWidth: CGFloat,
        maxLinesPerMessage: Int
    ) -> [PreviewMessageLayout] {
        let messageFont = UIFont.systemFont(ofSize: fontSize, weight: .semibold)

        return messages.map { message in
            let speakerFont = message.speaker.isEmpty
                ? nil
                : UIFont.systemFont(ofSize: max(11, min(14, fontSize * 0.42)), weight: .semibold)
            let speakerHeight = speakerFont?.lineHeight ?? 0
            let speakerGap: CGFloat = speakerFont == nil ? 0 : 3
            let maxTextLines = messages.count == 1
                ? Self.previewMaximumSingleMessageLines
                : maxLinesPerMessage
            let textHeight = measuredTextHeight(
                message.text,
                font: messageFont,
                width: textWidth,
                maximumLines: maxTextLines
            )
            let verticalPadding = Self.previewBubbleVerticalPadding * 2
            let speakerContentHeight = speakerHeight + speakerGap
            let bubbleContentHeight = verticalPadding + speakerContentHeight + textHeight
            let bubbleHeight = ceil(bubbleContentHeight)

            return PreviewMessageLayout(
                message: message,
                messageFont: messageFont,
                speakerFont: speakerFont,
                speakerHeight: speakerHeight,
                speakerGap: speakerGap,
                textHeight: textHeight,
                bubbleHeight: bubbleHeight
            )
        }
    }

    private func previewLineCount(_ text: String, font: UIFont, width: CGFloat) -> Int {
        let measuredHeight = measuredTextHeight(text, font: font, width: width)
        return max(1, Int(ceil(measuredHeight / font.lineHeight)))
    }

    private func measuredTextHeight(
        _ text: String,
        font: UIFont,
        width: CGFloat,
        maximumLines: Int? = nil
    ) -> CGFloat {
        let rect = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font],
            context: nil
        )
        let measuredHeight = max(font.lineHeight, ceil(rect.height))
        guard let maximumLines else { return measuredHeight }

        return min(measuredHeight, ceil(font.lineHeight * CGFloat(maximumLines)))
    }

    private func drawText(
        _ text: String,
        in rect: CGRect,
        font: UIFont,
        color: UIColor,
        alignment: NSTextAlignment = .left,
        lineBreakMode: NSLineBreakMode = .byTruncatingTail
    ) {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = alignment
        paragraphStyle.lineBreakMode = lineBreakMode
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

        // UIGraphicsImageRenderer already returns an upright CGImage. Flipping
        // its context here would make the PiP preview appear upside down.
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

        guard let sampleBuffer else { return nil }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(
            sampleBuffer,
            createIfNecessary: true
        ),
           CFArrayGetCount(attachments) > 0 {
            let attachment = unsafeBitCast(
                CFArrayGetValueAtIndex(attachments, 0),
                to: CFMutableDictionary.self
            )
            CFDictionarySetValue(
                attachment,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
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

    func pictureInPictureControllerWillStartPictureInPicture(
        _ pictureInPictureController: AVPictureInPictureController
    ) {
        NSLog("[NativePictureInPictureModule] PiP will start")
    }

    func pictureInPictureControllerDidStartPictureInPicture(
        _ pictureInPictureController: AVPictureInPictureController
    ) {
        NSLog("[NativePictureInPictureModule] PiP did start")
        resolvePendingStart(with: ["ok": true, "active": true])
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        NSLog(
            "[NativePictureInPictureModule] PiP failed to start: %@",
            error.localizedDescription
        )
        rejectPendingStart(
            with: PictureInPictureError.nativeStartFailed(error.localizedDescription)
        )
        clearPictureInPictureState()
    }

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
    let displayMode: PictureInPictureDisplayMode
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
        let rawDisplayMode = (dictionary["displayMode"] as? String)?.lowercased()
        self.displayMode = PictureInPictureDisplayMode(rawValue: rawDisplayMode ?? "") ?? .collapsed
        self.title = (dictionary["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.statusLabel = (dictionary["statusLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.emptyLabel = (dictionary["emptyLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.messages = Array(messages.suffix(4))
    }
}

private enum PictureInPictureDisplayMode: String {
    case expanded
    case collapsed
}

private enum PictureInPictureError: LocalizedError {
    case notSupported
    case notPossible
    case anotherConversationIsActive
    case audioSessionFailed(String)
    case nativeStartFailed(String)

    var errorDescription: String? {
        switch self {
        case .notSupported:
            return "Picture in Picture is not supported on this device."
        case .notPossible:
            return "Picture in Picture is not available in the current app state."
        case .anotherConversationIsActive:
            return "Another conversation is already shown in Picture in Picture."
        case .audioSessionFailed(let message):
            return "Picture in Picture could not prepare audio: \(message)"
        case .nativeStartFailed(let message):
            return "Picture in Picture could not start: \(message)"
        }
    }
}
