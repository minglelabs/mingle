import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  createBatch: vi.fn(),
  listBatches: vi.fn(),
  getBatch: vi.fn(),
  cancelJobs: vi.fn(),
  listQueued: vi.fn(),
  convert: vi.fn(),
  checkOperator: vi.fn(),
  findOperator: vi.fn(),
  storeImage: vi.fn(),
  getImage: vi.fn(),
  kick: vi.fn(),
}))

vi.mock('@/server/admin/guard', () => ({ requireAdminApi: m.requireAdminApi }))
vi.mock('@/server/operator-posts/jobs', () => ({
  createOperatorPostBatch: m.createBatch,
  listRecentOperatorPostBatches: m.listBatches,
  getOperatorPostBatch: m.getBatch,
  cancelOperatorPostJobs: m.cancelJobs,
  listQueuedJobIds: m.listQueued,
}))
vi.mock('@/server/operator-posts/convert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operator-posts/convert')>()),
  convertToPersonaLanguage: m.convert,
}))
vi.mock('@/server/operator-posts/operator-check', () => ({ checkOperatorForPosting: m.checkOperator }))
vi.mock('@/server/operators/operator-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  findOperatorAccount: m.findOperator,
}))
vi.mock('@/server/posts/post-image-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/posts/post-image-upload')>()),
  storeUploadedPostImage: m.storeImage,
}))
vi.mock('@/server/posts/post-image-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/posts/post-image-storage')>()),
  getPostImage: m.getImage,
}))
vi.mock('@/instrumentation', () => ({ kickOperatorPostWorker: m.kick }))

import { POST as postConvert } from './convert/route'
import { GET as getImage, POST as postImage } from './images/route'
import { GET as listBatches, POST as createBatch } from './batches/route'
import { GET as getBatch, POST as postBatch } from './batches/[batchId]/route'
import { PersonaConversionFailedError, PersonaLanguageMissingError } from '@/server/operator-posts/convert'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'

const BASE = 'https://mingle.example/admin/posts/api'
const ctx = { sessionId: 'admin_sess_1', ip: '203.0.113.7', userAgent: 'Mozilla/5.0' }
const KEY = 'post-images/op_1/123e4567-e89b-42d3-a456-426614174000.jpg'
const params = (batchId: string) => ({ params: Promise.resolve({ batchId }) })

function jsonRequest(path: string, body: unknown, method = 'POST') {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function imageForm(operatorUserId?: string) {
  const form = new FormData()
  if (operatorUserId !== undefined) form.set('operatorUserId', operatorUserId)
  form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' }))
  return new NextRequest(`${BASE}/images`, { method: 'POST', body: form })
}

beforeEach(() => {
  vi.resetAllMocks()
  m.requireAdminApi.mockResolvedValue({ ok: true, ctx })
})

describe('admin posts API — admin auth', () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ['POST /images', () => postImage(imageForm('op_1'))],
    ['GET /images', () => getImage(new NextRequest(`${BASE}/images?key=${encodeURIComponent(KEY)}`))],
    ['POST /convert', () => postConvert(jsonRequest('/convert', { operatorUserId: 'op_1', text: 'hi' }))],
    ['POST /batches', () => createBatch(jsonRequest('/batches', { items: [] }))],
    ['GET /batches', () => listBatches(new NextRequest(`${BASE}/batches`))],
    ['GET /batches/:id', () => getBatch(new Request(`${BASE}/batches/b1`), params('b1'))],
    ['POST /batches/:id', () => postBatch(jsonRequest('/batches/b1', { action: 'cancel', all: true }), params('b1'))],
  ]

  it.each(calls)('%s refuses without an admin session', async (_label, call) => {
    m.requireAdminApi.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const response = await call()
    expect(response.status).toBe(401)
    for (const service of [
      m.createBatch,
      m.listBatches,
      m.getBatch,
      m.cancelJobs,
      m.listQueued,
      m.convert,
      m.checkOperator,
      m.findOperator,
      m.storeImage,
      m.getImage,
      m.kick,
    ]) {
      expect(service).not.toHaveBeenCalled()
    }
  })
})

describe('POST /admin/posts/api/images', () => {
  it('stores one photo under the operator id', async () => {
    m.checkOperator.mockResolvedValue({ ok: true, account: { id: 'op_1' } })
    m.storeImage.mockResolvedValue({ ok: true, image: { objectKey: KEY, width: 1200, height: 900 } })
    const response = await postImage(imageForm('op_1'))
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ imageObjectKey: KEY, width: 1200, height: 900 })
    expect(m.storeImage).toHaveBeenCalledWith(expect.any(FormData), 'op_1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it.each([
    ['not_operator', 404],
    ['operator_inactive', 409],
    ['account_restricted', 403],
  ] as const)('refuses an account that is %s', async (reason, status) => {
    m.checkOperator.mockResolvedValue({ ok: false, reason })
    const response = await postImage(imageForm('op_1'))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: reason })
    expect(m.storeImage).not.toHaveBeenCalled()
  })

  it('refuses a missing operator id and passes through pipeline errors (e.g. HEIC)', async () => {
    expect((await postImage(imageForm())).status).toBe(404)
    m.checkOperator.mockResolvedValue({ ok: true, account: { id: 'op_1' } })
    m.storeImage.mockResolvedValue({ ok: false, status: 400, error: 'invalid_image' })
    const response = await postImage(imageForm('op_1'))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_image' })
  })
})

describe('GET /admin/posts/api/images', () => {
  it('serves only post images owned by an operator account', async () => {
    m.findOperator.mockResolvedValue({ id: 'op_1' })
    m.getImage.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const response = await getImage(new NextRequest(`${BASE}/images?key=${encodeURIComponent(KEY)}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(m.findOperator).toHaveBeenCalledWith('op_1')
  })

  it('404s for a regular user, a conversation key or a traversal attempt', async () => {
    m.findOperator.mockResolvedValue(null)
    for (const key of [KEY, 'conversations/c1/a.jpg', 'post-images/op_1/../x.jpg', '']) {
      const response = await getImage(new NextRequest(`${BASE}/images?key=${encodeURIComponent(key)}`))
      expect(response.status).toBe(404)
    }
    expect(m.getImage).not.toHaveBeenCalled()
  })
})

describe('POST /admin/posts/api/convert', () => {
  it('returns the persona-language text', async () => {
    m.convert.mockResolvedValue({ text: 'Olá', language: 'pt', converted: true, sourceLanguage: 'ko' })
    const response = await postConvert(jsonRequest('/convert', { operatorUserId: 'op_1', text: '안녕' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ text: 'Olá', language: 'pt', converted: true, sourceLanguage: 'ko' })
    expect(m.convert).toHaveBeenCalledWith({ operatorUserId: 'op_1', text: '안녕' })
  })

  it.each([
    [new OperatorAccountRequiredError('user_1'), 404, 'not_operator'],
    [new PersonaLanguageMissingError('op_1'), 422, 'persona_language_missing'],
    [new PersonaConversionFailedError(), 502, 'conversion_failed'],
  ])('maps %s', async (error, status, code) => {
    m.convert.mockRejectedValue(error)
    const response = await postConvert(jsonRequest('/convert', { operatorUserId: 'op_1', text: '안녕' }))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: code })
  })

  it('validates the body before converting', async () => {
    expect((await postConvert(jsonRequest('/convert', { text: 'hi' }))).status).toBe(404)
    expect((await postConvert(jsonRequest('/convert', { operatorUserId: 'op_1', text: '  ' }))).status).toBe(400)
    expect((await postConvert(jsonRequest('/convert', { operatorUserId: 'op_1', text: 'a'.repeat(2001) }))).status).toBe(400)
    expect((await postConvert(jsonRequest('/convert', ['nope']))).status).toBe(400)
    expect(m.convert).not.toHaveBeenCalled()
  })
})

describe('/admin/posts/api/batches', () => {
  const queued = {
    ok: true,
    batchId: 'b1',
    queued: 1,
    invalid: 1,
    items: [
      { index: 0, state: 'queued', jobId: 'job_1', clientPostId: 'op-b1-1', publishAt: '2026-10-01T03:02:00.000Z' },
      { index: 1, state: 'invalid', reason: 'not_operator' },
    ],
    hasDueItems: false,
  }

  it('answers 202 with per-item results and leaves due-less batches to the tick', async () => {
    m.createBatch.mockResolvedValue(queued)
    const response = await createBatch(jsonRequest('/batches', { items: [{ operatorUserId: 'op_1', text: 'hi' }] }))
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ batchId: 'b1', queued: 1, invalid: 1, items: queued.items })
    expect(m.createBatch).toHaveBeenCalledWith(ctx, [{ operatorUserId: 'op_1', text: 'hi' }])
    expect(m.kick).not.toHaveBeenCalled()
  })

  it('kicks the worker when an item is already due ("바로 게시")', async () => {
    m.createBatch.mockResolvedValue({ ...queued, hasDueItems: true })
    const response = await createBatch(jsonRequest('/batches', { items: [{ operatorUserId: 'op_1', text: 'hi', publishAt: 'now' }] }))
    expect(response.status).toBe(202)
    expect(m.kick).toHaveBeenCalledOnce()
  })

  it.each([
    [{ ok: false, error: 'no_items' }, 400, { error: 'no_items' }],
    [{ ok: false, error: 'too_many_items', limit: 100 }, 400, { error: 'too_many_items', limit: 100 }],
    [{ ok: false, error: 'queue_full', limit: 500, waiting: 499 }, 409, { error: 'queue_full', limit: 500, waiting: 499 }],
  ])('maps a refused batch %o', async (result, status, body) => {
    m.createBatch.mockResolvedValue(result)
    const response = await createBatch(jsonRequest('/batches', { items: [] }))
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it('refuses a body that is not JSON', async () => {
    const response = await createBatch(new NextRequest(`${BASE}/batches`, { method: 'POST', body: 'nope' }))
    expect(response.status).toBe(400)
    expect(m.createBatch).not.toHaveBeenCalled()
  })

  it('lists recent batches', async () => {
    m.listBatches.mockResolvedValue([{ batchId: 'b1' }])
    const response = await listBatches(new NextRequest(`${BASE}/batches?limit=5`))
    await expect(response.json()).resolves.toEqual({ batches: [{ batchId: 'b1' }] })
    expect(m.listBatches).toHaveBeenCalledWith({ limit: 5 })
  })
})

describe('/admin/posts/api/batches/[batchId]', () => {
  it('returns the batch or 404', async () => {
    m.getBatch.mockResolvedValueOnce({ batchId: 'b1', items: [] }).mockResolvedValueOnce(null)
    expect((await getBatch(new Request(`${BASE}/batches/b1`), params('b1'))).status).toBe(200)
    expect((await getBatch(new Request(`${BASE}/batches/nope`), params('nope'))).status).toBe(404)
  })

  it('cancels the given queued items of this batch', async () => {
    m.cancelJobs.mockResolvedValue({ cancelled: [{ id: 'job_1', operatorUserId: 'op_1', batchId: 'b1' }] })
    m.getBatch.mockResolvedValue({ batchId: 'b1', items: [] })
    const response = await postBatch(jsonRequest('/batches/b1', { action: 'cancel', jobIds: ['job_1'] }), params('b1'))
    await expect(response.json()).resolves.toEqual({ cancelled: 1, batch: { batchId: 'b1', items: [] } })
    expect(m.cancelJobs).toHaveBeenCalledWith(ctx, ['job_1'], { batchId: 'b1' })
  })

  it('cancels every queued item with all: true', async () => {
    m.listQueued.mockResolvedValue(['job_1', 'job_2'])
    m.cancelJobs.mockResolvedValue({ cancelled: [] })
    m.getBatch.mockResolvedValue(null)
    await postBatch(jsonRequest('/batches/b1', { action: 'cancel', all: true }), params('b1'))
    expect(m.listQueued).toHaveBeenCalledWith('b1')
    expect(m.cancelJobs).toHaveBeenCalledWith(ctx, ['job_1', 'job_2'], { batchId: 'b1' })
  })

  it('refuses an unknown action', async () => {
    const response = await postBatch(jsonRequest('/batches/b1', { action: 'publish' }), params('b1'))
    expect(response.status).toBe(400)
    expect(m.cancelJobs).not.toHaveBeenCalled()
  })
})
