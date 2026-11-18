package com.minglelabs.mingle.rn

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.UUID

/**
 * Plays the translation read aloud natively, with the same bridge contract as
 * the iOS NativeTTSModule (`play` / `stop`, `ttsPlaybackFinished` /
 * `ttsPlaybackStopped` / `ttsError`, earphone guard of contract A.5).
 * `playStream` / `appendStream` / `endStream` play a clip while its audio is
 * still arriving (Android only so far; the shell reports it as `ttsStream`).
 *
 * While a clip plays it holds a transient "may duck" audio focus, so other
 * apps (a video, music) get quieter instead of pausing and come back to their
 * volume when the clip ends. The clip plays under this app's uid, which the
 * device-audio playback capture excludes, so it is never transcribed again.
 *
 * All player state is main-thread only.
 */
class NativeTTSModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val mainHandler = Handler(Looper.getMainLooper())

  private var player: MediaPlayer? = null
  private var streamPlayer: NativeTtsPcmStreamPlayer? = null
  private var clipFile: File? = null
  private var currentPlaybackId: String? = null
  private var currentUtteranceId: String? = null
  private var currentStopsOnEarphoneDisconnect = false
  private var focusRequest: AudioFocusRequest? = null
  private var deviceCallback: AudioDeviceCallback? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    mainHandler.post { registerDeviceCallback() }
  }

  override fun invalidate() {
    mainHandler.post {
      unregisterDeviceCallback()
      releasePlayer()
      clearIdentity()
    }
    super.invalidate()
  }

  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun play(options: ReadableMap, promise: Promise) {
    val audioBase64 = if (options.hasKey("audioBase64")) options.getString("audioBase64") else null
    val audioBytes = try {
      audioBase64?.let { Base64.decode(it, Base64.DEFAULT) }
    } catch (_: IllegalArgumentException) {
      null
    }
    if (audioBytes == null || audioBytes.isEmpty()) {
      promise.reject("decode_error", "Failed to decode base64 audio data")
      return
    }
    val rawPlaybackId = optionalString(options, "playbackId")
    val rawUtteranceId = optionalString(options, "utteranceId")
    val playbackId = rawPlaybackId ?: rawUtteranceId ?: UUID.randomUUID().toString()
    val stopsOnEarphoneDisconnect =
      options.hasKey("stopOnEarphoneDisconnect") && options.getBoolean("stopOnEarphoneDisconnect")

    mainHandler.post {
      // A new clip replaces the current one without a stopped event, like iOS.
      releasePlayer()
      currentPlaybackId = playbackId
      currentUtteranceId = rawUtteranceId
      currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

      // Contract A.5: a flagged clip never starts on a non-earphone output.
      if (stopsOnEarphoneDisconnect && !earphonesConnected()) {
        Log.i(TAG, "refused playbackId=$playbackId reason=$EARPHONES_DISCONNECTED_REASON")
        val stopped = playbackPayload().apply { putString("reason", EARPHONES_DISCONNECTED_REASON) }
        clearIdentity()
        emit("ttsPlaybackStopped", stopped)
        promise.resolve(Arguments.createMap().apply {
          putBoolean("ok", false)
          putString("reason", EARPHONES_DISCONNECTED_REASON)
        })
        return@post
      }

      try {
        val file = File.createTempFile("native-tts-", ".audio", reactApplicationContext.cacheDir)
        file.writeBytes(audioBytes)
        clipFile = file
        val nextPlayer = MediaPlayer().apply {
          setAudioAttributes(playbackAttributesNow())
          setDataSource(file.absolutePath)
          setOnCompletionListener { finished -> onClipFinished(finished) }
          setOnErrorListener { failed, what, extra ->
            onClipError(failed, "media_player_error($what,$extra)")
            true
          }
          prepare()
        }
        player = nextPlayer
        requestDuckingFocus()
        nextPlayer.start()
        Log.i(TAG, "playing playbackId=$playbackId bytes=${audioBytes.size} durationMs=${nextPlayer.duration}")
        promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      } catch (error: Throwable) {
        Log.w(TAG, "play failed playbackId=$playbackId", error)
        releasePlayer()
        clearIdentity()
        promise.reject("playback_error", "Failed to play audio: ${error.message ?: "unknown"}", error)
      }
    }
  }

  /**
   * Opens a clip whose audio is still arriving (`appendStream`, then
   * `endStream`). Same events and earphone guard as `play`.
   */
  @ReactMethod
  fun playStream(options: ReadableMap, promise: Promise) {
    val rawPlaybackId = optionalString(options, "playbackId")
    val rawUtteranceId = optionalString(options, "utteranceId")
    val playbackId = rawPlaybackId ?: rawUtteranceId ?: UUID.randomUUID().toString()
    val sampleRate = if (options.hasKey("sampleRate")) options.getInt("sampleRate") else DEFAULT_STREAM_SAMPLE_RATE
    val stopsOnEarphoneDisconnect =
      options.hasKey("stopOnEarphoneDisconnect") && options.getBoolean("stopOnEarphoneDisconnect")

    mainHandler.post {
      releasePlayer()
      currentPlaybackId = playbackId
      currentUtteranceId = rawUtteranceId
      currentStopsOnEarphoneDisconnect = stopsOnEarphoneDisconnect

      if (stopsOnEarphoneDisconnect && !earphonesConnected()) {
        Log.i(TAG, "refused stream playbackId=$playbackId reason=$EARPHONES_DISCONNECTED_REASON")
        val stopped = playbackPayload().apply { putString("reason", EARPHONES_DISCONNECTED_REASON) }
        clearIdentity()
        emit("ttsPlaybackStopped", stopped)
        promise.resolve(Arguments.createMap().apply {
          putBoolean("ok", false)
          putString("reason", EARPHONES_DISCONNECTED_REASON)
        })
        return@post
      }

      try {
        lateinit var opened: NativeTtsPcmStreamPlayer
        opened = NativeTtsPcmStreamPlayer(
          sampleRate = sampleRate,
          attributes = playbackAttributesNow(),
          onFinished = { mainHandler.post { onStreamFinished(opened) } },
          onError = { message -> mainHandler.post { onStreamError(opened, message) } },
        )
        streamPlayer = opened
        requestDuckingFocus()
        Log.i(TAG, "streaming playbackId=$playbackId sampleRate=$sampleRate")
        promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      } catch (error: Throwable) {
        Log.w(TAG, "playStream failed playbackId=$playbackId", error)
        releasePlayer()
        clearIdentity()
        promise.reject("playback_error", "Failed to open audio stream: ${error.message ?: "unknown"}", error)
      }
    }
  }

  @ReactMethod
  fun appendStream(playbackId: String, audioBase64: String) {
    val pcm = try {
      Base64.decode(audioBase64, Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      return
    }
    mainHandler.post {
      // Pieces of a clip that was stopped or replaced meanwhile are dropped.
      if (currentPlaybackId == playbackId) streamPlayer?.append(pcm)
    }
  }

  @ReactMethod
  fun endStream(playbackId: String) {
    mainHandler.post {
      if (currentPlaybackId == playbackId) streamPlayer?.end()
    }
  }

  private fun onStreamFinished(finished: NativeTtsPcmStreamPlayer) {
    if (finished !== streamPlayer) return
    Log.i(TAG, "stream finished playbackId=${currentPlaybackId ?: ""} bytes=${finished.writtenBytes}")
    val payload = playbackPayload().apply { putBoolean("success", true) }
    releasePlayer()
    clearIdentity()
    emit("ttsPlaybackFinished", payload)
  }

  private fun onStreamError(failed: NativeTtsPcmStreamPlayer, message: String) {
    if (failed !== streamPlayer) return
    Log.w(TAG, "stream error playbackId=${currentPlaybackId ?: ""} $message")
    val payload = playbackPayload().apply { putString("message", message) }
    releasePlayer()
    clearIdentity()
    emit("ttsError", payload)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      val wasPlaying = streamPlayer != null || runCatching { player?.isPlaying == true }.getOrDefault(false)
      val stopped = playbackPayload()
      releasePlayer()
      clearIdentity()
      if (wasPlaying) {
        emit("ttsPlaybackStopped", stopped)
      }
      promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
    }
  }

  private fun onClipFinished(finished: MediaPlayer) {
    if (finished !== player) return
    val payload = playbackPayload().apply { putBoolean("success", true) }
    releasePlayer()
    clearIdentity()
    emit("ttsPlaybackFinished", payload)
  }

  private fun onClipError(failed: MediaPlayer, message: String) {
    if (failed !== player) return
    Log.w(TAG, "playback error playbackId=${currentPlaybackId ?: ""} $message")
    val payload = playbackPayload().apply { putString("message", message) }
    releasePlayer()
    clearIdentity()
    emit("ttsError", payload)
  }

  // During a voice talk the phone is in communication mode, and its echo
  // canceller removes from the microphone only what plays as call audio. A
  // translation read as media would go back into the call, so the other
  // person would hear their own words translated. In a call it plays as call
  // audio (and follows the call volume); otherwise as media, as before.
  private fun playbackAttributesNow(): AudioAttributes =
    if (audioManager.mode == AudioManager.MODE_IN_COMMUNICATION) CALL_PLAYBACK_ATTRIBUTES else PLAYBACK_ATTRIBUTES

  // ── Audio focus: other apps duck while a clip plays ─────────────────────

  private fun requestDuckingFocus() {
    if (focusRequest != null) return
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(PLAYBACK_ATTRIBUTES)
      // The clip is short and must not be cut by another app's focus change.
      .setWillPauseWhenDucked(false)
      .setOnAudioFocusChangeListener({ }, mainHandler)
      .build()
    val result = audioManager.requestAudioFocus(request)
    if (result != AudioManager.AUDIOFOCUS_REQUEST_FAILED) {
      focusRequest = request
    }
    Log.i(TAG, "duck focus request result=$result")
  }

  private fun abandonDuckingFocus() {
    val request = focusRequest ?: return
    focusRequest = null
    audioManager.abandonAudioFocusRequest(request)
  }

  // ── Earphone guard (contract A.5) ───────────────────────────────────────

  private fun registerDeviceCallback() {
    if (deviceCallback != null) return
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
        stopFlaggedClipIfEarphonesGone()
      }
    }
    audioManager.registerAudioDeviceCallback(callback, mainHandler)
    deviceCallback = callback
  }

  private fun unregisterDeviceCallback() {
    val callback = deviceCallback ?: return
    deviceCallback = null
    audioManager.unregisterAudioDeviceCallback(callback)
  }

  private fun stopFlaggedClipIfEarphonesGone() {
    if (!currentStopsOnEarphoneDisconnect || (player == null && streamPlayer == null)) return
    if (earphonesConnected()) return
    Log.i(TAG, "stopped playbackId=${currentPlaybackId ?: ""} reason=$EARPHONES_DISCONNECTED_REASON")
    val stopped = playbackPayload().apply { putString("reason", EARPHONES_DISCONNECTED_REASON) }
    releasePlayer()
    clearIdentity()
    emit("ttsPlaybackStopped", stopped)
  }

  private fun earphonesConnected(): Boolean {
    val types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      audioManager.getAudioDevicesForAttributes(PLAYBACK_ATTRIBUTES).map { it.type }
    } else {
      val mode = audioManager.mode
      NativeAudioRouteModule.legacyMediaOutputTypes(
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type },
        bluetoothA2dpOn = readBluetoothA2dpOn(),
        inCallAudioMode = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION,
      )
    }
    return NativeAudioRouteModule.classifyOutputTypes(types).earphonesConnected
  }

  @Suppress("DEPRECATION")
  private fun readBluetoothA2dpOn(): Boolean =
    runCatching { audioManager.isBluetoothA2dpOn }.getOrDefault(false)

  // ── Helpers ─────────────────────────────────────────────────────────────

  private fun releasePlayer() {
    val current = player
    player = null
    if (current != null) {
      runCatching { if (current.isPlaying) current.stop() }
      current.setOnCompletionListener(null)
      current.setOnErrorListener(null)
      current.release()
    }
    clipFile?.delete()
    clipFile = null
    streamPlayer?.release()
    streamPlayer = null
    abandonDuckingFocus()
  }

  private fun clearIdentity() {
    currentPlaybackId = null
    currentUtteranceId = null
    currentStopsOnEarphoneDisconnect = false
  }

  private fun playbackPayload(): WritableMap = Arguments.createMap().apply {
    currentPlaybackId?.takeIf { it.isNotEmpty() }?.let { putString("playbackId", it) }
    currentUtteranceId?.takeIf { it.isNotEmpty() }?.let { putString("utteranceId", it) }
  }

  private fun emit(eventName: String, payload: WritableMap) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun optionalString(options: ReadableMap, key: String): String? =
    if (options.hasKey(key)) options.getString(key)?.trim()?.takeIf { it.isNotEmpty() } else null

  companion object {
    const val NAME = "NativeTTSModule"
    private const val TAG = "NativeTTS"
    private const val EARPHONES_DISCONNECTED_REASON = "earphones_disconnected"
    private const val DEFAULT_STREAM_SAMPLE_RATE = 24000

    private val PLAYBACK_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    private val CALL_PLAYBACK_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }
}
