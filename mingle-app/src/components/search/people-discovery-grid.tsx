"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { buildClientApiPath } from "@/lib/api-contract";
import { countryFlagEmoji, getCountryDisplayName } from "@/lib/nationality";
import { normalizeProfileImageCrop } from "@/lib/profile-image-crop";
import { resolveAccountBadge, withAccountBadgeLabel } from "@/lib/account-badge";
import type { InterestLanguage } from "@/lib/interest-languages";
import type { AppLocale } from "@/i18n";
import { formatProfileAge } from "@/i18n/profile-age-copy";
import { resolvePeopleDiscoveryCopy } from "@/i18n/people-discovery-copy";
import FlagEmoji from "@/components/flag-emoji";
import AccountBadge from "@/components/posts/account-badge";
import { CompactLanguageLevels } from "@/components/profile-language-levels";
import {
  mergeDiscoveryPage,
  parseDiscoveryPage,
  type DiscoveryPage,
  type DiscoveryPerson,
} from "./people-discovery-state";

/** Pages kept for the session so returning to the tab does not refetch or jump. */
const pageCache = new Map<string, DiscoveryPage>();

/** Only the first few languages fit on a half-width card. */
const MAX_PRIMARY_ON_CARD = 2;
const MAX_INTEREST_ON_CARD = 2;

async function fetchDiscoveryPage(locale: string, cursor: string | null): Promise<DiscoveryPage> {
  const params = new URLSearchParams({ locale });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(buildClientApiPath(`/users/discover?${params.toString()}`), { cache: "no-store" });
  if (!response.ok) throw new Error("people_discovery_failed");
  return parseDiscoveryPage(await response.json());
}

/**
 * The explore tab's people cards: a two-column grid of other users (photo,
 * name, age, flag, spoken ⇄ learning languages), the other side of the
 * exchange first. Tapping a card opens the existing profile surface.
 * Signed-in only; renders nothing until there is at least one person.
 */
export default function PeopleDiscoveryGrid({
  locale,
  viewerId,
  onOpenPerson,
}: {
  locale: AppLocale;
  viewerId: string;
  onOpenPerson: (userId: string) => void;
}) {
  const copy = resolvePeopleDiscoveryCopy(locale);
  const cacheKey = `${viewerId}:${locale}`;
  const [page, setPage] = useState<DiscoveryPage | null>(() => pageCache.get(cacheKey) ?? null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (pageCache.has(cacheKey)) return;
    let cancelled = false;
    void fetchDiscoveryPage(locale, null)
      .then((first) => {
        pageCache.set(cacheKey, first);
        if (!cancelled) setPage(first);
      })
      // A failed load just leaves the section out; search still works.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cacheKey, locale]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = mergeDiscoveryPage(page, await fetchDiscoveryPage(locale, page.nextCursor));
      pageCache.set(cacheKey, next);
      setPage(next);
    } catch {
      // Keep what is on screen; the button stays for another try.
    } finally {
      setLoadingMore(false);
    }
  }, [cacheKey, loadingMore, locale, page]);

  if (!page || page.users.length === 0) return null;

  const heading = page.viewerSide === "korean" ? copy.headingForKorean : copy.headingForForeigner;

  return (
    <section className="px-3 pb-6 pt-1" aria-label={heading} data-people-discovery>
      <h2 className="px-1 pb-2.5 text-[17px] font-bold text-slate-900">{heading}</h2>
      <ul className="grid grid-cols-2 gap-2.5">
        {page.users.map((person) => (
          <PersonCard key={person.id} person={person} locale={locale} copy={copy} onOpen={onOpenPerson} />
        ))}
      </ul>
      {page.nextCursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          aria-busy={loadingMore}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 text-[14px] font-semibold text-slate-700 transition active:bg-gray-50 disabled:opacity-60"
        >
          {loadingMore ? <Loader2 size={16} className="animate-spin text-gray-400" aria-hidden="true" /> : copy.loadMore}
        </button>
      ) : null}
    </section>
  );
}

function PersonCard({
  person,
  locale,
  copy,
  onOpen,
}: {
  person: DiscoveryPerson;
  locale: AppLocale;
  copy: ReturnType<typeof resolvePeopleDiscoveryCopy>;
  onOpen: (userId: string) => void;
}) {
  const name = person.name?.trim() || person.handle?.trim() || copy.userFallback;
  const accountBadge = resolveAccountBadge(person);
  const crop = normalizeProfileImageCrop({ scale: person.imageCropScale, x: person.imageCropX, y: person.imageCropY });
  const primary = person.primaryLanguages.slice(0, MAX_PRIMARY_ON_CARD);
  const interest: InterestLanguage[] = person.interestLanguages.slice(0, MAX_INTEREST_ON_CARD);
  const countryName = person.nationalityCountry ? getCountryDisplayName(person.nationalityCountry, locale) : "";
  const badgeLabel = person.badge === "new" ? copy.badgeNew : person.badge === "active" ? copy.badgeActive : "";
  const label = [
    withAccountBadgeLabel(name, accountBadge, locale),
    formatProfileAge(person.age, locale),
    countryName,
    badgeLabel,
  ].filter(Boolean).join(", ");

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(person.id)}
        aria-label={label}
        className="block w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
      >
        <span className="relative block aspect-square w-full overflow-hidden bg-gray-100" aria-hidden="true">
          {person.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.image}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
              // The stored crop offsets are fractions of the (square) viewport.
              style={{ transform: `translate3d(${crop.x * 100}%, ${crop.y * 100}%, 0) scale(${crop.scale})` }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <UserRound size={48} className="text-gray-300" />
            </span>
          )}
          {badgeLabel ? (
            <span
              className={`absolute left-2 top-2 rounded-full px-2 py-[3px] text-[11px] font-bold leading-none shadow-sm ${
                person.badge === "new" ? "bg-amber-400 text-white" : "bg-white/90 text-emerald-700"
              }`}
            >
              {person.badge === "active" ? (
                <span className="mr-1 inline-block h-[6px] w-[6px] rounded-full bg-emerald-500 align-middle" />
              ) : null}
              <span className="align-middle">{badgeLabel}</span>
            </span>
          ) : null}
        </span>
        <span className="block px-2.5 pb-2.5 pt-2" aria-hidden="true">
          <span className="flex min-w-0 items-center gap-1">
            {person.nationalityCountry ? (
              <FlagEmoji emoji={countryFlagEmoji(person.nationalityCountry)} className="shrink-0 text-[15px] leading-none" />
            ) : null}
            <span className="truncate text-[15px] font-semibold text-slate-900">{name}</span>
            {typeof person.age === "number" ? (
              <span className="shrink-0 text-[14px] text-gray-500">{person.age}</span>
            ) : null}
            <AccountBadge kind={accountBadge} locale={locale} tone="dark" />
          </span>
          {primary.length || interest.length ? (
            <CompactLanguageLevels
              primaryLanguages={primary}
              interestLanguages={interest}
              locale={locale}
              className="mt-1.5"
            />
          ) : null}
        </span>
      </button>
    </li>
  );
}
