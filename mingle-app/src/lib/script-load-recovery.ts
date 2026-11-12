/**
 * Reloads the page when its JavaScript did not arrive.
 *
 * If a script chunk fails to load (the server was still starting, a deploy
 * swapped the chunks, the network dropped), the server-rendered HTML still
 * shows and scrolls, but React never hydrates: no button takes a tap until
 * the app is restarted. This inline script runs before the app's bundles,
 * notices that case and reloads once or twice.
 *
 * Signals, any of which leads to a reload:
 * - a `/_next/` script fires `error` (caught in the capture phase);
 * - a lazy chunk rejects with `ChunkLoadError`;
 * - the window has finished loading but nothing marked the page hydrated
 *   within `hydrationGraceMs` (covers scripts that failed before this one).
 *
 * `HYDRATION_MARK_KEY` is set by <HydrationMark />. Reloads are capped per
 * tab in sessionStorage so a broken server never loops.
 */

export const HYDRATION_MARK_KEY = "__MINGLE_HYDRATED__";
export const SCRIPT_RECOVERY_STORAGE_KEY = "mingle:script-load-recovery";

export type ScriptLoadRecoveryOptions = {
  hydrationGraceMs?: number;
  maxReloads?: number;
  windowMs?: number;
};

export function buildScriptLoadRecoveryScript(
  options: ScriptLoadRecoveryOptions = {},
): string {
  const grace = options.hydrationGraceMs ?? 12000;
  const maxReloads = options.maxReloads ?? 2;
  const windowMs = options.windowMs ?? 120000;
  const markKey = JSON.stringify(HYDRATION_MARK_KEY);
  const storageKey = JSON.stringify(SCRIPT_RECOVERY_STORAGE_KEY);

  return `(function(){if(window.__MINGLE_SCRIPT_RECOVERY__)return;window.__MINGLE_SCRIPT_RECOVERY__=true;var done=false;var reload=function(reason){if(done||window[${markKey}])return;var now=Date.now();var state={count:0,at:now};try{var raw=window.sessionStorage.getItem(${storageKey});if(raw){var saved=JSON.parse(raw);if(saved&&now-saved.at<${windowMs}){state=saved;}}if(state.count>=${maxReloads})return;state={count:state.count+1,at:state.count?state.at:now};window.sessionStorage.setItem(${storageKey},JSON.stringify(state));}catch(e){return;}done=true;try{console.warn("[mingle] reloading: "+reason);}catch(e){}window.location.reload();};var failed=false;window.addEventListener("error",function(event){var target=event&&event.target;if(!target||target.tagName!=="SCRIPT")return;var src=String(target.src||"");if(src.indexOf("/_next/")<0)return;failed=true;if(document.readyState==="complete")reload("script failed: "+src);},true);window.addEventListener("unhandledrejection",function(event){var reason=event&&event.reason;var name=reason&&reason.name;if(name==="ChunkLoadError"||/Loading chunk [^ ]+ failed/.test(String(reason&&reason.message||"")))reload("chunk failed");});var check=function(){if(failed){reload("script failed");return;}setTimeout(function(){reload("not hydrated");},${grace});};if(document.readyState==="complete"){check();}else{window.addEventListener("load",check);}})();`;
}

export const SCRIPT_LOAD_RECOVERY_SCRIPT = buildScriptLoadRecoveryScript();
