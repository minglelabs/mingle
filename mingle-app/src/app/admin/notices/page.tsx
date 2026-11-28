import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Megaphone, ShieldAlert, Trash2 } from "lucide-react";
import { BAN_NOTICE_CATEGORIES, resolveHomeCopy } from "@/i18n/home-copy";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/admin/guard";
import { createBanNotice, createGeneralNotice, deleteNotice, pickNoticeText } from "@/server/notices";
import { sendImportantNoticePush } from "@/server/notice-push";
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminEmptyState,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  adminInputClassName,
  adminLabelClassName,
  adminTextareaClassName,
} from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "공지" };

const PATH = "/admin/notices";
const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const CATEGORY_LABEL = resolveHomeCopy("ko").banCategory;

const RESULT_TEXT: Record<string, { tone: "success" | "error"; text: string }> = {
  created: { tone: "success", text: "공지를 올렸어요. 홈 탭의 공지 목록에 바로 보여요." },
  deleted: { tone: "success", text: "공지를 내렸어요." },
  empty: { tone: "error", text: "제목이나 내용을 한 언어 이상 적어 주세요." },
  name: { tone: "error", text: "퇴출 공지에는 이름이 필요해요. 첫 글자만 남고 나머지는 가려져요." },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function takeFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function createGeneralAction(formData: FormData) {
  "use server";
  const ctx = await requireAdmin(PATH);
  const id = await createGeneralNotice({
    texts: {
      ko: { title: readField(formData, "titleKo"), body: readField(formData, "bodyKo") },
      en: { title: readField(formData, "titleEn"), body: readField(formData, "bodyEn") },
    },
    isImportant: formData.get("important") === "on",
  });
  if (!id) redirect(`${PATH}?result=empty`);
  await prisma.adminAuditLog.create({ data: { action: "notice.create", sessionId: ctx.sessionId, targetType: "notice", targetId: id } });
  // An important notice is pushed once to every device. Not awaited: the page must not wait for every delivery.
  if (formData.get("important") === "on") {
    void sendImportantNoticePush(id).catch((error) => console.error("[notices] important notice push failed", error));
  }
  revalidatePath(PATH);
  redirect(`${PATH}?result=created`);
}

async function createBanAction(formData: FormData) {
  "use server";
  const ctx = await requireAdmin(PATH);
  const name = readField(formData, "name");
  if (!name) redirect(`${PATH}?result=name`);
  const id = await createBanNotice({ name, category: readField(formData, "category") });
  await prisma.adminAuditLog.create({ data: { action: "notice.create_ban", sessionId: ctx.sessionId, targetType: "notice", targetId: id } });
  revalidatePath(PATH);
  redirect(`${PATH}?result=created`);
}

async function deleteAction(formData: FormData) {
  "use server";
  const ctx = await requireAdmin(PATH);
  const id = readField(formData, "id");
  if (id) {
    await deleteNotice(id);
    await prisma.adminAuditLog.create({ data: { action: "notice.delete", sessionId: ctx.sessionId, targetType: "notice", targetId: id } });
  }
  revalidatePath(PATH);
  redirect(`${PATH}?result=deleted`);
}

/**
 * 공지: what the strip on top of the home tab opens. A ban notice shows only
 * the first letter of the name and a reason category; a general notice is
 * written in Korean and English (other app languages read the English one).
 */
export default async function AdminNoticesPage({ searchParams }: PageProps) {
  await requireAdmin(PATH);
  const result = RESULT_TEXT[takeFirst((await searchParams).result)];
  const notices = await prisma.appNotice.findMany({
    where: { deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 100,
    select: { id: true, kind: true, maskedName: true, category: true, texts: true, isImportant: true, publishedAt: true },
  });

  return (
    <AdminPage>
      <AdminPageHeader
        title="공지"
        description="홈 탭 맨 위 띠(이번 주 영구 퇴출 N명)를 누르면 열리는 목록이에요. 이번 주 퇴출 공지가 없으면 띠는 보이지 않아요."
        back={{ href: "/admin/more", label: "더보기" }}
      />
      {result ? <AdminNotice tone={result.tone} className="mb-3">{result.text}</AdminNotice> : null}

      <AdminCard className="mb-3">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldAlert size={16} aria-hidden />퇴출 공지</h2>
        <form action={createBanAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className={adminLabelClassName} htmlFor="ban-name">이름 (첫 글자만 보여요)</label>
            <input id="ban-name" name="name" className={adminInputClassName} maxLength={64} />
          </div>
          <div>
            <label className={adminLabelClassName} htmlFor="ban-category">사유</label>
            <select id="ban-category" name="category" className={adminInputClassName} defaultValue="other">
              {BAN_NOTICE_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
            </select>
          </div>
          <AdminButton type="submit" variant="primary">올리기</AdminButton>
        </form>
      </AdminCard>

      <AdminCard className="mb-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Megaphone size={16} aria-hidden />일반 공지</h2>
        <form action={createGeneralAction} className="grid gap-3">
          <div>
            <label className={adminLabelClassName} htmlFor="title-ko">제목 (한국어)</label>
            <input id="title-ko" name="titleKo" className={adminInputClassName} maxLength={200} />
          </div>
          <div>
            <label className={adminLabelClassName} htmlFor="body-ko">내용 (한국어)</label>
            <textarea id="body-ko" name="bodyKo" className={adminTextareaClassName} maxLength={4000} />
          </div>
          <div>
            <label className={adminLabelClassName} htmlFor="title-en">제목 (영어)</label>
            <input id="title-en" name="titleEn" className={adminInputClassName} maxLength={200} />
          </div>
          <div>
            <label className={adminLabelClassName} htmlFor="body-en">내용 (영어)</label>
            <textarea id="body-en" name="bodyEn" className={adminTextareaClassName} maxLength={4000} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="important" className="h-4 w-4" />
            중요 공지로 표시 (올리면 모든 사용자에게 푸시가 한 번 갑니다)
          </label>
          <AdminButton type="submit" variant="primary">올리기</AdminButton>
        </form>
      </AdminCard>

      {notices.length === 0 ? (
        <AdminEmptyState icon={Megaphone} title="올린 공지가 없어요" />
      ) : (
        <ul className="grid gap-2">
          {notices.map((notice) => {
            const text = notice.kind === "general" ? pickNoticeText(notice.texts, "ko") : null;
            return (
              <li key={notice.id}>
                <AdminCard className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {notice.kind === "ban" ? (
                        <>
                          <AdminChip tone="danger" icon={ShieldAlert}>영구 퇴출</AdminChip>
                          <span>{notice.maskedName ?? "***"}</span>
                          <span className="font-normal text-slate-500">{CATEGORY_LABEL[(notice.category ?? "other") as keyof typeof CATEGORY_LABEL] ?? notice.category}</span>
                        </>
                      ) : (
                        <>
                          {notice.isImportant ? <AdminChip tone="warning">중요</AdminChip> : null}
                          <span className="truncate">{text?.title || "(제목 없음)"}</span>
                        </>
                      )}
                    </p>
                    {text?.body ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{text.body}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">{DATE_FORMATTER.format(notice.publishedAt)}</p>
                  </div>
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={notice.id} />
                    <AdminButton type="submit" variant="ghost">
                      <Trash2 size={16} aria-hidden />
                      내리기
                    </AdminButton>
                  </form>
                </AdminCard>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPage>
  );
}
