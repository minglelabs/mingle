package com.minglelabs.mingle.rn

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Plays a clip that is still arriving: headerless 16-bit mono PCM handed over
 * in pieces (`append`), then `end`. Sound starts with the first piece; a gap
 * between pieces plays as silence and the clip goes on when the next arrives.
 *
 * A writer thread feeds the AudioTrack (its writes block while the buffer is
 * full). `onFinished` is called on that thread once everything handed over
 * has been played; `onError` when the track fails. Neither is called after
 * `release`.
 */
class NativeTtsPcmStreamPlayer(
  private val sampleRate: Int,
  attributes: AudioAttributes,
  private val onFinished: () -> Unit,
  private val onError: (String) -> Unit,
) {
  private val track: AudioTrack
  private val queue = LinkedBlockingQueue<ByteArray>()
  private val released = AtomicBoolean(false)
  private val writer: Thread

  @Volatile
  var writtenBytes: Long = 0
    private set

  init {
    val minBuffer = AudioTrack.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    ).coerceAtLeast(sampleRate / 10 * BYTES_PER_FRAME)
    track = AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build(),
      )
      .setTransferMode(AudioTrack.MODE_STREAM)
      // Small on purpose: sound starts once the buffer first fills.
      .setBufferSizeInBytes(minBuffer)
      .build()
    check(track.state == AudioTrack.STATE_INITIALIZED) { "AudioTrack failed to initialize" }
    track.play()
    writer = Thread({ runWriter() }, "native-tts-pcm-stream").apply {
      isDaemon = true
      start()
    }
  }

  fun append(pcm: ByteArray) {
    if (released.get() || pcm.isEmpty()) return
    queue.put(pcm)
  }

  /** No more pieces will come; `onFinished` follows once the rest has played. */
  fun end() {
    if (released.get()) return
    queue.put(END)
  }

  fun release() {
    if (!released.compareAndSet(false, true)) return
    queue.clear()
    queue.offer(END)
    writer.interrupt()
    runCatching { track.pause() }
    runCatching { track.flush() }
    runCatching { track.release() }
  }

  private fun runWriter() {
    try {
      while (!released.get()) {
        val piece = queue.take()
        if (piece === END) break
        // Whole samples only; the web side never sends half of one.
        val length = piece.size - (piece.size % BYTES_PER_FRAME)
        var offset = 0
        while (offset < length && !released.get()) {
          val written = track.write(piece, offset, length - offset)
          if (written < 0) {
            if (!released.get()) onError("audio_track_write_error($written)")
            return
          }
          offset += written
          writtenBytes += written
        }
      }
      if (released.get()) return
      waitUntilPlayed()
      if (!released.get()) onFinished()
    } catch (_: InterruptedException) {
      // Released while waiting.
    } catch (error: Throwable) {
      Log.w(TAG, "stream writer failed", error)
      if (!released.get()) onError("audio_track_error(${error.message ?: "unknown"})")
    }
  }

  /**
   * Blocks until what was written has been played. `stop()` lets a stream
   * track drain its buffer (a short clip may never fill it) but also resets
   * the playback head, so the wait is timed from the head position before it.
   */
  private fun waitUntilPlayed() {
    val totalFrames = writtenBytes / BYTES_PER_FRAME
    val head = track.playbackHeadPosition.toLong() and 0xFFFFFFFFL
    val remainingMs = (totalFrames - head).coerceAtLeast(0) * 1000 / sampleRate + DRAIN_MARGIN_MS
    runCatching { track.stop() }
    var waitedMs = 0L
    while (!released.get() && waitedMs < remainingMs) {
      Thread.sleep(POLL_MS)
      waitedMs += POLL_MS
    }
  }

  companion object {
    private const val TAG = "NativeTTS"
    private const val BYTES_PER_FRAME = 2
    private const val POLL_MS = 20L
    // Output latency left after the last frame was handed to the mixer.
    private const val DRAIN_MARGIN_MS = 80L
    private val END = ByteArray(0)
  }
}
