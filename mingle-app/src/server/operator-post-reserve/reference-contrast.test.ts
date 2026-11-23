import { afterEach, describe, expect, it, vi } from 'vitest'
import { contrastLines, describeReferenceForContrast } from './reference-contrast'

describe('reference contrast', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('asks the new photo to change every listed point, accessories left off', () => {
    const text = contrastLines('Head angle: tilted left\nAccessories (glasses, hat, earrings, mask): thin metal glasses').join('\n')
    expect(text).toContain('thin metal glasses')
    expect(text).toContain('must differ from the attached one in EVERY point')
    expect(text).toContain('left off unless the description above asks for them')
  })

  it('skips quietly without Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(await describeReferenceForContrast({ bytes: Buffer.from('x'), mimeType: 'image/jpeg' })).toBeNull()
  })
})
