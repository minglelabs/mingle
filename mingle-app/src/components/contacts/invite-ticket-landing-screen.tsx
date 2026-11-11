"use client";

import { Play, Ticket } from "lucide-react";
import { useEffect, useMemo } from "react";
import { fillInviteTicketCopy, resolveInviteTicketCopy } from "@/i18n/invite-ticket-copy";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";
import { buildInviteAppUrl } from "@/lib/referral-code";

export type InviteTicketLandingInviter = {
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

type InviteTicketLandingScreenProps = {
  /** Empty when the ticket is not usable. */
  code: string;
  locale: string;
  inviter: InviteTicketLandingInviter | null;
  rewardCoins: number;
  isAndroid: boolean;
  isIos: boolean;
  iosAppStoreUrl: string;
  androidPlayStoreUrl: string;
};

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
      <path d="M16.37 12.3c.02 2.5 2.19 3.33 2.21 3.34-.02.06-.35 1.19-1.14 2.36-.69 1.01-1.4 2.02-2.52 2.04-1.1.02-1.46-.65-2.72-.65-1.26 0-1.66.63-2.7.67-1.08.04-1.91-1.1-2.6-2.1-1.42-2.05-2.5-5.8-1.05-8.33.72-1.26 2.01-2.05 3.41-2.07 1.06-.02 2.07.72 2.72.72.65 0 1.87-.89 3.15-.76.54.02 2.04.22 3.01 1.63-.08.05-1.8 1.05-1.77 3.15zM14.3 5.8c.57-.7.96-1.66.85-2.63-.83.03-1.83.55-2.42 1.25-.53.61-1 1.6-.87 2.54.92.07 1.87-.47 2.44-1.16z" />
    </svg>
  );
}

export default function InviteTicketLandingScreen({
  code,
  locale,
  inviter,
  rewardCoins,
  isAndroid,
  isIos,
  iosAppStoreUrl,
  androidPlayStoreUrl,
}: InviteTicketLandingScreenProps) {
  const copy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  const name = inviter?.name?.trim() || copy.userFallback;
  const appUrl = code ? buildInviteAppUrl(code) : null;
  const platform = isAndroid ? "android" : isIos ? "ios" : "other";

  useEffect(() => {
    captureMingleClientEvent("mingle_invite_link_opened", { platform, valid: Boolean(code) });
  }, [code, platform]);

  const trackInstall = (store: "ios" | "android") => {
    captureMingleClientEvent("mingle_invite_install_clicked", { platform, store });
  };

  if (!code) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[linear-gradient(145deg,#1295e8_0%,#3569ed_52%,#7338f2_100%)] px-5 py-10 text-slate-950">
        <section className="w-full max-w-md rounded-[2rem] bg-white/95 px-6 py-10 text-center shadow-[0_24px_70px_rgba(22,50,140,0.28)]">
          <Ticket className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">{copy.invalidTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{copy.invalidBody}</p>
        </section>
      </main>
    );
  }

  const installButtonClass = "flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F3C35A] px-5 py-4 text-base font-bold text-[#2D2A1E] shadow-[0_10px_24px_rgba(243,195,90,0.28)] transition hover:bg-[#EAB54A] active:scale-[0.99]";

  return (
    <main
      lang={locale}
      className="flex min-h-[100svh] flex-col items-center justify-center bg-[linear-gradient(145deg,#1295e8_0%,#3569ed_52%,#7338f2_100%)] px-5 py-10 text-slate-950"
    >
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_70px_rgba(22,50,140,0.28)]" data-testid="invite-ticket-landing">
        <div className="px-6 pb-6 pt-8 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-semibold tracking-[0.08em] text-blue-700">
            <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.ticketTitle}
          </p>
          <div className="mx-auto mt-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-slate-100 shadow-sm">
            {inviter?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={inviter.image}
                alt=""
                width={80}
                height={80}
                className="h-full w-full object-cover"
                style={{
                  transform: buildProfileImageTransform(80, {
                    scale: inviter.imageCropScale,
                    x: inviter.imageCropX,
                    y: inviter.imageCropY,
                  }),
                }}
              />
            ) : (
              <span className="text-3xl font-bold text-slate-400" aria-hidden="true">{name.slice(0, 1)}</span>
            )}
          </div>
          <h1 className="mt-5 text-[22px] font-bold leading-snug tracking-tight">
            {fillInviteTicketCopy(copy.landingHeadline, { name })}
          </h1>
          <p className="mt-3 text-[14.5px] leading-6 text-slate-600">
            {fillInviteTicketCopy(copy.landingBody, { name })}
          </p>
          {rewardCoins > 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-[14px] font-semibold text-amber-800">
              {fillInviteTicketCopy(copy.landingReward, { coins: rewardCoins })}
            </p>
          ) : null}
        </div>

        {/* Ticket tear line. */}
        <div className="relative border-t-2 border-dashed border-slate-200">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#2f7bea]" aria-hidden="true" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[#6046f0]" aria-hidden="true" />
        </div>

        <div className="px-6 pb-7 pt-6">
          <div className="grid gap-3">
            {!isAndroid || isIos ? (
              <a href={iosAppStoreUrl} onClick={() => trackInstall("ios")} className={installButtonClass} rel="noreferrer">
                <AppleLogo />
                {isIos ? copy.install : "App Store"}
              </a>
            ) : null}
            {!isIos || isAndroid ? (
              <a href={androidPlayStoreUrl} onClick={() => trackInstall("android")} className={installButtonClass} rel="noreferrer">
                <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                {isAndroid ? copy.install : "Google Play"}
              </a>
            ) : null}
            {appUrl ? (
              <a
                href={appUrl}
                className="flex w-full items-center justify-center rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                {copy.openApp}
              </a>
            ) : null}
          </div>
          <div className="mt-5 text-center">
            <p className="text-[12.5px] leading-5 text-slate-500">{copy.codeHint}</p>
            <p className="mt-1.5 font-mono text-[26px] font-bold tracking-[0.24em] text-slate-950" data-testid="invite-ticket-code">{code}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
