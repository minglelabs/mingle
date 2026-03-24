'use client'

import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { fadeInUp } from '@/components/sections/shared'
import StoreDownloadButtons from '@/components/sections/StoreDownloadButtons'

export interface CTASectionProps {
}

export default function CTASection({}: CTASectionProps) {
  const { t } = useTranslation()

  return (
    <section className="py-32 px-6 bg-gradient-to-br from-amber-50 to-orange-50 text-center">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeInUp}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-text-primary">
            {t('cta.title1')}<br />{t('cta.title2')}{' '}
            <span className="bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
              {t('cta.title2Highlight')}
            </span>
          </h2>
          <p className="text-lg text-text-secondary mb-12">
            {t('cta.subtitle')}
          </p>
          <StoreDownloadButtons className="justify-center" size="md" />
        </motion.div>
      </div>
    </section>
  )
}
