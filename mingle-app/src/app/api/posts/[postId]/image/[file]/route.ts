import type { NextRequest } from 'next/server'
import { GET as getImage } from '../route'

export const runtime = 'nodejs'

/**
 * GET /api/posts/[postId]/image/<name>.jpg — the same image as the route
 * above under a path that ends in a file name, so a photo dragged out of a
 * page (into Instagram's uploader) arrives as a .jpg file.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ postId: string; file: string }> }) {
  return getImage(request, context)
}
