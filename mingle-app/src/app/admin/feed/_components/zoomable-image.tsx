'use client'

import { useState, type ImgHTMLAttributes } from 'react'
import ImageZoomOverlay from '@/components/feed/image-zoom-overlay'

/** A post photo that opens full screen on tap, as in the app. */
export function ZoomableImage({ src, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="사진 크게 보기" className="block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} {...rest} />
      </button>
      <ImageZoomOverlay open={open} src={src} alt={alt} closeLabel="닫기" reducedMotion={false} onClose={() => setOpen(false)} />
    </>
  )
}
