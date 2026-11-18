"use client";

// Search by room number ("482 1937"): the room's card at the top of the results.
// A public room (or one the viewer is in) opens or joins at once; a private room
// asks to join, and a member accepts the request from the room.

import { Loader2, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import LanguageFlag from "@/components/language-flag";
import { buildClientApiPath } from "@/lib/api-contract";
import { formatRoomCode } from "@/lib/room-code";
import { liveRoomsCopy } from "@/i18n/live-rooms-copy";

export type RoomCodeRoom = {
  id: string;
  roomCode: number;
  isPublic: boolean;
  isMember: boolean;
  memberCount: number;
  title: string | null;
  languages: string[];
  request: "none" | "pending" | "declined";
};

type Lookup = { state: "loading" } | { state: "found"; room: RoomCodeRoom } | { state: "missing" };

export default function RoomCodeResult({
  locale,
  code,
  onOpenRoom,
}: {
  locale: string;
  code: number;
  onOpenRoom: (conversationId: string) => void;
}) {
  const copy = liveRoomsCopy(locale);
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLookup({ state: "loading" });
    setError(null);
    void fetch(buildClientApiPath(`/conversations/by-code/${code}`), { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setLookup({ state: "missing" });
          return;
        }
        const body = await response.json() as { room?: RoomCodeRoom };
        setLookup(body.room ? { state: "found", room: body.room } : { state: "missing" });
      })
      .catch(() => {
        if (!cancelled) setLookup({ state: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const act = useCallback(async (room: RoomCodeRoom) => {
    if (room.isMember) {
      onOpenRoom(room.id);
      return;
    }
    if (busy || room.request === "pending") return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(buildClientApiPath(`/conversations/by-code/${code}/join`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => null) as { joined?: boolean; requested?: boolean; error?: string } | null;
      if (response.ok && body?.joined) {
        onOpenRoom(room.id);
        return;
      }
      if (response.ok && body?.requested) {
        setLookup({ state: "found", room: { ...room, request: "pending" } });
        return;
      }
      setError(body?.error === "room_full" ? copy.roomFull : copy.joinFailed);
    } catch {
      setError(copy.joinFailed);
    } finally {
      setBusy(false);
    }
  }, [busy, code, copy.joinFailed, copy.roomFull, onOpenRoom]);

  return (
    <section className="border-b border-gray-100 px-4 pb-3 pt-3" aria-label={copy.roomByNumber} data-qa="search-room-code-result">
      <h2 className="pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">{copy.roomByNumber}</h2>
      {lookup.state === "loading" ? (
        <div className="flex h-16 items-center justify-center text-gray-400"><Loader2 size={18} className="animate-spin" aria-hidden="true" /></div>
      ) : lookup.state === "missing" ? (
        <p className="py-3 text-[14px] text-gray-500">{copy.roomNotFound}</p>
      ) : (
        <RoomCard room={lookup.room} copy={copy} busy={busy} onAct={() => void act(lookup.room)} />
      )}
      {error ? <p className="pt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
    </section>
  );
}

function RoomCard({ room, copy, busy, onAct }: {
  room: RoomCodeRoom;
  copy: ReturnType<typeof liveRoomsCopy>;
  busy: boolean;
  onAct: () => void;
}) {
  const named = room.title !== null;
  const action = room.isMember
    ? copy.open
    : room.isPublic
      ? copy.join
      : room.request === "pending"
        ? null
        : room.request === "declined" ? copy.requestAgain : copy.requestJoin;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 px-3.5 py-3" data-room-code={room.roomCode}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-slate-900">
          {!room.isPublic ? <Lock size={13} strokeWidth={2.4} className="shrink-0 text-gray-400" aria-hidden="true" /> : null}
          <span className="truncate">{named ? room.title : copy.privateRoom}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-gray-500">
          <span className="tabular-nums">{copy.roomNumber} {formatRoomCode(room.roomCode)}</span>
          {named ? <span>· {copy.members(room.memberCount)}</span> : null}
          {room.languages.map((language) => (
            <LanguageFlag key={language} language={language} className="text-[12px] leading-none" />
          ))}
        </p>
        {room.request === "pending" && !room.isMember ? (
          <p className="mt-1 text-[12px] text-amber-700">{copy.requestSent}</p>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          data-qa="search-room-code-action"
          onClick={onAct}
          disabled={busy}
          className="shrink-0 rounded-full bg-amber-500 px-3.5 py-1.5 text-[13px] font-semibold text-white transition active:bg-amber-600 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : action}
        </button>
      ) : null}
    </div>
  );
}
