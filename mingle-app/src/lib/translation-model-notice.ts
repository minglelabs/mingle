import { toast } from "sonner";
import { resolveTranslationModelUnavailableCopy } from "@/i18n/translation-model-unavailable-copy";

/** One notice per model per this long, however many translations fall back meanwhile. */
export const TRANSLATION_MODEL_NOTICE_INTERVAL_MS = 10 * 60 * 1000;

const lastShownAtByModel = new Map<string, number>();

function currentUiLocale(): string {
  if (typeof window === "undefined") return "en";
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
  return firstSegment || document.documentElement.lang || "en";
}

/**
 * Tells the user their chosen translation model is failing and another one is
 * translating instead. Returns whether a notice was shown.
 */
export function notifyTranslationModelUnavailable(model: string, now = Date.now()): boolean {
  const trimmed = model.trim();
  if (!trimmed) return false;
  const lastShownAt = lastShownAtByModel.get(trimmed);
  if (lastShownAt !== undefined && now - lastShownAt < TRANSLATION_MODEL_NOTICE_INTERVAL_MS) return false;
  lastShownAtByModel.set(trimmed, now);
  toast(resolveTranslationModelUnavailableCopy(currentUiLocale(), trimmed), {
    id: `translation-model-unavailable:${trimmed}`,
  });
  return true;
}

/** Test helper. */
export function resetTranslationModelNoticeForTest(): void {
  lastShownAtByModel.clear();
}
