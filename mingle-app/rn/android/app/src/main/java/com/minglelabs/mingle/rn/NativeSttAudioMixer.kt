package com.minglelabs.mingle.rn

/**
 * Mixes 16-bit little-endian mono PCM for device-audio mode, where the
 * microphone and the sound other apps play feed one STT stream.
 */
object NativeSttAudioMixer {
  /**
   * Adds the first [addendLength] bytes of [addend] into the first
   * [targetLength] bytes of [target], sample by sample, clamping each sum to
   * the 16-bit range. Only whole samples both buffers hold are mixed; the rest
   * of [target] is left as it is. Returns the number of bytes mixed.
   */
  fun mixInto(
    target: ByteArray,
    targetLength: Int,
    addend: ByteArray,
    addendLength: Int,
  ): Int {
    val length = minOf(targetLength, addendLength, target.size, addend.size) and 1.inv()
    var index = 0
    while (index < length) {
      val sum = readSample(target, index) + readSample(addend, index)
      val clamped = sum.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
      target[index] = (clamped and 0xFF).toByte()
      target[index + 1] = ((clamped shr 8) and 0xFF).toByte()
      index += 2
    }
    return length
  }

  private fun readSample(buffer: ByteArray, index: Int): Int =
    ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xFF)).toShort().toInt()
}
