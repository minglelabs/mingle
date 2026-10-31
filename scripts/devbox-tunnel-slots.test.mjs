import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const devboxScriptPath = path.join(scriptDir, "devbox.sh");

// Runs shell code with devbox.sh sourced and the shared claim dir isolated.
function runWithClaims(shellBody) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-slots-"));
  const result = spawnSync(
    "/bin/bash",
    [
      "-c",
      `set -euo pipefail
source "${devboxScriptPath}"
devbox_shared_state_dir() { printf '%s' ${JSON.stringify(stateDir)}; }
ROOT_CANON=/fake/worktree-a
DEVBOX_WORKTREE_NAME=worktree-a
${shellBody}
`,
    ],
    { encoding: "utf8" },
  );
  fs.rmSync(stateDir, { recursive: true, force: true });
  return result;
}

test("slot hostname appends the slot to the first label", () => {
  const result = runWithClaims(`
tunnel_slot_hostname mingle-app-devbox.photo-for-passport.com 2; echo
tunnel_slot_hostname mingle-app-devbox.photo-for-passport.com ""; echo
`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "mingle-app-devbox-2.photo-for-passport.com",
    "mingle-app-devbox.photo-for-passport.com",
  ]);
});

test("a session skips slots held by another live session", () => {
  const result = runWithClaims(`
mkdir -p "$(dirname "$(tunnel_slot_claim_file 1)")"
# This test shell's own pid stands in for another running devbox up.
printf 'owner=/fake/worktree-b\\npid=%s\\n' "$$" > "$(tunnel_slot_claim_file 1)"
claim_tunnel_slot "" >/dev/null
echo "slot=$DEVBOX_TUNNEL_SLOT"
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /slot=2/);
});

test("a slot whose devbox process has exited is free again", () => {
  const result = runWithClaims(`
mkdir -p "$(dirname "$(tunnel_slot_claim_file 1)")"
printf 'owner=/fake/worktree-b\\npid=999999\\n' > "$(tunnel_slot_claim_file 1)"
claim_tunnel_slot "" >/dev/null
echo "slot=$DEVBOX_TUNNEL_SLOT"
`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /slot=1/);
});

test("requesting a slot held by another live session fails", () => {
  const result = runWithClaims(`
mkdir -p "$(dirname "$(tunnel_slot_claim_file 3)")"
printf 'owner=/fake/worktree-b\\npid=%s\\n' "$$" > "$(tunnel_slot_claim_file 3)"
claim_tunnel_slot 3
`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /tunnel slot 3 is in use by another session/);
});

test("unassigned installs target every free phone and skip claimed ones", () => {
  const result = runWithClaims(`
list_connected_android_serials() { printf '%s\\n' serial-free serial-busy; }
mkdir -p /tmp >/dev/null
other="$(mktemp -d)"
DEVBOX_WORKTREE_NAME=worktree-b ROOT_CANON="$other" claim_device android serial-busy
worktree_has_live_tunnel_slot() { [[ "$1" == "$other" ]]; }
select_install_devices android ""
rmdir "$other"
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "serial-free");
  assert.match(result.stderr, /ACTION REQUIRED: skipped android phone serial-busy/);
});

test("an explicitly assigned phone is used even when claimed", () => {
  const result = runWithClaims(`
other="$(mktemp -d)"
DEVBOX_WORKTREE_NAME=worktree-b ROOT_CANON="$other" claim_device ios PHONE-1
worktree_has_live_tunnel_slot() { [[ "$1" == "$other" ]]; }
select_install_devices ios PHONE-1
rmdir "$other"
`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "PHONE-1");
  assert.match(result.stderr, /taking it because it was requested explicitly/);
});
