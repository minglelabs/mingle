// The room's messages as the Hash Rush game hears them. The native game reads
// them too now, so they are kept in hash-rush-room-chat.ts; this file stays for
// the iframe sheet until it goes.

export {
  HASH_RUSH_CHAT_SOURCE_WINDOW,
  buildHashRushChatEntries,
  resolveHashRushChatSenderId,
  resolveHashRushChatText,
} from './hash-rush-room-chat'
