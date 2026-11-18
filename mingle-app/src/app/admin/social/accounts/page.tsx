import type { Metadata } from "next";
import { requireAdmin } from "@/server/admin/guard";
import { listSocialAccounts } from "@/server/marketing-social/accounts";
import { credentialEnvNames, oauthRedirectUri } from "@/server/marketing-social/config";
import { SOCIAL_PLATFORM_LABEL, SOCIAL_PLATFORMS, isSocialPlatform } from "@/server/marketing-social/types";
import { AdminNotice, AdminPage, AdminPageHeader } from "../../_components/ui";
import { AccountsManager } from "./accounts-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "플랫폼 계정 연결" };

function redirectUriOrNull(platform: (typeof SOCIAL_PLATFORMS)[number]): string | null {
  try {
    return oauthRedirectUri(platform);
  } catch {
    return null;
  }
}

export default async function AdminSocialAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/social/accounts");
  const params = await searchParams;
  const accounts = await listSocialAccounts();
  const platform = typeof params.platform === "string" && isSocialPlatform(params.platform) ? params.platform : null;
  const error = typeof params.error === "string" ? params.error : null;
  const connected = params.connected === "1";

  const setup = Object.fromEntries(
    SOCIAL_PLATFORMS.map((p) => [p, { envNames: credentialEnvNames(p), redirectUri: redirectUriOrNull(p) }]),
  ) as Record<(typeof SOCIAL_PLATFORMS)[number], { envNames: [string, string]; redirectUri: string | null }>;

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ href: "/admin/social", label: "영상 동시 업로드" }}
        title="플랫폼 계정 연결"
        description="한 번 연결하면 토큰을 저장하고 자동으로 갱신합니다. 다시 로그인할 필요가 없습니다."
      />
      {platform && connected ? <AdminNotice className="mb-3" tone="success">{SOCIAL_PLATFORM_LABEL[platform]} 연결됨</AdminNotice> : null}
      {platform && error ? (
        <AdminNotice className="mb-3" tone="error">
          {SOCIAL_PLATFORM_LABEL[platform]} 연결 실패: {error === "not_configured" ? "앱 키가 서버에 설정되지 않았습니다." : error === "state_mismatch" ? "요청이 만료됐습니다. 다시 시도하세요." : error}
        </AdminNotice>
      ) : null}
      <AccountsManager accounts={accounts} setup={setup} />
    </AdminPage>
  );
}
