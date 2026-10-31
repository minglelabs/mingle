// Where the map goes in the game area. The world is 914 x 560. On a tall area
// the renderer shows it turned a quarter (burrow at the bottom, flower at the
// top), so the map is 560 wide and 914 high there. The map takes the whole width
// it can (UIUX-ISSUES #134: "맵이 너무 작음, 가로를 꽉 채워줘") and sits at the top
// of a tall area; the touch controls lie over its foot, on the burrow floor, and
// in whatever strip the area has left under it.

export const HASH_RUSH_WORLD = { w: 914, h: 560 } as const

export type HashRushFieldLayout = {
  /** The area is taller than wide: the map is shown turned. */
  tall: boolean
  widthPx: number
  heightPx: number
  /** From the area's top: 0 on a tall area, centred on a wide one. */
  topPx: number
}

export function resolveHashRushField(areaWidthPx: number, areaHeightPx: number): HashRushFieldLayout | null {
  if (!(areaWidthPx > 0) || !(areaHeightPx > 0)) return null
  const tall = areaHeightPx > areaWidthPx
  // Width over height of the map as it is shown.
  const aspect = tall ? HASH_RUSH_WORLD.h / HASH_RUSH_WORLD.w : HASH_RUSH_WORLD.w / HASH_RUSH_WORLD.h
  const widthPx = Math.floor(Math.min(areaWidthPx, areaHeightPx * aspect))
  const heightPx = Math.floor(widthPx / aspect)
  return { tall, widthPx, heightPx, topPx: tall ? 0 : Math.max(0, Math.floor((areaHeightPx - heightPx) / 2)) }
}
