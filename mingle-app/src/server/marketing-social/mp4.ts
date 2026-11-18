/**
 * Minimal ISO-BMFF (mp4/mov) reader: is it an mp4, how long is it, and how
 * big is its video track. Walks top-level boxes and moov's children only.
 */
export type Mp4Info = { durationMs: number | null; width: number | null; height: number | null }

type Box = { type: string; start: number; headerSize: number; end: number }

function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let size = view.getUint32(offset)
    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7))
    let headerSize = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(view.getBigUint64(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < headerSize || offset + size > end) break
    boxes.push({ type, start: offset, headerSize, end: offset + size })
    offset += size
  }
  return boxes
}

export function isMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  return String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp'
}

function readMvhdDuration(view: DataView, box: Box): number | null {
  const p = box.start + box.headerSize
  const version = view.getUint8(p)
  const timescale = version === 1 ? view.getUint32(p + 20) : view.getUint32(p + 12)
  const duration = version === 1 ? Number(view.getBigUint64(p + 24)) : view.getUint32(p + 16)
  if (!timescale) return null
  return Math.round((duration / timescale) * 1000)
}

function readTkhdSize(view: DataView, box: Box): { width: number; height: number } {
  const p = box.start + box.headerSize
  const version = view.getUint8(p)
  // version(1)+flags(3) + times + track id + reserved + duration + reserved(8) + layer/alt/volume/reserved(8) + matrix(36)
  const base = p + (version === 1 ? 4 + 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4 + 4) + 8 + 8 + 36
  return { width: view.getUint32(base) / 65536, height: view.getUint32(base + 4) / 65536 }
}

export function readMp4Info(bytes: Uint8Array): Mp4Info {
  const info: Mp4Info = { durationMs: null, width: null, height: null }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const moov = readBoxes(view, 0, bytes.byteLength).find((b) => b.type === 'moov')
  if (!moov) return info
  for (const child of readBoxes(view, moov.start + moov.headerSize, moov.end)) {
    if (child.type === 'mvhd') info.durationMs = readMvhdDuration(view, child)
    if (child.type === 'trak' && info.width === null) {
      const tkhd = readBoxes(view, child.start + child.headerSize, child.end).find((b) => b.type === 'tkhd')
      if (tkhd) {
        const size = readTkhdSize(view, tkhd)
        if (size.width > 0 && size.height > 0) {
          info.width = Math.round(size.width)
          info.height = Math.round(size.height)
        }
      }
    }
  }
  return info
}

/** True when width:height is 9:16 within 2 %. */
export function isVertical916(width: number | null, height: number | null): boolean {
  if (!width || !height) return false
  return Math.abs(width / height - 9 / 16) <= (9 / 16) * 0.02
}
