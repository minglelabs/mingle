export const NATIVE_QA_BRIDGE_WINDOW_FLAG = "__MINGLE_NATIVE_QA_BRIDGE_ENABLED__";

declare global {
  interface Window {
    __MINGLE_NATIVE_QA_BRIDGE_ENABLED__?: boolean;
  }
}

export function readNativeQaBridgeAuthority(
  candidate: Pick<Window, "__MINGLE_NATIVE_QA_BRIDGE_ENABLED__"> | null | undefined,
): boolean {
  return candidate?.__MINGLE_NATIVE_QA_BRIDGE_ENABLED__ === true;
}

export function shouldExposeNativeQaBridge(params: {
  search: string;
  isNativeAppRuntime: boolean;
  runtimeQaBridgeAuthorized: boolean;
}): boolean {
  if (!params.isNativeAppRuntime) return false;
  if (!params.runtimeQaBridgeAuthorized) return false;

  const search = new URLSearchParams(params.search || "");
  return (
    search.get("qa") === "1"
    && search.get("nativeQa") === "1"
    && search.get("sttDebug") === "1"
    && search.get("ttsDebug") === "1"
  );
}
