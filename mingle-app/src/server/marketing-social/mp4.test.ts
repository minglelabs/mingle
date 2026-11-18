import { describe, expect, it } from 'vitest'
import { isMp4, isVertical916, readMp4Info } from './mp4'

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const size = 8 + payload.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, size)
  out.set(new TextEncoder().encode(type), 4)
  let offset = 8
  for (const p of payload) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function mvhd(timescale: number, duration: number): Uint8Array {
  const body = new Uint8Array(100)
  const view = new DataView(body.buffer)
  view.setUint32(12, timescale)
  view.setUint32(16, duration)
  return box('mvhd', body)
}

function tkhd(width: number, height: number): Uint8Array {
  const body = new Uint8Array(84)
  const view = new DataView(body.buffer)
  view.setUint32(76, width * 65536)
  view.setUint32(80, height * 65536)
  return box('tkhd', body)
}

function sampleMp4(width: number, height: number, ms: number): Uint8Array {
  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0\0isomiso2'))
  const moov = box('moov', mvhd(1000, ms), box('trak', tkhd(0, 0)), box('trak', tkhd(width, height)))
  const mdat = box('mdat', new Uint8Array(16))
  const out = new Uint8Array(ftyp.length + mdat.length + moov.length)
  out.set(ftyp, 0)
  out.set(mdat, ftyp.length)
  out.set(moov, ftyp.length + mdat.length)
  return out
}

describe('mp4 reader', () => {
  it('reads duration and the video track size, skipping a size-less (audio) track', () => {
    const bytes = sampleMp4(1080, 1920, 14_900)
    expect(isMp4(bytes)).toBe(true)
    expect(readMp4Info(bytes)).toEqual({ durationMs: 14_900, width: 1080, height: 1920 })
  })

  it('refuses non-mp4 bytes and survives truncated files', () => {
    expect(isMp4(new TextEncoder().encode('not a video at all'))).toBe(false)
    expect(readMp4Info(sampleMp4(1080, 1920, 1000).slice(0, 40))).toEqual({ durationMs: null, width: null, height: null })
  })

  it('checks 9:16', () => {
    expect(isVertical916(1080, 1920)).toBe(true)
    expect(isVertical916(720, 1280)).toBe(true)
    expect(isVertical916(1920, 1080)).toBe(false)
    expect(isVertical916(null, 1920)).toBe(false)
  })
})
