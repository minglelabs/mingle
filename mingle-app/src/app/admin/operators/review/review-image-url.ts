/**
 * Where the review tool shows an operator photo from storage. A plain module
 * (not 'use client') so server pages can call it too: calling a function
 * exported from a client file on the server throws.
 *
 * The path ends in the photo's file name (`<uuid>.jpg`): a photo dragged out
 * of the page is named after it, and Instagram's uploader needs the .jpg.
 */
export function reviewImageUrl(objectKey: string): string {
  const name = objectKey.split('/').pop() || 'photo.jpg'
  return `/admin/operators/api/review/image/${encodeURIComponent(name)}?key=${encodeURIComponent(objectKey)}`
}

/** A post's photo for staff (`/admin/api/posts/[postId]/image`), under a .jpg file name for the same reason. */
export function adminPostImageUrl(postId: string, query = ''): string {
  return `/admin/api/posts/${encodeURIComponent(postId)}/image/hashchat-${encodeURIComponent(postId.slice(-8))}.jpg${query}`
}
