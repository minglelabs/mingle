import {
  normalizeInstallSource,
  type NativeAppInstallSource,
} from '../../src/lib/native-app-install-source';

export type VersionPolicyAction = 'force_update' | 'recommend_update' | 'none';

export type NativeAppUpdateSnapshotStatus =
  | 'checking'
  | 'available'
  | 'current'
  | 'unknown';

export type NativeAppUpdateSnapshot = {
  status: NativeAppUpdateSnapshotStatus;
  clientVersion: string;
  latestVersion: string;
  updateUrl: string;
  updateAvailable: boolean;
  // Omitted when unknown, so the payload stays exactly what builds without
  // install-source detection send.
  installSource?: NativeAppInstallSource;
};

type VersionTuple = [number, number, number];

export function normalizeClientVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

// The install source the snapshots carry: the native runtime config value,
// except that a __DEV__ (Metro) bundle is always a local build.
export function resolveRuntimeInstallSource(
  rawInstallSource: unknown,
  isDevBuild: boolean,
): NativeAppInstallSource | undefined {
  if (isDevBuild) return 'local';
  return normalizeInstallSource(rawInstallSource);
}

function withInstallSource(
  snapshot: NativeAppUpdateSnapshot,
  installSource: NativeAppInstallSource | undefined,
): NativeAppUpdateSnapshot {
  return installSource ? { ...snapshot, installSource } : snapshot;
}

function parseSemver3(raw: string): VersionTuple | null {
  const normalized = normalizeClientVersion(raw);
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) return null;

  const parts = normalized.split('.').map(part => Number.parseInt(part, 10));
  if (parts.length !== 3) return null;
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  return [parts[0], parts[1], parts[2]];
}

function compareVersion(a: VersionTuple, b: VersionTuple): number {
  if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1;
  if (a[1] !== b[1]) return a[1] > b[1] ? 1 : -1;
  if (a[2] !== b[2]) return a[2] > b[2] ? 1 : -1;
  return 0;
}

function hasAvailableUpdate(params: {
  action?: VersionPolicyAction;
  clientVersion: string;
  latestVersion: string;
}): boolean {
  if (
    params.action === 'force_update' ||
    params.action === 'recommend_update'
  ) {
    return true;
  }

  const clientVersion = parseSemver3(params.clientVersion);
  const latestVersion = parseSemver3(params.latestVersion);
  if (!clientVersion || !latestVersion) return false;

  return compareVersion(clientVersion, latestVersion) < 0;
}

export function createCheckingNativeAppUpdateSnapshot(
  clientVersionRaw: string,
  installSource?: NativeAppInstallSource,
): NativeAppUpdateSnapshot {
  return withInstallSource(
    {
      status: 'checking',
      clientVersion: normalizeClientVersion(clientVersionRaw),
      latestVersion: '',
      updateUrl: '',
      updateAvailable: false,
    },
    installSource,
  );
}

export function createUnknownNativeAppUpdateSnapshot(
  clientVersionRaw: string,
  installSource?: NativeAppInstallSource,
): NativeAppUpdateSnapshot {
  return withInstallSource(
    {
      status: 'unknown',
      clientVersion: normalizeClientVersion(clientVersionRaw),
      latestVersion: '',
      updateUrl: '',
      updateAvailable: false,
    },
    installSource,
  );
}

export function resolveNativeAppUpdateSnapshot(
  policy: {
    action?: VersionPolicyAction;
    clientVersion?: string;
    latestVersion?: string;
    updateUrl?: string;
  },
  fallbackClientVersionRaw: string,
  installSource?: NativeAppInstallSource,
): NativeAppUpdateSnapshot {
  const fallbackClientVersion = normalizeClientVersion(
    fallbackClientVersionRaw,
  );
  const clientVersion = normalizeClientVersion(
    policy.clientVersion || fallbackClientVersion,
  );
  const latestVersion = normalizeClientVersion(policy.latestVersion || '');
  const updateUrl =
    typeof policy.updateUrl === 'string' ? policy.updateUrl.trim() : '';
  const updateAvailable = hasAvailableUpdate({
    action: policy.action,
    clientVersion,
    latestVersion,
  });

  return withInstallSource(
    {
      status: updateAvailable ? 'available' : 'current',
      clientVersion,
      latestVersion,
      updateUrl,
      updateAvailable,
    },
    installSource,
  );
}
