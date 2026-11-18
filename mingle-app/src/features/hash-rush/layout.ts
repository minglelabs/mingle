// Where the map goes in the game area. The world is 914 x 560. On a tall screen
// the renderer shows it turned a quarter (burrow at the bottom, flower at the
// top), so the map is 560 wide and 914 high there.
//
// The game area handed in here is what is left of the screen once the status
// bar (the top safe area) and, on a phone, the strip of touch controls under
// the map are taken off (hash-rush-game.module.css `.arena`). The map takes the
// whole width it can in it (UIUX-ISSUES #134: "맵이 너무 작음, 가로를 꽉 채워줘")
// and sits at its top, so nothing lies over the burrow, where every hamster
// starts and has to come back to (2026-11-01 device check: the pad and the bonk
// button covered the home row).

export const HASH_RUSH_WORLD = { w: 914, h: 560 } as const

export type HashRushFieldLayout = {
  /** The map is shown turned (a tall screen). */
  tall: boolean
  widthPx: number
  heightPx: number
  /** From the area's top: 0 on a tall screen, centred on a wide one. */
  topPx: number
}

/**
 * The map's box in a game area. `tall` is the screen's own shape; it is passed
 * in because the area under a phone's controls can be squatter than the screen.
 */
export function resolveHashRushField(areaWidthPx: number, areaHeightPx: number, tall = areaHeightPx > areaWidthPx): HashRushFieldLayout | null {
  if (!(areaWidthPx > 0) || !(areaHeightPx > 0)) return null
  // Width over height of the map as it is shown.
  const aspect = tall ? HASH_RUSH_WORLD.h / HASH_RUSH_WORLD.w : HASH_RUSH_WORLD.w / HASH_RUSH_WORLD.h
  const widthPx = Math.floor(Math.min(areaWidthPx, areaHeightPx * aspect))
  const heightPx = Math.floor(widthPx / aspect)
  return { tall, widthPx, heightPx, topPx: tall ? 0 : Math.max(0, Math.floor((areaHeightPx - heightPx) / 2)) }
}
