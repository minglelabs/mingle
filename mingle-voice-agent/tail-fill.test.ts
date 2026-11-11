import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldRequestInterimFill, unspokenRest } from './tail-fill';

test('a clause is asked for when a new mark appears after enough new words, or after a long stretch', () => {
    assert.equal(shouldRequestInterimFill('안녕하세요 반가워요, 오늘', ''), true);
    assert.equal(shouldRequestInterimFill('안녕', ''), false);
    assert.equal(shouldRequestInterimFill('안녕하세요 반가워요, 오늘', '안녕하세요 반가워요, 오늘'), false);
    assert.equal(shouldRequestInterimFill('a'.repeat(80), ''), true);
});

test('the final reads aloud only what the clauses did not', () => {
    assert.equal(unspokenRest('Hello, nice to meet you.', 'Hello,'), 'nice to meet you.');
    assert.equal(unspokenRest('Hello there.', ''), 'Hello there.');
    // The model rewrote the start: nothing more is read rather than repeating it.
    assert.equal(unspokenRest('Hi, nice to meet you.', 'Hello,'), '');
});
