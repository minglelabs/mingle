package com.minglelabs.mingle.rn

import android.content.Context
import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.Arguments
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

  @ReactMethod
  fun getPendingProfileLink(promise: Promise) {
    val url = restorePrefs.getString(PENDING_PROFILE_LINK_URL_KEY, "") ?: ""
    if (url.isEmpty()) {
      promise.resolve(null)
      return
    }

    promise.resolve(Arguments.createMap().apply {
      putString("url", url)
      putDouble(
        "sequence",
        restorePrefs.getLong(PENDING_PROFILE_LINK_SEQUENCE_KEY, 0L).toDouble(),
      )
    })
  }

  @ReactMethod
  fun clearPendingProfileLink(sequence: Double, promise: Promise) {
    val expectedSequence = sequence.toLong()
    val currentSequence = restorePrefs.getLong(PENDING_PROFILE_LINK_SEQUENCE_KEY, 0L)
    if (expectedSequence <= 0L || expectedSequence == currentSequence) {
      restorePrefs.edit()
        .remove(PENDING_PROFILE_LINK_URL_KEY)
        .remove(PENDING_PROFILE_LINK_SEQUENCE_KEY)
        .apply()
    }
    promise.resolve(true)
  }

  companion object {
    const val RESTORE_PREFS_NAME = "mingle_native_conversation_restore"
    const val RESTORE_URL_KEY = "url"
    const val RESTORE_CONVERSATION_ID_KEY = "conversation_id"
    const val RESTORE_CREATED_AT_MS_KEY = "created_at_ms"
    const val PENDING_PROFILE_LINK_URL_KEY = "profile_link_url"
    const val PENDING_PROFILE_LINK_SEQUENCE_KEY = "profile_link_sequence"

    fun recordIncomingProfileLink(context: Context, rawUrl: String?) {
      val normalizedUrl = rawUrl?.trim() ?: return
      if (!isSupportedProfileLink(normalizedUrl)) return

      val prefs = context.getSharedPreferences(RESTORE_PREFS_NAME, Context.MODE_PRIVATE)
      val nextSequence = prefs.getLong(PENDING_PROFILE_LINK_SEQUENCE_KEY, 0L) + 1L
      prefs.edit()
        .putString(PENDING_PROFILE_LINK_URL_KEY, normalizedUrl)
        .putLong(PENDING_PROFILE_LINK_SEQUENCE_KEY, nextSequence)
        .apply()
      Log.i(
        "MingleProfileLink",
        "native_record scheme=${normalizedUrl.substringBefore(":").lowercase()} sequence=$nextSequence hasNonce=${normalizedUrl.contains("linkNonce=")} nonceHint=${Uri.parse(normalizedUrl).getQueryParameter("linkNonce")?.takeLast(8) ?: ""}",
      )
    }

    private fun isSupportedProfileLink(rawUrl: String): Boolean {
      val lower = rawUrl.lowercase()
      return (lower.startsWith("mingle://profile/") || lower.startsWith("mingleprofile://profile/"))
        || (lower.startsWith("https://mingle-2-0-0-production.up.railway.app/p/"))
    }
  }
}
