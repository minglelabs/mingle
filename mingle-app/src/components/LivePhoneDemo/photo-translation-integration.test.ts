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

  it('fetches only from the open viewer and only when a room is provided', () => {
    const viewer = between(bubble, 'function PhotoTranslationViewer', 'export default function ConversationImageBubble')
    expect(viewer).toContain('usePhotoTranslationText(')
    expect(bubble.match(/usePhotoTranslationText\(/g)).toHaveLength(1)
    const main = bubble.slice(bubble.indexOf('export default function ConversationImageBubble'))
    expect(main).toContain('const room = usePhotoTranslationRoom()')
    expect(main).toContain('room?.conversationId === image.conversationId ? room : null')
    const dialog = between(main, '{expanded && <MessageMediaDialog', '</MessageMediaDialog>}')
    expect(dialog).toContain('{translationRoom')
    expect(dialog).toContain('<PhotoTranslationViewer')
  })

  it('keeps the pill beside the viewport and the overlay inside the stage', () => {
    const zoomable = between(bubble, 'export function ZoomableConversationImage', 'const NO_BLOCKS')
    expect(zoomable).not.toContain('PhotoTranslateControl')
    const viewer = between(bubble, 'function PhotoTranslationViewer', 'export default function ConversationImageBubble')
    const zoomableElement = between(viewer, '<ZoomableConversationImage', '/>')
    expect(zoomableElement).toContain('renderOverlay={renderOverlay}')
    const control = viewer.slice(viewer.indexOf('<ZoomableConversationImage'))
    expect(control.indexOf('<PhotoTranslateControl')).toBeGreaterThan(control.indexOf('/>'))
    expect(viewer).toContain('className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center"')
    expect(read('./PhotoTranslateControl.tsx')).toContain('className="pointer-events-auto relative"')
    expect(viewer).toContain('disabled={dragProgress > 0}')
  })

  it('remembers the choice per photo and reads the translation to assistive tech outside role=img', () => {
    const viewer = between(bubble, 'function PhotoTranslationViewer', 'export default function ConversationImageBubble')
    expect(viewer).toContain('photoTranslationMemoryKey({ apiNamespace: clientApiNamespace, viewerUserId: room.viewerUserId, conversationId: image.conversationId, messageId: image.messageId })')
    expect(viewer).toContain('photoTranslationSelections.set(memoryKey, choice)')
    expect(viewer).toContain('className="sr-only"')
    expect(viewer).not.toContain('localStorage')
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
