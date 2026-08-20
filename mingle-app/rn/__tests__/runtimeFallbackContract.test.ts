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

describe('runtime fallback contract', () => {
  it('keeps the iOS 2.0.0 Railway endpoints in the native runtime config', () => {
    const projectFile = readWorkspaceFile('ios/mingle.xcodeproj/project.pbxproj');
    const infoPlist = readWorkspaceFile('ios/mingle/Info.plist');
    const nativeSttModule = readWorkspaceFile('ios/mingle/NativeSTTModule.swift');

    expect(projectFile).toContain('NEXT_PUBLIC_SITE_URL = "https://mingle-2-0-0-production.up.railway.app";');
    expect(projectFile).toContain('NEXT_PUBLIC_WS_URL = "wss://mingle-2-0-0-production.up.railway.app/stt";');
    expect(projectFile).toContain('NEXT_PUBLIC_API_NAMESPACE = ios/v2.0.0;');
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

  it('switches the WebView host when version policy succeeds on fallback', () => {
    const appSource = readWorkspaceFile('App.tsx');

    expect(appSource).toContain('const activateWebFallback = useCallback((): boolean => {');
    expect(appSource).toContain(
      [
        'policy = await fetchPolicy(FALLBACK_WEB_APP_BASE_URL);',
        '          if (active && !settled) {',
        '            activateWebFallback();',
        '          }',
      ].join('\n'),
    );
  });

  it('does not activate the legacy host after the initial Mingle page settles', () => {
    const appSource = readWorkspaceFile('App.tsx');

    expect(appSource).toContain(
      'if (!initialLoadSettledRef.current && activateWebFallback()) return;',
    );
    expect(appSource).toContain(
      '&& !initialLoadSettledRef.current\n      && !isPageReadyRef.current',
    );
    expect(appSource).toContain(
      'if (rawUrl && shouldOpenNativeExternalUrl(rawUrl)) {',
    );
  });

  it('keeps Android panel back handling separate from iOS WebView history state', () => {
    const appSource = readWorkspaceFile('App.tsx');
    const myPageSource = readWorkspaceFile('../src/components/my-page.tsx');

    expect(appSource).toContain('canHandleAndroidBack?: boolean;');
    expect(appSource).toContain(
      '!canWebViewGoBack && !canWebViewHandleAndroidBack && !isNativeMenuOverlayOpen',
    );
    expect(myPageSource).toContain('registerNativeBackHandler');
    expect(myPageSource).toContain('postAndroidBackCapability(canHandleAndroidBack);');
  });
});
