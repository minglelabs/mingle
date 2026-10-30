import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateProfileWithBio: vi.fn(),
  runBioVersion: vi.fn(),
}))

vi.mock('@/server/profile-bio', () => ({
  updateProfileWithBio: mocks.updateProfileWithBio,
  runBioVersion: mocks.runBioVersion,
}))

import {
  enqueueOperatorBioRun,
  enqueueOperatorBioWrite,
  isOperatorBioPending,
  OPERATOR_BIO_CONCURRENCY,
  whenOperatorBioQueueIdle,
} from './bio-queue'

const tick = () => new Promise(resolve => setTimeout(resolve, 5))

describe('operator bio queue', () => {
  let active = 0
  let maxActive = 0

  beforeEach(() => {
    vi.clearAllMocks()
    active = 0
    maxActive = 0
    mocks.updateProfileWithBio.mockImplementation(async (userId: string, bio: string, update: (tx: unknown) => Promise<unknown>) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const tx = { user: { update: vi.fn(async () => ({ id: userId })) } }
      await update(tx)
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { bio }, select: { id: true } })
      return { profile: { id: userId }, versionId: `v-${userId}` }
    })
    mocks.runBioVersion.mockImplementation(async () => {
      await tick()
      active -= 1
    })
  })

  it('writes each bio through bio-versioning, then translates it, at most 2 at a time and in order', async () => {
    for (const userId of ['u1', 'u2', 'u3', 'u4', 'u5']) enqueueOperatorBioWrite(userId, `bio of ${userId}`)
    expect(isOperatorBioPending('u5')).toBe(true)
    await whenOperatorBioQueueIdle()

    expect(OPERATOR_BIO_CONCURRENCY).toBe(2)
    expect(maxActive).toBe(2)
    expect(mocks.updateProfileWithBio.mock.calls.map(call => call[0])).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
    expect(mocks.runBioVersion.mock.calls.map(call => call[0])).toEqual(['v-u1', 'v-u2', 'v-u3', 'v-u4', 'v-u5'])
    expect(isOperatorBioPending('u5')).toBe(false)
  })

  it('runs an edit translation before waiting bulk work', async () => {
    for (const userId of ['u1', 'u2', 'u3', 'u4']) enqueueOperatorBioWrite(userId, 'bio')
    enqueueOperatorBioRun('v-edit', 'edited')
    expect(isOperatorBioPending('edited')).toBe(true)
    await whenOperatorBioQueueIdle()
    expect(mocks.runBioVersion.mock.calls.map(call => call[0])).toEqual(['v-u1', 'v-u2', 'v-edit', 'v-u3', 'v-u4'])
  })

  it('keeps going after a failed task and skips translation when no version was created', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.updateProfileWithBio.mockRejectedValueOnce(new Error('db down'))
    mocks.updateProfileWithBio.mockResolvedValueOnce({ profile: null, versionId: null })
    enqueueOperatorBioWrite('fails', 'bio')
    enqueueOperatorBioWrite('unchanged', 'bio')
    enqueueOperatorBioWrite('works', 'bio')
    await whenOperatorBioQueueIdle()

    expect(mocks.runBioVersion.mock.calls.map(call => call[0])).toEqual(['v-works'])
    expect(consoleError).toHaveBeenCalledWith('[operator-bio] task_failed', { error: 'Error' })
    expect(isOperatorBioPending('fails')).toBe(false)
    consoleError.mockRestore()
  })
})
