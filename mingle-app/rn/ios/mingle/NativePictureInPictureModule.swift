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
    private static let previewContentInset: CGFloat = 22
    private static let previewBubbleHorizontalPadding: CGFloat = 18
    private static let previewBubbleVerticalPadding: CGFloat = 8
    private static let previewBubbleGap: CGFloat = 8
    private static let previewLanguageBadgeWidth: CGFloat = 38
    private static let previewLanguageTextGap: CGFloat = 6
    private static let previewMaximumBubbleWidthRatio: CGFloat = 0.96
    private static let previewMaximumMessageCount = 4
    // Keep the preview readable before trading away older bubbles. A single
    // exceptionally long message may still use the smaller render floor so
    // the latest bubble remains complete.
    private static let previewMinimumReadableFontSize: CGFloat = 30
    private static let previewMinimumFontSize: CGFloat = 22

    private struct PreviewLanguageRow {
        let language: String
        let text: String
        let isOriginal: Bool
        let isInterim: Bool
    }

    private struct PreviewMessageLayout {
        let message: PictureInPictureMessage
        let rows: [PreviewLanguageRow]
        let messageFont: UIFont
        let bubbleWidth: CGFloat
        let textWidth: CGFloat
        let rowHeights: [CGFloat]
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
            let maxMessageCount = state.displayMode == .expanded ? 2 : Self.previewMaximumMessageCount
            let messages = selectPreviewMessages(
                state.messages,
                availableSize: contentRect.size,
                maxMessageCount: maxMessageCount,
                displayMode: state.displayMode
            )

            if messages.isEmpty {
                drawText(
                    state.emptyLabel.isEmpty ? "No messages yet." : state.emptyLabel,
                    in: contentRect.insetBy(dx: 24, dy: 0),
                    font: .systemFont(ofSize: 22, weight: .medium),
                    color: UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1),
                    alignment: .center,
                    lineBreakMode: .byWordWrapping
                )
                return
            }

            let messageFontSize = resolvePreviewMessageFontSize(
                messages,
                availableSize: contentRect.size,
                displayMode: state.displayMode,
                minimumFontSize: Self.previewMinimumFontSize
            )
            let layouts = makePreviewMessageLayouts(
                messages,
                fontSize: messageFontSize,
                availableWidth: contentRect.width,
                displayMode: state.displayMode
            )
            let totalHeight = layouts.reduce(CGFloat.zero) { $0 + $1.bubbleHeight }
                + CGFloat(max(0, layouts.count - 1)) * Self.previewBubbleGap
            var cardY = max(contentRect.minY, contentRect.maxY - totalHeight)

            for layout in layouts {
                let cardX = contentRect.minX
                let cardRect = CGRect(
                    x: cardX,
                    y: cardY,
                    width: layout.bubbleWidth,
                    height: layout.bubbleHeight
                )
                drawBubbleBackground(in: cardRect, isOwn: layout.message.isOwn)

                var rowY = cardRect.minY + Self.previewBubbleVerticalPadding
                for (index, row) in layout.rows.enumerated() {
                    let rowHeight = layout.rowHeights[index]
                    drawLanguageBadge(
                        row.language,
                        isOriginal: row.isOriginal,
                        in: CGRect(
                            x: cardRect.minX + Self.previewBubbleHorizontalPadding,
                            y: rowY,
                            width: Self.previewLanguageBadgeWidth,
                            height: rowHeight
                        ),
                        fontSize: layout.messageFont.pointSize
                    )

                    let textRect = CGRect(
                        x: cardRect.minX
                            + Self.previewBubbleHorizontalPadding
                            + Self.previewLanguageBadgeWidth
                            + Self.previewLanguageTextGap,
                        y: rowY,
                        width: layout.textWidth,
                        height: rowHeight
                    )
                    let textColor: UIColor
                    if row.isOriginal {
                        textColor = UIColor(red: 0.07, green: 0.09, blue: 0.12, alpha: 1)
                    } else if row.isInterim {
                        textColor = UIColor(red: 0.42, green: 0.42, blue: 0.46, alpha: 1)
                    } else {
                        textColor = UIColor(red: 0.22, green: 0.25, blue: 0.30, alpha: 1)
                    }
                    drawText(
                        previewRenderedText(for: row),
                        in: textRect,
                        font: layout.messageFont,
                        color: textColor,
                        lineBreakMode: .byCharWrapping
                    )
                    rowY += rowHeight
                }

                cardY += layout.bubbleHeight + Self.previewBubbleGap
            }
        }
    }

    private func selectPreviewMessages(
        _ messages: [PictureInPictureMessage],
        availableSize: CGSize,
        maxMessageCount: Int,
        displayMode: PictureInPictureDisplayMode
    ) -> [PictureInPictureMessage] {
        let recentMessages = Array(messages.suffix(maxMessageCount))
        guard let latestMessage = recentMessages.last else { return [] }

        // Try the largest recent suffix first. If it would force the text
        // below the readable floor, remove the oldest bubble and try again.
        // This keeps the newest in-progress message visible while old bubbles
        // disappear as soon as the available space is genuinely needed.
        for messageCount in stride(from: recentMessages.count, through: 1, by: -1) {
            let candidateMessages = Array(recentMessages.suffix(messageCount))
            guard previewMessageSetFits(
                candidateMessages,
                availableSize: availableSize,
                displayMode: displayMode
            ) else {
                continue
            }
            return candidateMessages
        }

        // The latest bubble is always retained. The render pass can lower
        // its font below the readable floor when one unusually long message
        // needs the extra room to remain complete.
        return [latestMessage]
    }

    private func previewMessageSetFits(
        _ messages: [PictureInPictureMessage],
        availableSize: CGSize,
        displayMode: PictureInPictureDisplayMode
    ) -> Bool {
        let fontSize = resolvePreviewMessageFontSize(
            messages,
            availableSize: availableSize,
            displayMode: displayMode,
            minimumFontSize: Self.previewMinimumReadableFontSize
        )
        let layouts = makePreviewMessageLayouts(
            messages,
            fontSize: fontSize,
            availableWidth: availableSize.width,
            displayMode: displayMode
        )
        let totalHeight = layouts.reduce(CGFloat.zero) { $0 + $1.bubbleHeight }
            + CGFloat(max(0, layouts.count - 1)) * Self.previewBubbleGap
        return totalHeight <= availableSize.height
    }

    private func resolvePreviewMessageFontSize(
        _ messages: [PictureInPictureMessage],
        availableSize: CGSize,
        displayMode: PictureInPictureDisplayMode,
        minimumFontSize: CGFloat
    ) -> CGFloat {
        let maximumFontSize: CGFloat
        switch messages.count {
        case 1:
            maximumFontSize = 58
        case 2:
            maximumFontSize = 50
        case 3:
            maximumFontSize = 44
        default:
            maximumFontSize = 40
        }

        var fontSize = maximumFontSize
        while fontSize >= minimumFontSize {
            let layouts = makePreviewMessageLayouts(
                messages,
                fontSize: fontSize,
                availableWidth: availableSize.width,
                displayMode: displayMode
            )
            let totalHeight = layouts.reduce(CGFloat.zero) { $0 + $1.bubbleHeight }
                + CGFloat(max(0, layouts.count - 1)) * Self.previewBubbleGap
            if totalHeight <= availableSize.height {
                return fontSize
            }
            fontSize -= 1
        }

        return minimumFontSize
    }

    private func makePreviewMessageLayouts(
        _ messages: [PictureInPictureMessage],
        fontSize: CGFloat,
        availableWidth: CGFloat,
        displayMode: PictureInPictureDisplayMode
    ) -> [PreviewMessageLayout] {
        let messageFont = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
        let maximumBubbleWidth = max(1, availableWidth * Self.previewMaximumBubbleWidthRatio)

        return messages.map { message in
            let rows = makePreviewLanguageRows(for: message, displayMode: displayMode)
            let widestRow = rows.map { row in
                measuredTextWidth(previewRenderedText(for: row), font: messageFont)
            }.max() ?? 0
            let requestedBubbleWidth = widestRow
                + Self.previewBubbleHorizontalPadding * 2
                + Self.previewLanguageBadgeWidth
                + Self.previewLanguageTextGap
            let bubbleWidth = min(
                maximumBubbleWidth,
                max(140, ceil(requestedBubbleWidth))
            )
            let textWidth = max(
                1,
                bubbleWidth
                    - Self.previewBubbleHorizontalPadding * 2
                    - Self.previewLanguageBadgeWidth
                    - Self.previewLanguageTextGap
            )
            let rowHeights = rows.map { row in
                measuredTextHeight(
                    previewRenderedText(for: row),
                    font: messageFont,
                    width: textWidth
                )
            }
            let bubbleHeight = ceil(
                rowHeights.reduce(CGFloat.zero, +)
                    + Self.previewBubbleVerticalPadding * 2
            )

            return PreviewMessageLayout(
                message: message,
                rows: rows,
                messageFont: messageFont,
                bubbleWidth: bubbleWidth,
                textWidth: textWidth,
                rowHeights: rowHeights,
                bubbleHeight: bubbleHeight
            )
        }
    }

    private func makePreviewLanguageRows(
        for message: PictureInPictureMessage,
        displayMode: PictureInPictureDisplayMode
    ) -> [PreviewLanguageRow] {
        let originalLanguage = message.originalLanguage.isEmpty ? "unknown" : message.originalLanguage
        let originalKey = normalizePreviewLanguageKey(originalLanguage)

        if displayMode == .collapsed {
            let displayLanguage = message.displayLanguage.isEmpty
                ? originalLanguage
                : message.displayLanguage
            let displayKey = normalizePreviewLanguageKey(displayLanguage)
            if displayKey == originalKey || displayKey.isEmpty {
                return [PreviewLanguageRow(
                    language: originalLanguage,
                    text: message.text.isEmpty ? message.originalText : message.text,
                    isOriginal: true,
                    isInterim: message.isInterim
                )]
            }

            if let translation = message.translations.first(where: {
                normalizePreviewLanguageKey($0.language) == displayKey
            }) {
                return [PreviewLanguageRow(
                    language: translation.language,
                    text: translation.text,
                    isOriginal: false,
                    isInterim: translation.isInterim
                )]
            }

            return [PreviewLanguageRow(
                language: originalLanguage,
                text: message.originalText.isEmpty ? message.text : message.originalText,
                isOriginal: true,
                isInterim: message.isInterim
            )]
        }

        var rows = [PreviewLanguageRow(
            language: originalLanguage,
            text: message.originalText.isEmpty ? message.text : message.originalText,
            isOriginal: true,
            isInterim: message.isInterim
        )]
        var seenLanguages = Set([originalKey])
        for translation in message.translations {
            let languageKey = normalizePreviewLanguageKey(translation.language)
            if languageKey.isEmpty || seenLanguages.contains(languageKey) { continue }
            seenLanguages.insert(languageKey)
            rows.append(PreviewLanguageRow(
                language: translation.language,
                text: translation.text,
                isOriginal: false,
                isInterim: translation.isInterim
            ))
        }
        return rows
    }

    private func previewRenderedText(for row: PreviewLanguageRow) -> String {
        let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if row.isOriginal {
            return text
        }
        if row.isInterim {
            return text.isEmpty ? "..." : "\(text) ..."
        }
        return text.isEmpty ? "..." : text
    }

    private func normalizePreviewLanguageKey(_ rawLanguage: String) -> String {
        let normalized = rawLanguage
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
        guard !normalized.isEmpty else { return "" }

        switch normalized {
        case "zh-cn", "zh-hans", "zh-sg": return "zh-cn"
        case "zh-tw", "zh-hant", "zh-hk", "zh-mo": return "zh-tw"
        default: return normalized.split(separator: "-").first.map(String.init) ?? normalized
        }
    }

    private func previewFlag(for rawLanguage: String) -> String {
        let normalized = rawLanguage
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
        switch normalized {
        case "zh-tw", "zh-hant", "zh-hk", "zh-mo": return "🇹🇼"
        case "zh-cn", "zh-hans", "zh-sg", "zh": return "🇨🇳"
        case "en-gb", "en-au", "en-nz": return "🇬🇧"
        case "en": return "🇺🇸"
        case "pt-br": return "🇧🇷"
        case "pt": return "🇵🇹"
        case "es-mx": return "🇲🇽"
        case "es": return "🇪🇸"
        case "ko": return "🇰🇷"
        case "ja": return "🇯🇵"
        case "fr": return "🇫🇷"
        case "de": return "🇩🇪"
        case "it": return "🇮🇹"
        case "ru": return "🇷🇺"
        case "ar": return "🇸🇦"
        case "hi": return "🇮🇳"
        case "vi": return "🇻🇳"
        case "th": return "🇹🇭"
        case "id": return "🇮🇩"
        case "tr": return "🇹🇷"
        case "nl": return "🇳🇱"
        case "pl": return "🇵🇱"
        case "uk": return "🇺🇦"
        case "he": return "🇮🇱"
        case "sv": return "🇸🇪"
        case "da": return "🇩🇰"
        case "no": return "🇳🇴"
        case "fi": return "🇫🇮"
        case "el": return "🇬🇷"
        case "cs": return "🇨🇿"
        case "ro": return "🇷🇴"
        case "hu": return "🇭🇺"
        case "fa": return "🇮🇷"
        case "ur": return "🇵🇰"
        case "bn": return "🇧🇩"
        case "ms": return "🇲🇾"
        case "tl", "fil": return "🇵🇭"
        case "af": return "🇿🇦"
        default: return "🌐"
        }
    }

    private func drawLanguageBadge(
        _ language: String,
        isOriginal: Bool,
        in rect: CGRect,
        fontSize: CGFloat
    ) {
        let flagFont = UIFont.systemFont(ofSize: max(22, min(34, fontSize * 0.72)))
        drawText(
            previewFlag(for: language),
            in: rect,
            font: flagFont,
            color: .black,
            alignment: .center,
            lineBreakMode: .byClipping
        )

        guard isOriginal else { return }
        let badgeSize = max(16, min(23, fontSize * 0.38))
        let badgeRect = CGRect(
            x: rect.maxX - badgeSize * 0.82,
            y: rect.midY - badgeSize * 0.68,
            width: badgeSize,
            height: badgeSize
        )
        UIColor.white.setFill()
        UIBezierPath(ovalIn: badgeRect).fill()
        UIColor(red: 0.72, green: 0.73, blue: 0.76, alpha: 1).setStroke()
        let badgeBorder = UIBezierPath(ovalIn: badgeRect.insetBy(dx: 0.5, dy: 0.5))
        badgeBorder.lineWidth = 1
        badgeBorder.stroke()
        drawText(
            "“",
            in: badgeRect.offsetBy(dx: 0, dy: -1),
            font: .systemFont(ofSize: max(10, badgeSize * 0.7), weight: .bold),
            color: UIColor(red: 0.12, green: 0.12, blue: 0.15, alpha: 1),
            alignment: .center,
            lineBreakMode: .byClipping
        )
    }

    private func drawBubbleBackground(in rect: CGRect, isOwn: Bool) {
        let backgroundColor = isOwn
            ? UIColor(red: 1, green: 0.986, blue: 0.92, alpha: 1)
            : UIColor.white
        backgroundColor.setFill()
        makeBubblePath(in: rect, isOwn: isOwn).fill()
    }

    private func makeBubblePath(in rect: CGRect, isOwn: Bool) -> UIBezierPath {
        let radius = min(20, rect.height / 2)
        guard !isOwn else {
            return UIBezierPath(roundedRect: rect, cornerRadius: radius)
        }

        let topLeftRadius: CGFloat = min(3, rect.height / 2)
        let path = UIBezierPath()
        path.move(to: CGPoint(x: rect.minX + topLeftRadius, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(
            withCenter: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
            radius: radius,
            startAngle: -.pi / 2,
            endAngle: 0,
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            withCenter: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
            radius: radius,
            startAngle: 0,
            endAngle: .pi / 2,
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addArc(
            withCenter: CGPoint(x: rect.minX + radius, y: rect.maxY - radius),
            radius: radius,
            startAngle: .pi / 2,
            endAngle: .pi,
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeftRadius))
        path.addArc(
            withCenter: CGPoint(x: rect.minX + topLeftRadius, y: rect.minY + topLeftRadius),
            radius: topLeftRadius,
            startAngle: .pi,
            endAngle: .pi * 1.5,
            clockwise: true
        )
        path.close()
        return path
    }

    private func measuredTextWidth(_ text: String, font: UIFont) -> CGFloat {
        text
            .components(separatedBy: .newlines)
            .map { ($0 as NSString).size(withAttributes: [.font: font]).width }
            .max() ?? 0
    }

    private func measuredTextHeight(
        _ text: String,
        font: UIFont,
        width: CGFloat
    ) -> CGFloat {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineBreakMode = .byCharWrapping
        let rect = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [
                .font: font,
                .paragraphStyle: paragraphStyle,
            ],
            context: nil
        )
        return max(font.lineHeight, ceil(rect.height))
    }

    private func drawText(
        _ text: String,
        in rect: CGRect,
        font: UIFont,
        color: UIColor,
        alignment: NSTextAlignment = .left,
        lineBreakMode: NSLineBreakMode = .byCharWrapping
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

private struct PictureInPictureTranslation {
    let language: String
    let text: String
    let isInterim: Bool

    init?(dictionary: NSDictionary) {
        let language = (dictionary["language"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !language.isEmpty else { return nil }

        self.language = language
        self.text = (dictionary["text"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.isInterim = dictionary["isInterim"] as? Bool ?? false
    }
}

private struct PictureInPictureMessage {
    let id: String
    let text: String
    let originalText: String
    let originalLanguage: String
    let displayLanguage: String
    let translations: [PictureInPictureTranslation]
    let isOwn: Bool
    let isInterim: Bool

    init?(dictionary: NSDictionary) {
        let id = (dictionary["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let text = (dictionary["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let originalText = (dictionary["originalText"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !id.isEmpty, !text.isEmpty || !originalText.isEmpty else { return nil }

        self.id = id
        self.text = text
        self.originalText = originalText.isEmpty ? text : originalText
        self.originalLanguage = (dictionary["originalLanguage"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.displayLanguage = (dictionary["displayLanguage"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.translations = ((dictionary["translations"] as? [Any]) ?? []).compactMap { rawTranslation in
            guard let translationDictionary = rawTranslation as? NSDictionary else { return nil }
            return PictureInPictureTranslation(dictionary: translationDictionary)
        }
        self.isOwn = dictionary["isOwn"] as? Bool ?? false
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
