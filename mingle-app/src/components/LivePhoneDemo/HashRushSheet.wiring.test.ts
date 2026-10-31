import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sheetSource = readFileSync(new URL('./HashRushSheet.tsx', import.meta.url), 'utf8')
const liveDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const voicePanelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('hash rush sheet wiring', () => {
  it('takes the room slot under the top bar, above the room talk but under its strip, composer and menus', () => {
    expect(sheetSource).toContain('? { top: frame.topPx, height: frame.heightPx }')
    expect(sheetSource).toContain("top: 'calc(54px + env(safe-area-inset-top, 0px))'")
    expect(sheetSource).toContain('absolute inset-x-0 z-[45]')
    expect(sheetSource).not.toContain('aria-modal')
    const room = between(liveDemoSource, '<div className="relative flex min-h-0 flex-1 flex-col">', '{earphoneModeNoticeOpen && (')
    expect(room).toContain('ref={hashRushSlotRef}')
    expect(room).toContain("? 'relative z-[46] shrink-0 bg-[#fcfdfd]'")
    expect(room).toContain('style={hashRushOpen ? HASH_RUSH_CHAT_STRIP_SURFACE_STYLE : CHAT_SCROLL_SURFACE_STYLE}')
    expect(room).toContain("${hashRushOpen ? 'z-[46] ' : ''}")
    expect(room).toContain('{hashRushQuickChatVisible ? (')
    expect(liveDemoSource).toContain('const hashRushQuickChatVisible = hashRushOpen && Boolean(conversationId) && !isBlockedCounterpart')
    // The slot comes first, then the strip, quick chat and the composer.
    const slotAt = room.indexOf('ref={hashRushSlotRef}')
    const stripAt = room.indexOf('{/* Chat Area */}')
    const quickChatAt = room.indexOf('<HashRushQuickChatBar')
    const composerAt = room.indexOf('data-qa="live-demo-bottom-bar"')
    expect(slotAt).toBeGreaterThan(-1)
    expect(stripAt).toBeGreaterThan(slotAt)
    expect(quickChatAt).toBeGreaterThan(stripAt)
    expect(composerAt).toBeGreaterThan(quickChatAt)
    expect(liveDemoSource).toContain('frame={hashRushSheetFrame}')
    expect(liveDemoSource).toContain('ref={liveDemoRootRef}')
  })

  it('keeps the sheet still while a keyboard is up', () => {
    expect(liveDemoSource).toContain('held: keyboardViewportInsetPx > 0 || (isComposerOpen && isComposerTextareaFocused),')
    expect(sheetSource).toContain('if (!held) scheduleRef.current()')
    expect(sheetSource).toContain('setFrame((current) => resolveHashRushSheetFrame(current, {')
  })

  it('shows the room in one bubble per message while up, without saving it', () => {
    expect(liveDemoSource).toContain('const roomBubbleDisplayMode = resolveHashRushBubbleDisplayMode(bubbleDisplayMode, hashRushOpen)')
    expect(liveDemoSource).toContain('bubbleDisplayMode={roomBubbleDisplayMode}')
    expect(liveDemoSource).not.toMatch(/setBubbleDisplayMode\([^)]*roomBubbleDisplayMode/)
    expect(liveDemoSource).not.toMatch(/bubbleDisplayMode:\s*roomBubbleDisplayMode/)
  })

  it('sends quick chat through the room send path', () => {
    const quickChat = between(liveDemoSource, 'const handleHashRushQuickChat = useCallback(', '}, [composerCopy.manualSpeakerLabel, submitExternalUtterance])')
    expect(quickChat).toContain('submitExternalUtterance({')
    expect(liveDemoSource).toContain('<HashRushQuickChatBar uiLocale={uiLocale} onSend={handleHashRushQuickChat} />')
    expect(sheetSource).toContain('onPointerDown={(event) => event.preventDefault()}')
  })

  it('tells the game the room talk on ready and as it comes', () => {
    expect(liveDemoSource).toContain('chatEntries={hashRushChatEntries}')
    expect(liveDemoSource).toContain('? buildHashRushChatEntries({')
    const ready = between(sheetSource, "if (message.type === 'ready') {", "} else if (message.type === 'keyboard') {")
    expect(ready).toContain('startChatFeed()')
    expect(sheetSource).toContain('advanceHashRushChatFeed(feed, chatEntries)')
    expect(sheetSource).toContain('for (const entry of posts) postToGame(hashRushChatMessage(entry))')
  })

  it('holds the room talk strip at its newest line', () => {
    const follow = between(liveDemoSource, 'const followNewMessage = autoScrollState.shouldAutoScroll || (', 'if (!followNewMessage')
    expect(follow).toContain('hashRushOpen')
    expect(follow).toContain('autoScrollState.hasNewMessage')
    expect(liveDemoSource).toContain('{showScrollToBottom && !hashRushOpen && (')
  })

  it('drags only from its top row and keeps the room swipe off the sheet', () => {
    expect(sheetSource).toContain('dragListener={false}')
    expect(sheetSource).toContain('onPointerDown={(event) => dragControls.start(event)}')
    expect(sheetSource).toContain('onPointerDown={(event) => event.stopPropagation()}')
    expect(sheetSource).toContain('onTouchStart={(event) => event.stopPropagation()}')
  })

  it('holds the swipe-back, Android back, banner and toasts while up', () => {
    expect(sheetSource).toContain('return registerNativeEdgeSwipeSuppression()')
    expect(sheetSource).toContain('return registerNativeBackHandler(() => {')
    expect(sheetSource).toContain('useNativeBannerSuppression(open)')
    expect(sheetSource).toContain('return holdToastsHidden()')
    expect(globalCss).toContain('html[data-hash-rush-open="true"] [data-sonner-toaster]')
  })

  it('posts to the game window on its origin and allows autoplay', () => {
    expect(sheetSource).toContain('target.postMessage(message, GAME_ORIGIN)')
    expect(sheetSource).toContain('allow="autoplay; fullscreen"')
    expect(sheetSource).toContain('onLoad={syncGame}')
  })

  it('keeps the game alive while lowered and drops it when the room is left', () => {
    const render = between(liveDemoSource, '{/* Hash Rush, played inside this room', '{/* Header */}')
    expect(render).toContain('{hashRushActive && conversationId ? (')
    expect(render).toContain('open={hashRushOpen}')
    expect(render).toContain('voiceActive={voiceTalkState.connected}')
    const leave = between(liveDemoSource, '// Leaving the room (back to the list', '}, [isVisible])')
    expect(leave).toContain('setHashRushOpen(false)')
    expect(leave).toContain('setHashRushActive(false)')
  })

  it('opens from the menu after closing the menu through its history', () => {
    const menuItem = between(liveDemoSource, 'data-qa="live-demo-hash-rush-menu-item"', '</button>')
    expect(menuItem).toContain('requestCloseMenuPanel()')
    expect(menuItem).not.toContain('setMenuOpen(false)')
    expect(menuItem).toContain('setHashRushActive(true)')
  })

  it('lifts the chat composer only for its own keyboard and folds the voice talk panel', () => {
    expect(liveDemoSource).toContain('const activeKeyboardInsetPx = isComposerOpen && (!hashRushOpen || isComposerTextareaFocused) ? keyboardViewportInsetPx : 0')
    expect(liveDemoSource).toContain('onFocus={handleComposerTextareaFocus}')
    expect(liveDemoSource).toContain('onBlur={handleComposerTextareaBlur}')
    expect(liveDemoSource).toContain('forceFolded={hashRushOpen}')
    expect(voicePanelSource).toContain('if (forceFolded) setFolded(true)')
    expect(voicePanelSource).toContain("const connected = phase === 'connected'")
  })
})
