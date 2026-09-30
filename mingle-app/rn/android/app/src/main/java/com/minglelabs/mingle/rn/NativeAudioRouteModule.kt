package com.minglelabs.mingle.rn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Read-only reporter of the current media output route for the web's earphone
 * mode (bridge contract A.2): `getAudioRoute()` plus `audioRouteChanged` events.
 * It never changes audio mode or routing, so the STT capture policy and its
 * route-change recovery (NativeSTTModule) are unaffected, and it needs no
 * permission. Device product names are never read, only device TYPES.
 *
 * API 33+: judged on getAudioDevicesForAttributes(USAGE_MEDIA), i.e. where the
 * WebView's `<audio>` TTS would really play. API 29-32 has no such query:
 * getDevices(GET_DEVICES_OUTPUTS) lists every CONNECTED output, so only earphone
 * types that carry media there are counted (see legacyMediaOutputTypes). RN JS
 * dedupes and debounces before anything reaches the WebView, so every reading
 * is emitted as is.
 */
class NativeAudioRouteModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  data class RouteClassification(
    val earphonesConnected: Boolean,
    val routeKind: String,
    val outputTypes: List<String>,
  )

  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val mainHandler = Handler(Looper.getMainLooper())
  private var audioDeviceCallback: AudioDeviceCallback? = null
  private var becomingNoisyReceiver: BroadcastReceiver? = null

  // Main thread only (device callback, receiver, host resume and getAudioRoute
  // all run there), which also keeps readings and `monotonicMs` in order.
  @Volatile private var becomingNoisyHoldUntilMs = 0L
  private val becomingNoisyHoldExpired = Runnable { emitCurrentRoute("becoming_noisy_settled") }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addLifecycleEventListener(this)
    registerAudioDeviceCallback()
    registerBecomingNoisyReceiver()
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    mainHandler.removeCallbacks(becomingNoisyHoldExpired)
    unregisterAudioDeviceCallback()
    unregisterBecomingNoisyReceiver()
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter. Delivery is not gated on listeners.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun getAudioRoute(promise: Promise) {
    // Read on the main thread like every event, so readings stay ordered.
    mainHandler.post {
      try {
        promise.resolve(readRoutePayload(reason = null))
      } catch (error: Throwable) {
        promise.reject("audio_route_unavailable", error.message ?: "audio route read failed", error)
      }
    }
  }

  override fun onHostResume() {
    // Device callbacks can be deferred while the app is cached; re-read on
    // return, like iOS does on didBecomeActive.
    emitCurrentRoute("host_resume")
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() = Unit

  private fun registerAudioDeviceCallback() {
    if (audioDeviceCallback != null) return
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
        // A newly added earphone output is a real (re)connect: it ends a
        // becoming-noisy hold early. Only a type that can count on this API
        // level does (on API 29-32 an SCO or BLE headset output never counts).
        val countableTypes = countableEarphoneTypes()
        if (addedDevices.any { it.isSink && it.type in countableTypes }) {
          clearBecomingNoisyHold()
        }
        emitCurrentRoute("devices_added")
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
        emitCurrentRoute("devices_removed")
      }
    }
    try {
      // A null handler delivers callbacks on the main looper. Registering also
      // delivers one onAudioDevicesAdded batch for the devices already connected.
      audioManager.registerAudioDeviceCallback(callback, null)
      audioDeviceCallback = callback
    } catch (error: Throwable) {
      Log.w(TAG, "registerAudioDeviceCallback failed", error)
    }
  }

  private fun unregisterAudioDeviceCallback() {
    val callback = audioDeviceCallback ?: return
    audioDeviceCallback = null
    try {
      audioManager.unregisterAudioDeviceCallback(callback)
    } catch (error: Throwable) {
      Log.w(TAG, "unregisterAudioDeviceCallback failed", error)
    }
  }

  private fun registerBecomingNoisyReceiver() {
    if (becomingNoisyReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != AudioManager.ACTION_AUDIO_BECOMING_NOISY) return
        startBecomingNoisyHold()
        emitCurrentRoute("becoming_noisy")
      }
    }
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        // A system broadcast: Android's guidance is RECEIVER_EXPORTED, since
        // RECEIVER_NOT_EXPORTED can miss system broadcasts sent by privileged
        // non-system UIDs. AUDIO_BECOMING_NOISY is a protected broadcast, and
        // even a spoofed one could only report a disconnect (fail-safe).
        reactApplicationContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        reactApplicationContext.registerReceiver(receiver, filter)
      }
      becomingNoisyReceiver = receiver
    } catch (error: Throwable) {
      Log.w(TAG, "registerReceiver(ACTION_AUDIO_BECOMING_NOISY) failed", error)
    }
  }

  private fun unregisterBecomingNoisyReceiver() {
    val receiver = becomingNoisyReceiver ?: return
    becomingNoisyReceiver = null
    try {
      reactApplicationContext.unregisterReceiver(receiver)
    } catch (error: Throwable) {
      Log.w(TAG, "unregisterReceiver(ACTION_AUDIO_BECOMING_NOISY) failed", error)
    }
  }

  // ACTION_AUDIO_BECOMING_NOISY arrives before the system really drops the
  // device (it delays the disconnect so players can pause), and until then every
  // reading still shows the leaving earphones. For the hold window, readings
  // are taken without earphone outputs so the web hears the disconnect at once
  // and a reading in between cannot flip it back to connected.
  private fun startBecomingNoisyHold() {
    becomingNoisyHoldUntilMs = SystemClock.elapsedRealtime() + BECOMING_NOISY_HOLD_MS
    mainHandler.removeCallbacks(becomingNoisyHoldExpired)
    mainHandler.postDelayed(becomingNoisyHoldExpired, BECOMING_NOISY_HOLD_MS + 50L)
  }

  private fun clearBecomingNoisyHold() {
    if (becomingNoisyHoldUntilMs == 0L) return
    becomingNoisyHoldUntilMs = 0L
    mainHandler.removeCallbacks(becomingNoisyHoldExpired)
  }

  private fun currentMediaOutputTypes(): List<Int> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      return audioManager.getAudioDevicesForAttributes(MEDIA_ATTRIBUTES).map { it.type }
    }
    val connectedTypes = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }
    val bluetoothA2dpOn = readBluetoothA2dpOn()
    val audioMode = audioManager.mode
    val mediaTypes = legacyMediaOutputTypes(
      connectedTypes,
      bluetoothA2dpOn = bluetoothA2dpOn,
      inCallAudioMode = audioMode == AudioManager.MODE_IN_CALL ||
        audioMode == AudioManager.MODE_IN_COMMUNICATION,
    )
    if (mediaTypes.size != connectedTypes.size) {
      Log.i(
        TAG,
        "api<33 connected=${connectedTypes.distinct().map { typeName(it) }} " +
          "a2dpOn=$bluetoothA2dpOn mode=$audioMode",
      )
    }
    return mediaTypes
  }

  // Deprecated since API 26, where it only reports whether an A2DP output is
  // connected (not that media is routed to it). It is the cross-check a listed
  // A2DP output must also pass on API 29-32; a failed read counts as off.
  @Suppress("DEPRECATION")
  private fun readBluetoothA2dpOn(): Boolean =
    try {
      audioManager.isBluetoothA2dpOn
    } catch (error: Throwable) {
      Log.w(TAG, "isBluetoothA2dpOn failed", error)
      false
    }

  private fun readRoutePayload(reason: String?): WritableMap {
    val holdActive = SystemClock.elapsedRealtime() < becomingNoisyHoldUntilMs
    val classification = classifyOutputTypes(currentMediaOutputTypes(), excludeEarphones = holdActive)
    Log.i(
      TAG,
      "reason=${reason ?: "read"} earphones=${classification.earphonesConnected} " +
        "kind=${classification.routeKind} outputs=${classification.outputTypes} noisyHold=$holdActive",
    )
    return Arguments.createMap().apply {
      putBoolean("earphonesConnected", classification.earphonesConnected)
      putString("routeKind", classification.routeKind)
      putArray(
        "outputTypes",
        Arguments.createArray().apply { classification.outputTypes.forEach { pushString(it) } },
      )
      // Lets JS drop a reading older than one it already holds.
      putDouble("monotonicMs", SystemClock.elapsedRealtimeNanos() / 1_000_000.0)
      if (!reason.isNullOrEmpty()) putString("reason", reason)
    }
  }

  private fun emitCurrentRoute(reason: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { emitCurrentRoute(reason) }
      return
    }
    val payload = try {
      readRoutePayload(reason)
    } catch (error: Throwable) {
      Log.w(TAG, "audio route read failed reason=$reason", error)
      return
    }
    // DeviceEventEmitter drops an event nobody listens to, which is fine: RN
    // reads the initial route with getAudioRoute() right after subscribing.
    if (!reactApplicationContext.hasActiveReactInstance()) return
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_ROUTE_CHANGED, payload)
    } catch (error: Throwable) {
      Log.w(TAG, "audio route emit failed reason=$reason", error)
    }
  }

  companion object {
    const val NAME = "NativeAudioRouteModule"
    private const val TAG = "NativeAudioRoute"
    private const val EVENT_ROUTE_CHANGED = "audioRouteChanged"
    private const val BECOMING_NOISY_HOLD_MS = 2_500L

    private val MEDIA_ATTRIBUTES: AudioAttributes =
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build()

    /** Outputs that count as earphones (bridge contract A, earphone definition). */
    val EARPHONE_TYPES: Set<Int> = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_HEARING_AID,
    )

    /**
     * API 29-32: the earphone types that carry media when listed (A2DP only
     * while isBluetoothA2dpOn()). TYPE_BLUETOOTH_SCO is call audio: a headset
     * with "Media audio" off, or a call-only headset, is listed as SCO while
     * media plays on the speaker. TYPE_BLE_HEADSET is left to the API 33+ path.
     */
    private val LEGACY_MEDIA_EARPHONE_TYPES: Set<Int> = setOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_HEARING_AID,
    )

    /** Earphone types that can count on this device's API level. */
    private fun countableEarphoneTypes(): Set<Int> =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) EARPHONE_TYPES else LEGACY_MEDIA_EARPHONE_TYPES

    /**
     * API 29-32: keeps, out of the CONNECTED outputs getDevices() lists, the
     * ones that can carry media. Non-earphone outputs are all kept, so
     * routeKind still names the fallback (usually the speaker). An earphone
     * output is kept only if it is in LEGACY_MEDIA_EARPHONE_TYPES, A2DP only
     * while `bluetoothA2dpOn`. In a call mode (MODE_IN_CALL /
     * MODE_IN_COMMUNICATION) the audio policy routes media along the call
     * route instead (A2DP is skipped, a speakerphone call takes media to the
     * speaker even with wired earphones), which the list cannot show, so no
     * earphone output is kept. A missed earphone only skips auto TTS; a false
     * one could play it on the speaker.
     */
    fun legacyMediaOutputTypes(
      connectedTypes: List<Int>,
      bluetoothA2dpOn: Boolean,
      inCallAudioMode: Boolean,
    ): List<Int> = connectedTypes.filter { type ->
      when {
        type !in EARPHONE_TYPES -> true
        inCallAudioMode || type !in LEGACY_MEDIA_EARPHONE_TYPES -> false
        type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> bluetoothA2dpOn
        else -> true
      }
    }

    private val TYPE_NAMES: Map<Int, String> = mapOf(
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE to "TYPE_BUILTIN_EARPIECE",
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER to "TYPE_BUILTIN_SPEAKER",
      AudioDeviceInfo.TYPE_WIRED_HEADSET to "TYPE_WIRED_HEADSET",
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES to "TYPE_WIRED_HEADPHONES",
      AudioDeviceInfo.TYPE_LINE_ANALOG to "TYPE_LINE_ANALOG",
      AudioDeviceInfo.TYPE_LINE_DIGITAL to "TYPE_LINE_DIGITAL",
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO to "TYPE_BLUETOOTH_SCO",
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP to "TYPE_BLUETOOTH_A2DP",
      AudioDeviceInfo.TYPE_HDMI to "TYPE_HDMI",
      AudioDeviceInfo.TYPE_HDMI_ARC to "TYPE_HDMI_ARC",
      AudioDeviceInfo.TYPE_USB_DEVICE to "TYPE_USB_DEVICE",
      AudioDeviceInfo.TYPE_USB_ACCESSORY to "TYPE_USB_ACCESSORY",
      AudioDeviceInfo.TYPE_DOCK to "TYPE_DOCK",
      AudioDeviceInfo.TYPE_FM to "TYPE_FM",
      AudioDeviceInfo.TYPE_TELEPHONY to "TYPE_TELEPHONY",
      AudioDeviceInfo.TYPE_AUX_LINE to "TYPE_AUX_LINE",
      AudioDeviceInfo.TYPE_IP to "TYPE_IP",
      AudioDeviceInfo.TYPE_BUS to "TYPE_BUS",
      AudioDeviceInfo.TYPE_USB_HEADSET to "TYPE_USB_HEADSET",
      AudioDeviceInfo.TYPE_HEARING_AID to "TYPE_HEARING_AID",
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE to "TYPE_BUILTIN_SPEAKER_SAFE",
      AudioDeviceInfo.TYPE_REMOTE_SUBMIX to "TYPE_REMOTE_SUBMIX",
      AudioDeviceInfo.TYPE_BLE_HEADSET to "TYPE_BLE_HEADSET",
      AudioDeviceInfo.TYPE_BLE_SPEAKER to "TYPE_BLE_SPEAKER",
      AudioDeviceInfo.TYPE_HDMI_EARC to "TYPE_HDMI_EARC",
      AudioDeviceInfo.TYPE_BLE_BROADCAST to "TYPE_BLE_BROADCAST",
      AudioDeviceInfo.TYPE_DOCK_ANALOG to "TYPE_DOCK_ANALOG",
      AudioDeviceInfo.TYPE_MULTICHANNEL_GROUP to "TYPE_MULTICHANNEL_GROUP",
    )

    private fun typeName(type: Int): String = TYPE_NAMES[type] ?: "TYPE_$type"

    // Lower wins when several outputs are listed (API 29-32 lists every
    // connected output). Earphones always rank first, so routeKind names the
    // earphone whenever earphonesConnected is true.
    private fun routeRank(type: Int): Int = when (type) {
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> 0
      AudioDeviceInfo.TYPE_USB_HEADSET -> 1
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET -> 2
      AudioDeviceInfo.TYPE_HEARING_AID -> 3
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 4
      AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC, AudioDeviceInfo.TYPE_HDMI_EARC -> 10
      AudioDeviceInfo.TYPE_BUS -> 11
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> 30
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> 31
      // Never a media route; listed on API 29-32 next to the speaker.
      AudioDeviceInfo.TYPE_TELEPHONY, AudioDeviceInfo.TYPE_FM -> 40
      // Line out, dock, USB device/accessory, IP, casting, BLE speaker/broadcast, ...
      else -> 20
    }

    private fun routeKindOf(type: Int): String = when (type) {
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired"
      AudioDeviceInfo.TYPE_USB_HEADSET -> "usb"
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
      AudioDeviceInfo.TYPE_HEARING_AID -> "hearing_aid"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "speaker"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "receiver"
      AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC, AudioDeviceInfo.TYPE_HDMI_EARC -> "hdmi"
      AudioDeviceInfo.TYPE_BUS -> "car"
      else -> "other"
    }

    /**
     * Classifies output device types. `excludeEarphones` drops earphone outputs
     * (becoming-noisy hold); with nothing left, the route is the speaker the
     * system is about to fall back to.
     */
    fun classifyOutputTypes(types: List<Int>, excludeEarphones: Boolean = false): RouteClassification {
      val considered = if (excludeEarphones) types.filterNot { it in EARPHONE_TYPES } else types
      val primaryType = considered.minByOrNull(::routeRank)
      val routeKind = when {
        primaryType != null -> routeKindOf(primaryType)
        excludeEarphones -> "speaker"
        else -> "none"
      }
      return RouteClassification(
        earphonesConnected = considered.any { it in EARPHONE_TYPES },
        routeKind = routeKind,
        outputTypes = considered.map(::typeName).distinct(),
      )
    }
  }
}
