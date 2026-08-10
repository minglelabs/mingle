import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSonioxEndpointDelayMs,
  resolveSonioxEndpointDetectionConfig,
} from '../segmentation-strategy';

test('enables Soniox semantic endpoint detection for the end strategy', () => {
  assert.deepEqual(resolveSonioxEndpointDetectionConfig('end', 1500), {
    enable_endpoint_detection: true,
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
