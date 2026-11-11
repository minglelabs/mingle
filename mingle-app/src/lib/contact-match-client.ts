import { buildClientApiPath } from '@/lib/api-contract'
import type { NativeContact } from '@/lib/native-contacts'
import { callingCodeOfE164, hashPhoneNumber, normalizePhoneNumber } from '@/lib/phone-number'

/** Hashes sent per request (the server takes up to 1,000). */
const MATCH_CHUNK = 900

export type MatchedContactUser = {
  userId: string
  name: string | null
  handle: string
  image: string | null
  isFollowing: boolean
}

export type MatchedContact = { contact: NativeContact; user: MatchedContactUser }

/**
 * Hashes each contact's numbers (as E.164, assuming the country of the user's
 * own verified number for local ones) and asks the server which belong to
 * HashChat accounts. Only hashes leave the device. One account appears once,
 * under the first contact that holds its number.
 */
export async function matchContactsOnServer(contacts: readonly NativeContact[], ownPhoneE164: string): Promise<MatchedContact[]> {
  const callingCode = callingCodeOfE164(ownPhoneE164)
  const contactByHash = new Map<string, NativeContact>()
  for (const contact of contacts) {
    for (const raw of contact.phones) {
      const e164 = normalizePhoneNumber(raw, callingCode)
      if (!e164 || e164 === ownPhoneE164) continue
      const hash = await hashPhoneNumber(e164)
      if (!contactByHash.has(hash)) contactByHash.set(hash, contact)
    }
  }
  const hashes = [...contactByHash.keys()]
  const matches: MatchedContact[] = []
  const seenUsers = new Set<string>()
  for (let start = 0; start < hashes.length; start += MATCH_CHUNK) {
    const response = await fetch(buildClientApiPath('/contacts/match'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: hashes.slice(start, start + MATCH_CHUNK) }),
    })
    if (!response.ok) throw new Error(`contact_match_${response.status}`)
    const body = await response.json() as { matches?: Array<MatchedContactUser & { hash: string }> }
    for (const match of body.matches ?? []) {
      const contact = contactByHash.get(match.hash)
      if (!contact || seenUsers.has(match.userId)) continue
      seenUsers.add(match.userId)
      matches.push({
        contact,
        user: { userId: match.userId, name: match.name, handle: match.handle, image: match.image, isFollowing: match.isFollowing },
      })
    }
  }
  return matches.sort((left, right) => left.contact.name.localeCompare(right.contact.name))
}
