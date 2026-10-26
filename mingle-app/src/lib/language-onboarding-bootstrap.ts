import { LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED } from "@/components/LivePhoneDemo/live-phone-demo.preferences";

export const LANGUAGE_ONBOARDING_PENDING_ATTRIBUTE = "data-mingle-language-onboarding-pending";
export const LANGUAGE_ONBOARDING_COVER_ATTRIBUTE = "data-mingle-language-onboarding-cover";

// Runs before first paint. The conversation list is server-rendered without access to
// localStorage, so on a fresh install its HTML would paint until hydration resolves the
// onboarding phase and opens the language picker. Marking <html> here lets CSS keep the
// list covered from the very first frame, while returning users see the list unchanged.
export function buildLanguageOnboardingBootstrapScript(): string {
  return `(function(){var pending=true;try{var raw=window.localStorage.getItem(${JSON.stringify(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED)});var value=raw===null?"":String(raw).trim().toLowerCase();pending=!(value==="1"||value==="true");}catch(_){pending=true;}if(pending){document.documentElement.setAttribute(${JSON.stringify(LANGUAGE_ONBOARDING_PENDING_ATTRIBUTE)},"");}})();`;
}

export const LANGUAGE_ONBOARDING_BOOTSTRAP_SCRIPT = buildLanguageOnboardingBootstrapScript();
