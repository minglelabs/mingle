// The app's own words around the game (the game's own are in engine/client/i18n.js).
// Short, at most two lines. Korean, English and Japanese; every other app
// language reads the English.
//
// The room is the game server's, with no host: nobody starts a round or asks
// anybody for one. The words say that rounds start by themselves, and when.

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
  /** The lobby's countdown pill. */
  startsIn: (seconds: number) => string
  /** Under the result: the next round needs nobody to press anything. */
  nextRoundIn: (seconds: number) => string
  nextRoundSoon: string
  /** By the clock while the result card is put away. */
  nextChip: (seconds: number) => string
  autoStart: string
  botsFill: (count: number) => string
  /** Seated nobody: no round is coming until somebody joins. */
  nobodySeated: string
  seatsFull: string
  openSeats: (count: number) => string
  /** For somebody watching a round, in the strip under the map. */
  sitNextRound: string
  lastTitle: string
  close: string
  scoreboard: string
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
    startsIn: (s) => `⏱ ${s}초 뒤 시작`,
    nextRoundIn: (s) => `다음 판은 ${s}초 뒤 자동으로 시작해요`,
    nextRoundSoon: '다음 판은 곧 자동으로 시작해요',
    nextChip: (s) => `⏱ 다음 판 ${s}초`,
    autoStart: '판은 자동으로 시작돼요',
    botsFill: (n) => `빈자리는 컴퓨터 ${n}명이 채워요`,
    nobodySeated: '참가한 사람이 없어요. 누가 참가하면 시작돼요',
    seatsFull: '자리가 꽉 찼어요. 빈자리가 나면 참가할 수 있어요',
    openSeats: (n) => `빈자리 ${n}`,
    sitNextRound: '🙋 다음 판부터 참가하기',
    lastTitle: '지난 우승',
    close: '닫기',
    scoreboard: '점수표',
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
    startsIn: (s) => `⏱ Starts in ${s}s`,
    nextRoundIn: (s) => `The next round starts by itself in ${s}s`,
    nextRoundSoon: 'The next round starts by itself soon',
    nextChip: (s) => `⏱ Next round ${s}s`,
    autoStart: 'Rounds start by themselves',
    botsFill: (n) => (n === 1 ? 'A computer takes the empty seat' : `${n} computers take the empty seats`),
    nobodySeated: 'Nobody has joined. A round starts once somebody does',
    seatsFull: 'All seats are taken. You can join when one is free',
    openSeats: (n) => `${n} free`,
    sitNextRound: '🙋 Join from the next round',
    lastTitle: 'Last title',
    close: 'Close',
    scoreboard: 'Scores',
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
    startsIn: (s) => `⏱ ${s}秒後にスタート`,
    nextRoundIn: (s) => `次のラウンドは${s}秒後に自動で始まります`,
    nextRoundSoon: '次のラウンドはまもなく自動で始まります',
    nextChip: (s) => `⏱ 次まで${s}秒`,
    autoStart: 'ラウンドは自動で始まります',
    botsFill: (n) => `空いた席にはコンピューター${n}人が入ります`,
    nobodySeated: 'まだ誰も参加していません。誰かが参加すると始まります',
    seatsFull: '席がいっぱいです。空いたら参加できます',
    openSeats: (n) => `空き${n}`,
    sitNextRound: '🙋 次のラウンドから参加',
    lastTitle: '前回の優勝',
    close: '閉じる',
    scoreboard: 'スコア表',
  },
}

export function hashRushGameCopy(locale: string): HashRushGameCopy {
  const language = (locale || '').trim().toLowerCase().split(/[-_]/)[0]
  return language === 'ko' || language === 'ja' ? COPY[language] : COPY.en
}

export function hashRushGameMenuLabel(locale: string): string {
  return hashRushGameCopy(locale).menuLabel
}

/** Every language's copy, for the tests. */
export const HASH_RUSH_GAME_COPIES = COPY
