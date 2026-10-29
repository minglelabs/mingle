package com.minglelabs.mingle.rn

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging

class NativePushNotificationModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativePushNotificationModule"

  private val pushPrefs
    get() = reactApplicationContext.getSharedPreferences(PUSH_PREFS_NAME, Context.MODE_PRIVATE)

  private fun permissionStatus(): String {
    if (Build.VERSION.SDK_INT < 33) return "authorized"
    return if (
      reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED
    ) {
      "authorized"
    } else {
      "denied"
    }
  }

  private fun registrationPayload(token: String = pushPrefs.getString(TOKEN_KEY, "") ?: "") =
    Arguments.createMap().apply {
      putString("token", token)
      putString("installationId", installationId(reactApplicationContext))
      putString("platform", "android")
      putString("environment", "production")
      putString("permission", permissionStatus())
    }

  private fun resolveWithCurrentToken(promise: Promise) {
    val firebaseApp = ensureFirebaseApp(reactApplicationContext)
    if (firebaseApp == null) {
      promise.resolve(registrationPayload())
      return
    }

    try {
      FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          if (task.isSuccessful) {
            val token = task.result ?: ""
            if (token.isNotBlank()) {
              cacheToken(reactApplicationContext, token)
            }
            promise.resolve(registrationPayload(token))
          } else {
            promise.resolve(registrationPayload())
          }
        }
    } catch (_: Throwable) {
      promise.resolve(registrationPayload())
    }
  }

  @ReactMethod
  fun registerForPushNotifications(promise: Promise) {
    resolveWithCurrentToken(promise)
  }

  @ReactMethod
  fun getRegistrationInfo(promise: Promise) {
    resolveWithCurrentToken(promise)
  }

  @ReactMethod
  fun getPendingPushTap(promise: Promise) {
    val prefs = pushPrefs
    val type = prefs.getString(PENDING_TAP_TYPE_KEY, "") ?: ""
    val url = prefs.getString(PENDING_TAP_URL_KEY, "") ?: ""
    val conversationId = prefs.getString(PENDING_TAP_CONVERSATION_ID_KEY, "") ?: ""
    val sequence = prefs.getLong(PENDING_TAP_SEQUENCE_KEY, 0L)
    if (sequence <= 0L || (url.isEmpty() && conversationId.isEmpty())) {
      promise.resolve(null)
      return
    }
    promise.resolve(Arguments.createMap().apply {
      putString("type", type)
      putString("url", url)
      putString("conversationId", conversationId)
      putDouble("sequence", sequence.toDouble())
    })
  }

  @ReactMethod
  fun clearPendingPushTap(sequence: Double, promise: Promise) {
    val expectedSequence = sequence.toLong()
    val currentSequence = pushPrefs.getLong(PENDING_TAP_SEQUENCE_KEY, 0L)
    if (expectedSequence <= 0L || expectedSequence == currentSequence) {
      pushPrefs.edit()
        .remove(PENDING_TAP_TYPE_KEY)
        .remove(PENDING_TAP_URL_KEY)
        .remove(PENDING_TAP_CONVERSATION_ID_KEY)
        .remove(PENDING_TAP_SEQUENCE_KEY)
        .apply()
    }
    promise.resolve(true)
  }

  companion object {
    private const val PUSH_PREFS_NAME = "mingle_native_push"
    private const val TOKEN_KEY = "fcm_token"
    private const val INSTALLATION_ID_KEY = "installation_id"
    private const val PENDING_TAP_TYPE_KEY = "pending_tap_type"
    private const val PENDING_TAP_URL_KEY = "pending_tap_url"
    private const val PENDING_TAP_CONVERSATION_ID_KEY = "pending_tap_conversation_id"
    private const val PENDING_TAP_SEQUENCE_KEY = "pending_tap_sequence"

    /**
     * Persist the tap target carried by a notification-launch intent so JS can
     * consume it on cold start and when the app returns to the foreground. Only
     * the "MINGLE_NOTIFICATION_OPEN" action carries a tap; any other intent is
     * ignored. Mirrors the pending-profile-link pattern in
     * NativeRuntimeConfigModule.
     */
    fun recordPendingPushTap(context: Context, intent: android.content.Intent?) {
      if (intent == null || intent.action != "MINGLE_NOTIFICATION_OPEN") return
      val url = intent.getStringExtra("url")?.trim() ?: ""
      val conversationId = intent.getStringExtra("conversationId")?.trim() ?: ""
      val type = intent.getStringExtra("type")?.trim() ?: ""
      if (url.isEmpty() && conversationId.isEmpty()) return

      val prefs = context.getSharedPreferences(PUSH_PREFS_NAME, Context.MODE_PRIVATE)
      val nextSequence = prefs.getLong(PENDING_TAP_SEQUENCE_KEY, 0L) + 1L
      prefs.edit()
        .putString(PENDING_TAP_TYPE_KEY, type)
        .putString(PENDING_TAP_URL_KEY, url)
        .putString(PENDING_TAP_CONVERSATION_ID_KEY, conversationId)
        .putLong(PENDING_TAP_SEQUENCE_KEY, nextSequence)
        .apply()
    }

    fun installationId(context: Context): String {
      val prefs = context.getSharedPreferences(PUSH_PREFS_NAME, Context.MODE_PRIVATE)
      val existing = prefs.getString(INSTALLATION_ID_KEY, "")?.trim() ?: ""
      if (existing.isNotEmpty()) return existing

      val value = java.util.UUID.randomUUID().toString()
      prefs.edit().putString(INSTALLATION_ID_KEY, value).apply()
      return value
    }

    fun cacheToken(context: Context, token: String) {
      val normalized = token.trim()
      if (normalized.isEmpty()) return
      context.getSharedPreferences(PUSH_PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(TOKEN_KEY, normalized)
        .apply()
    }

    fun ensureFirebaseApp(context: Context): FirebaseApp? {
      try {
        return FirebaseApp.getInstance()
      } catch (_: IllegalStateException) {
        // The default app is not available when google-services.json was not
        // bundled, so try the runtime BuildConfig fallback below.
      }

      val projectId = BuildConfig.MINGLE_FIREBASE_PROJECT_ID.trim()
      val applicationId = BuildConfig.MINGLE_FIREBASE_APPLICATION_ID.trim()
      val apiKey = BuildConfig.MINGLE_FIREBASE_API_KEY.trim()
      val senderId = BuildConfig.MINGLE_FIREBASE_MESSAGING_SENDER_ID.trim()
      if (
        projectId.isEmpty() ||
        applicationId.isEmpty() ||
        applicationId.equals("null", ignoreCase = true) ||
        apiKey.isEmpty() ||
        senderId.isEmpty()
      ) {
        return null
      }

      return try {
        FirebaseApp.initializeApp(
          context,
          FirebaseOptions.Builder()
            .setProjectId(projectId)
            .setApplicationId(applicationId)
            .setApiKey(apiKey)
            .setGcmSenderId(senderId)
            .build(),
        )
      } catch (_: Throwable) {
        null
      }
    }
  }
}
