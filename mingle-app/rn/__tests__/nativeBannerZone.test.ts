import {
  applyWebNativeBannerZoneRequest,
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

  it('hides the list banner on a conversations sub-route and waits for the web to ask again on return', () => {
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
      pendingNavigationZone: null,
    });
    const backOnList = resolveNativeBannerNavigationState(
      onSubRoute,
      'https://mingle.example/ko/conversations',
    );
    expect(backOnList).toBe(onSubRoute);
    expect(applyWebNativeBannerZoneRequest(backOnList, 'list')).toEqual(listState);
  });

  it('never shows a banner on its own when the list is reached from the launch feed', () => {
    let state: NativeBannerNavigationState = {
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: null,
    };
    state = resolveNativeBannerNavigationState(state, 'https://mingle.example/ko/feed');
    state = resolveNativeBannerNavigationState(state, 'https://mingle.example/ko/feed?nativeTabRoot=1');
    // Onboarding or the sign-in gate may be covering the list: only the web knows.
    state = resolveNativeBannerNavigationState(state, 'https://mingle.example/ko/conversations');
    expect(state.activeZone).toBe('hidden');
    state = resolveNativeBannerNavigationState(state, 'https://mingle.example/ko/conversations');
    expect(state.activeZone).toBe('hidden');
  });

  it('does not undo a hidden zone the web asked for while a room transition was pending', () => {
    const pendingRoom = resolveNativeBannerNavigationState({
      activeZone: 'list',
      stableZone: 'list',
      pendingNavigationZone: null,
    }, 'https://mingle.example/ko/conversations?conversation=conversation-1');
    expect(pendingRoom.pendingNavigationZone).toBe('conversation');

    const hiddenByWeb = applyWebNativeBannerZoneRequest(pendingRoom, 'hidden');
    expect(hiddenByWeb).toEqual({
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: null,
    });
    expect(resolveNativeBannerNavigationState(
      hiddenByWeb,
      'https://mingle.example/ko/conversations',
    )).toBe(hiddenByWeb);
  });

  it('takes the zone the web asks for as the new stable zone', () => {
    expect(applyWebNativeBannerZoneRequest({
      activeZone: 'hidden',
      stableZone: 'list',
      pendingNavigationZone: 'conversation',
    }, 'conversation')).toEqual({
      activeZone: 'conversation',
      stableZone: 'conversation',
      pendingNavigationZone: null,
    });
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
