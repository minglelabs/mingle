import { Linking, NativeModules, Platform } from 'react-native';

/**
 * Contact sync bridge (invite friends by text message).
 *
 * Web -> native: native_contacts_check, native_contacts_request,
 * native_sms_compose.
 * Native -> web: `mingle:native-contacts` events (permission, contacts, error).
 *
 * Contacts are read on the device and handed to the page only; nothing here
 * sends them anywhere. native_sms_compose opens the system Messages app with
 * the text already written; the person still presses send.
 */

export const NATIVE_CONTACTS_EVENT = 'mingle:native-contacts';

// More than this is cut off: the list is handed to the page in one message.
export const NATIVE_CONTACTS_LIMIT = 5000;
const SMS_BODY_LIMIT = 1000;
const SMS_RECIPIENT_LIMIT = 20;

export type NativeContactsPermission =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'not_determined'
  | 'unavailable';

export type NativeContact = {
  id: string;
  name: string;
  phones: string[];
};

export type NativeContactsEvent =
  | { type: 'permission'; permission: NativeContactsPermission; requestId?: string }
  | { type: 'contacts'; contacts: NativeContact[]; truncated: boolean; requestId?: string }
  | { type: 'error'; code: string; requestId?: string };

export type NativeContactsModule = {
  checkPermission?: () => Promise<{ permission?: string } | null | undefined>;
  requestPermission?: () => Promise<{ permission?: string } | null | undefined>;
  getContacts?: () => Promise<unknown>;
};

export type NativeContactsBridge = {
  check: (requestId?: string) => Promise<void>;
  request: (requestId?: string) => Promise<void>;
  composeSms: (recipients: unknown, body: unknown) => Promise<void>;
};

export function isNativeContactsAvailable(
  module: NativeContactsModule | null | undefined = NativeModules.NativeContactsModule,
): boolean {
  return typeof module?.requestPermission === 'function' && typeof module?.getContacts === 'function';
}

export function normalizeNativeContactsPermission(value: unknown): NativeContactsPermission {
  return value === 'granted' || value === 'denied' || value === 'blocked' || value === 'not_determined'
    ? value
    : 'unavailable';
}

/** Keeps digits and a leading +; drops anything too short to be a phone number. */
export function sanitizePhoneNumber(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 4 || digits.length > 20) return '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Cleans what the native module returned: named entries with at least one number, sorted by name. */
export function sanitizeNativeContacts(raw: unknown): { contacts: NativeContact[]; truncated: boolean } {
  if (!Array.isArray(raw)) return { contacts: [], truncated: false };
  const contacts: NativeContact[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as { id?: unknown; name?: unknown; phones?: unknown };
    const phones = Array.isArray(record.phones)
      ? [...new Set(record.phones.map(sanitizePhoneNumber).filter(Boolean))]
      : [];
    if (phones.length === 0) return;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 120) : '';
    contacts.push({
      id: typeof record.id === 'string' && record.id ? record.id : `contact-${index}`,
      name: name || phones[0],
      phones: phones.slice(0, 5),
    });
  });
  contacts.sort((left, right) => left.name.localeCompare(right.name));
  return {
    contacts: contacts.slice(0, NATIVE_CONTACTS_LIMIT),
    truncated: contacts.length > NATIVE_CONTACTS_LIMIT,
  };
}

/** The URL that opens Messages with the recipients and text filled in. null = nothing valid to send. */
export function buildSmsComposeUrl(recipients: unknown, body: unknown, platform: string = Platform.OS): string | null {
  const numbers = (Array.isArray(recipients) ? recipients : [recipients])
    .map(sanitizePhoneNumber)
    .filter(Boolean)
    .slice(0, SMS_RECIPIENT_LIMIT);
  if (numbers.length === 0) return null;
  const text = typeof body === 'string' ? body.slice(0, SMS_BODY_LIMIT) : '';
  const encodedBody = encodeURIComponent(text);
  if (platform === 'ios') {
    // iOS: one number goes in the path; several need the /open?addresses form.
    return numbers.length === 1
      ? `sms:${numbers[0]}&body=${encodedBody}`
      : `sms:/open?addresses=${numbers.join(',')}&body=${encodedBody}`;
  }
  return `smsto:${numbers.join(';')}?body=${encodedBody}`;
}

export function createNativeContactsBridge(options: {
  emit: (event: NativeContactsEvent) => void;
  getModule?: () => NativeContactsModule | null | undefined;
  openUrl?: (url: string) => Promise<unknown>;
  platform?: string;
}): NativeContactsBridge {
  const getModule = options.getModule ?? (() => NativeModules.NativeContactsModule as NativeContactsModule | undefined);
  const openUrl = options.openUrl ?? ((url: string) => Linking.openURL(url));
  const withRequestId = (requestId?: string) => (requestId ? { requestId } : {});

  return {
    async check(requestId) {
      const module = getModule();
      if (!module?.checkPermission) {
        options.emit({ type: 'permission', permission: 'unavailable', ...withRequestId(requestId) });
        return;
      }
      try {
        const result = await module.checkPermission();
        options.emit({
          type: 'permission',
          permission: normalizeNativeContactsPermission(result?.permission),
          ...withRequestId(requestId),
        });
      } catch {
        options.emit({ type: 'permission', permission: 'unavailable', ...withRequestId(requestId) });
      }
    },

    async request(requestId) {
      const module = getModule();
      if (!isNativeContactsAvailable(module)) {
        options.emit({ type: 'error', code: 'contacts_unavailable', ...withRequestId(requestId) });
        return;
      }
      try {
        const result = await module!.requestPermission!();
        const permission = normalizeNativeContactsPermission(result?.permission);
        options.emit({ type: 'permission', permission, ...withRequestId(requestId) });
        if (permission !== 'granted') return;
        const { contacts, truncated } = sanitizeNativeContacts(await module!.getContacts!());
        options.emit({ type: 'contacts', contacts, truncated, ...withRequestId(requestId) });
      } catch {
        options.emit({ type: 'error', code: 'contacts_failed', ...withRequestId(requestId) });
      }
    },

    async composeSms(recipients, body) {
      const url = buildSmsComposeUrl(recipients, body, options.platform);
      if (!url) {
        options.emit({ type: 'error', code: 'sms_invalid' });
        return;
      }
      try {
        await openUrl(url);
      } catch {
        options.emit({ type: 'error', code: 'sms_unavailable' });
      }
    },
  };
}
