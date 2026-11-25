'use client'

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import ImageZoomOverlay from '@/components/feed/image-zoom-overlay'

/**
 * How far off screen a photo stays loaded. Beyond it the photo is swapped for
 * an empty box of the same size: a long feed kept every photo decoded (about
 * 5 MB each), and after a few pages the phone killed and reloaded the page,
 * back at the newest posts (staff, 2026-11-25).
 */
const KEEP_MARGIN = '2500px 0px'

/** A post photo that opens full screen on tap, as in the app. */
export function ZoomableImage({ src, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const [open, setOpen] = useState(false)
  const [near, setNear] = useState(true)
  const box = useRef<HTMLButtonElement>(null)
  const width = Number(rest.width)
  const height = Number(rest.height)
  // Only a photo whose size is known is unloaded, so the list never shifts.
  const sized = width > 0 && height > 0

  useEffect(() => {
    const element = box.current
    if (!element || !sized || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) setNear(entry.isIntersecting)
    }, { rootMargin: KEEP_MARGIN })
    observer.observe(element)
    return () => observer.disconnect()
  }, [sized])

  return (
    <>
      <button ref={box} type="button" onClick={() => setOpen(true)} aria-label="사진 크게 보기" className="block w-full">
        {near || !sized ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} {...rest} />
        ) : (
          <div aria-hidden="true" className={rest.className} style={{ ...rest.style, aspectRatio: `${width} / ${height}` }} />
        )}
      </button>
      <ImageZoomOverlay open={open} src={src} alt={alt} closeLabel="닫기" reducedMotion={false} onClose={() => setOpen(false)} />
    </>
  )
}
