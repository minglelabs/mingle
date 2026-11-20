"use client";

import { Check, ChevronsLeft, ChevronsRight, Loader2, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveSelfieVerifyCopy, type SelfieVerifyCopy } from "@/i18n/selfie-verify-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { resolveFirstMessageGateCopy } from "@/i18n/first-message-gate-copy";
import { uploadProfilePhotoWithFaceCheck } from "@/lib/profile-photo-upload";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import {
  advanceLiveness,
  initialLivenessState,
  isSameFace,
  MIN_PHOTO_FACE_WIDTH,
  TURN_GAUGE_TARGET,
  turnGaugePosition,
  type LivenessHint,
  type LivenessState,
  type LivenessStep,
} from "@/lib/selfie-liveness";
import { useNativeBannerSuppression } from "@/lib/use-native-banner-suppression";

type HumanModule = typeof import("@vladmandic/human");
type HumanInstance = InstanceType<HumanModule["Human"]>;
type Phase = "intro" | "loading" | "camera" | "comparing" | "passed" | "mismatch" | "failed" | "need_photo" | "camera_denied" | "unsupported";

/** Free face models (Human, MIT), served from this site; nothing is fetched from elsewhere. */
const MODEL_PATH = "/models/human/";
const FRAME_INTERVAL_MS = 120;
const LIVENESS_TIMEOUT_MS = 45_000;

let humanPromise: Promise<HumanInstance> | null = null;

function loadHuman(): Promise<HumanInstance> {
  humanPromise ??= import("@vladmandic/human").then(async ({ Human }) => {
    const human = new Human({
      modelBasePath: `${window.location.origin}${MODEL_PATH}`,
      backend: "webgl",
      // The first detection compiles the GPU shaders (11 to 13 s on a Galaxy S9
      // and an iPhone 11 Pro); warming up does it behind the "Getting ready" spinner.
      warmup: "face",
      cacheSensitivity: 0,
      debug: false,
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 2, minConfidence: 0.5, return: false },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        attention: { enabled: false },
        gear: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
      filter: { enabled: true, flip: false },
    });
    await human.load();
    await human.warmup();
    return human;
  }).catch((error) => {
    humanPromise = null;
    throw error;
  });
  return humanPromise;
}

function hintText(copy: SelfieVerifyCopy, hint: LivenessHint): string {
  switch (hint) {
    case "no_face": return copy.noFace;
    case "one_face": return copy.oneFace;
    case "closer": return copy.closer;
    case "turn_left": return copy.turnLeft;
    case "turn_right": return copy.turnRight;
    case "return": return copy.returnCenter;
    case "done": return copy.comparing;
    default: return copy.center;
  }
}

/**
 * The face description of the account's own profile photo, read through the
 * server (the photo may live on another host). "small" when the face is too
 * small to compare reliably.
 */
async function profilePhotoEmbedding(human: HumanInstance): Promise<number[] | "small" | null> {
  const response = await fetch(buildClientApiPath("/profile/image/face-check"), { cache: "no-store" });
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = await human.detect(canvas);
    const face = [...result.face].sort((a, b) => (b.boxRaw[2] ?? 0) - (a.boxRaw[2] ?? 0))[0];
    if (!face?.embedding?.length) return null;
    return (face.boxRaw[2] ?? 0) < MIN_PHOTO_FACE_WIDTH ? "small" : face.embedding;
  } finally {
    bitmap.close();
  }
}

/**
 * The optional selfie check: the front camera, a head turned both ways, and
 * the face compared with the profile photo, all on the phone. Passing gives
 * the profile a "verified" badge (POST /profile/face-verification).
 */
export default function SelfieVerifyScreen({
  locale,
  hasPhoto,
  onClose,
  onVerified,
  onPhotoUploaded,
}: {
  locale: string;
  /** Whether the account has a profile photo with a face to compare with. */
  hasPhoto: boolean;
  onClose: () => void;
  onVerified: () => void;
  /** A new profile photo was added from this screen (the "add a photo first" step). */
  onPhotoUploaded?: (image: string | null) => void;
}) {
  const copy = useMemo(() => resolveSelfieVerifyCopy(locale), [locale]);
  // The photo row's words are shared with the first-message setup sheet.
  const photoCopy = useMemo(() => resolveFirstMessageGateCopy(locale), [locale]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "busy" | "no_face" | "failed">("idle");
  const [phase, setPhase] = useState<Phase>(hasPhoto ? "intro" : "need_photo");
  const [hint, setHint] = useState<LivenessHint>("center");
  const [step, setStep] = useState<LivenessStep>("center");
  /** Head position on the gauge, -1 (left) to 1 (right), as seen in the mirrored preview. */
  const [gauge, setGauge] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  useNativeBannerSuppression(true);

  const stopCamera = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const finishWith = useCallback(async (human: HumanInstance, state: LivenessState) => {
    setPhase("comparing");
    stopCamera();
    try {
      const photo = await profilePhotoEmbedding(human);
      if (photo === null || photo === "small") {
        // No face in the profile photo, or too small to compare: ask for a clearer one.
        setPhase(photo === "small" ? "mismatch" : "need_photo");
        return;
      }
      if (!state.centerEmbedding) {
        setPhase("failed");
        return;
      }
      const similarity = human.match.similarity(state.centerEmbedding, photo);
      captureMingleClientEvent("mingle_selfie_verify", { step: "compared", similarity: Math.round(similarity * 100) / 100 });
      if (!isSameFace(similarity)) {
        setPhase("mismatch");
        return;
      }
      const response = await fetch(buildClientApiPath("/profile/face-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ similarity }),
      });
      if (!response.ok) {
        setPhase(response.status === 409 ? "need_photo" : "failed");
        return;
      }
      setPhase("passed");
      onVerified();
    } catch {
      setPhase("failed");
    }
  }, [onVerified, stopCamera]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    setPhase("loading");
    setHint("center");
    setStep("center");
    setGauge(0);
    captureMingleClientEvent("mingle_selfie_verify", { step: "started" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
    } catch {
      setPhase("camera_denied");
      return;
    }
    streamRef.current = stream;
    const run = ++runRef.current;
    let human: HumanInstance;
    try {
      human = await loadHuman();
    } catch {
      stopCamera();
      setPhase("unsupported");
      return;
    }
    if (run !== runRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    setPhase("camera");

    let state = initialLivenessState();
    const startedAt = Date.now();
    while (run === runRef.current) {
      if (Date.now() - startedAt > LIVENESS_TIMEOUT_MS) {
        stopCamera();
        setPhase("failed");
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const result = await human.detect(video);
        if (run !== runRef.current) return;
        const face = result.face[0];
        const next = advanceLiveness(state, {
          faces: result.face.length,
          yaw: face?.rotation?.angle?.yaw ?? null,
          faceWidth: face?.boxRaw?.[2] ?? 0,
          embedding: face?.embedding ?? null,
          score: face?.score ?? 0,
        });
        state = next.state;
        setHint(next.hint);
        setStep(state.step);
        if (face) setGauge(turnGaugePosition(face.rotation?.angle?.yaw ?? null));
        if (state.step === "done") {
          await finishWith(human, state);
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, FRAME_INTERVAL_MS));
    }
  }, [finishWith, stopCamera]);

  const close = useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  // No usable profile photo: add one right here (checked for a face on the phone), then start.
  const handlePhotoPicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoState("busy");
    const result = await uploadProfilePhotoWithFaceCheck(file);
    if (result.status !== "uploaded") {
      setPhotoState(result.status);
      return;
    }
    setPhotoState("idle");
    onPhotoUploaded?.(result.image);
    setPhase("intro");
  }, [onPhotoUploaded]);

  const message = phase === "need_photo"
    ? photoState === "no_face" ? photoCopy.photoNoFace : photoState === "failed" ? photoCopy.photoFailed : copy.needPhoto
    : phase === "camera_denied" ? copy.cameraDenied
      : phase === "unsupported" ? copy.unsupported
        : phase === "mismatch" ? copy.mismatch
          : phase === "failed" ? copy.failed
            : null;

  return (
    <div
      data-qa="selfie-verify"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-[240] flex flex-col bg-white text-gray-950"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="pl-2 text-[1rem] font-bold">{copy.title}</span>
        <button type="button" aria-label={copy.close} onClick={close} className="flex h-10 w-10 items-center justify-center rounded-full active:bg-gray-100">
          <X size={22} strokeWidth={2.2} />
        </button>
      </div>

      <div className="relative mx-auto mt-2 aspect-square w-[min(84vw,360px)] overflow-hidden rounded-full bg-gray-100">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
          style={{ transform: "scaleX(-1)", visibility: phase === "camera" ? "visible" : "hidden" }}
        />
        {phase === "camera" ? <TurnArrows step={step} /> : null}
        {phase === "loading" || phase === "comparing" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={34} className="animate-spin text-gray-400" aria-label={copy.loading} />
          </div>
        ) : phase === "passed" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-600">
            <ShieldCheck size={72} strokeWidth={1.8} aria-hidden />
          </div>
        ) : null}
      </div>

      {phase === "camera" ? <TurnGauge step={step} position={gauge} /> : null}

      <div className="mx-auto mt-6 w-full max-w-[400px] flex-1 px-6 text-center">
        {phase === "intro" ? (
          <>
            <p className="text-[0.95rem] leading-relaxed text-gray-700">{copy.body}</p>
            <p className="mt-3 text-[0.8rem] text-gray-500">{copy.privacy}</p>
          </>
        ) : phase === "camera" ? (
          <p data-qa="selfie-verify-hint" data-hint={hint} className="text-[1.15rem] font-bold">{hintText(copy, hint)}</p>
        ) : phase === "loading" ? (
          <p className="text-[0.95rem] text-gray-600">{copy.loading}</p>
        ) : phase === "comparing" ? (
          <p className="text-[0.95rem] text-gray-600">{copy.comparing}</p>
        ) : phase === "passed" ? (
          <>
            <p className="text-[1.25rem] font-extrabold">{copy.passed}</p>
            <p className="mt-2 text-[0.92rem] text-gray-600">{copy.passedBody}</p>
          </>
        ) : message ? (
          <p data-qa="selfie-verify-message" className="text-[0.95rem] leading-relaxed text-gray-800">{message}</p>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-[400px] px-6">
        {phase === "intro" || phase === "mismatch" || phase === "failed" ? (
          <button
            type="button"
            data-qa="selfie-verify-start"
            onClick={() => void start()}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#F97316] text-[1rem] font-extrabold text-white active:scale-[0.985]"
          >
            {phase === "intro" ? copy.start : copy.retry}
          </button>
        ) : phase === "need_photo" ? (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhotoPicked(event)} />
            <button
              type="button"
              data-qa="selfie-verify-add-photo"
              disabled={photoState === "busy"}
              onClick={() => photoInputRef.current?.click()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] text-[1rem] font-extrabold text-white active:scale-[0.985] disabled:opacity-60"
            >
              {photoState === "busy" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
              {photoState === "busy" ? photoCopy.photoChecking : photoCopy.photoAction}
            </button>
            <button type="button" onClick={close} className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl text-[0.95rem] font-bold text-gray-500 active:bg-gray-100">
              {copy.close}
            </button>
          </>
        ) : phase === "passed" || phase === "camera_denied" || phase === "unsupported" ? (
          <button
            type="button"
            onClick={close}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-gray-950 text-[1rem] font-extrabold text-white active:scale-[0.985]"
          >
            {copy.close}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const LEFT_DONE: readonly LivenessStep[] = ["turn_right", "return", "done"];
const RIGHT_DONE: readonly LivenessStep[] = ["return", "done"];

/** Arrows on the side to turn toward, and a check on each side already done. */
function TurnArrows({ step }: { step: LivenessStep }) {
  const side = (which: "left" | "right") => {
    const active = step === (which === "left" ? "turn_left" : "turn_right");
    const done = (which === "left" ? LEFT_DONE : RIGHT_DONE).includes(step);
    if (!active && !done) return null;
    const Icon = which === "left" ? ChevronsLeft : ChevronsRight;
    return (
      <div
        data-qa={`selfie-verify-arrow-${which}`}
        data-state={done ? "done" : "active"}
        className={`absolute inset-y-0 ${which === "left" ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l"} flex w-[28%] items-center ${which === "left" ? "justify-start pl-2" : "justify-end pr-2"} ${done ? "from-emerald-600/70" : "from-[#F97316]/80"} to-transparent`}
      >
        {done ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <Check size={24} strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <Icon size={46} strokeWidth={2.6} className="animate-pulse text-white drop-shadow" aria-hidden />
        )}
      </div>
    );
  };
  return (
    <>
      {side("left")}
      {side("right")}
    </>
  );
}

/**
 * How far the head is turned: a dot on a bar, with the target mark on each
 * side. The side to reach now is orange; a side reached turns green.
 */
function TurnGauge({ step, position }: { step: LivenessStep; position: number }) {
  const toPercent = (value: number) => `${50 + value * 50}%`;
  const target = TURN_GAUGE_TARGET;
  const leftDone = LEFT_DONE.includes(step);
  const rightDone = RIGHT_DONE.includes(step);
  const reached = (step === "turn_left" && position <= -target) || (step === "turn_right" && position >= target);
  return (
    <div data-qa="selfie-verify-gauge" className="relative mx-auto mt-5 h-8 w-[min(76vw,320px)]" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-200" />
      {/* The stretch to cover on each side, from the middle to its target mark. */}
      <div
        className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-l-full ${leftDone ? "bg-emerald-500" : step === "turn_left" ? "bg-[#F97316]/70" : "bg-gray-100"}`}
        style={{ left: toPercent(-target), width: `${target * 50}%` }}
      />
      <div
        className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-r-full ${rightDone ? "bg-emerald-500" : step === "turn_right" ? "bg-[#F97316]/70" : "bg-gray-100"}`}
        style={{ left: "50%", width: `${target * 50}%` }}
      />
      {/* Target marks and the middle. */}
      <div className="absolute top-0 h-8 w-1 -translate-x-1/2 rounded-full bg-gray-500" style={{ left: toPercent(-target) }} />
      <div className="absolute top-0 h-8 w-1 -translate-x-1/2 rounded-full bg-gray-500" style={{ left: toPercent(target) }} />
      <div className="absolute top-2 h-4 w-0.5 -translate-x-1/2 bg-gray-300" style={{ left: "50%" }} />
      {/* Where the head is now. */}
      <div
        data-qa="selfie-verify-gauge-dot"
        className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-[left] duration-150 ${reached ? "bg-emerald-500" : "bg-[#F97316]"}`}
        style={{ left: toPercent(position) }}
      />
    </div>
  );
}
