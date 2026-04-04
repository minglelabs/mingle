import { type CSSProperties, type ReactNode } from 'react'
import { getSttLanguageFlag } from '@/lib/stt-languages'
import { cn } from '@/lib/utils'
import MessageCopyButton from './MessageCopyButton'

interface TranslationBubbleRowProps {
  lang: string
  bubbleClassName: string
  metaClassName: string
  accessory?: ReactNode
  inlineMeta?: boolean
  maxWidth?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  copyLabel?: string
  copyText?: string
  children: ReactNode
}

export default function TranslationBubbleRow({
  lang,
  bubbleClassName,
  metaClassName,
  accessory,
  inlineMeta = true,
  maxWidth = '90%',
  contentClassName,
  contentStyle,
  copyLabel,
  copyText,
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

  return (
    <div data-translation-bubble-row className="flex w-full items-start">
      {inlineMeta ? (
        <div
          data-translation-bubble-body
          style={{ maxWidth, borderTopLeftRadius: '1px' }}
          className={cn(
            'w-fit rounded-2xl rounded-tl-sm px-3.5 py-2',
            bubbleClassName,
          )}
        >
          <p
            data-translation-bubble-content
            style={contentStyle}
            className={cn('min-w-0', contentClassName)}
          >
            {meta}
            <span data-translation-bubble-text className="align-middle">
              {children}
              {copyLabel && copyText ? (
                <MessageCopyButton
                  label={copyLabel}
                  text={copyText}
                />
              ) : null}
            </span>
          </p>
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
          </div>
        </div>
      )}
    </div>
  )
}
