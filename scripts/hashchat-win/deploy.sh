#!/usr/bin/env bash
# Rebuild and restart the hashchat-app container from a given commit.
#
#   ~/hashchat/deploy.sh <commit>
#
# pull -> HEAD must equal <commit> -> tag current image as :2.5.0-prev -> build
# (build args read by name from app.env.json) -> recreate the container with
# run-app.mjs -> check /railway/health -> on failure, run the :2.5.0-prev image again.
#
# No env value is ever printed: build args and container env go to docker by
# name only, and the build output goes to a log file (mode 600). The last
# lines printed are the commit, the image ID and the health result.
set -euo pipefail
umask 077

WANT=${1:?usage: deploy.sh <commit>}
REPO=${MINGLE_REPO:-$HOME/src/mingle}
HC=$HOME/hashchat
BRANCH=${MINGLE_BRANCH:-feat/voicetalk-windows-livekit-mvp}
IMAGE=hashchat-app:2.5.0
PREV=hashchat-app:2.5.0-prev
NAME=hashchat-app
PUBLIC_URL=https://hashchat-win.minglelabs.app
NODE=${NODE:-$HOME/.nvm/versions/node/v22.9.0/bin/node}
BUILD_ARGS="NEXT_PUBLIC_WS_PATH NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY MINGLE_RELEASE_TARGET NEXT_PUBLIC_HASH_RUSH_URL NEXT_PUBLIC_HASH_RUSH_SERVER"
LOG=$HC/deploy-$(date +%Y%m%d-%H%M%S).log

fail() { echo "deploy failed: $*" >&2; echo "log: $LOG" >&2; exit 1; }
step() { echo "== $(date -u +%H:%M:%SZ) $*" >>"$LOG"; }

# One deploy at a time.
exec 9>"$HC/.deploy.lock"
flock -n 9 || fail "another deploy is running"

[ -x "$NODE" ] || fail "node not found at $NODE (set NODE=...)"
: >"$LOG"

# 1. Code
step "pull $BRANCH"
cd "$REPO"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes in $REPO"
[ "$(git branch --show-current)" = "$BRANCH" ] || fail "$REPO is not on $BRANCH"
git fetch -q origin >>"$LOG" 2>&1 || fail "git fetch"
git pull -q --ff-only origin "$BRANCH" >>"$LOG" 2>&1 || fail "git pull --ff-only"
HEAD=$(git rev-parse HEAD)
WANT_FULL=$(git rev-parse --verify -q "$WANT^{commit}") || fail "unknown commit $WANT"
[ "$HEAD" = "$WANT_FULL" ] || fail "HEAD is ${HEAD:0:8}, expected ${WANT_FULL:0:8}"

# 2. Keep the running image for rollback
step "tag $IMAGE as $PREV"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "$IMAGE does not exist"
docker tag "$IMAGE" "$PREV"

# 3. Build. NEXT_PUBLIC_* are baked in at build time, so they are passed as
# --build-arg NAME (value taken from the child's env, never on a command line).
step "build $IMAGE"
if ! "$NODE" - "$HC/app.env.json" "$IMAGE" $BUILD_ARGS >>"$LOG" 2>&1 <<'NODE'
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const [jsonPath, image, ...names] = process.argv.slice(2)
const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const env = { PATH: process.env.PATH, HOME: process.env.HOME }
const args = ['build', '--progress=plain', '-f', 'Dockerfile.railway', '-t', image]
for (const n of names) {
  if (!(n in vars)) { console.error(`build arg missing in app.env.json: ${n}`); process.exit(1) }
  env[n] = vars[n]
  args.push('--build-arg', n)
}
args.push('.')
const r = spawnSync('docker', args, { env, stdio: ['ignore', 'inherit', 'inherit'] })
process.exit(r.status ?? 1)
NODE
then
  docker tag "$PREV" "$IMAGE"
  fail "docker build (the container was not touched)"
fi
NEW_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')

health() { # $1 = seconds to wait; prints the last status code
  local code=000 i
  for ((i = 0; i < $1; i += 2)); do
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:8080/railway/health || true)
    [ "$code" = 200 ] && break
    sleep 2
  done
  echo "$code"
}

start() { # $1 = image
  docker rm -f "$NAME" >>"$LOG" 2>&1 || true
  (cd "$HC" && "$NODE" run-app.mjs app.env.json "$1") >>"$LOG" 2>&1
}

# 4. Recreate the container (same port, network and restart policy: see run-app.mjs)
step "recreate $NAME"
if start "$IMAGE" && [ "$(health 120)" = 200 ]; then
  PUBLIC=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$PUBLIC_URL/railway/health" || true)
  step "done"
  echo "commit:  ${HEAD:0:8}"
  echo "image:   ${NEW_ID#sha256:}"
  echo "health:  local 200, public $PUBLIC"
  exit 0
fi

# 5. Roll back to the previous image
step "rollback to $PREV"
docker logs --tail 50 "$NAME" >>"$LOG" 2>&1 || true
docker tag "$PREV" "$IMAGE"
start "$IMAGE" || true
CODE=$(health 120)
echo "commit:  ${HEAD:0:8} (NOT running)"
echo "image:   ${NEW_ID#sha256:} failed; rolled back to $(docker image inspect "$PREV" --format '{{.Id}}' | cut -c8-19)"
echo "health:  local $CODE after rollback"
echo "log:     $LOG"
exit 1
