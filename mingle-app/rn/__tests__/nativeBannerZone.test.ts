import {
  resolveNativeBannerNavigationState,
  resolveNativeBannerZoneForUrl,
  type NativeBannerNavigationState,
} from '../src/nativeBannerZone';

describe('native banner navigation state', () => {
  it('infers list, conversation, and hidden zones from web URLs', () => {
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko/conversations')).toBe('list');
    expect(resolveNativeBannerZoneForUrl(
      'https://mingle.example/ko/conversations?conversation=conversation-1',
    )).toBe('conversation');
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko/mypage')).toBe('hidden');
  });

  it('only allows the exact conversations route, not its sub-routes or other screens', () => {
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko/conversations/')).toBe('list');
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko/conversations/new-group')).toBe('hidden');
    expect(resolveNativeBannerZoneForUrl(
      'https://mingle.example/ko/conversations/add-members?conversation=conversation-1',
    )).toBe('hidden');
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko/notifications')).toBe('hidden');
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/ko')).toBe('hidden');
    expect(resolveNativeBannerZoneForUrl('https://mingle.example/')).toBe('hidden');
  });

  it('hides the list banner while a conversations sub-route is open and restores it on return', () => {
    const listState: NativeBannerNavigationState = {
      activeZone: 'list',
      stableZone: 'list',
      pendingNavigationZone: null,
    };
    const onSubRoute = resolveNativeBannerNavigationState(
      listState,
      'https://mingle.example/ko/conversations/new-group',
    );
    expect(onSubRoute).toEqual({
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: 'hidden',
    });
    expect(resolveNativeBannerNavigationState(
      onSubRoute,
      'https://mingle.example/ko/conversations',
    )).toEqual(listState);
  });

  it('does not restore a list banner hidden explicitly by the authentication gate', () => {
    const authenticationGateState: NativeBannerNavigationState = {
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: null,
    };

    expect(resolveNativeBannerNavigationState(
      authenticationGateState,
      'https://mingle.example/ko/conversations',
    )).toEqual(authenticationGateState);
  });

  it('restores the stable list zone after a native navigation transition returns to the list', () => {
    expect(resolveNativeBannerNavigationState({
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: 'conversation',
    }, 'https://mingle.example/ko/conversations')).toEqual({
      activeZone: 'list',
      stableZone: 'list',
      pendingNavigationZone: null,
    });
  });

  it('hides the current banner while a different native route is settling', () => {
    expect(resolveNativeBannerNavigationState({
      activeZone: 'list',
      stableZone: 'list',
      pendingNavigationZone: null,
    }, 'https://mingle.example/ko/conversations?conversation=conversation-1')).toEqual({
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: 'conversation',
    });
  });
});
