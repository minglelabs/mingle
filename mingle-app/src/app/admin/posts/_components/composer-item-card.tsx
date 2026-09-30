'use client'

import { Check, ChevronRight, ImagePlus, Languages, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import PostBackgroundSurface from '@/components/compose/post-background-surface'
import { getBackgroundKeys, getBackgroundPreset } from '@/lib/post-backgrounds'
import { OPERATOR_POST_CONVERT_INPUT_MAX, type OperatorPostPickerEntry } from '@/server/operator-posts/types'
import {
  conversionIsCurrent,
  finalText,
  hasText,
  itemIssueLabel,
  type ComposerItem,
  type ItemIssue,
  type ScheduleMode,
} from '../_lib/composer'
import {
  apiErrorMessage,
  backgroundLabel,
  INVALID_REASON_LABEL,
  languageLabel,
  operatorDisplayName,
} from '../_lib/copy'
import OperatorAvatar from './operator-avatar'

const BACKGROUND_KEYS = getBackgroundKeys()
const PICKER_ACCEPT = 'image/jpeg,image/png,image/webp'

export type ComposerItemHandlers = {
  onPickOperator: () => void
  onTextChange: (text: string) => void
  onTextBlur: () => void
  onToggleConvert: (convert: boolean) => void
  onConvert: () => void
  onPickPhoto: (file: File) => void
  onRemovePhoto: () => void
  onRetryPhoto: () => void
  onBackground: (backgroundKey: string | null) => void
  onPublishAt: (value: string) => void
  onRemove: () => void
}

function ConversionPanel({ item, operator, textMax, onConvert }: {
  item: ComposerItem
  operator: OperatorPostPickerEntry | null
  textMax: number
  onConvert: () => void
}) {
  const language = operator?.language ? languageLabel(operator.language) : '페르소나 언어'
  const conversion = item.conversion
  const forCurrent = conversion?.forText === item.text && conversion?.forOperatorId === item.operatorId
  const posted = finalText(item)

  let status: ReactNode
  if (!item.operatorId) {
    status = <span className="text-slate-500">계정을 고르면 그 계정의 언어로 바꿔 보여 드려요.</span>
  } else if (forCurrent && conversion?.status === 'converting') {
    status = (
      <span className="inline-flex items-center gap-1.5 text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {language}로 바꾸는 중…
      </span>
    )
  } else if (forCurrent && conversion?.status === 'error') {
    status = <span className="text-rose-700">{apiErrorMessage(conversion.error)}</span>
  } else if (conversionIsCurrent(item)) {
    status = (
      <span className="text-slate-600">
        {conversion?.converted ? `${language}로 바꿨어요. 이 내용이 그대로 올라가요.` : `이미 ${language}라서 그대로 올라가요.`}
      </span>
    )
  } else {
    status = (
      <span className="text-amber-700">
        {conversion ? '내용이 바뀌었어요. 다시 변환해 주세요.' : '변환 미리보기를 만들어 주세요.'}
      </span>
    )
  }

  const canConvert = !!item.operatorId && !(forCurrent && conversion?.status === 'converting')
  const showRetry = canConvert && !conversionIsCurrent(item)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-snug">
        <p className="min-w-0 flex-1 break-words">{status}</p>
        {showRetry ? (
          <button
            type="button"
            onClick={onConvert}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 active:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> {conversion ? '다시 변환' : '변환하기'}
          </button>
        ) : null}
      </div>
      {posted !== null ? (
        <>
          <PostBackgroundSurface backgroundKey={item.backgroundKey} text={posted} imageUrl={null} compact />
          <p className={`text-right text-xs ${posted.length > textMax ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
            게시될 내용 {posted.length}/{textMax}자
          </p>
        </>
      ) : null}
    </div>
  )
}

function BackgroundPicker({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-slate-700">
        배경{' '}
        <span className="font-normal text-slate-500">
          {value === null ? '(자동: 게시할 때 무작위로 정해져요)' : `(${backgroundLabel(value)})`}
        </span>
      </legend>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-1"
          aria-label="배경 자동 (게시할 때 무작위)"
        >
          <span
            className={`inline-flex h-9 items-center rounded-full border border-dashed px-3 text-xs font-semibold ${
              value === null ? 'border-sky-600 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-600'
            }`}
          >
            자동
          </span>
        </button>
        {BACKGROUND_KEYS.map((key) => {
          const preset = getBackgroundPreset(key)
          const selected = value === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={selected}
              aria-label={`배경 ${backgroundLabel(key)}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
            >
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                  selected ? 'border-sky-600 ring-2 ring-sky-600 ring-offset-1' : 'border-slate-200'
                }`}
                style={{ background: preset?.background, color: preset?.textColor }}
              >
                {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function PhotoArea({ item, handlers }: { item: ComposerItem; handlers: ComposerItemHandlers }) {
  const photo = item.photo
  if (item.photoPreparing && !photo) {
    return (
      <p className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> 사진 준비 중…
      </p>
    )
  }
  if (!photo) {
    return (
      <div className="space-y-1">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-700 active:bg-slate-100">
          <ImagePlus className="h-4 w-4" aria-hidden /> 사진 추가
          <input
            type="file"
            accept={PICKER_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) handlers.onPickPhoto(file)
            }}
          />
        </label>
        {item.photoError ? <p className="break-words text-[13px] text-rose-700">{item.photoError}</p> : null}
      </div>
    )
  }

  let status: ReactNode = null
  if (photo.status === 'waiting' || (photo.status === 'ready' && photo.forOperatorId !== item.operatorId)) {
    status = '계정을 고르면 올라가요'
  } else if (photo.status === 'uploading') {
    status = (
      <span className="inline-flex items-center gap-1">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> 올리는 중
      </span>
    )
  } else if (photo.status === 'ready') {
    status = (
      <span className="inline-flex items-center gap-1">
        <Check className="h-3.5 w-3.5" aria-hidden /> 올림
      </span>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.previewUrl} alt="첨부한 사진" className="h-full w-full object-cover" />
        {status ? (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-1.5 py-1 text-center text-[11px] font-medium text-white">
            {status}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {photo.status === 'error' ? (
          <>
            <p className="break-words text-[13px] text-rose-700">{apiErrorMessage(photo.error)}</p>
            <button
              type="button"
              onClick={handlers.onRetryPhoto}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 active:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> 다시 올리기
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={handlers.onRemovePhoto}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-slate-600 active:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden /> 사진 빼기
        </button>
      </div>
    </div>
  )
}

export default function ComposerItemCard({
  item,
  number,
  operator,
  mode,
  textMax,
  issue,
  handlers,
}: {
  item: ComposerItem
  number: number
  operator: OperatorPostPickerEntry | null
  mode: ScheduleMode
  textMax: number
  /** Shown once staff tried to submit. */
  issue: ItemIssue | null
  handlers: ComposerItemHandlers
}) {
  const textId = `post-text-${item.key}`
  const withText = hasText(item.text)

  return (
    <article
      id={`composer-${item.key}`}
      className={`space-y-4 rounded-2xl border bg-white p-4 shadow-sm ${
        issue || item.rejection ? 'border-amber-400' : 'border-slate-200'
      }`}
      aria-label={`게시물 ${number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-500">게시물 {number}</span>
        <button
          type="button"
          onClick={handlers.onRemove}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 text-[13px] font-semibold text-slate-500 active:bg-slate-100"
          aria-label={`게시물 ${number} 지우기`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={handlers.onPickOperator}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left active:bg-slate-100"
      >
        {operator ? (
          <>
            <OperatorAvatar operator={operator} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[15px] font-semibold">{operatorDisplayName(operator)}</span>
              <span className="block break-all text-[13px] text-slate-500">
                @{operator.handle} · {languageLabel(operator.language)}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-sky-700">변경</span>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-sky-700">운영 계정 고르기</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          </>
        )}
      </button>

      <PhotoArea item={item} handlers={handlers} />

      <div className="space-y-1">
        <label htmlFor={textId} className="text-[13px] font-medium text-slate-700">
          내용 <span className="font-normal text-slate-500">(어떤 언어로 써도 돼요)</span>
        </label>
        <textarea
          id={textId}
          value={item.text}
          onChange={(event) => handlers.onTextChange(event.target.value)}
          onBlur={handlers.onTextBlur}
          rows={4}
          maxLength={OPERATOR_POST_CONVERT_INPUT_MAX}
          placeholder="올릴 내용을 쓰세요"
          className="block w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base leading-relaxed outline-none focus:border-sky-500"
        />
        {!item.convert && withText ? (
          <p className={`text-right text-xs ${item.text.length > textMax ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
            {item.text.length}/{textMax}자
          </p>
        ) : null}
      </div>

      {withText ? (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={item.convert}
              onChange={(event) => handlers.onToggleConvert(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-sky-600"
            />
            <span className="min-w-0 flex-1 text-[14px] font-medium">
              <Languages className="mr-1 inline h-4 w-4 align-[-2px] text-slate-500" aria-hidden />
              페르소나 언어{operator?.language ? `(${languageLabel(operator.language)})` : ''}로 변환
            </span>
          </label>
          {item.convert ? (
            <ConversionPanel item={item} operator={operator} textMax={textMax} onConvert={handlers.onConvert} />
          ) : (
            <>
              <p className="text-[13px] text-slate-600">쓴 그대로 올라가요.</p>
              <PostBackgroundSurface backgroundKey={item.backgroundKey} text={item.text} imageUrl={null} compact />
            </>
          )}
          <BackgroundPicker value={item.backgroundKey} onChange={handlers.onBackground} />
        </div>
      ) : null}

      {mode === 'at' ? (
        <div className="space-y-1">
          <label htmlFor={`publish-at-${item.key}`} className="text-[13px] font-medium text-slate-700">
            게시 시간 <span className="font-normal text-slate-500">(한국 시간)</span>
          </label>
          <input
            id={`publish-at-${item.key}`}
            type="datetime-local"
            step={60}
            value={item.publishAt}
            onChange={(event) => handlers.onPublishAt(event.target.value)}
            className="block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-500"
          />
        </div>
      ) : null}

      {item.rejection ? (
        <p className="break-words rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900" role="alert">
          예약하지 못했어요: {INVALID_REASON_LABEL[item.rejection]}
        </p>
      ) : issue ? (
        <p className="break-words rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900" role="alert">
          {itemIssueLabel(issue, textMax)}
        </p>
      ) : null}
    </article>
  )
}
