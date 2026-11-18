import type { ActiveAccount } from './accounts'
import { SocialApiError, socialFetch, socialJson } from './http'
import { GRAPH_INSTAGRAM, GRAPH_THREADS, TIKTOK_API } from './oauth'
import type { SocialPlatform, TargetOptions, TikTokPrivacy, YouTubePrivacy } from './types'
import { YOUTUBE_TITLE_LIMIT } from './types'

/**
 * One step of posting a video to one platform. `start` begins the upload;
 * while the platform still processes it, `poll` is called again later with
 * the saved `containerId` until the post is live.
 */
export type PublishInput = {
  caption: string
  options: TargetOptions | null
  containerId: string | null
  /** When the worker first claimed this post; bounds the "already published?" lookup. */
  startedAt: Date | null
  video: { title: string; videoUrl: string; videoBytes: number; coverUrl: string | null; hashtags: string[] }
  account: ActiveAccount
}

export type StepResult =
  | { kind: 'processing'; containerId: string; retryInMs: number }
  | { kind: 'published'; externalPostId: string | null; permalink: string | null; containerId?: string; note?: string }

const POLL_MS = 10_000

async function downloadVideo(url: string): Promise<Uint8Array> {
  let response: Response
  try {
    response = await socialFetch(url, { signal: AbortSignal.timeout(120_000) })
  } catch {
    throw new SocialApiError('영상 파일을 저장소에서 읽지 못했습니다', 0, true)
  }
  if (!response.ok) throw new SocialApiError(`영상 파일을 저장소에서 읽지 못했습니다 (HTTP ${response.status})`, response.status, true)
  return new Uint8Array(await response.arrayBuffer())
}

// ---------------------------------------------------------------- Meta (Instagram / Threads)

type RecentMedia = { id?: string; caption?: string; text?: string; permalink?: string; timestamp?: string }

/**
 * The post a container already became, when an earlier publish call went
 * through but its answer was lost. Containers do not point at their media,
 * so match the account's newest posts by caption and time.
 */
export function findPublishedMedia(items: RecentMedia[] | undefined, caption: string, startedAt: Date | null): RecentMedia | null {
  const since = startedAt ? startedAt.getTime() - 60_000 : 0
  const want = caption.trim()
  return (
    (items ?? []).find((item) => {
      const text = (item.caption ?? item.text ?? '').trim()
      const at = item.timestamp ? Date.parse(item.timestamp) : NaN
      return Boolean(item.id) && text === want && (!Number.isFinite(at) || at >= since)
    }) ?? null
  )
}

async function recoverPublished(listUrl: string, input: PublishInput, label: string): Promise<StepResult> {
  try {
    const recent = await socialJson<{ data?: RecentMedia[] }>(listUrl)
    const media = findPublishedMedia(recent.data, input.caption, input.startedAt)
    if (media?.id) return { kind: 'published', externalPostId: media.id, permalink: media.permalink ?? null }
  } catch {
    // fall through: the post is live, only its id is unknown
  }
  return { kind: 'published', externalPostId: null, permalink: null, note: `${label}에 게시됐지만 게시물 링크를 찾지 못했습니다` }
}

// ---------------------------------------------------------------- Instagram

async function instagramStart(input: PublishInput): Promise<StepResult> {
  const { account } = input
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: input.video.videoUrl,
    caption: input.caption,
    share_to_feed: 'true',
    access_token: account.accessToken,
  })
  if (input.video.coverUrl && /\.jpe?g$/i.test(input.video.coverUrl)) params.set('cover_url', input.video.coverUrl)
  const body = await socialJson<{ id?: string }>(`${GRAPH_INSTAGRAM}/${account.externalAccountId}/media`, { method: 'POST', body: params })
  if (!body.id) throw new SocialApiError('인스타그램이 업로드 ID를 주지 않았습니다', 0, true)
  return { kind: 'processing', containerId: body.id, retryInMs: POLL_MS }
}

async function instagramPoll(input: PublishInput): Promise<StepResult> {
  const { account } = input
  const containerId = input.containerId!
  const status = await socialJson<{ status_code?: string; status?: string }>(
    `${GRAPH_INSTAGRAM}/${containerId}?${new URLSearchParams({ fields: 'status_code,status', access_token: account.accessToken })}`,
  )
  if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
    throw new SocialApiError(`인스타그램 영상 처리 실패: ${status.status ?? status.status_code}`, 0, false)
  }
  if (status.status_code === 'PUBLISHED') {
    return recoverPublished(
      `${GRAPH_INSTAGRAM}/${account.externalAccountId}/media?${new URLSearchParams({ fields: 'id,caption,permalink,timestamp', limit: '10', access_token: account.accessToken })}`,
      input,
      '인스타그램',
    )
  }
  if (status.status_code !== 'FINISHED') return { kind: 'processing', containerId, retryInMs: POLL_MS }
  const published = await socialJson<{ id?: string }>(`${GRAPH_INSTAGRAM}/${account.externalAccountId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: account.accessToken }),
  })
  if (!published.id) throw new SocialApiError('인스타그램 게시 ID가 없습니다', 0, true)
  let permalink: string | null = null
  try {
    const media = await socialJson<{ permalink?: string }>(
      `${GRAPH_INSTAGRAM}/${published.id}?${new URLSearchParams({ fields: 'permalink', access_token: account.accessToken })}`,
    )
    permalink = media.permalink ?? null
  } catch {
    // The link is filled in later by the metrics refresh.
  }
  return { kind: 'published', externalPostId: published.id, permalink }
}

// ---------------------------------------------------------------- Threads

async function threadsStart(input: PublishInput): Promise<StepResult> {
  const { account } = input
  const body = await socialJson<{ id?: string }>(`${GRAPH_THREADS}/${account.externalAccountId}/threads`, {
    method: 'POST',
    body: new URLSearchParams({ media_type: 'VIDEO', video_url: input.video.videoUrl, text: input.caption, access_token: account.accessToken }),
  })
  if (!body.id) throw new SocialApiError('쓰레드가 업로드 ID를 주지 않았습니다', 0, true)
  return { kind: 'processing', containerId: body.id, retryInMs: POLL_MS }
}

async function threadsPoll(input: PublishInput): Promise<StepResult> {
  const { account } = input
  const containerId = input.containerId!
  const status = await socialJson<{ status?: string; error_message?: string }>(
    `${GRAPH_THREADS}/${containerId}?${new URLSearchParams({ fields: 'status,error_message', access_token: account.accessToken })}`,
  )
  if (status.status === 'ERROR' || status.status === 'EXPIRED') {
    throw new SocialApiError(`쓰레드 영상 처리 실패: ${status.error_message ?? status.status}`, 0, false)
  }
  if (status.status === 'PUBLISHED') {
    return recoverPublished(
      `${GRAPH_THREADS}/${account.externalAccountId}/threads?${new URLSearchParams({ fields: 'id,text,permalink,timestamp', limit: '10', access_token: account.accessToken })}`,
      input,
      '쓰레드',
    )
  }
  if (status.status !== 'FINISHED') return { kind: 'processing', containerId, retryInMs: POLL_MS }
  const published = await socialJson<{ id?: string }>(`${GRAPH_THREADS}/${account.externalAccountId}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: account.accessToken }),
  })
  if (!published.id) throw new SocialApiError('쓰레드 게시 ID가 없습니다', 0, true)
  let permalink: string | null = null
  try {
    const media = await socialJson<{ permalink?: string }>(
      `${GRAPH_THREADS}/${published.id}?${new URLSearchParams({ fields: 'permalink', access_token: account.accessToken })}`,
    )
    permalink = media.permalink ?? null
  } catch {
    // Filled in later by the metrics refresh.
  }
  return { kind: 'published', externalPostId: published.id, permalink }
}

// ---------------------------------------------------------------- YouTube

export function youtubeTags(hashtags: string[]): string[] {
  const tags: string[] = []
  let total = 0
  for (const tag of hashtags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)) {
    if (total + tag.length > 450) break
    tags.push(tag)
    total += tag.length + 1
  }
  return tags
}

function youtubeError(prefix: string, status: number, text: string): SocialApiError {
  let message = `HTTP ${status}`
  try {
    message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message
  } catch {
    // keep HTTP status
  }
  return new SocialApiError(`${prefix}: ${message}`, status, status === 429 || status >= 500)
}

/** Step 1: open a resumable upload session. Its URL is saved as the containerId, so a retry resumes instead of uploading a second Short. */
async function youtubeStart(input: PublishInput): Promise<StepResult> {
  const { account, video } = input
  const privacy: YouTubePrivacy = input.options?.privacy === 'unlisted' || input.options?.privacy === 'private' ? input.options.privacy : 'public'
  const metadata = {
    snippet: {
      title: video.title.slice(0, YOUTUBE_TITLE_LIMIT),
      description: input.caption,
      tags: youtubeTags(video.hashtags),
      categoryId: '22',
    },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
  }
  let init: Response
  try {
    init = await socialFetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(video.videoBytes),
      },
      body: JSON.stringify(metadata),
    })
  } catch {
    throw new SocialApiError('network: 유튜브 업로드 시작 실패', 0, true)
  }
  const uploadUrl = init.headers.get('location')
  if (!init.ok || !uploadUrl) throw youtubeError('유튜브 업로드 시작 실패', init.status, await init.text().catch(() => ''))
  return { kind: 'processing', containerId: uploadUrl, retryInMs: 0 }
}

/** Bytes YouTube already holds, from a 308 `Range: bytes=0-N` header. */
export function youtubeResumeOffset(range: string | null): number {
  const match = /bytes=0-(\d+)/.exec(range ?? '')
  return match ? Number(match[1]) + 1 : 0
}

async function youtubeSessionPut(uploadUrl: string, accessToken: string, headers: Record<string, string>, body?: Uint8Array): Promise<Response> {
  try {
    return await socialFetch(uploadUrl, {
      method: 'PUT',
      // 308 here means "resume incomplete", not a redirect.
      redirect: 'manual',
      headers: { Authorization: `Bearer ${accessToken}`, ...headers },
      body: body as unknown as BodyInit | undefined,
      signal: AbortSignal.timeout(300_000),
    })
  } catch {
    throw new SocialApiError('network: 유튜브 업로드 중단 — 이어서 올립니다', 0, true)
  }
}

async function youtubeFinish(input: PublishInput, response: Response): Promise<StepResult> {
  const { account, video } = input
  const text = await response.text()
  let id: string | undefined
  try {
    id = (JSON.parse(text) as { id?: string }).id
  } catch {
    id = undefined
  }
  if (!id) throw new SocialApiError('유튜브 영상 ID가 없습니다', 0, true)
  if (video.coverUrl) {
    // Custom thumbnails need a verified channel and are not shown on Shorts; never fail the post over it.
    try {
      const cover = await downloadVideo(video.coverUrl)
      await socialJson(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': /\.png$/i.test(video.coverUrl) ? 'image/png' : 'image/jpeg' },
        body: cover as unknown as BodyInit,
      })
    } catch {
      // ignore
    }
  }
  return { kind: 'published', externalPostId: id, permalink: `https://www.youtube.com/shorts/${id}` }
}

/** Step 2+: ask the session how much it has, send the rest, and finish when YouTube returns the video. */
async function youtubePoll(input: PublishInput): Promise<StepResult> {
  const { account, video } = input
  const uploadUrl = input.containerId!
  const size = video.videoBytes
  const status = await youtubeSessionPut(uploadUrl, account.accessToken, { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' })
  if (status.status === 200 || status.status === 201) return youtubeFinish(input, status)
  if (status.status === 404 || status.status === 410) {
    throw new SocialApiError('유튜브 업로드 세션이 만료됐습니다 — 다시 시도하면 새로 올립니다', status.status, false)
  }
  if (status.status !== 308) throw youtubeError('유튜브 업로드 상태 확인 실패', status.status, await status.text().catch(() => ''))
  const offset = youtubeResumeOffset(status.headers.get('range'))
  const bytes = await downloadVideo(video.videoUrl)
  if (bytes.byteLength !== size) throw new SocialApiError('저장된 영상 크기가 달라졌습니다', 0, false)
  const rest = bytes.subarray(offset)
  const sent = await youtubeSessionPut(
    uploadUrl,
    account.accessToken,
    { 'Content-Type': 'video/mp4', 'Content-Length': String(rest.byteLength), 'Content-Range': `bytes ${offset}-${size - 1}/${size}` },
    rest,
  )
  if (sent.status === 200 || sent.status === 201) return youtubeFinish(input, sent)
  if (sent.status === 308) return { kind: 'processing', containerId: uploadUrl, retryInMs: 0 }
  throw youtubeError('유튜브 업로드 실패', sent.status, await sent.text().catch(() => ''))
}

// ---------------------------------------------------------------- TikTok

type TikTokCreatorInfo = { privacy_level_options?: string[]; max_video_post_duration_sec?: number }

export function pickTikTokPrivacy(requested: string | undefined, allowed: string[] | undefined): TikTokPrivacy {
  const options = allowed?.length ? allowed : ['SELF_ONLY']
  if (requested && options.includes(requested)) return requested as TikTokPrivacy
  return (options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0]) as TikTokPrivacy
}

const MB = 1024 * 1024
/** TikTok: a single chunk may be up to 64 MB; otherwise 5–64 MB chunks, the last one taking the remainder. */
export const TIKTOK_SINGLE_CHUNK_MAX = 64 * MB
export const TIKTOK_CHUNK_SIZE = 10 * MB

export function tiktokChunkPlan(size: number): { chunkSize: number; count: number; ranges: [number, number][] } {
  if (size <= TIKTOK_SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1, ranges: [[0, size - 1]] }
  const count = Math.floor(size / TIKTOK_CHUNK_SIZE)
  const ranges: [number, number][] = []
  for (let i = 0; i < count; i += 1) {
    const start = i * TIKTOK_CHUNK_SIZE
    ranges.push([start, i === count - 1 ? size - 1 : start + TIKTOK_CHUNK_SIZE - 1])
  }
  return { chunkSize: TIKTOK_CHUNK_SIZE, count, ranges }
}

async function tiktokStart(input: PublishInput): Promise<StepResult> {
  const { account, video } = input
  const auth = { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }
  const creator = await socialJson<{ data?: TikTokCreatorInfo }>(`${TIKTOK_API}/post/publish/creator_info/query/`, { method: 'POST', headers: auth })
  const privacy = pickTikTokPrivacy(input.options?.privacy, creator.data?.privacy_level_options)
  const bytes = await downloadVideo(video.videoUrl)
  const plan = tiktokChunkPlan(bytes.byteLength)
  const init = await socialJson<{ data?: { publish_id?: string; upload_url?: string } }>(`${TIKTOK_API}/post/publish/video/init/`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      post_info: { title: input.caption, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1000 },
      source_info: { source: 'FILE_UPLOAD', video_size: bytes.byteLength, chunk_size: plan.chunkSize, total_chunk_count: plan.count },
    }),
  })
  const publishId = init.data?.publish_id
  const uploadUrl = init.data?.upload_url
  if (!publishId || !uploadUrl) throw new SocialApiError('틱톡이 업로드 주소를 주지 않았습니다', 0, true)
  for (const [start, end] of plan.ranges) {
    const chunk = bytes.subarray(start, end + 1)
    let put: Response
    try {
      put = await socialFetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(chunk.byteLength), 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}` },
        body: chunk as unknown as BodyInit,
        signal: AbortSignal.timeout(300_000),
      })
    } catch {
      throw new SocialApiError('network: 틱톡 파일 전송 실패', 0, true)
    }
    if (!put.ok) throw new SocialApiError(`틱톡 파일 전송 실패 (HTTP ${put.status})`, put.status, put.status >= 500)
  }
  return { kind: 'processing', containerId: publishId, retryInMs: POLL_MS }
}

async function tiktokPoll(input: PublishInput): Promise<StepResult> {
  const { account } = input
  const containerId = input.containerId!
  const status = await socialJson<{ data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(
    `${TIKTOK_API}/post/publish/status/fetch/`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: containerId }),
    },
  )
  const state = status.data?.status
  if (state === 'FAILED') throw new SocialApiError(`틱톡 게시 실패: ${status.data?.fail_reason ?? 'unknown'}`, 0, false)
  if (state !== 'PUBLISH_COMPLETE') return { kind: 'processing', containerId, retryInMs: POLL_MS }
  const postId = status.data?.publicaly_available_post_id?.[0]
  const id = postId === undefined ? null : String(postId)
  // A SELF_ONLY ("나만 보기") post has no public id or link.
  const permalink = id ? `https://www.tiktok.com/@${account.username ?? '_'}/video/${id}` : null
  return { kind: 'published', externalPostId: id, permalink, containerId }
}

const PUBLISHERS: Record<SocialPlatform, { start: (input: PublishInput) => Promise<StepResult>; poll: (input: PublishInput) => Promise<StepResult> }> = {
  instagram: { start: instagramStart, poll: instagramPoll },
  threads: { start: threadsStart, poll: threadsPoll },
  youtube: { start: youtubeStart, poll: youtubePoll },
  tiktok: { start: tiktokStart, poll: tiktokPoll },
}

export function runPublishStep(platform: SocialPlatform, input: PublishInput): Promise<StepResult> {
  const publisher = PUBLISHERS[platform]
  return input.containerId ? publisher.poll(input) : publisher.start(input)
}
