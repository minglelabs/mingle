"use client";

// "Live now" in the search tab: rooms with a live voice talk call or a running Hash Rush game.
// A public room shows its name, languages and members and anyone can join it; a private room
// shows only that something is live there, as a locked card.

import { Gamepad2, Lock, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import LanguageFlag from "@/components/language-flag";
import { buildClientApiPath } from "@/lib/api-contract";
import { liveRoomsCopy } from "@/i18n/live-rooms-copy";

export type LiveRoom = {
  id: string;
  isPublic: boolean;
  isMember: boolean;
  memberCount: number;
  title: string | null;
  languages: string[];
  members: Array<{ userId: string; name: string | null; image: string | null }>;
  voiceCallParticipantCount: number;
  hashRushActive: boolean;
};

const REFRESH_MS = 20_000;

export function parseLiveRooms(body: unknown): LiveRoom[] {
  const rooms = (body as { rooms?: unknown })?.rooms;
  if (!Array.isArray(rooms)) return [];
  return rooms.filter((room): room is LiveRoom => !!room && typeof (room as LiveRoom).id === "string");
}

export default function LiveRooms({
  locale,
  onOpenRoom,
}: {
  locale: string;
  /** Open a room the viewer is (now) a member of. */
  onOpenRoom: (conversationId: string) => void;
}) {
  const copy = liveRoomsCopy(locale);
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(buildClientApiPath("/conversations/live-rooms"), { cache: "no-store" });
      if (!response.ok) return;
      const next = parseLiveRooms(await response.json());
      if (aliveRef.current) setRooms(next);
    } catch {
      // Keep the last list; the next refresh tries again.
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);

  const enter = useCallback(async (room: LiveRoom) => {
    if (room.isMember) {
      onOpenRoom(room.id);
      return;
    }
    if (!room.isPublic || busyId) return;
    setBusyId(room.id);
    try {
      const response = await fetch(buildClientApiPath(`/conversations/${encodeURIComponent(room.id)}/public-join`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (response.ok) {
        onOpenRoom(room.id);
        return;
      }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setError(body?.error === "room_full" ? copy.roomFull : copy.joinFailed);
    } catch {
      setError(copy.joinFailed);
    } finally {
      if (aliveRef.current) setBusyId(null);
    }
  }, [busyId, copy.joinFailed, copy.roomFull, onOpenRoom]);

  if (rooms.length === 0) return null;

  return (
    <section className="border-b border-gray-100 pb-3 pt-2" aria-label={copy.heading} data-qa="search-live-rooms">
      <h2 className="flex items-center gap-1.5 px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        </span>
        {copy.heading}
      </h2>
      <ul className="flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {rooms.map((room) => {
          const enterable = room.isMember || room.isPublic;
          return (
            <li key={room.id} className="shrink-0">
              <button
                type="button"
                data-qa="search-live-room"
                data-live-room-public={room.isPublic ? "1" : "0"}
                disabled={!enterable || busyId === room.id}
                onClick={() => void enter(room)}
                className={`flex h-[124px] w-[150px] flex-col justify-between rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                  room.isPublic ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
                } disabled:active:scale-100`}
              >
                <div className="min-w-0">
                  {room.isPublic ? (
                    <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-slate-900">{room.title}</p>
                  ) : (
                    <p className="flex items-center gap-1 text-[14px] font-semibold text-gray-500">
                      <Lock size={13} strokeWidth={2.4} aria-hidden="true" />
                      {copy.privateRoom}
                    </p>
                  )}
                  {room.isPublic && room.languages.length > 0 ? (
                    <span className="mt-1 flex gap-0.5 text-[13px] leading-none" aria-hidden="true">
                      {room.languages.map((language) => (
                        <LanguageFlag key={language} language={language} className="text-[13px] leading-none" />
                      ))}
                    </span>
                  ) : null}
                  {!room.isPublic ? <p className="mt-1 text-[11px] text-gray-400">{copy.privateHint}</p> : null}
                </div>
                <div className="space-y-1">
                  {room.voiceCallParticipantCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Phone size={11} strokeWidth={2.6} aria-hidden="true" />
                      {copy.voiceTalk(room.voiceCallParticipantCount)}
                    </span>
                  ) : null}
                  {room.hashRushActive ? (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Gamepad2 size={11} strokeWidth={2.6} aria-hidden="true" />
                      {copy.hashRush}
                    </span>
                  ) : null}
                  <p className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>{room.isPublic ? copy.members(room.memberCount) : ""}</span>
                    {enterable ? (
                      <span className="font-semibold text-amber-700">{room.isMember ? copy.open : copy.join}</span>
                    ) : null}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <p className="px-4 pt-2 text-[13px] text-red-500" role="alert">{error}</p> : null}
    </section>
  );
}
