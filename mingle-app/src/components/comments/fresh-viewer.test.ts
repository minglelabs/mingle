import { describe, expect, it, vi } from 'vitest'

vi.mock('./comment-api', () => ({}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))

import { freshViewer } from './use-comment-sheet'
import type { CommentNode } from './comment-types'

const session = { id: 'me', handle: 'me', name: 'Me', image: null }
const server = { id: 'me', handle: 'me', name: 'Me', image: 'https://cdn/new.jpg' }

function node(over: Partial<CommentNode>): CommentNode {
  return { id: 'c', authorId: 'me', author: server, replies: [], ...over } as unknown as CommentNode
}

describe('freshViewer', () => {
  it('prefers the identity the server last returned', () => {
    expect(freshViewer(server, session, 'me', [])).toBe(server)
  })

  it('falls back to a confirmed row of mine in the list, replies included', () => {
    const list = [node({ authorId: 'other', author: { ...server, id: 'other' }, replies: [node({ id: 'r' })] })]
    expect(freshViewer(null, session, 'me', list).image).toBe('https://cdn/new.jpg')
  })

  it('ignores pending rows and uses the session copy when nothing else is known', () => {
    expect(freshViewer(null, session, 'me', [node({ pending: true })])).toBe(session)
  })
})
