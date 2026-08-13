export type EndpointingStrategy = 'fin' | 'end'

export type EndpointingLatencyMetric = {
  strategy: EndpointingStrategy
  finalizeSource: 'soniox_manual' | 'soniox_endpoint'
  providerAudioEndMs: number
  clientFinalReceivedAtMs: number
  estimatedFinalizationLatencyMs: number
}

type BuildEndpointingLatencyMetricInput = {
  finalizeSource?: string
  providerAudioEndMs?: number
  sessionAudioStartedAtMs?: number | null
  clientFinalReceivedAtMs: number
}

export function buildEndpointingLatencyMetric(
  input: BuildEndpointingLatencyMetricInput,
): EndpointingLatencyMetric | null {
  if (input.finalizeSource !== 'soniox_manual' && input.finalizeSource !== 'soniox_endpoint') {
    return null
  }
  if (!Number.isFinite(input.providerAudioEndMs) || !Number.isFinite(input.sessionAudioStartedAtMs)) {
    return null
  }

  const providerAudioEndMs = Math.max(0, Math.floor(input.providerAudioEndMs!))
  const estimatedFinalizationLatencyMs = Math.max(
    0,
    Math.floor(input.clientFinalReceivedAtMs - (input.sessionAudioStartedAtMs! + providerAudioEndMs)),
  )

  return {
    strategy: input.finalizeSource === 'soniox_endpoint' ? 'end' : 'fin',
    finalizeSource: input.finalizeSource,
    providerAudioEndMs,
    clientFinalReceivedAtMs: Math.floor(input.clientFinalReceivedAtMs),
    estimatedFinalizationLatencyMs,
  }
}

export function summarizeEndpointingLatencyMetrics(metrics: EndpointingLatencyMetric[]): {
  count: number
  medianMs: number | null
  p90Ms: number | null
} {
  if (metrics.length === 0) return { count: 0, medianMs: null, p90Ms: null }

  const sorted = metrics
    .map((metric) => metric.estimatedFinalizationLatencyMs)
    .sort((left, right) => left - right)
  const percentile = (percent: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)]

  return {
    count: sorted.length,
    medianMs: percentile(0.5),
    p90Ms: percentile(0.9),
  }
}

export function buildEndpointingLatencyCsv(metrics: EndpointingLatencyMetric[]): string {
  const header = 'strategy,finalize_source,provider_audio_end_ms,client_final_received_at_ms,estimated_finalization_latency_ms'
  const rows = metrics.map((metric) => [
    metric.strategy,
    metric.finalizeSource,
    metric.providerAudioEndMs,
    metric.clientFinalReceivedAtMs,
    metric.estimatedFinalizationLatencyMs,
  ].join(','))
  return [header, ...rows].join('\n')
}
