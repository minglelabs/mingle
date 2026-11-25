import { withBack } from './back-path'

/** The staff view of anyone's profile (operator or real person), returning to `back`. */
export function adminProfileHref(userId: string, back?: string): string {
  const href = `/admin/operators/${encodeURIComponent(userId)}/profile`
  return back ? withBack(href, back) : href
}
