import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseNativeAppUpdateDetail,
  resolveNativeAppInstallSourceText,
  resolveNativeAppUpdateCopy,
} from "@/components/LivePhoneDemo/live-phone-demo.app-update.logic";
import { NativeAppUpdateCard, resolveNativeAppUpdateCardContent } from "./native-app-update-card";

function renderCard(installSource: string, locale = "en") {
  return renderToStaticMarkup(
    createElement(NativeAppUpdateCard, {
      copy: resolveNativeAppUpdateCopy(locale),
      installedVersion: "2.2.0",
      installSource,
      latestVersion: "2.2.0",
      statusMessage: "You are on the latest version.",
      showUpdateAction: false,
      onUpdate: () => {},
    }),
  );
}

describe("NativeAppUpdateCard install source", () => {
  it("shows where the build came from next to the installed version", () => {
    const html = renderCard("TestFlight");

    expect(html).toContain("Installed from TestFlight");
    expect(html.indexOf("Installed 2.2.0")).toBeLessThan(html.indexOf("Installed from TestFlight"));
    expect(html.indexOf("Installed from TestFlight")).toBeLessThan(html.indexOf("Latest 2.2.0"));
  });

  it("uses the Korean label and the devbox value from the native payload", () => {
    const copy = resolveNativeAppUpdateCopy("ko");
    const detail = parseNativeAppUpdateDetail({
      status: "checking",
      clientVersion: "2.2.0",
      latestVersion: "",
      updateUrl: "",
      updateAvailable: false,
      installSource: "local",
    });

    expect(renderCard(resolveNativeAppInstallSourceText(copy, detail?.installSource), "ko"))
      .toContain("설치 경로 로컬 빌드 (devbox)");
  });

  it("renders exactly the old card when the source is unknown", () => {
    const html = renderCard("");

    expect(html).not.toContain("Installed from");
    // Same rows as before the install-source line existed.
    expect(html.match(/<div class="mt-1 text-xs font-medium text-gray-600">/g)).toHaveLength(1);
    expect(html).toContain("Installed 2.2.0");
    expect(html).toContain("Latest 2.2.0");
  });
});

describe("resolveNativeAppUpdateCardContent", () => {
  const copy = resolveNativeAppUpdateCopy("en");

  it("offers the store button only when an update and its store URL are both known", () => {
    const available = parseNativeAppUpdateDetail({
      status: "available",
      clientVersion: "2.1.1",
      latestVersion: "2.2.0",
      updateUrl: "https://apps.apple.com/app/id1",
      updateAvailable: true,
    });
    const withoutUrl = parseNativeAppUpdateDetail({
      status: "available",
      clientVersion: "2.1.1",
      latestVersion: "2.2.0",
      updateUrl: "",
      updateAvailable: true,
    });

    expect(resolveNativeAppUpdateCardContent(available, copy)).toMatchObject({
      installedVersion: "2.1.1",
      latestVersion: "2.2.0",
      statusMessage: copy.availableMessage,
      showUpdateAction: true,
    });
    expect(resolveNativeAppUpdateCardContent(withoutUrl, copy).showUpdateAction).toBe(false);
  });

  it("shows the checking state before the native shell reports", () => {
    expect(resolveNativeAppUpdateCardContent(null, copy)).toMatchObject({
      installedVersion: copy.unknownVersionLabel,
      statusMessage: copy.checkingMessage,
      showUpdateAction: false,
    });
  });
});
