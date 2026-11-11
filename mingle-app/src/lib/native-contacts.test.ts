import { describe, expect, it } from 'vitest'
import {
  filterContacts,
  parseNativeContactsCapability,
  readInvitedPhones,
  writeInvitedPhones,
} from './native-contacts'

const CONTACTS = [
  { id: '1', name: 'Kim Mina', phones: ['+821012345678'] },
  { id: '2', name: '박서준', phones: ['01099998888', '0212345678'] },
]

describe('native-contacts', () => {
  it('reads the contacts capability only from a capabilities message', () => {
    expect(parseNativeContactsCapability({ type: 'capabilities', contacts: true })).toBe(true)
    expect(parseNativeContactsCapability({ type: 'capabilities' })).toBe(false)
    expect(parseNativeContactsCapability({ type: 'other', contacts: true })).toBe(false)
    expect(parseNativeContactsCapability(null)).toBe(false)
  })

  it('filters by name or by digits of a number', () => {
    expect(filterContacts(CONTACTS, '')).toHaveLength(2)
    expect(filterContacts(CONTACTS, 'mina').map(contact => contact.id)).toEqual(['1'])
    expect(filterContacts(CONTACTS, '서준').map(contact => contact.id)).toEqual(['2'])
    expect(filterContacts(CONTACTS, '9999-8888').map(contact => contact.id)).toEqual(['2'])
    expect(filterContacts(CONTACTS, 'zzz')).toEqual([])
  })

  it('remembers invited numbers', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    }
    expect(readInvitedPhones(storage).size).toBe(0)
    writeInvitedPhones(new Set(['01012345678']), storage)
    expect([...readInvitedPhones(storage)]).toEqual(['01012345678'])
    store.set('mingle.contactSync.invited.v1', '{broken')
    expect(readInvitedPhones(storage).size).toBe(0)
  })
})
