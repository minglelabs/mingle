package com.minglelabs.mingle.rn

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "mingle"

  override fun onCreate(savedInstanceState: Bundle?) {
    NativeRuntimeConfigModule.recordIncomingProfileLink(applicationContext, intent?.dataString)
    // A re-created activity (rotation, theme/locale change, process restore) or a
    // launch from Recents re-delivers the intent that first opened it. Recording it
    // again would replay a push tap that was already handled and navigate the
    // WebView back to the old target. Only a fresh launch carries a new tap here;
    // taps while the app is running arrive through onNewIntent.
    val launchedFromHistory =
      ((intent?.flags ?: 0) and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
    if (savedInstanceState == null && !launchedFromHistory) {
      NativePushNotificationModule.recordPendingPushTap(applicationContext, intent)
    }
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    if (intent != null) {
      setIntent(intent)
      NativeRuntimeConfigModule.recordIncomingProfileLink(applicationContext, intent.dataString)
      NativePushNotificationModule.recordPendingPushTap(applicationContext, intent)
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
