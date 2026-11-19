import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'slide-surface.tsx'), 'utf8')

describe('SlideSurface released edge swipe', () => {
  it('snaps an edge swipe that framer did not settle back to 0 after the release', () => {
    expect(source).toContain('if (wasEdgeSwipe) scheduleReleasedEdgeSwipeSettle();')
    expect(source).toContain('edgeSwipeGestureSequenceRef.current !== gestureSequence')
  })

  it('lets handleDragEnd own the gesture it settled, so a close is not undone', () => {
    const dragEnd = source.slice(source.indexOf('const handleDragEnd'))
    expect(dragEnd.indexOf('edgeSwipeGestureSequenceRef.current += 1;'))
      .toBeLessThan(dragEnd.indexOf('void requestClose();'))
  })
})
