// The app's own words around the game (the game's own are in engine/client/i18n.js).
// Short, at most two lines. Korean, English and Japanese; every other app
// language reads the English.

export type HashRushGameCopy = {
  menuLabel: string
  title: string
  backToChat: string
  /** On the back pill over the map, after the chevron. */
  backShort: string
  voiceOn: string
  opening: string
  reconnecting: string
  ticketFailed: string
  connectFailed: string
  retry: string
  waitingRound: string
  waitingPlayers: string
  spectating: string
  me: string
  settings: string
  sound: string
  swapSides: string
}

const COPY: Record<'ko' | 'en' | 'ja', HashRushGameCopy> = {
  ko: {
    menuLabel: '🌻 Hash Rush 같이 하기',
    title: '🌻 Hash Rush',
    backToChat: '채팅으로',
    backShort: '채팅',
    voiceOn: '보이스톡 중',
    opening: '게임에 들어가는 중',
    reconnecting: '다시 연결하는 중',
    ticketFailed: '게임에 들어가지 못했어요',
    connectFailed: '게임 서버에 연결하지 못했어요',
    retry: '다시 시도',
    waitingRound: '곧 다음 판이 시작돼요',
    waitingPlayers: '같이 하는 사람',
    spectating: '👀 관전 중',
    me: '나',
    settings: '설정',
    sound: '소리',
    swapSides: '꿀밤 버튼 좌우 바꾸기',
  },
  en: {
    menuLabel: '🌻 Play Hash Rush together',
    title: '🌻 Hash Rush',
    backToChat: 'Back to chat',
    backShort: 'Chat',
    voiceOn: 'In a voice talk',
    opening: 'Joining the game',
    reconnecting: 'Reconnecting',
    ticketFailed: "Couldn't get into the game",
    connectFailed: "Couldn't reach the game server",
    retry: 'Try again',
    waitingRound: 'The next round starts soon',
    waitingPlayers: 'Playing',
    spectating: '👀 Watching',
    me: 'me',
    settings: 'Settings',
    sound: 'Sound',
    swapSides: 'Move the bonk button to the other side',
  },
  ja: {
    menuLabel: '🌻 Hash Rushを一緒に遊ぶ',
    title: '🌻 Hash Rush',
    backToChat: 'チャットに戻る',
    backShort: 'チャット',
    voiceOn: 'ボイストーク中',
    opening: 'ゲームに入っています',
    reconnecting: '再接続しています',
    ticketFailed: 'ゲームに入れませんでした',
    connectFailed: 'ゲームサーバーにつながりませんでした',
    retry: '再試行',
    waitingRound: 'まもなく次のラウンドです',
    waitingPlayers: '参加中',
    spectating: '👀 観戦中',
    me: 'じぶん',
    settings: '設定',
    sound: 'サウンド',
    swapSides: 'ゲンコツボタンを反対側へ',
  },
}

export function hashRushGameCopy(locale: string): HashRushGameCopy {
  const language = (locale || '').trim().toLowerCase().split(/[-_]/)[0]
  return language === 'ko' || language === 'ja' ? COPY[language] : COPY.en
}

export function hashRushGameMenuLabel(locale: string): string {
  return hashRushGameCopy(locale).menuLabel
}
