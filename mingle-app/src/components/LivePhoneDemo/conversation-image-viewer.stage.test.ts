import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ZoomableConversationImage } from './ZoomableConversationImage'

const source = readFileSync(new URL('./ZoomableConversationImage.tsx', import.meta.url), 'utf8')

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

const noop = () => {}

function renderViewer(renderOverlay?: () => null, extra: object = {}) {
  return renderToStaticMarkup(createElement(ZoomableConversationImage, {
    src: '/api/conversations/c1/images/m1', alt: 'Photo', width: 945, height: 2048,
    onError: noop, onDismiss: noop, onDragProgress: noop, onSettleChange: noop, renderOverlay, ...extra,
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
    const stage = sourceBetween('<div data-conversation-image-stage', '{failure}')
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

  it('leaves the backdrop as the only dark layer, so a dragged photo leaves nothing behind', () => {
    const html = renderViewer()
    const viewport = html.slice(0, html.indexOf('>') + 1)
    // The black rectangle that stayed behind a photo swiped away was this viewport's own background.
    expect(viewport).not.toContain('bg-black')
    expect(viewport).not.toMatch(/\bbg-/)
    // A photo dragged down is free to leave the viewport instead of being cut at its edge.
    expect(viewport).not.toContain('overflow-hidden')
  })

  it('shows a failure instead of the photo and its overlay, and keeps the slide draggable', () => {
    const html = renderViewer(() => null, { failure: createElement('p', { id: 'failure' }, 'Could not load') })
    expect(html).toContain('<p id="failure">Could not load</p>')
    expect(html).toMatch(/<img[^>]*class="invisible block h-full w-full"/)
    expect(html).toContain('touch-none')
  })

  it('keeps a neighbouring slide out of the focus order and the accessibility tree', () => {
    const active = renderViewer()
    expect(active).toContain('tabindex="0"')
    expect(active).not.toContain('aria-hidden')
    const neighbour = renderViewer(undefined, { active: false })
    expect(neighbour).toContain('tabindex="-1"')
    expect(neighbour).toContain('aria-hidden="true"')
  })

  it('measures a page drag on screen and hands it to the viewer', () => {
    // The track moves under the slide while paging, so slide-local coordinates would read no movement.
    expect(source).toContain('startClientX: event.clientX')
    expect(source).toContain('pagerDrag.offsetX = event.clientX - pagerDrag.startClientX')
    const horizontal = sourceBetween("if (axis === 'horizontal') {", '} else if (isDismissibleDrag(')
    expect(horizontal).toContain('dismissRef.current = null')
    expect(horizontal).toContain('transformRef.current.scale <= MIN_IMAGE_SCALE')
    expect(horizontal).toContain('pager.onDrag(drag.offsetX)')
    expect(sourceBetween('const pagerDrag = pagerDragRef.current\n    if (pagerDrag && event.pointerId', 'const dismiss = dismissRef.current')).toContain('pager?.onRelease(')
    // A pinch or a cancel springs the track back.
    expect(sourceBetween('if (points.length >= 2) {', 'const [first, second] = points')).toContain('pager?.onCancel()')
    expect(sourceBetween('const handlePointerCancel = useCallback', 'const handleWheel')).toContain('pager?.onCancel()')
  })

  it('speaks for the backdrop only while it is the photo on screen', () => {
    expect(source).toContain('useEffect(() => { if (active) onSettleChange(settling) }, [active, settling, onSettleChange])')
  })
})
