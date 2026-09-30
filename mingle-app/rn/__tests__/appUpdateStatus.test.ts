import {
  createCheckingNativeAppUpdateSnapshot,
  createUnknownNativeAppUpdateSnapshot,
  resolveNativeAppUpdateSnapshot,
  resolveRuntimeInstallSource,
} from '../src/appUpdateStatus';
import { NATIVE_APP_INSTALL_SOURCES } from '../../src/lib/native-app-install-source';

describe('appUpdateStatus', () => {
  it('normalizes the installed version for the checking snapshot', () => {
    expect(createCheckingNativeAppUpdateSnapshot(' v1.1.0 ')).toEqual({
      status: 'checking',
      clientVersion: '1.1.0',
      latestVersion: '',
      updateUrl: '',
      updateAvailable: false,
    });
  });

  it('marks the snapshot as current when the latest version matches', () => {
    expect(
      resolveNativeAppUpdateSnapshot(
        {
          action: 'none',
          clientVersion: '1.1.0',
          latestVersion: '1.1.0',
          updateUrl: 'https://apps.apple.com/app/id123',
        },
        '1.1.0',
      ),
    ).toEqual({
      status: 'current',
      clientVersion: '1.1.0',
      latestVersion: '1.1.0',
      updateUrl: 'https://apps.apple.com/app/id123',
      updateAvailable: false,
    });
  });

  it('marks the snapshot as available when the policy recommends an update', () => {
    expect(
      resolveNativeAppUpdateSnapshot(
        {
          action: 'recommend_update',
          clientVersion: '1.0.5',
          latestVersion: '1.1.0',
          updateUrl: 'https://apps.apple.com/app/id123',
        },
        '1.0.5',
      ),
    ).toEqual({
      status: 'available',
      clientVersion: '1.0.5',
      latestVersion: '1.1.0',
      updateUrl: 'https://apps.apple.com/app/id123',
      updateAvailable: true,
    });
  });

  it('still exposes an available update when latestVersion is newer even without a recommend action', () => {
    expect(
      resolveNativeAppUpdateSnapshot(
        {
          action: 'none',
          clientVersion: '1.0.5',
          latestVersion: '1.1.0',
          updateUrl: 'market://details?id=com.minglelabs.mingle.rn',
        },
        '1.0.5',
      ),
    ).toEqual({
      status: 'available',
      clientVersion: '1.0.5',
      latestVersion: '1.1.0',
      updateUrl: 'market://details?id=com.minglelabs.mingle.rn',
      updateAvailable: true,
    });
  });

  it('keeps the installed version when the policy status is unknown', () => {
    expect(createUnknownNativeAppUpdateSnapshot('1.1.0')).toEqual({
      status: 'unknown',
      clientVersion: '1.1.0',
      latestVersion: '',
      updateUrl: '',
      updateAvailable: false,
    });
  });

  describe('install source', () => {
    it('carries the install source from the first (checking) snapshot', () => {
      expect(createCheckingNativeAppUpdateSnapshot('2.2.0', 'testflight')).toStrictEqual({
        status: 'checking',
        clientVersion: '2.2.0',
        latestVersion: '',
        updateUrl: '',
        updateAvailable: false,
        installSource: 'testflight',
      });
    });

    it('carries the install source in the unknown snapshot', () => {
      expect(createUnknownNativeAppUpdateSnapshot('2.2.0', 'play_store')).toStrictEqual({
        status: 'unknown',
        clientVersion: '2.2.0',
        latestVersion: '',
        updateUrl: '',
        updateAvailable: false,
        installSource: 'play_store',
      });
    });

    it('carries the install source in the resolved snapshot', () => {
      expect(
        resolveNativeAppUpdateSnapshot(
          {
            action: 'recommend_update',
            clientVersion: '2.1.0',
            latestVersion: '2.2.0',
            updateUrl: 'https://apps.apple.com/app/id123',
          },
          '2.1.0',
          'app_store',
        ),
      ).toStrictEqual({
        status: 'available',
        clientVersion: '2.1.0',
        latestVersion: '2.2.0',
        updateUrl: 'https://apps.apple.com/app/id123',
        updateAvailable: true,
        installSource: 'app_store',
      });
    });

    it('omits the field entirely when the install source is unknown', () => {
      const snapshots = [
        createCheckingNativeAppUpdateSnapshot('2.2.0'),
        createUnknownNativeAppUpdateSnapshot('2.2.0', undefined),
        resolveNativeAppUpdateSnapshot({ action: 'none', latestVersion: '2.2.0' }, '2.2.0', undefined),
      ];
      for (const snapshot of snapshots) {
        expect(snapshot).not.toHaveProperty('installSource');
        expect(JSON.stringify(snapshot)).not.toContain('installSource');
      }
    });

    it('uses the native install source in release bundles', () => {
      expect(resolveRuntimeInstallSource('app_store', false)).toBe('app_store');
      expect(resolveRuntimeInstallSource('testflight', false)).toBe('testflight');
      expect(resolveRuntimeInstallSource('play_store', false)).toBe('play_store');
      expect(resolveRuntimeInstallSource('local', false)).toBe('local');
      expect(resolveRuntimeInstallSource('other', false)).toBe('other');
      expect(resolveRuntimeInstallSource(' TestFlight ', false)).toBe('testflight');
    });

    it('treats a missing or unknown native value as unknown in release bundles', () => {
      expect(resolveRuntimeInstallSource(undefined, false)).toBeUndefined();
      expect(resolveRuntimeInstallSource('', false)).toBeUndefined();
      expect(resolveRuntimeInstallSource('com.android.vending', false)).toBeUndefined();
      expect(resolveRuntimeInstallSource(42, false)).toBeUndefined();
    });

    it('forces local for __DEV__ bundles whatever the native value is', () => {
      expect(resolveRuntimeInstallSource('app_store', true)).toBe('local');
      expect(resolveRuntimeInstallSource(undefined, true)).toBe('local');
      expect(resolveRuntimeInstallSource('garbage', true)).toBe('local');
    });

    it('accepts exactly the shared web list through the RN import path', () => {
      expect([...NATIVE_APP_INSTALL_SOURCES]).toEqual([
        'app_store',
        'testflight',
        'play_store',
        'local',
        'other',
      ]);
      for (const source of NATIVE_APP_INSTALL_SOURCES) {
        expect(resolveRuntimeInstallSource(source, false)).toBe(source);
      }
    });
  });
});
