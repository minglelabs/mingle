/**
 * Where the review tool shows an operator photo from storage. A plain module
 * (not 'use client') so server pages can call it too: calling a function
 * exported from a client file on the server throws.
 */
export function reviewImageUrl(objectKey: string): string {
  return `/admin/operators/api/review/image?key=${encodeURIComponent(objectKey)}`
}
