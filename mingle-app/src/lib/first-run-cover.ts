import { LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED } from "@/components/LivePhoneDemo/live-phone-demo.preferences";

/**
 * First launch of the app (owner, 2026-11-24): the language screen comes
 * first, with no app screen flashing before it. The shell opens the feed,
 * which moves on to the chat list, where onboarding opens; meanwhile the
 * server-rendered list showed for a moment. Until onboarding is confirmed on
 * this device, a cover in the onboarding's own color sits over the page (under
 * the onboarding, which is drawn above it), set before anything paints.
 *
 * Only in the app (its launch URL carries nativeUi / nativeStt), only on the
 * launch screens, and lifted after 8 s whatever happens, so a page that never
 * opens onboarding is not hidden for good.
 */
export const FIRST_RUN_COVER_ATTRIBUTE = "data-first-run-cover";
const COVER_COLOR = "#f8f5ef";
const LAUNCH_PATH = "^/[A-Za-z-]+(/(feed|voice|conversations|home))?/?$";

export const FIRST_RUN_COVER_SCRIPT = `(function(){try{
var q=location.search;if(!/[?&](nativeUi|nativeStt)=/.test(q)&&!window.ReactNativeWebView)return;
if(!new RegExp(${JSON.stringify(LAUNCH_PATH)}).test(location.pathname))return;
if(localStorage.getItem(${JSON.stringify(LS_KEY_LANGUAGE_ONBOARDING_CONFIRMED)})==="1")return;
var s=document.createElement("style");s.textContent="html[${FIRST_RUN_COVER_ATTRIBUTE}] body::after{content:'';position:fixed;inset:0;z-index:240;background:${COVER_COLOR}}";
document.head.appendChild(s);var d=document.documentElement;d.setAttribute(${JSON.stringify(FIRST_RUN_COVER_ATTRIBUTE)},"1");
setTimeout(function(){d.removeAttribute(${JSON.stringify(FIRST_RUN_COVER_ATTRIBUTE)})},8000);
}catch(e){}})();`;

/** Lifts the cover (onboarding confirmed, or this device never needed it). */
export function clearFirstRunCover(): void {
  try {
    document.documentElement.removeAttribute(FIRST_RUN_COVER_ATTRIBUTE);
  } catch {
    // No document (server): nothing to lift.
  }
}
