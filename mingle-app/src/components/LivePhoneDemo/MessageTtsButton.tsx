import { AudioLines, Loader2, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageTtsButtonProps {
  label: string
  onClick: () => void
  isLoading?: boolean
  isActive?: boolean
  className?: string
}

export default function MessageTtsButton({
  label,
  onClick,
  isLoading = false,
  isActive = false,
  className,
}: MessageTtsButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-message-tts-button
      onClick={onClick}
      className={cn(
        'inline-flex h-4 min-w-7 shrink-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-sm px-1.5 align-middle text-gray-400 transition hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 active:scale-[0.98]',
        (isLoading || isActive) && 'text-amber-600',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isActive ? (
        <AudioLines className="h-3 w-3" />
      ) : (
        <Volume2 className="h-3 w-3" />
      )}
    </button>
  )
}
