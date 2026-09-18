// Shared by visible/hidden hooks for the same account, namespace and room.
// Completion does not cancel a user's Stop intent; only a new Start does.
export function createNativeStopIntentRegistry() {
  const stopped = new Map<string, number>()
  return {
    stop(key: string, timeoutMs = 5000) {
      stopped.delete(key)
      stopped.set(key, Date.now() + timeoutMs)
      // Bound retained room intents without timers that could revive a session.
      if (stopped.size > 128) stopped.delete(stopped.keys().next().value!)
    },
    start(key: string) { stopped.delete(key) },
    complete(key: string) { if (stopped.has(key)) stopped.set(key, 0) },
    isPending(key: string) { return (stopped.get(key) ?? 0) > Date.now() },
    isStopped(key: string) { return stopped.has(key) },
  }
}

export const nativeStopIntent = createNativeStopIntentRegistry()
