import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  TRANSLATION_MODEL_NOTICE_INTERVAL_MS,
  notifyTranslationModelUnavailable,
  resetTranslationModelNoticeForTest,
} from "@/lib/translation-model-notice";
import { resolveTranslationModelUnavailableCopy } from "@/i18n/translation-model-unavailable-copy";

describe("translation model notice", () => {
  beforeEach(() => {
    toastMock.mockClear();
    resetTranslationModelNoticeForTest();
  });

  it("names the model once per interval", () => {
    expect(notifyTranslationModelUnavailable("claude-haiku-5-5", 1_000)).toBe(true);
    expect(notifyTranslationModelUnavailable("claude-haiku-5-5", 2_000)).toBe(false);
    expect(notifyTranslationModelUnavailable("claude-haiku-5-5", 1_000 + TRANSLATION_MODEL_NOTICE_INTERVAL_MS)).toBe(true);
    expect(toastMock).toHaveBeenCalledTimes(2);
  });

  it("says only which model failed, never why", () => {
    const copy = resolveTranslationModelUnavailableCopy("ko", "claude-haiku-5-5");
    expect(copy).toBe("지금 Claude Haiku 5.5 모델에 오류가 있어 다른 모델로 번역하고 있어요.");
    expect(copy).not.toMatch(/결제|크레딧/);
  });
});
