import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/operator-avatars/generate', () => ({ requestAvatarImage: vi.fn() }))
vi.mock('@/server/posts/post-image-storage', () => ({ putPostImage: vi.fn(), getPostImage: vi.fn() }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: vi.fn() }))

import { buildReferenceRedrawPrompt, parseRedrawFace, parseRedrawText } from './redraw'

const person = { look: 'a Japanese woman in her mid twenties with shoulder-length black hair', hasReference: true }

describe('reference redraw prompt', () => {
  it('swaps in the poster from the paired photo and never keeps the reference face', () => {
    const prompt = buildReferenceRedrawPrompt({ options: { face: 'poster', text: 'translate', note: '' }, person, paired: true, language: 'Japanese', vertical: true })
    expect(prompt).toContain('LEFT: the reference shot')
    expect(prompt).toContain('RIGHT photo')
    expect(prompt).toContain('must NOT be the face of the person in the reference')
    expect(prompt).toContain('rewritten in natural Japanese')
    expect(prompt).toContain('Vertical 3:4')
    expect(prompt).toContain('never two side by side')
  })

  it('writes the poster\'s look when there is no photo of them', () => {
    const prompt = buildReferenceRedrawPrompt({ options: { face: 'poster', text: 'remove', note: 'smiling' }, person: { ...person, hasReference: false }, paired: false, language: null, vertical: false })
    expect(prompt).toContain(`The person in the new photo is the poster: ${person.look}.`)
    expect(prompt).not.toContain('LEFT')
    expect(prompt).toContain('shows no added text')
    expect(prompt).toContain('Staff note: smiling')
    expect(prompt).toContain('Horizontal 4:3')
  })

  it('draws a new face on request', () => {
    const prompt = buildReferenceRedrawPrompt({ options: { face: 'new', text: 'keep', note: '' }, person: null, paired: false, language: null, vertical: true })
    expect(prompt).toContain('new, ordinary everyday face')
    expect(prompt).toContain('stays as it is')
  })

  it('drops app interface from screenshots', () => {
    const prompt = buildReferenceRedrawPrompt({ options: { face: 'new', text: 'keep', note: '' }, person: null, paired: false, language: null, vertical: true })
    expect(prompt).toContain('draw only the photo itself')
  })

  it('parses options with safe defaults', () => {
    expect(parseRedrawFace('new')).toBe('new')
    expect(parseRedrawFace('x')).toBe('poster')
    expect(parseRedrawText('remove')).toBe('remove')
    expect(parseRedrawText(null)).toBe('translate')
  })
})
