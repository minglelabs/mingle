import { createOpenRoom, listOpenRooms } from '@/lib/app-conversations'
import { ensureHamzziAccount, HAMZZI_USER_ID } from '@/lib/hamzzi'
import type { OpenRoomCard } from '@/lib/open-room'
import { prisma } from '@/lib/prisma'

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

async function loungeCard(id: string, viewerUserId: string | null): Promise<OpenRoomCard | null> {
  let [card] = await listOpenRooms(viewerUserId, { ids: [id] })
  if (!card) return null
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
  const room = await createOpenRoom({ userId: HAMZZI_USER_ID, locale: 'en', title: VOICE_LOUNGE_TITLE })
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
