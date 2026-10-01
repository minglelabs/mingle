import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ConversationImageBubble from './ConversationImageBubble'
import { PhotoTranslationProvider, usePhotoTranslationRoom } from './photo-translation-context'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

function RoomProbe() {
  return createElement('pre', null, JSON.stringify(usePhotoTranslationRoom()))
}

const ROOM = { roomLanguages: ['ko', 'en'], defaultLanguage: 'ko', uiLocale: 'ko' }

describe('PhotoTranslationProvider', () => {
  it('provides the room to photo viewers in the chat list', () => {
    const html = renderToStaticMarkup(createElement(PhotoTranslationProvider, { ...ROOM, conversationId: 'c1', viewerUserId: 'u1' }, createElement(RoomProbe)))
    expect(html).toContain('{&quot;conversationId&quot;:&quot;c1&quot;,&quot;roomLanguages&quot;:[&quot;ko&quot;,&quot;en&quot;],&quot;defaultLanguage&quot;:&quot;ko&quot;,&quot;uiLocale&quot;:&quot;ko&quot;,&quot;viewerUserId&quot;:&quot;u1&quot;}')
  })

  it('provides nothing without a conversation or a signed-in viewer, and nothing outside it', () => {
    for (const props of [{ conversationId: undefined, viewerUserId: 'u1' }, { conversationId: 'c1', viewerUserId: null }]) {
      expect(renderToStaticMarkup(createElement(PhotoTranslationProvider, { ...ROOM, ...props }, createElement(RoomProbe)))).toBe('<pre>null</pre>')
    }
    expect(renderToStaticMarkup(createElement(RoomProbe))).toBe('<pre>null</pre>')
  })

  it('leaves the chat bubble markup unchanged while the viewer is closed', () => {
    const image = { conversationId: 'c1', messageId: 'm1', width: 945, height: 2048 }
    const bare = renderToStaticMarkup(createElement(ConversationImageBubble, { image, locale: 'ko' }))
    const provided = renderToStaticMarkup(createElement(PhotoTranslationProvider, { ...ROOM, conversationId: 'c1', viewerUserId: 'u1' },
      createElement(ConversationImageBubble, { image, locale: 'ko' })))
    expect(provided).toBe(bare)
    expect(provided).not.toContain('data-photo-translate-pill')
  })
})

describe('photo viewer wiring', () => {
  const bubble = read('./ConversationImageBubble.tsx')
  const viewer = read('./ConversationImageViewer.tsx')
  const zoomable = read('./ZoomableConversationImage.tsx')

  it('fetches only from the open viewer, for the photo on screen, and only when a room is provided', () => {
    expect(viewer.match(/usePhotoTranslationText\(/g)).toHaveLength(1)
    expect(bubble).not.toContain('usePhotoTranslationText')
    expect(bubble).toContain('{expanded && <ConversationImageViewer')
    expect(viewer).toContain('const room = usePhotoTranslationRoom()')
    expect(viewer).toContain('room && active && room.conversationId === active.conversationId ? room : null')
    const hook = between(viewer, 'function useActivePhotoTranslation', 'const CHROME_BUTTON_CLASS')
    expect(hook).toContain('conversationId: image.conversationId, messageId: image.messageId')
    // No room: no languages, so nothing is requested, and no overlay is offered.
    expect(hook).toContain('room ? buildPhotoTranslationOrder(room.roomLanguages, room.defaultLanguage) : NO_LANGUAGES')
    expect(hook).toContain('renderOverlay: room ? renderOverlay : undefined')
  })

  it('keeps the pill beside the viewport and the overlay inside the stage', () => {
    expect(zoomable).not.toContain('PhotoTranslateControl')
    const slide = between(viewer, '<ZoomableConversationImage', 'failure={failed')
    expect(slide).toContain('renderOverlay={isActive ? translation.renderOverlay : undefined}')
    expect(viewer.indexOf('<PhotoTranslateControl')).toBeGreaterThan(viewer.indexOf('</div>\n      </div>\n\n      <div className="pointer-events-none absolute inset-x-0 top-0'))
    expect(viewer).toContain('className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"')
    expect(read('./PhotoTranslateControl.tsx')).toContain('className="pointer-events-auto relative"')
    expect(viewer).toContain('disabled={dragProgress > 0}')
  })

  it('remembers the choice per photo and reads the translation to assistive tech outside role=img', () => {
    expect(viewer).toContain('photoTranslationMemoryKey({ apiNamespace: clientApiNamespace, viewerUserId: room?.viewerUserId, conversationId: image.conversationId, messageId: image.messageId })')
    expect(viewer).toContain('photoTranslationSelections.set(memoryKey, choice)')
    expect(viewer).toContain('resolvePhotoTranslationKeyedSnapshot(')
    expect(read('./use-photo-translation-text.ts')).toContain('resolvePhotoTranslationKeyedSnapshot(')
    expect(viewer).toContain('className="sr-only"')
    expect(viewer).not.toContain('localStorage')
  })

  it('says what it is waiting for: reading the photo text, then translating', () => {
    expect(viewer).toContain('resolvePhotoTranslationProgress({ response, toggle })')
    expect(viewer).toContain("scanning={progress === 'reading'}")
    expect(viewer).toContain("progress === 'translating' && language ? blocks.filter(block => blockNeedsTranslation(block, language))")
    expect(viewer).toContain("!toggle.visible && progress === 'reading'")
    expect(viewer).toContain('<PhotoTranslationStatusChip label={copy.readingText} />')
  })

  it('opens on the room photos when the chat list provides them, and on the one photo elsewhere', () => {
    expect(bubble).toContain('const gallery = useConversationImageGallery()')
    expect(bubble).toContain('gallery && findConversationImageIndex(gallery, image.messageId) >= 0 ? gallery : [image]')
    expect(bubble).toContain('initialMessageId={image.messageId}')
    // The viewer's onClose must not change identity: the dialog moves focus whenever it does.
    expect(bubble).toContain('const close = useCallback(() => setExpanded(false), [])')
  })

  it('pages with a horizontal drag: the track follows the finger, only the neighbours stay mounted', () => {
    expect(viewer).toContain('pagerWindowIndices(index, count).map(slideIndex')
    expect(viewer).toContain('transform: pagerTrackTransform(index, pagerOffset)')
    expect(viewer).toContain('onRelease: ({ offsetX, velocityX, width }) => commitPage(resolvePagerRelease({ index, count, offsetX, velocityX, width }))')
    // A single photo has no pager, so a sideways drag does nothing there.
    expect(viewer).toContain('count > 1 ? {')
    // Sideways overflow is clipped, a photo dragged down is not.
    expect(viewer).toContain('className="absolute inset-0 overflow-x-clip"')
    // Tracked by message: older photos loading above must not change the photo on screen.
    expect(viewer).toContain('findConversationImageIndex(images, activeId)')
    expect(viewer).toContain('setActiveId(images[nextIndex].messageId)')
  })

  it('fades the backdrop and every control with the drag and clears them after it', () => {
    expect(viewer).toContain('backdropOpacity={0.95 * backdropOpacityForProgress(dragProgress)}')
    expect(viewer.match(/opacity: chromeOpacity/g)?.length).toBeGreaterThanOrEqual(4)
    expect(viewer).toContain('dark fullscreen')
    expect(read('./MessageMediaDialog.tsx')).toContain("'h-full w-full overflow-hidden overscroll-contain text-white outline-none'")
  })

  it('turns pages from the keyboard unless the translation menu owns the arrows', () => {
    const keys = between(viewer, 'const handleKeyDown = (event: KeyboardEvent)', "document.addEventListener('keydown'")
    expect(keys).toContain("event.key !== 'ArrowLeft' && event.key !== 'ArrowRight'")
    expect(keys).toContain("document.querySelector('[role=\"menu\"]')")
    expect(keys).toContain("stepPageRef.current(event.key === 'ArrowRight' ? 1 : -1)")
  })

  it('keeps a photo that fails to load from closing the viewer', () => {
    expect(viewer).toContain('onError={() => markFailed(image.messageId)}')
    expect(viewer).toContain('data-conversation-image-failure')
    expect(viewer).not.toContain('onClose()')
  })
})

describe('provider placement', () => {
  it('wraps the LivePhoneDemo chat list with the room values', () => {
    const demo = read('./LivePhoneDemo.tsx')
    const provider = between(demo, '<PhotoTranslationProvider', '</PhotoTranslationProvider>')
    expect(provider).toContain('conversationId={conversationId}')
    expect(provider).toContain('roomLanguages={normalizedDisplayLanguageOptions}')
    expect(provider).toContain('defaultLanguage={resolvedDefaultDisplayLanguage}')
    expect(provider).toContain('uiLocale={uiLocale}')
    expect(provider).toContain('viewerUserId={viewerUserId}')
    expect(provider).toContain('ref={chatRef}')
    expect(provider).toContain('<MemoizedLivePhoneDemoChatMessageRow')
  })

  it('leaves ChatBubble and the share, spectate and legacy screens without the feature', () => {
    for (const path of ['./ChatBubble.tsx', './LivePhoneDemoLegacy.tsx', '../native-conversation-share-overlay.tsx', '../conversation-spectate-screen.tsx']) {
      expect(read(path), path).not.toMatch(/PhotoTranslation|photo-translation/)
    }
  })
})
