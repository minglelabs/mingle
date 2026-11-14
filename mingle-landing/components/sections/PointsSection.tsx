'use client'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Flag, Ban, ShieldCheck, Newspaper, MessageCircle, Gamepad2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { fadeInUp } from '@/components/sections/shared'

type Point = { title: string; desc: string }

// Text section with a short list of points. Copy lives under `${namespace}.label|title|description|points[]`.
function PointsSection({
  namespace,
  icons,
  className,
}: {
  namespace: string
  icons: LucideIcon[]
  className: string
}) {
  const { t } = useTranslation()
  const rawPoints = t(`${namespace}.points`, { returnObjects: true })
  const points: Point[] = Array.isArray(rawPoints) ? rawPoints : []

  return (
    <section className={`py-24 md:py-32 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeInUp}
        >
          <div className="text-sm font-semibold text-accent-primary uppercase tracking-wider mb-4">
            {t(`${namespace}.label`)}
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-text-primary">{t(`${namespace}.title`)}</h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">{t(`${namespace}.description`)}</p>
        </motion.div>
        <motion.div
          className="grid md:grid-cols-3 gap-6"
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={{ animate: { transition: { staggerChildren: 0.1 } } }}
        >
          {points.map((point, i) => {
            const Icon = icons[i % icons.length]
            return (
              <motion.div
                key={i}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm"
                variants={fadeInUp}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 bg-amber-100 text-amber-600">
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-text-primary">{point.title}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{point.desc}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

export function SafetySection() {
  return <PointsSection namespace="safety" icons={[Flag, Ban, ShieldCheck]} className="bg-white" />
}

export function TogetherSection() {
  return <PointsSection namespace="together" icons={[Newspaper, MessageCircle, Gamepad2]} className="bg-bg-secondary" />
}
