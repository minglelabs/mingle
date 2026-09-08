import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readProfileImageStorageConfig } from './profile-image-storage'

// Message clients receive only a membership-checked app URL, never an R2 URL/key.
function storage() {
  const config = readProfileImageStorageConfig()
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
