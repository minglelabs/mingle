"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleAlert, Link2, Unlink } from "lucide-react";
import { SOCIAL_PLATFORM_LABEL, type SocialAccountView, type SocialPlatform } from "@/server/marketing-social/types";
import { AdminButton, AdminCard, AdminChip, AdminNotice, adminButtonClassName } from "../../_components/ui";
import { formatKst } from "../_components/format";

type Setup = Record<SocialPlatform, { envNames: [string, string]; redirectUri: string | null }>;

const HINT: Record<SocialPlatform, string> = {
  instagram: "비즈니스/크리에이터 계정으로 로그인 (페이스북 페이지 불필요)",
  threads: "인스타그램과 같은 계정의 쓰레드 프로필",
  youtube: "채널이 있는 구글 계정",
  tiktok: "올릴 틱톡 계정",
};

export function AccountsManager({ accounts, setup }: { accounts: SocialAccountView[]; setup: Setup }) {
  const router = useRouter();
  const [busy, setBusy] = useState<SocialPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(platform: SocialPlatform) {
    if (!window.confirm(`${SOCIAL_PLATFORM_LABEL[platform]} 연결을 해제할까요?`)) return;
    setBusy(platform);
    setError(null);
    try {
      const response = await fetch(`/admin/social/api/accounts/${platform}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("연결 해제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
      {accounts.map((account) => {
        const { platform } = account;
        const name = account.username ? `@${account.username.replace(/^@/, "")}` : account.displayName;
        return (
          <AdminCard key={platform}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{SOCIAL_PLATFORM_LABEL[platform]}</p>
                <p className="mt-0.5 break-words text-sm text-slate-500">{account.connected ? name ?? "연결됨" : HINT[platform]}</p>
              </div>
              {account.connected ? (
                <AdminChip icon={account.lastError ? CircleAlert : CheckCircle2} tone={account.lastError ? "warning" : "success"}>
                  {account.lastError ? "확인 필요" : "연결됨"}
                </AdminChip>
              ) : (
                <AdminChip>미연결</AdminChip>
              )}
            </div>

            {account.connected ? (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">연결</dt>
                <dd className="text-slate-700">{formatKst(account.connectedAt)}</dd>
                {account.accessTokenExpiresAt ? (
                  <>
                    <dt className="text-slate-500">토큰 만료</dt>
                    <dd className="text-slate-700">{formatKst(account.accessTokenExpiresAt)} (자동 갱신)</dd>
                  </>
                ) : null}
                {account.refreshTokenExpiresAt ? (
                  <>
                    <dt className="text-slate-500">재연결 필요</dt>
                    <dd className="text-slate-700">{formatKst(account.refreshTokenExpiresAt)}까지 유효</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            {account.lastError ? <AdminNotice className="mt-3" tone="error">{account.lastError}</AdminNotice> : null}

            {!account.configured ? (
              <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                서버 환경변수 <code>{setup[platform].envNames[0]}</code>, <code>{setup[platform].envNames[1]}</code>가 필요합니다.
                {setup[platform].redirectUri ? (
                  <>
                    {" "}리디렉션 URI: <code className="break-all">{setup[platform].redirectUri}</code>
                  </>
                ) : null}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {account.configured ? (
                // A plain link: the start route redirects off-site, which client navigation cannot follow.
                <a className={adminButtonClassName({ variant: account.connected ? "secondary" : "primary" })} href={`/admin/social/api/oauth/${platform}/start`}>
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  {account.connected ? "다시 연결" : "연결하기"}
                </a>
              ) : null}
              {account.connected ? (
                <AdminButton disabled={busy === platform} onClick={() => void disconnect(platform)} variant="danger">
                  <Unlink className="h-4 w-4" aria-hidden="true" />
                  연결 해제
                </AdminButton>
              ) : null}
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
