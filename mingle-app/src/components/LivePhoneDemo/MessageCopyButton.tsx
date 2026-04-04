'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

const COPY_FEEDBACK_RESET_MS = 1800

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text)
    return true
  }

  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

interface MessageCopyButtonProps {
  label: string
  text: string
  className?: string
}

export default function MessageCopyButton({
  label,
  text,
  className,
}: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    if (!text.trim()) return

    try {
      const didCopy = await copyTextToClipboard(text)
      if (!didCopy) return

      setCopied(true)
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
      }, COPY_FEEDBACK_RESET_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-message-copy-button
      onClick={handleCopy}
      className={cn(
        'mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/85 text-gray-500 shadow-sm transition hover:bg-white hover:text-gray-700 active:scale-[0.98]',
        copied && 'border-emerald-200 bg-emerald-50 text-emerald-600',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
