import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMingleSttBehaviorProfile } from '../behavior-profile';

test('legacy namespaces stay on the 1.0.11 STT profile', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.0.11'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.0.7'), 'legacy_1_0_11');
    assert.equal(resolveMingleSttBehaviorProfile(''), 'legacy_1_0_11');
});

test('1.1.0 namespaces use the new STT profile', () => {
    assert.equal(resolveMingleSttBehaviorProfile('ios/v1.1.0'), 'v1_1_0');
    assert.equal(resolveMingleSttBehaviorProfile('android/v1.2.0'), 'v1_1_0');
});
