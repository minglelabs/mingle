'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * What the photo viewer needs from the room to translate a photo's text.
 * Provided around the LivePhoneDemo chat list only: share, spectate and
 * legacy screens render ChatBubble without it, so they get no pill and no
 * request.
 */
export type PhotoTranslationRoom = {
  conversationId: string
  /** Room languages in room order (the union every bubble offers). */
  roomLanguages: readonly string[]
  /** The viewer's default display language (resolvedDefaultDisplayLanguage). */
  defaultLanguage: string | null
  uiLocale: string
  viewerUserId: string
}

const PhotoTranslationRoomContext = createContext<PhotoTranslationRoom | null>(null)

export function PhotoTranslationProvider({ conversationId, roomLanguages, defaultLanguage, uiLocale, viewerUserId, children }: {
  conversationId?: string | null
  roomLanguages: readonly string[]
  defaultLanguage?: string | null
  uiLocale: string
  viewerUserId?: string | null
  children: ReactNode
}) {
  const value = useMemo<PhotoTranslationRoom | null>(() => (conversationId && viewerUserId
    ? { conversationId, roomLanguages, defaultLanguage: defaultLanguage ?? null, uiLocale, viewerUserId }
    : null), [conversationId, roomLanguages, defaultLanguage, uiLocale, viewerUserId])
  return <PhotoTranslationRoomContext.Provider value={value}>{children}</PhotoTranslationRoomContext.Provider>
}

/** The room of the chat list this photo is rendered in, or null outside LivePhoneDemo. */
export function usePhotoTranslationRoom(): PhotoTranslationRoom | null {
  return useContext(PhotoTranslationRoomContext)
}
