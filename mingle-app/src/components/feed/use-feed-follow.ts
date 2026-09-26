"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";

export type FollowButtonState =
  | "hidden" // already following, own post, or signed-out author edge
  | "idle" // shows "+ Follow"
  | "pending" // request in flight
  | "success"; // brief check mark before hiding

type UseFeedFollowOptions = {
  authorId: string;
  /** DTO `followingAuthor`: true = already following, null = self/signed-out. */
  followingAuthor: boolean | null;
  isMine: boolean;
  isSignedIn: boolean;
  onRequireLogin: () => void;
  /** Persist the confirmed following flag up to the feed list. */
  onFollowed?: (authorId: string) => void;
  onError?: () => void;
};

type UseFeedFollowReturn = {
  buttonState: FollowButtonState;
  follow: () => void;
};

/** How long the success check stays before the button hides. */
const SUCCESS_HOLD_MS = 900;

/** This card's own follow interaction, independent of the DTO flag. */
export type LocalFollowState = "idle" | "pending" | "success" | "done";

/**
 * The visible button state. The DTO flag (`followingAuthor`, patched on every
 * card by the same author when any one of them follows) hides the button; a
 * card's own in-flight request or success check still shows until it settles.
 */
export function resolveFollowButtonState(
  local: LocalFollowState,
  props: { followingAuthor: boolean | null; isMine: boolean },
): FollowButtonState {
  if (local === "pending") return "pending";
  if (local === "success") return "success";
  if (local === "done") return "hidden";
  if (props.isMine || props.followingAuthor !== false) return "hidden";
  return "idle";
}

/**
 * Drives the inline "+ Follow" button on the author row, wired to
 * `POST /users/{id}/follow`.
 *
 * - Hidden for own posts, already-followed authors, and the self/null case.
 * - Optimistic: on success shows a check briefly, then hides.
 * - On failure keeps the "+", shows an error, and stays tappable.
 * - Unfollow lives on the author's profile, not here.
 */
export function useFeedFollow(options: UseFeedFollowOptions): UseFeedFollowReturn {
  const { authorId, followingAuthor, isMine, isSignedIn, onRequireLogin, onFollowed, onError } = options;

  const [local, setLocal] = useState<LocalFollowState>("idle");
  // Follow the DTO flag: when it flips back to "not following" (e.g. the list
  // re-fetched after an unfollow on the profile), this card offers it again.
  const [prevFollowing, setPrevFollowing] = useState(followingAuthor);
  if (prevFollowing !== followingAuthor) {
    setPrevFollowing(followingAuthor);
    if (followingAuthor === false && local === "done") setLocal("idle");
  }
  const buttonState = resolveFollowButtonState(local, { followingAuthor, isMine });
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const follow = useCallback(() => {
    if (pendingRef.current) return;
    if (buttonState === "hidden" || buttonState === "success") return;
    if (!isSignedIn) {
      onRequireLogin();
      return;
    }

    pendingRef.current = true;
    setLocal("pending");

    void (async () => {
      try {
        const res = await fetch(buildClientApiPath(`/users/${encodeURIComponent(authorId)}/follow`), {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) {
          setLocal("idle");
          onError?.();
          return;
        }
        setLocal("success");
        onFollowed?.(authorId);
        timerRef.current = setTimeout(() => setLocal("done"), SUCCESS_HOLD_MS);
      } catch {
        setLocal("idle");
        onError?.();
      } finally {
        pendingRef.current = false;
      }
    })();
  }, [authorId, buttonState, isSignedIn, onRequireLogin, onFollowed, onError]);

  return { buttonState, follow };
}
