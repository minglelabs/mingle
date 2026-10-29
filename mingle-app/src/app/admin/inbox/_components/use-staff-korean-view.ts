'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The admin inbox's "한국어로 보기" switch, shared by the list and the room and
 * remembered on this device (localStorage). Off by default: the inbox first
 * shows each room exactly as the operator account reads it.
 */
const STORAGE_KEY = 'mingle-admin-inbox-korean-view'
const listeners = new Set<() => void>()
let memoryValue = false

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === null ? memoryValue : stored === '1'
  } catch {
    return memoryValue
  }
}

function getServerSnapshot(): boolean {
  return false
}

export function useStaffKoreanView(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setEnabled = useCallback((next: boolean) => {
    memoryValue = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Storage can be unavailable (private mode); the in-memory value still flips.
    }
    for (const listener of listeners) listener()
  }, [])
  return [enabled, setEnabled]
}
