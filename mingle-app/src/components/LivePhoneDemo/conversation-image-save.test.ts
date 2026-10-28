import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationImageFileName, saveConversationImage } from './conversation-image-save'

type Listener = (event: Event) => void

function installWindow(onPost: (message: Record<string, unknown>, emit: (name: string, detail: unknown) => void) => void) {
  const listeners = new Map<string, Set<Listener>>()
  const emit = (name: string, detail: unknown) => {
    for (const listener of listeners.get(name) ?? []) listener({ detail } as unknown as Event)
  }
  const target = {
    addEventListener: (name: string, listener: Listener) => listeners.set(name, (listeners.get(name) ?? new Set()).add(listener)),
    removeEventListener: (name: string, listener: Listener) => listeners.get(name)?.delete(listener),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    ReactNativeWebView: { postMessage: (raw: string) => onPost(JSON.parse(raw), emit) },
  }
  vi.stubGlobal('window', target)
  vi.stubGlobal('FileReader', class {
    result: string | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    readAsDataURL() { this.result = 'data:image/jpeg;base64,AAAA'; queueMicrotask(() => this.onload?.()) }
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x'], { type: 'image/jpeg' }))))
}

afterEach(() => vi.unstubAllGlobals())

describe('saveConversationImage in the app', () => {
  it('saves the original photo through native_image_save', async () => {
    const posts: Record<string, unknown>[] = []
    installWindow((message, emit) => {
      posts.push(message)
      const { requestId, probe } = message.payload as { requestId: string; probe?: boolean }
      setTimeout(() => emit('mingle:native-image-save', { type: probe ? 'ready' : 'success', requestId }), 0)
    })
    await expect(saveConversationImage('/api/x/image', 'hashchat-m1.jpg')).resolves.toBe('saved')
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({ type: 'native_image_save', payload: { probe: true } })
    expect(posts[0].payload).not.toHaveProperty('dataUrl')
    expect(posts[1]).toMatchObject({ type: 'native_image_save', payload: { dataUrl: 'data:image/jpeg;base64,AAAA', fileName: 'hashchat-m1.jpg' } })
  })

  it('reports a denied photo permission', async () => {
    installWindow((message, emit) => {
      const { requestId, probe } = message.payload as { requestId: string; probe?: boolean }
      setTimeout(() => emit('mingle:native-image-save', probe
        ? { type: 'ready', requestId }
        : { type: 'error', requestId, message: 'Photo library permission was denied.' }), 0)
    })
    await expect(saveConversationImage('/api/x/image', 'a.jpg')).resolves.toBe('permission')
  })

  it('fails when the photo cannot be fetched', async () => {
    installWindow(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(saveConversationImage('/api/x/image', 'a.jpg')).resolves.toBe('failed')
  })
})

describe('conversationImageFileName', () => {
  it('keeps only safe characters of the message id', () => {
    expect(conversationImageFileName('cm/abc..123')).toBe('hashchat-cmabc123.jpg')
    expect(conversationImageFileName('///')).toBe('hashchat-photo.jpg')
  })
})
