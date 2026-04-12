'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'

// --- 슬롯머신 숫자 카운터 ---
function SlotCounter({
  target,
  suffix,
  label,
  delay = 0,
}: {
  target: number
  suffix: string
  label: string
  delay?: number
}) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  useEffect(() => {
    if (!isInView || started) return

    const timer = setTimeout(() => {
      setStarted(true)
      const duration = 2000 // 2초
      const steps = 60
      const increment = target / steps
      let current = 0
      let step = 0

      const interval = setInterval(() => {
        step++
        // ease-out 효과
        const progress = step / steps
        const eased = 1 - Math.pow(1 - progress, 3)
        current = Math.floor(eased * target)
        setCount(current)

        if (step >= steps) {
          setCount(target)
          clearInterval(interval)
        }
      }, duration / steps)

      return () => clearInterval(interval)
    }, delay)

    return () => clearTimeout(timer)
  }, [isInView, started, target, delay])

  // 숫자 포맷 (10M+ 등)
  const formatNumber = (num: number) => {
    if (target >= 1000000) {
      return Math.floor(num / 1000000) + 'M'
    }
    return num.toString()
  }

  return (
    <div ref={ref} className="text-center">
      <div className="relative overflow-hidden">
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={started ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span
            className="font-black text-text-primary tabular-nums"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            {formatNumber(count)}
            {suffix}
          </span>
        </motion.div>
      </div>
      <p className="text-text-secondary text-base md:text-lg mt-2 font-medium">
        {label}
      </p>
    </div>
  )
}

// --- 국기 데이터 ---
interface FlagItem {
  emoji: string
  name: string
}

const flagsRow1: FlagItem[] = [
  { emoji: '🇺🇸🇬🇧', name: 'English' },
  { emoji: '🇨🇳', name: 'Chinese' },
  { emoji: '🇯🇵', name: 'Japanese' },
  { emoji: '🇰🇷', name: 'Korean' },
  { emoji: '🇪🇸', name: 'Spanish' },
  { emoji: '🇫🇷', name: 'French' },
  { emoji: '🇮🇳', name: 'Hindi' },
  { emoji: '🇸🇦', name: 'Arabic' },
]

const flagsRow2: FlagItem[] = [
  { emoji: '🇩🇪', name: 'German' },
  { emoji: '🇮🇹', name: 'Italian' },
  { emoji: '🇷🇺', name: 'Russian' },
  { emoji: '🇧🇷', name: 'Portuguese' },
  { emoji: '🇹🇷', name: 'Turkish' },
  { emoji: '🇻🇳', name: 'Vietnamese' },
  { emoji: '🇹🇭', name: 'Thai' },
]

// --- 무한 캐러셀 ---
function InfiniteCarousel({
  items,
  direction = 'left',
  speed = 30,
}: {
  items: FlagItem[]
  direction?: 'left' | 'right'
  speed?: number
}) {
  // 아이템을 3번 반복해서 무한 느낌
  const repeatedItems = [...items, ...items, ...items]

  return (
    <div className="overflow-hidden relative">
      {/* 좌우 페이드 그라데이션 */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-bg-secondary to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-bg-secondary to-transparent z-10 pointer-events-none" />

      <motion.div
        className="flex gap-6"
        animate={{
          x: direction === 'left'
            ? [0, -(items.length * 130)]
            : [-(items.length * 130), 0],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: 'loop',
            duration: speed,
            ease: 'linear',
          },
        }}
      >
        {repeatedItems.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex-shrink-0 flex flex-col items-center gap-2 w-[106px]"
          >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl md:text-4xl">
              {item.emoji}
            </div>
            <span className="text-xs md:text-sm text-text-secondary font-medium">
              {item.name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// --- 메인 섹션 ---
export default function GlobalStatsSection() {
  const { t } = useTranslation()

  return (
    <section className="py-24 md:py-32 px-6 bg-bg-secondary">
      <div className="max-w-5xl mx-auto">
        {/* 숫자 통계 */}
        <div className="grid grid-cols-3 gap-6 md:gap-12 mb-16 md:mb-20">
          <SlotCounter
            target={10000000}
            suffix=""
            label={t('globalStats.activeUsers')}
            delay={0}
          />
          <SlotCounter
            target={100}
            suffix=""
            label={t('globalStats.countries')}
            delay={200}
          />
          <SlotCounter
            target={120}
            suffix=""
            label={t('globalStats.languages')}
            delay={400}
          />
        </div>

        {/* 국기 캐러셀 */}
        <div className="space-y-6">
          <InfiniteCarousel items={flagsRow1} direction="left" speed={25} />
          <InfiniteCarousel items={flagsRow2} direction="right" speed={30} />
        </div>
      </div>
    </section>
  )
}
