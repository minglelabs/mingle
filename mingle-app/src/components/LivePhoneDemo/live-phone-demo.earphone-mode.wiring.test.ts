import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const noticeSource = readFileSync(new URL('./EarphoneModeNotice.tsx', import.meta.url), 'utf8')
const logicSource = readFileSync(new URL('./live-phone-demo.earphone-mode.logic.ts', import.meta.url), 'utf8')
const composerSource = readFileSync(new URL('./ConversationImageComposer.tsx', import.meta.url), 'utf8')
const legacySource = readFileSync(new URL('./LivePhoneDemoLegacy.tsx', import.meta.url), 'utf8')
const ttsSettingsSource = readFileSync(new URL('../../context/tts-settings.tsx', import.meta.url), 'utf8')

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('earphone mode wiring', () => {
  it('keeps the global TTS setting fixed off and the legacy UI on its single key', () => {
    expect(ttsSettingsSource).toContain('const FIXED_TTS_ENABLED = false')
    expect(liveDemoSource).toContain('enableTts: enableAutoTTS && isSoundEnabled,')
    expect(legacySource).toContain('speakingPlaybackKey={speakingItem?.playbackKey ?? pendingManualTtsTarget?.playbackKey}')
    expect(legacySource).not.toContain('pendingPlaybackKeys')
    expect(legacySource).not.toContain('earphone')
  })

  it('shows the controls only when the shell reports audio routes', () => {
    const voiceBar = between(liveDemoSource, 'key="default-bottom-bar"', 'data-qa="live-demo-mic-button"')
    expect(voiceBar).toContain('{earphoneModeGate.controlVisible && (')
    expect(voiceBar).toContain('data-qa="live-demo-earphone-mode-toggle"')
    expect(voiceBar).toContain('aria-pressed={isEarphoneModeOn}')
    expect(voiceBar).toContain("gridTemplateColumns: earphoneModeGate.controlVisible ? 'minmax(0, 1fr) auto minmax(0, 1fr)' : '1fr auto 1fr'")
    const menuItem = between(liveDemoSource, 'const earphoneModeMenuItem = useMemo', '), [')
    expect(menuItem).toContain('earphoneModeGate.controlVisible')
    expect(menuItem).toContain(': undefined')
  })

  it('reads only in the visible room, after history hydration, with the gate open', () => {
    const armCondition = between(liveDemoSource, 'const shouldArmEarphoneAutoRead =', 'const synthesizeBubbleTtsViaApiRef')
    expect(armCondition).toContain('earphoneModeGate.autoReadActive')
    expect(armCondition).toContain('isVisible')
    expect(armCondition).toContain('!isBlockedCounterpart')
    expect(armCondition).toContain('isEarphoneAutoReadHistoryReady')
    expect(liveDemoSource).toContain('const isEarphoneAutoReadHistoryReady = isStorageHydrated && !isInitialServerHydrationPending')
  })

  it('re-checks the gate from the stores on every player step', () => {
    const step = between(liveDemoSource, 'const processTtsQueue = useCallback(() => {', 'const queue = ttsQueueRef.current')
    expect(step).toContain('!earphoneAutoReadArmedRef.current || !isEarphoneAutoReadGateOpenNow()')
    expect(step).toContain('keepManualTtsQueueItems(ttsQueueRef.current)')
    const gate = between(liveDemoSource, 'function isEarphoneAutoReadGateOpenNow(): boolean {', 'function bytesToBase64')
    expect(gate).toContain('getNativeAudioRouteSnapshot()')
    expect(gate).toContain('getEarphoneModePreferenceSnapshot()')
  })

  it('flags only auto clips with stopOnEarphoneDisconnect and sizes the native watchdog by clip length', () => {
    const nativePlay = between(liveDemoSource, 'const playViaNativeBridge = async () => {', 'const playViaHtmlAudio = async () => {')
    expect(nativePlay).toContain("...(next.mode === 'auto' ? { stopOnEarphoneDisconnect: true } : {})")
    expect(nativePlay).toContain('resolveNativeTtsWatchdogTimeoutMs({')
    expect(nativePlay).toContain('shouldTreatNativeTtsPostAsStart(isNativeAudioRouteSupported(getNativeAudioRouteSnapshot()))')
    expect(liveDemoSource).not.toContain('NATIVE_TTS_EVENT_TIMEOUT_MS')
  })

  it('marks HTML playback as playing on the playing event', () => {
    const htmlPlay = between(liveDemoSource, 'const playViaHtmlAudio = async () => {', '// NativeTTSModule은 iOS 전용')
    expect(htmlPlay).toContain('audio.onplaying = () => {')
    expect(htmlPlay).toContain('markPlaybackStarted()')
  })

  it('awaits a fresh route before Android auto audio and leaves manual audio unchanged', () => {
    const htmlPlay = between(liveDemoSource, 'const playViaHtmlAudio = async () => {', '// NativeTTSModule은 iOS 전용')
    expect(htmlPlay).toContain("if (next.mode === 'auto' && isNativeApp())")
    expect(htmlPlay).toContain('const connected = await confirmNativeEarphonesConnected()')
    expect(htmlPlay).toContain('!connected || !earphoneAutoReadArmedRef.current || !isEarphoneAutoReadGateOpenNow()')
    expect(htmlPlay.indexOf('await confirmNativeEarphonesConnected()')).toBeLessThan(htmlPlay.indexOf('audio.play()'))
  })

  it('retries rejected autoplay through the queue instead of resuming the stale element', () => {
    const rejectedPlay = between(liveDemoSource, 'audio.play().catch(() => {', '// NativeTTSModule은 iOS 전용')
    expect(rejectedPlay).toContain('cleanupCurrentAudio()')
    expect(rejectedPlay).toContain('ttsQueueRef.current.unshift(next)')
    const resume = between(liveDemoSource, 'const resumeTtsPlayback = useCallback', 'const clearStopClickResumeTimers')
    expect(resume).toContain('isTtsProcessingRef.current && currentTtsItemRef.current')
    expect(resume).toContain("current.getAttribute('src')")
  })

  it('closes the gate on a native earphone stop before the queue moves', () => {
    const listener = between(liveDemoSource, 'const handleNativeTtsEvent = (event: Event) => {', 'window.addEventListener(NATIVE_TTS_EVENT')
    expect(listener).toContain('applyNativeTtsEvent(')
    expect(listener).toContain('markEarphonesDisconnected: markNativeAudioRouteDisconnected,')
    expect(listener).toContain('advanceQueue: () => processTtsQueueRef.current(),')
  })

  it('stops only the auto clip on a falling edge and keeps manual playback', () => {
    const stop = between(liveDemoSource, 'const stopEarphoneAutoTtsPlayback = useCallback(() => {', '}, [cleanupCurrentAudio')
    expect(stop).toContain('keepManualTtsQueueItems(ttsQueueRef.current)')
    expect(stop).toContain('shouldStopCurrentClipOnEarphoneFallingEdge(currentTtsItemRef.current)')
    expect(liveDemoSource).toContain('const closeWhenGateCloses = () => {')
    expect(liveDemoSource).toContain('subscribeNativeAudioRoute(closeWhenGateCloses)')
  })

  it('shows the notice on every off -> on and re-reads the route', () => {
    const toggle = between(liveDemoSource, 'const handleEarphoneModeToggle = useCallback(() => {', '}, [primeAudioPlayback])')
    expect(toggle).toContain('resolveEarphoneModeToggle(getEarphoneModePreferenceSnapshot())')
    expect(toggle).toContain('if (toggle.requestRoute) requestNativeAudioRoute()')
    expect(toggle).toContain('if (toggle.showNotice) setEarphoneModeNoticeOpen(true)')
    expect(liveDemoSource).toContain('<MessageMediaDialog title={earphoneModeCopy.label} onClose={closeEarphoneModeNotice}>')
    expect(liveDemoSource).toContain('earphonesConnected={nativeAudioRoute.earphonesConnected}')
    expect(noticeSource).toContain('{!earphonesConnected && (')
  })

  it('reads one language per session: picked in the notice, React state only, dropped on every edge', () => {
    expect(liveDemoSource).toContain(
      'const [earphoneModeReadLanguagePick, setEarphoneModeReadLanguagePick] = useState<EarphoneModeReadLanguagePick | null>(null)',
    )
    const reset = between(liveDemoSource, 'useEffect(() => subscribeEarphoneModePreference(() => {', '}), [])')
    expect(reset).toContain('setEarphoneModeReadLanguagePick(null)')
    const select = between(liveDemoSource, 'const handleEarphoneModeReadLanguageSelect = useCallback(', '}, [earphoneModeConversationKey])')
    expect(select).toContain('setEarphoneModeReadLanguagePick({ conversationKey: earphoneModeConversationKey, language })')
    expect(select).not.toMatch(/localStorage|sessionStorage|writeEarphoneMode|fetch\(/)
    const readLanguage = between(liveDemoSource, 'const earphoneModeReadLanguage = resolveEarphoneModeReadLanguage({', '})')
    expect(readLanguage).toContain('pick: earphoneModeReadLanguagePick,')
    expect(readLanguage).toContain('display: earphoneModeDisplay,')
    const snapshot = between(liveDemoSource, 'const earphoneAutoReadSnapshot = useMemo<EarphoneAutoReadSnapshot>(() => ({', '}), [')
    expect(snapshot).toContain('readLanguage: earphoneModeReadLanguage,')
    expect(snapshot).toContain('languageOrder: normalizedDisplayLanguageOptions,')
    // The default comes from what every bubble row receives.
    const display = between(liveDemoSource, 'const earphoneModeDisplay = useMemo<EarphoneModeDisplayContext>(() => ({', '}), [')
    expect(display).toContain('defaultDisplayLanguage: resolvedDefaultDisplayLanguage,')
    expect(display).toContain('languageOrder: normalizedDisplayLanguageOptions,')
    // The only thing earphone mode ever stores is the on/off toggle.
    expect(logicSource.match(/setItem\(/g)).toHaveLength(1)
  })

  it('offers the display-language page list, with the same rows, in the notice', () => {
    const notice = between(liveDemoSource, '<EarphoneModeNoticeContent', '/>')
    expect(notice).toContain('languages={normalizedDisplayLanguageOptions}')
    expect(notice).toContain('readLanguage={earphoneModeReadLanguage}')
    expect(notice).toContain('onSelectReadLanguage={handleEarphoneModeReadLanguageSelect}')
    const page = between(liveDemoSource, "open={menuOpen && menuScreen === 'display-language'}", '</SlideSurface>')
    expect(page).toContain('{normalizedDisplayLanguageOptions.map((language) => (')
    expect(page).toContain('<LanguageRadioOption')
    expect(page).toContain('label={getSttLanguageDisplayName(language, uiLocale) || language}')
    expect(page).toContain('selected={resolvedDefaultDisplayLanguage === language}')
    expect(noticeSource).toContain('<LanguageRadioOption')
    expect(noticeSource).toContain('label={getSttLanguageDisplayName(language, uiLocale) || language}')
  })

  it('lets a manual tap interrupt auto playback without clearing the auto queue', () => {
    const manual = between(liveDemoSource, 'const handlePlayBubbleTts = useCallback(async (', 'const handlePlayOriginalBubbleTts')
    expect(manual).toContain('manualTtsPendingSeqRef.current = requestSeq')
    expect(manual).toContain('earphoneAutoReadControllerRef.current?.consumePlaybackKey(target.playbackKey)')
    expect(manual).toContain('scheduleEarphoneAutoReadPump()')
  })

  it('puts the earphone row between the photo row and the voice-mode row', () => {
    const menu = between(composerSource, '{open && !chosen && createPortal', 'document.body,')
    const photoIndex = menu.indexOf('copy.choose')
    const earphoneIndex = menu.indexOf('data-qa="live-demo-earphone-mode-menu-item"')
    const voiceIndex = menu.indexOf('copy.switchToVoiceMode')
    expect(photoIndex).toBeGreaterThanOrEqual(0)
    expect(earphoneIndex).toBeGreaterThan(photoIndex)
    expect(voiceIndex).toBeGreaterThan(earphoneIndex)
    expect(menu).toContain('aria-pressed={earphoneMode.enabled}')
    expect(composerSource).toContain('{onCloseKeyboard && earphoneMode?.enabled && (')
  })
})
