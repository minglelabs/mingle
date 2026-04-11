import { describe, expect, it } from "vitest";
import {
  AUTH_GATE_BACKGROUND_STYLE,
  AUTH_GATE_PANEL_CLASSNAME,
  createProviderResetAuthPanelState,
  createProviderSelectionAuthPanelState,
  resolveAuthGateVisualState,
} from "@/components/mingle-home.auth-contract";

describe("mingle-home auth contracts", () => {
  it("keeps the login shell colors extended through the safe areas", () => {
    expect(AUTH_GATE_BACKGROUND_STYLE).toBe(
      "linear-gradient(160deg, #FBBC32 0%, #F97316 100%)",
    );
    expect(AUTH_GATE_PANEL_CLASSNAME).toContain(
      "pb-[calc(1.05rem+env(safe-area-inset-bottom))]",
    );
    expect(AUTH_GATE_PANEL_CLASSNAME).toContain("bg-[#1C1C1E]");
  });

  it("slides provider selection into the terms step with both required agreements prechecked", () => {
    expect(createProviderSelectionAuthPanelState("google")).toEqual({
      authPanelStep: "terms",
      selectedProvider: "google",
      agreedPrivacy: true,
      agreedTerms: true,
      isEmailSheetOpen: false,
      isEmailSheetClosing: false,
      emailSheetMode: "login",
      emailAuthErrorCode: null,
      isEmailSubmitting: false,
    });

    expect(createProviderSelectionAuthPanelState("apple").authPanelStep).toBe(
      "terms",
    );
  });

  it("returns to a clean provider step when the user backs out of the terms slide", () => {
    expect(createProviderResetAuthPanelState()).toEqual({
      authPanelStep: "provider",
      selectedProvider: null,
      agreedPrivacy: false,
      agreedTerms: false,
      isEmailSheetOpen: false,
      isEmailSheetClosing: false,
      emailSheetMode: "login",
      emailAuthErrorCode: null,
      isEmailSubmitting: false,
    });
  });

  it("keeps the auth gate in a stable loading state while session resolution is in progress", () => {
    expect(
      resolveAuthGateVisualState({
        requireAuthGate: true,
        status: "loading",
        isSigningIn: false,
        isEmailSubmitting: false,
        selectedProvider: "google",
        agreedPrivacy: true,
        agreedTerms: true,
      }),
    ).toEqual({
      shouldShowAuthGate: true,
      isLoading: true,
      disabled: true,
      emailSheetDisabled: true,
      hasAgreedAllRequiredTerms: true,
      canContinue: false,
    });
  });

  it("enables continue only after provider selection and both required terms are agreed", () => {
    expect(
      resolveAuthGateVisualState({
        requireAuthGate: true,
        status: "unauthenticated",
        isSigningIn: false,
        isEmailSubmitting: false,
        selectedProvider: "email",
        agreedPrivacy: true,
        agreedTerms: true,
      }).canContinue,
    ).toBe(true);

    expect(
      resolveAuthGateVisualState({
        requireAuthGate: true,
        status: "unauthenticated",
        isSigningIn: false,
        isEmailSubmitting: false,
        selectedProvider: "email",
        agreedPrivacy: true,
        agreedTerms: false,
      }).canContinue,
    ).toBe(false);
  });
});
