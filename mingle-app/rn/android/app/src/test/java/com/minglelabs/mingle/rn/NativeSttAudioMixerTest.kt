package com.minglelabs.mingle.rn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeSttAudioMixerTest {
  private fun pcm(vararg samples: Int): ByteArray {
    val bytes = ByteArray(samples.size * 2)
    samples.forEachIndexed { i, sample ->
      bytes[i * 2] = (sample and 0xFF).toByte()
      bytes[i * 2 + 1] = ((sample shr 8) and 0xFF).toByte()
    }
    return bytes
  }

  @Test
  fun `adds samples including negatives`() {
    val target = pcm(100, -200, 0)
    val mixed = NativeSttAudioMixer.mixInto(target, target.size, pcm(50, -50, -1), 6)
    assertEquals(6, mixed)
    assertArrayEquals(pcm(150, -250, -1), target)
  }

  @Test
  fun `clamps to the 16-bit range`() {
    val target = pcm(30_000, -30_000)
    NativeSttAudioMixer.mixInto(target, target.size, pcm(10_000, -10_000), 4)
    assertArrayEquals(pcm(32_767, -32_768), target)
  }

  @Test
  fun `mixes only whole samples both buffers hold`() {
    val target = pcm(1, 2, 3)
    // 3 bytes of addend = one whole sample plus half of the next.
    val mixed = NativeSttAudioMixer.mixInto(target, target.size, pcm(10, 20, 30), 3)
    assertEquals(2, mixed)
    assertArrayEquals(pcm(11, 2, 3), target)
  }

  @Test
  fun `an empty addend leaves the target untouched`() {
    val target = pcm(7, -7)
    assertEquals(0, NativeSttAudioMixer.mixInto(target, target.size, ByteArray(0), 0))
    assertArrayEquals(pcm(7, -7), target)
  }
}
