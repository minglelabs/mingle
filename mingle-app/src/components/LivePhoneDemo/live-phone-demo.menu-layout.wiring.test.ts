import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import { roomMenuVoiceSettingsLabel } from '@/i18n/room-menu-copy'

const source = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const between = (from: string, to: string) => {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start + from.length)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

// The room menu, first screen: people on top, then the room, one row for the
// interpreting and voice settings, export and feedback at the end.
const firstScreen = between('data-qa="live-demo-menu-panel"', 'data-qa="live-demo-voice-settings-page"')
const voiceSettingsPage = between('data-qa="live-demo-voice-settings-page"', "animate={menuContentScreen === 'feedback'")

describe('room menu layout', () => {
  it('starts with the people in the room, an invite button and the share link', () => {
    expect(firstScreen).toContain('data-qa="live-demo-menu-people"')
    expect(firstScreen).toContain('onOpenProfile?.(member.userId)')
    expect(firstScreen).toContain('data-qa="live-demo-menu-invite"')
    expect(firstScreen).toContain('data-qa="live-demo-menu-share-link"')
    expect(source).toContain("pushMenuHistoryEntry(2, 'invite')")
  })

  it('keeps the settings off the first screen, behind one row', () => {
    expect(firstScreen).toContain('data-qa="live-demo-menu-voice-settings"')
    for (const moved of ['textSizeLabel', 'firstRunCopy.lengthMenuLabel', 'bubbleDisplayCopy.displayModeLabel', 'translationModelLabel', 'ttsModelLabel', 'live-demo-menu-earphone-microphone', 'handleDefaultDisplayLanguageMenuItemPress']) {
      expect(firstScreen).not.toContain(moved)
      expect(voiceSettingsPage).toContain(moved)
    }
  })

  it('orders the rest: room management, Hash Rush, export, feedback', () => {
    const order = ['handleConversationManagementMenuItemPress}', 'data-qa="live-demo-hash-rush-menu-item"', 'handleExportConversationMenuItemPress()', 'handleFeedbackMenuItemPress}']
    const positions = order.map((marker) => firstScreen.indexOf(marker))
    expect(positions.every((position) => position > -1)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it('has no sign-out or account deletion: those are on the My tab', () => {
    expect(source).not.toContain('onLogout()')
    expect(source).not.toContain('setDeleteAccountDialogOpen(true)')
  })

  it('opens the display language and sentence length pages one level under the settings page', () => {
    expect(source).toContain("pushMenuHistoryEntry(menuScreen === 'voice-settings' ? 3 : 2, 'display-language')")
    expect(source).toContain("pushMenuHistoryEntry(menuScreen === 'voice-settings' ? 3 : 2, 'speech-length')")
    expect(source).toContain("if (preferredScreen === 'speech-length') return 'speech-length'")
  })

  it('names the settings row in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) expect(roomMenuVoiceSettingsLabel(locale)).toBeTruthy()
    expect(roomMenuVoiceSettingsLabel('ko')).toBe('통역·음성 설정')
  })
})
