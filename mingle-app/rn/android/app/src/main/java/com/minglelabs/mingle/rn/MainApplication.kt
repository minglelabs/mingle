package com.minglelabs.mingle.rn

import android.app.Application
import android.webkit.WebView
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(NativeRuntimeConfigPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    MingleFirebaseMessagingService.ensureNotificationChannel(this)
    if (BuildConfig.DEBUG || BuildConfig.MINGLE_QA_BRIDGE_ENABLED == "1") {
      WebView.setWebContentsDebuggingEnabled(true)
    }
    loadReactNative(this)
  }
}
