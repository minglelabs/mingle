import { GET as getReviewImage } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /admin/operators/api/review/image/<name>.jpg?key=… — the same photo as
 * the route above. The path ends in a file name so a photo dragged out of the
 * page (into Instagram's uploader) arrives as "<name>.jpg": Chrome names a
 * dragged image after the URL's last path part, and Instagram rejects one
 * with no extension.
 */
export async function GET(request: Request) {
  return getReviewImage(request)
}
