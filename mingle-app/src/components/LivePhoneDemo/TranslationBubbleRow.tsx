import { type ReactNode } from 'react'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import { cn } from '@/lib/utils'

interface TranslationBubbleRowProps {
  lang: string
  bubbleClassName: string
  metaClassName: string
  accessory?: ReactNode
  children: ReactNode
}

export default function TranslationBubbleRow({
  lang,
  bubbleClassName,
  metaClassName,
  accessory,
  children,
}: TranslationBubbleRowProps) {
  return (
    <div
      data-translation-bubble-row
      className="ml-2.5 flex w-full max-w-[96%] items-start gap-2"
    >
      <div
        data-translation-bubble-body
        className={cn(
          'max-w-[calc(100%-3.75rem)] rounded-2xl rounded-tl-sm px-3.5 py-2',
          bubbleClassName,
        )}
      >
        {children}
      </div>
      <div
        data-translation-bubble-meta
        className={cn(
          'flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap pt-1.5',
          metaClassName,
        )}
      >
        <span className="text-base leading-none">{getSttLanguageFlag(lang)}</span>
        <span className="text-[11px] font-semibold uppercase leading-none">{lang}</span>
        {accessory}
      </div>
    </div>
  )
}
