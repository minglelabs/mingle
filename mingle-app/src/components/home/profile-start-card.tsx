"use client";

import { Camera, Loader2, UserRound } from "lucide-react";
import { checkPhotoForFace } from "@/lib/native-face-check";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ACCOUNT_NAMES, needsProfileStart, resolveProfileStartCopy } from "@/i18n/profile-start-copy";
import { buildClientApiPath } from "@/lib/api-contract";

const DISMISS_KEY_PREFIX = "mingle:profile-start-dismissed:";

function readDismissed(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

/**
 * On top of the home tab for an account that has no photo or still carries
 * the default name: pick a photo, type a name, save. "Later" hides it until
 * the app is opened again. Nothing is shown once the profile has both.
 */
export default function ProfileStartCard({ locale, userId }: { locale: string; userId: string }) {
  const copy = useMemo(() => resolveProfileStartCopy(locale), [locale]);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!userId || readDismissed(userId)) return;
    let cancelled = false;
    void fetch(buildClientApiPath("/profile"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: { name?: unknown; image?: unknown } | null) => {
        if (cancelled || !needsProfileStart(profile)) return;
        const currentName = typeof profile?.name === "string" ? profile.name.trim() : "";
        setName(DEFAULT_ACCOUNT_NAMES.includes(currentName) ? "" : currentName);
        setImageUrl(typeof profile?.image === "string" && profile.image ? profile.image : null);
        setVisible(true);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickFile = useCallback((picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setFailed(false);
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${userId}`, "1");
    } catch {
      // Without storage it simply shows again on the next visit.
    }
    setVisible(false);
  }, [userId]);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (busy || (!file && !trimmed)) return;
    setBusy(true);
    setFailed(false);
    try {
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("imageCropScale", "1");
        form.append("imageCropX", "0");
        form.append("imageCropY", "0");
        form.append("faceCheck", await checkPhotoForFace(file));
        const imageResponse = await fetch(buildClientApiPath("/profile/image"), {
          method: "POST",
          headers: { "x-mingle-expected-account-id": userId },
          body: form,
        });
        if (!imageResponse.ok) throw new Error("profile_image_failed");
      }
      if (trimmed) {
        const response = await fetch(buildClientApiPath("/profile"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-mingle-expected-account-id": userId },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!response.ok) throw new Error("profile_name_failed");
      }
      // Done when both are there; with only one saved the card stays for the other.
      if ((file || imageUrl) && trimmed) setVisible(false);
      else if (file) {
        setImageUrl(previewUrl);
        setFile(null);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, file, imageUrl, name, previewUrl, userId]);

  if (!visible) return null;
  const shownImage = previewUrl ?? imageUrl;

  return (
    <section className="mx-3 mb-2 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5" aria-label={copy.title} data-qa="profile-start-card">
      <h2 className="text-[15px] font-bold text-slate-950">{copy.title}</h2>
      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{copy.body}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={shownImage ? copy.changePhoto : copy.addPhoto}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-300 bg-white text-gray-300 transition active:scale-95"
        >
          {shownImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound size={30} aria-hidden="true" />
          )}
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-white">
            <Camera size={13} aria-hidden="true" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => pickFile(event.currentTarget.files?.[0] ?? null)}
        />
        <input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder={copy.namePlaceholder}
          maxLength={40}
          autoComplete="nickname"
          aria-label={copy.namePlaceholder}
          className="h-11 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-[16px] text-slate-900 outline-none focus:border-amber-400"
        />
      </div>
      {failed ? <p className="mt-2 text-[13px] text-rose-600" role="alert">{copy.failed}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="flex h-10 flex-1 items-center justify-center rounded-xl text-[14px] font-semibold text-slate-600 active:bg-amber-100"
        >
          {copy.later}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (!file && !name.trim())}
          className="flex h-10 flex-[2] items-center justify-center rounded-xl bg-slate-950 text-[14px] font-bold text-white transition active:scale-[0.985] disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : copy.save}
        </button>
      </div>
    </section>
  );
}
