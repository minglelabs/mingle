import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'LivePhoneDemo.tsx'), 'utf8')

describe('room back diagnostic (temporary, see src/lib/ui-diagnostics.ts)', () => {
  it('reports every back in a room, also with the menu closed, with the edge-swipe and room route state', () => {
    expect(source).not.toContain('if (depthBefore <= 0 && requestedDepth === null) return')
    expect(source).toContain('edgeSwipeSuppressed,\n          historyLength,\n          conversationRoute,')
  })
})
