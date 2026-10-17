import { describe, expect, it } from 'vitest'
import {
  describeNotifyTargetAdded,
  describeNotifyTargetDevices,
  describeNotifyTargetError,
  describeNotifyTargetRemoved,
} from './notify-target-copy'

describe('notify target copy', () => {
  it('explains every refusal in Korean and falls back for unknown failures', () => {
    for (const code of ['invalid_handle', 'not_found', 'operator_account', 'inactive_account', 'guest_account']) {
      const text = describeNotifyTargetError(422, code)
      expect(text).toMatch(/[가-힣]/)
      expect(text).not.toBe(describeNotifyTargetError(500, 'server_error'))
    }
    expect(describeNotifyTargetError(0, null)).toBe('저장하지 못했습니다. 잠시 후 다시 시도하세요.')
    expect(describeNotifyTargetError(401, 'Unauthorized')).toContain('다시 로그인')
  })

  it('says whether the account will actually get alerts', () => {
    expect(describeNotifyTargetDevices({ active: true, deviceCount: 2 })).toEqual({ text: '기기 2대에서 알림을 받습니다.', ready: true })
    expect(describeNotifyTargetDevices({ active: true, deviceCount: 0 })).toMatchObject({ ready: false })
    expect(describeNotifyTargetDevices({ active: true, deviceCount: 0 }).text).toContain('로그인하고 알림을 허용')
    expect(describeNotifyTargetDevices({ active: false, deviceCount: 3 })).toMatchObject({ ready: false })
  })

  it('confirms adds and removals by handle', () => {
    expect(describeNotifyTargetAdded('mina', true)).toBe('@mina 계정을 추가했습니다.')
    expect(describeNotifyTargetAdded('mina', false)).toBe('@mina 계정은 이미 알림을 받고 있습니다.')
    expect(describeNotifyTargetRemoved('mina')).toBe('@mina 계정의 알림을 해제했습니다.')
  })
})
