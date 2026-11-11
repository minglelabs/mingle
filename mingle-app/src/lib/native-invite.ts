// Invite tickets on the device: the invite code the app shell hands to the
// page (a tapped invite link, or the Play install referrer on Android) is kept
// here until the person is signed in and through onboarding, then accepted
// (ContactSyncHost) and the room with the inviter opens.

import { useSyncExternalStore } from 'react'
import { normalizeInviteSource, normalizeReferralCode, type InviteSource } from '@/lib/referral-code'

export const NATIVE_INVITE_EVENT = 'mingle:native-invite'
/** The shell stores the request here before dispatching, for a listener that mounts later. */
export const NATIVE_INVITE_WINDOW_KEY = '__MINGLE_PENDING_NATIVE_INVITE'
/** Opens the "send an invite ticket" sheet from anywhere (ContactSyncHost listens). */
export const INVITE_TICKET_OPEN_EVENT = 'mingle:invite-ticket-open'

const PENDING_CHANGED_EVENT = 'mingle:invite-pending-changed'
const PENDING_STORAGE_KEY = 'mingle.invite.pending.v1'
// An invite nobody acted on for this long is forgotten.
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type PendingInvite = { code: string; source: InviteSource; at: number }

type InviteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): InviteStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Reads `{ code, source }` as the shell sends it. null = not an invite. */
export function parseNativeInviteDetail(detail: unknown): { code: string; source: InviteSource } | null {
  if (typeof detail !== 'object' || detail === null) return null
  const record = detail as Record<string, unknown>
  const code = normalizeReferralCode(record.code)
  return code ? { code, source: normalizeInviteSource(record.source) } : null
}

export function readPendingInvite(storage: InviteStorage | null = browserStorage(), now = Date.now()): PendingInvite | null {
  try {
    const parsed = JSON.parse(storage?.getItem(PENDING_STORAGE_KEY) ?? 'null') as unknown
    const invite = parseNativeInviteDetail(parsed)
    const at = Number((parsed as { at?: unknown } | null)?.at)
    if (!invite || !Number.isFinite(at) || now - at > PENDING_MAX_AGE_MS) return null
    return { ...invite, at }
  } catch {
    return null
  }
}

export function hasPendingInvite(): boolean {
  return readPendingInvite() !== null
}

export function storePendingInvite(
  invite: { code: string; source: InviteSource },
  storage: InviteStorage | null = browserStorage(),
  now = Date.now(),
): void {
  try {
    storage?.setItem(PENDING_STORAGE_KEY, JSON.stringify({ ...invite, at: now }))
    notifyPendingChanged()
  } catch {
    // Storage blocked: the invite still works while this page lives.
  }
}

export function clearPendingInvite(storage: InviteStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(PENDING_STORAGE_KEY)
    notifyPendingChanged()
  } catch {
    // Nothing to clear.
  }
}

/** Takes the invite the shell left on the window, if any, and forgets it there. */
export function consumeWindowInvite(): { code: string; source: InviteSource } | null {
  if (typeof window === 'undefined') return null
  const holder = window as unknown as Record<string, unknown>
  const invite = parseNativeInviteDetail(holder[NATIVE_INVITE_WINDOW_KEY])
  if (invite) holder[NATIVE_INVITE_WINDOW_KEY] = null
  return invite
}

export function openInviteTicket(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(INVITE_TICKET_OPEN_EVENT))
}

function notifyPendingChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PENDING_CHANGED_EVENT))
}

function subscribePendingInvite(listener: () => void): () => void {
  window.addEventListener(PENDING_CHANGED_EVENT, listener)
  return () => window.removeEventListener(PENDING_CHANGED_EVENT, listener)
}

/**
 * Whether an invite is waiting, kept current: the shell can deliver the
 * invite a moment after onboarding has already opened.
 */
export function useHasPendingInvite(): boolean {
  return useSyncExternalStore(subscribePendingInvite, hasPendingInvite, () => false)
}
