"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { buildClientApiPath } from "@/lib/api-contract";
import { replaceWithConversationListThenPush } from "@/lib/direct-conversation-navigation";
import { parseFirstMessageSetupNeeds, requestFirstMessageSetup } from "@/lib/first-message-setup";
import { requestProfileBasics } from "@/lib/profile-basics";
import { buildNativeAwareTabPath } from "@/lib/tab-navigation";

export type StartDirectConversationResult =
  | { kind: "opened" }
  /** The user closed a question (profile basics, first-message setup). */
  | { kind: "cancelled" }
  | { kind: "daily_limit"; limit: number }
  /** She does not take new rooms from men (server/male-dm-block). */
  | { kind: "recipient_blocks_men" }
  | { kind: "failed" };

/**
 * "Message" straight from a person's card (the home tab): the same steps as
 * the profile's Message button — profile basics, the first-message setup, the
 * one-new-person-a-day limit — then the room opens. A room that already
 * exists with the person simply opens.
 */
/** The 403 a man gets when she turned off new rooms from men (server/male-dm-block). */
export async function isRecipientBlocksMen(response: Response): Promise<boolean> {
  const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  return body?.error === "recipient_blocks_men";
}

export function useStartDirectConversation(locale: string) {
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const start = useCallback(async (targetUserId: string): Promise<StartDirectConversationResult> => {
    if (busyRef.current) return { kind: "cancelled" };
    if (!(await requestProfileBasics())) return { kind: "cancelled" };
    busyRef.current = true;
    setPendingUserId(targetUserId);
    try {
      const send = () => fetch(buildClientApiPath("/conversations/direct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, locale, force: false }),
      });
      let response = await send();
      if (response.status === 403 && await isRecipientBlocksMen(response)) return { kind: "recipient_blocks_men" };
      if (response.status === 403) {
        const needs = parseFirstMessageSetupNeeds(response.status, await response.clone().json().catch(() => null));
        if (needs) {
          if (!(await requestFirstMessageSetup(needs))) return { kind: "cancelled" };
          response = await send();
        }
      }
      if (response.status === 429) {
        const limited = await response.json().catch(() => ({})) as { error?: string; limit?: number };
        if (limited.error === "daily_new_chat_limit") {
          return { kind: "daily_limit", limit: typeof limited.limit === "number" && limited.limit > 0 ? limited.limit : 1 };
        }
      }
      if (!response.ok) return { kind: "failed" };
      const data = await response.json() as { conversation?: { id?: string } };
      const conversationId = data.conversation?.id;
      if (!conversationId) return { kind: "failed" };
      // Read at tap time (no useSearchParams: the home page needs no Suspense for it).
      const searchParams = new URLSearchParams(window.location.search);
      const listHref = buildNativeAwareTabPath(`/${locale}/conversations`, searchParams, { skipConversationRestore: true, tabRoot: true });
      await replaceWithConversationListThenPush(router, listHref, conversationId);
      return { kind: "opened" };
    } catch {
      return { kind: "failed" };
    } finally {
      busyRef.current = false;
      setPendingUserId(null);
    }
  }, [locale, router]);

  return { start, pendingUserId };
}
