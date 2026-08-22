import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mingle Admin Conversations" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : Array.isArray(value) ? (value[0] ?? "").trim() : "";
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(value);
}

async function authenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export default async function AdminConversationsPage({ searchParams }: PageProps) {
  if (!(await authenticated())) redirect("/admin");
  const params = await searchParams;
  const externalUserId = first(params.userId);
  const user = externalUserId
    ? await prisma.user.findUnique({
      where: { externalUserId },
      select: {
        id: true, externalUserId: true, email: true, name: true,
        conversationChannels: {
          where: { isDeleted: { not: true } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true, title: true, sessionKey: true, createdAt: true, updatedAt: true,
          },
        },
      },
    })
    : null;

  const channels = user?.conversationChannels ?? [];
  const userId = user?.id;
  const messages = userId && channels.length
    ? await prisma.appMessage.findMany({
      where: { userId, isDeleted: { not: true }, sessionKey: { in: channels.map((channel) => channel.sessionKey) } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, sessionKey: true, sourceLanguage: true, createdAt: true,
        contents: { where: { isDeleted: { not: true } }, orderBy: { createdAt: "asc" }, select: { contentType: true, language: true, text: true } },
      },
    })
    : [];
  const messagesBySession = new Map<string, typeof messages>();
  for (const message of messages) messagesBySession.set(message.sessionKey ?? "", [...(messagesBySession.get(message.sessionKey ?? "") ?? []), message]);

  return (
    <main className="min-h-svh bg-[#f9f9f7] px-4 py-6 text-[#0b0b0b]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">대화록 조회</h1><p className="mt-1 text-sm text-[#6f6d68]">외부 사용자 ID로 사용자의 저장된 대화를 확인합니다.</p></div>
          <Link className="rounded-md border border-[#e5e3dc] bg-white px-4 py-2 text-sm font-semibold" href="/admin">피드백함으로</Link>
        </header>
        <form className="mb-6 flex gap-2 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
          <input name="userId" defaultValue={externalUserId} placeholder="external user ID" className="min-w-0 flex-1 rounded-md border border-[#d9d6ce] px-3 py-2 text-sm" required />
          <button className="rounded-md bg-[#0b0b0b] px-4 py-2 text-sm font-semibold text-white" type="submit">조회</button>
        </form>
        {!externalUserId ? <p className="text-sm text-[#6f6d68]">사용자 ID를 입력해 주세요.</p> : !user ? <p className="rounded-xl border border-[#ead7d2] bg-white p-5 text-sm text-[#9b3c2f]">해당 사용자를 찾을 수 없습니다.</p> : (
          <>
            <section className="mb-5 rounded-xl border border-[#e5e3dc] bg-white p-5 shadow-sm"><h2 className="font-semibold">{user.name || user.email || "사용자"}</h2><p className="mt-1 break-all text-xs text-[#6f6d68]">{user.externalUserId}</p><p className="mt-1 text-xs text-[#6f6d68]">대화방 {channels.length}개 · 메시지 {messages.length}개</p></section>
            <div className="space-y-5">{channels.map((channel) => <section className="rounded-xl border border-[#e5e3dc] bg-white p-5 shadow-sm" key={channel.id}>
              <div className="mb-4 border-b border-[#eeeae2] pb-3"><h2 className="font-semibold">{channel.title || "제목 없음"}</h2><p className="mt-1 text-xs text-[#898781]">{formatDate(channel.createdAt)} · {messagesBySession.get(channel.sessionKey)?.length ?? 0}개 메시지</p></div>
              <div className="space-y-3">{(messagesBySession.get(channel.sessionKey) ?? []).map((message) => <article className="rounded-lg bg-[#f7f6f2] p-3" key={message.id}><div className="mb-2 text-xs text-[#898781]">{formatDate(message.createdAt)} · {message.sourceLanguage}</div>{message.contents.map((content) => <p className="mb-1 whitespace-pre-wrap text-sm last:mb-0" key={`${content.contentType}-${content.language}`}><span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#898781]">{content.contentType}</span>{content.text}</p>)}</article>)}</div>
            </section>)}</div>
          </>
        )}
      </div>
    </main>
  );
}
