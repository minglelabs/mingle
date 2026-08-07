"use client";

import BottomTabBar, { buildNativeAwareTabPath } from "@/components/bottom-tab-bar";
import type { AppLocale, AppDictionary } from "@/i18n";
import { Menu, Plus, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type MyPageProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
};

function ProfileAvatar({
  alt,
  imageUrl,
  size = 88,
}: {
  alt: string;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100"
      style={{ height: size, width: size }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <UserRound size={Math.round(size * 0.58)} className="text-gray-400" aria-hidden="true" />
      )}
    </div>
  );
}

export default function MyPage({ dictionary, locale }: MyPageProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayName = session?.user?.name?.trim() || dictionary.titles.my;
  const profileImageUrl = session?.user?.image ?? null;
  const profileShareHref = buildNativeAwareTabPath(`/${locale}/mypage/share`, searchParams);
  const comingSoonLabel = dictionary.profile.comingSoonLabel
    ?? (locale === "ko" ? "기능 준비중입니다." : "Coming soon.");

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900">
      <header
        className="flex shrink-0 items-center px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          disabled
          className="flex h-10 w-10 items-center justify-center rounded-full transition"
          aria-label={dictionary.profile.shareProfile}
        >
          <Plus size={24} strokeWidth={2.1} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-slate-950">
          {displayName}
        </h1>
        <button
          type="button"
          disabled
          className="flex h-10 w-10 items-center justify-center rounded-full transition"
          aria-label={dictionary.profile.menuLabel}
        >
          <Menu size={23} strokeWidth={2.2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-6">
            <ProfileAvatar
              alt={dictionary.profile.shareProfile}
              imageUrl={profileImageUrl}
            />
            <div className="grid flex-1 grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.postsLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followersLabel}</p>
              </div>
              <div>
                <p className="text-[18px] font-semibold leading-tight">0</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{dictionary.profile.followingLabel}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[15px] font-semibold text-slate-950">{displayName}</p>
            <p className="mt-1 text-[14px] leading-snug text-slate-700">{dictionary.profile.bio}</p>
          </div>

          <div
            className="mt-4 flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-[13px] font-semibold text-slate-900"
            aria-disabled="true"
          >
            {dictionary.profile.editProfile}
          </div>
          <button
            type="button"
            onClick={() => router.push(profileShareHref)}
            className="mt-2 flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-white text-[13px] font-semibold text-slate-900 transition active:bg-gray-100"
          >
            {dictionary.profile.shareProfile}
          </button>
        </section>

        <section className="flex min-h-[220px] items-center justify-center border-t border-gray-200 px-6 text-center">
          <p className="text-[15px] font-semibold text-gray-500">{comingSoonLabel}</p>
        </section>
      </div>

      <BottomTabBar
        activeRoute="mypage"
        dictionary={dictionary}
        locale={locale}
      />
    </main>
  );
}
