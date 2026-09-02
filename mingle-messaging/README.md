# mingle-messaging

Long-lived WebSocket and conversation-event fan-out server for Mingle.

`mingle-app` remains responsible for authentication, conversation membership,
message persistence, and message reads. This service only keeps authorized
WebSocket subscriptions in memory and publishes invalidation events after the
app commits a message. The client fetches the message from `mingle-app` after
receiving an event.

## Scripts

- `pnpm dev`: run the TypeScript server with `ts-node`
- `pnpm test`: run messaging unit tests
- `pnpm build`: compile to `dist/messaging-server.js`
- `pnpm start`: run the compiled server

## Environment Variables

- `PORT` (default: `3002`)
- `MINGLE_REALTIME_SECRET`: shared with `mingle-app`; required for publish
  requests and client subscription tokens

The server exposes:

- `GET /health`
- `POST /conversation-events/publish`
- WebSocket `/conversation-events`

The in-memory subscriber map is intentionally disposable. Clients refresh from
`mingle-app` after reconnecting and keep polling as a fallback.
