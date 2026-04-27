export function formatLivePhoneDemoUsageDuration(totalSeconds: number | null): string {
  const safeTotalSeconds = typeof totalSeconds === 'number' ? totalSeconds : Number.NaN
  const normalizedTotalSeconds = Number.isFinite(safeTotalSeconds)
    ? Math.max(0, Math.floor(safeTotalSeconds))
    : 0
  const hours = Math.floor(normalizedTotalSeconds / 3600)
  const minutes = Math.floor((normalizedTotalSeconds % 3600) / 60)
  const seconds = normalizedTotalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function formatLivePhoneDemoMessageCount(totalMessages: number | null): string {
  const safeTotalMessages = typeof totalMessages === 'number' ? totalMessages : Number.NaN
  const normalizedTotalMessages = Number.isFinite(safeTotalMessages)
    ? Math.max(0, Math.floor(safeTotalMessages))
    : 0

  return `${normalizedTotalMessages} msg${normalizedTotalMessages === 1 ? '' : 's'}`
}
