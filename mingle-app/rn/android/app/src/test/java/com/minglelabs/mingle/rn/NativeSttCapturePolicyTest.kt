package com.minglelabs.mingle.rn

import android.media.AudioManager
import android.media.MediaRecorder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeSttCapturePolicyTest {
  @Test
  fun `only an explicit device audio request leaves the microphone`() {
    assertEquals(NativeSttCaptureSource.DEVICE_AUDIO, NativeSttCaptureSource.fromWire("device_audio"))
    assertEquals(NativeSttCaptureSource.DEVICE_AUDIO, NativeSttCaptureSource.fromWire(" Device_Audio "))
    assertEquals(NativeSttCaptureSource.MICROPHONE, NativeSttCaptureSource.fromWire("microphone"))
    assertEquals(NativeSttCaptureSource.MICROPHONE, NativeSttCaptureSource.fromWire(""))
    assertEquals(NativeSttCaptureSource.MICROPHONE, NativeSttCaptureSource.fromWire("screen"))
    assertEquals(NativeSttCaptureSource.MICROPHONE, NativeSttCaptureSource.fromWire(null))
  }

  @Test
  fun `device audio profile keeps the foreground service and drops voice processing`() {
    for (aecEnabled in listOf(true, false)) {
      val profile = NativeSttCapturePolicy.resolve(aecEnabled, NativeSttCaptureSource.DEVICE_AUDIO)
      assertEquals(NativeSttCaptureSource.DEVICE_AUDIO, profile.captureSource)
      assertEquals("device_audio", profile.label)
      assertTrue(profile.foregroundServiceEnabled)
      assertFalse(profile.aecEnabled)
      assertFalse(profile.noiseSuppressorEnabled)
      assertFalse(profile.privacySensitive)
    }
  }

  @Test
  fun `microphone records as voice recognition with priority and the foreground service`() {
    val profile = NativeSttCapturePolicy.resolve(false, NativeSttCaptureSource.MICROPHONE)
    assertEquals(NativeSttCaptureSource.MICROPHONE, profile.captureSource)
    assertEquals("voice_recognition", profile.label)
    assertEquals(MediaRecorder.AudioSource.VOICE_RECOGNITION, profile.audioSource)
    assertEquals(AudioManager.MODE_NORMAL, profile.audioMode)
    assertTrue(profile.privacySensitive)
    assertTrue(profile.foregroundServiceEnabled)
    assertFalse(profile.aecEnabled)
    assertFalse(profile.noiseSuppressorEnabled)
  }
}
