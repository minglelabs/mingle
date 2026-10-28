import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  targetCreate: vi.fn(),
  targetFindMany: vi.fn(),
  targetFindUnique: vi.fn(),
  targetDeleteMany: vi.fn(),
  writeAdminAudit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: m.userFindUnique },
    adminNotifyTarget: {
      create: m.targetCreate,
      findMany: m.targetFindMany,
      findUnique: m.targetFindUnique,
      deleteMany: m.targetDeleteMany,
    },
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: m.writeAdminAudit }))

import {
  addAdminNotifyTarget,
  listAdminNotifyTargets,
  parseTargetHandle,
  removeAdminNotifyTarget,
} from './notify-targets'

const ctx = { sessionId: 'adm_sess_1', ip: '203.0.113.7', userAgent: 'iPhone' }

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'staff_1',
    handle: 'mina',
    isOperator: false,
    isActive: true,
    isDeleted: false,
    deactivatedAt: null,
    withdrawnAt: null,
    deletedAt: null,
    ...overrides,
  }
}

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'staff_1',
    createdAt: new Date('2026-09-30T09:00:00.000Z'),
    user: {
      id: 'staff_1',
      handle: 'mina',
      name: 'Mina Kim',
      image: 'https://cdn.example.com/mina.jpg',
      imageCropScale: 1.2,
      imageCropX: 0.1,
      imageCropY: -0.1,
      isOfficial: false,
      isOperator: false,
      isActive: true,
      isDeleted: false,
      deactivatedAt: null,
      withdrawnAt: null,
      deletedAt: null,
      _count: { pushTokens: 2 },
      ...overrides,
    },
  }
}

describe('admin notify targets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.targetFindMany.mockResolvedValue([targetRow()])
    m.targetCreate.mockResolvedValue({})
    m.writeAdminAudit.mockResolvedValue(undefined)
  })

  describe('parseTargetHandle', () => {
    it.each([
      ['mina', 'mina'],
      ['@Mina', 'mina'],
      ['  @@mina.kr_1 ', 'mina.kr_1'],
    ])('reads %s as %s', (raw, handle) => {
      expect(parseTargetHandle(raw)).toBe(handle)
    })

    it.each(['', '@', 'mi na', 'mina!', 'a'.repeat(31), null, 42])('rejects %s', (raw) => {
      expect(parseTargetHandle(raw)).toBeNull()
    })
  })

  describe('listAdminNotifyTargets', () => {
    it('returns identity, device count and whether the account can still get alerts', async () => {
      m.targetFindMany.mockResolvedValue([
        targetRow(),
        targetRow({ id: 'staff_2', handle: 'jun', name: null, image: null, isOfficial: true, isActive: false, _count: { pushTokens: 0 } }),
      ])
      const targets = await listAdminNotifyTargets()
      expect(targets[0]).toEqual({
        userId: 'staff_1',
        handle: 'mina',
        name: 'Mina Kim',
        image: 'https://cdn.example.com/mina.jpg',
        imageCropScale: 1.2,
        imageCropX: 0.1,
        imageCropY: -0.1,
        active: true,
        deviceCount: 2,
        createdAt: '2026-09-30T09:00:00.000Z',
      })
      expect(targets[1]).toMatchObject({ handle: 'jun', isOfficial: true, active: false, deviceCount: 0 })
      expect(m.targetFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' })
    })
  })

  describe('addAdminNotifyTarget', () => {
    it('adds an active, signed-up, non-operator account by handle and audits it', async () => {
      m.userFindUnique.mockResolvedValue(account())
      const result = await addAdminNotifyTarget(ctx, '@Mina')

      expect(m.userFindUnique.mock.calls[0][0].where).toEqual({ handle: 'mina' })
      expect(m.targetCreate).toHaveBeenCalledWith({ data: { userId: 'staff_1', createdBySessionId: 'adm_sess_1' } })
      expect(m.writeAdminAudit).toHaveBeenCalledWith(ctx, {
        action: 'notify_target.add',
        targetType: 'user',
        targetId: 'staff_1',
        metadata: { handle: 'mina' },
      })
      expect(result).toEqual({ ok: true, added: true, targets: await listAdminNotifyTargets() })
    })

    it('treats an existing target as a no-op without a second audit row', async () => {
      m.userFindUnique.mockResolvedValue(account())
      m.targetCreate.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
      const result = await addAdminNotifyTarget(ctx, 'mina')
      expect(result).toMatchObject({ ok: true, added: false })
      expect(m.writeAdminAudit).not.toHaveBeenCalled()
    })

    it('rethrows any other write failure', async () => {
      m.userFindUnique.mockResolvedValue(account())
      m.targetCreate.mockRejectedValue(new Error('db down'))
      await expect(addAdminNotifyTarget(ctx, 'mina')).rejects.toThrow('db down')
    })

    it.each([
      ['a malformed handle', 'mi na', undefined, 'invalid_handle'],
      ['an unknown handle', 'ghost', null, 'not_found'],
      ['an operator account', 'luca', account({ handle: 'luca', isOperator: true }), 'operator_account'],
      ['a deactivated account', 'mina', account({ isActive: false, deactivatedAt: new Date() }), 'inactive_account'],
      ['a withdrawn account', 'mina', account({ withdrawnAt: new Date() }), 'inactive_account'],
      ['a deleted account', 'mina', account({ isDeleted: true, deletedAt: new Date() }), 'inactive_account'],
      ['a guest account', 'anon_1a2b', account({ handle: 'anon_1a2b' }), 'guest_account'],
    ])('refuses %s', async (_label, handle, user, error) => {
      m.userFindUnique.mockResolvedValue(user)
      await expect(addAdminNotifyTarget(ctx, handle)).resolves.toEqual({ ok: false, error })
      expect(m.targetCreate).not.toHaveBeenCalled()
      expect(m.writeAdminAudit).not.toHaveBeenCalled()
    })
  })

  describe('removeAdminNotifyTarget', () => {
    it('removes a target and audits it with its handle', async () => {
      m.targetFindUnique.mockResolvedValue({ user: { handle: 'mina' } })
      m.targetDeleteMany.mockResolvedValue({ count: 1 })
      m.targetFindMany.mockResolvedValue([])
      const result = await removeAdminNotifyTarget(ctx, 'staff_1')

      expect(m.targetDeleteMany).toHaveBeenCalledWith({ where: { userId: 'staff_1' } })
      expect(m.writeAdminAudit).toHaveBeenCalledWith(ctx, {
        action: 'notify_target.remove',
        targetType: 'user',
        targetId: 'staff_1',
        metadata: { handle: 'mina' },
      })
      expect(result).toEqual({ ok: true, removed: true, targets: [] })
    })

    it('is a no-op for an id that is not a target', async () => {
      m.targetFindUnique.mockResolvedValue(null)
      m.targetDeleteMany.mockResolvedValue({ count: 0 })
      await expect(removeAdminNotifyTarget(ctx, 'staff_9')).resolves.toMatchObject({ ok: true, removed: false })
      expect(m.writeAdminAudit).not.toHaveBeenCalled()
    })

    it.each(['', '../x', 'a b', 'x'.repeat(129)])('rejects the malformed id %s', async (userId) => {
      await expect(removeAdminNotifyTarget(ctx, userId)).resolves.toEqual({ ok: false, error: 'invalid_user_id' })
      expect(m.targetDeleteMany).not.toHaveBeenCalled()
    })
  })
})
