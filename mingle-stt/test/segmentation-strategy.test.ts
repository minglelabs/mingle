import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSonioxEndpointDelayMs,
  resolveSonioxEndpointDetectionConfig,
  resolveSonioxEndpointLatencyAdjustmentLevel,
  resolveSonioxEndpointSensitivity,
} from '../segmentation-strategy';

test('enables Soniox semantic endpoint detection for the end strategy', () => {
  assert.deepEqual(resolveSonioxEndpointDetectionConfig('end', 1500), {
    enable_endpoint_detection: true,
    endpoint_latency_adjustment_level: 0,
    endpoint_sensitivity: 0,
    max_endpoint_delay_ms: 1500,
  });
});

test('keeps Soniox endpoint detection disabled for the manual finalize strategy', () => {
  assert.deepEqual(resolveSonioxEndpointDetectionConfig('fin', 1500), {
    enable_endpoint_detection: false,
  });
});

test('uses a fixed 2000ms endpoint delay instead of a user-controlled silence setting', () => {
  assert.equal(resolveSonioxEndpointDelayMs('end', 500), 2000);
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
