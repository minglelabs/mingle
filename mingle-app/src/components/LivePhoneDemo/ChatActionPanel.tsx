import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

export type ChatActionPanelItem = {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  // A toggle that is on (earphone mode) or a live state (a call in this room).
  active?: boolean
  disabled?: boolean
}

// Used until the keyboard has been up once, so its height is known.
export const CHAT_ACTION_PANEL_DEFAULT_HEIGHT_PX = 260
const CHAT_ACTION_PANEL_MIN_HEIGHT_PX = 200
const CHAT_ACTION_PANEL_MAX_HEIGHT_PX = 440

export function resolveChatActionPanelHeightPx(lastKeyboardHeightPx: number): number {
  if (!Number.isFinite(lastKeyboardHeightPx) || lastKeyboardHeightPx <= 0) return CHAT_ACTION_PANEL_DEFAULT_HEIGHT_PX
  return Math.round(Math.min(CHAT_ACTION_PANEL_MAX_HEIGHT_PX, Math.max(CHAT_ACTION_PANEL_MIN_HEIGHT_PX, lastKeyboardHeightPx)))
}

/** The round "+" in the bottom bar; turns into × while its panel is open. */
export function ChatActionPlusButton({
  open,
  label,
  sizePx,
  onToggle,
}: {
  open: boolean
  label: string
  sizePx: number
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-qa="live-demo-action-panel-toggle"
      aria-label={label}
      aria-expanded={open}
      // Keep the textarea's focus decision to onToggle (it closes the keyboard itself).
      onPointerDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={`inline-flex shrink-0 items-center justify-center self-end rounded-full transition-all duration-200 active:scale-95 ${
        open ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      style={{ width: sizePx, height: sizePx }}
    >
      <Plus
        size={Math.round(sizePx * 0.55)}
        strokeWidth={2.2}
        className="transition-transform duration-200"
        style={{ transform: open ? 'rotate(45deg)' : undefined }}
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * KakaoTalk-style action sheet that takes the keyboard's place under the
 * bottom bar: round icons with labels, scrolling when there are more.
 */
export default function ChatActionPanel({
  items,
  heightPx,
  bottomOffset,
}: {
  items: ChatActionPanelItem[]
  heightPx: number
  // The bar's own bottom inset: the panel fills the room the bar keeps for
  // it (the keyboard's place), so it adds no height of its own.
  bottomOffset: string
}) {
  return (
    <div
      data-qa="live-demo-action-panel"
      className="no-scrollbar absolute inset-x-0 overflow-y-auto overscroll-contain bg-white px-3"
      style={{ height: heightPx, bottom: bottomOffset }}
    >
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-1 pb-2 pt-3">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            data-qa={`live-demo-action-panel-item-${item.key}`}
            aria-label={item.label}
            aria-pressed={item.active}
            disabled={item.disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={item.onSelect}
            className="flex min-w-0 flex-col items-center gap-1.5 transition active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <span
              className={`relative flex h-[54px] w-[54px] items-center justify-center rounded-full ${
                item.active ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {item.icon}
            </span>
            <span className="line-clamp-2 w-full text-center text-[12px] leading-tight text-gray-600">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
