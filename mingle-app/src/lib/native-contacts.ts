// Contact sync bridge to the app shell (rn/src/nativeContacts.ts): reading the
// address book and opening a written text message. Contacts stay in this page;
// they are never sent to the server.

import { NATIVE_SHELL_CAPABILITIES_STATE_KEY } from '@/lib/native-device-audio'

export const NATIVE_CONTACTS_EVENT = 'mingle:native-contacts'
/** Opens the contact-sync screen from anywhere (ContactSyncHost listens). */
export const CONTACT_SYNC_OPEN_EVENT = 'mingle:contact-sync-open'
/** Asks ContactSyncHost to show the screen once to someone who just signed up. */
export const CONTACT_SYNC_PROMPT_CHECK_EVENT = 'mingle:contact-sync-prompt-check'

const INVITED_STORAGE_KEY = 'mingle.contactSync.invited.v1'
const INVITED_LIMIT = 2000

export type NativeContactsPermission = 'granted' | 'denied' | 'blocked' | 'not_determined' | 'unavailable'

export type NativeContact = {
  id: string
  name: string
  phones: string[]
}

export type NativeContactsEvent =
  | { type: 'permission'; permission: NativeContactsPermission; requestId?: string }
  | { type: 'contacts'; contacts: NativeContact[]; truncated?: boolean; requestId?: string }
  | { type: 'error'; code: string; requestId?: string }

type NativeContactsWindow = Window & {
  ReactNativeWebView?: { postMessage?: (message: string) => void }
  [NATIVE_SHELL_CAPABILITIES_STATE_KEY]?: unknown
}

/** True when the capabilities message says this shell can read contacts. */
export function parseNativeContactsCapability(detail: unknown): boolean {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return false
  const record = detail as Record<string, unknown>
  return record.type === 'capabilities' && record.contacts === true
}

export function isNativeContactsSupported(): boolean {
  if (typeof window === 'undefined') return false
  const nativeWindow = window as NativeContactsWindow
  return typeof nativeWindow.ReactNativeWebView?.postMessage === 'function'
    && parseNativeContactsCapability(nativeWindow[NATIVE_SHELL_CAPABILITIES_STATE_KEY])
}

function postCommand(type: string, payload?: Record<string, unknown>): boolean {
  if (typeof window === 'undefined') return false
  const bridge = (window as NativeContactsWindow).ReactNativeWebView
  if (typeof bridge?.postMessage !== 'function') return false
  try {
    bridge.postMessage(JSON.stringify({ type, ...(payload ? { payload } : {}) }))
    return true
  } catch {
    return false
  }
}

export function postNativeContactsCheck(requestId?: string): boolean {
  return postCommand('native_contacts_check', requestId ? { requestId } : undefined)
}

/** Asks for permission if needed, then sends back every contact that has a phone number. */
export function postNativeContactsRequest(requestId?: string): boolean {
  return postCommand('native_contacts_request', requestId ? { requestId } : undefined)
}

/** Opens Messages with the text written; the person presses send. */
export function postNativeSmsCompose(recipients: string[], body: string): boolean {
  return postCommand('native_sms_compose', { recipients, body })
}

export function subscribeNativeContacts(handler: (event: NativeContactsEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail
    if (!detail || typeof detail !== 'object') return
    handler(detail as NativeContactsEvent)
  }
  window.addEventListener(NATIVE_CONTACTS_EVENT, listener)
  return () => window.removeEventListener(NATIVE_CONTACTS_EVENT, listener)
}

export function openContactSync(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONTACT_SYNC_OPEN_EVENT))
}

export function requestContactSyncPromptCheck(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONTACT_SYNC_PROMPT_CHECK_EVENT))
}

/** Case- and space-insensitive match on the name, digits-only match on the numbers. */
export function filterContacts(contacts: readonly NativeContact[], query: string): NativeContact[] {
  const text = query.trim().toLowerCase()
  if (!text) return [...contacts]
  const digits = text.replace(/[^\d]/g, '')
  return contacts.filter(contact => contact.name.toLowerCase().includes(text)
    || (digits.length > 0 && contact.phones.some(phone => phone.replace(/[^\d]/g, '').includes(digits))))
}

// Which numbers this device already opened an invite for (shown as "Invited").
export function readInvitedPhones(storage: Pick<Storage, 'getItem'> | null = browserStorage()): Set<string> {
  try {
    const parsed = JSON.parse(storage?.getItem(INVITED_STORAGE_KEY) ?? '[]') as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
  } catch {
    return new Set()
  }
}

export function writeInvitedPhones(phones: ReadonlySet<string>, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  try {
    storage?.setItem(INVITED_STORAGE_KEY, JSON.stringify([...phones].slice(-INVITED_LIMIT)))
  } catch {
    // Storage full or blocked: the mark is only a convenience.
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
