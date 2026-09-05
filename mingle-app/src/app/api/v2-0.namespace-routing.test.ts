import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config.mjs'

describe('installed 2.x client compatibility', () => {
  it.each([
    ['android', '2.0.1'],
    ['ios', '2.0.1'],
    ['ios', '2.0.2'],
    ['ios', '2.0.3'],
  ])('retains both root and nested rewrites for %s/v%s', async (platform, version) => {
    const rewrites = await nextConfig.rewrites!()
    expect(rewrites).toEqual(expect.arrayContaining([
      { source: `/api/${platform}/v${version}`, destination: `/api/${platform}/v2.0.0` },
      { source: `/api/${platform}/v${version}/:path*`, destination: `/api/${platform}/v2.0.0/:path*` },
    ]))
  })

  for (const platform of ['ios', 'android']) {
    it.each([
      ['conversations', ['GET', 'POST']],
      ['conversations/[conversationId]', ['GET', 'PATCH', 'DELETE']],
      ['conversations/[conversationId]/members', ['GET', 'POST']],
      ['conversations/[conversationId]/realtime-token', ['GET']],
      ['conversations/list-realtime-token', ['GET']],
      ['conversations/direct', ['POST']],
      ['account/preferences', ['GET', 'PATCH']],
      ['log/client-event', ['POST']],
      ['translate/finalize', ['POST']],
      ['tts/inworld', ['POST']],
    ] as const)(`${platform} keeps the existing handler contract for %s`, async (endpoint, methods) => {
      const installedRoutes = await import(/* @vite-ignore */ `./${platform}/v2.0.0/${endpoint}/route.ts`)
      const existingRoutes = await import(/* @vite-ignore */ `./${platform}/v1.1.4/${endpoint}/route.ts`)
      for (const method of methods) {
        expect(installedRoutes[method]).toBeTypeOf('function')
        expect(installedRoutes[method]).toBe(existingRoutes[method])
      }
    })
  }
})
