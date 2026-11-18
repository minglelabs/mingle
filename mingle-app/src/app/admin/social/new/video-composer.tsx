"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Film, ImageIcon, RotateCcw, Send } from "lucide-react";
import { captionTooLong, composeCaption, normalizeHashtags } from "@/server/marketing-social/captions";
import { isVertical916 } from "@/server/marketing-social/mp4";
import {
  SOCIAL_CAPTION_LIMIT,
  SOCIAL_PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  YOUTUBE_TITLE_LIMIT,
  type SocialPlatform,
} from "@/server/marketing-social/types";
import {
  AdminButton,
  AdminCard,
  AdminNotice,
  adminInputClassName,
  adminLabelClassName,
  adminTextareaClassName,
} from "../../_components/ui";
import { SOCIAL_ERROR_COPY } from "../_components/format";

type UploadedVideo = { url: string; bytes: number; durationMs: number | null; width: number | null; height: number | null; name: string };
type UploadedCover = { url: string; name: string };

function upload(kind: "video" | "cover", file: File, onProgress: (ratio: number) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/social/api/media");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        // keep empty
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(typeof body.error === "string" ? body.error : "storage_failed"));
    };
    xhr.onerror = () => reject(new Error("storage_failed"));
    xhr.send(form);
  });
}

function errorText(code: string): string {
  return SOCIAL_ERROR_COPY[code] ?? code;
}

export function VideoComposer({ connected }: { connected: SocialPlatform[] }) {
  const router = useRouter();
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [cover, setCover] = useState<UploadedCover | null>(null);
  const [progress, setProgress] = useState<{ kind: "video" | "cover"; ratio: number } | null>(null);
  const [title, setTitle] = useState("");
  const [baseCaption, setBaseCaption] = useState("");
  const [hashtagText, setHashtagText] = useState("#HashChat #통번역 #번역앱");
  const [selected, setSelected] = useState<SocialPlatform[]>(connected);
  const [overrides, setOverrides] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
  const [youtubePrivacy, setYoutubePrivacy] = useState("public");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hashtags = useMemo(() => normalizeHashtags(hashtagText), [hashtagText]);
  const captionOf = (platform: SocialPlatform) => overrides[platform] ?? composeCaption(platform, baseCaption, hashtags);

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress({ kind: "video", ratio: 0 });
    try {
      const body = await upload("video", file, (ratio) => setProgress({ kind: "video", ratio }));
      setVideo({
        url: String(body.url),
        bytes: Number(body.bytes),
        durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
        width: typeof body.width === "number" ? body.width : null,
        height: typeof body.height === "number" ? body.height : null,
        name: file.name,
      });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, YOUTUBE_TITLE_LIMIT));
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "storage_failed"));
    } finally {
      setProgress(null);
    }
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress({ kind: "cover", ratio: 0 });
    try {
      const body = await upload("cover", file, (ratio) => setProgress({ kind: "cover", ratio }));
      setCover({ url: String(body.url), name: file.name });
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "storage_failed"));
    } finally {
      setProgress(null);
    }
  }

  function toggle(platform: SocialPlatform) {
    setSelected((current) => (current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform]));
  }

  async function submit() {
    setError(null);
    if (!video) return setError(errorText("video_required"));
    if (!title.trim()) return setError(errorText("title_required"));
    if (selected.length === 0) return setError(errorText("no_platforms"));
    const tooLong = selected.find((p) => captionTooLong(p, captionOf(p)));
    if (tooLong) return setError(`${SOCIAL_PLATFORM_LABEL[tooLong]} 캡션이 ${SOCIAL_CAPTION_LIMIT[tooLong]}자를 넘습니다.`);
    setSubmitting(true);
    try {
      const response = await fetch("/admin/social/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          videoUrl: video.url,
          videoBytes: video.bytes,
          durationMs: video.durationMs,
          width: video.width,
          height: video.height,
          coverUrl: cover?.url ?? null,
          hashtags,
          targets: SOCIAL_PLATFORMS.filter((p) => selected.includes(p)).map((platform) => ({
            platform,
            caption: captionOf(platform),
            options: platform === "tiktok" ? { privacy: tiktokPrivacy } : platform === "youtube" ? { privacy: youtubePrivacy } : undefined,
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { videoId?: string; error?: string; platform?: SocialPlatform | null };
      if (!response.ok || !body.videoId) {
        const where = body.platform ? `${SOCIAL_PLATFORM_LABEL[body.platform]}: ` : "";
        throw new Error(`${where}${errorText(body.error ?? "storage_failed")}`);
      }
      router.push(`/admin/social/${body.videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "게시에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const warnings: string[] = [];
  if (video && video.width && video.height && !isVertical916(video.width, video.height)) warnings.push(`9:16이 아닙니다 (${video.width}×${video.height}). 쇼츠·릴스에서 잘릴 수 있습니다.`);
  if (video?.durationMs && video.durationMs >= 15_000) warnings.push(`길이 ${(video.durationMs / 1000).toFixed(1)}초 — 15초 미만을 권장합니다.`);

  return (
    <div className="space-y-4">
      <AdminCard>
        <p className={adminLabelClassName}>영상 (mp4, 9:16, 15초 미만 권장)</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-all">{video ? `${video.name} · ${(video.bytes / 1024 / 1024).toFixed(1)}MB${video.durationMs ? ` · ${(video.durationMs / 1000).toFixed(1)}초` : ""}` : "영상 파일 선택"}</span>
          <input accept="video/mp4" className="sr-only" disabled={progress !== null} onChange={(e) => void onVideo(e.target.files?.[0])} type="file" />
        </label>
        {progress?.kind === "video" ? <p className="mt-2 text-sm text-slate-500">업로드 중 {Math.round(progress.ratio * 100)}%</p> : null}
        {video ? <video className="mt-3 max-h-80 rounded-lg bg-black" controls muted playsInline src={video.url} /> : null}
        {warnings.map((w) => (
          <p key={w} className="mt-2 text-sm text-amber-700">{w}</p>
        ))}

        <p className={`${adminLabelClassName} mt-4`}>커버 이미지 (선택, JPG 권장)</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-all">{cover ? cover.name : "커버 이미지 선택"}</span>
          <input accept="image/jpeg,image/png" className="sr-only" disabled={progress !== null} onChange={(e) => void onCover(e.target.files?.[0])} type="file" />
        </label>
        {progress?.kind === "cover" ? <p className="mt-2 text-sm text-slate-500">업로드 중 {Math.round(progress.ratio * 100)}%</p> : null}
        <p className="mt-1 text-xs text-slate-500">인스타그램(JPG)·유튜브에만 쓰입니다. 쓰레드·틱톡은 API로 커버 이미지를 받지 않습니다.</p>
      </AdminCard>

      <AdminCard>
        <label className={adminLabelClassName} htmlFor="social-title">제목 (유튜브 제목, {YOUTUBE_TITLE_LIMIT}자)</label>
        <input className={adminInputClassName} id="social-title" maxLength={YOUTUBE_TITLE_LIMIT} onChange={(e) => setTitle(e.target.value)} value={title} />
        <label className={`${adminLabelClassName} mt-4`} htmlFor="social-caption">기본 캡션</label>
        <textarea className={adminTextareaClassName} id="social-caption" onChange={(e) => setBaseCaption(e.target.value)} value={baseCaption} />
        <label className={`${adminLabelClassName} mt-4`} htmlFor="social-tags">해시태그</label>
        <input className={adminInputClassName} id="social-tags" onChange={(e) => setHashtagText(e.target.value)} value={hashtagText} />
        <p className="mt-1 text-xs text-slate-500">쓰레드는 주제 태그를 하나만 받아 첫 번째만 붙입니다.</p>
      </AdminCard>

      <AdminCard>
        <p className="mb-2 text-sm font-semibold text-slate-800">올릴 곳과 플랫폼별 캡션</p>
        <ul className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            const isConnected = connected.includes(platform);
            const isSelected = selected.includes(platform);
            const caption = captionOf(platform);
            const over = captionTooLong(platform, caption);
            return (
              <li key={platform} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <label className="flex min-h-11 items-center gap-3">
                  <input checked={isSelected} className="h-5 w-5" disabled={!isConnected} onChange={() => toggle(platform)} type="checkbox" />
                  <span className="font-medium text-slate-900">{SOCIAL_PLATFORM_LABEL[platform]}</span>
                  {!isConnected ? (
                    <Link className="text-sm font-semibold text-sky-700" href="/admin/social/accounts">연결 필요</Link>
                  ) : null}
                </label>
                {isConnected && isSelected ? (
                  <div className="mt-2">
                    <textarea
                      aria-label={`${SOCIAL_PLATFORM_LABEL[platform]} 캡션`}
                      className={adminTextareaClassName}
                      onChange={(e) => setOverrides((o) => ({ ...o, [platform]: e.target.value }))}
                      value={caption}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className={over ? "font-semibold text-rose-700" : "text-slate-500"}>{[...caption].length} / {SOCIAL_CAPTION_LIMIT[platform]}</span>
                      {overrides[platform] !== undefined ? (
                        <button
                          className="inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-sky-700"
                          onClick={() => setOverrides((o) => ({ ...o, [platform]: undefined }))}
                          type="button"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          기본 캡션으로
                        </button>
                      ) : null}
                    </div>
                    {platform === "tiktok" ? (
                      <>
                        <label className={`${adminLabelClassName} mt-2`} htmlFor="tiktok-privacy">공개 범위</label>
                        <select className={adminInputClassName} id="tiktok-privacy" onChange={(e) => setTiktokPrivacy(e.target.value)} value={tiktokPrivacy}>
                          <option value="PUBLIC_TO_EVERYONE">전체 공개</option>
                          <option value="FOLLOWER_OF_CREATOR">팔로워</option>
                          <option value="MUTUAL_FOLLOW_FRIENDS">친구</option>
                          <option value="SELF_ONLY">나만 보기</option>
                        </select>
                        <p className="mt-1 text-xs text-slate-500">틱톡 앱 심사(audit) 전에는 나만 보기로만 올라갑니다. 계정이 허용하지 않는 범위면 나만 보기로 올립니다.</p>
                      </>
                    ) : null}
                    {platform === "youtube" ? (
                      <>
                        <label className={`${adminLabelClassName} mt-2`} htmlFor="youtube-privacy">공개 범위</label>
                        <select className={adminInputClassName} id="youtube-privacy" onChange={(e) => setYoutubePrivacy(e.target.value)} value={youtubePrivacy}>
                          <option value="public">공개</option>
                          <option value="unlisted">일부 공개</option>
                          <option value="private">비공개</option>
                        </select>
                        <p className="mt-1 text-xs text-slate-500">구글 API 감사 전 프로젝트에서 올린 영상은 유튜브가 비공개로 잠급니다.</p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AdminCard>

      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}
      <AdminButton block disabled={submitting || progress !== null || !video} onClick={() => void submit()} variant="primary">
        <Send className="h-4 w-4" aria-hidden="true" />
        {submitting ? "보내는 중…" : `선택한 ${selected.length}곳에 게시`}
      </AdminButton>
    </div>
  );
}
