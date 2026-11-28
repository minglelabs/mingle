import { createRequire } from 'node:module'
import { readRequestIp } from '@/server/identity/links'

type HeaderReader = { get(name: string): string | null }
type GeoIp = { lookup(ip: string): { country?: string } | null }

// The IP → country table (geoip-country, ~8 MB) loads on the first lookup, never at start-up.
// Looked up on this server: the person's IP is never sent anywhere.
let geoip: GeoIp | null | undefined
function loadGeoIp(): GeoIp | null {
  if (geoip !== undefined) return geoip
  try {
    geoip = createRequire(import.meta.url)('geoip-country') as GeoIp
  } catch {
    geoip = null
  }
  return geoip
}

/**
 * The country a request comes from (ISO 3166-1 alpha-2, upper case), or null
 * when it cannot be told (no IP, a private address, a failed lookup). A
 * country header from a proxy in front (Cloudflare, Vercel) wins over the
 * lookup.
 */
export function readRequestCountry(headers: HeaderReader): string | null {
  const fromProxy = (headers.get('cf-ipcountry') || headers.get('x-vercel-ip-country') || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(fromProxy) && fromProxy !== 'XX' && fromProxy !== 'T1') return fromProxy
  const ip = readRequestIp(headers)?.replace(/^::ffff:/, '')
  if (!ip) return null
  try {
    const country = loadGeoIp()?.lookup(ip)?.country
    return typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null
  } catch {
    return null
  }
}
