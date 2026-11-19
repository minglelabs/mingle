// Grid tiles (Explore, profile, search results) show a post's photo about a
// third of the screen wide, so they ask the image route for a small copy
// instead of the full photo (docs/home-explore-rooms-plan.md).

export const POST_IMAGE_THUMBNAIL_PARAM = 'size'
export const POST_IMAGE_THUMBNAIL_VALUE = 'thumb'
/** Longest edge of the small copy: a third of a phone screen at 3x. */
export const POST_IMAGE_THUMBNAIL_EDGE = 400

/** The small-copy url for a post image url; any other url is returned as it is. */
export function postImageThumbnailUrl(url: string): string {
  if (!/^\/api\/(?:(?:ios|android)\/v[\d.]+\/)?posts\/[^/?]+\/image(?:\?|$)/.test(url)) return url
  if (new RegExp(`[?&]${POST_IMAGE_THUMBNAIL_PARAM}=`).test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}${POST_IMAGE_THUMBNAIL_PARAM}=${POST_IMAGE_THUMBNAIL_VALUE}`
}
