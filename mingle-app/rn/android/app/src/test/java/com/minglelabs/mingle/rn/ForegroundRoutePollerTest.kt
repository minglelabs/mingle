package com.minglelabs.mingle.rn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundRoutePollerTest {
  private class FakeScheduler {
    private val tasks = linkedMapOf<Runnable, Long>()

    fun schedule(task: Runnable, delayMs: Long) {
      tasks[task] = delayMs
    }

    fun cancel(task: Runnable) {
      tasks.remove(task)
    }

    fun runNext(): Long? {
      val entry = tasks.entries.firstOrNull() ?: return null
      tasks.remove(entry.key)
      entry.key.run()
      return entry.value
    }

    fun hasPendingTask(): Boolean = tasks.isNotEmpty()
  }

  @Test
  fun `poll reports route selection changes without device callbacks`() {
    val scheduler = FakeScheduler()
    var current = ForegroundRouteSample(listOf("BluetoothA2DPOutput"), "bluetooth")
    val emitted = mutableListOf<String>()
    val poller = ForegroundRoutePoller(
      intervalMs = 250,
      schedule = scheduler::schedule,
      cancel = scheduler::cancel,
      sample = { current },
      onChange = emitted::add,
    )

    poller.start(initialKey = listOf("BluetoothA2DPOutput"))
    current = ForegroundRouteSample(listOf("Speaker"), "speaker")
    assertEquals(250L, scheduler.runNext())
    assertEquals(listOf("speaker"), emitted)
    scheduler.runNext()
    assertEquals(listOf("speaker"), emitted)
    assertTrue(scheduler.hasPendingTask())
  }

  @Test
  fun `query failure can emit a fail closed sample and later recover`() {
    val scheduler = FakeScheduler()
    var reading: ForegroundRouteSample<String, String>? = ForegroundRouteSample("bluetooth", "bluetooth")
    val emitted = mutableListOf<String>()
    val poller = ForegroundRoutePoller(
      intervalMs = 250,
      schedule = scheduler::schedule,
      cancel = scheduler::cancel,
      sample = { reading ?: ForegroundRouteSample("unknown", "unknown") },
      onChange = emitted::add,
    )

    poller.start(initialKey = "bluetooth")
    reading = null // a failed query is mapped by the module to false/unknown
    scheduler.runNext()
    assertEquals(listOf("unknown"), emitted)

    reading = ForegroundRouteSample("bluetooth", "bluetooth")
    scheduler.runNext()
    assertEquals(listOf("unknown", "bluetooth"), emitted)
  }

  @Test
  fun `unchanged route is quiet and pause and destroy cancel future polls`() {
    val scheduler = FakeScheduler()
    val emitted = mutableListOf<String>()
    val poller = ForegroundRoutePoller(
      intervalMs = 250,
      schedule = scheduler::schedule,
      cancel = scheduler::cancel,
      sample = { ForegroundRouteSample("bluetooth", "bluetooth") },
      onChange = emitted::add,
    )

    poller.start(initialKey = "bluetooth")
    scheduler.runNext()
    assertTrue(emitted.isEmpty())
    assertTrue(scheduler.hasPendingTask())

    poller.stop()
    assertFalse(scheduler.hasPendingTask())
    poller.start(initialKey = "speaker")
    assertTrue(scheduler.hasPendingTask())
    poller.stop() // host destroy can be followed by another resume
    poller.start(initialKey = "speaker")
    assertTrue(scheduler.hasPendingTask())

    poller.dispose()
    assertFalse(scheduler.hasPendingTask())
    poller.start(initialKey = "speaker")
    assertFalse(scheduler.hasPendingTask())
  }
}
