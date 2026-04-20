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
  it('keeps the iOS Railway STT path in the full native WS URL', () => {
    const projectFile = readWorkspaceFile('ios/mingle.xcodeproj/project.pbxproj');
    const infoPlist = readWorkspaceFile('ios/mingle/Info.plist');
    const nativeSttModule = readWorkspaceFile('ios/mingle/NativeSTTModule.swift');

    expect(projectFile).toContain('NEXT_PUBLIC_WS_URL = "wss://mingle.up.railway.app/stt";');
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
});
