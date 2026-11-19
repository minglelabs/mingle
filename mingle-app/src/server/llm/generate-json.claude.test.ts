import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class Anthropic {
    static APIError = APIError
    static APIConnectionTimeoutError = class extends APIError {}
    static APIUserAbortError = class extends APIError {}
    static AuthenticationError = class extends APIError {}
    messages = { create: mocks.create }
  }
  return { default: Anthropic }
})

import { generateJson, toClaudeJsonSchema } from './generate-json'

const schema = {
  type: 'object',
  properties: {
    kind: { type: 'string', format: 'enum', enum: ['app_help', 'chat'] },
    reply: { type: 'string' },
  },
  required: ['kind', 'reply'],
}
const request = {
  instructions: 'Reply.',
  input: { text: 'hi' },
  responseSchema: schema as never,
  validate: (value: unknown) => value as { kind: string; reply: string },
  model: 'claude-sonnet-5-5',
  temperature: 0.8,
  provider: 'direct' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'k')
  vi.stubEnv('CHATGPT_POOL_KEY', 'pool')
})
afterEach(() => vi.unstubAllEnvs())

describe('generateJson on Claude', () => {
  it('turns the Gemini schema into a closed JSON schema', () => {
    expect(toClaudeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { kind: { type: 'string', enum: ['app_help', 'chat'] }, reply: { type: 'string' } },
      required: ['kind', 'reply'],
      additionalProperties: false,
    })
  })

  it('sends a structured-output request without sampling parameters, with the refusal fallback', async () => {
    mocks.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"kind":"chat","reply":"Hey!"}' }] })
    await expect(generateJson(request)).resolves.toEqual({ kind: 'chat', reply: 'Hey!' })
    const [body, options] = mocks.create.mock.calls[0]
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema' } } })
    expect(body).not.toHaveProperty('temperature')
    expect(body.messages).toEqual([{ role: 'user', content: '{"text":"hi"}' }])
    expect(options.headers).toEqual({ 'anthropic-beta': 'server-side-fallback-2026-07-01' })
  })

  it('maps a refusal and a missing key onto LLM error codes', async () => {
    mocks.create.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    await expect(generateJson(request)).rejects.toMatchObject({ code: 'llm_invalid_response' })
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    await expect(generateJson(request)).rejects.toMatchObject({ code: 'llm_unavailable' })
  })
})
