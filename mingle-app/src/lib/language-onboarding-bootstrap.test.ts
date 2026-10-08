import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED } from "@/components/LivePhoneDemo/live-phone-demo.preferences";
import {
  LANGUAGE_ONBOARDING_BOOTSTRAP_SCRIPT,
  LANGUAGE_ONBOARDING_PENDING_ATTRIBUTE,
} from "@/lib/language-onboarding-bootstrap";

function runBootstrap(getItem: (key: string) => string | null) {
  const attributes = new Map<string, string>();
  runInNewContext(LANGUAGE_ONBOARDING_BOOTSTRAP_SCRIPT, {
    window: { localStorage: { getItem } },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          attributes.set(name, value);
        },
      },
    },
  });
  return attributes.has(LANGUAGE_ONBOARDING_PENDING_ATTRIBUTE);
}

describe("language onboarding bootstrap script", () => {
  it("marks onboarding pending on a fresh install", () => {
    expect(runBootstrap(() => null)).toBe(true);
  });

  it("does not mark onboarding pending once confirmed", () => {
    expect(runBootstrap((key) => (key === LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED ? "1" : null))).toBe(false);
    expect(runBootstrap((key) => (key === LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED ? "true" : null))).toBe(false);
  });

  it("marks onboarding pending when the stored flag is falsy", () => {
    expect(runBootstrap(() => "0")).toBe(true);
  });

  it("marks onboarding pending when storage is unavailable", () => {
    expect(runBootstrap(() => {
      throw new Error("blocked");
    })).toBe(true);
  });
});
