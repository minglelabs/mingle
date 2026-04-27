package com.minglelabs.mingle.rn

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NativeRuntimeConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeRuntimeConfigModule"

  private val restorePrefs
    get() = reactApplicationContext.getSharedPreferences(RESTORE_PREFS_NAME, Context.MODE_PRIVATE)

  override fun getConstants(): MutableMap<String, Any> = hashMapOf(
    "runtimeConfig" to hashMapOf(
      "webAppBaseUrl" to BuildConfig.MINGLE_WEB_APP_BASE_URL,
      "defaultWsUrl" to BuildConfig.MINGLE_DEFAULT_WS_URL,
      "legacyWebAppBaseUrl" to BuildConfig.MINGLE_LEGACY_WEB_APP_BASE_URL,
      "legacyDefaultWsUrl" to BuildConfig.MINGLE_LEGACY_DEFAULT_WS_URL,
      "apiNamespace" to BuildConfig.MINGLE_API_NAMESPACE,
      "clientVersion" to BuildConfig.MINGLE_CLIENT_VERSION,
      "clientBuild" to BuildConfig.MINGLE_CLIENT_BUILD,
      "qaBridgeEnabled" to BuildConfig.MINGLE_QA_BRIDGE_ENABLED,
      "adBannerPosition" to BuildConfig.MINGLE_AD_BANNER_POSITION,
      "adBannerHeightPx" to BuildConfig.MINGLE_AD_BANNER_HEIGHT_PX,
      "adBannerUnitIdAndroid" to BuildConfig.MINGLE_AD_BANNER_UNIT_ID_ANDROID,
      "conversationRestoreUrl" to (restorePrefs.getString(RESTORE_URL_KEY, "") ?: ""),
      "conversationRestoreConversationId" to (restorePrefs.getString(RESTORE_CONVERSATION_ID_KEY, "") ?: ""),
      "conversationRestoreCreatedAtMs" to restorePrefs.getLong(RESTORE_CREATED_AT_MS_KEY, 0L).toDouble(),
    ),
  )

  @ReactMethod
  fun rememberConversationRestoreUrl(
    url: String,
    conversationId: String,
    createdAtMs: Double,
    promise: Promise,
  ) {
    val normalizedUrl = url.trim()
    val normalizedConversationId = conversationId.trim()
    if (normalizedUrl.isEmpty() || normalizedConversationId.isEmpty() || !createdAtMs.isFinite() || createdAtMs <= 0.0) {
      clearConversationRestoreUrl(promise)
      return
    }

    restorePrefs.edit()
      .putString(RESTORE_URL_KEY, normalizedUrl)
      .putString(RESTORE_CONVERSATION_ID_KEY, normalizedConversationId)
      .putLong(RESTORE_CREATED_AT_MS_KEY, createdAtMs.toLong())
      .apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun clearConversationRestoreUrl(promise: Promise) {
    restorePrefs.edit()
      .remove(RESTORE_URL_KEY)
      .remove(RESTORE_CONVERSATION_ID_KEY)
      .remove(RESTORE_CREATED_AT_MS_KEY)
      .apply()
    promise.resolve(true)
  }

  private companion object {
    const val RESTORE_PREFS_NAME = "mingle_native_conversation_restore"
    const val RESTORE_URL_KEY = "url"
    const val RESTORE_CONVERSATION_ID_KEY = "conversation_id"
    const val RESTORE_CREATED_AT_MS_KEY = "created_at_ms"
  }
}
