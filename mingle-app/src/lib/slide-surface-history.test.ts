import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pushSlideSurfaceHistory,
  readSlideSurfaceHistory,
  readSlideSurfaceHistoryForScope,
  replaceSlideSurfaceHistory,
  SLIDE_SURFACE_HISTORY_KEY,
} from "@/lib/slide-surface-history";

type FakeHistory = {
  state: unknown;
  pushState: (state: unknown, title: string) => void;
  replaceState: (state: unknown, title: string) => void;
};

describe("slide surface history", () => {
  let history: FakeHistory;

  beforeEach(() => {
    history = {
      state: { unrelated: "preserved" },
      pushState(state) {
        history.state = state;
      },
      replaceState(state) {
        history.state = state;
      },
    };
    vi.stubGlobal("window", { history });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes a same-document surface entry without dropping existing state", () => {
    pushSlideSurfaceHistory({ scope: "conversation", id: "notifications" });
    pushSlideSurfaceHistory({ scope: "conversation", id: "profile", value: "user-1" });

    expect(history.state).toMatchObject({ unrelated: "preserved" });
    expect(readSlideSurfaceHistory(history.state)).toEqual([
      { scope: "conversation", id: "notifications" },
      { scope: "conversation", id: "profile", value: "user-1" },
    ]);
  });

  it("reads only valid entries for a requested surface scope", () => {
    history.state = {
      [SLIDE_SURFACE_HISTORY_KEY]: [
        { scope: "mypage", id: "profile-edit" },
        { scope: "conversation", id: "profile", value: "user-2" },
        { scope: "invalid", value: "missing-id" },
        "invalid-entry",
      ],
    };

    expect(readSlideSurfaceHistoryForScope("conversation")).toEqual([
      { scope: "conversation", id: "profile", value: "user-2" },
    ]);
  });

  it("replaces the shared stack while preserving unrelated state", () => {
    history.state = {
      unrelated: "preserved",
      [SLIDE_SURFACE_HISTORY_KEY]: [{ scope: "conversation", id: "notifications" }],
    };

    replaceSlideSurfaceHistory([{ scope: "mypage", id: "profile-share" }]);

    expect(history.state).toEqual({
      unrelated: "preserved",
      [SLIDE_SURFACE_HISTORY_KEY]: [{ scope: "mypage", id: "profile-share" }],
    });
  });
});
