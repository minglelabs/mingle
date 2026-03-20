'use client'

import { memo, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  formatChatBubbleTimestampLines,
  getNextChatBubbleTimestampUpdateDelayMs,
} from './chat-bubble.timestamp'

const CHAT_BUBBLE_TIMESTAMP_LINE_HEIGHT = 1.05

interface ChatBubbleTimestampProps {
  createdAtMs?: number
  uiLocale: string
  align?: 'right' | 'center'
  minWidth?: string
  className?: string
}

function ChatBubbleTimestamp({
  createdAtMs,
  uiLocale,
  align = 'right',
  minWidth = '2.25rem',
  className,
}: ChatBubbleTimestampProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const delayMs = getNextChatBubbleTimestampUpdateDelayMs(createdAtMs)
    if (delayMs === null) return

    const timeoutId = window.setTimeout(() => {
      setTick(current => current + 1)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [createdAtMs, tick, uiLocale])

  const timestampLines = formatChatBubbleTimestampLines(createdAtMs, uiLocale)
  if (timestampLines.length === 0) return null

  return (
    <div
      data-original-bubble-timestamp
      style={{ lineHeight: CHAT_BUBBLE_TIMESTAMP_LINE_HEIGHT, minWidth }}
      className={cn(
        'flex shrink-0 flex-col text-[10px] text-black/[0.34] tabular-nums',
        align === 'center'
          ? 'items-center text-center'
          : 'items-end self-end text-right',
        className,
      )}
    >
      {timestampLines.map((line, index) => (
        <span key={`${createdAtMs || 'timestamp'}-${index}`} className="whitespace-nowrap">
          {line}
        </span>
      ))}
    </div>
  )
}

export default memo(
  ChatBubbleTimestamp,
  (prev, next) => (
    prev.createdAtMs === next.createdAtMs
    && prev.uiLocale === next.uiLocale
    && prev.align === next.align
    && prev.minWidth === next.minWidth
    && prev.className === next.className
  ),
)
