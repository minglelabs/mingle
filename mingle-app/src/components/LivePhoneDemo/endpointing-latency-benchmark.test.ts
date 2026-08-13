import { describe, expect, it } from 'vitest'

import {
  buildEndpointingLatencyMetric,
  buildEndpointingLatencyCsv,
  summarizeEndpointingLatencyMetrics,
} from './endpointing-latency-benchmark'

describe('endpointing latency benchmark', () => {
  it('measures the client final receipt delay from Soniox audio end', () => {
    expect(buildEndpointingLatencyMetric({
      finalizeSource: 'soniox_endpoint',
      providerAudioEndMs: 1_250,
      sessionAudioStartedAtMs: 10_000,
      clientFinalReceivedAtMs: 11_900,
    })).toEqual({
      strategy: 'end',
      finalizeSource: 'soniox_endpoint',
      providerAudioEndMs: 1_250,
      clientFinalReceivedAtMs: 11_900,
      estimatedFinalizationLatencyMs: 650,
    })
  })

  it('does not collect a metric without a provider audio endpoint', () => {
    expect(buildEndpointingLatencyMetric({
      finalizeSource: 'soniox_manual',
      providerAudioEndMs: undefined,
      sessionAudioStartedAtMs: 10_000,
      clientFinalReceivedAtMs: 11_900,
    })).toBeNull()
  })

  it('summarizes and exports metrics without transcript text', () => {
    const metrics = [
      { strategy: 'fin' as const, finalizeSource: 'soniox_manual', providerAudioEndMs: 1_000, clientFinalReceivedAtMs: 1, estimatedFinalizationLatencyMs: 2_100 },
      { strategy: 'fin' as const, finalizeSource: 'soniox_manual', providerAudioEndMs: 2_000, clientFinalReceivedAtMs: 2, estimatedFinalizationLatencyMs: 1_900 },
      { strategy: 'fin' as const, finalizeSource: 'soniox_manual', providerAudioEndMs: 3_000, clientFinalReceivedAtMs: 3, estimatedFinalizationLatencyMs: 2_000 },
    ]

    expect(summarizeEndpointingLatencyMetrics(metrics)).toEqual({ count: 3, medianMs: 2_000, p90Ms: 2_100 })
    expect(buildEndpointingLatencyCsv(metrics)).toBe([
      'strategy,finalize_source,provider_audio_end_ms,client_final_received_at_ms,estimated_finalization_latency_ms',
      'fin,soniox_manual,1000,1,2100',
      'fin,soniox_manual,2000,2,1900',
      'fin,soniox_manual,3000,3,2000',
    ].join('\n'))
  })
})
