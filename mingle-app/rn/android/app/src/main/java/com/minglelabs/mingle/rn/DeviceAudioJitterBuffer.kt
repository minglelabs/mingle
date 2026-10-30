package com.minglelabs.mingle.rn

/**
 * Holds other-app audio between the playback capture, which delivers in
 * bursts, and the microphone, which paces the mixed stream.
 *
 * Audio is handed out only in whole chunks once [prebufferBytes] have been
 * collected. On an underrun it hands out nothing and refills first: splicing
 * partial reads into fixed-size chunks would put short silences inside the
 * other app's speech and garble recognition. On overflow the oldest audio is
 * dropped so the delay never grows past [capacityBytes].
 */
class DeviceAudioJitterBuffer(
  private val capacityBytes: Int,
  private val prebufferBytes: Int,
) {
  private val data = ByteArray(capacityBytes)
  private var start = 0
  private var size = 0
  private var primed = false

  val bufferedBytes: Int
    get() = size

  fun write(source: ByteArray, length: Int) {
    var offset = 0
    var remaining = minOf(length, source.size) and 1.inv()
    if (remaining > capacityBytes) {
      offset = remaining - capacityBytes
      remaining = capacityBytes
    }
    val overflow = size + remaining - capacityBytes
    if (overflow > 0) {
      drop(overflow)
    }
    var end = (start + size) % capacityBytes
    while (remaining > 0) {
      val run = minOf(remaining, capacityBytes - end)
      System.arraycopy(source, offset, data, end, run)
      offset += run
      remaining -= run
      size += run
      end = (end + run) % capacityBytes
    }
  }

  /**
   * Copies exactly [length] bytes into [target] and returns [length], or
   * returns 0 (copying nothing) while priming or after an underrun.
   */
  fun readChunk(target: ByteArray, length: Int): Int {
    val wanted = minOf(length, target.size) and 1.inv()
    if (wanted <= 0) return 0
    if (!primed) {
      if (size < maxOf(prebufferBytes, wanted)) return 0
      primed = true
    }
    if (size < wanted) {
      primed = false
      return 0
    }
    var copied = 0
    while (copied < wanted) {
      val run = minOf(wanted - copied, capacityBytes - start)
      System.arraycopy(data, start, target, copied, run)
      copied += run
      start = (start + run) % capacityBytes
      size -= run
    }
    return wanted
  }

  fun clear() {
    start = 0
    size = 0
    primed = false
  }

  private fun drop(bytes: Int) {
    val count = minOf(bytes + (bytes and 1), size)
    start = (start + count) % capacityBytes
    size -= count
  }
}
