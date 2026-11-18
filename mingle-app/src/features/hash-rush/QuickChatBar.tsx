'use client'

// The game's ready-made lines (quick-chat.ts) in one sideways row, right above
// the room's composer while it is up over the game. A tap sends one as a room
// message; the composer keeps its focus and its keyboard.

import { hashRushGameCopy } from './copy'
import { hashRushQuickChat } from './quick-chat'

export function HashRushQuickChatBar({ uiLocale, onSend }: { uiLocale: string, onSend: (text: string) => void }) {
  const copy = hashRushGameCopy(uiLocale)
  return (
    <div
      role="toolbar"
      aria-label={copy.quickChat}
      // Sideways swipes scroll the row; the room's edge swipe must not start here.
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      className="no-scrollbar flex gap-1.5 overflow-x-auto overscroll-x-contain py-1.5"
      style={{
        touchAction: 'pan-x',
        paddingLeft: 'max(calc(env(safe-area-inset-left) + 10px), 14px)',
        paddingRight: 'max(calc(env(safe-area-inset-right) + 10px), 14px)',
      }}
      data-qa="hash-rush-quick-chat"
    >
      {hashRushQuickChat(uiLocale).map((text) => (
        <button
          key={text}
          type="button"
          // Keep the composer's focus (and its keyboard) while tapping a line.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onSend(text)}
          // 44pt tall at 16px: a thumb hits it for sure (UIUX-ISSUES #192).
          className="h-11 min-w-[52px] shrink-0 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3.5 text-[16px] font-medium leading-5 text-gray-800 transition-colors active:bg-gray-100"
        >
          {text}
        </button>
      ))}
    </div>
  )
}
