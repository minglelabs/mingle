package com.minglelabs.mingle.rn

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import androidx.core.content.ContextCompat

class NativeRuntimeConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeRuntimeConfigModule"

  private val restorePrefs
    get() = reactApplicationContext.getSharedPreferences(RESTORE_PREFS_NAME, Context.MODE_PRIVATE)

  private val locationManager: LocationManager?
    get() = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
  private val locationHandler = Handler(Looper.getMainLooper())
  private var pendingLocationPermissionPromise: Promise? = null
  private var pendingLocationPromise: Promise? = null
  private var activeLocationListener: LocationListener? = null
  private var locationTimeoutRunnable: Runnable? = null

  override fun invalidate() {
    cancelLocationRequest()
    pendingLocationPermissionPromise = null
    super.invalidate()
  }

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
  fun checkLocationPermission(promise: Promise) {
    promise.resolve(locationPermissionPayload())
  }

  @ReactMethod
  fun requestLocationPermission(promise: Promise) {
    if (hasLocationPermission()) {
      promise.resolve(locationPermissionPayload())
      return
    }

    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.resolve(locationPermissionPayload("unavailable"))
      return
    }

    pendingLocationPermissionPromise = promise
    restorePrefs.edit().putBoolean(LOCATION_PERMISSION_REQUESTED_KEY, true).apply()
    try {
      activity.requestPermissions(
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
        REQUEST_LOCATION_PERMISSION,
        locationPermissionListener,
      )
    } catch (error: Throwable) {
      pendingLocationPermissionPromise = null
      promise.resolve(locationPermissionPayload("unavailable"))
    }
  }

  @ReactMethod
  fun getCurrentLocation(promise: Promise) {
    if (!hasLocationPermission()) {
      promise.reject("location_permission", "Location permission is not granted")
      return
    }

    UiThreadUtil.runOnUiThread {
      val manager = locationManager
      if (manager == null) {
        promise.reject("location_unavailable", "Location service is unavailable")
        return@runOnUiThread
      }

      val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .firstOrNull { providerName ->
          try {
            manager.isProviderEnabled(providerName)
          } catch (_: SecurityException) {
            false
          }
        }
      if (provider == null) {
        promise.reject("location_unavailable", "No location provider is enabled")
        return@runOnUiThread
      }

      cancelLocationRequest()
      val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
          resolveCurrentLocation(location)
        }

        override fun onProviderEnabled(provider: String) = Unit

        override fun onProviderDisabled(provider: String) = Unit

        @Suppress("DEPRECATION")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
      }
      activeLocationListener = listener
      pendingLocationPromise = promise
      locationTimeoutRunnable = Runnable {
        activeLocationListener = null
        pendingLocationPromise = null
        try {
          manager.removeUpdates(listener)
        } catch (_: SecurityException) {
          // Permission was revoked while the request was active.
        }
        promise.reject("location_timeout", "Timed out while getting current location")
      }
      locationHandler.postDelayed(locationTimeoutRunnable!!, LOCATION_REQUEST_TIMEOUT_MS)
      try {
        manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
      } catch (error: SecurityException) {
        cancelLocationRequest()
        promise.reject("location_permission", "Location permission was revoked")
      } catch (error: Throwable) {
        cancelLocationRequest()
        promise.reject("location_unavailable", "Unable to start location request", error)
      }
    }
  }

  private val locationPermissionListener = PermissionListener { requestCode, _, _ ->
    if (requestCode != REQUEST_LOCATION_PERMISSION) return@PermissionListener false
    val pending = pendingLocationPermissionPromise
    pendingLocationPermissionPromise = null
    pending?.resolve(locationPermissionPayload())
    true
  }

  private fun hasLocationPermission(): Boolean {
    val fineGranted = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    return fineGranted || coarseGranted
  }

  private fun locationPermissionStatus(): String {
    if (hasLocationPermission()) return "granted"
    val activity = reactApplicationContext.currentActivity as? android.app.Activity
      ?: return "unavailable"
    if (!restorePrefs.getBoolean(LOCATION_PERMISSION_REQUESTED_KEY, false)) return "not_determined"
    val canAskAgain = activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)
      || activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION)
    return if (canAskAgain) "denied" else "blocked"
  }

  private fun locationPermissionPayload(statusOverride: String? = null) = Arguments.createMap().apply {
    putString("permission", statusOverride ?: locationPermissionStatus())
    putString("platform", "android")
  }

  private fun resolveCurrentLocation(location: Location) {
    val promise = pendingLocationPromise ?: return
    cancelLocationRequest()
    promise.resolve(Arguments.createMap().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", location.accuracy.toDouble())
    })
  }

  private fun cancelLocationRequest() {
    locationTimeoutRunnable?.let(locationHandler::removeCallbacks)
    locationTimeoutRunnable = null
    val listener = activeLocationListener
    if (listener != null) {
      try {
        locationManager?.removeUpdates(listener)
      } catch (_: SecurityException) {
        // Permission may have been revoked during cleanup.
      }
    }
    activeLocationListener = null
    pendingLocationPromise = null
  }

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
    const val LOCATION_PERMISSION_REQUESTED_KEY = "location_permission_requested"
    const val REQUEST_LOCATION_PERMISSION = 4107
    const val LOCATION_REQUEST_TIMEOUT_MS = 12_000L

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
