import {
  buildSmsComposeUrl,
  createNativeContactsBridge,
  sanitizeNativeContacts,
  sanitizePhoneNumber,
  type NativeContactsEvent,
} from '../src/nativeContacts';

describe('nativeContacts', () => {
  it('keeps digits and a leading plus in phone numbers', () => {
    expect(sanitizePhoneNumber(' +82 10-1234-5678 ')).toBe('+821012345678');
    expect(sanitizePhoneNumber('010 1234 5678')).toBe('01012345678');
    expect(sanitizePhoneNumber('12')).toBe('');
    expect(sanitizePhoneNumber(null)).toBe('');
  });

  it('drops contacts without a number and sorts by name', () => {
    const { contacts, truncated } = sanitizeNativeContacts([
      { id: 'b', name: 'Bora', phones: ['010-1111-2222', '010 1111 2222'] },
      { id: 'x', name: 'No phone', phones: [] },
      { id: 'a', name: '', phones: ['+1 (415) 555-0100'] },
      'junk',
    ]);
    expect(truncated).toBe(false);
    expect(contacts).toEqual([
      { id: 'a', name: '+14155550100', phones: ['+14155550100'] },
      { id: 'b', name: 'Bora', phones: ['01011112222'] },
    ]);
  });

  it('builds the sms url for each platform', () => {
    expect(buildSmsComposeUrl(['010-1234-5678'], 'hi there & you', 'ios'))
      .toBe('sms:01012345678&body=hi%20there%20%26%20you');
    expect(buildSmsComposeUrl(['01011112222', '01033334444'], 'hi', 'ios'))
      .toBe('sms:/open?addresses=01011112222,01033334444&body=hi');
    expect(buildSmsComposeUrl(['01011112222', '01033334444'], 'hi', 'android'))
      .toBe('smsto:01011112222;01033334444?body=hi');
    expect(buildSmsComposeUrl(['javascript:alert(1)'], 'hi', 'android')).toBeNull();
  });

  it('asks for permission, then hands the contacts to the page', async () => {
    const events: NativeContactsEvent[] = [];
    const bridge = createNativeContactsBridge({
      emit: event => events.push(event),
      getModule: () => ({
        checkPermission: async () => ({ permission: 'not_determined' }),
        requestPermission: async () => ({ permission: 'granted' }),
        getContacts: async () => [{ id: '1', name: 'Mina', phones: ['01012345678'] }],
      }),
    });
    await bridge.request('r1');
    expect(events).toEqual([
      { type: 'permission', permission: 'granted', requestId: 'r1' },
      { type: 'contacts', contacts: [{ id: '1', name: 'Mina', phones: ['01012345678'] }], truncated: false, requestId: 'r1' },
    ]);
  });

  it('does not read contacts when permission is refused', async () => {
    const events: NativeContactsEvent[] = [];
    const getContacts = jest.fn();
    const bridge = createNativeContactsBridge({
      emit: event => events.push(event),
      getModule: () => ({ requestPermission: async () => ({ permission: 'blocked' }), getContacts }),
    });
    await bridge.request();
    expect(getContacts).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'permission', permission: 'blocked' }]);
  });

  it('opens Messages with the written text', async () => {
    const openUrl = jest.fn().mockResolvedValue(true);
    const bridge = createNativeContactsBridge({ emit: () => {}, openUrl, platform: 'android' });
    await bridge.composeSms(['010-1234-5678'], 'join me');
    expect(openUrl).toHaveBeenCalledWith('smsto:01012345678?body=join%20me');
  });
});
