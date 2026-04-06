import { Check } from 'lucide-react'
import { toast } from 'sonner'

const COPY_TOAST_DURATION_MS = 1000
export const COPY_FEEDBACK_TOASTER_ID = 'live-phone-demo-copy-feedback'
export const COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME = 'pointer-events-none mx-auto flex w-fit max-w-[calc(100vw-4rem)] items-center gap-1.5 rounded-full bg-white/97 px-2.5 py-1 shadow-[0_12px_28px_rgba(15,23,42,0.12),0_2px_6px_rgba(15,23,42,0.08)] backdrop-blur-md'
const COPY_FEEDBACK_TOAST_ID = 'live-phone-demo-copy-feedback-toast'

export async function copyTextToClipboard(text: string): Promise<boolean> {
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

export async function copyTextWithFeedback(
  text: string,
  copiedToastLabel: string,
): Promise<boolean> {
  if (!text.trim()) return false

  try {
    const didCopy = await copyTextToClipboard(text)
    if (!didCopy) return false

    toast.custom(() => (
      <div className={COPY_FEEDBACK_TOAST_SURFACE_CLASSNAME}>
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
        <span className="truncate text-[11px] font-medium tracking-[-0.01em] text-slate-700">
          {copiedToastLabel}
        </span>
      </div>
    ), {
      id: COPY_FEEDBACK_TOAST_ID,
      toasterId: COPY_FEEDBACK_TOASTER_ID,
      duration: COPY_TOAST_DURATION_MS,
      position: 'bottom-center',
      unstyled: true,
    })
    return true
  } catch {
    return false
  }
}
