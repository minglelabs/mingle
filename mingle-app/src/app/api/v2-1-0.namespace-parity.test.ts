import { readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 2.1.0 is a real namespace rather than a next.config.mjs rewrite alias, so the
// v2.1.0 route tree has to stay a superset of v2.0.0 on its own.
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

const apiRoot = dirname(fileURLToPath(import.meta.url))

function collectRouteEndpoints(namespaceRoot: string): string[] {
  const endpoints: string[] = []

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
      } else if (entry.name === 'route.ts') {
        endpoints.push(relative(namespaceRoot, directory).split(sep).join('/'))
      }
    }
  }

  walk(namespaceRoot)
  return endpoints.sort()
}

function exportedMethods(routeModule: Record<string, unknown>): string[] {
  return HTTP_METHODS.filter(method => typeof routeModule[method] === 'function')
}

describe('v2.1.0 namespace parity', () => {
  for (const platform of ['ios', 'android'] as const) {
    const installedEndpoints = collectRouteEndpoints(join(apiRoot, platform, 'v2.0.0'))

    it(`${platform} ships a v2.1.0 route for every v2.0.0 route`, () => {
      expect(installedEndpoints.length).toBeGreaterThan(0)
      expect(collectRouteEndpoints(join(apiRoot, platform, 'v2.1.0'))).toEqual(
        expect.arrayContaining(installedEndpoints),
      )
    })

    it.each(installedEndpoints)(
      `${platform} v2.1.0 %s exports every HTTP method v2.0.0 exports`,
      async endpoint => {
        const shipped = await import(/* @vite-ignore */ `./${platform}/v2.0.0/${endpoint}/route.ts`)
        const mirrored = await import(/* @vite-ignore */ `./${platform}/v2.1.0/${endpoint}/route.ts`)

        const shippedMethods = exportedMethods(shipped)
        expect(shippedMethods.length).toBeGreaterThan(0)
        // Extra methods on 2.1.0 are allowed; missing ones are not.
        expect(exportedMethods(mirrored)).toEqual(expect.arrayContaining(shippedMethods))
      },
    )
  }
})
