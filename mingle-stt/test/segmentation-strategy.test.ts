import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateManualFinalizeDecision,
  evaluateProviderEndpointDecision,
  ManualFinalizeCarryController,
  partitionSonioxTokensAtFirstBoundary,
  resolveSonioxBoundaryHandling,
  resolveSonioxEndpointDelayMs,
  resolveSonioxEndpointDetectionConfig,
  resolveSonioxEndpointLatencyAdjustmentLevel,
  resolveSonioxEndpointSensitivity,
  resolveSonioxEndpointTuningProfile,
  resolveSonioxSegmentationRuntime,
  selectSonioxBoundarySpeakerIds,
} from '../segmentation-strategy';

test('resolves requested and effective segmentation modes once', () => {
  assert.deepEqual(resolveSonioxSegmentationRuntime('fin', 700), {
    requested: 'fin',
    effective: 'fin',
    endpointDetection: false,
    carryPolicy: 'manual-finalize-snapshot',
    endpointDelayMs: 700,
  });
  assert.deepEqual(resolveSonioxSegmentationRuntime('llm', 700), {
    requested: 'llm',
    effective: 'fin',
    endpointDetection: false,
    carryPolicy: 'manual-finalize-snapshot',
    endpointDelayMs: 700,
  });
  assert.deepEqual(resolveSonioxSegmentationRuntime('end', 700), {
    requested: 'end',
    effective: 'end',
    endpointDetection: true,
    carryPolicy: 'none',
    endpointDelayMs: 700,
  });
});

test('enables Soniox semantic endpoint detection for the end strategy', () => {
  assert.deepEqual(resolveSonioxEndpointDetectionConfig('end', 1500), {
    enable_endpoint_detection: true,
    endpoint_latency_adjustment_level: 0,
    endpoint_sensitivity: 0,
    max_endpoint_delay_ms: 1500,
  });
});

test('maps the five endpoint tuning steps from shorter to longer speech splits', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((step) => resolveSonioxEndpointTuningProfile(step)),
    [
      { step: 0, latencyAdjustmentLevel: 3, sensitivity: 1.0 },
      { step: 1, latencyAdjustmentLevel: 2, sensitivity: 0.8 },
      { step: 2, latencyAdjustmentLevel: 1, sensitivity: 0.5 },
      { step: 3, latencyAdjustmentLevel: 0, sensitivity: 0.0 },
      { step: 4, latencyAdjustmentLevel: 0, sensitivity: -1.0 },
    ],
  );
  assert.deepEqual(resolveSonioxEndpointTuningProfile('invalid'), {
    step: 2,
    latencyAdjustmentLevel: 1,
    sensitivity: 0.5,
  });
});

test('uses a per-session endpoint tuning profile in the Soniox request config', () => {
  assert.deepEqual(
    resolveSonioxEndpointDetectionConfig('end', 1800, {
      endpointTuningProfile: resolveSonioxEndpointTuningProfile(4),
    }),
    {
      enable_endpoint_detection: true,
      endpoint_latency_adjustment_level: 0,
      endpoint_sensitivity: -1.0,
      max_endpoint_delay_ms: 1800,
    },
  );
});

test('keeps Soniox endpoint detection disabled for the manual finalize strategy', () => {
  assert.deepEqual(resolveSonioxEndpointDetectionConfig('fin', 1500), {
    enable_endpoint_detection: false,
  });
});

test('uses the per-session endpoint delay and keeps the server-safe bounds', () => {
  assert.equal(resolveSonioxEndpointDelayMs('end', 500), 500);
  assert.equal(resolveSonioxEndpointDelayMs('end', 1800), 1800);
  assert.equal(resolveSonioxEndpointDelayMs('end', 3200), 3000);
  assert.equal(resolveSonioxEndpointDelayMs('end', 200), 500);
  assert.equal(resolveSonioxEndpointDelayMs('end', Number.NaN), 3000);
  assert.equal(resolveSonioxEndpointDelayMs('fin', 500), 500);
});

test('clamps endpoint latency adjustment level to Soniox supported values', () => {
  assert.equal(resolveSonioxEndpointLatencyAdjustmentLevel('3'), 3);
  assert.equal(resolveSonioxEndpointLatencyAdjustmentLevel('9'), 3);
  assert.equal(resolveSonioxEndpointLatencyAdjustmentLevel('-1'), 0);
  assert.equal(resolveSonioxEndpointLatencyAdjustmentLevel('invalid'), 0);
});

test('clamps endpoint sensitivity to Soniox supported values', () => {
  assert.equal(resolveSonioxEndpointSensitivity('1'), 1);
  assert.equal(resolveSonioxEndpointSensitivity('2'), 1);
  assert.equal(resolveSonioxEndpointSensitivity('-2'), -1);
  assert.equal(resolveSonioxEndpointSensitivity('invalid'), 0);
});

test('manual finalize splits only text beyond the request snapshot into carry', () => {
  assert.deepEqual(evaluateManualFinalizeDecision({
    mergedSnapshot: 'hello world',
    snapshotTextLen: 'hello'.length,
  }), {
    action: 'finalize',
    kind: 'manual-finalize',
    finalText: 'hello',
    carryText: 'world',
    usedSnapshotBoundary: true,
  });
});

test('manual finalize snaps a boundary forward instead of splitting a word', () => {
  assert.deepEqual(evaluateManualFinalizeDecision({
    mergedSnapshot: 'hello world',
    snapshotTextLen: 3,
  }), {
    action: 'finalize',
    kind: 'manual-finalize',
    finalText: 'hello',
    carryText: 'world',
    usedSnapshotBoundary: true,
  });
});

test('provider endpoint decisions cannot return carry', () => {
  const decision = evaluateProviderEndpointDecision({ mergedSnapshot: 'hello world' });
  assert.deepEqual(decision, {
    action: 'finalize',
    kind: 'provider-endpoint',
    finalText: 'hello world',
  });
  assert.equal('carryText' in decision, false);
});

test('partitions provider tokens in order around an endpoint marker', () => {
  const tokens = [
    { text: 'hello', is_final: true, speaker: '1' },
    { text: '<end>', is_final: true, speaker: '1' },
    { text: 'next', is_final: false, speaker: '2' },
  ];
  const partition = partitionSonioxTokensAtFirstBoundary(tokens);

  assert.deepEqual(partition.before, [tokens[0]]);
  assert.deepEqual(partition.marker, tokens[1]);
  assert.equal(partition.markerKind, 'end');
  assert.deepEqual(partition.after, [tokens[2]]);
});

test('preserves text around an anomalous combined marker token', () => {
  const partition = partitionSonioxTokensAtFirstBoundary([
    {
      text: 'before<fin>after',
      start_ms: 100,
      end_ms: 200,
      is_final: true,
      speaker: '1',
    },
  ]);

  assert.deepEqual(partition.before, [
    {
      text: 'before', start_ms: 100, end_ms: 200, is_final: true, speaker: '1',
    },
  ]);
  assert.deepEqual(partition.marker, {
    text: '<fin>', start_ms: 100, end_ms: 200, is_final: true, speaker: '1',
  });
  assert.equal(partition.markerKind, 'fin');
  assert.deepEqual(partition.after, [
    { text: 'after', is_final: true, speaker: '1' },
  ]);
});

test('keeps a stop request active when end arrives before its fin barrier', () => {
  assert.deepEqual(resolveSonioxBoundaryHandling({
    effectiveStrategy: 'end',
    markerKind: 'end',
    activeFinalizeCause: 'stop-flush',
  }), {
    action: 'provider-endpoint',
    cause: 'provider-endpoint-during-stop',
    completeFinalizeRequest: false,
    carryAllowed: false,
  });

  const finHandling = resolveSonioxBoundaryHandling({
    effectiveStrategy: 'end',
    markerKind: 'fin',
    activeFinalizeCause: 'stop-flush',
  });
  assert.deepEqual(finHandling, {
    action: 'manual-full',
    cause: 'stop-flush',
    completeFinalizeRequest: true,
    carryAllowed: false,
  });
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling: finHandling,
    currentSpeakerIds: ['speaker-arrived-after-stop'],
    requestSpeakerIds: ['speaker-present-at-stop'],
  }), ['speaker-present-at-stop', 'speaker-arrived-after-stop']);
});

test('flushes an unsolicited fin safely in end mode without carry', () => {
  const handling = resolveSonioxBoundaryHandling({
    effectiveStrategy: 'end',
    markerKind: 'fin',
    activeFinalizeCause: null,
  });

  assert.deepEqual(handling, {
    action: 'provider-fallback',
    cause: 'unsolicited-fin',
    completeFinalizeRequest: false,
    carryAllowed: false,
  });
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling,
    currentSpeakerIds: ['speaker-1', 'speaker-2'],
    requestSpeakerIds: [],
    beforeSpeakerIds: ['speaker-2'],
    pendingSpeakerIds: ['speaker-1', 'speaker-2'],
  }), ['speaker-2']);
});

test('allows carry only for a manual snapshot boundary in effective fin mode', () => {
  assert.deepEqual(resolveSonioxBoundaryHandling({
    effectiveStrategy: 'fin',
    markerKind: 'fin',
    activeFinalizeCause: 'idle-fin',
  }), {
    action: 'manual-snapshot',
    cause: 'idle-fin',
    completeFinalizeRequest: true,
    carryAllowed: true,
  });
});

test('provider endpoint boundaries target the identified speaker only', () => {
  const handling = resolveSonioxBoundaryHandling({
    effectiveStrategy: 'end',
    markerKind: 'end',
    activeFinalizeCause: null,
  });
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling,
    currentSpeakerIds: ['speaker-1', 'speaker-2'],
    requestSpeakerIds: [],
    providerBoundarySpeakerId: 'speaker-2',
    beforeSpeakerIds: ['speaker-1'],
    pendingSpeakerIds: ['speaker-1', 'speaker-2'],
  }), ['speaker-2']);
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling,
    currentSpeakerIds: ['speaker-1', 'speaker-2'],
    requestSpeakerIds: [],
    providerBoundarySpeakerId: 'unknown',
    beforeSpeakerIds: ['speaker-1'],
    pendingSpeakerIds: ['speaker-1', 'speaker-2'],
  }), ['speaker-1']);
});

test('provider endpoint boundaries preserve pending turns when ownership is ambiguous', () => {
  const handling = resolveSonioxBoundaryHandling({
    effectiveStrategy: 'end',
    markerKind: 'end',
    activeFinalizeCause: null,
  });
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling,
    currentSpeakerIds: ['speaker-1', 'speaker-2'],
    requestSpeakerIds: [],
    beforeSpeakerIds: ['speaker-1', 'speaker-2'],
    pendingSpeakerIds: ['speaker-1', 'speaker-2'],
  }), []);
  assert.deepEqual(selectSonioxBoundarySpeakerIds({
    handling,
    currentSpeakerIds: ['speaker-1', 'speaker-2'],
    requestSpeakerIds: [],
    beforeSpeakerIds: [],
    pendingSpeakerIds: ['speaker-2'],
  }), ['speaker-2']);
});

test('manual carry controller resolves without firing expiry', async () => {
  let expiryCount = 0;
  const carry = new ManualFinalizeCarryController(5, () => {
    expiryCount += 1;
  });
  carry.begin();
  assert.equal(carry.isProvisional, true);
  carry.resolve();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(carry.isProvisional, false);
  assert.equal(expiryCount, 0);
});

test('manual carry controller fires one unresolved expiry', async () => {
  let expiryCount = 0;
  const carry = new ManualFinalizeCarryController(5, () => {
    expiryCount += 1;
  });
  carry.begin();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(carry.isProvisional, true);
  assert.equal(expiryCount, 1);
  carry.dispose();
});
