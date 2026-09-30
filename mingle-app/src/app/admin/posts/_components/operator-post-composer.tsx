'use client'

import { Images, LoaderCircle, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ComposeImageError, prepareComposeImage, type ImagePrepError } from '@/components/compose/compose-image'
import { OPERATOR_POST_BATCH_MAX_ITEMS, type OperatorPostPickerEntry } from '@/server/operator-posts/types'
import { convertText, createBatch, createLimiter, uploadOperatorImage } from '../_lib/api'
import {
  batchOutcome,
  buildBatchItems,
  fillPublishTimes,
  hasText,
  itemIssue,
  mergeBatchOutcome,
  needsConversion,
  newComposerItem,
  type ComposerItem,
  type ScheduleMode,
} from '../_lib/composer'
import { apiErrorMessage } from '../_lib/copy'
import ComposerItemCard, { type ComposerItemHandlers } from './composer-item-card'
import OperatorPicker from './operator-picker'

const PICKER_ACCEPT = 'image/jpeg,image/png,image/webp'

const IMAGE_PREP_ERROR: Record<ImagePrepError, string> = {
  unsupported: 'JPG, PNG, WebP 사진만 올릴 수 있어요.',
  heic_unsupported:
    '이 브라우저는 HEIC 사진을 열 수 없어요. 사진을 JPG로 저장하거나, 아이폰 설정 › 카메라 › 포맷에서 ‘높은 호환성’을 고른 뒤 다시 골라 주세요.',
  too_large: '사진이 너무 커요 (최대 10MB).',
  decode_failed: '사진을 열 수 없어요. 다른 사진을 골라 주세요.',
  encode_failed: '사진을 준비하지 못했어요. 다시 시도해 주세요.',
  unavailable: '이 브라우저에서는 사진을 준비할 수 없어요.',
}

const MODES: ReadonlyArray<{ mode: ScheduleMode; label: string; help: string }> = [
  {
    mode: 'spread',
    label: '나눠서 게시',
    help: '첫 게시물은 약 2분 뒤에, 나머지는 6시간에 걸쳐 나눠 올라가요. 같은 계정의 게시물은 30분 넘게 띄워요.',
  },
  {
    mode: 'now',
    label: '바로 게시',
    help: '지금 바로 모두 올라가요. 한꺼번에 올리면 운영 계정 글이 피드 맨 위를 채울 수 있어요.',
  },
  { mode: 'at', label: '시간 지정', help: '게시물마다 올라갈 시간을 정해요 (한국 시간).' },
]

type Notice =
  | { kind: 'success'; batchId: string | null; queued: number; invalid: number }
  | { kind: 'error'; message: string }

function isBlankItem(item: ComposerItem): boolean {
  return !hasText(item.text) && !item.photo && !item.photoPreparing
}

export default function OperatorPostComposer({
  operators,
  textMax,
}: {
  operators: OperatorPostPickerEntry[]
  textMax: number
}) {
  const router = useRouter()
  const [items, setItems] = useState<ComposerItem[]>(() => [newComposerItem('item-1', null)])
  const [mode, setMode] = useState<ScheduleMode>('spread')
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  // Latest committed items, for async continuations (an upload finishing, a photo decoded).
  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])
  const keySeq = useRef(1)
  const objectUrls = useRef(new Set<string>())
  const [convertLimit] = useState(() => createLimiter(3))
  const [uploadLimit] = useState(() => createLimiter(2))
  // Decoding big camera photos is memory-heavy on a phone: two at a time.
  const [prepareLimit] = useState(() => createLimiter(2))

  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const operatorsById = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators])

  const nextKey = useCallback(() => {
    keySeq.current += 1
    return `item-${keySeq.current}`
  }, [])

  const revoke = useCallback((url: string) => {
    URL.revokeObjectURL(url)
    objectUrls.current.delete(url)
  }, [])

  const updateItem = useCallback((key: string, update: (item: ComposerItem) => ComposerItem) => {
    setItems((previous) => previous.map((item) => (item.key === key ? update(item) : item)))
  }, [])

  const runConversion = useCallback(
    (key: string, operatorId: string, text: string) => {
      updateItem(key, (item) => ({
        ...item,
        conversion: {
          status: 'converting',
          forText: text,
          forOperatorId: operatorId,
          text: null,
          language: null,
          converted: false,
          error: null,
        },
      }))
      return convertLimit(async () => {
        const result = await convertText(operatorId, text)
        updateItem(key, (item) => {
          // A newer conversion (text or operator changed) owns the item now.
          if (item.conversion?.forText !== text || item.conversion?.forOperatorId !== operatorId) return item
          return {
            ...item,
            conversion: result.ok
              ? {
                  status: 'ready',
                  forText: text,
                  forOperatorId: operatorId,
                  text: result.data.text,
                  language: result.data.language,
                  converted: result.data.converted,
                  error: null,
                }
              : {
                  status: 'error',
                  forText: text,
                  forOperatorId: operatorId,
                  text: null,
                  language: null,
                  converted: false,
                  error: result.error,
                },
          }
        })
      })
    },
    [convertLimit, updateItem],
  )

  const uploadPhoto = useCallback(
    (key: string, file: File, operatorId: string) => {
      updateItem(key, (item) =>
        item.photo?.file === file
          ? {
              ...item,
              photo: { ...item.photo, status: 'uploading', forOperatorId: operatorId, imageObjectKey: null, error: null },
            }
          : item,
      )
      return uploadLimit(async () => {
        const result = await uploadOperatorImage(operatorId, file)
        updateItem(key, (item) => {
          // The photo was replaced or the operator changed meanwhile: that upload is stale.
          if (!item.photo || item.photo.file !== file || item.operatorId !== operatorId) return item
          return {
            ...item,
            photo: result.ok
              ? {
                  ...item.photo,
                  status: 'ready',
                  forOperatorId: operatorId,
                  imageObjectKey: result.data.imageObjectKey,
                  width: result.data.width,
                  height: result.data.height,
                  error: null,
                }
              : { ...item.photo, status: 'error', forOperatorId: operatorId, error: result.error },
          }
        })
      })
    },
    [updateItem, uploadLimit],
  )

  const attachPhoto = useCallback(
    async (key: string, original: File) => {
      updateItem(key, (item) => ({ ...item, photoPreparing: true, photoError: null, rejection: null }))
      let prepared: File
      try {
        prepared = (await prepareLimit(() => prepareComposeImage(original))).file
      } catch (error) {
        const reason: ImagePrepError = error instanceof ComposeImageError ? error.reason : 'decode_failed'
        updateItem(key, (item) => ({ ...item, photoPreparing: false, photoError: IMAGE_PREP_ERROR[reason] }))
        return
      }
      const current = itemsRef.current.find((item) => item.key === key)
      if (!current) return // removed while the photo was being prepared
      if (current.photo) revoke(current.photo.previewUrl)
      const previewUrl = URL.createObjectURL(prepared)
      objectUrls.current.add(previewUrl)
      const operatorId = current.operatorId
      updateItem(key, (item) => ({
        ...item,
        photoPreparing: false,
        photo: {
          file: prepared,
          previewUrl,
          status: operatorId ? 'uploading' : 'waiting',
          forOperatorId: null,
          imageObjectKey: null,
          width: null,
          height: null,
          error: null,
        },
      }))
      if (operatorId) void uploadPhoto(key, prepared, operatorId)
    },
    [prepareLimit, revoke, updateItem, uploadPhoto],
  )

  const closePicker = useCallback(() => setPickerFor(null), [])

  const selectOperator = (operatorId: string) => {
    const key = pickerFor
    setPickerFor(null)
    const item = key ? itemsRef.current.find((candidate) => candidate.key === key) : undefined
    if (!key || !item || item.operatorId === operatorId) return
    updateItem(key, (current) => ({ ...current, operatorId, rejection: null }))
    // The photo key is minted per operator, and the persona language changed: redo both.
    if (item.photo) void uploadPhoto(key, item.photo.file, operatorId)
    if (item.convert && hasText(item.text)) void runConversion(key, operatorId, item.text)
  }

  const addItem = () => {
    if (itemsRef.current.length >= OPERATOR_POST_BATCH_MAX_ITEMS) {
      setNotice({ kind: 'error', message: `한 번에 ${OPERATOR_POST_BATCH_MAX_ITEMS}개까지 만들 수 있어요.` })
      return
    }
    const key = nextKey()
    const now = Date.now()
    setItems((previous) => {
      const list = [...previous, newComposerItem(key, previous.at(-1)?.operatorId ?? null)]
      return mode === 'at' ? fillPublishTimes(list, now) : list
    })
    requestAnimationFrame(() => {
      document.getElementById(`composer-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const addPhotoItems = (files: File[]) => {
    const current = itemsRef.current
    const starterIsBlank = current.length === 1 && isBlankItem(current[0])
    const room = OPERATOR_POST_BATCH_MAX_ITEMS - (starterIsBlank ? 0 : current.length)
    const accepted = files.slice(0, Math.max(room, 0))
    if (accepted.length < files.length) {
      setNotice({
        kind: 'error',
        message: `한 번에 ${OPERATOR_POST_BATCH_MAX_ITEMS}개까지 만들 수 있어서 사진 ${files.length - accepted.length}장은 뺐어요.`,
      })
    }
    if (accepted.length === 0) return
    const keys = accepted.map(() => nextKey())
    const now = Date.now()
    setItems((previous) => {
      const operatorId = previous.at(-1)?.operatorId ?? null
      // The untouched starter card would stay empty above the photos: replace it.
      const base = previous.length === 1 && isBlankItem(previous[0]) ? [] : previous
      const list = [...base, ...keys.map((key) => ({ ...newComposerItem(key, operatorId), photoPreparing: true }))]
      return mode === 'at' ? fillPublishTimes(list, now) : list
    })
    accepted.forEach((file, index) => {
      void attachPhoto(keys[index], file)
    })
  }

  const removeItem = (key: string) => {
    const item = itemsRef.current.find((candidate) => candidate.key === key)
    if (item && !isBlankItem(item) && !window.confirm('이 게시물을 지울까요?')) return
    if (item?.photo) revoke(item.photo.previewUrl)
    setItems((previous) => previous.filter((candidate) => candidate.key !== key))
  }

  const changeMode = (event: MouseEvent<HTMLButtonElement>) => {
    const next = MODES.find((entry) => entry.mode === event.currentTarget.dataset.mode)?.mode
    if (!next) return
    setMode(next)
    if (next === 'at') {
      const now = Date.now()
      setItems((previous) => fillPublishTimes(previous, now))
    }
  }

  const handlersFor = (item: ComposerItem): ComposerItemHandlers => ({
    onPickOperator: () => setPickerFor(item.key),
    onTextChange: (text) => updateItem(item.key, (current) => ({ ...current, text, rejection: null })),
    onTextBlur: () => {
      if (item.operatorId && needsConversion(item)) void runConversion(item.key, item.operatorId, item.text)
    },
    onToggleConvert: (convert) => {
      updateItem(item.key, (current) => ({ ...current, convert, rejection: null }))
      if (convert && item.operatorId && needsConversion({ ...item, convert })) {
        void runConversion(item.key, item.operatorId, item.text)
      }
    },
    onConvert: () => {
      if (item.operatorId && hasText(item.text)) void runConversion(item.key, item.operatorId, item.text)
    },
    onPickPhoto: (file) => {
      void attachPhoto(item.key, file)
    },
    onRemovePhoto: () => {
      if (item.photo) revoke(item.photo.previewUrl)
      updateItem(item.key, (current) => ({ ...current, photo: null, photoError: null, rejection: null }))
    },
    onRetryPhoto: () => {
      if (item.photo && item.operatorId) void uploadPhoto(item.key, item.photo.file, item.operatorId)
    },
    onBackground: (backgroundKey) => updateItem(item.key, (current) => ({ ...current, backgroundKey })),
    onPublishAt: (publishAt) => updateItem(item.key, (current) => ({ ...current, publishAt, rejection: null })),
    onRemove: () => removeItem(item.key),
  })

  const issues = items.map((item) => itemIssue(item, { textMax, mode }))
  const pendingConversions = items.filter(needsConversion)
  const convertingCount = items.filter(
    (item) =>
      item.conversion?.status === 'converting' &&
      item.conversion.forText === item.text &&
      item.conversion.forOperatorId === item.operatorId,
  ).length
  const blockedCount = issues.filter(Boolean).length

  const submit = async () => {
    setNotice(null)
    if (items.length === 0) return
    if (pendingConversions.length > 0) {
      // Staff must see every converted text before it is queued: convert first, submit on the next tap.
      for (const item of pendingConversions) {
        if (item.operatorId) void runConversion(item.key, item.operatorId, item.text)
      }
      return
    }
    setAttempted(true)
    const firstBlocked = items.find((_, index) => issues[index])
    if (firstBlocked) {
      document.getElementById(`composer-${firstBlocked.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (mode === 'now' && !window.confirm(`${items.length}개를 지금 바로 게시할까요? 곧바로 올라가서 취소할 수 없어요.`)) {
      return
    }

    const submitted = items
    setSubmitting(true)
    const result = await createBatch(buildBatchItems(submitted, mode))
    setSubmitting(false)
    if (!result.ok) {
      setNotice({ kind: 'error', message: apiErrorMessage(result.error) })
      return
    }
    const outcome = batchOutcome(submitted, result.data)
    for (const item of submitted) {
      if (outcome.queuedKeys.has(item.key) && item.photo) revoke(item.photo.previewUrl)
    }
    setItems((previous) => mergeBatchOutcome(previous, outcome))
    setAttempted(false)
    setNotice({ kind: 'success', batchId: result.data.batchId, queued: result.data.queued, invalid: result.data.invalid })
    if (result.data.queued > 0) router.refresh()
  }

  let primaryLabel: string
  let primaryDisabled = false
  if (submitting) {
    primaryLabel = '예약하는 중…'
    primaryDisabled = true
  } else if (items.length === 0) {
    primaryLabel = '게시물을 추가해 주세요'
    primaryDisabled = true
  } else if (pendingConversions.length > 0) {
    primaryLabel = `변환 미리보기 만들기 (${pendingConversions.length}개)`
  } else if (convertingCount > 0) {
    primaryLabel = '변환 중…'
    primaryDisabled = true
  } else if (blockedCount > 0) {
    primaryLabel = `확인이 필요한 게시물 ${blockedCount}개`
  } else if (mode === 'now') {
    primaryLabel = `${items.length}개 바로 게시`
  } else if (mode === 'at') {
    primaryLabel = `${items.length}개 예약`
  } else {
    primaryLabel = `${items.length}개 나눠서 게시`
  }

  const currentMode = MODES.find((entry) => entry.mode === mode) ?? MODES[0]

  return (
    <div className="space-y-4">
      <p className="break-words text-[14px] leading-relaxed text-slate-600">
        운영 계정으로 올릴 게시물을 만들어요. 쓴 글은 기본으로 그 계정의 언어로 바뀌고, 바뀐 내용을 확인한 뒤에 예약돼요.
      </p>

      <fieldset disabled={submitting} className="min-w-0 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[14px] text-slate-500">
            게시물이 없어요. 아래에서 추가해 주세요.
          </div>
        ) : (
          items.map((item, index) => (
            <ComposerItemCard
              key={item.key}
              item={item}
              number={index + 1}
              operator={item.operatorId ? operatorsById.get(item.operatorId) ?? null : null}
              mode={mode}
              textMax={textMax}
              issue={attempted ? issues[index] : null}
              handlers={handlersFor(item)}
            />
          ))
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={addItem}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-400 bg-white px-3 text-[14px] font-semibold text-slate-700 active:bg-slate-100"
          >
            <Plus className="h-4 w-4" aria-hidden /> 게시물 추가
          </button>
          <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-400 bg-white px-3 text-[14px] font-semibold text-slate-700 active:bg-slate-100">
            <Images className="h-4 w-4" aria-hidden /> 사진 여러 장으로
            <input
              type="file"
              accept={PICKER_ACCEPT}
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (files.length > 0) addPhotoItems(files)
              }}
            />
          </label>
        </div>
        <p className="text-center text-xs text-slate-500">
          사진 한 장마다 게시물이 하나씩 생겨요 · 게시물 {items.length}/{OPERATOR_POST_BATCH_MAX_ITEMS}개
        </p>

        <section aria-labelledby="operator-post-mode" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 id="operator-post-mode" className="text-[15px] font-semibold">
            게시 방식
          </h2>
          <div role="radiogroup" aria-labelledby="operator-post-mode" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {MODES.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                role="radio"
                aria-checked={mode === entry.mode}
                data-mode={entry.mode}
                onClick={changeMode}
                className={`min-h-11 rounded-lg px-1 text-[14px] font-semibold ${
                  mode === entry.mode ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className="mt-2 break-words text-[13px] leading-relaxed text-slate-600">{currentMode.help}</p>
        </section>
      </fieldset>

      <div
        className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {notice ? (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] ${
              notice.kind === 'success' ? 'bg-sky-50 text-sky-900' : 'bg-rose-50 text-rose-800'
            }`}
          >
            <div className="min-w-0 flex-1 break-words">
              {notice.kind === 'success' ? (
                <>
                  {notice.queued > 0 ? `${notice.queued}개를 예약했어요.` : '예약된 게시물이 없어요.'}
                  {notice.invalid > 0 ? ` ${notice.invalid}개는 예약하지 못했어요. 표시된 게시물을 확인해 주세요.` : ''}
                  {notice.batchId ? (
                    <>
                      {' '}
                      <Link
                        href={`/admin/posts/batches/${encodeURIComponent(notice.batchId)}`}
                        className="font-semibold text-sky-700 underline underline-offset-2"
                      >
                        상태 보기
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                notice.message
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
              aria-label="알림 닫기"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={primaryDisabled}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-[15px] font-semibold text-white active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-600"
        >
          {submitting || (convertingCount > 0 && pendingConversions.length === 0) ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {primaryLabel}
        </button>
      </div>

      {pickerFor ? (
        <OperatorPicker
          operators={operators}
          selectedId={items.find((item) => item.key === pickerFor)?.operatorId ?? null}
          title="운영 계정 고르기"
          onSelect={selectOperator}
          onClose={closePicker}
        />
      ) : null}
    </div>
  )
}
