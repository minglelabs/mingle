import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Ban, ShieldCheck, Smartphone, Unlink, Undo2 } from "lucide-react";
import { BAN_NOTICE_CATEGORIES, resolveHomeCopy } from "@/i18n/home-copy";
import { prisma } from "@/lib/prisma";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { requireAdmin } from "@/server/admin/guard";
import { banUserBundle, previewBan, setDeviceExempt, unbanUser, unblockDevice } from "@/server/identity/ban";
import { isStrongDeviceKeyKind } from "@/server/identity/keys";
import { DetachRefused, detachSignInMethod, listSignInMethods } from "@/server/identity/methods";
import { AdminButton, AdminCard, AdminChip, AdminNotice, AdminPage, AdminPageHeader, adminInputClassName } from "../../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "계정" };

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const BAN_CATEGORY_LABEL = resolveHomeCopy("ko").banCategory;

const METHOD_LABEL: Record<string, string> = { apple: "Apple", google: "Google", email: "이메일", phone: "전화번호" };
const EVENT_LABEL: Record<string, string> = {
  sign_up: "가입",
  sign_in: "로그인",
  phone_verified: "번호 인증",
  phone_in_use: "다른 계정의 번호를 인증하려 함",
  attached: "이 계정에 붙음",
  detached: "뗌",
  merged: "다른 계정으로 합쳐짐",
};
const KEY_KIND_LABEL: Record<string, string> = {
  keychain: "iOS 키체인",
  android_id: "안드로이드 ID",
  web_local: "브라우저 저장값",
  push_installation: "푸시 설치 ID",
};

const RESULT_TEXT: Record<string, { tone: "success" | "error"; text: string }> = {
  banned: { tone: "success", text: "영구 퇴출했어요. 이어진 번호·로그인 수단·기기도 함께 막혔어요." },
  unbanned: { tone: "success", text: "퇴출을 풀었어요. 이 계정만 가진 번호와 로그인 수단도 다시 열렸어요." },
  detached: { tone: "success", text: "뗐어요. 이 수단으로는 더 이상 이 계정에 들어올 수 없어요." },
  exempt: { tone: "success", text: "기기 예외를 바꿨어요." },
  unblocked: { tone: "success", text: "기기 차단을 풀었어요." },
  confirm: { tone: "error", text: "확인란에 '퇴출'을 입력해야 해요." },
  last_method: { tone: "error", text: "마지막 로그인 수단은 뗄 수 없어요." },
  failed: { tone: "error", text: "처리하지 못했어요." },
};

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function accountPath(userId: string, result?: string): string {
  const base = `/admin/accounts/${encodeURIComponent(userId)}`;
  return result ? `${base}?result=${result}` : base;
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function banAction(formData: FormData) {
  "use server";
  const userId = readField(formData, "userId");
  const returnTo = sanitizeAdminReturnTo(accountPath(userId), "/admin/accounts");
  const ctx = await requireAdmin(returnTo);
  if (!userId) redirect("/admin/accounts");
  if (readField(formData, "confirm") !== "퇴출") redirect(accountPath(userId, "confirm"));
  const onlyUserIds = formData.getAll("include").filter((value): value is string => typeof value === "string");
  await banUserBundle({
    userId,
    reason: readField(formData, "reason"),
    adminSessionId: ctx.sessionId,
    onlyUserIds,
    noticeCategory: readField(formData, "noticeCategory") || null,
  });
  revalidatePath("/admin/accounts");
  redirect(accountPath(userId, "banned"));
}

async function unbanAction(formData: FormData) {
  "use server";
  const userId = readField(formData, "userId");
  const ctx = await requireAdmin(accountPath(userId));
  if (!userId) redirect("/admin/accounts");
  await unbanUser({ userId, adminSessionId: ctx.sessionId });
  revalidatePath("/admin/accounts");
  redirect(accountPath(userId, "unbanned"));
}

async function detachAction(formData: FormData) {
  "use server";
  const userId = readField(formData, "userId");
  const ctx = await requireAdmin(accountPath(userId));
  const kind = readField(formData, "kind") === "phone" ? "phone" : "account";
  const id = readField(formData, "id");
  if (!userId || !id) redirect("/admin/accounts");
  let result = "detached";
  try {
    await detachSignInMethod(userId, { kind, id }, { byAdmin: true });
    await prisma.adminAuditLog.create({
      data: { action: "identity.detach", sessionId: ctx.sessionId, targetType: "user", targetId: userId, metadata: { kind, id } },
    });
  } catch (error) {
    if (!(error instanceof DetachRefused)) throw error;
    result = error.code === "last_method" ? "last_method" : "failed";
  }
  redirect(accountPath(userId, result));
}

async function deviceAction(formData: FormData) {
  "use server";
  const userId = readField(formData, "userId");
  const ctx = await requireAdmin(accountPath(userId));
  const deviceId = readField(formData, "deviceId");
  const op = readField(formData, "op");
  if (!userId || !deviceId) redirect("/admin/accounts");
  if (op === "unblock") {
    await unblockDevice({ deviceId, adminSessionId: ctx.sessionId });
    redirect(accountPath(userId, "unblocked"));
  }
  await setDeviceExempt({ deviceId, exempt: op === "exempt", adminSessionId: ctx.sessionId });
  redirect(accountPath(userId, "exempt"));
}

/**
 * One account: how it signs in, which devices it was seen on, its history of
 * sign-ins and number checks, the accounts it is linked to, and the permanent
 * ban with a preview of everything the ban takes along.
 */
export default async function AdminAccountPage({ params, searchParams }: PageProps) {
  const { userId: rawUserId } = await params;
  const userId = decodeURIComponent(rawUserId);
  await requireAdmin(accountPath(userId));
  const result = RESULT_TEXT[takeFirst((await searchParams).result)];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, handle: true, email: true, phoneE164: true, createdAt: true, lastSeenAt: true,
      bannedAt: true, bannedReason: true, isDeleted: true, mergedIntoUserId: true, isOperator: true, isOfficial: true,
    },
  });
  if (!user) notFound();

  const [methods, deviceRows, links, preview] = await Promise.all([
    listSignInMethods(userId),
    prisma.appDeviceUser.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      take: 30,
      select: { firstSeenAt: true, lastSeenAt: true, device: { select: { id: true, platform: true, keyKind: true, exemptAt: true, blockedAt: true } } },
    }),
    prisma.appIdentityLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, method: true, event: true, ip: true, appVersion: true, deviceId: true, createdAt: true },
    }),
    previewBan(userId),
  ]);
  const linked = preview.users.filter((entry) => entry.id !== userId);

  return (
    <AdminPage>
      <AdminPageHeader
        title={user.name || "(이름 없음)"}
        description={(
          <>
            {user.handle ? `@${user.handle} · ` : ""}
            <span className="font-mono">{user.id}</span>
          </>
        )}
        back={{ href: "/admin/accounts", label: "계정·퇴출" }}
      />
      {result ? <AdminNotice tone={result.tone} className="mb-3">{result.text}</AdminNotice> : null}

      <AdminCard className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {user.bannedAt ? <AdminChip tone="danger" icon={Ban}>영구 퇴출</AdminChip> : <AdminChip tone="success">이용 중</AdminChip>}
          {user.isOperator ? <AdminChip tone="accent">운영 계정</AdminChip> : null}
          {user.isOfficial ? <AdminChip tone="accent">공식 계정</AdminChip> : null}
          {user.mergedIntoUserId ? (
            <Link href={accountPath(user.mergedIntoUserId)} className="text-xs font-semibold text-sky-700 underline underline-offset-2">합쳐진 계정 보기</Link>
          ) : user.isDeleted ? <AdminChip>탈퇴</AdminChip> : null}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="font-mono">{user.phoneE164 ?? "번호 없음"}</span>
          {user.email ? <span className="truncate">{user.email}</span> : null}
          <span>가입 {DATE_FORMATTER.format(user.createdAt)}</span>
          <span>마지막 접속 {DATE_FORMATTER.format(user.lastSeenAt)}</span>
        </p>
        {user.bannedAt ? (
          <p className="mt-2 text-xs text-rose-700">
            퇴출 {DATE_FORMATTER.format(user.bannedAt)}{user.bannedReason ? ` · ${user.bannedReason}` : ""}
          </p>
        ) : null}
      </AdminCard>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">로그인 수단</h2>
      <AdminCard className="p-0">
        {methods.length === 0 ? <p className="p-4 text-sm text-slate-500">로그인 수단이 없어요.</p> : (
          <ul className="divide-y divide-slate-100">
            {methods.map((method) => {
              const key = method.kind === "account" ? `a:${method.id}` : method.kind === "email" ? "email" : method.own ? "own" : `p:${method.id}`;
              const label = method.kind === "account" ? METHOD_LABEL[method.provider]
                : method.kind === "email" ? `이메일 ${method.email}`
                  : `전화번호 끝자리 ${method.last4}${method.own ? "" : " (딸린 번호)"}`;
              const detachTarget = methods.length <= 1 ? null
                : method.kind === "account" ? { kind: "account", id: method.id }
                  : method.kind === "phone" && !method.own ? { kind: "phone", id: method.id }
                    : null;
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm text-slate-800">{label}</span>
                  {method.detachable ? <AdminChip tone="warning">나중에 붙음</AdminChip> : null}
                  {detachTarget ? (
                    <form action={detachAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="kind" value={detachTarget.kind} />
                      <input type="hidden" name="id" value={detachTarget.id} />
                      <AdminButton type="submit" variant="ghost">
                        <Unlink size={16} aria-hidden />
                        떼기
                      </AdminButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">기기</h2>
      <AdminCard className="p-0">
        {deviceRows.length === 0 ? <p className="p-4 text-sm text-slate-500">기록된 기기가 없어요. 기기 값은 다음 앱 버전부터 들어와요.</p> : (
          <ul className="divide-y divide-slate-100">
            {deviceRows.map((row) => (
              <li key={row.device.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                    <Smartphone size={14} aria-hidden />
                    {row.device.platform} · {KEY_KIND_LABEL[row.device.keyKind] ?? row.device.keyKind}
                    {isStrongDeviceKeyKind(row.device.keyKind) ? null : <AdminChip>판정에 안 씀</AdminChip>}
                    {row.device.exemptAt ? <AdminChip tone="accent" icon={ShieldCheck}>예외 (테스트 폰)</AdminChip> : null}
                    {row.device.blockedAt ? <AdminChip tone="danger" icon={Ban}>차단됨</AdminChip> : null}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    처음 {DATE_FORMATTER.format(row.firstSeenAt)} · 마지막 {DATE_FORMATTER.format(row.lastSeenAt)} · <span className="font-mono">{row.device.id}</span>
                  </p>
                </div>
                <form action={deviceAction} className="flex gap-1">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="deviceId" value={row.device.id} />
                  {row.device.blockedAt ? (
                    <AdminButton type="submit" name="op" value="unblock" variant="ghost">차단 풀기</AdminButton>
                  ) : null}
                  <AdminButton type="submit" name="op" value={row.device.exemptAt ? "unexempt" : "exempt"} variant="ghost">
                    {row.device.exemptAt ? "예외 해제" : "예외로"}
                  </AdminButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">이어진 계정 ({linked.length})</h2>
      <AdminCard className="p-0">
        {linked.length === 0 ? <p className="p-4 text-sm text-slate-500">같은 기기·번호·로그인 수단으로 이어진 다른 계정이 없어요.</p> : (
          <ul className="divide-y divide-slate-100">
            {linked.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <Link href={accountPath(entry.id)} className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                  <span className="font-semibold">{entry.name || "(이름 없음)"}</span>
                  {entry.handle ? <span className="text-slate-500">@{entry.handle}</span> : null}
                  {entry.bannedAt ? <AdminChip tone="danger">영구 퇴출</AdminChip> : null}
                  {entry.isDeleted ? <AdminChip>탈퇴·합쳐짐</AdminChip> : null}
                  <span className="text-xs text-slate-500">가입 {DATE_FORMATTER.format(entry.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">영구 퇴출</h2>
      {user.bannedAt ? (
        <AdminCard>
          <p className="text-sm text-slate-700">이 계정의 퇴출만 풀어요. 이어진 다른 계정은 그대로 퇴출 상태예요.</p>
          <form action={unbanAction} className="mt-3">
            <input type="hidden" name="userId" value={user.id} />
            <AdminButton type="submit">
              <Undo2 size={16} aria-hidden />
              퇴출 풀기
            </AdminButton>
          </form>
        </AdminCard>
      ) : (
        <AdminCard>
          <p className="text-sm leading-6 text-slate-700">
            퇴출하면 아래 계정이 모두 로그인할 수 없게 되고, 그 계정들의 번호·로그인 수단 {preview.bundle.keys.length}개와 기기 {preview.bundle.deviceIds.length}대로는 새로 가입할 수 없어요.
            함께 퇴출하지 않을 계정은 체크를 풀어 주세요.
          </p>
          {preview.bundle.truncated ? <AdminNotice tone="error" className="mt-2">이어진 계정이 너무 많아 일부만 보여요. 퇴출 전에 확인이 필요해요.</AdminNotice> : null}
          <form action={banAction} className="mt-3 grid gap-3">
            <input type="hidden" name="userId" value={user.id} />
            <ul className="grid gap-1.5">
              <li className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked disabled readOnly className="h-4 w-4" />
                <span className="font-semibold">{user.name || "(이름 없음)"}</span>
                <span className="text-slate-500">이 계정</span>
              </li>
              {linked.filter((entry) => !entry.bannedAt).map((entry) => (
                <li key={entry.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input type="checkbox" name="include" value={entry.id} defaultChecked className="h-4 w-4" />
                    <span className="font-semibold">{entry.name || "(이름 없음)"}</span>
                    {entry.handle ? <span className="text-slate-500">@{entry.handle}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            <input name="reason" placeholder="사유 (운영 기록용)" className={adminInputClassName} maxLength={500} />
            <select name="noticeCategory" className={adminInputClassName} defaultValue="other" aria-label="홈 탭 퇴출 공지">
              {BAN_NOTICE_CATEGORIES.map((category) => (
                <option key={category} value={category}>퇴출 공지 올림: {BAN_CATEGORY_LABEL[category]}</option>
              ))}
              <option value="">퇴출 공지 올리지 않음</option>
            </select>
            <input name="confirm" placeholder="확인: '퇴출'이라고 입력" className={adminInputClassName} autoComplete="off" />
            <AdminButton type="submit" variant="danger">
              <Ban size={16} aria-hidden />
              영구 퇴출
            </AdminButton>
          </form>
        </AdminCard>
      )}

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">기록</h2>
      <AdminCard className="p-0">
        {links.length === 0 ? <p className="p-4 text-sm text-slate-500">아직 기록이 없어요. 이 기능이 배포된 뒤의 로그인부터 남아요.</p> : (
          <ul className="divide-y divide-slate-100">
            {links.map((link) => (
              <li key={link.id} className="px-4 py-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{METHOD_LABEL[link.method] ?? link.method} · {EVENT_LABEL[link.event] ?? link.event}</span>
                <span className="ml-2">{DATE_FORMATTER.format(link.createdAt)}</span>
                {link.appVersion ? <span className="ml-2">앱 {link.appVersion}</span> : null}
                {link.ip ? <span className="ml-2 font-mono">{link.ip}</span> : null}
                {link.deviceId ? <span className="ml-2 font-mono">기기 {link.deviceId.slice(-6)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </AdminPage>
  );
}
