// Korean-first UI strings for the voice room. The RN shell resolves a primary
// UI locale (see ../i18n). We keep a small, self-contained string table here
// (ko + en) rather than threading the web i18n catalog into the first native
// screen; ko is the default, en is the fallback for non-ko primary locales.

export type VoiceStringKey =
  | 'bannerTitle'
  | 'bannerJoin'
  | 'startVoiceTalk'
  | 'roomTitle'
  | 'interpretOn'
  | 'interpretOff'
  | 'mute'
  | 'unmute'
  | 'micUnavailable'
  | 'speaker'
  | 'leave'
  | 'you'
  | 'invite'
  | 'captionsEmpty'
  | 'interpreterLabel'
  | 'volumeOriginal'
  | 'volumeInterpreted'
  | 'volumeModeStatic'
  | 'volumeModeDynamic'
  | 'volumeModeLabel'
  | 'connecting'
  | 'reconnecting'
  | 'roomFull'
  | 'notMember'
  | 'connectError'
  | 'miniReopen'
  | 'miniLeave';

type StringTable = Record<VoiceStringKey, string>;

const KO: StringTable = {
  bannerTitle: '🎙 보이스톡',
  bannerJoin: '참여',
  startVoiceTalk: '보이스톡 시작',
  roomTitle: '보이스톡',
  interpretOn: '통역 ON',
  interpretOff: '통역 OFF',
  mute: '마이크 끄기',
  unmute: '마이크 켜기',
  micUnavailable: '마이크 없음',
  speaker: '스피커',
  leave: '나가기',
  you: '나',
  invite: '초대',
  captionsEmpty: '아직 통역된 내용이 없어요',
  interpreterLabel: '통역',
  volumeOriginal: '원음',
  volumeInterpreted: '통역',
  volumeModeStatic: '고정: 원음을 항상 작게',
  volumeModeDynamic: '동적: 통역이 나올 때만 작게',
  volumeModeLabel: '볼륨 방식',
  connecting: '연결 중…',
  reconnecting: '재연결 중…',
  roomFull: '방이 가득 찼어요 (최대 8명)',
  notMember: '이 대화방의 멤버만 참여할 수 있어요',
  connectError: '연결에 실패했어요',
  miniReopen: '방 다시 열기',
  miniLeave: '나가기',
};

const EN: StringTable = {
  bannerTitle: '🎙 Voice talk',
  bannerJoin: 'Join',
  startVoiceTalk: 'Start voice talk',
  roomTitle: 'Voice talk',
  interpretOn: 'Interpret ON',
  interpretOff: 'Interpret OFF',
  mute: 'Mute',
  unmute: 'Unmute',
  micUnavailable: 'No mic',
  speaker: 'Speaker',
  leave: 'Leave',
  you: 'You',
  invite: 'Invite',
  captionsEmpty: 'No interpretation yet',
  interpreterLabel: 'Interpreter',
  volumeOriginal: 'Original',
  volumeInterpreted: 'Interpreted',
  volumeModeStatic: 'Static: original always quiet',
  volumeModeDynamic: 'Dynamic: quiet only while interpreting',
  volumeModeLabel: 'Volume mode',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  roomFull: 'Room is full (max 8)',
  notMember: 'Only members of this chat can join',
  connectError: 'Connection failed',
  miniReopen: 'Reopen room',
  miniLeave: 'Leave',
};

const TABLES: Record<string, StringTable> = { ko: KO, en: EN };

export function resolveVoiceStrings(primaryLocale: string | undefined | null): StringTable {
  const normalized = (primaryLocale || '').trim().toLowerCase();
  if (normalized.startsWith('ko')) return KO;
  return EN;
}

export function voiceString(
  primaryLocale: string | undefined | null,
  key: VoiceStringKey,
): string {
  return resolveVoiceStrings(primaryLocale)[key];
}

export { KO as VOICE_STRINGS_KO, EN as VOICE_STRINGS_EN };
