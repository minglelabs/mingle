package com.minglelabs.mingle.rn

import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.media.AudioManager

enum class NativeSttCaptureSource(val wireValue: String) {
  MICROPHONE("microphone"),
  // Sound other apps play on this device (AudioPlaybackCapture), not the mic.
  DEVICE_AUDIO("device_audio");

  companion object {
    // Anything but an explicit device-audio request captures the microphone.
    fun fromWire(raw: String?): NativeSttCaptureSource =
      if (raw?.trim()?.lowercase() == DEVICE_AUDIO.wireValue) DEVICE_AUDIO else MICROPHONE
  }
}

data class NativeSttCaptureProfile(
  val label: String,
  val audioSource: Int,
  val audioMode: Int,
  val privacySensitive: Boolean,
  val foregroundServiceEnabled: Boolean,
  val aecEnabled: Boolean,
  val noiseSuppressorEnabled: Boolean,
  val captureSource: NativeSttCaptureSource = NativeSttCaptureSource.MICROPHONE,
)

object NativeSttCapturePolicy {
  // Keep the default policy isolated in one file so capture behavior can be
  // re-tuned later without touching the bridge or recorder implementation.
  private const val DEFAULT_PROFILE = "priority_translation"

  private val preferredSampleRates = intArrayOf(48_000, 44_100, 16_000)

  fun resolve(
    aecEnabled: Boolean,
    captureSource: NativeSttCaptureSource = NativeSttCaptureSource.MICROPHONE,
  ): NativeSttCaptureProfile {
    if (captureSource == NativeSttCaptureSource.DEVICE_AUDIO) {
      return NativeSttCaptureProfile(
        label = "device_audio",
        // Unused: a playback-capture AudioRecord takes no audio source.
        audioSource = MediaRecorder.AudioSource.DEFAULT,
        audioMode = AudioManager.MODE_NORMAL,
        privacySensitive = false,
        // MediaProjection needs a running foreground service of its own type.
        foregroundServiceEnabled = true,
        // The capture is a digital copy of other apps' playback with this app's
        // own sound excluded, so there is no echo or room noise to remove.
        aecEnabled = false,
        noiseSuppressorEnabled = false,
        captureSource = NativeSttCaptureSource.DEVICE_AUDIO,
      )
    }
    return when (DEFAULT_PROFILE) {
      "standard_recognition" -> NativeSttCaptureProfile(
        label = "standard_recognition",
        audioSource = MediaRecorder.AudioSource.VOICE_RECOGNITION,
        audioMode = AudioManager.MODE_NORMAL,
        privacySensitive = false,
        foregroundServiceEnabled = false,
        aecEnabled = aecEnabled && AcousticEchoCanceler.isAvailable(),
        noiseSuppressorEnabled = aecEnabled && NoiseSuppressor.isAvailable(),
      )
      else -> NativeSttCaptureProfile(
        label = "priority_translation",
        audioSource = MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        // Use MODE_NORMAL (not MODE_IN_COMMUNICATION) to avoid pausing background media audio (e.g. Spotify)
        // while STT is active. MODE_IN_COMMUNICATION triggers system-level VoIP routing which silences
        // media playback from other apps.
        audioMode = AudioManager.MODE_NORMAL,
        // privacySensitive=true gives Mingle highest mic priority on Android 11+, ensuring STT always
        // receives audio even if another app (e.g. Discord) is also trying to capture.
        // Trade-off: the other app's mic will be silenced while Mingle is recording.
        privacySensitive = true,
        foregroundServiceEnabled = true,
        aecEnabled = aecEnabled && AcousticEchoCanceler.isAvailable(),
        noiseSuppressorEnabled = aecEnabled && NoiseSuppressor.isAvailable(),
      )
    }
  }

  fun preferredSampleRates(
    currentSampleRate: Int?,
  ): IntArray {
    val ordered = linkedSetOf<Int>()
    if (currentSampleRate != null && currentSampleRate > 0) {
      ordered.add(currentSampleRate)
    }
    preferredSampleRates.forEach { ordered.add(it) }
    return ordered.toIntArray()
  }
}
