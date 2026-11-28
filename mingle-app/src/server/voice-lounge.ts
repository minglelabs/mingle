import { createOpenRoom, listOpenRooms } from '@/lib/app-conversations'
import { ensureHamzziAccount, HAMZZI_USER_ID } from '@/lib/hamzzi'
import type { OpenRoomCard } from '@/lib/open-room'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'

/**
 * The voice tab's lounge (owner, 2026-11-23): one public room that is always
 * there, so the tab never looks empty while few people are online. Rooms with a
 * live voice talk or game are listed under it.
 *
 * It is an ordinary open room made by the Hamzzi mascot (an official account,
 * so no member is its host and may lock it), who steps out of it right away:
 * a mascot member would make a lounge with one person look like a 1:1 chat.
 * Its id is kept in `app_admin_settings`; a lounge that was deleted or made
 * private is replaced by a new one on the next read.
 */
export const VOICE_LOUNGE_SETTING_KEY = 'voice_lounge_conversation_id'

/**
 * The team account that is always in the lounge and is its host (owner,
 * 2026-11-25): @royce. The room itself is still made by the mascot, who
 * steps out; the host of the lounge's voice talk (who moves people on and off
 * the stage, and whose photo the minimized room shows) is this account.
 */
export const VOICE_LOUNGE_HOST_USER_ID = ROYCE_USER_ID

let loungeHostReadyFor: string | null = null

/** Puts the host back in the lounge if it is not a member (never left it, was removed, or a new lounge). */
async function keepHostInLounge(channelId: string): Promise<void> {
  if (loungeHostReadyFor === channelId) return
  try {
    const host = await prisma.user.findFirst({ where: { id: VOICE_LOUNGE_HOST_USER_ID, isDeleted: { not: true } }, select: { id: true } })
    if (!host) return
    const member = await prisma.appConversationChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: VOICE_LOUNGE_HOST_USER_ID } },
      select: { leftAt: true },
    })
    if (!member) await prisma.appConversationChannelMember.create({ data: { channelId, userId: VOICE_LOUNGE_HOST_USER_ID, role: 'member' } })
    else if (member.leftAt) await prisma.appConversationChannelMember.update({ where: { channelId_userId: { channelId, userId: VOICE_LOUNGE_HOST_USER_ID } }, data: { leftAt: null } })
    loungeHostReadyFor = channelId
  } catch (error) {
    console.warn('[voice-lounge] host_join_failed', { error: error instanceof Error ? error.name : 'unknown' })
  }
}

let loungeIdCache: { id: string | null; at: number } | null = null
const LOUNGE_ID_CACHE_MS = 60_000

/** The host of this room's voice talk when the room is the lounge, else null (the room's own host applies). */
export async function resolveVoiceLoungeHost(conversationId: string): Promise<string | null> {
  if (!loungeIdCache || Date.now() - loungeIdCache.at > LOUNGE_ID_CACHE_MS) {
    loungeIdCache = { id: await readLoungeId().catch(() => null), at: Date.now() }
  }
  return loungeIdCache.id === conversationId ? VOICE_LOUNGE_HOST_USER_ID : null
}
export const VOICE_LOUNGE_TITLE = 'Lounge 라운지'

async function readLoungeId(): Promise<string | null> {
  const row = await prisma.adminSetting.findUnique({ where: { key: VOICE_LOUNGE_SETTING_KEY }, select: { value: true } })
  return typeof row?.value === 'string' && row.value ? row.value : null
}

async function stepHostOut(channelId: string): Promise<void> {
  await prisma.appConversationChannelMember.updateMany({
    where: { channelId, userId: HAMZZI_USER_ID, leftAt: null },
    data: { leftAt: new Date() },
  })
}

let loungeMarkedFor: string | null = null

/** The lounge is a voice room; one made before voice rooms were a kind is marked now. */
async function markLoungeAsVoiceRoom(channelId: string): Promise<void> {
  if (loungeMarkedFor === channelId) return
  await prisma.appConversationChannel.updateMany({ where: { id: channelId, isVoiceRoom: false }, data: { isVoiceRoom: true } })
  loungeMarkedFor = channelId
}

async function loungeCard(id: string, viewerUserId: string | null): Promise<OpenRoomCard | null> {
  let [card] = await listOpenRooms(viewerUserId, { ids: [id] })
  if (!card) return null
  await markLoungeAsVoiceRoom(id).catch(() => undefined)
  if (!card.members.some((member) => member.userId === VOICE_LOUNGE_HOST_USER_ID)) {
    loungeHostReadyFor = null
    await keepHostInLounge(id)
    ;[card] = await listOpenRooms(viewerUserId, { ids: [id] })
    if (!card) return null
  }
  if (card.members.some((member) => member.userId === HAMZZI_USER_ID)) {
    // A lounge made before the mascot stepped out: take it out now.
    await stepHostOut(id)
    ;[card] = await listOpenRooms(viewerUserId, { ids: [id] })
    if (!card) return null
  }
  return { ...card, owner: null }
}


let creating: Promise<string | null> | null = null

async function createLounge(staleId: string | null): Promise<string | null> {
  const host = await ensureHamzziAccount()
  if (!host) return null
  const room = await createOpenRoom({ userId: HAMZZI_USER_ID, locale: 'en', title: VOICE_LOUNGE_TITLE, voiceRoom: true })
  await stepHostOut(room.id)
  // Another server may have made one meanwhile: keep whichever is stored first.
  const stored = await prisma.$transaction(async (tx) => {
    const current = await tx.adminSetting.findUnique({ where: { key: VOICE_LOUNGE_SETTING_KEY }, select: { value: true } })
    const currentId = typeof current?.value === 'string' ? current.value : null
    if (currentId && currentId !== staleId) return currentId
    await tx.adminSetting.upsert({
      where: { key: VOICE_LOUNGE_SETTING_KEY },
      create: { key: VOICE_LOUNGE_SETTING_KEY, value: room.id },
      update: { value: room.id },
    })
    return room.id
  })
  if (stored !== room.id) {
    // Lost the race: hide the extra room from the open-room lists.
    await prisma.appConversationChannel.update({ where: { id: room.id }, data: { isPublic: false } }).catch(() => undefined)
  }
  return stored
}

/** The lounge as an open-room card for this viewer, made on first use. Null only when it cannot be made. */
export async function getVoiceLounge(viewerUserId: string | null): Promise<OpenRoomCard | null> {
  const id = await readLoungeId()
  if (id) {
    const card = await loungeCard(id, viewerUserId)
    if (card) return card
  }
  creating ??= createLounge(id).finally(() => {
    creating = null
  })
  const newId = await creating
  return newId ? loungeCard(newId, viewerUserId) : null
}
