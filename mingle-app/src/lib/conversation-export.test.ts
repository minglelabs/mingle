import { describe, expect, it } from "vitest";
import { resolveConversationExportCopy } from "@/i18n/conversation-export-copy";
import {
  buildConversationExportFileName,
  formatConversationExportText,
  pickExportTranslation,
  resolveExportTimeZone,
  type ConversationExportTranscript,
} from "./conversation-export";

const transcript: ConversationExportTranscript = {
  title: "도쿄 여행",
  participantNames: ["남", "Yuki"],
  messages: [
    {
      createdAt: new Date("2026-10-28T12:03:00Z"),
      speakerName: "Yuki",
      sourceLanguage: "ja",
      sourceText: "明日何時に会う？",
      translations: { ko: "내일 몇 시에 만날까?", en: "What time tomorrow?" },
      hasImage: false,
    },
    {
      createdAt: new Date("2026-10-28T12:04:00Z"),
      speakerName: "남",
      sourceLanguage: "ko",
      sourceText: "10시 어때?",
      translations: { ja: "10時はどう？" },
      hasImage: false,
    },
    {
      createdAt: new Date("2026-10-28T12:05:00Z"),
      speakerName: null,
      sourceLanguage: "",
      sourceText: "",
      translations: {},
      hasImage: true,
    },
    {
      createdAt: new Date("2026-10-28T12:06:00Z"),
      speakerName: "Yuki",
      sourceLanguage: "ja",
      sourceText: "",
      translations: {},
      hasImage: false,
    },
  ],
};

describe("formatConversationExportText", () => {
  it("writes the header, each message, and only the reader's translation", () => {
    const text = formatConversationExportText({
      transcript,
      copy: resolveConversationExportCopy("ko"),
      displayLanguage: "ko",
      timeZone: "Asia/Seoul",
      exportedAt: new Date("2026-10-29T05:20:00Z"),
    });

    expect(text).toBe([
      "HashChat 대화 내보내기",
      "대화방: 도쿄 여행",
      "참여자: 남, Yuki",
      "내보낸 시각: 2026-10-29 14:20 (Asia/Seoul)",
      "",
      "[2026-10-28 21:03] Yuki",
      "明日何時に会う？",
      "  (ko) 내일 몇 시에 만날까?",
      "",
      "[2026-10-28 21:04] 남",
      "10시 어때?",
      "",
      "[2026-10-28 21:05] 알 수 없음",
      "[사진]",
      "",
    ].join("\n"));
  });
});

describe("pickExportTranslation", () => {
  it("falls back to a translation with the same base language", () => {
    expect(pickExportTranslation({ sourceLanguage: "en", sourceText: "Hi", translations: { "zh-TW": "嗨" } }, "zh")).toBe("嗨");
  });

  it("skips a translation identical to the original", () => {
    expect(pickExportTranslation({ sourceLanguage: "en", sourceText: "OK", translations: { ko: "OK" } }, "ko")).toBe("");
  });
});

describe("export helpers", () => {
  it("falls back to UTC for an unknown time zone", () => {
    expect(resolveExportTimeZone("Mars/Base")).toBe("UTC");
    expect(resolveExportTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("builds a file name without characters file systems reject", () => {
    expect(buildConversationExportFileName('a/b: "c"', new Date("2026-10-29T00:00:00Z"), "UTC"))
      .toBe("HashChat-a b c-20261029.txt");
  });
});
