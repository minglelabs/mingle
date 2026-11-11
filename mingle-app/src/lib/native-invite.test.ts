import { describe, expect, it } from 'vitest'
import { clearPendingInvite, parseNativeInviteDetail, readPendingInvite, storePendingInvite } from './native-invite'

function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
}

describe('native-invite', () => {
  it('reads an invite the shell sent', () => {
    expect(parseNativeInviteDetail({ code: ' AB3DE ', source: 'install_referrer' })).toEqual({ code: 'ab3de', source: 'install_referrer' })
    expect(parseNativeInviteDetail({ code: 'ab3de', source: 'weird' })).toEqual({ code: 'ab3de', source: 'code' })
    expect(parseNativeInviteDetail({ code: 'nope' })).toBeNull()
    expect(parseNativeInviteDetail(null)).toBeNull()
  })

  it('keeps a pending invite until it is cleared or two weeks old', () => {
    const storage = memoryStorage()
    expect(readPendingInvite(storage)).toBeNull()
    storePendingInvite({ code: 'ab3de', source: 'link' }, storage, 1_000)
    expect(readPendingInvite(storage, 2_000)).toEqual({ code: 'ab3de', source: 'link', at: 1_000 })
    expect(readPendingInvite(storage, 1_000 + 15 * 24 * 60 * 60 * 1000)).toBeNull()
    clearPendingInvite(storage)
    expect(readPendingInvite(storage, 2_000)).toBeNull()
  })
})
