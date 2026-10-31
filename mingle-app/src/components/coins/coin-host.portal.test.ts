import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hostSource = readFileSync(new URL('./coin-host.tsx', import.meta.url), 'utf8')
const listSource = readFileSync(new URL('../conversation-list.tsx', import.meta.url), 'utf8')

describe('coin store layering', () => {
  it('portals the store to <body>, the same layer as the chat rooms', () => {
    // Chat rooms are portaled to <body>; the store must share that layer or it
    // opens behind an open room (it was trapped in the mobile canvas frame).
    expect(listSource).toContain('document.body')
    expect(hostSource).toContain('createPortal(')
    expect(hostSource).toMatch(/document\.body,\s*\n\s*\);/)
  })
})
