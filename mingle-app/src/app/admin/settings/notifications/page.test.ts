import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminNotifyTargetDto } from '@/app/admin/settings/_lib/notify-targets'

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listAdminNotifyTargets: vi.fn(),
}))

vi.mock('@/server/admin/guard', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('@/app/admin/settings/_lib/notify-targets', () => ({ listAdminNotifyTargets: m.listAdminNotifyTargets }))

import AdminNotificationSettingsPage from './page'
import { NotifyTargetsManager } from './notify-targets-manager'

function target(overrides: Partial<AdminNotifyTargetDto> = {}): AdminNotifyTargetDto {
  return {
    userId: 'staff_1',
    handle: 'mina',
    name: 'Mina Kim',
    image: null,
    imageCropScale: null,
    imageCropX: null,
    imageCropY: null,
    active: true,
    deviceCount: 2,
    createdAt: '2026-09-30T09:00:00.000Z',
    ...overrides,
  }
}

describe('/admin/settings/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requireAdmin.mockResolvedValue({ sessionId: null, ip: null, userAgent: null })
    m.listAdminNotifyTargets.mockResolvedValue([target()])
  })

  it('checks the admin session first (returning here after login) and shows the guidance', async () => {
    const html = renderToStaticMarkup(await AdminNotificationSettingsPage())
    expect(m.requireAdmin).toHaveBeenCalledWith('/admin/settings/notifications')
    expect(m.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(m.listAdminNotifyTargets.mock.invocationCallOrder[0])
    expect(html).toContain('알림 받을 계정')
    expect(html).toContain(
      '이 계정으로 Mingle 앱에 로그인된 기기에서 알림을 받습니다. 알림을 누르면 앱 안에서 관리자 인박스가 열리고, 처음 한 번은 관리자 로그인이 필요합니다.',
    )
    expect(html).toContain('@mina')
  })

  it('does not load targets when the admin session check redirects', async () => {
    m.requireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin'))
    await expect(AdminNotificationSettingsPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(m.listAdminNotifyTargets).not.toHaveBeenCalled()
  })

  it('lists each target with its handle and whether its devices will ring', () => {
    const html = renderToStaticMarkup(createElement(NotifyTargetsManager, {
      initialTargets: [
        target(),
        target({ userId: 'staff_2', handle: 'jun', name: null, deviceCount: 0, isOfficial: true }),
        target({ userId: 'staff_3', handle: 'old', name: 'Old', active: false }),
      ],
    }))
    expect(html).toContain('Mina Kim')
    expect(html).toContain('기기 2대에서 알림을 받습니다.')
    expect(html).toContain('로그인하고 알림을 허용하세요')
    expect(html).toContain('비활성 계정이라 알림을 받지 않습니다.')
    expect(html).toContain('공식')
    expect(html).toContain('aria-label="Mina Kim 알림 해제"')
    expect(html).not.toContain('<table')
  })

  it('shows an empty state when nobody gets alerts yet', () => {
    const html = renderToStaticMarkup(createElement(NotifyTargetsManager, { initialTargets: [] }))
    expect(html).toContain('아직 알림을 받을 계정이 없습니다.')
  })
})
