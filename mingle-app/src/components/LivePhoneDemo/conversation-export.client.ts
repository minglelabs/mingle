import { buildClientApiPath } from '@/lib/api-contract'
import { copyTextToClipboard } from './live-phone-demo.copy'

export type ConversationExportFile = {
  file: File
  text: string
}

export type ConversationExportDelivery =
  | 'shared'
  | 'cancelled'
  // The share sheet refused because the tap that asked for it was spent on the
  // fetch: the caller offers a fresh tap that calls shareConversationExport.
  | 'needs_gesture'
  | 'downloaded'
  | 'copied'
  | 'failed'

const FALLBACK_FILE_NAME = 'HashChat-chat.txt'

function readFileName(contentDisposition: string | null): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // Fall through to the plain name.
    }
  }
  return contentDisposition?.match(/filename="([^"]+)"/i)?.[1] || FALLBACK_FILE_NAME
}

export async function fetchConversationExport(args: {
  conversationId: string
  locale: string
  displayLanguage: string | null
}): Promise<ConversationExportFile> {
  const params = new URLSearchParams({ locale: args.locale })
  if (args.displayLanguage) params.set('lang', args.displayLanguage)
  try {
    params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    // The server falls back to UTC.
  }

  const response = await fetch(
    buildClientApiPath(`/conversations/${encodeURIComponent(args.conversationId)}/export?${params.toString()}` as `/${string}`),
    { credentials: 'include', cache: 'no-store' },
  )
  if (!response.ok) throw new Error(`conversation export failed: ${response.status}`)

  const text = await response.text()
  const fileName = readFileName(response.headers.get('Content-Disposition'))
  return { text, file: new File([text], fileName, { type: 'text/plain' }) }
}

function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

// The share sheet with the .txt file where the browser can share files (iOS
// Safari and WKWebView); a download in other browsers; the clipboard inside the
// app when neither works (Android WebView has no Web Share).
export async function shareConversationExport(
  exported: ConversationExportFile,
  options: { isNativeApp: boolean },
): Promise<ConversationExportDelivery> {
  if (canShareFile(exported.file)) {
    try {
      await navigator.share({ files: [exported.file] })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      if (error instanceof DOMException && error.name === 'NotAllowedError') return 'needs_gesture'
      // Anything else: try the next way out.
    }
  }

  if (!options.isNativeApp) {
    const url = URL.createObjectURL(exported.file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exported.file.name
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  }

  return (await copyTextToClipboard(exported.text)) ? 'copied' : 'failed'
}
