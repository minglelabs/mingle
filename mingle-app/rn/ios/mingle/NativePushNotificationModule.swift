import Foundation
import React
import UIKit
import UserNotifications

/// Native push registration + notification-tap capture for iOS.
///
/// AppDelegate forwards three UIKit callbacks to the static side of this class:
///  - `didRegisterForRemoteNotifications(_:)` — APNs device token arrived.
///  - `didFailToRegisterForRemoteNotifications(_:)` — registration failed.
///  - `didReceiveNotification(_:)` — the user TAPPED a notification
///    (`UNUserNotificationCenterDelegate.didReceive`). Cold start and warm
///    (background→foreground) taps both land here.
///
/// A tapped notification's routing data is stored as a "pending tap" that the
/// JS side (App.tsx) polls with `getPendingPushTap`, mirroring the Android
/// `NativePushNotificationModule` and the pending-profile-link flow. The RN
/// bridge (JS `NativeModules.NativePushNotificationModule`) exposes
/// `registerForPushNotifications`, `getRegistrationInfo`, `getPendingPushTap`
/// and `clearPendingPushTap`.
@objc(NativePushNotificationModule)
class NativePushNotificationModule: NSObject {
    // MARK: - Static shared state (populated from AppDelegate, no bridge here)

    private static let stateQueue = DispatchQueue(label: "com.minglelabs.mingle.push.state")
    private static var cachedDeviceToken: String = ""
    private static var lastRegistrationError: String = ""

    private static var pendingTapType: String = ""
    private static var pendingTapUrl: String = ""
    private static var pendingTapConversationId: String = ""
    private static var pendingTapSequence: Int = 0

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    // MARK: - AppDelegate hooks

    @objc(didRegisterForRemoteNotifications:)
    static func didRegisterForRemoteNotifications(_ deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        stateQueue.sync {
            cachedDeviceToken = token
            lastRegistrationError = ""
        }
    }

    @objc(didFailToRegisterForRemoteNotifications:)
    static func didFailToRegisterForRemoteNotifications(_ error: Error) {
        stateQueue.sync {
            lastRegistrationError = error.localizedDescription
        }
    }

    /// The user tapped a notification. Extract routing fields from the APNs
    /// userInfo and store them as the pending tap. Handles both cold start and
    /// warm taps identically — JS decides when to consume.
    @objc(didReceiveNotification:)
    static func didReceiveNotification(_ userInfo: [AnyHashable: Any]) {
        let type = string(from: userInfo["type"])
        let url = string(from: userInfo["url"])
        let conversationId = string(from: userInfo["conversationId"])
        if url.isEmpty && conversationId.isEmpty { return }

        stateQueue.sync {
            pendingTapSequence += 1
            pendingTapType = type
            pendingTapUrl = url
            pendingTapConversationId = conversationId
        }
    }

    private static func string(from value: Any?) -> String {
        guard let value = value else { return "" }
        if let stringValue = value as? String {
            return stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return "\(value)".trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - JS bridge methods

    @objc(registerForPushNotifications:rejecter:)
    func registerForPushNotifications(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async {
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                self.resolveRegistration(permission: granted ? "authorized" : "denied", resolve: resolve)
            }
        }
    }

    @objc(getRegistrationInfo:rejecter:)
    func getRegistrationInfo(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                permission = "authorized"
            case .denied:
                permission = "denied"
            case .notDetermined:
                permission = "not_determined"
            @unknown default:
                permission = "not_determined"
            }
            self.resolveRegistration(permission: permission, resolve: resolve)
        }
    }

    private func resolveRegistration(permission: String, resolve: @escaping RCTPromiseResolveBlock) {
        var token = ""
        NativePushNotificationModule.stateQueue.sync {
            token = NativePushNotificationModule.cachedDeviceToken
        }
        resolve([
            "token": token,
            "platform": "ios",
            "environment": Self.apnsEnvironment(),
            "permission": permission,
        ])
    }

    private static func apnsEnvironment() -> String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    @objc(getPendingPushTap:rejecter:)
    func getPendingPushTap(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        var type = ""
        var url = ""
        var conversationId = ""
        var sequence = 0
        NativePushNotificationModule.stateQueue.sync {
            type = NativePushNotificationModule.pendingTapType
            url = NativePushNotificationModule.pendingTapUrl
            conversationId = NativePushNotificationModule.pendingTapConversationId
            sequence = NativePushNotificationModule.pendingTapSequence
        }
        if sequence <= 0 || (url.isEmpty && conversationId.isEmpty) {
            resolve(nil)
            return
        }
        resolve([
            "type": type,
            "url": url,
            "conversationId": conversationId,
            "sequence": sequence,
        ])
    }

    @objc(clearPendingPushTap:resolver:rejecter:)
    func clearPendingPushTap(
        _ sequence: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        let expected = sequence.intValue
        NativePushNotificationModule.stateQueue.sync {
            if expected <= 0 || expected == NativePushNotificationModule.pendingTapSequence {
                NativePushNotificationModule.pendingTapType = ""
                NativePushNotificationModule.pendingTapUrl = ""
                NativePushNotificationModule.pendingTapConversationId = ""
            }
        }
        resolve(true)
    }
}
