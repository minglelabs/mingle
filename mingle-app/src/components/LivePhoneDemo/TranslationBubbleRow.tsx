import { type CSSProperties, type ReactNode } from 'react'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import { cn } from '@/lib/utils'
import CopyableBubbleSurface from './CopyableBubbleSurface'

interface TranslationBubbleRowProps {
  lang: string
  bubbleClassName: string
  metaClassName: string
  accessory?: ReactNode
  actions?: ReactNode
  inlineMeta?: boolean
  maxWidth?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  copyText?: string
  copyBubbleLabel?: string
  allText?: string
  copyAllBubblesLabel?: string
  children?: ReactNode
}

export default function TranslationBubbleRow({
  lang,
  bubbleClassName,
  metaClassName,
  accessory,
  actions,
  inlineMeta = true,
  maxWidth = '90%',
  contentClassName,
  contentStyle,
  copyText,
  copyBubbleLabel,
  allText,
  copyAllBubblesLabel,
  children,
}: TranslationBubbleRowProps) {
  const meta = (
    <span
      data-translation-bubble-meta
      className={cn(
        'mr-1.5 inline-flex items-center gap-1 whitespace-nowrap align-middle rounded-full px-1 py-0.5',
        metaClassName,
      )}
    >
      <span className="text-base leading-none">{getSttLanguageFlag(lang)}</span>
      <span className="text-[11px] font-semibold uppercase leading-none">{lang}</span>
      {accessory}
    </span>
  )

  const inlineBubbleBody = (
    <p
      data-translation-bubble-content
      style={contentStyle}
      className={cn('min-w-0', contentClassName)}
    >
      {meta}
      <span data-translation-bubble-text className="align-middle">
        {children}
        {actions}
      </span>
    </p>
  )

  return (
    <div data-translation-bubble-row className="flex w-full items-start">
      {inlineMeta && copyText ? (
        <CopyableBubbleSurface
          data-translation-bubble-body
          text={copyText}
          allText={allText}
          copyBubbleLabel={copyBubbleLabel ?? 'Copy'}
          copyAllBubblesLabel={copyAllBubblesLabel}
          style={{ maxWidth, borderTopLeftRadius: '1px' }}
          className={cn(
            'w-fit rounded-2xl rounded-tl-sm px-3.5 py-2',
            bubbleClassName,
          )}
        >
          {inlineBubbleBody}
        </CopyableBubbleSurface>
      ) : inlineMeta ? (
        <div
          data-translation-bubble-body
          style={{ maxWidth, borderTopLeftRadius: '1px' }}
          className={cn(
            'w-fit rounded-2xl rounded-tl-sm px-3.5 py-2',
            bubbleClassName,
          )}
        >
          {inlineBubbleBody}
        </div>
      ) : (
        <div
          data-translation-bubble-body
          style={{ maxWidth, borderTopLeftRadius: '1px' }}
          className={cn(
            'inline-flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm px-3.5 py-2',
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
          <div data-translation-bubble-content className="min-w-0">
            {children}
            {actions}
          </div>
        </div>
      )}
    </div>
  )
}
