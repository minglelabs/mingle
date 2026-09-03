import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn'
const IOS_STORE_URL = 'https://apps.apple.com/us/app/mingle-global-hangout/id6759795134'

export const dynamic = 'force-dynamic'

function resolveStoreUrl(request: NextRequest): string | null {
  const platform = request.headers.get('sec-ch-ua-platform') || ''
  const userAgent = request.headers.get('user-agent') || ''
  const deviceInfo = `${platform} ${userAgent}`

  if (/\bAndroid\b/i.test(deviceInfo)) {
    return ANDROID_STORE_URL
  }

  if (
    /\b(?:iPhone|iPad|iPod|iOS)\b/i.test(deviceInfo) ||
    /Macintosh.*Mobile/i.test(deviceInfo) ||
    /\b(?:Macintosh|Mac OS X|MacIntel|MacPPC|Mac68K|macOS)\b/i.test(deviceInfo)
  ) {
    return IOS_STORE_URL
  }

  return null
}

export function GET(request: NextRequest) {
  const storeUrl = resolveStoreUrl(request)

  return NextResponse.redirect(storeUrl ? new URL(storeUrl) : new URL('/normal', request.url))
}
