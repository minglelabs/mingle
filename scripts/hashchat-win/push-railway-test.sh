#!/usr/bin/env bash
# Deploys the current voice talk branch to the Railway test service
# (hashchat-voicetalk-test). That service builds `deploy/voicetalk-railway-test`:
# this branch plus one commit giving Dockerfile.railway's cache mount the test
# service's id (Railway refuses a cache id that does not start with the
# building service's id). The voice talk branch itself keeps prod's id.
set -euo pipefail
PROD_ID=959e33f7-10af-4820-bb24-cd8b83d8b24c
TEST_ID=d2728a3d-42ca-40d6-8628-30ba03f5f729
DEPLOY_BRANCH=deploy/voicetalk-railway-test
root="$(git rev-parse --show-toplevel)"
cd "$root"
base="$(git rev-parse HEAD)"
tmp="$(mktemp -d)"
trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' EXIT
git worktree add --detach -q "$tmp" "$base"
sed -i.bak "s/$PROD_ID/$TEST_ID/g" "$tmp/Dockerfile.railway" && rm -f "$tmp/Dockerfile.railway.bak"
git -C "$tmp" commit -qam "Railway test service: cache mount id for hashchat-voicetalk-test (not for main)"
git -C "$tmp" push -q -f origin "HEAD:refs/heads/$DEPLOY_BRANCH"
echo "pushed $DEPLOY_BRANCH = $(git rev-parse --short "$base") + test cache id"
