import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppTopHeader from "./app-top-header";

describe("AppTopHeader", () => {
  it("shows search, the bell, then the gear on the conversation list, with no compose button", () => {
    const html = renderToStaticMarkup(createElement(AppTopHeader, {
      variant: "surface",
      notificationsLabel: "Notifications",
      onNotifications: () => {},
      onSearch: () => {},
      searchLabel: "Search",
      trailing: createElement("button", { "aria-label": "Settings" }),
    }));

    expect(html).not.toContain("lucide-square-pen");
    expect(html.indexOf('aria-label="Search"')).toBeLessThan(html.indexOf('aria-label="Notifications"'));
    expect(html.indexOf('aria-label="Notifications"')).toBeLessThan(html.indexOf('aria-label="Settings"'));
  });

  it("keeps compose before the bell on the feed", () => {
    const html = renderToStaticMarkup(createElement(AppTopHeader, {
      composeLabel: "Write",
      notificationsLabel: "Notifications",
      onCompose: () => {},
    }));

    expect(html.indexOf('aria-label="Write"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="Write"')).toBeLessThan(html.indexOf('aria-label="Notifications"'));
  });
});
