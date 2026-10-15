package com.minglelabs.mingle.rn

import android.content.Context
import android.content.pm.ApplicationInfo
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * QA-only microphone substitute for testing STT and translation without a
 * person speaking. While a fixture is armed, the capture thread keeps its real
 * AudioRecord pace and chunk sizes, but the PCM it sends is the fixture
 * (framed by leading/trailing silence) and then silence until the session
 * ends. Only debuggable builds compiled with MINGLE_QA_BRIDGE_ENABLED=1 can
 * arm it, which excludes every Play Store build.
 */
class NativeSttQaAudioInjector {
  private enum class Phase(val label: String) {
    IDLE("idle"),
    ARMED("armed"),
    PLAYING("playing"),
    FINISHED("finished"),
  }

  private class Fixture(
    val id: String,
    val samples: FloatArray,
    val sampleRate: Int,
    val leadingSilenceMs: Int,
    val trailingSilenceMs: Int,
  )

  class DecodedAudio(val samples: FloatArray, val sampleRate: Int)

  class Chunk(val events: List<Map<String, Any>>)

  private val lock = Any()
  private var phase = Phase.IDLE
  private var fixture: Fixture? = null
  private var resampledRate = 0
  private var resampled = FloatArray(0)
  private var playedFrames = 0L
  private var speechStartReported = false
  private var speechEndReported = false

  fun arm(
    id: String,
    audio: DecodedAudio,
    leadingSilenceMs: Int,
    trailingSilenceMs: Int,
  ): Map<String, Any> = synchronized(lock) {
    fixture = Fixture(id, audio.samples, audio.sampleRate, max(0, leadingSilenceMs), max(0, trailingSilenceMs))
    phase = Phase.ARMED
    resampledRate = 0
    resampled = FloatArray(0)
    playedFrames = 0L
    speechStartReported = false
    speechEndReported = false
    mapOf(
      "phase" to Phase.ARMED.label,
      "fixtureId" to id,
      "durationMs" to (audio.samples.size * 1_000.0 / audio.sampleRate).roundToInt(),
      "sourceSampleRate" to audio.sampleRate,
      "leadingSilenceMs" to max(0, leadingSilenceMs),
      "trailingSilenceMs" to max(0, trailingSilenceMs),
      "atMs" to System.currentTimeMillis().toDouble(),
    )
  }

  /** Returns the event to report when an armed or playing fixture is dropped. */
  fun clear(reason: String): Map<String, Any>? = synchronized(lock) {
    if (phase == Phase.IDLE) return null
    val event = mapOf(
      "phase" to "cleared",
      "reason" to reason,
      "previousPhase" to phase.label,
      "fixtureId" to (fixture?.id ?: ""),
      "atMs" to System.currentTimeMillis().toDouble(),
    )
    phase = Phase.IDLE
    fixture = null
    resampled = FloatArray(0)
    resampledRate = 0
    event
  }

  /**
   * A stopped session consumes a fixture it already started; one that is only
   * armed stays armed for the next session.
   */
  fun sessionEnded(): Map<String, Any>? {
    val started = synchronized(lock) { phase == Phase.PLAYING || phase == Phase.FINISHED }
    return if (started) clear("session_ended") else null
  }

  /**
   * Overwrites [byteCount] bytes of little-endian PCM16 mono microphone audio
   * in [buffer]. Returns null, leaving the buffer untouched, when no fixture is
   * engaged.
   */
  fun fillPcm16(
    buffer: ByteArray,
    byteCount: Int,
    sampleRate: Int,
    bufferStartWallMs: Double,
  ): Chunk? = synchronized(lock) {
    val current = fixture ?: return null
    if (phase == Phase.IDLE || byteCount <= 0 || sampleRate <= 0) return null
    val frameCount = byteCount / 2
    val events = mutableListOf<Map<String, Any>>()
    if (resampledRate != sampleRate) {
      // AudioRecord can be recreated at another rate after a route change.
      // Keep the playhead at the same point in time.
      if (resampledRate > 0) {
        playedFrames = (playedFrames.toDouble() * sampleRate / resampledRate).roundToLong()
      }
      resampled = resample(current.samples, current.sampleRate, sampleRate)
      resampledRate = sampleRate
    }
    if (phase == Phase.ARMED) {
      phase = Phase.PLAYING
      playedFrames = 0L
      events += mapOf(
        "phase" to "started",
        "fixtureId" to current.id,
        "sampleRate" to sampleRate,
        "atMs" to bufferStartWallMs,
      )
    }

    val leadingFrames = current.leadingSilenceMs.toLong() * sampleRate / 1_000
    val speechFrames = resampled.size.toLong()
    val speechEndFrame = leadingFrames + speechFrames
    val totalFrames = speechEndFrame + current.trailingSilenceMs.toLong() * sampleRate / 1_000
    val chunkStartFrame = playedFrames
    val chunkEndFrame = chunkStartFrame + frameCount
    val out = ByteBuffer.wrap(buffer, 0, frameCount * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (index in 0 until frameCount) {
      val speechIndex = chunkStartFrame + index - leadingFrames
      val sample = if (phase == Phase.PLAYING && speechIndex in 0 until speechFrames) {
        resampled[speechIndex.toInt()]
      } else {
        0f
      }
      out.putShort(toPcm16(sample))
    }
    if (phase != Phase.PLAYING) {
      return Chunk(events)
    }

    fun frameWallMs(frame: Long): Double =
      bufferStartWallMs + (frame - chunkStartFrame) * 1_000.0 / sampleRate
    if (!speechStartReported && chunkEndFrame > leadingFrames) {
      speechStartReported = true
      events += mapOf("phase" to "speech_started", "fixtureId" to current.id, "atMs" to frameWallMs(leadingFrames))
    }
    if (!speechEndReported && chunkEndFrame >= speechEndFrame) {
      speechEndReported = true
      events += mapOf("phase" to "speech_ended", "fixtureId" to current.id, "atMs" to frameWallMs(speechEndFrame))
    }
    playedFrames = chunkEndFrame
    if (chunkEndFrame >= totalFrames) {
      phase = Phase.FINISHED
      events += mapOf("phase" to "finished", "fixtureId" to current.id, "atMs" to frameWallMs(totalFrames))
    }
    Chunk(events)
  }

  companion object {
    const val MAX_FIXTURE_DURATION_SEC = 60
    const val MAX_FIXTURE_BYTES = 20 * 1_024 * 1_024

    fun isAllowed(context: Context): Boolean =
      BuildConfig.MINGLE_QA_BRIDGE_ENABLED == "1" &&
        (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    private fun toPcm16(sample: Float): Short {
      val clamped = min(1f, max(-1f, sample))
      return if (clamped < 0) (clamped * 32_768f).toInt().toShort() else (clamped * 32_767f).toInt().toShort()
    }

    /** Decodes a RIFF/WAVE file (PCM 8/16/24/32-bit or IEEE float) to mono floats. */
    fun decodeWav(bytes: ByteArray): DecodedAudio {
      val data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      require(bytes.size >= 12 && String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" &&
        String(bytes, 8, 4, Charsets.US_ASCII) == "WAVE") { "unsupported_audio_container" }
      var formatTag = 0
      var channels = 0
      var sampleRate = 0
      var bitsPerSample = 0
      var dataOffset = -1
      var dataSize = 0
      var offset = 12
      while (offset + 8 <= bytes.size) {
        val chunkId = String(bytes, offset, 4, Charsets.US_ASCII)
        val chunkSize = data.getInt(offset + 4)
        val body = offset + 8
        if (chunkSize < 0 || body > bytes.size) break
        when (chunkId) {
          "fmt " -> {
            formatTag = data.getShort(body).toInt() and 0xFFFF
            channels = data.getShort(body + 2).toInt() and 0xFFFF
            sampleRate = data.getInt(body + 4)
            bitsPerSample = data.getShort(body + 14).toInt() and 0xFFFF
            if (formatTag == 0xFFFE && chunkSize >= 26) {
              // WAVE_FORMAT_EXTENSIBLE: the sub-format GUID starts with the tag.
              formatTag = data.getShort(body + 24).toInt() and 0xFFFF
            }
          }
          "data" -> {
            dataOffset = body
            dataSize = min(chunkSize, bytes.size - body)
          }
        }
        offset = body + chunkSize + (chunkSize and 1)
      }
      require(dataOffset >= 0 && channels > 0 && sampleRate > 0) { "invalid_wav_header" }
      val isFloat = formatTag == 3 && bitsPerSample == 32
      require(isFloat || (formatTag == 1 && bitsPerSample in setOf(8, 16, 24, 32))) { "unsupported_wav_encoding" }
      val bytesPerSample = bitsPerSample / 8
      val frames = dataSize / (bytesPerSample * channels)
      require(frames > 0) { "empty_audio_file" }
      require(frames <= MAX_FIXTURE_DURATION_SEC * sampleRate) { "audio_file_too_long" }

      val mono = FloatArray(frames)
      for (frame in 0 until frames) {
        var sum = 0f
        for (channel in 0 until channels) {
          val position = dataOffset + (frame * channels + channel) * bytesPerSample
          sum += when {
            isFloat -> data.getFloat(position)
            bitsPerSample == 8 -> ((bytes[position].toInt() and 0xFF) - 128) / 128f
            bitsPerSample == 16 -> data.getShort(position) / 32_768f
            bitsPerSample == 24 -> {
              val value = (bytes[position].toInt() and 0xFF) or
                ((bytes[position + 1].toInt() and 0xFF) shl 8) or
                (bytes[position + 2].toInt() shl 16)
              value / 8_388_608f
            }
            else -> data.getInt(position) / 2_147_483_648f
          }
        }
        mono[frame] = sum / channels
      }
      return DecodedAudio(mono, sampleRate)
    }

    /**
     * Linear-interpolation resampler. Downsampling first averages each output
     * sample's source window so speech energy above the new Nyquist rate does
     * not fold back into the band the recognizer listens to.
     */
    fun resample(samples: FloatArray, sourceRate: Int, targetRate: Int): FloatArray {
      if (samples.isEmpty() || sourceRate == targetRate) return samples
      val ratio = sourceRate.toDouble() / targetRate
      val outputSize = floor(samples.size / ratio).toInt()
      val output = FloatArray(outputSize)
      for (index in 0 until outputSize) {
        val position = index * ratio
        if (ratio > 1.0) {
          val start = position.toInt()
          val end = min(samples.size, (position + ratio).toInt().coerceAtLeast(start + 1))
          var sum = 0f
          for (source in start until end) sum += samples[source]
          output[index] = sum / (end - start)
        } else {
          val base = position.toInt()
          val next = min(samples.size - 1, base + 1)
          val fraction = (position - base).toFloat()
          output[index] = samples[base] + (samples[next] - samples[base]) * fraction
        }
      }
      return output
    }
  }
}
