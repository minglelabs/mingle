"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatHandle } from "@/lib/handles";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import ChatBubble, { type Utterance } from "@/components/LivePhoneDemo/ChatBubble";
import DirectMessageLanguageSheet from "@/components/direct-message-language-sheet";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import type { SttLanguageCode } from "@/lib/stt-languages";
import { ChevronLeft, Languages, Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

type DirectMessageScreenProps = {
  dictionary: AppDictionary;
  locale: AppLocale;
  conversationId: string;
};

type DirectMessageAuthor = {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
};

type DirectMessage = {
  id: string;
  clientMessageId: string | null;
  originalText: string;
  sourceLanguage: string;
  translations: Record<string, string>;
  createdAt: string;
  sender: DirectMessageAuthor | null;
  isMine: boolean;
  isPending?: boolean;
  hasFailed?: boolean;
};

const POLL_INTERVAL_MS = 4000;
const TEXT_MAX_LENGTH = 4000;

function getCopy(locale: AppLocale) {
  const isKorean = locale === "ko";
  return {
    back: isKorean ? "뒤로가기" : "Back",
    userFallback: isKorean ? "Mingle 사용자" : "Mingle user",
    loadError: isKorean ? "대화를 불러오지 못했습니다." : "Could not load this conversation.",
    sendError: isKorean ? "전송하지 못했습니다. 다시 시도해 주세요." : "Could not send. Tap to retry.",
    empty: isKorean ? "첫 메시지를 보내보세요." : "Send the first message.",
    placeholder: isKorean ? "메시지 입력" : "Message",
    send: isKorean ? "보내기" : "Send",
    loading: isKorean ? "불러오는 중" : "Loading",
    addLanguage: isKorean ? "언어 추가" : "Add language",
    languageSheetTitle: isKorean ? "번역 언어" : "Translation languages",
    languageSheetDescription: isKorean
      ? "선택한 언어로 상대의 메시지가 함께 번역돼요. 가입할 때 고른 언어는 기본으로 포함돼요."
      : "Messages from others are also translated into the languages you pick here. Your signup language is included by default.",
    languageSheetDone: isKorean ? "완료" : "Done",
    defaultLanguageBadge: isKorean ? "기본 " : "Default: ",
    close: isKorean ? "닫기" : "Close",
  };
}

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dm_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Maps a stored DM into the same shape the interpreter room's bubble reads, so
 * a message gets the identical original/translation toggle affordance. */
function toUtterance(message: DirectMessage, senderLabel: string): Utterance {
  return {
    id: message.clientMessageId || message.id,
    speaker: senderLabel,
    originalText: message.originalText,
    originalLang: message.sourceLanguage,
    translations: message.translations,
    targetLanguages: Object.keys(message.translations),
    createdAtMs: Date.parse(message.createdAt) || undefined,
  };
}

type DirectMessageRowProps = {
  message: DirectMessage;
  locale: AppLocale;
  userFallbackLabel: string;
  sendErrorLabel: string;
  onOpenProfile: (userId: string) => void;
  onRetry: (message: DirectMessage) => void;
};

function DirectMessageRow({
  message,
  locale,
  userFallbackLabel,
  sendErrorLabel,
  onOpenProfile,
  onRetry,
}: DirectMessageRowProps) {
  const senderName = message.isMine
    ? userFallbackLabel
    : (message.sender?.name?.trim() || userFallbackLabel);
  const avatarSrc = message.isMine ? null : message.sender?.image ?? null;
  const senderId = message.sender?.id;

  return (
    <li>
      <div className={`flex ${message.isMine ? "flex-row-reverse" : ""}`}>
        <ChatBubble
          utterance={toUtterance(message, senderName)}
          uiLocale={locale}
          isDraft={message.isPending}
          avatarSrc={avatarSrc}
          avatarAlt={senderName}
          shouldAnimateEntrance={false}
          onAvatarClick={senderId ? () => onOpenProfile(senderId) : undefined}
        />
      </div>
      {message.hasFailed ? (
        <div className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mr-1 mt-0.5 text-[11px] font-semibold text-red-500"
          >
            {sendErrorLabel}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export default function DirectMessageScreen({
  dictionary,
  locale,
  conversationId,
}: DirectMessageScreenProps) {
  const router = useRouter();
  const copy = useMemo(() => getCopy(locale), [locale]);
  const languageSelectorCopy = useMemo(
    () => resolveLivePhoneDemoRoomManagementCopy(locale),
    [locale],
  );

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [partner, setPartner] = useState<DirectMessageAuthor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isSavingLanguages, setIsSavingLanguages] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesPath = useMemo(
    () => buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/messages`),
    [conversationId],
  );
  const displayLanguagesPath = useMemo(
    () => buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/display-languages`),
    [conversationId],
  );

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  const loadMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    try {
      const response = await fetch(messagesPath, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const payload = await response.json() as {
        messages?: DirectMessage[];
        partner?: DirectMessageAuthor | null;
      };
      setPartner(payload.partner ?? null);
      // Server rows replace confirmed history but must not drop the optimistic
      // rows still waiting for their POST to come back.
      setMessages((current) => {
        const serverMessages = Array.isArray(payload.messages) ? payload.messages : [];
        const confirmedClientIds = new Set(
          serverMessages.map((message) => message.clientMessageId).filter(Boolean),
        );
        const stillPending = current.filter((message) => (
          (message.isPending || message.hasFailed)
          && !confirmedClientIds.has(message.clientMessageId)
        ));
        return [...serverMessages, ...stillPending];
      });
      setLoadError(false);
    } catch {
      if (!options?.silent) setLoadError(true);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [messagesPath]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Simplest workable delivery: poll while the room is open and visible.
  // This is the seam a realtime channel replaces later.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadMessages({ silent: true });
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const openLanguageSheet = useCallback(async () => {
    setIsLanguageSheetOpen(true);
    try {
      const response = await fetch(displayLanguagesPath, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { displayLanguages?: string[]; defaultLanguage?: string };
      const nextDefault = payload.defaultLanguage || "";
      setDefaultLanguage(nextDefault);
      // The signup language is only a starting suggestion, pre-checked the
      // first time this member has nothing saved yet. Once they've saved a
      // selection — even one that drops the signup language — that choice
      // is respected instead of forcing the default back in.
      const existing = Array.isArray(payload.displayLanguages) ? payload.displayLanguages : [];
      setSelectedLanguages(existing.length > 0 ? existing : (nextDefault ? [nextDefault] : []));
    } catch {
      // Sheet stays open with whatever was already selected; saving will
      // just retry the network call.
    }
  }, [displayLanguagesPath]);

  const toggleLanguage = useCallback((code: SttLanguageCode) => {
    setSelectedLanguages((current) => (
      current.includes(code)
        ? current.filter((language) => language !== code)
        : [...current, code]
    ));
  }, []);

  const closeLanguageSheet = useCallback(async () => {
    setIsSavingLanguages(true);
    try {
      await fetch(displayLanguagesPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayLanguages: selectedLanguages }),
      });
    } catch {
      // Best-effort: the sheet still closes, and reopening it re-fetches
      // whatever actually made it to the server.
    } finally {
      setIsSavingLanguages(false);
      setIsLanguageSheetOpen(false);
    }
  }, [displayLanguagesPath, selectedLanguages]);

  const sendMessage = useCallback(async (text: string, clientMessageId: string) => {
    setMessages((current) => current.map((message) => (
      message.clientMessageId === clientMessageId
        ? { ...message, isPending: true, hasFailed: false }
        : message
    )));

    try {
      const response = await fetch(messagesPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, clientMessageId }),
      });
      if (!response.ok) throw new Error("send_failed");
      const payload = await response.json() as { message?: DirectMessage };
      if (!payload.message) throw new Error("send_failed");

      setMessages((current) => current.map((message) => (
        message.clientMessageId === clientMessageId
          ? { ...payload.message!, isPending: false, hasFailed: false }
          : message
      )));
    } catch {
      setMessages((current) => current.map((message) => (
        message.clientMessageId === clientMessageId
          ? { ...message, isPending: false, hasFailed: true }
          : message
      )));
    }
  }, [messagesPath]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    const clientMessageId = createClientMessageId();
    setMessages((current) => [...current, {
      id: clientMessageId,
      clientMessageId,
      originalText: text,
      sourceLanguage: "",
      translations: {},
      createdAt: new Date().toISOString(),
      sender: null,
      isMine: true,
      isPending: true,
    }]);
    setDraft("");
    setIsSending(true);
    try {
      await sendMessage(text, clientMessageId);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [draft, isSending, sendMessage]);

  const handleRetry = useCallback((message: DirectMessage) => {
    if (!message.clientMessageId || message.isPending) return;
    void sendMessage(message.originalText, message.clientMessageId);
  }, [sendMessage]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }, []);

  const partnerName = partner?.name?.trim() || copy.userFallback;
  const partnerHandle = partner?.handle ? formatHandle(partner.handle) : "";

  return (
    <div className="absolute inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-white text-slate-950">
      {profileUserId ? (
        <PublicUserProfileScreen
          dictionary={dictionary}
          locale={locale}
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      ) : null}

      {isLanguageSheetOpen ? (
        <DirectMessageLanguageSheet
          locale={locale}
          copy={{
            title: copy.languageSheetTitle,
            description: copy.languageSheetDescription,
            defaultLanguageBadge: copy.defaultLanguageBadge,
            done: copy.languageSheetDone,
            close: copy.close,
          }}
          selectorCopy={{
            searchPlaceholder: languageSelectorCopy.languageSelectorSearchPlaceholder,
            sortLocaleLabel: languageSelectorCopy.languageSelectorSortLocaleLabel,
            sortAlphabeticalLabel: languageSelectorCopy.languageSelectorSortAlphabeticalLabel,
            noResultsLabel: languageSelectorCopy.languageSelectorNoResultsLabel,
          }}
          defaultLanguage={defaultLanguage}
          selectedLanguages={selectedLanguages}
          onToggleLanguage={toggleLanguage}
          onClose={() => void closeLanguageSheet()}
          isSaving={isSavingLanguages}
        />
      ) : null}

      <header
        className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center border-b border-gray-100 px-4"
        style={{
          height: "calc(54px + env(safe-area-inset-top, 44px))",
          paddingTop: "env(safe-area-inset-top, 44px)",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full transition active:bg-gray-100"
          aria-label={copy.back}
        >
          <ChevronLeft size={25} strokeWidth={2.1} aria-hidden="true" />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-[17px] font-bold">{partnerName}</h1>
          {partnerHandle ? (
            <p className="truncate text-[12px] text-gray-500">{partnerHandle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void openLanguageSheet()}
          className="flex h-10 w-10 items-center justify-center justify-self-end rounded-full transition active:bg-gray-100"
          aria-label={copy.addLanguage}
        >
          <Languages size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" aria-label={copy.loading} />
          </div>
        ) : loadError ? (
          <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">
            {copy.loadError}
          </p>
        ) : messages.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">
            {copy.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((message) => (
              <DirectMessageRow
                key={message.clientMessageId || message.id}
                message={message}
                locale={locale}
                userFallbackLabel={copy.userFallback}
                sendErrorLabel={copy.sendError}
                onOpenProfile={setProfileUserId}
                onRetry={handleRetry}
              />
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-gray-100 px-3 py-2"
        style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, TEXT_MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-gray-200 px-3 py-2 text-[14px] leading-snug outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label={copy.send}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition active:bg-amber-600 disabled:opacity-40"
        >
          <SendHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
