import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeSlideSurfaceHistoryForScope,
  consumeTopSlideSurfaceHistoryEntry,
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
  back: () => void;
};

describe("slide surface history", () => {
  let history: FakeHistory;
  let emitPopState: () => void;

  beforeEach(() => {
    const popstateListeners = new Set<() => void>();
    emitPopState = () => {
      popstateListeners.forEach((listener) => listener());
    };
    history = {
      state: { unrelated: "preserved" },
      pushState(state) {
        history.state = state;
      },
      replaceState(state) {
        history.state = state;
      },
      back() {
        history.state = {
          unrelated: "preserved",
          [SLIDE_SURFACE_HISTORY_KEY]: [
            { scope: "conversation", id: "participants" },
          ],
        };
        emitPopState();
      },
    };
    vi.stubGlobal("window", {
      history,
      addEventListener(type: string, listener: EventListener) {
        if (type === "popstate") popstateListeners.add(listener as unknown as () => void);
      },
      removeEventListener(type: string, listener: EventListener) {
        if (type === "popstate") popstateListeners.delete(listener as unknown as () => void);
      },
      requestAnimationFrame(callback: FrameRequestCallback) {
        return setTimeout(() => callback(Date.now()), 0) as unknown as number;
      },
      cancelAnimationFrame(timerId: number) {
        clearTimeout(timerId as unknown as ReturnType<typeof setTimeout>);
      },
      setTimeout,
      clearTimeout,
    });
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

  it("consumes only the top surface entry and waits for popstate settle", async () => {
    history.state = {
      unrelated: "preserved",
      [SLIDE_SURFACE_HISTORY_KEY]: [
        { scope: "conversation", id: "participants" },
        { scope: "conversation", id: "profile", value: "user-1" },
      ],
    };

    await expect(consumeTopSlideSurfaceHistoryEntry({
      scope: "conversation",
      id: "profile",
      value: "user-1",
    })).resolves.toBe(true);

    expect(readSlideSurfaceHistory(history.state)).toEqual([
      { scope: "conversation", id: "participants" },
    ]);
  });

  it("consumes every surface owned by a parent scope", async () => {
    history.state = {
      unrelated: "preserved",
      [SLIDE_SURFACE_HISTORY_KEY]: [
        { scope: "conversation", id: "participants" },
        { scope: "conversation", id: "profile", value: "user-1" },
      ],
    };
    history.back = () => {
      const entries = readSlideSurfaceHistory(history.state);
      history.state = {
        unrelated: "preserved",
        [SLIDE_SURFACE_HISTORY_KEY]: entries.slice(0, -1),
      };
      emitPopState();
    };

    await expect(consumeSlideSurfaceHistoryForScope("conversation")).resolves.toBe(true);

    expect(readSlideSurfaceHistory(history.state)).toEqual([]);
  });
});
