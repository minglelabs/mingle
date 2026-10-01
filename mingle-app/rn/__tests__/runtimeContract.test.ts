declare const __dirname: string;

type FileSystemModule = {
  readFileSync: (filePath: string, encoding: 'utf8') => string;
};

type PathModule = {
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
};

const fs = require('fs') as FileSystemModule;
const path = require('path') as PathModule;

const rnRoot = path.resolve(__dirname, '..');

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(rnRoot, relativePath), 'utf8');
}

describe('runtime contract', () => {
  it('keeps the iOS 2.0.2 Railway endpoints in the native runtime config', () => {
    const projectFile = readWorkspaceFile('ios/mingle.xcodeproj/project.pbxproj');
    const infoPlist = readWorkspaceFile('ios/mingle/Info.plist');
    const nativeSttModule = readWorkspaceFile('ios/mingle/NativeSTTModule.swift');

    expect(projectFile).toContain('NEXT_PUBLIC_SITE_URL = "https://mingle-2-0-0-production.up.railway.app";');
    expect(projectFile).toContain('NEXT_PUBLIC_WS_URL = "wss://mingle-2-0-0-production.up.railway.app/stt";');
    expect(projectFile).toContain('NEXT_PUBLIC_API_NAMESPACE = ios/v2.2.0;');
    expect(infoPlist).toContain('<key>MingleDefaultWsURL</key>');
    expect(infoPlist).toContain('<string>$(NEXT_PUBLIC_WS_URL)</string>');

    const fullUrlReadIndex = nativeSttModule.indexOf(
      'let legacy = Self.normalizeRuntimeConfigURL(Self.readRuntimeConfigValue(legacyKey))',
    );
    const schemeHostReadIndex = nativeSttModule.indexOf('let scheme = Self.readRuntimeConfigValue(schemeKey)');

    expect(fullUrlReadIndex).toBeGreaterThanOrEqual(0);
    expect(schemeHostReadIndex).toBeGreaterThanOrEqual(0);
    expect(fullUrlReadIndex).toBeLessThan(schemeHostReadIndex);
  });

  it('never switches the WebView to another host', () => {
    const appSource = readWorkspaceFile('App.tsx');

    expect(appSource).not.toContain('activateWebFallback');
    expect(appSource).not.toContain('FALLBACK_WEB_APP_BASE_URL');
    expect(appSource).not.toContain('DEFAULT_WS_FALLBACK_URL');
    expect(appSource).not.toContain('mingle-1-1-4-production');
    expect(appSource).toContain(
      'if (!isWebViewPageLoadFailureHttpStatus(statusCode)) return;',
    );
    expect(appSource).toContain(
      'if (rawUrl && shouldOpenNativeExternalUrl(rawUrl)) {',
    );
  });

  it('records a load failure first and ignores onLoadEnd of a failed load', () => {
    const appSource = readWorkspaceFile('App.tsx');
    const sliceHandler = (signature: string) => {
      const start = appSource.indexOf(signature);
      const end = appSource.indexOf('\n  }, [', start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return appSource.slice(start, end);
    };

    // Android sends onLoadEnd BEFORE onError, and both platforms send another
    // onLoadEnd after the error: success is only committed by the tracker.
    const loadEndBody = sliceHandler('const handleLoadEnd = useCallback(');
    expect(loadEndBody).toContain('if (loadAttemptTracker.hasFailed()) return;');
    expect(loadEndBody).toContain('loadAttemptTracker.loadFinished();');
    expect(loadEndBody.indexOf('if (loadAttemptTracker.hasFailed()) return;'))
      .toBeLessThan(loadEndBody.indexOf('isPageReadyRef.current = true;'));

    // Android reports onLoadStart only once a navigation commits (for an HTTP
    // error page that is after onHttpError), so onLoadStart must not clear a
    // failure; only a WebView remount starts a fresh attempt.
    const loadStartBody = sliceHandler('const handleLoadStart = useCallback(');
    expect(loadStartBody).toContain('loadAttemptTracker.loadStarted();');
    expect(loadStartBody).not.toContain('beginAttempt');
    expect(appSource).toContain('if (webViewMountToken > 0) loadAttemptTracker.beginAttempt();');

    for (const signature of [
      'const handleLoadError = useCallback(',
      'const handleHttpError = useCallback(',
    ]) {
      const body = sliceHandler(signature);
      expect(body.indexOf('loadAttemptTracker.loadFailed();')).toBeGreaterThanOrEqual(0);
      expect(body.indexOf('loadAttemptTracker.loadFailed();'))
        .toBeLessThan(body.indexOf('setLoadError('));
    }

    // A retried load that never reports back must not trap the user behind
    // the spinner.
    expect(appSource).toContain('}, WEBVIEW_RETRY_STALL_TIMEOUT_MS);');
    expect(appSource).toContain("setLoadError((current) => current ?? 'webview_load_stalled');");
  });

  it('retries the load at the page the user was on instead of the initial list', () => {
    const appSource = readWorkspaceFile('App.tsx');
    const retryStart = appSource.indexOf('const handleRetryLoad = useCallback(() => {');
    const retryEnd = appSource.indexOf('}, [baseWebUrl, webUrl]);', retryStart);

    expect(retryStart).toBeGreaterThanOrEqual(0);
    expect(retryEnd).toBeGreaterThan(retryStart);
    const retryBody = appSource.slice(retryStart, retryEnd);
    expect(retryBody).toContain(
      'resolveWebViewRetryUrl([lastWebViewUrlRef.current, webUrl, baseWebUrl])',
    );
    expect(retryBody).toContain('setDebugRemountWebUrl(retryUrl)');
  });

  it('covers a killed WebView render process with the same load-error overlay', () => {
    const appSource = readWorkspaceFile('App.tsx');

    expect(appSource).toContain('onRenderProcessGone={handleRenderProcessGone}');
    expect(appSource).toContain('onContentProcessDidTerminate={handleContentProcessDidTerminate}');
    expect(appSource).toContain("setLoadError('webview_render_process_gone');");
    expect(appSource).toContain("setLoadError('webview_content_process_terminated');");
  });

  it('keeps Android panel back handling separate from iOS WebView history state', () => {
    const appSource = readWorkspaceFile('App.tsx');
    const myPageSource = readWorkspaceFile('../src/components/my-page.tsx');
    const conversationListSource = readWorkspaceFile('../src/components/conversation-list.tsx');
    const publicProfileSource = readWorkspaceFile('../src/components/public-user-profile-screen.tsx');
    const profileImagePreviewSource = readWorkspaceFile('../src/components/profile-image-preview.tsx');
    const followListSource = readWorkspaceFile('../src/components/follow-list-screen.tsx');
    const profileShareSource = readWorkspaceFile('../src/components/profile-share-screen.tsx');
    const livePhoneSource = readWorkspaceFile('../src/components/LivePhoneDemo/LivePhoneDemo.tsx');
    const languageOnboardingSource = readWorkspaceFile('../src/components/LivePhoneDemo/LanguageOnboardingModal.tsx');
    const mingleHomeSource = readWorkspaceFile('../src/components/mingle-home.tsx');

    expect(appSource).toContain('canHandleAndroidBack?: boolean;');
    expect(appSource).toContain(
      '!canWebViewGoBack && !canWebViewHandleAndroidBack && !isNativeMenuOverlayOpen',
    );
    expect(myPageSource).toContain('registerNativeBackHandler');
    expect(myPageSource).toContain('postNativeAndroidBackCapability(canHandleAndroidBack);');
    expect(conversationListSource).toContain('postNativeAndroidBackCapability(canHandleAndroidBack);');
    expect(conversationListSource).toContain('if (rowActionMenu) {');
    expect(publicProfileSource).toContain('postNativeAndroidBackCapability(true);');
    expect(publicProfileSource).toContain('open={showProfileImagePreview}');
    expect(profileImagePreviewSource).toContain('registerNativeBackHandler');
    expect(profileImagePreviewSource).toContain('postNativeAndroidBackCapability(true);');
    expect(followListSource).toContain('postNativeAndroidBackCapability(true);');
    expect(profileShareSource).toContain('postNativeAndroidBackCapability(true);');
    expect(livePhoneSource).toContain('if (deleteAccountDialogOpen) {');
    expect(livePhoneSource).toContain('if (isComposerOpen) {');
    expect(languageOnboardingSource).toContain('handleStepBack();');
    expect(mingleHomeSource).toContain('postNativeAndroidBackCapability(canHandleAndroidBack);');
    expect(mingleHomeSource).toContain('if (authPanelStep === "terms") {');
  });

  it('restores native event delivery when the WebView sends a valid command', () => {
    const appSource = readWorkspaceFile('App.tsx');
    const nativeSttModule = readWorkspaceFile(
      'android/app/src/main/java/com/minglelabs/mingle/rn/NativeSTTModule.kt',
    );
    const parsedCommandIndex = appSource.indexOf(
      "if (!parsed || typeof parsed !== 'object') return;",
    );
    const pageReadyRecoveryIndex = appSource.indexOf(
      'if (!isPageReadyRef.current) {',
      parsedCommandIndex,
    );
    const nativeStartCommandIndex = appSource.indexOf(
      "if (parsed.type === 'native_stt_start') {",
      parsedCommandIndex,
    );

    expect(parsedCommandIndex).toBeGreaterThanOrEqual(0);
    expect(pageReadyRecoveryIndex).toBeGreaterThan(parsedCommandIndex);
    expect(pageReadyRecoveryIndex).toBeLessThan(nativeStartCommandIndex);
    expect(appSource.slice(pageReadyRecoveryIndex, nativeStartCommandIndex)).toContain(
      'flushPendingNativeSttMessagesToWeb();',
    );
    expect(nativeSttModule).not.toContain('if (listenerCount.get() <= 0) {');
  });
});
