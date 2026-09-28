import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Compile the production gate, not a JavaScript reimplementation. This covers
// queued callbacks; AVAudioSession and actual photo-picker behavior need iOS QA.
test('iOS audio recovery survives interruptions without reviving retired sessions', (t) => {
  const compiler = spawnSync('swiftc', ['--version'], { encoding: 'utf8' });
  if (compiler.error?.code === 'ENOENT') {
    t.skip('Swift compiler is required for native lifecycle regression tests');
    return;
  }
  assert.equal(compiler.status, 0, compiler.stderr);
  const source = readFileSync(new URL('../rn/ios/mingle/NativeSTTModule.swift', import.meta.url), 'utf8');
  const start = source.indexOf('final class NativeSTTAudioRecoveryGate {');
  const end = source.indexOf('@objc(NativeSTTModule)', start);
  assert.ok(start >= 0 && end > start, 'production recovery gate must be present');
  const directory = mkdtempSync(path.join(tmpdir(), 'mingle-stt-recovery-'));
  try {
    const program = path.join(directory, 'main.swift');
    const executable = path.join(directory, 'recovery-test');
    writeFileSync(program, `import Foundation\n${source.slice(start, end)}\n` + String.raw`
let gate = NativeSTTAudioRecoveryGate()
let queuedBeforePicker = gate.beginAttempt(now: 100)!
gate.reset(interrupted: true)
precondition(!gate.isCurrent(queuedBeforePicker), "Picker interruption must invalidate queued recovery")
for time in [100.1, 105.0, 110.0] {
    precondition(gate.beginAttempt(now: time) == nil, "Health checks must not activate interrupted audio")
}
gate.reset()
let resumed = gate.beginAttempt(now: 100.2)!
precondition(gate.isCurrent(resumed), "Interruption end must recover even inside the old throttle window")
gate.finish(queuedBeforePicker)
precondition(gate.isCurrent(resumed), "Stale callback must not clear the resumed attempt")
precondition(gate.beginAttempt(now: 101) == nil, "Route and health callbacks must not restart concurrently")
gate.finish(resumed)
precondition(gate.beginAttempt(now: 100.3) == nil, "Ordinary restart bursts remain throttled")
let afterCooldown = gate.beginAttempt(now: 101)!
gate.reset() // User Stop, including graceful stop while isRunning is still true.
precondition(!gate.isCurrent(afterCooldown), "Stop must invalidate queued engine work")
gate.reset() // New session, even in the same conversation.
let newSession = gate.beginAttempt(now: 101.1)!
gate.finish(afterCooldown)
precondition(!gate.isCurrent(afterCooldown), "Old-session work cannot recover a new session")
precondition(gate.isCurrent(newSession), "Old completion cannot unlock new-session recovery")
gate.reset(interrupted: true)
gate.reset(interrupted: true) // Repeated notifications remain blocked.
precondition(gate.beginAttempt(now: 120) == nil)
gate.reset()
precondition(gate.beginAttempt(now: 120.1) != nil, "Repeated interruption must not leave recovery stuck")
print("Native audio recovery lifecycle scenarios passed")
`);
    const built = spawnSync('swiftc', [program, '-o', executable], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(built.status, 0, built.stderr || String(built.error || 'Swift compilation failed'));
    const result = spawnSync(executable, [], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
