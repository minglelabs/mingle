import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications

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

    return true
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
