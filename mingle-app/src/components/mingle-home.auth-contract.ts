export type AuthPanelStep = "provider" | "terms";
export type AuthProvider = "apple" | "google" | "email" | "phone";
export type EmailAuthSheetMode = "login" | "signup" | "forgot";
export type EmailAuthErrorCode =
  | "required"
  | "invalid_email"
  | "password_mismatch";
export type AuthGateSessionStatus = "loading" | "authenticated" | "unauthenticated";

export const AUTH_GATE_BACKGROUND_STYLE =
  "linear-gradient(160deg, #FBBC32 0%, #F97316 100%)";
// At least 40% of the screen (owner, 2026-11-22: with the phone button added the
// panel took ~30% and felt cramped); the buttons sit in the middle of it.
export const AUTH_GATE_PANEL_CLASSNAME =
  "flex min-h-[40dvh] shrink-0 flex-col justify-center rounded-t-[2rem] bg-[#1C1C1E] px-5 pb-[calc(1.05rem+env(safe-area-inset-bottom))] pt-4";

export type AuthPanelDraftState = {
  authPanelStep: AuthPanelStep;
  selectedProvider: AuthProvider | null;
  agreedPrivacy: boolean;
  agreedTerms: boolean;
  isEmailSheetOpen: boolean;
  isEmailSheetClosing: boolean;
  emailSheetMode: EmailAuthSheetMode;
  emailAuthErrorCode: EmailAuthErrorCode | null;
  isEmailSubmitting: boolean;
};

export type AuthGateVisualState = {
  shouldShowAuthGate: boolean;
  isLoading: boolean;
  disabled: boolean;
  emailSheetDisabled: boolean;
  hasAgreedAllRequiredTerms: boolean;
  canContinue: boolean;
};

export function createProviderSelectionAuthPanelState(
  provider: AuthProvider,
): AuthPanelDraftState {
  return {
    authPanelStep: "terms",
    selectedProvider: provider,
    agreedPrivacy: true,
    agreedTerms: true,
    isEmailSheetOpen: false,
    isEmailSheetClosing: false,
    emailSheetMode: "login",
    emailAuthErrorCode: null,
    isEmailSubmitting: false,
  };
}

export function createProviderResetAuthPanelState(): AuthPanelDraftState {
  return {
    authPanelStep: "provider",
    selectedProvider: null,
    agreedPrivacy: false,
    agreedTerms: false,
    isEmailSheetOpen: false,
    isEmailSheetClosing: false,
    emailSheetMode: "login",
    emailAuthErrorCode: null,
    isEmailSubmitting: false,
  };
}

export function resolveAuthGateVisualState(args: {
  requireAuthGate: boolean;
  status: AuthGateSessionStatus;
  isSigningIn: boolean;
  isEmailSubmitting: boolean;
  selectedProvider: AuthProvider | null;
  agreedPrivacy: boolean;
  agreedTerms: boolean;
}): AuthGateVisualState {
  const shouldShowAuthGate =
    args.requireAuthGate &&
    args.status === "unauthenticated";
  const isLoading = args.status === "loading";
  const disabled = args.isSigningIn || isLoading;
  const emailSheetDisabled = args.isEmailSubmitting || isLoading;
  const hasAgreedAllRequiredTerms = args.agreedPrivacy && args.agreedTerms;

  return {
    shouldShowAuthGate,
    isLoading,
    disabled,
    emailSheetDisabled,
    hasAgreedAllRequiredTerms,
    canContinue:
      Boolean(args.selectedProvider) && hasAgreedAllRequiredTerms && !disabled,
  };
}
