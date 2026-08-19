"use client";

import type { AppDictionary, AppLocale } from "@/i18n";
import { formatHandle } from "@/lib/handles";
import { resolveLivePhoneDemoRoomManagementCopy } from "@/components/LivePhoneDemo/live-phone-demo.room-management-copy";
import ChatBubble, { type Utterance } from "@/components/LivePhoneDemo/ChatBubble";
import DirectMessageLanguageSheet from "@/components/direct-message-language-sheet";
import PublicUserProfileScreen from "@/components/public-user-profile-screen";
import useConversationDisplayLanguages from "@/components/use-conversation-display-languages";
import useConversationRealtime from "@/components/use-conversation-realtime";
import useDirectMessageThread, { type DirectMessage } from "@/components/use-direct-message-thread";
import useVoiceDictation from "@/components/use-voice-dictation";
import { ChevronLeft, Languages, Loader2, Mic, SendHorizontal, Square } from "lucide-react";
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
      ? "선택한 언어로 상대의 메시지가 함께 번역돼요. 가입할 때 고른 언어는 기본으로 띄워드려요."
      : "Messages from others are also translated into the languages you pick here. Your signup language is pre-selected to start.",
    languageSheetDone: isKorean ? "완료" : "Done",
    defaultLanguageBadge: isKorean ? "기본 " : "Default: ",
    close: isKorean ? "닫기" : "Close",
    startDictation: isKorean ? "음성으로 입력" : "Dictate",
    stopDictation: isKorean ? "받아쓰기 중지" : "Stop dictating",
    listening: isKorean ? "듣는 중… 말한 내용이 글로 적혀요" : "Listening… your words appear as text",
    dictationError: isKorean
      ? "음성을 인식하지 못했어요. 다시 시도해 주세요."
      : "Could not hear that. Please try again.",
  };
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

  const [draft, setDraft] = useState("");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Set while the draft is what the recognizer heard, so the message is sent
  // in the language actually spoken rather than the sender's signup language.
  const [dictatedLanguage, setDictatedLanguage] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const thread = useDirectMessageThread(conversationId);
  useConversationRealtime({ conversationId, onMessage: thread.refreshNow });
  const languages = useConversationDisplayLanguages({
    conversationId,
    // Adding a language backfills translations for messages already in the
    // thread, so the badges only appear once the thread is re-read.
    onSaved: thread.reload,
  });

  const handleDictationDraft = useCallback((nextDraft: string) => {
    setDraft(nextDraft.slice(0, TEXT_MAX_LENGTH));
  }, []);

  const dictation = useVoiceDictation({
    conversationId,
    onDraftChange: handleDictationDraft,
  });

  useEffect(() => {
    if (dictation.language) setDictatedLanguage(dictation.language);
  }, [dictation.language]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.messages]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || thread.isSending) return;

    // Discard anything still in flight from the recognizer, or a transcript
    // arriving after the send would repopulate the composer the user just
    // emptied.
    dictation.cancel();

    const spokenLanguage = dictatedLanguage;
    setDraft("");
    setDictatedLanguage("");
    try {
      await thread.send(text, spokenLanguage || undefined);
    } finally {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [dictatedLanguage, dictation, draft, thread]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }, []);

  const handleDraftTyped = useCallback((value: string) => {
    setDraft(value.slice(0, TEXT_MAX_LENGTH));
    // Typing makes the text no longer purely what was heard, so the recognizer's
    // language guess stops applying and the sender's own language takes over.
    setDictatedLanguage("");
    dictation.cancel();
  }, [dictation]);

  const partnerName = thread.partner?.name?.trim() || copy.userFallback;
  const partnerHandle = thread.partner?.handle ? formatHandle(thread.partner.handle) : "";

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

      {languages.isOpen ? (
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
          defaultLanguage={languages.defaultLanguage}
          selectedLanguages={languages.selectedLanguages}
          onToggleLanguage={languages.toggle}
          onClose={() => void languages.close()}
          isSaving={languages.isSaving}
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
          onClick={() => void languages.open()}
          className="flex h-10 w-10 items-center justify-center justify-self-end rounded-full transition active:bg-gray-100"
          aria-label={copy.addLanguage}
        >
          <Languages size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {thread.isLoading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" aria-label={copy.loading} />
          </div>
        ) : thread.loadError ? (
          <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">
            {copy.loadError}
          </p>
        ) : thread.messages.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">
            {copy.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.messages.map((message) => (
              <DirectMessageRow
                key={message.clientMessageId || message.id}
                message={message}
                locale={locale}
                userFallbackLabel={copy.userFallback}
                sendErrorLabel={copy.sendError}
                onOpenProfile={setProfileUserId}
                onRetry={thread.retry}
              />
            ))}
          </ul>
        )}
      </div>

      <div
        className="shrink-0 border-t border-gray-100"
        style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}
      >
        {dictation.isRecording ? (
          <p className="flex items-center gap-2 px-4 pt-2 text-[12px] font-medium text-amber-600" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            {copy.listening}
          </p>
        ) : dictation.error ? (
          <p className="px-4 pt-2 text-[12px] text-red-500" role="alert">
            {copy.dictationError}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex items-end gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => handleDraftTyped(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-gray-200 px-3 py-2 text-[14px] leading-snug outline-none focus:border-amber-400"
          />
          {dictation.isSupported ? (
            <button
              type="button"
              onClick={() => (dictation.isRecording ? dictation.stop() : dictation.start(draft))}
              aria-label={dictation.isRecording ? copy.stopDictation : copy.startDictation}
              aria-pressed={dictation.isRecording}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                dictation.isRecording
                  ? "bg-red-500 text-white active:bg-red-600"
                  : "bg-gray-100 text-slate-700 active:bg-gray-200"
              }`}
            >
              {dictation.isRecording
                ? <Square size={16} strokeWidth={2.4} aria-hidden="true" />
                : <Mic size={18} strokeWidth={2.2} aria-hidden="true" />}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!draft.trim() || thread.isSending}
            aria-label={copy.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition active:bg-amber-600 disabled:opacity-40"
          >
            <SendHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
