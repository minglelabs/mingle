// The line to a Hash Rush room on the game server (G2). This is the server-room
// part of hash-rush's net.js. In mingle the chat room is the way in, so the
// app's entry ticket is handed in instead of read from the page address, and the
// peer-to-peer rooms, their TURN relay and the room list over MQTT are left out.

// This much still waiting to go out (about two snapshots) means the line cannot
// keep up right now. Whatever joins a queue arrives late, so an input is skipped
// instead: the next one replaces it anyway.
const FAST_BACKLOG = 1500;
const CONNECT_TIMEOUT_MS = 15000;
const PING_EVERY_MS = 2000;

// The game server's address, if `raw` is a usable ws(s) URL, else ''.
export function gameServer(raw) {
  const value = String(raw || '').trim();
  return /^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(value) ? value : '';
}

// The address of room `room` on `server`, with the app's entry `ticket`.
export function roomUrl(server, room, ticket = '') {
  return `${server.replace(/\/+$/, '')}/rooms/${encodeURIComponent(room)}${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''}`;
}

// Joins a room run by the game server. `on.data(msg)` hears the server and
// `on.close()` fires once the line is gone. Resolves with { send, fast, route,
// close } once connected: `fast` is for what the next message makes worthless,
// `route` for how good the line is. Rejects when the server cannot be reached
// (or turns the ticket down) within 15 seconds.
export async function joinServerRoom(server, room, on, { ticket = '' } = {}) {
  const ws = new WebSocket(roomUrl(server, room, ticket));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.onopen = ws.onerror = null;
      try {
        ws.close();
      } catch {
        // never opened
      }
      reject(new Error('timed out'));
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('join failed'), { noRoom: false }));
    };
  });
  let ms = null;
  let closed = false;
  const ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'ping', at: performance.now() })), PING_EVERY_MS);
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg && msg.t === 'pong') {
      ms = Math.round(performance.now() - Number(msg.at || 0));
      return;
    }
    on.data(msg);
  };
  const gone = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    on.close();
  };
  ws.onclose = gone;
  ws.onerror = gone;
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  // A backed-up socket skips the input; the next one replaces it anyway.
  const fast = (msg) => ws.readyState === 1 && ws.bufferedAmount < FAST_BACKLOG * 4 && ws.send(JSON.stringify(msg));
  return {
    send,
    fast,
    route: async () => (ms == null ? null : { relay: false, ms }),
    close: () => {
      closed = true;
      clearInterval(ping);
      ws.close();
    },
  };
}
