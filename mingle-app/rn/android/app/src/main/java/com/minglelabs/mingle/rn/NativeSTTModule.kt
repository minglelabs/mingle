package com.minglelabs.mingle.rn

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

class NativeSTTModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private data class StartOptions(
    val conversationId: String,
    val wsUrl: String,
    val sttModel: String,
    val aecEnabled: Boolean,
    val apiNamespace: String,
    val releaseVariant: String,
    val behaviorProfile: String,
    val sonioxManualFinalizeSilenceMs: Int?,
    val sttSegmentationMode: String?,
    val sonioxEndpointMaxDelayMs: Int?,
    val sonioxEndpointTuningStep: Int?,
  )

  private data class PendingStartRequest(
    val options: StartOptions,
    val promise: Promise,
  )

  private data class AudioCaptureHandle(
    val record: AudioRecord,
    val sampleRate: Int,
    val bufferSizeInBytes: Int,
    val profile: NativeSttCaptureProfile,
  )

  private val audioManager =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val isRunning = AtomicBoolean(false)

  @Volatile private var hasListeners = false
  @Volatile private var webSocketReady = false
  @Volatile private var serverReady = false
  @Volatile private var audioRecord: AudioRecord? = null
  @Volatile private var audioThread: Thread? = null
  @Volatile private var webSocket: WebSocket? = null
  @Volatile private var webSocketClient: OkHttpClient? = null
  @Volatile private var currentSampleRate: Int = 48_000
  @Volatile private var requestedAecEnabled = false
  @Volatile private var currentProfile: NativeSttCaptureProfile? = null
  @Volatile private var previousAudioMode: Int? = null
  @Volatile private var activeEchoCanceler: AcousticEchoCanceler? = null
  @Volatile private var activeNoiseSuppressor: NoiseSuppressor? = null
  @Volatile private var pendingStartRequest: PendingStartRequest? = null
  @Volatile private var recordingCallback: AudioManager.AudioRecordingCallback? = null
  @Volatile private var audioDeviceCallback: AudioDeviceCallback? = null
  @Volatile private var stallMonitor: ScheduledExecutorService? = null
  @Volatile private var lastClientSilenced: Boolean? = null
  @Volatile private var foregroundServiceActive = false
  @Volatile private var lastAudioChunkAtMs: Long = 0L
  @Volatile private var lastAudioRecoveryAtMs: Long = 0L
  @Volatile private var activeConversationId: String? = null
  @Volatile private var audioChunkCount: Long = 0L
  @Volatile private var wsMessageCount: Long = 0L
  @Volatile private var gracefulStopPending = false
  private val gracefulStopHandler = Handler(Looper.getMainLooper())
  private var gracefulStopTimeoutRunnable: Runnable? = null
  private val isRecoveringAudio = AtomicBoolean(false)

  override fun getName(): String = "NativeSTTModule"

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addLifecycleEventListener(this)
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    cleanup(reason = null, emitClose = false)
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    hasListeners = true
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    if (count > 0) {
      hasListeners = false
    }
  }

  @ReactMethod
  fun start(
    options: ReadableMap,
    promise: Promise,
  ) {
    if (isRunning.get()) {
      val requestedConversationId = options.getString("conversationId")?.trim().orEmpty()
      if (requestedConversationId.isNotEmpty() && requestedConversationId == activeConversationId) {
        Log.i(TAG, "start reused active session conversation=$requestedConversationId serverReady=$serverReady")
        emitStatus(if (serverReady) "ready" else "running")
        promise.resolve(Arguments.createMap().apply {
          putInt("sampleRate", currentSampleRate)
        })
        return
      }
      promise.reject("already_running", "native_stt_already_running")
      return
    }

    val wsUrl = options.getString("wsUrl")?.trim().orEmpty()
    if (wsUrl.isEmpty()) {
      promise.reject("invalid_ws_url", "Invalid wsUrl")
      return
    }

    val startOptions = StartOptions(
      conversationId = options.getString("conversationId")?.trim().orEmpty(),
      wsUrl = wsUrl,
      sttModel = options.getString("sttModel")?.trim().orEmpty().ifEmpty { "soniox" },
      aecEnabled = if (options.hasKey("aecEnabled")) options.getBoolean("aecEnabled") else false,
      apiNamespace = options.getString("apiNamespace")?.trim().orEmpty(),
      releaseVariant = options.getString("releaseVariant")?.trim().orEmpty(),
      behaviorProfile = options.getString("behaviorProfile")?.trim().orEmpty(),
      sonioxManualFinalizeSilenceMs = parseOptionalSonioxManualFinalizeSilenceMs(
        if (options.hasKey("sonioxManualFinalizeSilenceMs") && !options.isNull("sonioxManualFinalizeSilenceMs")) {
          options.getDouble("sonioxManualFinalizeSilenceMs")
        } else {
          null
        },
      ),
      sttSegmentationMode = options.getString("sttSegmentationMode")
        ?.trim()
        ?.lowercase()
        ?.takeIf { it == "fin" || it == "end" },
      sonioxEndpointMaxDelayMs = parseOptionalSonioxManualFinalizeSilenceMs(
        if (options.hasKey("sonioxEndpointMaxDelayMs") && !options.isNull("sonioxEndpointMaxDelayMs")) {
          options.getDouble("sonioxEndpointMaxDelayMs")
        } else {
          null
        },
      ),
      sonioxEndpointTuningStep = parseOptionalSonioxManualFinalizeSilenceMs(
        if (options.hasKey("sonioxEndpointTuningStep") && !options.isNull("sonioxEndpointTuningStep")) {
          options.getDouble("sonioxEndpointTuningStep")
        } else {
          null
        },
      ),
    )

    if (hasRecordAudioPermission()) {
      startSession(startOptions, promise)
      return
    }

    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      emitError("mic_permission_activity_unavailable")
      promise.reject("mic_permission", "Microphone permission activity unavailable")
      return
    }

    pendingStartRequest = PendingStartRequest(startOptions, promise)
    activity.requestPermissions(
      arrayOf(Manifest.permission.RECORD_AUDIO),
      REQUEST_RECORD_AUDIO,
      permissionListener,
    )
  }

  @ReactMethod
  fun stop(
    options: ReadableMap?,
    promise: Promise,
  ) {
    val requestedConversationId = options?.getString("conversationId")?.trim().orEmpty()
    val currentConversationId = activeConversationId.orEmpty()
    if (requestedConversationId.isNotEmpty()
      && currentConversationId.isNotEmpty()
      && requestedConversationId != currentConversationId
    ) {
      Log.w(
        TAG,
        "ignored stale stop conversation=$requestedConversationId active=$currentConversationId",
      )
      promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      return
    }
    val pendingText = options?.getString("pendingText")?.takeIf { it.isNotBlank() } ?: ""
    val pendingLanguage = options?.getString("pendingLanguage")?.takeIf { it.isNotBlank() } ?: "unknown"

    val currentSocket = webSocket
    if (isRunning.get() && currentSocket != null && webSocketReady) {
      currentSocket.send(
        JSONObject()
          .put("type", "stop_recording")
          .put(
            "data",
            JSONObject()
              .put("pending_text", pendingText)
              .put("pending_language", pendingLanguage),
          )
          .toString(),
      )
      beginGracefulStop()
      promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      return
    }

    cleanup(reason = "stopped", emitClose = true)
    promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
  }

  @ReactMethod
  fun setAec(
    enabled: Boolean,
    promise: Promise,
  ) {
    requestedAecEnabled = enabled
    val running = isRunning.get()
    if (!running) {
      promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
      return
    }

    try {
      recreateAudioCapture(enabled, "set_aec")
      promise.resolve(Arguments.createMap().apply { putBoolean("ok", true) })
    } catch (error: Throwable) {
      emitError("audio_reconfigure_failed: ${error.message ?: "unknown"}")
      promise.reject("audio_reconfigure", "Failed to reconfigure native STT capture", error)
    }
  }

  private val permissionListener =
    PermissionListener { requestCode, _, grantResults ->
      if (requestCode != REQUEST_RECORD_AUDIO) {
        return@PermissionListener false
      }

      val pending = pendingStartRequest
      pendingStartRequest = null
      if (pending == null) {
        return@PermissionListener true
      }

      val granted = grantResults.isNotEmpty() &&
        grantResults.all { it == PackageManager.PERMISSION_GRANTED }

      if (!granted) {
        emitError("mic_permission_denied_after_prompt")
        pending.promise.reject("mic_permission", "Microphone permission denied")
        return@PermissionListener true
      }

      UiThreadUtil.runOnUiThread {
        startSession(pending.options, pending.promise)
      }
      true
    }

  private fun startSession(
    options: StartOptions,
    promise: Promise,
  ) {
    if (isRunning.get()) {
      promise.reject("already_running", "native_stt_already_running")
      return
    }

    requestedAecEnabled = options.aecEnabled
    val profile = NativeSttCapturePolicy.resolve(options.aecEnabled)

    try {
      prepareAudioMode(profile)
      val capture = createAudioCapture(
        profile = profile,
        preferredSampleRate = null,
      )
      audioRecord = capture.record
      currentSampleRate = capture.sampleRate
      currentProfile = capture.profile
      attachAudioEffects(capture.record.audioSessionId, capture.profile)
      registerRecordingCallback(capture.record)

      val socketClient = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
      webSocketClient = socketClient
      webSocketReady = false
      serverReady = false
      lastClientSilenced = null
      activeConversationId = options.conversationId.ifEmpty { null }
      audioChunkCount = 0L
      wsMessageCount = 0L

      val request = Request.Builder()
        .url(options.wsUrl)
        .build()

      Log.i(
        TAG,
        "start session conversation=${activeConversationId ?: "unknown"} ws=${options.wsUrl} " +
          "sampleRate=$currentSampleRate profile=${profile.label}",
      )
      emitStatus("connecting")
      isRunning.set(true)

      webSocket = socketClient.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          if (webSocket !== this@NativeSTTModule.webSocket || !isRunning.get()) {
            webSocket.cancel()
            return
          }
          webSocketReady = true
          serverReady = false
          val config = JSONObject()
            .put("sample_rate", currentSampleRate)
            .put("stt_model", options.sttModel)
          if (options.apiNamespace.isNotEmpty()) {
            config.put("api_namespace", options.apiNamespace)
          }
          if (options.releaseVariant.isNotEmpty()) {
            config.put("release_variant", options.releaseVariant)
          }
          if (options.behaviorProfile.isNotEmpty()) {
            config.put("behavior_profile", options.behaviorProfile)
          }
          options.sonioxManualFinalizeSilenceMs?.let {
            config.put("soniox_manual_finalize_silence_ms", it)
          }
          options.sonioxEndpointMaxDelayMs?.let {
            config.put("soniox_endpoint_max_delay_ms", it)
          }
          options.sonioxEndpointTuningStep?.let {
            config.put("soniox_endpoint_tuning_step", it)
          }
          options.sttSegmentationMode?.let {
            config.put("stt_segmentation_mode", it)
          }
          val configAccepted = webSocket.send(config.toString())
          Log.i(
            TAG,
            "ws opened conversation=${activeConversationId ?: "unknown"} accepted=$configAccepted " +
              "sampleRate=$currentSampleRate profile=${profile.label} " +
              "silenceMs=${options.sonioxManualFinalizeSilenceMs?.toString() ?: "server-default"} " +
              "endpointMaxDelayMs=${options.sonioxEndpointMaxDelayMs?.toString() ?: "server-default"} " +
              "endpointTuningStep=${options.sonioxEndpointTuningStep?.toString() ?: "server-default"}",
          )
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          if (webSocket !== this@NativeSTTModule.webSocket || !isRunning.get()) {
            return
          }
          wsMessageCount += 1
          val messageNumber = wsMessageCount
          if (messageNumber <= 5 || messageNumber % 50L == 0L) {
            Log.i(TAG, "ws message #$messageNumber ${describeServerMessage(text)}")
          }
          if (isServerReadyMessage(text)) {
            serverReady = true
            Log.i(TAG, "server ready conversation=${activeConversationId ?: "unknown"}")
            emitStatus("ready")
          }
          emitMessage(text)
          if (gracefulStopPending && isStopRecordingAck(text)) {
            finishGracefulStop()
          }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          if (webSocket !== this@NativeSTTModule.webSocket || !isRunning.get()) {
            return
          }
          emitClose(reason.ifBlank { "socket_closing" })
          cleanup(reason = null, emitClose = false)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          if (webSocket !== this@NativeSTTModule.webSocket || !isRunning.get()) {
            return
          }
          emitClose(reason.ifBlank { "socket_closed" })
          cleanup(reason = null, emitClose = false)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          if (webSocket !== this@NativeSTTModule.webSocket || !isRunning.get()) {
            return
          }
          emitError("ws_failure: ${t.message ?: "unknown"}")
          cleanup(reason = "socket_failure", emitClose = true)
        }
      })

      startAudioThread(capture)
      registerAudioDeviceCallback()
      startStallMonitor()
      setForegroundServiceEnabled(profile.foregroundServiceEnabled)
      // The WebSocket callbacks run concurrently with setup. A very fast
      // server can deliver `ready` before setup reaches this point; do not
      // overwrite that terminal connection state with the earlier lifecycle
      // state, or the WebView can remain stuck on its connecting UI.
      emitStatus(if (serverReady) "ready" else "running")
      Log.i(TAG, "audio capture started conversation=${activeConversationId ?: "unknown"} sampleRate=$currentSampleRate")
      promise.resolve(Arguments.createMap().apply {
        putInt("sampleRate", currentSampleRate)
      })
    } catch (error: Throwable) {
      cleanup(reason = null, emitClose = false)
      emitError("native_stt_start_failed: ${error.message ?: "unknown"}")
      promise.reject("native_stt_start", "Failed to start native STT", error)
    }
  }

  private fun recreateAudioCapture(
    aecEnabled: Boolean,
    reason: String,
  ) {
    val previousRecord = audioRecord ?: throw IllegalStateException("audio_record_unavailable")
    val preferredSampleRate = currentSampleRate
    val previousProfile = currentProfile ?: NativeSttCapturePolicy.resolve(requestedAecEnabled)
    val nextProfile = NativeSttCapturePolicy.resolve(aecEnabled)

    prepareAudioMode(nextProfile)
    val nextCapture = try {
      createAudioCapture(
        profile = nextProfile,
        preferredSampleRate = preferredSampleRate,
      )
    } catch (error: Throwable) {
      prepareAudioMode(previousProfile)
      throw error
    }

    stopAudioThread()
    unregisterRecordingCallback()
    releaseAudioEffects()
    previousRecord.stopSafely()

    try {
      audioRecord = nextCapture.record
      currentSampleRate = nextCapture.sampleRate
      currentProfile = nextCapture.profile
      attachAudioEffects(nextCapture.record.audioSessionId, nextCapture.profile)
      registerRecordingCallback(nextCapture.record)
      startAudioThread(nextCapture)
      previousRecord.release()
      setForegroundServiceEnabled(nextCapture.profile.foregroundServiceEnabled)
      emitStatus(if (serverReady) "ready" else "running")
      Log.i(TAG, "audio capture recreated reason=$reason profile=${nextCapture.profile.label}")
    } catch (switchError: Throwable) {
      nextCapture.record.stopSafely()
      nextCapture.record.release()

      prepareAudioMode(previousProfile)
      audioRecord = previousRecord
      currentSampleRate = preferredSampleRate
      currentProfile = previousProfile
      attachAudioEffects(previousRecord.audioSessionId, previousProfile)
      registerRecordingCallback(previousRecord)

      try {
        startAudioThread(
          AudioCaptureHandle(
            record = previousRecord,
            sampleRate = preferredSampleRate,
            bufferSizeInBytes = 0,
            profile = previousProfile,
          ),
        )
        setForegroundServiceEnabled(previousProfile.foregroundServiceEnabled)
        emitStatus(if (serverReady) "ready" else "running")
      } catch (rollbackError: Throwable) {
        previousRecord.release()
        cleanup(reason = "audio_capture_recover_failed", emitClose = true)
        throw IllegalStateException(
          "audio_capture_swap_failed(${switchError.message ?: "unknown"}); rollback_failed(${rollbackError.message ?: "unknown"})",
          rollbackError,
        )
      }

      Log.w(TAG, "audio capture rollback applied reason=$reason error=${switchError.message ?: "unknown"}")
      throw IllegalStateException(
        "audio_capture_swap_failed(${switchError.message ?: "unknown"})",
        switchError,
      )
    }
  }

  private fun prepareAudioMode(
    profile: NativeSttCaptureProfile,
  ) {
    if (previousAudioMode == null) {
      previousAudioMode = audioManager.mode
    }
    audioManager.mode = profile.audioMode
  }

  private fun restoreAudioMode() {
    val restoreMode = previousAudioMode ?: return
    audioManager.mode = restoreMode
    previousAudioMode = null
  }

  private fun createAudioCapture(
    profile: NativeSttCaptureProfile,
    preferredSampleRate: Int?,
  ): AudioCaptureHandle {
    var lastError: String? = null

    for (sampleRate in NativeSttCapturePolicy.preferredSampleRates(preferredSampleRate)) {
      val minBuffer = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minBuffer <= 0) {
        lastError = "invalid_min_buffer($sampleRate,$minBuffer)"
        continue
      }

      val bufferSizeInBytes = max(minBuffer * 2, sampleRate / 5)
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(sampleRate)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build()

      try {
        val builder = AudioRecord.Builder()
          .setAudioSource(profile.audioSource)
          .setAudioFormat(format)
          .setBufferSizeInBytes(bufferSizeInBytes)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          builder.setPrivacySensitive(profile.privacySensitive)
        }
        val record = builder.build()
        if (record.state == AudioRecord.STATE_INITIALIZED) {
          Log.i(
            TAG,
            "audio record ready rate=$sampleRate source=${profile.audioSource} privacy=${profile.privacySensitive} profile=${profile.label}",
          )
          return AudioCaptureHandle(record, sampleRate, bufferSizeInBytes, profile)
        }
        record.release()
        lastError = "audio_record_state_${record.state}"
      } catch (error: Throwable) {
        lastError = error.message ?: error.javaClass.simpleName
      }
    }

    throw IllegalStateException("audio_record_init_failed(${lastError ?: "unknown"})")
  }

  private fun startAudioThread(
    capture: AudioCaptureHandle,
  ) {
    val record = capture.record
    val chunkBuffer = ByteArray(2_048 * 2)
    record.startRecording()
    if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      throw IllegalStateException("audio_record_start_failed(${record.recordingState})")
    }
    lastAudioChunkAtMs = SystemClock.elapsedRealtime()

    val thread = Thread({
      while (isRunning.get() && audioRecord === record) {
        val bytesRead = record.read(chunkBuffer, 0, chunkBuffer.size)
        if (bytesRead <= 0) {
          if (bytesRead == AudioRecord.ERROR_DEAD_OBJECT) {
            scheduleAudioRecovery("audio_dead_object")
          }
          if (bytesRead != AudioRecord.ERROR_INVALID_OPERATION && bytesRead != AudioRecord.ERROR_BAD_VALUE) {
            emitError("audio_read_failed: $bytesRead")
          }
          continue
        }

        lastAudioChunkAtMs = SystemClock.elapsedRealtime()
        audioChunkCount += 1
        val chunkNumber = audioChunkCount

        val socket = webSocket
        if (chunkNumber <= 3 || chunkNumber % 100L == 0L) {
          Log.i(
            TAG,
            "audio chunk #$chunkNumber bytes=$bytesRead wsReady=$webSocketReady " +
              "serverReady=$serverReady recordingState=${record.recordingState}",
          )
        }
        if (!webSocketReady || socket == null) {
          continue
        }

        val encoded = Base64.encodeToString(chunkBuffer, 0, bytesRead, Base64.NO_WRAP)
        val payload = JSONObject()
          .put("type", "audio_chunk")
          .put(
            "data",
            JSONObject().put("chunk", encoded),
          )
        if (!socket.send(payload.toString())) {
          Log.w(
            TAG,
            "audio chunk send rejected #$chunkNumber conversation=${activeConversationId ?: "unknown"}",
          )
        }
      }
    }, "NativeSTT-Audio")
    thread.isDaemon = true
    audioThread = thread
    thread.start()
  }

  private fun stopAudioThread() {
    val thread = audioThread
    audioThread = null
    if (thread != null && thread.isAlive) {
      thread.interrupt()
      try {
        thread.join(300)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
  }

  private fun attachAudioEffects(
    sessionId: Int,
    profile: NativeSttCaptureProfile,
  ) {
    releaseAudioEffects()

    if (AcousticEchoCanceler.isAvailable()) {
      activeEchoCanceler = AcousticEchoCanceler.create(sessionId)?.apply {
        enabled = profile.aecEnabled
      }
    }

    if (NoiseSuppressor.isAvailable()) {
      activeNoiseSuppressor = NoiseSuppressor.create(sessionId)?.apply {
        enabled = profile.noiseSuppressorEnabled
      }
    }
  }

  private fun releaseAudioEffects() {
    activeEchoCanceler?.release()
    activeNoiseSuppressor?.release()
    activeEchoCanceler = null
    activeNoiseSuppressor = null
  }

  private fun registerRecordingCallback(
    record: AudioRecord,
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return
    }
    unregisterRecordingCallback()
    val callback = object : AudioManager.AudioRecordingCallback() {
      override fun onRecordingConfigChanged(configs: MutableList<android.media.AudioRecordingConfiguration>) {
        val matching = configs.firstOrNull { it.clientAudioSessionId == record.audioSessionId } ?: return
        val silenced = matching.isClientSilenced
        val previous = lastClientSilenced
        if (previous == silenced) {
          return
        }
        lastClientSilenced = silenced
        emitStatus(if (silenced) "silenced" else if (serverReady) "ready" else "running")
      }
    }
    recordingCallback = callback
    audioManager.registerAudioRecordingCallback(
      callback,
      null,
    )
  }

  private fun unregisterRecordingCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return
    }
    val callback = recordingCallback ?: return
    audioManager.unregisterAudioRecordingCallback(callback)
    recordingCallback = null
    lastClientSilenced = null
  }

  private fun registerAudioDeviceCallback() {
    unregisterAudioDeviceCallback()
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
        if (addedDevices.isNotEmpty()) {
          scheduleAudioRecovery("route_change_added")
        }
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
        if (removedDevices.isNotEmpty()) {
          scheduleAudioRecovery("route_change_removed")
        }
      }
    }
    audioManager.registerAudioDeviceCallback(callback, null)
    audioDeviceCallback = callback
  }

  private fun unregisterAudioDeviceCallback() {
    val callback = audioDeviceCallback ?: return
    audioManager.unregisterAudioDeviceCallback(callback)
    audioDeviceCallback = null
  }

  private fun startStallMonitor() {
    stopStallMonitor()
    lastAudioChunkAtMs = SystemClock.elapsedRealtime()
    val executor = Executors.newSingleThreadScheduledExecutor { runnable ->
      Thread(runnable, "NativeSTT-StallMonitor").apply { isDaemon = true }
    }
    stallMonitor = executor
    executor.scheduleAtFixedRate(
      {
        if (!isRunning.get()) {
          return@scheduleAtFixedRate
        }
        val activeRecord = audioRecord ?: return@scheduleAtFixedRate
        val threadDead = audioThread?.isAlive == false
        val stalledForMs = SystemClock.elapsedRealtime() - lastAudioChunkAtMs
        if (threadDead || (webSocketReady && activeRecord.recordingState == AudioRecord.RECORDSTATE_RECORDING && stalledForMs > AUDIO_STALL_THRESHOLD_MS)) {
          scheduleAudioRecovery(
            if (threadDead) "audio_thread_dead" else "audio_stall_${stalledForMs}ms",
          )
        }
      },
      AUDIO_STALL_CHECK_INTERVAL_MS,
      AUDIO_STALL_CHECK_INTERVAL_MS,
      TimeUnit.MILLISECONDS,
    )
  }

  private fun stopStallMonitor() {
    val monitor = stallMonitor
    stallMonitor = null
    monitor?.shutdownNow()
  }

  private fun scheduleAudioRecovery(reason: String) {
    if (!isRunning.get() || audioRecord == null) {
      return
    }
    val now = SystemClock.elapsedRealtime()
    if (now - lastAudioRecoveryAtMs < AUDIO_RECOVERY_COOLDOWN_MS) {
      return
    }
    if (!isRecoveringAudio.compareAndSet(false, true)) {
      return
    }
    lastAudioRecoveryAtMs = now
    emitStatus("recovering")
    Thread(
      {
        try {
          if (!isRunning.get()) {
            return@Thread
          }
          recreateAudioCapture(
            aecEnabled = requestedAecEnabled,
            reason = reason,
          )
        } catch (error: Throwable) {
          emitError("audio_recovery_failed($reason): ${error.message ?: "unknown"}")
          cleanup(reason = "audio_recovery_failed", emitClose = true)
        } finally {
          isRecoveringAudio.set(false)
        }
      },
      "NativeSTT-Recovery",
    ).start()
  }

  private fun setForegroundServiceEnabled(enabled: Boolean) {
    if (enabled) {
      if (!foregroundServiceActive) {
        NativeSTTForegroundService.start(reactApplicationContext)
        foregroundServiceActive = true
      }
      return
    }

    if (foregroundServiceActive) {
      NativeSTTForegroundService.stop(reactApplicationContext)
      foregroundServiceActive = false
    }
  }

  private fun beginGracefulStop() {
    if (gracefulStopPending) return
    gracefulStopPending = true
    webSocketReady = false
    serverReady = false

    stopAudioThread()
    stopStallMonitor()
    unregisterAudioDeviceCallback()
    unregisterRecordingCallback()
    releaseAudioEffects()

    val record = audioRecord
    audioRecord = null
    if (record != null) {
      record.stopSafely()
      record.release()
    }

    restoreAudioMode()
    setForegroundServiceEnabled(false)
    currentProfile = null
    isRecoveringAudio.set(false)

    clearGracefulStopTimeout()
    val timeout = Runnable {
      finishGracefulStop()
    }
    gracefulStopTimeoutRunnable = timeout
    gracefulStopHandler.postDelayed(timeout, GRACEFUL_STOP_TIMEOUT_MS)
  }

  private fun finishGracefulStop() {
    if (!gracefulStopPending && !isRunning.get()) return
    gracefulStopPending = false
    clearGracefulStopTimeout()
    cleanup(reason = "stopped", emitClose = true)
  }

  private fun clearGracefulStopTimeout() {
    val timeout = gracefulStopTimeoutRunnable
    if (timeout != null) {
      gracefulStopHandler.removeCallbacks(timeout)
      gracefulStopTimeoutRunnable = null
    }
  }

  private fun isStopRecordingAck(raw: String): Boolean =
    try {
      JSONObject(raw).optString("type") == "stop_recording_ack"
    } catch (_: Throwable) {
      false
    }

  private fun isServerReadyMessage(raw: String): Boolean =
    try {
      JSONObject(raw).optString("status").trim().equals("ready", ignoreCase = true)
    } catch (_: Throwable) {
      false
    }

  private fun describeServerMessage(raw: String): String {
    return try {
      val json = JSONObject(raw)
      val type = json.optString("type").trim().ifEmpty { "none" }
      val status = json.optString("status").trim().ifEmpty { "none" }
      val data = json.optJSONObject("data")
      val isFinal = if (data?.has("is_final") == true) data.optBoolean("is_final") else null
      "type=$type status=$status isFinal=${isFinal ?: "none"}"
    } catch (_: Throwable) {
      "invalid_json"
    }
  }

  private fun cleanup(
    reason: String?,
    emitClose: Boolean,
  ) {
    clearGracefulStopTimeout()
    gracefulStopPending = false
    val wasRunning = isRunning.getAndSet(false)
    webSocketReady = false
    serverReady = false

    val socket = webSocket
    webSocket = null
    socket?.cancel()

    webSocketClient?.dispatcher?.executorService?.shutdown()
    webSocketClient?.connectionPool?.evictAll()
    webSocketClient = null

    stopAudioThread()
    stopStallMonitor()
    unregisterAudioDeviceCallback()
    unregisterRecordingCallback()
    releaseAudioEffects()

    val record = audioRecord
    audioRecord = null
    if (record != null) {
      record.stopSafely()
      record.release()
    }

    restoreAudioMode()

    setForegroundServiceEnabled(false)
    currentProfile = null
    isRecoveringAudio.set(false)

    if (emitClose && wasRunning && reason != null) {
      emitClose(reason)
    }
    activeConversationId = null
  }

  private fun emitStatus(status: String) {
    Log.i(TAG, "status=$status conversation=${activeConversationId ?: "unknown"}")
    emitEvent(
      "status",
      Arguments.createMap().apply {
        putString("status", status)
        activeConversationId?.let { putString("conversationId", it) }
      },
    )
  }

  private fun emitMessage(raw: String) {
    emitEvent(
      "message",
      Arguments.createMap().apply {
        putString("raw", raw)
        activeConversationId?.let { putString("conversationId", it) }
      },
    )
  }

  private fun emitError(message: String) {
    Log.e(TAG, message)
    emitEvent(
      "error",
      Arguments.createMap().apply {
        putString("message", message)
        activeConversationId?.let { putString("conversationId", it) }
      },
    )
  }

  private fun emitClose(reason: String) {
    Log.i(TAG, "close reason=$reason conversation=${activeConversationId ?: "unknown"}")
    emitEvent(
      "close",
      Arguments.createMap().apply {
        putString("reason", reason)
        activeConversationId?.let { putString("conversationId", it) }
      },
    )
  }

  private fun emitEvent(
    eventName: String,
    payload: com.facebook.react.bridge.WritableMap,
  ) {
    if (!hasListeners) {
      return
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun hasRecordAudioPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

  private fun parseOptionalSonioxManualFinalizeSilenceMs(raw: Double?): Int? {
    if (raw == null || !raw.isFinite()) {
      return null
    }
    return Math.floor(raw).toInt()
  }

  override fun onHostResume() {
    // Background capture is intentionally allowed while STT is active.
  }

  override fun onHostPause() {
    // Keep recording active; foreground service + capture policy own the lifetime.
  }

  override fun onHostDestroy() {
    cleanup(reason = "host_destroyed", emitClose = true)
  }

  private fun AudioRecord.stopSafely() {
    try {
      if (recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        stop()
      }
    } catch (_: IllegalStateException) {
      // Ignore stop races during teardown.
    }
  }

  companion object {
    private const val TAG = "NativeSTTModule"
    private const val REQUEST_RECORD_AUDIO = 44_002
    private const val AUDIO_STALL_THRESHOLD_MS = 4_000L
    private const val AUDIO_STALL_CHECK_INTERVAL_MS = 2_000L
    private const val AUDIO_RECOVERY_COOLDOWN_MS = 1_500L
    private const val GRACEFUL_STOP_TIMEOUT_MS = 5_000L
  }
}
