"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import type { SttLanguageCode } from "@/lib/stt-languages";
import { useCallback, useMemo, useState } from "react";

export type ConversationDisplayLanguages = {
  isOpen: boolean;
  isSaving: boolean;
  defaultLanguage: string;
  selectedLanguages: string[];
  open: () => Promise<void>;
  toggle: (code: SttLanguageCode) => void;
  close: () => Promise<void>;
};

/**
 * The per-room reading-language picker. Selections are held locally while the
 * sheet is open and saved once on close, so toggling half a dozen languages
 * costs one request rather than six.
 */
export default function useConversationDisplayLanguages(args: {
  conversationId: string;
  /** Run after a save lands, so newly added languages show up as badges. */
  onSaved: () => void | Promise<void>;
}): ConversationDisplayLanguages {
  const { conversationId, onSaved } = args;

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const path = useMemo(
    () => buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/display-languages`),
    [conversationId],
  );

  const open = useCallback(async () => {
    setIsOpen(true);
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as {
        displayLanguages?: string[];
        defaultLanguage?: string;
      };
      const nextDefault = payload.defaultLanguage || "";
      setDefaultLanguage(nextDefault);
      // The signup language is only a starting suggestion, pre-checked the
      // first time this member has nothing saved yet. Once they've saved a
      // selection — even one that drops the signup language — that choice
      // is respected instead of forcing the default back in.
      const existing = Array.isArray(payload.displayLanguages) ? payload.displayLanguages : [];
      setSelectedLanguages(existing.length > 0 ? existing : (nextDefault ? [nextDefault] : []));
    } catch {
      // The sheet stays open with whatever was already selected; saving on
      // close will retry the network call.
    }
  }, [path]);

  const toggle = useCallback((code: SttLanguageCode) => {
    setSelectedLanguages((current) => (
      current.includes(code)
        ? current.filter((language) => language !== code)
        : [...current, code]
    ));
  }, []);

  const close = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayLanguages: selectedLanguages }),
      });
      // Only refresh once the server actually accepted the change; reloading
      // after a failed save would just redisplay the old badges as if nothing
      // had been attempted.
      if (response.ok) await onSaved();
    } catch {
      // Best-effort: the sheet still closes, and reopening it re-fetches
      // whatever actually made it to the server.
    } finally {
      setIsSaving(false);
      setIsOpen(false);
    }
  }, [onSaved, path, selectedLanguages]);

  return { isOpen, isSaving, defaultLanguage, selectedLanguages, open, toggle, close };
}
