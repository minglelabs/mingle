import { createElement, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EarphoneModeNoticeContent from './EarphoneModeNotice'
import LanguageRadioOption from './LanguageRadioOption'
import {
  formatLivePhoneDemoEarphoneModeReadLanguageNotice,
  resolveLivePhoneDemoEarphoneModeCopy,
} from '@/i18n/live-phone-demo-earphone-mode-copy'
import { getSttLanguageDisplayName } from '@/lib/stt-languages'

const roomLanguages = ['ko', 'en', 'ja']

function renderNotice(overrides: Partial<ComponentProps<typeof EarphoneModeNoticeContent>> = {}): string {
  return renderToStaticMarkup(createElement(EarphoneModeNoticeContent, {
    uiLocale: 'ko',
    copy: resolveLivePhoneDemoEarphoneModeCopy('ko'),
    earphonesConnected: true,
    languages: roomLanguages,
    readLanguage: 'ko',
    onSelectReadLanguage: () => {},
    onConfirm: () => {},
    ...overrides,
  }))
}

function languageList(html: string): string {
  const start = html.indexOf('role="radiogroup"')
  expect(start).toBeGreaterThanOrEqual(0)
  return html.slice(start)
}

describe('earphone mode notice language selector', () => {
  it('lists the room languages with the display-language page names, L preselected', () => {
    const list = languageList(renderNotice())
    expect([...list.matchAll(/role="radio" aria-checked="(true|false)"/g)].map((match) => match[1])).toEqual(['true', 'false', 'false'])
    let previous = -1
    for (const language of roomLanguages) {
      const index = list.indexOf(`>${getSttLanguageDisplayName(language, 'ko')}<`)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
  })

  it('renders exactly the display-language page row', () => {
    const html = renderNotice({ readLanguage: 'en' })
    const row = renderToStaticMarkup(createElement(LanguageRadioOption, {
      language: 'en',
      label: getSttLanguageDisplayName('en', 'ko')!,
      selected: true,
      onSelect: () => {},
    }))
    expect(html).toContain(row)
    expect(row).toContain('border-amber-300 bg-amber-50/70')
  })

  it('updates the sentence with the selection and keeps the existing lines', () => {
    const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')
    const korean = renderNotice({ readLanguage: 'ko' })
    expect(korean).toContain('한국어로 번역된 모든 문장을 한국어 음성으로 들려드려요. 한국어로 말한 문장은 읽지 않아요.')
    expect(korean).toContain(copy.noticeBody)
    expect(korean).toContain('data-earphone-status="connected"')
    expect(korean).toContain(copy.earphoneStatusConnectedLabel)
    expect(korean).not.toContain(copy.earphoneStatusDisconnectedLabel)

    const japanese = renderNotice({ readLanguage: 'ja', earphonesConnected: false })
    expect(japanese).toContain(formatLivePhoneDemoEarphoneModeReadLanguageNotice('ko', 'ja'))
    expect(japanese).not.toContain('한국어로 번역된')
    expect(japanese).toContain('data-earphone-status="disconnected"')
    expect(japanese).toContain(copy.earphoneStatusDisconnectedLabel)
    expect(japanese).not.toContain(copy.earphoneStatusConnectedLabel)
    expect([...languageList(japanese).matchAll(/aria-checked="(true|false)"/g)].map((match) => match[1])).toEqual(['false', 'false', 'true'])
  })

  it('reports the tapped language', () => {
    const onSelect = vi.fn()
    const row = LanguageRadioOption({ language: 'ja', label: 'Japanese', selected: false, onSelect }) as ReactElement<{ onClick: () => void }>
    row.props.onClick()
    expect(onSelect).toHaveBeenCalledWith('ja')
  })

  it('shows no list or sentence for a room without languages', () => {
    const html = renderNotice({ languages: [], readLanguage: null })
    expect(html).not.toContain('role="radiogroup"')
    expect(html).not.toContain('data-earphone-mode-read-language-notice')
    expect(html).toContain(resolveLivePhoneDemoEarphoneModeCopy('ko').noticeConfirmLabel)
  })
})

describe('earphone mode notice capture-source choice', () => {
  const copy = resolveLivePhoneDemoEarphoneModeCopy('ko')

  function captureSourceList(html: string): string {
    const start = html.indexOf('data-qa="live-demo-capture-source"')
    expect(start).toBeGreaterThanOrEqual(0)
    return html.slice(start)
  }

  it('is hidden on a shell that can only capture the microphone', () => {
    const html = renderNotice()
    expect(html).not.toContain('data-qa="live-demo-capture-source"')
    expect(html).not.toContain(copy.captureSourceLabel)
    expect(html).not.toContain(copy.captureSourceDeviceAudioHint)
    // A source without a handler is not a choice either.
    expect(renderNotice({ captureSource: 'microphone' })).not.toContain('data-qa="live-demo-capture-source"')
  })

  it('offers microphone and device audio, microphone first, with the pick checked', () => {
    const list = captureSourceList(renderNotice({ captureSource: 'microphone', onSelectCaptureSource: () => {}, initialStep: 2 }))
    expect([...list.matchAll(/role="radio" aria-checked="(true|false)" data-capture-source="([a-z_]+)"/g)]
      .map((match) => [match[2], match[1]])).toEqual([['microphone', 'true'], ['device_audio', 'false']])
    expect(list.indexOf(copy.captureSourceMicrophoneLabel)).toBeLessThan(list.indexOf(copy.captureSourceDeviceAudioLabel))

    const picked = captureSourceList(renderNotice({ captureSource: 'device_audio', onSelectCaptureSource: () => {}, initialStep: 2 }))
    expect([...picked.matchAll(/role="radio" aria-checked="(true|false)" data-capture-source="([a-z_]+)"/g)]
      .map((match) => [match[2], match[1]])).toEqual([['microphone', 'false'], ['device_audio', 'true']])
  })

  it('explains the screen-capture prompt only while device audio is picked', () => {
    expect(renderNotice({ captureSource: 'microphone', onSelectCaptureSource: () => {}, initialStep: 2 }))
      .not.toContain(copy.captureSourceDeviceAudioHint)
    const picked = renderNotice({ captureSource: 'device_audio', onSelectCaptureSource: () => {}, initialStep: 2 })
    expect(picked).toContain(copy.captureSourceDeviceAudioHint)
    // The button the hint names is the room's literal Start button.
    expect(copy.captureSourceDeviceAudioHint).toContain('Start')
  })

  it('explains the iOS broadcast sheet on iOS', () => {
    const picked = renderNotice({
      captureSource: 'device_audio',
      onSelectCaptureSource: () => {},
      deviceAudioViaBroadcast: true,
      initialStep: 2,
    })
    expect(picked).toContain(copy.captureSourceDeviceAudioHintIos)
    expect(picked).not.toContain(copy.captureSourceDeviceAudioHint)
    expect(copy.captureSourceDeviceAudioHintIos).toContain('Start')
    // The translation plays in both ears now (the echo canceller keeps it out of the capture).
    expect(copy.captureSourceDeviceAudioHintIos).not.toContain('왼쪽 이어폰')
    // Still nothing while the microphone is picked.
    expect(renderNotice({ captureSource: 'microphone', onSelectCaptureSource: () => {}, deviceAudioViaBroadcast: true, initialStep: 2 }))
      .not.toContain(copy.captureSourceDeviceAudioHintIos)
  })

  it('asks the read language on page 1/2 and the capture source on page 2/2', () => {
    const first = renderNotice({ captureSource: 'device_audio', onSelectCaptureSource: () => {} })
    expect(first).toContain('data-earphone-mode-notice-step="1"')
    expect(first).toContain('>1/2<')
    expect(first).not.toContain('data-qa="live-demo-capture-source"')
    expect(first).toContain('data-earphone-mode-notice-next')
    expect(first).toContain(copy.noticeNextLabel)
    expect([...first.matchAll(/role="radio" aria-checked="(true|false)"/g)].map((match) => match[1]))
      .toEqual(['true', 'false', 'false'])

    const second = renderNotice({ captureSource: 'device_audio', onSelectCaptureSource: () => {}, initialStep: 2 })
    expect(second).toContain('data-earphone-mode-notice-step="2"')
    expect(second).toContain('>2/2<')
    expect(second).toContain('data-earphone-mode-notice-back')
    expect(second).toContain(copy.noticeBackLabel)
    expect(second).toContain(copy.noticeConfirmLabel)
    expect(second).not.toContain('data-earphone-mode-notice-next')
  })

  it('shows the large title, the earphone rule and the connection state on both pages', () => {
    for (const initialStep of [1, 2] as const) {
      const html = renderNotice({ captureSource: 'device_audio', onSelectCaptureSource: () => {}, initialStep, earphonesConnected: false })
      expect(html).toMatch(new RegExp(`<h2 class="text-xl font-bold[^"]*">${copy.label}</h2>`))
      expect(html.indexOf(copy.label)).toBeLessThan(html.indexOf(copy.noticeBody))
      expect(html.indexOf(copy.noticeBody)).toBeLessThan(html.indexOf('data-earphone-status="disconnected"'))
    }
  })

  it('stays a single page with a confirm button without a capture-source choice', () => {
    const html = renderNotice()
    expect(html).toContain('data-earphone-mode-notice-step="1"')
    expect(html).not.toContain('data-earphone-mode-notice-step-indicator')
    expect(html).not.toContain('data-earphone-mode-notice-next')
    expect(html).toContain(copy.noticeConfirmLabel)
    // Page 2 cannot be forced open without the choice.
    expect(renderNotice({ initialStep: 2 })).toContain('data-earphone-mode-notice-step="1"')
  })
})
