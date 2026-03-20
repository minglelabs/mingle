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
    <div data-translation-bubble-row className="ml-2.5 flex w-full items-start">
      <div
        data-translation-bubble-body
        className={cn(
          'inline-flex w-fit max-w-[80%] items-center gap-2 rounded-2xl rounded-tl-sm px-3.5 py-2',
          bubbleClassName,
        )}
      >
        <div
          data-translation-bubble-meta
          className={cn(
            'flex min-h-5 shrink-0 items-center gap-1 whitespace-nowrap',
            metaClassName,
          )}
        >
          <span className="text-base leading-none">{getSttLanguageFlag(lang)}</span>
          <span className="text-[11px] font-semibold uppercase leading-none">{lang}</span>
          {accessory}
        </div>
        <div data-translation-bubble-content className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
