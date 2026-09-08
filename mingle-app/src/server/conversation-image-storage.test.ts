import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }))
vi.mock('@aws-sdk/client-s3', async importOriginal => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return { ...original, S3Client: class { send = mocks.send; destroy = mocks.destroy } }
})
import { readConversationImageStorageConfig, putConversationImage, getConversationImage, deleteConversationImage } from './conversation-image-storage'
const env = {
  CLOUDFLARE_R2_ACCOUNT_ID: 'account', CLOUDFLARE_R2_ACCESS_KEY_ID: 'key',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret', CLOUDFLARE_R2_BUCKET_NAME: 'public-profiles',
  CLOUDFLARE_R2_PUBLIC_URL: 'https://profiles.example.com',
  CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME: 'private-conversations',
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['ACCOUNT_ID', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'BUCKET_NAME', 'PUBLIC_URL', 'CONVERSATION_BUCKET_NAME']) {
    vi.stubEnv(`R2_${name}`, '')
    vi.stubEnv(`CLOUDFLARE_R2_${name}`, '')
  }
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
})
afterEach(() => vi.unstubAllEnvs())
describe('private conversation image storage', () => {
  it('requires an explicit dedicated bucket even when public profile storage is configured', () => {
    expect(readConversationImageStorageConfig({ ...env, CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME: '' })).toBeNull()
  })
  it('rejects both public bucket aliases even when they disagree', () => {
    expect(readConversationImageStorageConfig({ ...env, CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME: ' public-profiles ' })).toBeNull()
    expect(readConversationImageStorageConfig({ ...env, R2_BUCKET_NAME: 'private-conversations' })).toBeNull()
  })
  it('does not depend on any public URL', () => {
    expect(readConversationImageStorageConfig({ ...env, CLOUDFLARE_R2_PUBLIC_URL: '' })).toEqual({ accountId: 'account', accessKeyId: 'key', secretAccessKey: 'secret', bucketName: 'private-conversations' })
  })
  it('supports existing short credential aliases and an explicit private bucket alias', () => {
    expect(readConversationImageStorageConfig({ R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_CONVERSATION_BUCKET_NAME: 'private' })).toMatchObject({ bucketName: 'private' })
  })
  it.each(['CLOUDFLARE_R2_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY'])('rejects incomplete credentials: %s', key => {
    expect(readConversationImageStorageConfig({ ...env, [key]: '' })).toBeNull()
  })
  it('uses the private bucket for upload, authenticated retrieval and cleanup', async () => {
    mocks.send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } })
    await putConversationImage('conversation-images/test.jpg', new Uint8Array([1, 2]))
    expect(await getConversationImage('conversation-images/test.jpg')).toEqual(new Uint8Array([1, 2]))
    await deleteConversationImage('conversation-images/test.jpg')
    expect(mocks.send.mock.calls.map(([command]) => command.input.Bucket)).toEqual(Array(3).fill('private-conversations'))
    expect(mocks.destroy).toHaveBeenCalledTimes(3)
  })
  it.each(['missing', 'public'])('never falls back to public storage for any operation when private configuration is %s', async kind => {
    vi.stubEnv('CLOUDFLARE_R2_CONVERSATION_BUCKET_NAME', kind === 'public' ? 'public-profiles' : '')
    await expect(putConversationImage('conversation-images/test.jpg', new Uint8Array([1]))).rejects.toThrow('image_storage_not_configured')
    await expect(getConversationImage('conversation-images/test.jpg')).rejects.toThrow('image_storage_not_configured')
    await expect(deleteConversationImage('conversation-images/test.jpg')).rejects.toThrow('image_storage_not_configured')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('does not try the public bucket when a private object is missing', async () => {
    mocks.send.mockRejectedValue(new Error('NoSuchKey'))
    await expect(getConversationImage('conversation-images/test.jpg')).rejects.toThrow('NoSuchKey')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0][0].input.Bucket).toBe('private-conversations')
    expect(mocks.destroy).toHaveBeenCalledTimes(1)
  })
})
