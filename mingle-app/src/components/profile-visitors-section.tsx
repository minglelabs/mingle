"use client";

import { Eye, Loader2, Lock, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import HashSeedIcon from "@/components/coins/hash-seed-icon";
import { fillCoins, resolvePeopleSafetyCopy } from "@/i18n/people-safety-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { buildProfileImageTransform } from "@/lib/profile-image-crop";

type Visitor =
  | { token: string; unlocked: false; visitedAt: string }
  | {
      token: string;
      unlocked: true;
      visitedAt: string;
      user: { id: string; name: string | null; handle: string | null; image: string | null; imageCropScale: number | null; imageCropX: number | null; imageCropY: number | null };
    };

const AVATAR_PX = 56;
// Skin, hair and background tones: a blurred "photo" that looks like a face but is nobody.
const TONES = [
  ["#f3d2b8", "#3b2a20", "#9cc3e6"],
  ["#e8c39e", "#1f1a17", "#f2b6c1"],
  ["#d9a77f", "#4a3527", "#b8e0c8"],
  ["#f6dcc8", "#2b2522", "#f5d48a"],
  ["#c98f6b", "#16130f", "#c7b8f0"],
] as const;

function toneFor(token: string) {
  let hash = 0;
  for (const char of token) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** A soft blur of a face-like shape: there is no photo behind it, the server sent none. */
function BlurredAvatar({ token }: { token: string }) {
  const [skin, hair, background] = toneFor(token);
  return (
    <span className="relative block overflow-hidden rounded-full" style={{ width: AVATAR_PX, height: AVATAR_PX, background }}>
      <span className="absolute inset-0" style={{ filter: "blur(7px)", transform: "scale(1.15)" }}>
        <span className="absolute left-1/2 top-[8%] h-[46%] w-[62%] -translate-x-1/2 rounded-[50%]" style={{ background: hair }} />
        <span className="absolute left-1/2 top-[20%] h-[44%] w-[46%] -translate-x-1/2 rounded-[50%]" style={{ background: skin }} />
        <span className="absolute bottom-[-18%] left-1/2 h-[40%] w-[86%] -translate-x-1/2 rounded-[50%]" style={{ background: hair, opacity: 0.85 }} />
      </span>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-slate-600">
          <Lock size={13} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </span>
    </span>
  );
}

/**
 * "Who viewed my profile" on My page (owner, 2026-11-25): everyone gets it.
 * Each visitor is blurred until paid for (see @/server/profile-visitors).
 */
export default function ProfileVisitorsSection({ locale }: { locale: string }) {
  const router = useRouter();
  const copy = useMemo(() => resolvePeopleSafetyCopy(locale), [locale]);
  const [visitors, setVisitors] = useState<Visitor[] | null>(null);
  const [unlockCoins, setUnlockCoins] = useState(30);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(buildClientApiPath("/profile/visitors"), { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { visitors?: Visitor[]; unlockCoins?: number };
      setVisitors(Array.isArray(data.visitors) ? data.visitors : []);
      if (typeof data.unlockCoins === "number") setUnlockCoins(data.unlockCoins);
    } catch {
      // Shown again on the next visit to My page.
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unlock = useCallback(async (token: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(buildClientApiPath("/profile/visitors/unlock"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, idempotencyKey: `${token}:${Date.now()}` }),
      });
      if (response.status === 402) {
        toast(copy.visitorsNotEnough);
        return;
      }
      if (!response.ok) {
        toast(copy.visitorsFailed);
        return;
      }
      setAsking(null);
      await load();
    } catch {
      toast(copy.visitorsFailed);
    } finally {
      setBusy(false);
    }
  }, [busy, copy.visitorsFailed, copy.visitorsNotEnough, load]);

  if (visitors === null) return null;
  const lockedCount = visitors.filter((visitor) => !visitor.unlocked).length;

  return (
    <section data-qa="profile-visitors" className="mt-3 rounded-xl border border-gray-100 bg-white px-3 py-3">
      <div className="flex items-center gap-1.5">
        <Eye size={16} strokeWidth={2.2} className="text-slate-500" aria-hidden="true" />
        <h3 className="text-[14px] font-bold text-slate-900">{copy.visitorsTitle}</h3>
        {visitors.length > 0 ? <span className="text-[13px] font-semibold text-amber-600">{visitors.length}</span> : null}
      </div>
      {visitors.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-500">{copy.visitorsEmpty}</p>
      ) : (
        <>
          {lockedCount > 0 ? <p className="mt-1 text-[12px] text-slate-500">{fillCoins(copy.visitorsHint, unlockCoins)}</p> : null}
          <ul className="mt-2.5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visitors.map((visitor) => (
              <li key={visitor.token} className="shrink-0">
                {visitor.unlocked ? (
                  <button
                    type="button"
                    data-qa="profile-visitor-open"
                    onClick={() => router.push(`/${locale}/users/${encodeURIComponent(visitor.user.id)}`)}
                    className="flex w-[64px] flex-col items-center gap-1"
                  >
                    <span className="block overflow-hidden rounded-full bg-gray-100" style={{ width: AVATAR_PX, height: AVATAR_PX }}>
                      {visitor.user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a small remote avatar
                        <img
                          src={visitor.user.image}
                          alt=""
                          className="h-full w-full object-cover"
                          style={{ transform: buildProfileImageTransform(AVATAR_PX, { scale: visitor.user.imageCropScale, x: visitor.user.imageCropX, y: visitor.user.imageCropY }) }}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-gray-400"><UserRound size={26} aria-hidden="true" /></span>
                      )}
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-semibold text-slate-700">{visitor.user.name || visitor.user.handle}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-qa="profile-visitor-locked"
                    onClick={() => setAsking(visitor.token)}
                    className="flex w-[64px] flex-col items-center gap-1"
                  >
                    <BlurredAvatar token={visitor.token} />
                    <span className="h-[16px] w-10 rounded-full bg-gray-100" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {asking ? (
        <div className="fixed inset-0 z-[230] flex items-end bg-slate-950/40" role="dialog" aria-modal="true" onClick={() => setAsking(null)}>
          <div
            className="w-full rounded-t-[1.6rem] bg-white px-5 pt-5 text-center"
            style={{ paddingBottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-center"><BlurredAvatar token={asking} /></div>
            <p className="mt-3 text-[1.05rem] font-extrabold text-slate-950">{copy.visitorsTitle}</p>
            <p className="mt-1 text-[13px] text-slate-500">{fillCoins(copy.visitorsHint, unlockCoins)}</p>
            <button
              type="button"
              data-qa="profile-visitor-unlock"
              disabled={busy}
              onClick={() => void unlock(asking)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <HashSeedIcon size={18} />}
              {fillCoins(copy.visitorsUnlock, unlockCoins)}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
