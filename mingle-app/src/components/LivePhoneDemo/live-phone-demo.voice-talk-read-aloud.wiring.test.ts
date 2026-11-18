import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const liveDemo = readFileSync(join(__dirname, 'LivePhoneDemo.tsx'), 'utf8')
const panel = readFileSync(join(__dirname, 'VoiceTalkPanel.tsx'), 'utf8')

describe('voice talk read-aloud, like speaker / earphone mode', () => {
  it('asks the read language when read-aloud is turned on in a call', () => {
    expect(liveDemo).toContain('if (on) setVoiceTalkListenNoticeOpen(true)')
    expect(liveDemo).toContain('{voiceTalkListenNoticeOpen && voiceTalkState.joined && !earphoneModeNoticeOpen && (')
    expect(liveDemo).toContain('onSelectReadLanguage={handleEarphoneModeReadLanguageSelect}\n                onConfirm={() => setVoiceTalkListenNoticeOpen(false)}')
  })

  it('reads in the same language speaker / earphone mode would, sent to the call once connected', () => {
    expect(liveDemo).toContain('if (!voiceTalkState.connected || !earphoneModeReadLanguage) return\n    setVoiceTalkListenLang(earphoneModeReadLanguage)')
    expect(panel).toContain("post({ type: 'native_voice_set', payload: { listenLang: lang } })")
  })

  it('shows the playing indicator on the bubble the call is reading', () => {
    expect(panel).toContain('onReadingChangeRef.current?.(readingLineId && listenLang ? { lineId: readingLineId, lang: listenLang } : null)')
    expect(liveDemo).toContain('buildTranslationBubblePlaybackKey(buildVoiceCaptionClientMessageId(voiceTalkReading.lineId), voiceTalkReading.lang)')
    expect(liveDemo).toContain(': voiceTalkReadingPlaybackKey ? { playbackKey: voiceTalkReadingPlaybackKey, started: true } : null,')
  })
})
