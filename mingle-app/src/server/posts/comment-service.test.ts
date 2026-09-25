import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockTransaction,
  mockCommentFindUnique,
  mockCommentCreate,
  mockCommentUpdate,
  mockCommentCount,
  mockPostFindUnique,
  mockPostUpdate,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockCommentFindUnique: vi.fn(),
  mockCommentCreate: vi.fn(),
  mockCommentUpdate: vi.fn(),
  mockCommentCount: vi.fn(),
  mockPostFindUnique: vi.fn(),
  mockPostUpdate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mockTransaction,
    postComment: {
      findUnique: mockCommentFindUnique,
      create: mockCommentCreate,
      update: mockCommentUpdate,
      count: mockCommentCount,
    },
    post: {
      findUnique: mockPostFindUnique,
      update: mockPostUpdate,
    },
  },
}))

import { createComment, updateComment, deleteComment } from './comment-service'

// Helper: make $transaction execute the callback with a fake tx
function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      postComment: {
        findUnique: mockCommentFindUnique,
        create: mockCommentCreate,
        update: mockCommentUpdate,
        count: mockCommentCount,
      },
      post: {
        findUnique: mockPostFindUnique,
        update: mockPostUpdate,
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

  it('hoists reply-to-reply to root comment', async () => {
    // Parent is already a reply (has parentId)
    mockCommentFindUnique.mockResolvedValue({
      id: 'reply-1',
      parentId: 'root-comment',
      authorId: 'user-2',
    })
    mockCommentCreate.mockResolvedValue({
      id: 'reply-2',
      parentId: 'root-comment',
      replyToUserId: 'user-2',
      bodyVersion: 1,
    })
    mockPostUpdate.mockResolvedValue({})

    const result = await createComment({
      postId: 'post-1',
      authorId: 'user-3',
      sourceText: 'replying to reply',
      sourceLanguage: 'en',
      parentId: 'reply-1',
    })

    // Should be hoisted: parentId is root-comment, not reply-1
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentId: 'root-comment',
        replyToUserId: 'user-2',
      }),
    })
  })

  it('throws parent_not_found for invalid parentId', async () => {
    mockCommentFindUnique.mockResolvedValue(null)

    await expect(
      createComment({
        postId: 'post-1',
        authorId: 'user-1',
        sourceText: 'reply',
        sourceLanguage: 'en',
        parentId: 'nonexistent',
      }),
    ).rejects.toThrow('parent_not_found')
  })
})

describe('updateComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates own comment and increments bodyVersion', async () => {
    mockCommentFindUnique.mockResolvedValue({
      id: 'c1',
      authorId: 'user-1',
      isDeleted: null,
      bodyVersion: 1,
    })
    mockCommentUpdate.mockResolvedValue({
      id: 'c1',
      bodyVersion: 2,
      sourceText: 'edited',
      updatedAt: new Date(),
    })

    // Use the real prisma mock directly
    const { prisma } = await import('@/lib/prisma')
    ;(prisma.postComment.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1',
      bodyVersion: 2,
      sourceText: 'edited',
      updatedAt: new Date(),
    })

    const result = await updateComment({
      commentId: 'c1',
      actorId: 'user-1',
      sourceText: 'edited',
      sourceLanguage: 'en',
    })
    expect(result.bodyVersion).toBe(2)
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
