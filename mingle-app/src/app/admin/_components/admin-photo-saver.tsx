'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

/** Photos smaller than this (avatars in lists, icons) get no save button. */
const MIN_SIZE = 72

/**
 * The file name a photo is saved under: the URL's own `<name>.jpg` when it
 * has one, otherwise one made up, always ending in an image extension.
 */
export function photoFileName(src: string, type = 'image/jpeg', now: number = Date.now()): string {
  let last = ''
  try {
    last = decodeURIComponent(new URL(src, 'https://admin.local').pathname.split('/').pop() ?? '')
  } catch {
    last = ''
  }
  if (/^[\w.-]+\.(jpe?g|png|webp)$/i.test(last)) return last
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return `hashchat-${now}.${extension}`
}

/**
 * On every admin screen, a "저장" button on the photo under the pointer: one
 * click saves it to Downloads as a .jpg, ready for Instagram's "컴퓨터에서
 * 선택". Chrome on a Mac hands another tab only the address of a photo dragged
 * into it, never the file, so Instagram's uploader rejects a photo dragged
 * straight from here (checked 2026-11-23). A photo dragged onto the desktop
 * does become a file; it is named `<name>.jpg` too.
 */
export function AdminPhotoSaver() {
  const [target, setTarget] = useState<{ img: HTMLImageElement; top: number; left: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const place = (img: HTMLImageElement) => {
      const rect = img.getBoundingClientRect()
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return setTarget(null)
      setTarget({ img, top: Math.max(rect.top, 0) + 8, left: rect.left + 8 })
    }
    const onOver = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof HTMLImageElement && node.currentSrc) place(node)
    }
    const onOut = (event: MouseEvent) => {
      const next = event.relatedTarget
      if (next instanceof Node && buttonRef.current?.contains(next)) return
      if (event.target instanceof HTMLImageElement) setTarget(null)
    }
    const onScroll = () => setTarget(null)
    // Dragged onto the desktop, the photo becomes a file with a .jpg name.
    const onDragStart = (event: DragEvent) => {
      const node = event.target
      if (!(node instanceof HTMLImageElement) || !node.currentSrc || !event.dataTransfer) return
      const url = new URL(node.currentSrc, window.location.href).href
      event.dataTransfer.setData('DownloadURL', `image/jpeg:${photoFileName(url)}:${url}`)
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('dragstart', onDragStart)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('dragstart', onDragStart)
    }
  }, [])

  async function save() {
    if (!target) return
    const src = target.img.currentSrc
    setSaving(true)
    try {
      const response = await fetch(src, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`photo_${response.status}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = photoFileName(src, blob.type)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      // A photo on another site that does not allow reading it: open it, to save from there.
      window.open(src, '_blank', 'noopener')
    } finally {
      setSaving(false)
    }
  }

  if (!target) return null
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); void save() }}
      onMouseLeave={(event) => { if (event.relatedTarget !== target.img) setTarget(null) }}
      style={{ position: 'fixed', top: target.top, left: target.left, zIndex: 2147483000 }}
      className="inline-flex h-8 items-center gap-1 rounded-full bg-black/70 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-black/85"
      aria-label="사진 저장 (인스타 업로드용 .jpg)"
      title="다운로드 폴더에 .jpg로 저장 → 인스타 '컴퓨터에서 선택'"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
      저장
    </button>
  )
}
