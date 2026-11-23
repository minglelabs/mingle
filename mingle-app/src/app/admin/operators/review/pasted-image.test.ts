import { describe, expect, it } from 'vitest'
import { pastedImage } from './review-board'

const item = (kind: string, type: string, file: File | null) => ({ kind, type, getAsFile: () => file })

describe('pasted feedback photo', () => {
  it('takes a pasted photo and ignores text', () => {
    const photo = new File(['x'], 'a.png', { type: 'image/png' })
    expect(pastedImage({ items: [item('string', 'text/plain', null), item('file', 'image/png', photo)] } as never)).toBe(photo)
    expect(pastedImage({ items: [item('string', 'text/plain', null)] } as never)).toBeNull()
    expect(pastedImage({ items: [item('file', 'image/gif', new File(['x'], 'a.gif', { type: 'image/gif' }))] } as never)).toBeNull()
    expect(pastedImage(null)).toBeNull()
  })
})
