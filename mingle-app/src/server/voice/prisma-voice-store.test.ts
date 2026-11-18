import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('prismaVoiceStore raw SQL', () => {
  it('names the app schema: through the pooler the search path is not always app', () => {
    const source = readFileSync(join(__dirname, 'prisma-voice-store.ts'), 'utf8')
    expect(source).toContain('SELECT id FROM app.app_conversation_channels WHERE id = ${channelId} FOR UPDATE')
    expect(source).not.toMatch(/FROM app_conversation_channels/)
  })
})
