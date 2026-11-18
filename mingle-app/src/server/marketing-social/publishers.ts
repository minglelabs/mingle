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
  video: { title: string; videoUrl: string; videoBytes: number; coverUrl: string | null; hashtags: string[] }
  account: ActiveAccount
}

export type StepResult =
  | { kind: 'processing'; containerId: string; retryInMs: number }
  | { kind: 'published'; externalPostId: string | null; permalink: string | null; containerId?: string }

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

async function youtubeStart(input: PublishInput): Promise<StepResult> {
  const { account, video } = input
  const privacy: YouTubePrivacy = input.options?.privacy === 'unlisted' || input.options?.privacy === 'private' ? input.options.privacy : 'public'
  const bytes = await downloadVideo(video.videoUrl)
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
        'X-Upload-Content-Length': String(bytes.byteLength),
      },
      body: JSON.stringify(metadata),
    })
  } catch {
    throw new SocialApiError('network: 유튜브 업로드 시작 실패', 0, true)
  }
  const uploadUrl = init.headers.get('location')
  if (!init.ok || !uploadUrl) {
    const text = await init.text().catch(() => '')
    let message = `HTTP ${init.status}`
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message
    } catch {
      // keep HTTP status
    }
    throw new SocialApiError(`유튜브 업로드 시작 실패: ${message}`, init.status, init.status === 429 || init.status >= 500)
  }
  const uploaded = await socialJson<{ id?: string }>(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'video/mp4' },
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(300_000),
  })
  if (!uploaded.id) throw new SocialApiError('유튜브 영상 ID가 없습니다', 0, true)
  if (video.coverUrl) {
    // Custom thumbnails need a verified channel and are not shown on Shorts; never fail the post over it.
    try {
      const cover = await downloadVideo(video.coverUrl)
      await socialJson(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(uploaded.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': /\.png$/i.test(video.coverUrl) ? 'image/png' : 'image/jpeg' },
        body: cover as unknown as BodyInit,
      })
    } catch {
      // ignore
    }
  }
  return { kind: 'published', externalPostId: uploaded.id, permalink: `https://www.youtube.com/shorts/${uploaded.id}` }
}

// ---------------------------------------------------------------- TikTok

type TikTokCreatorInfo = { privacy_level_options?: string[]; max_video_post_duration_sec?: number }

export function pickTikTokPrivacy(requested: string | undefined, allowed: string[] | undefined): TikTokPrivacy {
  const options = allowed?.length ? allowed : ['SELF_ONLY']
  if (requested && options.includes(requested)) return requested as TikTokPrivacy
  return (options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0]) as TikTokPrivacy
}

async function tiktokStart(input: PublishInput): Promise<StepResult> {
  const { account, video } = input
  const auth = { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }
  const creator = await socialJson<{ data?: TikTokCreatorInfo }>(`${TIKTOK_API}/post/publish/creator_info/query/`, { method: 'POST', headers: auth })
  const privacy = pickTikTokPrivacy(input.options?.privacy, creator.data?.privacy_level_options)
  const bytes = await downloadVideo(video.videoUrl)
  const init = await socialJson<{ data?: { publish_id?: string; upload_url?: string } }>(`${TIKTOK_API}/post/publish/video/init/`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      post_info: { title: input.caption, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 1000 },
      // One chunk: our videos are far below TikTok's 64 MB single-chunk limit.
      source_info: { source: 'FILE_UPLOAD', video_size: bytes.byteLength, chunk_size: bytes.byteLength, total_chunk_count: 1 },
    }),
  })
  const publishId = init.data?.publish_id
  const uploadUrl = init.data?.upload_url
  if (!publishId || !uploadUrl) throw new SocialApiError('틱톡이 업로드 주소를 주지 않았습니다', 0, true)
  let put: Response
  try {
    put = await socialFetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength), 'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(300_000),
    })
  } catch {
    throw new SocialApiError('network: 틱톡 파일 전송 실패', 0, true)
  }
  if (!put.ok) throw new SocialApiError(`틱톡 파일 전송 실패 (HTTP ${put.status})`, put.status, put.status >= 500)
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
  youtube: { start: youtubeStart, poll: async () => { throw new SocialApiError('youtube has no poll step', 0, false) } },
  tiktok: { start: tiktokStart, poll: tiktokPoll },
}

export function runPublishStep(platform: SocialPlatform, input: PublishInput): Promise<StepResult> {
  const publisher = PUBLISHERS[platform]
  return input.containerId ? publisher.poll(input) : publisher.start(input)
}
