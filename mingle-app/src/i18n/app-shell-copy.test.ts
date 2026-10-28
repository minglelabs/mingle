import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n'
import { appShellCopy, type AppShellCopy } from './app-shell-copy'

const KEYS: (keyof AppShellCopy)[] = [
  'preparing', 'cameraPermissionTitle', 'cameraPermissionBody', 'cameraUnavailableTitle', 'cameraUnavailableBody', 'retry',
]

describe('app shell copy', () => {
  it('defines every string for all 15 primary UI locales', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      const copy = appShellCopy(locale)
      for (const key of KEYS) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('')
    }
  })

  it('falls back to English for an unsupported locale', () => {
    expect(appShellCopy('pl').retry).toBe('Try again')
  })
})
