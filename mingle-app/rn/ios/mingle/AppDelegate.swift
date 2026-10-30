import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications
import CoreSpotlight
import UniformTypeIdentifiers

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    MingleLastScreenSnapshotStore.shared.install()
    // Keeps the audio session alive while the app is in the background, so
    // iOS does not suspend it between live translation sessions.
    MingleAudioSessionCoordinator.shared.installBackgroundKeepAlive()
    // Read by JS at startup (runtimeConfig): such a launch opens its own
    // destination instead of restoring the previous screen.
    NativeRuntimeConfigModule.launchedFromExternalIntent = launchOptions?[.url] != nil
      || launchOptions?[.userActivityDictionary] != nil
      || launchOptions?[.remoteNotification] != nil

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    window?.backgroundColor = UIColor(
      red: 243.0 / 255.0,
      green: 195.0 / 255.0,
      blue: 90.0 / 255.0,
      alpha: 1.0
    )

    factory.startReactNative(
      withModuleName: "mingle",
      in: window,
      launchOptions: launchOptions
    )

    if let launchURL = launchOptions?[.url] as? URL {
      NativeRuntimeConfigModule.recordIncomingProfileLink(launchURL)
      // A cold launch via URL scheme only delivers the URL here, in
      // launchOptions — application(_:open:options:) is not additionally
      // called for this same launch. Without this, RCTLinkingManager (and
      // so JS's Linking.getInitialURL()/'url' event) never learns about it
      // on cold start, even though the identical warm-start tap works fine
      // via the open(_:options:) handler below. Feed it through the same
      // RN-standard path here too, so cold and warm start behave the same
      // way — and so conversation-share links (which only use this path,
      // unlike profile links' extra pending-storage fallback) work cold too.
      RCTLinkingManager.application(application, open: launchURL, options: [:])
    }

    indexLegacyNameForSpotlight()

    return true
  }

  // The app was renamed Mingle -> HashChat. Spotlight only matches the
  // display name, so index one item carrying the old name as hidden keywords:
  // searching "mingle" / "밍글" still surfaces HashChat, while nothing in the
  // UI shows the old name. Tapping it just opens the app.
  private func indexLegacyNameForSpotlight() {
    let attributes = CSSearchableItemAttributeSet(contentType: UTType.application)
    attributes.title = "HashChat"
    attributes.displayName = "HashChat"
    attributes.keywords = [
      "HashChat", "해시챗", "mingle", "밍글", "ミングル", "明格尔", "明格爾", "Мингл", "مينغل", "मिंगल", "มิงเกิล",
    ]
    let item = CSSearchableItem(
      uniqueIdentifier: "hashchat.app.legacy-name",
      domainIdentifier: "hashchat.app",
      attributeSet: attributes
    )
    item.expirationDate = .distantFuture
    CSSearchableIndex.default().indexSearchableItems([item], completionHandler: nil)
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    NativePushNotificationModule.didRegisterForRemoteNotifications(deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NativePushNotificationModule.didFailToRegisterForRemoteNotifications(error)
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    NativeRuntimeConfigModule.recordIncomingProfileLink(url)
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    if let webpageURL = userActivity.webpageURL {
      NativeRuntimeConfigModule.recordIncomingProfileLink(webpageURL)
    }
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }

}

extension AppDelegate: UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    // Keep APNs delivery and background notifications intact, but do not show
    // a banner, sound, or badge update while the conversation is already open.
    completionHandler([])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    NativePushNotificationModule.didReceiveNotification(response.notification.request.content.userInfo)
    completionHandler()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
