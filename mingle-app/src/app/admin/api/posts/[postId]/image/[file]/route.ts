import { GET as getPostImage } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /admin/api/posts/[postId]/image/<name>.jpg — the post's photo, as the
 * route above, under a path that ends in a file name so a dragged photo keeps
 * its .jpg extension (see review/image/[file]).
 */
export async function GET(request: Request, context: { params: Promise<{ postId: string; file: string }> }) {
  return getPostImage(request, context)
}
