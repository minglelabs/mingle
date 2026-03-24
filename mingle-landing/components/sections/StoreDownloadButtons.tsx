'use client'

import type { MouseEvent } from 'react'

const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn'
const IOS_STORE_URL = 'https://apps.apple.com/us/app/mingle-global-hangout/id6759795134'

type StoreDownloadButtonsProps = {
  className?: string
  buttonClassName?: string
  label: string
  size?: 'sm' | 'md'
}

function resolveStoreUrl() {
  if (typeof navigator === 'undefined') {
    return ANDROID_STORE_URL
  }

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  const isApplePlatform =
    /iPhone|iPad|iPod|Macintosh|MacIntel|MacPPC|Mac68K/i.test(platform) ||
    /iPhone|iPad|iPod/i.test(userAgent)

  return isApplePlatform ? IOS_STORE_URL : ANDROID_STORE_URL
}

export default function StoreDownloadButtons({
  className = '',
  buttonClassName = '',
  label,
  size = 'md',
}: StoreDownloadButtonsProps) {
  const sizeClassName = size === 'sm' ? 'px-4 py-2.5 text-sm gap-2' : 'px-6 py-3.5 text-base gap-3'

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    window.location.href = resolveStoreUrl()
  }

  return (
    <div className={`flex ${className}`.trim()}>
      <a
        href={ANDROID_STORE_URL}
        onClick={handleClick}
        className={[
          'inline-flex items-center justify-center rounded-xl font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg',
          sizeClassName,
          'bg-gradient-to-r from-accent-primary to-accent-secondary text-white',
          buttonClassName,
        ].join(' ')}
      >
        {label}
      </a>
    </div>
  )
}
