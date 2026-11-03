import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSonioxAgentTextFrames,
    sanitizeSonioxAgentText,
    SONIOX_AGENT_TEXT_MAX_CHARS,
    SonioxAgentTextStats,
    supportsSonioxAgentTextInput,
} from '../soniox-agent-text';

test('agent text input is only enabled for stt-rt-v6', () => {
    assert.equal(supportsSonioxAgentTextInput('stt-rt-v6'), true);
    assert.equal(supportsSonioxAgentTextInput('stt-rt-v5'), false);
});

test('strips tags that are not spoken but keeps spaces exactly', () => {
    assert.equal(sanitizeSonioxAgentText('<speak>안녕 [laughs]하세요 </speak>'), '안녕 하세요 ');
    assert.equal(sanitizeSonioxAgentText('**Hi** `there` '), 'Hi there ');
    assert.equal(sanitizeSonioxAgentText(42), '');
});

test('splits long text and marks only the last piece as the end of the turn', () => {
    const text = '가'.repeat(SONIOX_AGENT_TEXT_MAX_CHARS + 5);
    const frames = buildSonioxAgentTextFrames(text, true);
    assert.equal(frames.length, 2);
    assert.equal(frames.map((frame) => frame.text).join(''), text);
    assert.deepEqual(frames.map((frame) => frame.end_of_segment), [false, true]);
});

test('an end of turn with no text left is still sent', () => {
    assert.deepEqual(buildSonioxAgentTextFrames('', true), [{ type: 'agent_text', text: '', end_of_segment: true }]);
    assert.deepEqual(buildSonioxAgentTextFrames('', false), []);
});

test('stats count messages, characters and turns without keeping the text', () => {
    const stats = new SonioxAgentTextStats();
    stats.recordSent(buildSonioxAgentTextFrames('Hi ', false));
    stats.recordSent(buildSonioxAgentTextFrames('there', true));
    stats.recordDropped();
    assert.equal(stats.summary(), 'agent_text_messages=2 agent_text_chars=8 agent_text_segments=1 agent_text_dropped=1');
});
