import fs from 'fs';
import path from 'path';

// The https share-link regression: parseNativeConversationShareLink already
// accepts https://<host>/s/<token>, but the OS never handed that URL to the
// app because only /p/ was declared natively. These assertions pin the native
// declarations so a future path (or a host rename) cannot silently drop /s/
// again — the failure mode is invisible from JS, since the app simply never
// receives a Linking event.
const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);
const ENTITLEMENTS_PATH = path.join(__dirname, '..', 'ios', 'mingle', 'mingle.entitlements');

const UNIVERSAL_LINK_PATH_PREFIXES = ['/p/', '/s/'];

function readManifest(): string {
  return fs.readFileSync(MANIFEST_PATH, 'utf8');
}

function readAutoVerifyHttpsFilters(manifest: string): string[] {
  return manifest
    .split(/<intent-filter/)
    .slice(1)
    .map((chunk) => chunk.split('</intent-filter>')[0])
    .filter((chunk) => chunk.includes('android:autoVerify="true"'))
    .filter((chunk) => /android:scheme="https"/.test(chunk));
}

function readAttributeValues(chunk: string, attribute: string): string[] {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, 'g');
  const values: string[] = [];
  let match = pattern.exec(chunk);
  while (match) {
    values.push(match[1]);
    match = pattern.exec(chunk);
  }
  return values;
}

describe('android https app-link filter', () => {
  it('keeps exactly one autoVerify https filter', () => {
    expect(readAutoVerifyHttpsFilters(readManifest())).toHaveLength(1);
  });

  it('declares both /p/ and /s/ on that filter', () => {
    const [filter] = readAutoVerifyHttpsFilters(readManifest());
    const prefixes = readAttributeValues(filter, 'android:pathPrefix');

    UNIVERSAL_LINK_PATH_PREFIXES.forEach((prefix) => {
      expect(prefixes).toContain(prefix);
    });
  });

  it('uses one host for every declared prefix', () => {
    const [filter] = readAutoVerifyHttpsFilters(readManifest());
    const hosts = new Set(readAttributeValues(filter, 'android:host'));
    const prefixCount = readAttributeValues(filter, 'android:pathPrefix').length;

    expect(hosts.size).toBe(1);
    expect(prefixCount).toBeGreaterThanOrEqual(UNIVERSAL_LINK_PATH_PREFIXES.length);
  });

  it('keeps the browsable VIEW action so the OS can route taps', () => {
    const [filter] = readAutoVerifyHttpsFilters(readManifest());

    expect(filter).toContain('android.intent.action.VIEW');
    expect(filter).toContain('android.intent.category.BROWSABLE');
  });
});

describe('ios associated domains', () => {
  it('matches the host the android app-link filter verifies', () => {
    const [filter] = readAutoVerifyHttpsFilters(readManifest());
    const [androidHost] = readAttributeValues(filter, 'android:host');
    const entitlements = fs.readFileSync(ENTITLEMENTS_PATH, 'utf8');
    const applinkHosts = (entitlements.match(/applinks:([^<]+)</g) || []).map((value) =>
      value.replace('applinks:', '').replace('<', '').trim(),
    );

    expect(applinkHosts).toContain(androidHost);
  });
});
