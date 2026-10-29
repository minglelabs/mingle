'use client'

import { useState } from 'react'
import ImageZoomOverlay from '@/components/feed/image-zoom-overlay'
import { OperatorAvatar } from './operator-ui'

/** `OperatorAvatar` that opens the photo full screen on tap, as in the app. */
export function ZoomableAvatar(props: Parameters<typeof OperatorAvatar>[0]) {
  const [open, setOpen] = useState(false)
  if (!props.image) return <OperatorAvatar {...props} />
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="프로필 사진 크게 보기" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        <OperatorAvatar {...props} />
      </button>
      <ImageZoomOverlay open={open} src={props.image} alt={props.name ?? '프로필 사진'} closeLabel="닫기" reducedMotion={false} onClose={() => setOpen(false)} />
    </>
  )
}
