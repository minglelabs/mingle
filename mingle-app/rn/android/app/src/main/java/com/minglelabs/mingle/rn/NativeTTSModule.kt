package com.minglelabs.mingle.rn

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
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
  private var clipFile: File? = null
  private var currentPlaybackId: String? = null
  private var currentUtteranceId: String? = null
  private var currentStopsOnEarphoneDisconnect = false
  private var focusRequest: AudioFocusRequest? = null
  private var deviceCallback: AudioDeviceCallback? = null

  // Streamed clip (`streamStart` / `streamAppend` / `streamEnd`): PCM that
  // arrives while it is being generated and plays as it arrives. State is
  // main-thread only; the blocking writes run on `streamWriter`.
  private var streamTrack: AudioTrack? = null
  private var streamWriter: Handler? = null
  private var streamWriterThread: HandlerThread? = null
  /** Bumped whenever the stream is torn down, so late callbacks are ignored. */
  private var streamGeneration = 0
  private var streamEnded = false
  private var streamCarryByte: Byte? = null
  private var streamQueuedFrames = 0L

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
          setAudioAttributes(PLAYBACK_ATTRIBUTES)
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

  // ── Streamed clip ───────────────────────────────────────────────────────

  /**
   * Starts a clip whose PCM (16-bit little-endian mono at `sampleRate`)
   * arrives in pieces: `pcmBase64` here is the first piece, the rest comes
   * through `streamAppend`, and `streamEnd` says no more will come. Resolves
   * `{ ok: true }` once the track is playing, like `play`. Events are the
   * same as for a whole clip.
   */
  @ReactMethod
  fun streamStart(options: ReadableMap, promise: Promise) {
    val rawPlaybackId = optionalString(options, "playbackId")
    val rawUtteranceId = optionalString(options, "utteranceId")
    val playbackId = rawPlaybackId ?: rawUtteranceId ?: UUID.randomUUID().toString()
    val stopsOnEarphoneDisconnect =
      options.hasKey("stopOnEarphoneDisconnect") && options.getBoolean("stopOnEarphoneDisconnect")
    val requestedRate = if (options.hasKey("sampleRate")) options.getInt("sampleRate") else DEFAULT_STREAM_SAMPLE_RATE
    val sampleRate = if (requestedRate in 8000..48000) requestedRate else DEFAULT_STREAM_SAMPLE_RATE
    val firstPiece = decodePcm(if (options.hasKey("pcmBase64")) options.getString("pcmBase64") else null)

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
        val format = AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
        val minBufferBytes = AudioTrack.getMinBufferSize(
          sampleRate,
          AudioFormat.CHANNEL_OUT_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
        )
        // A stream-mode track starts sounding only once its buffer filled
        // once, so the buffer stays small: sound starts with the first pieces.
        val bufferBytes = if (minBufferBytes > 0) minBufferBytes * 2 else sampleRate / 5 * 2
        val track = AudioTrack.Builder()
          .setAudioAttributes(PLAYBACK_ATTRIBUTES)
          .setAudioFormat(format)
          .setTransferMode(AudioTrack.MODE_STREAM)
          .setBufferSizeInBytes(bufferBytes)
          .build()
        val thread = HandlerThread("native-tts-stream").apply { start() }
        streamTrack = track
        streamWriterThread = thread
        streamWriter = Handler(thread.looper)
        streamEnded = false
        streamCarryByte = null
        streamQueuedFrames = 0L
        requestDuckingFocus()
        track.play()
        Log.i(TAG, "stream playing playbackId=$playbackId sampleRate=$sampleRate bufferBytes=$bufferBytes")
        appendStreamPcm(firstPiece)
        promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      } catch (error: Throwable) {
        Log.w(TAG, "streamStart failed playbackId=$playbackId", error)
        releasePlayer()
        clearIdentity()
        promise.reject("playback_error", "Failed to start stream: ${error.message ?: "unknown"}", error)
      }
    }
  }

  @ReactMethod
  fun streamAppend(playbackId: String, pcmBase64: String) {
    val piece = decodePcm(pcmBase64)
    if (piece.isEmpty()) return
    mainHandler.post {
      if (streamTrack == null || currentPlaybackId != playbackId || streamEnded) return@post
      appendStreamPcm(piece)
    }
  }

  @ReactMethod
  fun streamEnd(playbackId: String) {
    mainHandler.post {
      val track = streamTrack ?: return@post
      if (currentPlaybackId != playbackId || streamEnded) return@post
      streamEnded = true
      val generation = streamGeneration
      val totalFrames = streamQueuedFrames
      // After the last queued write: wait until the track has played it all.
      streamWriter?.post {
        mainHandler.post { awaitStreamPlayedOut(track, generation, totalFrames, lastHead = -1L, stalledMs = 0L) }
      }
    }
  }

  /** Queues one piece on the writer thread. Main thread. */
  private fun appendStreamPcm(piece: ByteArray) {
    val track = streamTrack ?: return
    val writer = streamWriter ?: return
    if (piece.isEmpty()) return
    // A sample may be cut between two pieces.
    val carry = streamCarryByte
    var bytes = if (carry != null) byteArrayOf(carry) + piece else piece
    streamCarryByte = null
    if (bytes.size % 2 == 1) {
      streamCarryByte = bytes[bytes.size - 1]
      bytes = bytes.copyOf(bytes.size - 1)
    }
    if (bytes.isEmpty()) return
    streamQueuedFrames += bytes.size / 2
    val generation = streamGeneration
    writer.post {
      // Blocks while the track's buffer is full; a released track returns an error.
      val written = runCatching { track.write(bytes, 0, bytes.size, AudioTrack.WRITE_BLOCKING) }.getOrDefault(-1)
      if (written < 0) {
        mainHandler.post {
          if (streamGeneration == generation && streamTrack === track) onStreamError("audio_track_write($written)")
        }
      }
    }
  }

  /** Polls until the track has played every frame written, then reports the clip finished. Main thread. */
  private fun awaitStreamPlayedOut(
    track: AudioTrack,
    generation: Int,
    totalFrames: Long,
    lastHead: Long,
    stalledMs: Long,
  ) {
    if (streamGeneration != generation || streamTrack !== track) return
    // The head position is an unsigned 32-bit frame counter.
    val head = runCatching { track.playbackHeadPosition.toLong() and 0xFFFFFFFFL }.getOrDefault(totalFrames)
    val stalled = if (head == lastHead) stalledMs + STREAM_POLL_MS else 0L
    // The last frames of a short write may never leave the buffer on some
    // devices: a head that stopped moving also means it is over.
    if (head >= totalFrames || stalled >= STREAM_STALL_MS) {
      val payload = playbackPayload().apply { putBoolean("success", true) }
      Log.i(TAG, "stream finished playbackId=${currentPlaybackId ?: ""} frames=$totalFrames head=$head")
      releasePlayer()
      clearIdentity()
      emit("ttsPlaybackFinished", payload)
      return
    }
    mainHandler.postDelayed(
      { awaitStreamPlayedOut(track, generation, totalFrames, head, stalled) },
      STREAM_POLL_MS,
    )
  }

  private fun onStreamError(message: String) {
    Log.w(TAG, "stream error playbackId=${currentPlaybackId ?: ""} $message")
    val payload = playbackPayload().apply { putString("message", message) }
    releasePlayer()
    clearIdentity()
    emit("ttsError", payload)
  }

  private fun decodePcm(base64: String?): ByteArray = try {
    base64?.let { Base64.decode(it, Base64.DEFAULT) } ?: ByteArray(0)
  } catch (_: IllegalArgumentException) {
    ByteArray(0)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      val wasPlaying = runCatching { player?.isPlaying == true }.getOrDefault(false) || streamTrack != null
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
    if (!currentStopsOnEarphoneDisconnect || (player == null && streamTrack == null)) return
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
    releaseStream()
    abandonDuckingFocus()
  }

  /** Stops and forgets the streamed clip without reporting anything. Main thread. */
  private fun releaseStream() {
    streamGeneration += 1
    val track = streamTrack
    streamTrack = null
    streamWriter?.removeCallbacksAndMessages(null)
    streamWriter = null
    if (track != null) {
      // pause + flush unblocks a write waiting on a full buffer.
      runCatching { track.pause() }
      runCatching { track.flush() }
      runCatching { track.release() }
    }
    streamWriterThread?.quitSafely()
    streamWriterThread = null
    streamEnded = false
    streamCarryByte = null
    streamQueuedFrames = 0L
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
    private const val STREAM_POLL_MS = 40L
    private const val STREAM_STALL_MS = 600L

    private val PLAYBACK_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }
}
