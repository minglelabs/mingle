/**
 * Live check of the ChatGPT pool client: one text answer, one image, and
 * /health without a key (expects 401). Needs CHATGPT_POOL_KEY in the env.
 *
 *   CHATGPT_POOL_KEY=... npx tsx scripts/chatgpt-pool-smoke.mts [out.png]
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { chatgptPoolChat, chatgptPoolImage, chatgptPoolUrl } from '../src/server/chatgpt-pool/client'

const out = process.argv[2] ?? 'chatgpt-pool-smoke.png'
const seconds = (start: number) => `${((Date.now() - start) / 1000).toFixed(1)}s`

let start = Date.now()
const text = await chatgptPoolChat('한 문장으로: 강릉에서 가볍게 산책하기 좋은 곳')
console.log(JSON.stringify({ test: 'chat', ok: text.ok, time: seconds(start), ...(text.ok ? { account: text.account, profile: text.profile, content: text.content } : { error: text.error }) }))

start = Date.now()
const image = await chatgptPoolImage('A casual phone photo of a plate of tteokbokki at a street food stall')
if (image.ok) {
  writeFileSync(out, image.bytes)
  const meta = await sharp(image.bytes).metadata()
  console.log(JSON.stringify({ test: 'image', ok: true, time: seconds(start), account: image.account, profile: image.profile, format: meta.format, size: `${meta.width}x${meta.height}`, bytes: image.bytes.length, out }))
} else {
  console.log(JSON.stringify({ test: 'image', ok: false, time: seconds(start), error: image.error }))
}

start = Date.now()
const health = await fetch(`${chatgptPoolUrl()}/health`, { signal: AbortSignal.timeout(30_000) })
console.log(JSON.stringify({ test: 'health_without_key', ok: health.status === 401, status: health.status, time: seconds(start) }))
