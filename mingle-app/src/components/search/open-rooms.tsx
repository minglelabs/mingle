"use client";

// Explore's open rooms: every public room, one per row, with what is going on in it
// (voice talk, Hash Rush, or plain chat). Rooms the viewer is in come first. A room
// with a password asks for it before a new person gets in. The same list, narrowed
// by title or topic, is the "Open rooms" part of the search results.

import { Gamepad2, Loader2, Lock, MessageCircle, Phone, Plus, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import LanguageFlag from "@/components/language-flag";
import { buildClientApiPath } from "@/lib/api-contract";
import { liveRoomsCopy } from "@/i18n/live-rooms-copy";
import { openRoomsCopy } from "@/i18n/open-rooms-copy";
import {
  OPEN_ROOM_PASSWORD_MAX,
  OPEN_ROOM_PASSWORD_MIN,
  OPEN_ROOM_TITLE_MAX,
  OPEN_ROOM_TOPIC_MAX,
  normalizeOpenRoomTitle,
  openRoomStatus,
  parseOpenRooms,
  readOpenRoomPassword,
  type OpenRoomCard,
  type OpenRoomPerson,
} from "@/lib/open-room";

const REFRESH_MS = 20_000;

type Copy = ReturnType<typeof openRoomsCopy> & ReturnType<typeof liveRoomsCopy>;

function useCopy(locale: string): Copy {
  return { ...liveRoomsCopy(locale), ...openRoomsCopy(locale) };
}

/** What a failed join says to the person. */
export function openRoomJoinErrorText(code: string | undefined, copy: Pick<Copy, "roomFull" | "joinFailed" | "passwordWrong" | "passwordLocked">): string {
  if (code === "room_full") return copy.roomFull;
  if (code === "password_wrong") return copy.passwordWrong;
  if (code === "password_locked") return copy.passwordLocked;
  return copy.joinFailed;
}

export default function OpenRooms({
  locale,
  query = "",
  onOpenRoom,
  onCountChange,
  liveOnly = false,
  excludeIds,
  liveHeading,
  voiceRooms,
}: {
  locale: string;
  /**
   * The voice tab: only rooms with a live voice talk or game, without the
   * "make a room" button, and nothing at all while there are none.
   */
  liveOnly?: boolean;
  /** Rooms shown elsewhere on the screen (the voice tab's lounge). */
  excludeIds?: string[];
  /** Heading over the live rooms (voice tab). */
  liveHeading?: string;
  /**
   * The voice-room tab (owner, 2026-11-25): lists voice rooms instead of
   * open chat rooms, and its "make a room" button makes a voice room. With
   * the words to use for them.
   */
  voiceRooms?: { create: string; createTitle: string; heading: string };
  /** Narrow by title or topic (search results). Empty: the Explore list, with the "make a room" button. */
  query?: string;
  /** Open a room the viewer is (now) a member of. */
  onOpenRoom: (conversationId: string) => void;
  /** How many rooms are shown, once known (search results hide "no results" when a room matched). */
  onCountChange?: (count: number) => void;
}) {
  const copy = useCopy(locale);
  const searching = Boolean(query.trim());
  const isVoiceList = Boolean(voiceRooms);
  const [rooms, setRooms] = useState<OpenRoomCard[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRoom, setPasswordRoom] = useState<OpenRoomCard | null>(null);
  const [creating, setCreating] = useState(false);
  const aliveRef = useRef(true);
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      const search = new URLSearchParams();
      if (query.trim()) search.set("q", query.trim());
      if (isVoiceList) search.set("kind", "voice");
      const params = search.size > 0 ? `?${search.toString()}` : "";
      const response = await fetch(`${buildClientApiPath("/conversations/open-rooms")}${params}`, { cache: "no-store" });
      if (!response.ok) return;
      const parsed = parseOpenRooms(await response.json());
      const next = liveOnly
        ? parsed.filter((room) => openRoomStatus(room) !== "chat")
        : parsed;
      if (aliveRef.current && seq === requestSeqRef.current) setRooms(next);
    } catch {
      // Keep the last list; the next refresh tries again.
    }
  }, [liveOnly, query, isVoiceList]);

  useEffect(() => {
    aliveRef.current = true;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const count = rooms?.length ?? null;
  useEffect(() => {
    if (count !== null) onCountChange?.(count);
  }, [count, onCountChange]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);

  /** Joins and opens. Returns the error code when the join was refused. */
  const join = useCallback(async (room: OpenRoomCard, password?: string): Promise<string | null> => {
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(room.id)}/public-join`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      if (response.ok) {
        onOpenRoom(room.id);
        return null;
      }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return body?.error || "failed";
    } catch {
      return "failed";
    }
  }, [onOpenRoom]);

  const enter = useCallback(async (room: OpenRoomCard) => {
    if (room.isMember) {
      onOpenRoom(room.id);
      return;
    }
    if (busyId) return;
    if (room.hasPassword) {
      setPasswordRoom(room);
      return;
    }
    setBusyId(room.id);
    const failure = await join(room);
    if (aliveRef.current) {
      setBusyId(null);
      if (failure) setError(openRoomJoinErrorText(failure, copy));
    }
  }, [busyId, copy, join, onOpenRoom]);

  // The voice-room tab shows its lounge as a card of its own, above this list.
  const listed = (rooms ?? []).filter((room) => !(excludeIds ?? []).includes(room.id));
  const joined = listed.filter((room) => room.isMember);
  const others = listed.filter((room) => !room.isMember);

  const renderRows = (list: OpenRoomCard[]) => (
    <ul className="space-y-2.5 px-4">
      {list.map((room) => (
        <li key={room.id}>
          <OpenRoomRow room={room} copy={copy} busy={busyId === room.id} onEnter={() => void enter(room)} />
        </li>
      ))}
    </ul>
  );

  // Search results: nothing to show until a room matches.
  if (searching && (rooms === null || rooms.length === 0)) return null;
  const shownRooms = liveOnly ? (rooms ?? []).filter((room) => !(excludeIds ?? []).includes(room.id)) : rooms ?? [];
  // The voice tab lists live rooms only while there are some.
  if (liveOnly) {
    if (shownRooms.length === 0) return null;
    return (
      <section className="pb-6 pt-1" aria-label={liveHeading ?? copy.allHeading} data-qa="voice-live-rooms">
        {liveHeading ? (
          <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{liveHeading}</h2>
        ) : null}
        {renderRows(shownRooms)}
        {error ? <p className="px-4 pt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
        {passwordRoom ? (
          <OpenRoomPasswordPrompt
            room={passwordRoom}
            copy={copy}
            onClose={() => setPasswordRoom(null)}
            onSubmit={(password) => join(passwordRoom, password)}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className={searching ? "border-b border-gray-100 pb-3 pt-3" : "pb-6 pt-1"} aria-label={voiceRooms?.heading ?? copy.allHeading} data-qa={voiceRooms ? "voice-rooms-list" : "explore-open-rooms"}>
      {searching ? (
        <>
          <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.allHeading}</h2>
          {renderRows(rooms ?? [])}
        </>
      ) : (
        <>
          <div className="flex items-center justify-end px-4 pb-2">
            <button
              type="button"
              data-qa="open-room-create"
              onClick={() => setCreating(true)}
              className="flex h-9 items-center gap-1 rounded-full bg-slate-950 px-3.5 text-[13px] font-semibold text-white transition active:bg-slate-800"
            >
              <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
              {voiceRooms?.create ?? copy.create}
            </button>
          </div>
          {rooms === null ? (
            voiceRooms ? null : <div className="flex justify-center pt-10 text-gray-400"><Loader2 size={22} className="animate-spin" aria-hidden="true" /></div>
          ) : listed.length === 0 ? (
            // The voice-room tab always has its lounge: no "nothing here" under it.
            voiceRooms ? null : <p className="px-8 pt-10 text-center text-[14px] leading-relaxed text-gray-500" data-qa="open-rooms-empty">{copy.empty}</p>
          ) : (
            <>
              {joined.length > 0 ? (
                <div data-qa="open-rooms-joined">
                  <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.joinedHeading}</h2>
                  {renderRows(joined)}
                </div>
              ) : null}
              {others.length > 0 ? (
                <div className={joined.length > 0 ? "pt-5" : ""}>
                  {joined.length > 0 ? (
                    <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{voiceRooms?.heading ?? copy.allHeading}</h2>
                  ) : null}
                  {renderRows(others)}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
      {error ? <p className="px-4 pt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
      {passwordRoom ? (
        <OpenRoomPasswordPrompt
          room={passwordRoom}
          copy={copy}
          onClose={() => setPasswordRoom(null)}
          onSubmit={(password) => join(passwordRoom, password)}
        />
      ) : null}
      {creating ? (
        <OpenRoomCreateSheet
          locale={locale}
          copy={copy}
          voiceRoomTitle={voiceRooms?.createTitle ?? null}
          onClose={() => setCreating(false)}
          onCreated={(conversationId) => {
            setCreating(false);
            onOpenRoom(conversationId);
          }}
        />
      ) : null}
    </section>
  );
}

function Face({ person, size }: { person: OpenRoomPerson; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400 ring-2 ring-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {person.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.image} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <UserRound size={Math.round(size * 0.58)} strokeWidth={2} />
      )}
    </span>
  );
}

function StatusChip({ room, copy }: { room: OpenRoomCard; copy: Copy }) {
  const status = openRoomStatus(room);
  if (status === "voice") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white" data-open-room-status="voice">
        <Phone size={11} strokeWidth={2.6} aria-hidden="true" />
        {copy.voiceTalk(room.voiceCallParticipantCount)}
      </span>
    );
  }
  if (status === "game") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white" data-open-room-status="game">
        <Gamepad2 size={11} strokeWidth={2.6} aria-hidden="true" />
        {copy.hashRush}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600" data-open-room-status="chat">
      <MessageCircle size={11} strokeWidth={2.6} aria-hidden="true" />
      {copy.statusChat}
    </span>
  );
}

function OpenRoomRow({ room, copy, busy, onEnter }: { room: OpenRoomCard; copy: Copy; busy: boolean; onEnter: () => void }) {
  // The owner's face is drawn once, beside their name.
  const faces = room.members.filter((member) => member.userId !== room.owner?.userId).slice(0, 3);
  return (
    <button
      type="button"
      data-qa="open-room-card"
      data-open-room-locked={room.hasPassword ? "1" : "0"}
      disabled={busy}
      onClick={onEnter}
      className="block w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-left transition active:scale-[0.99] active:bg-gray-50 disabled:opacity-70"
    >
      <span className="flex items-center gap-1.5">
        {room.languages.length > 0 ? (
          <span className="flex shrink-0 gap-0.5 text-[13px] leading-none" aria-hidden="true">
            {room.languages.map((language) => (
              <LanguageFlag key={language} language={language} className="text-[13px] leading-none" />
            ))}
          </span>
        ) : null}
        {room.topic ? (
          <span className="min-w-0 truncate rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">#{room.topic}</span>
        ) : null}
        <span className="flex-1" />
        {room.hasPassword ? <Lock size={14} strokeWidth={2.4} className="shrink-0 text-gray-400" aria-hidden="true" /> : null}
      </span>
      <span className="mt-1.5 line-clamp-2 block text-[15px] font-semibold leading-snug text-slate-900">{room.title}</span>
      <span className="mt-1.5 block"><StatusChip room={room} copy={copy} /></span>
      <span className="mt-2.5 flex items-center gap-2">
        {room.owner ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Face person={room.owner} size={24} />
            <span className="min-w-0 truncate text-[12px] text-gray-600">{room.owner.name || copy.host}</span>
          </span>
        ) : <span className="flex-1" />}
        {faces.length > 0 ? (
          <span className="flex shrink-0 -space-x-1.5">
            {faces.map((member) => <Face key={member.userId} person={member} size={22} />)}
          </span>
        ) : null}
        <span className="shrink-0 text-[12px] tabular-nums text-gray-500">{copy.members(room.memberCount)}</span>
        <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[12px] font-semibold text-white">
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : room.isMember ? copy.open : copy.join}
        </span>
      </span>
    </button>
  );
}

// Both dialogs sit in the upper part of the screen so the keyboard does not cover them.
function Dialog({ label, onClose, children, qa }: { label: string; onClose: () => void; children: React.ReactNode; qa: string }) {
  return (
    <div className="keyboard-safe fixed inset-0 z-[150] flex items-start justify-center px-6" style={{ paddingTop: "calc(env(safe-area-inset-top, 44px) + 72px)" }} role="dialog" aria-modal="true" aria-label={label} data-qa={qa}>
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={label} tabIndex={-1} onClick={onClose} />
      <div className="relative w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-xl">{children}</div>
    </div>
  );
}

const FIELD_CLASS = "mt-1 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[15px] text-slate-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-100";

function OpenRoomPasswordPrompt({ room, copy, onClose, onSubmit }: {
  room: OpenRoomCard;
  copy: Copy;
  onClose: () => void;
  /** Resolves to the error code, or null once the room opened. */
  onSubmit: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog label={copy.passwordPrompt} onClose={onClose} qa="open-room-password">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !password) return;
          setBusy(true);
          setError(null);
          void onSubmit(password).then((failure) => {
            setBusy(false);
            if (failure) setError(openRoomJoinErrorText(failure, copy));
            else onClose();
          });
        }}
      >
        <p className="line-clamp-2 text-[15px] font-semibold text-slate-900">{room.title}</p>
        <label className="mt-3 block text-[13px] font-semibold text-gray-600">
          {copy.passwordPrompt}
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            maxLength={OPEN_ROOM_PASSWORD_MAX}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        {error ? <p className="mt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-slate-700 active:bg-gray-100">
            {copy.cancel}
          </button>
          <button type="submit" disabled={busy || !password} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 text-[14px] font-semibold text-white active:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : copy.enter}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function OpenRoomCreateSheet({ locale, copy, voiceRoomTitle = null, onClose, onCreated }: {
  locale: string;
  copy: Copy;
  /** Set on the voice-room tab: the sheet's title, and the room made is a voice room. */
  voiceRoomTitle?: string | null;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordOk = readOpenRoomPassword(password).kind !== "invalid";
  const canSubmit = Boolean(normalizeOpenRoomTitle(title)) && passwordOk && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(buildClientApiPath("/conversations/open-rooms"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, topic, password, locale, ...(voiceRoomTitle ? { voiceRoom: true } : {}) }),
      });
      const body = await response.json().catch(() => null) as { conversation?: { id?: string } } | null;
      if (response.ok && body?.conversation?.id) {
        onCreated(body.conversation.id);
        return;
      }
      setError(copy.createFailed);
    } catch {
      setError(copy.createFailed);
    }
    setBusy(false);
  };

  return (
    <Dialog label={voiceRoomTitle ?? copy.createTitle} onClose={onClose} qa="open-room-create-sheet">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-[16px] font-bold text-slate-900">{voiceRoomTitle ?? copy.createTitle}</h2>
        <label className="mt-3 block text-[13px] font-semibold text-gray-600">
          {copy.titleLabel}
          <input
            type="text"
            autoFocus
            value={title}
            maxLength={OPEN_ROOM_TITLE_MAX}
            placeholder={copy.titlePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
            className={FIELD_CLASS}
            data-qa="open-room-create-title"
          />
        </label>
        <label className="mt-3 block text-[13px] font-semibold text-gray-600">
          {copy.topicLabel}
          <input
            type="text"
            value={topic}
            maxLength={OPEN_ROOM_TOPIC_MAX}
            placeholder={copy.topicPlaceholder}
            onChange={(event) => setTopic(event.target.value)}
            className={FIELD_CLASS}
            data-qa="open-room-create-topic"
          />
        </label>
        <label className="mt-3 block text-[13px] font-semibold text-gray-600">
          {copy.passwordLabel}
          <input
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={password}
            minLength={OPEN_ROOM_PASSWORD_MIN}
            maxLength={OPEN_ROOM_PASSWORD_MAX}
            placeholder={copy.passwordPlaceholder}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_CLASS}
            data-qa="open-room-create-password"
          />
        </label>
        <p className={`mt-1.5 text-[12px] ${passwordOk ? "text-gray-500" : "text-red-500"}`}>{passwordOk ? copy.passwordHint : copy.passwordPlaceholder}</p>
        {error ? <p className="mt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-slate-700 active:bg-gray-100">
            {copy.cancel}
          </button>
          <button type="submit" disabled={!canSubmit} data-qa="open-room-create-submit" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 text-[14px] font-semibold text-white active:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : copy.createSubmit}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
