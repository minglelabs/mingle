"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, ImageUp, Loader2, LogIn, PenLine } from "lucide-react";

type AdminViewer = { admin: boolean; staff: boolean; operatorPost: boolean };

const ERRORS: Record<string, string> = {
  invalid_image: "JPG·PNG·WEBP 사진만 올릴 수 있어요.",
  image_too_large: "사진이 너무 커요 (15MB까지).",
  invalid_text: "글이 비었거나 너무 길어요.",
  conflict: "그사이 글이 바뀌었어요. 다시 열어 주세요.",
  not_found: "운영 계정 글만 고칠 수 있어요.",
};

/**
 * Staff-only rows in the post "⋯" menu, in Korean like the operator tool.
 * With an admin session (the web view shares the operator tool's cookie) an
 * operator account's post gets 사진 바꾸기 · 글 수정 · 내리고 검토로; a staff app
 * account without one gets a row to the admin login. Nothing for anyone else.
 */
export default function PostAdminActions({
  postId,
  text,
  onChanged,
  onTakenDown,
}: {
  postId: string;
  text: string;
  /** The photo or text changed: reload so the feed shows the new version. */
  onChanged: () => void;
  onTakenDown: () => void;
}) {
  const [viewer, setViewer] = useState<AdminViewer | null>(null);
  const [busy, setBusy] = useState<null | "photo" | "text" | "takedown">(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [confirmTakedown, setConfirmTakedown] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/app-viewer?postId=${encodeURIComponent(postId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: AdminViewer | null) => { if (body) setViewer(body); })
      .catch(() => {});
    return () => controller.abort();
  }, [postId]);

  if (!viewer) return null;
  if (!viewer.admin) {
    if (!viewer.staff) return null;
    return (
      <AdminSection>
        <AdminRow icon={<LogIn size={19} aria-hidden="true" />} label="관리자 로그인 (글 편집하려면)" onClick={() => { window.location.assign(`/admin?next=${encodeURIComponent("/admin/feed")}`); }} />
      </AdminSection>
    );
  }
  if (!viewer.operatorPost) return null;

  async function send(kind: "photo" | "text" | "takedown", request: () => Promise<Response>): Promise<boolean> {
    setBusy(kind);
    setError(null);
    try {
      const response = await request();
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(ERRORS[body.error ?? ""] ?? "저장하지 못했어요.");
        return false;
      }
      return true;
    } catch {
      setError("저장하지 못했어요.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.set("file", file);
    const saved = await send("photo", () => fetch(`/admin/api/posts/${encodeURIComponent(postId)}/image`, { method: "POST", body: form }));
    if (fileRef.current) fileRef.current.value = "";
    if (saved) onChanged();
  }

  async function saveText() {
    const saved = await send("text", () => fetch(`/admin/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draft }),
    }));
    if (saved) onChanged();
  }

  async function takeDown() {
    const saved = await send("takedown", () => fetch(`/admin/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden: true }),
    }));
    if (saved) onTakenDown();
  }

  const spinner = <Loader2 size={19} className="animate-spin" aria-hidden="true" />;

  return (
    <AdminSection>
      <AdminRow icon={busy === "photo" ? spinner : <ImageUp size={19} aria-hidden="true" />} label="사진 바꾸기" disabled={busy !== null} onClick={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); }}
      />
      <AdminRow icon={<PenLine size={19} aria-hidden="true" />} label={editing ? "글 수정 취소" : "글 수정"} disabled={busy !== null} onClick={() => { setDraft(text); setEditing((open) => !open); setError(null); }} />
      {editing ? (
        <div className="px-3 pb-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            className="w-full rounded-xl border border-slate-200 p-3 text-[15px] leading-6 text-slate-900 focus:border-sky-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy !== null || !draft.trim()}
            onClick={() => void saveText()}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "text" ? spinner : "저장"}
          </button>
        </div>
      ) : null}
      {confirmTakedown ? (
        <div className="mx-3 mb-2 rounded-xl bg-rose-50 p-3">
          <p className="text-[14px] leading-5 text-rose-700">앱에서 내리고 검토 목록 맨 앞으로 보낼까요?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmTakedown(false)} disabled={busy !== null} className="h-10 rounded-lg border border-rose-200 bg-white text-[14px] font-medium text-slate-700">취소</button>
            <button type="button" onClick={() => void takeDown()} disabled={busy !== null} className="flex h-10 items-center justify-center rounded-lg bg-rose-500 text-[14px] font-semibold text-white">
              {busy === "takedown" ? spinner : "내리기"}
            </button>
          </div>
        </div>
      ) : (
        <AdminRow icon={<ArchiveRestore size={19} aria-hidden="true" />} label="내리고 검토로" tone="danger" disabled={busy !== null} onClick={() => setConfirmTakedown(true)} />
      )}
      {error ? <p className="px-3 pb-1 text-[13px] text-red-500" role="alert">{error}</p> : null}
    </AdminSection>
  );
}

function AdminSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-slate-100 pt-2">
      <p className="px-3 pb-1 text-[12px] font-semibold text-sky-600">관리자</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function AdminRow({
  icon,
  label,
  onClick,
  tone = "neutral",
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 items-center gap-3.5 rounded-xl px-3 text-left text-[15px] font-medium transition active:bg-gray-100 disabled:opacity-50 ${
        tone === "danger" ? "text-rose-600" : "text-slate-900"
      }`}
    >
      <span className={tone === "danger" ? "text-rose-500" : "text-slate-500"}>{icon}</span>
      {label}
    </button>
  );
}
