import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export function readConversationImageStorageConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const read = (name: string) => (env[`CLOUDFLARE_R2_${name}`]?.trim() || env[`R2_${name}`]?.trim() || '')
  const readConversationCredential = (name: 'ACCESS_KEY_ID' | 'SECRET_ACCESS_KEY') => (
    env[`CLOUDFLARE_R2_CONVERSATION_${name}`]?.trim()
    || env[`R2_CONVERSATION_${name}`]?.trim()
    || read(name)
  )
  const accountId = read('ACCOUNT_ID')
  // Conversation images may use a token scoped only to the private bucket.
  // Keep the profile credentials as a backwards-compatible fallback for
  // deployments that grant one token access to both buckets.
  const accessKeyId = readConversationCredential('ACCESS_KEY_ID')
  const secretAccessKey = readConversationCredential('SECRET_ACCESS_KEY')
  const bucketName = read('CONVERSATION_BUCKET_NAME')
  // Never fall back to the public profile bucket, including on reads or deletes.
  const publicBuckets = [env.CLOUDFLARE_R2_BUCKET_NAME, env.R2_BUCKET_NAME].map(value => value?.trim()).filter(Boolean)
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || publicBuckets.includes(bucketName)) return null
  return { accountId, accessKeyId, secretAccessKey, bucketName }
}

// Message clients receive only a membership-checked app URL, never an R2 URL/key.
function storage() {
  const config = readConversationImageStorageConfig()
  if (!config) throw new Error('image_storage_not_configured')
  const client = new S3Client({ region: 'auto', endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } })
  return { client, bucket: config.bucketName }
}
export async function putConversationImage(key: string, body: Uint8Array) {
  const { client, bucket } = storage()
  try { await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/jpeg', CacheControl: 'private, no-store' }), { abortSignal: AbortSignal.timeout(20_000) }) }
  finally { client.destroy() }
}
export async function getConversationImage(key: string): Promise<Uint8Array> {
  const { client, bucket } = storage()
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) })
    if (!result.Body) throw new Error('image_not_found')
    return await result.Body.transformToByteArray()
  } finally { client.destroy() }
}
export async function deleteConversationImage(key: string) {
  const { client, bucket } = storage()
  try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) }) }
  finally { client.destroy() }
}
