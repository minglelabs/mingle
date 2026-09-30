import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ZoomableConversationImage } from './ConversationImageBubble'

const source = readFileSync(new URL('./ConversationImageBubble.tsx', import.meta.url), 'utf8')

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

const noop = () => {}

function renderViewer(renderOverlay?: () => null) {
  return renderToStaticMarkup(createElement(ZoomableConversationImage, {
    src: '/api/conversations/c1/images/m1', alt: 'Photo', width: 945, height: 2048,
    onError: noop, onDismiss: noop, onDragProgress: noop, onSettleChange: noop, renderOverlay,
  }))
}

describe('ZoomableConversationImage stage', () => {
  it('puts the transform on a stage that wraps the photo, not on the img', () => {
    const html = renderViewer()
    expect(html).toContain('role="img"')
    expect(html).toContain('data-conversation-image-stage')
    expect(html).toMatch(/data-conversation-image-stage[^>]*transform:translate3d\(0px, 0px, 0\) scale\(1\)/)
    expect(html).toMatch(/<img[^>]*class="block h-full w-full"/)
    expect(html).not.toMatch(/<img[^>]*style=/)
    expect(html).not.toContain('object-contain')
  })

  it('does not composite the stage at rest and paints no overlay before the photo loads', () => {
    const html = renderViewer(() => null)
    expect(html).not.toContain('will-change')
    expect(html).not.toContain('transition:')
  })

  it('sizes the stage with contain-fit before the first paint and on resize', () => {
    const measure = sourceBetween('useLayoutEffect(() => {', '}, [])')
    expect(measure).toContain('viewport.clientWidth')
    expect(measure).toContain('new ResizeObserver(measure)')
    expect(measure).toContain('observer.disconnect()')
    expect(source).toContain('containFit({ width, height }, viewportSize)')
  })

  it('guards the stage transitionend against transitions bubbling from the overlay', () => {
    const stage = sourceBetween('<div data-conversation-image-stage', '<img src={src}')
    expect(stage).toContain('event.target !== event.currentTarget')
    expect(stage).toContain("event.propertyName !== 'transform'")
    expect(stage).toContain('finishDismiss()')
    expect(stage).toContain("transition: settling ? 'transform 200ms ease-out' : undefined")
    expect(stage).toContain("willChange: interacting || settling ? 'transform' : undefined")
  })

  it('renders the overlay inside the stage only once the photo has loaded', () => {
    const stage = sourceBetween('<div data-conversation-image-stage', '</div>\n  </div>\n}')
    expect(stage).toContain('onLoad={event => setLoadedImage(event.currentTarget)}')
    expect(stage).toContain('renderOverlay && stage && stage.width > 0 && loadedImage')
  })

  it('keeps the gesture wiring on the viewport', () => {
    const viewport = sourceBetween('return <div ref={viewportRef} role="img"', '<div data-conversation-image-stage')
    for (const handler of ['onPointerDown={handlePointerDown}', 'onPointerMove={handlePointerMove}', 'onPointerUp={handlePointerEnd}',
      'onPointerCancel={handlePointerCancel}', 'onWheel={handleWheel}', 'onDoubleClick={handleDoubleClick}', 'onTouchEnd={handleTouchEnd}']) {
      expect(viewport).toContain(handler)
    }
    expect(viewport).toContain('touch-none')
  })
})
