'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ConversationMessageImage } from '@/lib/conversation-image'
import { conversationImagesKey } from './conversation-image-gallery.logic'

const ConversationImageGalleryContext = createContext<readonly ConversationMessageImage[] | null>(null)

/**
 * The photos of the room this chat list shows, oldest first. Photo bubbles read it to open
 * their viewer on the whole set, so a swipe turns to the next photo. Screens without a
 * provider (share, spectate, legacy) open a photo on its own.
 */
export function ConversationImageGalleryProvider({ images, children }: {
  images: readonly ConversationMessageImage[]
  children?: ReactNode
}) {
  const key = conversationImagesKey(images)
  // The list changes only when a photo is added, removed or reordered; keeping its identity
  // stable otherwise stops every photo bubble re-rendering on each new text message.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => images, [key])
  return <ConversationImageGalleryContext.Provider value={stable}>{children}</ConversationImageGalleryContext.Provider>
}

/** The room's photos, or null outside the chat list. */
export function useConversationImageGallery(): readonly ConversationMessageImage[] | null {
  return useContext(ConversationImageGalleryContext)
}
