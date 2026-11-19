import { memo, useEffect, useState } from 'react'
import { ChevronRight, UserRound } from 'lucide-react'
import ProfileGenderAgeBadge from '@/components/profile-gender-age-badge'
import ProfileNationalityBadge from '@/components/profile-nationality-badge'
import { DEFAULT_LOCALE, resolveSupportedLocaleTag } from '@/i18n/config'
import { buildClientApiPath } from '@/lib/api-contract'
import type { ConversationChannelOtherMember } from '@/lib/app-conversations'
import { resolveNationalityCountry } from '@/lib/nationality'
import { buildProfileImageTransform } from '@/lib/profile-image-crop'
import { getSttLanguageDisplayName, sanitizeSttLanguageSelection } from '@/lib/stt-languages'

const AVATAR_SIZE = 52

type PeerProfileDetails = {
  bio: string | null
  age?: number
  gender?: string | null
  nationality: string | null
  nationalityCountry?: string | null
  primaryLanguages: string[]
}

// Fetched once per person while the app is open; rooms reopen often.
const PEER_PROFILE_CACHE = new Map<string, PeerProfileDetails>()

function readPeerProfileDetails(data: unknown): PeerProfileDetails | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  return {
    bio: typeof record.bio === 'string' ? record.bio : null,
    age: typeof record.age === 'number' ? record.age : undefined,
    gender: typeof record.gender === 'string' ? record.gender : null,
    nationality: typeof record.nationality === 'string' ? record.nationality : null,
    nationalityCountry: typeof record.nationalityCountry === 'string' ? record.nationalityCountry : null,
    primaryLanguages: Array.isArray(record.primaryLanguages)
      ? record.primaryLanguages.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

type ConversationPeerProfileCardProps = {
  member: ConversationChannelOtherMember
  uiLocale: string
  onOpenProfile?: (userId: string) => void
}

/**
 * The other person's profile at the very top of a 1:1 room (HelloTalk-style,
 * but one compact row): photo with the nationality flag, name with gender/age,
 * spoken language and a one-line intro. Tapping it opens the full profile.
 */
function ConversationPeerProfileCard({ member, uiLocale, onOpenProfile }: ConversationPeerProfileCardProps) {
  const locale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  const [fetched, setFetched] = useState<{ userId: string, details: PeerProfileDetails } | null>(null)
  const details = PEER_PROFILE_CACHE.get(member.userId)
    ?? (fetched?.userId === member.userId ? fetched.details : null)

  useEffect(() => {
    const userId = member.userId
    if (PEER_PROFILE_CACHE.has(userId)) return
    let cancelled = false
    void fetch(buildClientApiPath(`/users/${encodeURIComponent(userId)}`), { cache: 'no-store' })
      .then(async (response) => (response.ok ? readPeerProfileDetails(await response.json()) : null))
      .then((next) => {
        if (!next) return
        PEER_PROFILE_CACHE.set(userId, next)
        if (!cancelled) setFetched({ userId, details: next })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [member.userId])

  const name = member.name?.trim() || (locale === 'ko' ? '사용자' : 'User')
  const primaryLanguages = sanitizeSttLanguageSelection(
    details?.primaryLanguages,
    details?.nationality ? [details.nationality] : [],
  )
  const country = details ? resolveNationalityCountry(details.nationalityCountry, primaryLanguages) : null
  const languageNames = primaryLanguages
    .slice(0, 2)
    .map((code) => getSttLanguageDisplayName(code, locale) ?? code)
  const bio = details?.bio?.replace(/\s+/g, ' ').trim() || ''

  return (
    <button
      type="button"
      data-qa="conversation-peer-profile-card"
      onClick={() => onOpenProfile?.(member.userId)}
      className="mx-1 mb-2 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition active:bg-gray-50"
    >
      <span className="relative shrink-0 rounded-full" style={{ height: AVATAR_SIZE, width: AVATAR_SIZE }}>
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100">
          {member.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.image}
              alt=""
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              className="h-full w-full object-cover"
              style={{
                transform: buildProfileImageTransform(AVATAR_SIZE, {
                  scale: member.imageCropScale,
                  x: member.imageCropX,
                  y: member.imageCropY,
                }),
              }}
            />
          ) : (
            <UserRound size={30} className="text-gray-400" aria-hidden="true" />
          )}
        </span>
        <ProfileNationalityBadge country={country} size={AVATAR_SIZE} badgeSize={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-slate-950">{name}</span>
          <ProfileGenderAgeBadge gender={details?.gender} age={details?.age} locale={locale} className="shrink-0" />
          {languageNames.length > 0 ? (
            <span className="min-w-0 truncate text-[12.5px] text-gray-500">{languageNames.join(' · ')}</span>
          ) : null}
        </span>
        {bio ? (
          <span className="line-clamp-2 text-[13px] leading-snug text-gray-600">{bio}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  )
}

export default memo(ConversationPeerProfileCard)
