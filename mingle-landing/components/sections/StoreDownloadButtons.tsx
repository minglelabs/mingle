'use client'

const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.minglelabs.mingle.rn'
const IOS_STORE_URL = 'https://apps.apple.com/us/app/mingle-global-hangout/id6759795134'

type StoreDownloadButtonsProps = {
  className?: string
  buttonClassName?: string
  orientation?: 'row' | 'column'
  size?: 'sm' | 'md'
}

export default function StoreDownloadButtons({
  className = '',
  buttonClassName = '',
  orientation = 'row',
  size = 'md',
}: StoreDownloadButtonsProps) {
  const baseButtonClassName =
    'inline-flex items-center justify-center rounded-xl font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg'
  const sizeClassName = size === 'sm' ? 'px-4 py-2.5 text-sm gap-2' : 'px-6 py-3.5 text-base gap-3'
  const containerClassName =
    orientation === 'row'
      ? 'flex flex-col sm:flex-row items-stretch sm:items-center gap-3'
      : 'flex flex-col gap-3'

  return (
    <div className={`${containerClassName} ${className}`.trim()}>
      <a
        href={ANDROID_STORE_URL}
        className={[
          baseButtonClassName,
          sizeClassName,
          'bg-gradient-to-r from-accent-primary to-accent-secondary text-white',
          buttonClassName,
        ].join(' ')}
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Play
      </a>
      <a
        href={IOS_STORE_URL}
        className={[
          baseButtonClassName,
          sizeClassName,
          'bg-white border-2 border-accent-primary text-accent-primary',
          buttonClassName,
        ].join(' ')}
        target="_blank"
        rel="noopener noreferrer"
      >
        App Store
      </a>
    </div>
  )
}

