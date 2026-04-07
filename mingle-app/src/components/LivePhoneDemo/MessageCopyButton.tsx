import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyTextWithFeedback } from './live-phone-demo.copy'

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
  const handleCopy = async () => {
    await copyTextWithFeedback(text)
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-message-copy-button
      onClick={handleCopy}
      className={cn(
        'inline-flex h-4 min-w-7 shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-sm px-1.5 align-middle text-gray-400 transition hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 active:scale-[0.98]',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <Copy className="h-3 w-3" />
    </button>
  )
}
