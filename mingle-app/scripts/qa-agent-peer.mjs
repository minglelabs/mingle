#!/usr/bin/env node
// The second QA account for /qa (see qa-agent-peer.lib.mjs). Prints JSON; never prints passwords.
//
//   node scripts/qa-agent-peer.mjs account                            # make sure the peer account exists
//   node scripts/qa-agent-peer.mjs join-room --conversation <id>      # peer joins a room of the QA account
//   node scripts/qa-agent-peer.mjs voice-start --conversation <id> [--lang en]   # API-only call start (push, list badge)
//   node scripts/qa-agent-peer.mjs voice-leave --conversation <id>
//   node scripts/qa-agent-peer.mjs voice-status --conversation <id>

import {
  devboxBaseUrl,
  ensurePeerAccount,
  fail,
  joinPeerToRoom,
  readOption,
  signInPeer,
} from './qa-agent-peer.lib.mjs';

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  const baseUrl = devboxBaseUrl();
  const conversationId = () => readOption(args, '--conversation') || fail('--conversation <id> is required');
  switch (command) {
    case 'account': {
      const account = await ensurePeerAccount(baseUrl);
      const peer = await signInPeer(baseUrl);
      console.log(JSON.stringify({ email: account.email, userId: peer.userId }));
      break;
    }
    case 'join-room':
      console.log(JSON.stringify(await joinPeerToRoom(baseUrl, conversationId())));
      break;
    case 'voice-start': {
      // Records a call the way the app's token request does, so the start push and the list badge fire.
      // Nobody connects to LiveKit, so the server frees the seat after its grace period.
      const peer = await signInPeer(baseUrl);
      const id = conversationId();
      const res = await peer.session.post(`/api/conversations/${encodeURIComponent(id)}/voice/token`, { lang: readOption(args, '--lang', 'en'), interpret: false });
      if (res.status !== 200) fail(`voice token failed: ${res.status} ${res.json?.error ?? ''}`);
      console.log(JSON.stringify({ started: true, callId: res.json.call?.id, participants: res.json.call?.participants?.length ?? 0 }));
      break;
    }
    case 'voice-leave': {
      const peer = await signInPeer(baseUrl);
      const res = await peer.session.post(`/api/conversations/${encodeURIComponent(conversationId())}/voice/leave`, {});
      console.log(JSON.stringify({ status: res.status, ...(res.json || {}) }));
      break;
    }
    case 'voice-status': {
      const peer = await signInPeer(baseUrl);
      const res = await peer.session.get(`/api/conversations/${encodeURIComponent(conversationId())}/voice`);
      console.log(JSON.stringify({ status: res.status, call: res.json?.call ?? null }));
      break;
    }
    default:
      console.log('usage: qa-agent-peer.mjs account | join-room | voice-start | voice-leave | voice-status  (--conversation <id>)');
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
