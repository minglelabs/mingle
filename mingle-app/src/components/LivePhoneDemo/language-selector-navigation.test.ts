import { describe, expect, it, vi } from "vitest";
import { createLanguageSelectorNavigation } from "./language-selector-navigation";
import { isLanguageSelectorHistoryOpen } from "./language-selector.logic";

function setup() {
  const roomState = { __NA: true, tree: { route: "room-a" }, conversation: "room-a" };
  const entries: Record<string, unknown>[] = [{ route: "list" }, roomState];
  let index = 1;
  let location = "/en/conversations/room-a";
  let pendingBacks = 0;
  const controllers: ReturnType<typeof createLanguageSelectorNavigation>[] = [];
  const history = {
    read: () => entries[index],
    push: vi.fn((state: Record<string, unknown>) => {
      entries.splice(index + 1);
      entries.push(state);
      index += 1;
    }),
    replace: vi.fn((state: Record<string, unknown>) => { entries[index] = state; }),
    back: vi.fn(() => { pendingBacks += 1; }),
    locationKey: () => location,
  };
  const emit = () => controllers.forEach((controller) => controller.handlePopState(history.read()));
  const create = (owner = "room-a", active = true) => {
    let visible = false;
    const controller = createLanguageSelectorNavigation({
      owner, history, onOpenChange: (open) => { visible = open; },
    });
    controllers.push(controller);
    controller.setActive(active);
    return { controller, isVisible: () => visible };
  };
  return {
    history, entries, roomState, create, emit,
    setLocation: (next: string) => { location = next; },
    settleBack() {
      expect(pendingBacks).toBeGreaterThan(0);
      pendingBacks -= 1;
      index = Math.max(0, index - 1);
      emit();
    },
    browserBack() { index = Math.max(0, index - 1); emit(); },
    browserForward() { index = Math.min(entries.length - 1, index + 1); emit(); },
  };
}

describe("language selector navigation", () => {
  it("opens immediately and treats repeated activation as one open request", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.open();
    controller.open();
    expect(isVisible()).toBe(true);
    expect(env.history.push).toHaveBeenCalledTimes(1);
    expect(env.history.back).not.toHaveBeenCalled();
    expect(env.history.read()).toMatchObject(env.roomState);
    expect(env.entries[1]).toEqual(env.roomState);
  });

  it("keeps a reopened selector visible when the old close finishes later", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    expect(isVisible()).toBe(false);
    controller.open();
    controller.open();
    expect(isVisible()).toBe(true);
    expect(env.history.push).toHaveBeenCalledTimes(1);
    env.settleBack();
    expect(isVisible()).toBe(true);
    expect(isLanguageSelectorHistoryOpen(env.history.read(), "room-a")).toBe(true);
    expect(env.history.push).toHaveBeenCalledTimes(2);
    expect(env.entries).toHaveLength(3);
    // One further close returns to the room, not the conversation list.
    controller.close({ syncHistory: "back" });
    env.settleBack();
    expect(isVisible()).toBe(false);
    expect(env.history.read()).toEqual(env.roomState);
  });

  it("does not traverse twice when close is delivered more than once", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    controller.close({ syncHistory: "back" });
    expect(env.history.back).toHaveBeenCalledTimes(1);
    env.settleBack();
    expect(isVisible()).toBe(false);
    expect(env.history.read()).toEqual(env.roomState);
  });

  it("honors the latest close after an open-close-open-close sequence", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    controller.open();
    controller.close({ syncHistory: "back" });
    env.settleBack();
    expect(isVisible()).toBe(false);
    expect(env.history.push).toHaveBeenCalledTimes(1);
    expect(env.history.read()).toEqual(env.roomState);
  });

  it("restores browser back and forward without a timed history correction loop", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    env.browserBack();
    expect(isVisible()).toBe(false);
    env.browserForward();
    expect(isVisible()).toBe(true);
    env.browserBack();
    expect(isVisible()).toBe(false);
    expect(env.history.back).not.toHaveBeenCalled();
    expect(env.history.push).toHaveBeenCalledTimes(1);
  });

  it("does not reopen after leaving the room while its close is pending", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    controller.open();
    controller.setActive(false);
    env.settleBack();
    controller.open();
    expect(isVisible()).toBe(false);
    expect(env.history.push).toHaveBeenCalledTimes(1);
  });

  it("does not recreate the selector on a different route", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    controller.open();
    env.setLocation("/en/connect");
    env.settleBack();
    expect(isVisible()).toBe(false);
    expect(env.history.push).toHaveBeenCalledTimes(1);
  });

  it("keeps hidden rooms from opening or removing the visible room's selector", () => {
    const env = setup();
    const foreground = env.create("room-a");
    const background = env.create("room-b", false);
    foreground.controller.open();
    const openedState = env.history.read();
    env.emit();
    expect(background.isVisible()).toBe(false);
    background.controller.close({ syncHistory: "replace" });
    background.controller.dispose();
    expect(env.history.read()).toEqual(openedState);
    expect(foreground.isVisible()).toBe(true);
    expect(env.history.replace).not.toHaveBeenCalled();
  });

  it("cleans up only its own marker while preserving Next.js and room state", () => {
    const env = setup();
    const { controller } = env.create();
    controller.open();
    controller.dispose();
    expect(env.history.read()).toEqual(env.roomState);
    expect(env.history.back).not.toHaveBeenCalled();
  });

  it("cancels a queued reopen when another menu replaces the selector", () => {
    const env = setup();
    const { controller, isVisible } = env.create();
    controller.open();
    controller.close({ syncHistory: "back" });
    controller.open();
    controller.close({ syncHistory: "replace" });
    env.settleBack();
    expect(isVisible()).toBe(false);
    expect(env.history.push).toHaveBeenCalledTimes(1);
  });
});
