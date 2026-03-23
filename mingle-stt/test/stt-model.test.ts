import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSttModel } from '../stt-model';

test('resolveSttModel keeps supported values', () => {
    assert.equal(resolveSttModel('soniox', 'gladia'), 'soniox');
    assert.equal(resolveSttModel('deepgram-multi', 'soniox'), 'deepgram-multi');
});

test('resolveSttModel falls back for empty or unsupported values', () => {
    assert.equal(resolveSttModel('', 'soniox'), 'soniox');
    assert.equal(resolveSttModel('assembly', 'soniox'), 'soniox');
    assert.equal(resolveSttModel(undefined, 'gladia'), 'gladia');
});
