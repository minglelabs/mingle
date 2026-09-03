import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

const IOS_STORE_URL = 'https://apps.apple.com/us/app/mingle-global-hangout/id6759795134'
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn'

function createRequest(userAgent: string, platform?: string) {
  const headers = new Headers({ 'user-agent': userAgent })

  if (platform) {
    headers.set('sec-ch-ua-platform', platform)
  }

  return new NextRequest('https://mingle-landing.vercel.app/download', { headers })
}

describe('download smart link', () => {
  it('redirects iPhone visitors to the App Store', () => {
    const response = GET(
      createRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
      ),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(IOS_STORE_URL)
  })

  it('redirects Android visitors to Google Play', () => {
    const response = GET(
      createRequest(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
      ),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(ANDROID_STORE_URL)
  })

  it('uses the platform client hint when the user agent is not specific', () => {
    const response = GET(createRequest('Mozilla/5.0', '"iOS"'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(IOS_STORE_URL)
  })

  it('falls back to the normal landing page for unknown platforms', () => {
    const response = GET(createRequest('Mozilla/5.0 (X11; Linux x86_64)'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://mingle-landing.vercel.app/normal')
  })
})
