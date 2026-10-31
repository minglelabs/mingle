package com.minglelabs.mingle.rn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceAudioJitterBufferTest {
  private fun bytes(from: Int, count: Int) = ByteArray(count) { (from + it).toByte() }

  @Test
  fun `hands out nothing until the prebuffer is filled`() {
    val buffer = DeviceAudioJitterBuffer(capacityBytes = 64, prebufferBytes = 16)
    buffer.write(bytes(0, 8), 8)
    assertEquals(0, buffer.readChunk(ByteArray(8), 8))
    buffer.write(bytes(8, 8), 8)
    val out = ByteArray(8)
    assertEquals(8, buffer.readChunk(out, 8))
    assertArrayEquals(bytes(0, 8), out)
  }

  @Test
  fun `an underrun refills instead of handing out a partial chunk`() {
    val buffer = DeviceAudioJitterBuffer(capacityBytes = 64, prebufferBytes = 8)
    buffer.write(bytes(0, 12), 12)
    assertEquals(8, buffer.readChunk(ByteArray(8), 8))
    // 4 bytes left: not a whole chunk, so nothing (and no splice).
    assertEquals(0, buffer.readChunk(ByteArray(8), 8))
    assertEquals(4, buffer.bufferedBytes)
    buffer.write(bytes(12, 4), 4)
    val out = ByteArray(8)
    assertEquals(8, buffer.readChunk(out, 8))
    // Continuous audio: the 4 held bytes come first, then the new ones.
    assertArrayEquals(bytes(8, 8), out)
  }

  @Test
  fun `overflow drops the oldest audio and wraps around`() {
    val buffer = DeviceAudioJitterBuffer(capacityBytes = 16, prebufferBytes = 0)
    buffer.write(bytes(0, 12), 12)
    buffer.write(bytes(12, 8), 8)
    assertEquals(16, buffer.bufferedBytes)
    val out = ByteArray(16)
    assertEquals(16, buffer.readChunk(out, 16))
    assertArrayEquals(bytes(4, 16), out)
  }

  @Test
  fun `clear forgets audio and priming`() {
    val buffer = DeviceAudioJitterBuffer(capacityBytes = 32, prebufferBytes = 8)
    buffer.write(bytes(0, 16), 16)
    buffer.clear()
    assertEquals(0, buffer.bufferedBytes)
    buffer.write(bytes(0, 4), 4)
    assertEquals(0, buffer.readChunk(ByteArray(4), 4))
  }
}
