package com.minglelabs.mingle.rn

import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.media.AudioManager

data class NativeSttCaptureProfile(
  val label: String,
  val audioSource: Int,
  val audioMode: Int,
  val privacySensitive: Boolean,
  val foregroundServiceEnabled: Boolean,
  val aecEnabled: Boolean,
  val noiseSuppressorEnabled: Boolean,
)

object NativeSttCapturePolicy {
  // Keep the default policy isolated in one file so capture behavior can be
  // re-tuned later without touching the bridge or recorder implementation.
  private const val DEFAULT_PROFILE = "priority_translation"

  private val preferredSampleRates = intArrayOf(48_000, 44_100, 16_000)

  fun resolve(aecEnabled: Boolean): NativeSttCaptureProfile {
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
