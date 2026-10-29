import type { ConversationExportCopy } from "@/i18n/conversation-export-copy";

export type ConversationExportMessage = {
  createdAt: Date;
  speakerName: string | null;
  sourceLanguage: string;
  sourceText: string;
  // Final translations by language tag.
  translations: Record<string, string>;
  hasImage: boolean;
};

export type ConversationExportTranscript = {
  title: string;
  participantNames: string[];
  messages: ConversationExportMessage[];
};

function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] || "";
}

// The translation shown to a reader of `language`: the exact tag first, then
// any tag with the same base language (so "zh-TW" text still reads under "zh").
// Nothing when the message was already written in that language.
export function pickExportTranslation(
  message: Pick<ConversationExportMessage, "sourceLanguage" | "sourceText" | "translations">,
  language: string,
): string {
  const target = language.trim();
  if (!target) return "";
  if (message.sourceLanguage.trim().toLowerCase() === target.toLowerCase()) return "";

  const exact = Object.entries(message.translations)
    .find(([tag]) => tag.toLowerCase() === target.toLowerCase())?.[1]?.trim();
  const translation = exact || Object.entries(message.translations)
    .find(([tag]) => baseLanguage(tag) === baseLanguage(target))?.[1]?.trim() || "";

  return translation && translation !== message.sourceText.trim() ? translation : "";
}

export function resolveExportTimeZone(value: string | null | undefined): string {
  const candidate = (value || "").trim();
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

// "2026-10-29 14:03" in the reader's time zone, the same in every locale so
// the file sorts and reads the same everywhere.
export function formatExportTimestamp(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function indent(text: string): string {
  return text.split(/\r?\n/).map((line) => `  ${line}`).join("\n");
}

export function formatConversationExportText(args: {
  transcript: ConversationExportTranscript;
  copy: ConversationExportCopy;
  displayLanguage: string;
  timeZone: string;
  exportedAt: Date;
}): string {
  const { transcript, copy, displayLanguage, timeZone } = args;
  const header = [
    copy.fileHeading,
    `${copy.roomLabel}: ${transcript.title}`,
    ...(transcript.participantNames.length > 0
      ? [`${copy.participantsLabel}: ${transcript.participantNames.join(", ")}`]
      : []),
    `${copy.exportedAtLabel}: ${formatExportTimestamp(args.exportedAt, timeZone)} (${timeZone})`,
  ].join("\n");

  const blocks = transcript.messages.flatMap((message) => {
    const sourceText = message.sourceText.trim();
    const body = sourceText || (message.hasImage ? copy.photoPlaceholder : "");
    if (!body) return [];

    const lines = [
      `[${formatExportTimestamp(message.createdAt, timeZone)}] ${message.speakerName?.trim() || copy.unknownSpeaker}`,
      body,
    ];
    const translation = sourceText ? pickExportTranslation(message, displayLanguage) : "";
    if (translation) {
      lines.push(indent(`(${displayLanguage}) ${translation}`));
    }
    return [lines.join("\n")];
  });

  return `${[header, ...blocks].join("\n\n")}\n`;
}

// "HashChat-<title>-20261029.txt", with characters file systems reject removed.
export function buildConversationExportFileName(title: string, exportedAt: Date, timeZone: string): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  const day = formatExportTimestamp(exportedAt, timeZone).slice(0, 10).replace(/-/g, "");
  return `HashChat-${safeTitle || "chat"}-${day}.txt`;
}
