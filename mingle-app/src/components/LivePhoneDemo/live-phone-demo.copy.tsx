export const COPY_SUCCESS_EVENT = 'live-phone-demo:copy-success'

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

export async function copyTextWithFeedback(text: string): Promise<boolean> {
  if (!text.trim()) return false

  try {
    const didCopy = await copyTextToClipboard(text)
    if (!didCopy) return false

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(COPY_SUCCESS_EVENT))
    }
    return true
  } catch {
    return false
  }
}
