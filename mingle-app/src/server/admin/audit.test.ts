import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { adminAuditLog: { create: m.create } } }))

import { writeAdminAudit } from './audit'

const ctx = { sessionId: 'admin_sess_1', ip: '203.0.113.7', userAgent: 'Mozilla/5.0' }

describe('writeAdminAudit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.create.mockResolvedValue({})
  })

  it('appends one row with the session, ip, operator and target', async () => {
    await writeAdminAudit(ctx, {
      action: 'inbox.reply',
      operatorUserId: 'op_1',
      targetType: 'conversation',
      targetId: 'conv_1',
      metadata: { messageId: 'msg_1' },
    })
    expect(m.create).toHaveBeenCalledOnce()
    expect(m.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'admin_sess_1',
        ip: '203.0.113.7',
        action: 'inbox.reply',
        operatorUserId: 'op_1',
        targetType: 'conversation',
        targetId: 'conv_1',
        metadata: { messageId: 'msg_1' },
      },
    })
  })

  it('stores nulls for missing fields and leaves metadata out', async () => {
    await writeAdminAudit(null, { action: 'admin.login_failed', metadata: null })
    expect(m.create).toHaveBeenCalledWith({
      data: { sessionId: null, ip: null, action: 'admin.login_failed', operatorUserId: null, targetType: null, targetId: null },
    })
  })

  it('never throws when the insert rejects, and logs neither metadata nor the error message', async () => {
    const failure = new Error('insert failed for text: secret user message')
    failure.name = 'PrismaClientKnownRequestError'
    m.create.mockRejectedValue(failure)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(writeAdminAudit(ctx, { action: 'inbox.reply', metadata: { text: 'secret user message' } })).resolves.toBeUndefined()
      expect(error).toHaveBeenCalledWith('[admin-audit] write_failed', { action: 'inbox.reply', error: 'PrismaClientKnownRequestError' })
      expect(JSON.stringify(error.mock.calls)).not.toContain('secret user message')
    } finally {
      error.mockRestore()
    }
  })

  it('never throws when prisma throws synchronously', async () => {
    m.create.mockImplementation(() => {
      throw new TypeError('client not initialized')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(writeAdminAudit(ctx, { action: 'operator.create', operatorUserId: 'op_1' })).resolves.toBeUndefined()
      expect(error).toHaveBeenCalledWith('[admin-audit] write_failed', { action: 'operator.create', error: 'TypeError' })
    } finally {
      error.mockRestore()
    }
  })
})
