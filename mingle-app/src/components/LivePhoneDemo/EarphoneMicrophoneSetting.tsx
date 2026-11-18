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

// The microphone pick, changed from the room menu or my page (the phone's
// microphone until then). Shown only on a shell that can switch.
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

// A menu row (rendered by the caller, in its own style) plus the dialog it
// opens. `open`/`onOpenChange` let a caller keep the dialog up after its row
// goes away (the room's one-time hint toast).
export function EarphoneMicrophoneSettingControl({
  copy,
  renderRow,
  open: controlledOpen,
  onOpenChange,
}: {
  copy: LivePhoneDemoEarphoneModeCopy
  renderRow: (input: { valueLabel: string; open: () => void }) => ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { capable, pick } = useEarphoneMicrophoneSetting()
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = useCallback((next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }, [onOpenChange])
  const close = useCallback(() => setOpen(false), [setOpen])
  const confirm = useCallback((next: EarphoneMicrophonePick) => {
    writeEarphoneMicrophonePick(next)
    setOpen(false)
  }, [setOpen])
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
