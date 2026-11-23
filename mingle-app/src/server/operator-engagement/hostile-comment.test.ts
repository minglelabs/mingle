import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/llm/generate-json', () => ({ generateJson: vi.fn(), OPERATOR_TEXT_MODEL: 'claude-haiku-5-5' }))

import { clearHostileVerdicts, isHostileComment } from './hostile-comment'

describe('isHostileComment', () => {
  beforeEach(() => clearHostileVerdicts())

  it('asks Haiku once per comment and remembers the verdict', async () => {
    const judge = vi.fn(async (request: { validate: (value: unknown) => boolean; model: string }) => {
      expect(request.model).toBe('claude-haiku-5-5')
      return request.validate({ hostile: true })
    })
    expect(await isHostileComment('c1', '我还讨厌你们越南人呢', judge as never)).toBe(true)
    expect(await isHostileComment('c1', '我还讨厌你们越南人呢', judge as never)).toBe(true)
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it('treats a failed check as hostile (no like) and asks again next time', async () => {
    const failing = vi.fn(async () => { throw new Error('llm_timeout') })
    expect(await isHostileComment('c2', 'hello', failing as never)).toBe(true)
    const ok = vi.fn(async (request: { validate: (value: unknown) => boolean }) => request.validate({ hostile: false }))
    expect(await isHostileComment('c2', 'hello', ok as never)).toBe(false)
  })

  it('never calls the model for an empty comment', async () => {
    const judge = vi.fn()
    expect(await isHostileComment('c3', '  ', judge as never)).toBe(false)
    expect(judge).not.toHaveBeenCalled()
  })
})
