import { afterEach, describe, expect, it } from 'vitest'
import { __setSocialFetchForTests, extractApiErrorMessage, quoteLongIntegers, SocialApiError, socialJson } from './http'

function respond(status: number, body: unknown) {
  __setSocialFetchForTests(async () => new Response(JSON.stringify(body), { status }))
}

describe('social http', () => {
  afterEach(() => __setSocialFetchForTests(null))

  it('reads Meta, Google and TikTok error shapes', () => {
    expect(extractApiErrorMessage({ error: { message: 'Invalid OAuth access token', code: 190 } })).toBe('Invalid OAuth access token')
    expect(extractApiErrorMessage({ error: { code: 'ok', message: '' } })).toBeNull()
    expect(extractApiErrorMessage({ error: { code: 'spam_risk_too_many_posts', message: 'too many posts' } })).toBe('too many posts · spam_risk_too_many_posts')
    expect(extractApiErrorMessage({ error: 'invalid_grant', error_description: 'Bad Request' })).toBe('invalid_grant: Bad Request')
  })

  it('treats TikTok 200 + error.code ok as success, and other codes as failure', async () => {
    respond(200, { data: { publish_id: 'p1' }, error: { code: 'ok', message: '' } })
    await expect(socialJson('https://x')).resolves.toEqual({ data: { publish_id: 'p1' }, error: { code: 'ok', message: '' } })
    respond(200, { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'private only' } })
    await expect(socialJson('https://x')).rejects.toMatchObject({ transient: false })
  })

  it('marks 429 / 5xx / network as transient', async () => {
    respond(429, { error: { message: 'rate limited' } })
    await expect(socialJson('https://x')).rejects.toMatchObject({ transient: true, status: 429 })
    respond(400, { error: { message: 'bad' } })
    await expect(socialJson('https://x')).rejects.toMatchObject({ transient: false, message: 'bad' })
    __setSocialFetchForTests(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await socialJson('https://x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SocialApiError)
    expect((error as SocialApiError).transient).toBe(true)
  })

  it('keeps int64 ids exact', () => {
    expect(JSON.parse(quoteLongIntegers('{"ids":[7300000000000000001, 12],"n":1234567890123456789}'))).toEqual({ ids: ['7300000000000000001', 12], n: '1234567890123456789' })
    expect(quoteLongIntegers('{"t":"a:1234567890123456789"}')).toBe('{"t":"a:1234567890123456789"}')
  })
})
