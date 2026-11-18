import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'use-realtime-stt.ts'), 'utf8')

describe('voice talk captions of my own speech', () => {
  it('show while this phone draws no live line of its own (the room STT is off in a call)', () => {
    expect(source).toContain('(u.speakerUserId !== viewerUserId || own.length === 0) && !utterances.some((committed) => committed.id === u.id)')
  })
})
