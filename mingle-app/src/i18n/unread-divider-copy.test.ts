import { describe, expect, it } from 'vitest'
import { unreadDividerLabel } from './unread-divider-copy'

describe('unreadDividerLabel', () => {
  it('is localized and falls back to English', () => {
    expect(unreadDividerLabel('ko')).toBe('여기까지 읽었습니다')
    expect(unreadDividerLabel('zh-TW')).toBe('已讀到這裡')
    expect(unreadDividerLabel('xx')).toBe('You read up to here')
  })
})
