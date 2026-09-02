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
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import androidx.core.content.ContextCompat

class NativeRuntimeConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeRuntimeConfigModule"

  private val restorePrefs
    get() = reactApplicationContext.getSharedPreferences(RESTORE_PREFS_NAME, Context.MODE_PRIVATE)

  private val locationManager: LocationManager?
    get() = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
  private val fusedLocationClient by lazy {
    LocationServices.getFusedLocationProviderClient(reactApplicationContext)
  }
  private val locationHandler = Handler(Looper.getMainLooper())
  private var pendingLocationPermissionPromise: Promise? = null
  private var pendingLocationPromise: Promise? = null
  private var activeLocationListener: LocationListener? = null
  private var activeLocationRequestId: Long? = null
  private var fusedCancellationTokenSource: CancellationTokenSource? = null
  private var locationTimeoutRunnable: Runnable? = null
  private var locationRequestSequence = 0L

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

      val requestId = ++locationRequestSequence
      cancelLocationRequest()
      pendingLocationPromise = promise
      activeLocationRequestId = requestId
      locationTimeoutRunnable = Runnable {
        if (!isActiveLocationRequest(requestId)) return@Runnable
        val pending = pendingLocationPromise
        Log.w(TAG, "location_timeout requestId=$requestId")
        cancelLocationRequest()
        pending?.reject("location_timeout", "Timed out while getting current location")
      }
      locationHandler.postDelayed(locationTimeoutRunnable!!, LOCATION_REQUEST_TIMEOUT_MS)

      val enabledProviders = manager?.let(::enabledLocationProviders).orEmpty()

      Log.i(
        TAG,
        "location_start requestId=$requestId providers=${enabledProviders.joinToString(",").ifEmpty { "fused" }}",
      )
      val fusedStarted = requestFusedLocation(requestId)
      if (manager != null && enabledProviders.isNotEmpty()) {
        requestLocationManagerFallback(manager, enabledProviders, requestId)
      }
      if (!fusedStarted && activeLocationListener == null) {
        val pending = pendingLocationPromise
        cancelLocationRequest()
        pending?.reject(
          "location_unavailable",
          if (enabledProviders.isEmpty()) "No location provider is enabled" else "Unable to start location request",
        )
      }
    }
  }

  private fun enabledLocationProviders(manager: LocationManager): List<String> {
    return listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
      .filter { providerName ->
        try {
          manager.isProviderEnabled(providerName)
        } catch (_: SecurityException) {
          false
        }
      }
  }

  private fun requestFusedLocation(requestId: Long): Boolean {
    val cancellationTokenSource = try {
      CancellationTokenSource()
    } catch (error: Throwable) {
      Log.w(TAG, "location_fused_unavailable requestId=$requestId error=${error.javaClass.simpleName}")
      return false
    }

    fusedCancellationTokenSource = cancellationTokenSource
    return try {
      fusedLocationClient
        .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancellationTokenSource.token)
        .addOnSuccessListener { location ->
          if (!isActiveLocationRequest(requestId)) return@addOnSuccessListener
          if (location != null && isValidLocation(location)) {
            resolveCurrentLocation(location, "fused")
          } else {
            requestFusedLastKnownLocation(requestId)
          }
        }
        .addOnFailureListener { error ->
          if (!isActiveLocationRequest(requestId)) return@addOnFailureListener
          Log.w(TAG, "location_fused_failed requestId=$requestId error=${error.javaClass.simpleName}")
          requestFusedLastKnownLocation(requestId)
        }
      true
    } catch (error: SecurityException) {
      fusedCancellationTokenSource = null
      Log.w(TAG, "location_fused_permission requestId=$requestId")
      false
    } catch (error: Throwable) {
      fusedCancellationTokenSource = null
      Log.w(TAG, "location_fused_unavailable requestId=$requestId error=${error.javaClass.simpleName}")
      false
    }
  }

  private fun requestFusedLastKnownLocation(requestId: Long) {
    if (!isActiveLocationRequest(requestId)) return
    try {
      fusedLocationClient.lastLocation
        .addOnSuccessListener { location ->
          if (!isActiveLocationRequest(requestId)) return@addOnSuccessListener
          if (location != null && isUsableLastKnownLocation(location)) {
            resolveCurrentLocation(location, "fused_last_known")
          }
        }
        .addOnFailureListener { error ->
          if (!isActiveLocationRequest(requestId)) return@addOnFailureListener
          Log.w(TAG, "location_fused_last_known_failed requestId=$requestId error=${error.javaClass.simpleName}")
        }
    } catch (error: SecurityException) {
      Log.w(TAG, "location_fused_last_known_permission requestId=$requestId")
    } catch (error: Throwable) {
      Log.w(TAG, "location_fused_last_known_unavailable requestId=$requestId error=${error.javaClass.simpleName}")
    }
  }

  private fun requestLocationManagerFallback(
    manager: LocationManager,
    providers: List<String>,
    requestId: Long,
  ) {
    if (!isActiveLocationRequest(requestId) || activeLocationListener != null) return

    val lastKnown = providers
      .mapNotNull { providerName ->
        try {
          manager.getLastKnownLocation(providerName)
        } catch (_: SecurityException) {
          null
        }
      }
      .filter(::isUsableLastKnownLocation)
      .maxByOrNull { it.time }
    if (lastKnown != null) {
      resolveCurrentLocation(lastKnown, "last_known_${lastKnown.provider ?: "unknown"}")
      return
    }

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        resolveCurrentLocation(location, location.provider ?: "location_manager")
      }

      override fun onProviderEnabled(provider: String) = Unit

      override fun onProviderDisabled(provider: String) = Unit

      @Suppress("DEPRECATION")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }
    activeLocationListener = listener
    var startedProviderCount = 0
    providers.forEach { providerName ->
      try {
        manager.requestLocationUpdates(providerName, LOCATION_UPDATE_INTERVAL_MS, 0f, listener, Looper.getMainLooper())
        startedProviderCount += 1
      } catch (_: SecurityException) {
        // Continue with the other provider when permission changes during setup.
      } catch (error: Throwable) {
        Log.w(TAG, "location_manager_provider_failed requestId=$requestId provider=$providerName error=${error.javaClass.simpleName}")
      }
    }

    if (startedProviderCount == 0) {
      activeLocationListener = null
      Log.w(TAG, "location_manager_unavailable requestId=$requestId")
    } else {
      Log.i(TAG, "location_manager_started requestId=$requestId providers=${providers.joinToString(",")}")
    }
  }

  private fun isActiveLocationRequest(requestId: Long): Boolean {
    return activeLocationRequestId == requestId && pendingLocationPromise != null
  }

  private fun isValidLocation(location: Location): Boolean {
    return location.latitude.isFinite()
      && location.longitude.isFinite()
      && location.latitude in -90.0..90.0
      && location.longitude in -180.0..180.0
  }

  private fun isUsableLastKnownLocation(location: Location): Boolean {
    if (!isValidLocation(location) || location.time <= 0L) return false
    return kotlin.math.abs(System.currentTimeMillis() - location.time) <= MAX_LAST_KNOWN_AGE_MS
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

  private fun resolveCurrentLocation(location: Location, providerOverride: String? = null) {
    val promise = pendingLocationPromise ?: return
    if (!isValidLocation(location)) return
    val provider = providerOverride?.trim()?.takeIf { it.isNotEmpty() }
      ?: location.provider?.trim()?.takeIf { it.isNotEmpty() }
      ?: "unknown"
    val receivedAtMs = System.currentTimeMillis()
    Log.i(
      TAG,
      "location_success requestId=${activeLocationRequestId ?: 0} provider=$provider accuracy=${location.accuracy} receivedAtMs=$receivedAtMs",
    )
    cancelLocationRequest()
    promise.resolve(Arguments.createMap().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", location.accuracy.toDouble())
      putString("provider", provider)
      putDouble("receivedAtMs", receivedAtMs.toDouble())
    })
  }

  private fun cancelLocationRequest() {
    fusedCancellationTokenSource?.cancel()
    fusedCancellationTokenSource = null
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
    activeLocationRequestId = null
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
    const val TAG = "MingleLocation"
    const val RESTORE_PREFS_NAME = "mingle_native_conversation_restore"
    const val RESTORE_URL_KEY = "url"
    const val RESTORE_CONVERSATION_ID_KEY = "conversation_id"
    const val RESTORE_CREATED_AT_MS_KEY = "created_at_ms"
    const val PENDING_PROFILE_LINK_URL_KEY = "profile_link_url"
    const val PENDING_PROFILE_LINK_SEQUENCE_KEY = "profile_link_sequence"
    const val LOCATION_PERMISSION_REQUESTED_KEY = "location_permission_requested"
    const val REQUEST_LOCATION_PERMISSION = 4107
    const val LOCATION_REQUEST_TIMEOUT_MS = 12_000L
    const val LOCATION_UPDATE_INTERVAL_MS = 1_000L
    const val MAX_LAST_KNOWN_AGE_MS = 10 * 60 * 1_000L

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
