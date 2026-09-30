'use client'

import { useEffect, useState } from 'react'
import { buildClientApiPath, clientApiNamespace } from '@/lib/api-contract'
import { buildConversationImageTextEndpoint, type ConversationImageTextResponse } from '@/lib/conversation-image-text'
import { photoTranslationResponses, startPhotoTranslationPoller } from './photo-translation-fetch.logic'
import { photoTranslationMemoryKey } from './photo-translation-toggle.logic'

/**
 * The photo's text and translations while its viewer is open (spec §1.8).
 * Mount it only inside the open viewer: that is the "fetch on open, no
 * prefetch" rule. The last answer per photo is cached for the app session and
 * shown at once on reopen. Unmounting (closing the viewer) aborts the request
 * in flight and stops polling.
 */
export function usePhotoTranslationText({ conversationId, messageId, languages, viewerUserId }: {
  conversationId: string
  messageId: string
  /** Requested languages in toggle order (all room languages). */
  languages: readonly string[]
  viewerUserId: string
}): ConversationImageTextResponse | null {
  const cacheKey = photoTranslationMemoryKey({ apiNamespace: clientApiNamespace, viewerUserId, conversationId, messageId })
  const languagesKey = languages.join(',')
  const [response, setResponse] = useState<ConversationImageTextResponse | null>(() => photoTranslationResponses.get(cacheKey) ?? null)

  useEffect(() => {
    const requested = languagesKey ? languagesKey.split(',') : []
    // No room language means nothing could be shown: ask nothing.
    if (!requested.length) return
    const poller = startPhotoTranslationPoller({
      endpoint: buildClientApiPath(buildConversationImageTextEndpoint(conversationId, messageId, requested) as `/${string}`),
      viewerUserId,
      languages: requested,
      cached: photoTranslationResponses.get(cacheKey),
      onResponse: next => {
        photoTranslationResponses.set(cacheKey, next)
        setResponse(next)
      },
    })
    const handleVisibilityChange = () => {
      if (!document.hidden) poller.resume()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      poller.stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [cacheKey, conversationId, languagesKey, messageId, viewerUserId])

  return response
}
