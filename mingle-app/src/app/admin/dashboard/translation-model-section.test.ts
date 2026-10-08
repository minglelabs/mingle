import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTranslationModelSeries, startOfDayUtc } from "@/lib/admin-dashboard-metrics";
import { TRANSLATION_MODEL_OPTIONS } from "@/lib/translation-models";

// A plain function, not vi.fn(): a vi.fn() records the promises it returns by attaching
// handlers to them, which would hide the unhandled rejection the guard test looks for.
const loader = vi.hoisted(() => ({
  calls: [] as unknown[][],
  implementation: (): Promise<unknown> => Promise.resolve([]),
}));
vi.mock("@/lib/admin-dashboard-query", () => ({
  loadTranslationModelMessageSeries: (...args: unknown[]) => {
    loader.calls.push(args);
    return loader.implementation();
  },
}));

import {
  TranslationModelSection,
  TranslationModelSectionFallback,
  resolveTranslationModelColor,
  startTranslationModelSeriesLoad,
} from "./translation-model-section";

const dayKeys = ["2026-08-02", "2026-08-03", "2026-08-04"];
const range = { dayKeys, rangeStart: startOfDayUtc(dayKeys[0]), rangeEnd: startOfDayUtc("2026-08-05") };
const ERROR_MESSAGE = "번역 모델별 데이터를 불러오지 못했습니다.";

afterEach(() => {
  vi.restoreAllMocks();
  loader.calls = [];
  loader.implementation = () => Promise.resolve([]);
});

describe("resolveTranslationModelColor", () => {
  it("gives every selectable model its own fixed colour and 기타 the neutral gray", () => {
    expect(TRANSLATION_MODEL_OPTIONS.map((option) => resolveTranslationModelColor(option.value))).toEqual([
      "#2a78d6",
      "#eb6834",
      "#1baf7a",
      "#8b5cf6",
      "#e0457b",
    ]);
    expect(resolveTranslationModelColor("other")).toBe("#898781");
  });
});

describe("TranslationModelSection", () => {
  it("renders the chart with each series in its model colour", async () => {
    const series = buildTranslationModelSeries([
      { day: "2026-08-02", model: "gpt-6-luna", value: 4 },
      { day: "2026-08-03", model: "retired-model", value: 1 },
    ], dayKeys);

    const html = renderToStaticMarkup(await TranslationModelSection({ seriesPromise: Promise.resolve(series), dayKeys }));

    expect(html).toContain('aria-label="번역 모델별 메시지수 일별 추이"');
    expect(html).toContain('stroke="#8b5cf6" stroke-width="2"');
    expect(html).toContain('stroke="#898781" stroke-width="2"');
    expect(html).toContain("(80.0%)");
    expect(html).not.toContain(ERROR_MESSAGE);
  });

  it("shows the empty state, not the error, when nothing was translated", async () => {
    const html = renderToStaticMarkup(await TranslationModelSection({ seriesPromise: Promise.resolve([]), dayKeys }));

    expect(html).toContain("번역된 메시지 없음");
    expect(html).not.toContain(ERROR_MESSAGE);
  });

  it("contains a failed load: logs it and shows the error inside the card instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("db unavailable");

    const html = renderToStaticMarkup(await TranslationModelSection({ seriesPromise: Promise.reject(failure), dayKeys }));

    expect(consoleError).toHaveBeenCalledWith("[admin-dashboard] translation_model_series_failed", failure);
    expect(html).toContain('role="alert"');
    expect(html).toContain(ERROR_MESSAGE);
    expect(html).toContain('viewBox="-4 -8 1272 170"');
  });
});

describe("TranslationModelSectionFallback", () => {
  it("is a loading card with the chart's own frame", async () => {
    const fallback = renderToStaticMarkup(TranslationModelSectionFallback());
    const chart = renderToStaticMarkup(await TranslationModelSection({ seriesPromise: Promise.resolve([]), dayKeys }));
    const viewBox = (html: string) => html.match(/viewBox="([^"]+)"/)?.[1];

    expect(fallback).toContain('role="status"');
    expect(fallback).toContain("불러오는 중...");
    expect(fallback).toContain("번역 모델별 메시지수");
    expect(viewBox(fallback)).toBe(viewBox(chart));
  });
});

describe("startTranslationModelSeriesLoad", () => {
  it("starts the live query for the range and platform without awaiting it", async () => {
    const series = buildTranslationModelSeries([{ day: "2026-08-02", model: "gpt-6-luna", value: 1 }], dayKeys);
    loader.implementation = () => Promise.resolve(series);

    const started = startTranslationModelSeriesLoad(range, "ios");

    expect(loader.calls).toEqual([[range, { platform: "ios" }]]);
    await expect(started).resolves.toBe(series);
  });

  it("does not leave a failure that lands before the section awaits it unhandled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      loader.implementation = () => Promise.reject(new Error("timeout"));

      const started = startTranslationModelSeriesLoad(range, "all");
      // Let the rejection settle, as it would while the page still awaits its metrics.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
      const html = renderToStaticMarkup(await TranslationModelSection({ seriesPromise: started, dayKeys }));
      expect(html).toContain(ERROR_MESSAGE);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
