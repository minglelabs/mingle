import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockTransaction,
  mockCommentFindUnique,
  mockCommentFindFirst,
  mockCommentCreate,
  mockCommentUpdate,
  mockCommentUpdateMany,
  mockCommentCount,
  mockPostFindUnique,
  mockPostUpdate,
  mockTranslationCreateMany,
  mockTranslationDeleteMany,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockCommentFindUnique: vi.fn(),
  mockCommentFindFirst: vi.fn(),
  mockCommentCreate: vi.fn(),
  mockCommentUpdate: vi.fn(),
  mockCommentUpdateMany: vi.fn(),
  mockCommentCount: vi.fn(),
  mockPostFindUnique: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockTranslationCreateMany: vi.fn(),
  mockTranslationDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    postComment: {
      findUnique: mockCommentFindUnique,
      findFirst: mockCommentFindFirst,
      create: mockCommentCreate,
      update: mockCommentUpdate,
      updateMany: mockCommentUpdateMany,
      count: mockCommentCount,
    },
    post: {
      findUnique: mockPostFindUnique,
      update: mockPostUpdate,
    },
    postCommentTranslation: {
      createMany: mockTranslationCreateMany,
      deleteMany: mockTranslationDeleteMany,
    },
  },
}))

import { authorizeCommentEdit, createComment, updateComment, deleteComment } from './comment-service'

// Helper: make $transaction execute the callback with a fake tx
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      postComment: {
        findUnique: mockCommentFindUnique,
      findFirst: mockCommentFindFirst,
        create: mockCommentCreate,
        update: mockCommentUpdate,
        updateMany: mockCommentUpdateMany,
        count: mockCommentCount,
      },
      post: {
        findUnique: mockPostFindUnique,
        update: mockPostUpdate,
      },
      postCommentTranslation: {
        createMany: mockTranslationCreateMany,
        deleteMany: mockTranslationDeleteMany,
      },
    }
    return cb(tx)
  })
}

describe('createComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTransaction()
  })

  it('creates a top-level comment and increments commentCount', async () => {
    const fakeComment = {
      id: 'comment-1',
      postId: 'post-1',
      authorId: 'user-1',
      parentId: null,
      replyToUserId: null,
      bodyVersion: 1,
    }
    mockCommentCreate.mockResolvedValue(fakeComment)
    mockPostUpdate.mockResolvedValue({})

    const result = await createComment({
      postId: 'post-1',
      authorId: 'user-1',
      sourceText: 'Hello',
      sourceLanguage: 'en',
    })

    expect(result.id).toBe('comment-1')
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId: 'post-1',
        authorId: 'user-1',
        sourceText: 'Hello',
        parentId: null,
      }),
    })
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { commentCount: { increment: 1 } },
    })
  })
})

describe('createComment reply target', () => {
  type Row = { id: string; postId: string; parentId: string | null; authorId: string; isDeleted: boolean | null }
  const rows: Row[] = [
    { id: 'root-1', postId: 'post-1', parentId: null, authorId: 'root-author', isDeleted: null },
    { id: 'reply-1', postId: 'post-1', parentId: 'root-1', authorId: 'reply-author', isDeleted: null },
    { id: 'reply-dead', postId: 'post-1', parentId: 'root-1', authorId: 'dead-author', isDeleted: true },
    { id: 'root-dead', postId: 'post-1', parentId: null, authorId: 'root-author', isDeleted: true },
    { id: 'reply-under-dead', postId: 'post-1', parentId: 'root-dead', authorId: 'reply-author', isDeleted: null },
    { id: 'other-root', postId: 'post-2', parentId: null, authorId: 'other-author', isDeleted: null },
    { id: 'other-reply', postId: 'post-1', parentId: 'root-2', authorId: 'stranger', isDeleted: null },
    { id: 'root-2', postId: 'post-1', parentId: null, authorId: 'root2-author', isDeleted: null },
  ]
  // Comments the viewer cannot see (operator-hidden / blocked author).
  const invisible = new Set<string>()

  // Minimal evaluator for the `where` shapes resolveReplyTarget builds.
  function matches(row: Row, where: Record<string, unknown>): boolean {
    if (invisible.has(row.id)) return false
    if (where.postId !== undefined && row.postId !== where.postId) return false
    if (where.id !== undefined && row.id !== where.id) return false
    if (where.parentId !== undefined && row.parentId !== where.parentId) return false
    if (where.authorId !== undefined && row.authorId !== where.authorId) return false
    if (where.AND && row.isDeleted === true) return false
    // Visibility filters must always be composed in.
    expect(where).toHaveProperty('moderationHiddenAt', null)
    expect(where).toHaveProperty('author')
    return true
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupTransaction()
    invisible.clear()
    mockCommentFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      return rows.find((r) => matches(r, where)) ?? null
    })
    mockCommentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data }))
    mockPostUpdate.mockResolvedValue({})
  })

  function create(parentId: string, replyToUserId: string | null = null, postId = 'post-1') {
    return createComment({ postId, authorId: 'viewer', sourceText: 'hi', sourceLanguage: 'en', parentId, replyToUserId })
  }

  it('hoists a reply-to-reply to its root and mentions the replied-to author (client value ignored)', async () => {
    const result = await create('reply-1', 'someone-else')
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ parentId: 'root-1', replyToUserId: 'reply-author' }),
    })
    expect(result.replyRecipientId).toBe('reply-author')
  })

  it('rejects a parent that belongs to another post', async () => {
    await expect(create('other-root')).rejects.toThrow('parent_not_found')
    expect(mockCommentCreate).not.toHaveBeenCalled()
    expect(mockPostUpdate).not.toHaveBeenCalled()
  })

  it('throws parent_not_found for a nonexistent parent', async () => {
    await expect(create('nonexistent')).rejects.toThrow('parent_not_found')
  })

  it('rejects an invisible (blocked / hidden) parent', async () => {
    invisible.add('root-1')
    await expect(create('root-1')).rejects.toThrow('parent_not_found')
  })

  it('rejects a reply whose root is invisible', async () => {
    invisible.add('root-1')
    await expect(create('reply-1')).rejects.toThrow('parent_not_found')
  })

  it('rejects replying to a deleted reply', async () => {
    await expect(create('reply-dead')).rejects.toThrow('parent_not_found')
  })

  it('direct reply to a root without a mention notifies the root author', async () => {
    const result = await create('root-1')
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ parentId: 'root-1', replyToUserId: null }),
    })
    expect(result.replyRecipientId).toBe('root-author')
  })

  it('keeps a mention of the root author', async () => {
    const result = await create('root-1', 'root-author')
    expect(result.replyToUserId).toBe('root-author')
    expect(result.replyRecipientId).toBe('root-author')
  })

  it('keeps a mention of a live reply author in the same thread', async () => {
    const result = await create('root-1', 'reply-author')
    expect(result.replyToUserId).toBe('reply-author')
    expect(result.replyRecipientId).toBe('reply-author')
  })

  it('drops a mention of a user outside the thread and notifies the root author', async () => {
    // 'stranger' only replied in root-2, not root-1.
    const result = await create('root-1', 'stranger')
    expect(result.replyToUserId).toBeNull()
    expect(result.replyRecipientId).toBe('root-author')
  })

  it('drops a mention whose only reply is deleted', async () => {
    const result = await create('root-1', 'dead-author')
    expect(result.replyToUserId).toBeNull()
    expect(result.replyRecipientId).toBe('root-author')
  })

  it('drops a mention whose reply is invisible to the author', async () => {
    invisible.add('reply-1')
    const result = await create('root-1', 'reply-author')
    expect(result.replyToUserId).toBeNull()
  })

  it('allows replying under a deleted root only via one of its live replies', async () => {
    const viaReply = await create('reply-under-dead')
    expect(viaReply.parentId).toBe('root-dead')
    expect(viaReply.replyRecipientId).toBe('reply-author')

    const viaMention = await create('root-dead', 'reply-author')
    expect(viaMention.replyToUserId).toBe('reply-author')

    await expect(create('root-dead')).rejects.toThrow('parent_not_found')
    // The deleted root's author is not a valid target through the root itself.
    await expect(create('root-dead', 'root-author')).rejects.toThrow('parent_not_found')
  })

  it('returns no reply recipient for a top-level comment', async () => {
    const result = await createComment({ postId: 'post-1', authorId: 'viewer', sourceText: 'hi', sourceLanguage: 'en' })
    expect(result.replyRecipientId).toBeNull()
    expect(mockCommentFindFirst).not.toHaveBeenCalled()
  })
})

describe('updateComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTransaction()
  })

  it('updates own comment and increments bodyVersion, replacing new-version translations', async () => {
    mockCommentFindUnique
      .mockResolvedValueOnce({ id: 'c1', authorId: 'user-1', isDeleted: null, bodyVersion: 1 })
      .mockResolvedValueOnce({ id: 'c1', bodyVersion: 2, sourceText: 'edited', updatedAt: new Date() })
    mockCommentUpdateMany.mockResolvedValue({ count: 1 })
    mockTranslationDeleteMany.mockResolvedValue({ count: 0 })
    mockTranslationCreateMany.mockResolvedValue({ count: 1 })

    const result = await updateComment({
      commentId: 'c1',
      actorId: 'user-1',
      sourceText: 'edited',
      sourceLanguage: 'en',
      translationRows: [{ language: 'ko', status: 'ready', text: '수정됨' }],
    })
    expect(result.bodyVersion).toBe(2)
    // Conditional on the base version (optimistic lock) → new version 2
    expect(mockCommentUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'c1', authorId: 'user-1', bodyVersion: 1 }),
      data: expect.objectContaining({ sourceText: 'edited', sourceLanguage: 'en', bodyVersion: 2 }),
    })
    // Translations for the new version are replaced atomically
    expect(mockTranslationDeleteMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', bodyVersion: 2 },
    })
    expect(mockTranslationCreateMany).toHaveBeenCalledWith({
      data: [{ commentId: 'c1', bodyVersion: 2, language: 'ko', status: 'ready', text: '수정됨' }],
    })
  })

  it('uses expectedBodyVersion as the lock without re-reading', async () => {
    mockCommentUpdateMany.mockResolvedValue({ count: 1 })
    mockCommentFindUnique.mockResolvedValueOnce({ id: 'c1', bodyVersion: 6 })
    mockTranslationDeleteMany.mockResolvedValue({ count: 0 })
    await updateComment({
      commentId: 'c1',
      actorId: 'user-1',
      sourceText: 'x',
      sourceLanguage: 'en',
      expectedBodyVersion: 5,
    })
    expect(mockCommentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bodyVersion: 5 }),
        data: expect.objectContaining({ bodyVersion: 6 }),
      }),
    )
    expect(mockCommentFindUnique).toHaveBeenCalledTimes(1) // only the final read
  })

  it('throws conflict when another edit committed first, writing no translations', async () => {
    mockCommentUpdateMany.mockResolvedValue({ count: 0 })
    mockCommentFindUnique.mockResolvedValueOnce({ authorId: 'user-1', isDeleted: null })
    await expect(
      updateComment({
        commentId: 'c1',
        actorId: 'user-1',
        sourceText: 'late',
        sourceLanguage: 'en',
        expectedBodyVersion: 1,
        translationRows: [{ language: 'ko', status: 'ready', text: '늦음' }],
      }),
    ).rejects.toThrow('conflict')
    expect(mockTranslationDeleteMany).not.toHaveBeenCalled()
    expect(mockTranslationCreateMany).not.toHaveBeenCalled()
  })

  it('reports already_deleted when the comment was deleted during the edit', async () => {
    mockCommentUpdateMany.mockResolvedValue({ count: 0 })
    mockCommentFindUnique.mockResolvedValueOnce({ authorId: 'user-1', isDeleted: true })
    await expect(
      updateComment({ commentId: 'c1', actorId: 'user-1', sourceText: 'x', sourceLanguage: 'en', expectedBodyVersion: 1 }),
    ).rejects.toThrow('already_deleted')
  })

  it('authorizeCommentEdit returns the base version for the author only', async () => {
    mockCommentFindUnique.mockResolvedValue({ id: 'c1', authorId: 'user-1', isDeleted: null, bodyVersion: 4 })
    await expect(authorizeCommentEdit('c1', 'user-1')).resolves.toEqual({ bodyVersion: 4 })
    await expect(authorizeCommentEdit('c1', 'user-2')).rejects.toThrow('forbidden')
    mockCommentFindUnique.mockResolvedValue(null)
    await expect(authorizeCommentEdit('c1', 'user-1')).rejects.toThrow('not_found')
  })

  it('rejects edit by non-author', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      authorId: 'user-1',
      isDeleted: null,
      bodyVersion: 1,
    })

    await expect(
      updateComment({
        commentId: 'c1',
        actorId: 'user-2',
        sourceText: 'hack',
        sourceLanguage: 'en',
      }),
    ).rejects.toThrow('forbidden')
  })

  it('rejects edit of deleted comment', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      authorId: 'user-1',
      isDeleted: true,
      bodyVersion: 1,
    })

    await expect(
      updateComment({
        commentId: 'c1',
        actorId: 'user-1',
        sourceText: 'edit',
        sourceLanguage: 'en',
      }),
    ).rejects.toThrow('already_deleted')
  })
})

describe('deleteComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTransaction()
  })

  it('soft-deletes comment with NO replies → hadReplies=false', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      postId: 'post-1',
      authorId: 'user-1',
      parentId: null,
      isDeleted: null,
    })
    mockCommentCount.mockResolvedValue(0)
    mockCommentUpdate.mockResolvedValue({})
    mockPostUpdate.mockResolvedValue({})

    const result = await deleteComment('c1', 'user-1')

    expect(result.deleted).toBe(true)
    expect(result.hadReplies).toBe(false)
    expect(mockCommentUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    })
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { commentCount: { decrement: 1 } },
    })
  })

  it('soft-deletes comment WITH replies → hadReplies=true, replies stay', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      postId: 'post-1',
      authorId: 'user-1',
      parentId: null,
      isDeleted: null,
    })
    mockCommentCount.mockResolvedValue(3) // 3 live replies

    mockCommentUpdate.mockResolvedValue({})
    mockPostUpdate.mockResolvedValue({})

    const result = await deleteComment('c1', 'user-1')

    expect(result.deleted).toBe(true)
    expect(result.hadReplies).toBe(true)
    // Soft-delete only the parent
    expect(mockCommentUpdate).toHaveBeenCalledTimes(1)
    expect(mockCommentUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    })
    // Decrement by 1, not by 4
    expect(mockPostUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { commentCount: { decrement: 1 } },
    })
  })

  it('allows post author to delete others comment', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      postId: 'post-1',
      authorId: 'user-2', // comment by user-2
      parentId: null,
      isDeleted: null,
    })
    // Post is owned by user-1 (the actor)
    mockPostFindUnique.mockResolvedValue({ authorId: 'user-1' })
    mockCommentCount.mockResolvedValue(0)
    mockCommentUpdate.mockResolvedValue({})
    mockPostUpdate.mockResolvedValue({})

    const result = await deleteComment('c1', 'user-1')
    expect(result.deleted).toBe(true)
  })

  it('rejects delete by non-author non-post-owner', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      postId: 'post-1',
      authorId: 'user-2',
      parentId: null,
      isDeleted: null,
    })
    mockPostFindUnique.mockResolvedValue({ authorId: 'user-3' })

    await expect(deleteComment('c1', 'user-4')).rejects.toThrow('forbidden')
  })

  it('rejects delete of already deleted comment', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      postId: 'post-1',
      authorId: 'user-1',
      parentId: null,
      isDeleted: true,
    })

    await expect(deleteComment('c1', 'user-1')).rejects.toThrow('already_deleted')
  })
})
