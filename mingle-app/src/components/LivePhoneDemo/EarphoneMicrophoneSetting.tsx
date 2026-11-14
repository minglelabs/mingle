'use client'

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import MessageMediaDialog from './MessageMediaDialog'
import EarphoneMicrophoneNoticeContent from './EarphoneMicrophoneNotice'
import type { LivePhoneDemoEarphoneModeCopy } from '@/i18n/live-phone-demo-earphone-mode-copy'
import {
  DEFAULT_EARPHONE_MICROPHONE_PICK,
  getEarphoneMicrophonePickServerSnapshot,
  getEarphoneMicrophonePickSnapshot,
  getNativeEarphoneMicrophoneCapabilityServerSnapshot,
  getNativeEarphoneMicrophoneCapabilitySnapshot,
  subscribeEarphoneMicrophonePick,
  subscribeNativeEarphoneMicrophoneCapability,
  writeEarphoneMicrophonePick,
  type EarphoneMicrophonePick,
} from '@/lib/native-earphone-microphone'

// The microphone pick asked once when earphones first go in, changed again
// later from the room menu or my page. Shown only on a shell that can switch.
export function useEarphoneMicrophoneSetting() {
  const capable = useSyncExternalStore(
    subscribeNativeEarphoneMicrophoneCapability,
    getNativeEarphoneMicrophoneCapabilitySnapshot,
    getNativeEarphoneMicrophoneCapabilityServerSnapshot,
  )
  const pick = useSyncExternalStore(
    subscribeEarphoneMicrophonePick,
    getEarphoneMicrophonePickSnapshot,
    getEarphoneMicrophonePickServerSnapshot,
  )
  return { capable, pick: pick ?? DEFAULT_EARPHONE_MICROPHONE_PICK }
}

export function earphoneMicrophonePickLabel(
  copy: LivePhoneDemoEarphoneModeCopy,
  pick: EarphoneMicrophonePick,
): string {
  return pick === 'earphone' ? copy.microphoneEarphoneLabel : copy.microphonePhoneLabel
}

// A menu row (rendered by the caller, in its own style) plus the dialog it opens.
export function EarphoneMicrophoneSettingControl({
  copy,
  renderRow,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  renderRow: (input: { valueLabel: string; open: () => void }) => ReactNode
}) {
  const { capable, pick } = useEarphoneMicrophoneSetting()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const confirm = useCallback((next: EarphoneMicrophonePick) => {
    writeEarphoneMicrophonePick(next)
    setOpen(false)
  }, [])
  if (!capable) return null
  return (
    <>
      {renderRow({ valueLabel: earphoneMicrophonePickLabel(copy, pick), open: () => setOpen(true) })}
      {open && (
        <MessageMediaDialog title={copy.microphoneNoticeTitle} onClose={close}>
          <EarphoneMicrophoneNoticeContent copy={copy} initialPick={pick} onConfirm={confirm} />
        </MessageMediaDialog>
      )}
    </>
  )
}
