import {
  createCheckingNativeAppUpdateSnapshot,
  createUnknownNativeAppUpdateSnapshot,
  resolveNativeAppUpdateSnapshot,
} from '../src/appUpdateStatus';

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
});
