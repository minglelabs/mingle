# Local-first conversation plan

## Goal

Make the conversation list and room feel immediate even when the API or a read
replica is slow. The browser owns the state that the user is currently editing,
while the server remains the durable authority for shared data and security
decisions.

## Ownership matrix

| Data or action | Local-first behavior | Server role |
| --- | --- | --- |
| Conversation-list manifest and warm summary | Durable cache, rendered immediately, stale responses overlaid with pending edits | Refresh canonical rows and cross-device changes |
| Room title | Optimistic local edit, one durable queued PATCH, rollback on permanent rejection | Validate and persist the title |
| Active/paused room status | Optimistic local edit, ordered queued PATCHes, implicit pauses queued with an activation | Enforce the single-active-room rule |
| Selected, speech, translation-linked, and default display languages | Optimistic local edit, coalesced queued PATCHes, profile default queued with the room edit | Validate the language set and recompute shared-room unions |
| Read marker | Set unread count to zero locally and queue the marker | Reconcile unread counts across devices |
| Delete or leave | Hide immediately with a durable tombstone; retry on reconnect; restore on permanent rejection | Authorize deletion/leave and remove membership/data |
| Account display and STT preferences | Existing account-scoped local snapshot and serialized trailing sync | Validate and persist the account preference |
| Finalized messages | Existing identity-scoped durable outbox with idempotent delivery | Assign durable message state and canonical IDs |
| Composer draft, recent search, list/scroll UI state | Local-only | None |
| Full transcript history | Bounded room cache only; latest window hydrates quickly | Canonical history, pagination, and retention |
| Members, invites, blocks, permissions, account identity, usage/billing | Server-authoritative cache/read-through | Authorization and cross-device truth |

## Implemented in this branch

`conversation-mutation-queue.ts` adds a small persistent mutation log scoped by
API namespace and account/tracking identity. It coalesces edits to the same
field, preserves the first rollback value, serializes delivery, retries
network/5xx failures with bounded backoff, treats an already-removed room as a
successful tombstone, and adopts pre-session work after authentication resolves.

`ConversationList` now applies the queue before rendering cached or freshly
fetched rows. Status, language settings, title, read markers, and remove/leave
actions therefore remain stable while a server request is in flight. The room
management menu uses the same callbacks as the list, so a title change or
delete/leave cannot bypass the local-first path.

## Deliberate boundaries

The queue does not make membership, invitations, permissions, blocks, account
identity, usage limits, or the canonical transcript client-owned. Those values
can be changed by another participant or by server policy and must be
revalidated. A pending local edit may be shown immediately, but a permanent
authorization or validation error rolls it back.

The complete transcript is also intentionally not copied into `localStorage`.
It needs IndexedDB or a native database, bounded pagination, encryption/retention
rules, and an incremental server change feed before it is safe to make broad
history local-first.

## Follow-up phases

1. Add an IndexedDB room store for the active room and a small recent-room
   window. Hydrate the manifest first, warm rooms with bounded concurrency, and
   load older pages only when the user scrolls upward.
2. Add server-side mutation IDs or conditional revisions so retries and
   cross-device conflicts are explicitly idempotent instead of relying only on
   endpoint behavior.
3. Add a lightweight conversation change cursor/ETag to replace repeated full
   list reads and to confirm queued edits without a visible stale-response
   window.
4. Instrument queue age, retry count, permanent rejection, cache hit rate, and
   room-open latency by platform. Roll out as a WebView change first; no Prisma
   migration, mobile rebuild, or API namespace bump is required for the current
   phase.
