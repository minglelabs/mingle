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
  /** The 💬 button: the room's composer up over the game. */
  chat: string
  closeChat: string
  /** On the 💬 button while the room's voice interpretation is on. */
  interpreting: string
  quickChat: string
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
  /** A hosted room's lobby. */
  host: string
  handHost: string
  handHostTo: (name: string) => string
  botLevel: string
  hamsters: string
  /** A computer in a seat (the lobby), and the host's buttons for it. */
  computer: string
  addComputer: string
  removeComputer: string
  emptySeat: string
  /** Under the room's settings, for everyone but the host. */
  hostOnly: string
  howTo: string
  waitingHostNamed: (name: string) => string
  pickTeam: string
  hostReady: string
  handHostConfirm: string
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
    chat: '채팅',
    closeChat: '채팅 닫기',
    interpreting: '음성 통역 중',
    quickChat: '빠른 채팅',
    startsIn: (s) => `⏱ ${s}초 뒤 시작`,
    nextRoundIn: (s) => `다음 판은 ${s}초 뒤 자동으로 시작해요`,
    nextRoundSoon: '다음 판은 곧 자동으로 시작해요',
    nextChip: (s) => `⏱ 다음 판 ${s}초`,
    autoStart: '판은 자동으로 시작돼요',
    botsFill: (n) => `빈자리는 컴퓨터 ${n}명이 채워요`,
    nobodySeated: '참가한 사람이 없어요. 누가 참가하면 시작돼요',
    seatsFull: '자리가 꽉 찼어요. 빈자리가 나면 참가할 수 있어요',
    openSeats: (n) => `빈자리 ${n}개 · 친구를 더 부를 수 있어요`,
    sitNextRound: '🙋 다음 판부터 참가하기',
    lastTitle: '지난 우승',
    close: '닫기',
    scoreboard: '점수표',
    host: '방장',
    handHost: '방장 넘기기',
    handHostTo: (name) => `${name}님에게 방장을 넘길까요?`,
    botLevel: '컴퓨터',
    hamsters: '햄스터 수',
    computer: '컴퓨터',
    addComputer: '+ 컴퓨터 넣기',
    removeComputer: '빼기',
    emptySeat: '빈자리',
    hostOnly: '방장만 바꿀 수 있어요',
    howTo: '게임 방법',
    waitingHostNamed: (name) => `방장 ${name}님이 시작하기를 기다리는 중…`,
    pickTeam: '내 팀',
    hostReady: '준비되면 시작을 눌러요',
    handHostConfirm: '넘기기',
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
    chat: 'Chat',
    closeChat: 'Close chat',
    interpreting: 'Voice interpretation on',
    quickChat: 'Quick chat',
    startsIn: (s) => `⏱ Starts in ${s}s`,
    nextRoundIn: (s) => `The next round starts by itself in ${s}s`,
    nextRoundSoon: 'The next round starts by itself soon',
    nextChip: (s) => `⏱ Next round ${s}s`,
    autoStart: 'Rounds start by themselves',
    botsFill: (n) => (n === 1 ? 'A computer takes the empty seat' : `${n} computers take the empty seats`),
    nobodySeated: 'Nobody has joined. A round starts once somebody does',
    seatsFull: 'All seats are taken. You can join when one is free',
    openSeats: (n) => (n === 1 ? '1 seat open · invite a friend' : `${n} seats open · invite friends`),
    sitNextRound: '🙋 Join from the next round',
    lastTitle: 'Last title',
    close: 'Close',
    scoreboard: 'Scores',
    host: 'Host',
    handHost: 'Make host',
    handHostTo: (name) => `Make ${name} the host?`,
    botLevel: 'Computers',
    hamsters: 'Hamsters',
    computer: 'Computer',
    addComputer: '+ Add a computer',
    removeComputer: 'Remove',
    emptySeat: 'Open seat',
    hostOnly: 'Only the host can change these',
    howTo: 'How to play',
    waitingHostNamed: (name) => `Waiting for the host, ${name}, to start…`,
    pickTeam: 'My team',
    hostReady: "Press Start when everyone's ready",
    handHostConfirm: 'Hand over',
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
    chat: 'チャット',
    closeChat: 'チャットを閉じる',
    interpreting: '音声通訳中',
    quickChat: 'クイックチャット',
    startsIn: (s) => `⏱ ${s}秒後にスタート`,
    nextRoundIn: (s) => `次のラウンドは${s}秒後に自動で始まります`,
    nextRoundSoon: '次のラウンドはまもなく自動で始まります',
    nextChip: (s) => `⏱ 次まで${s}秒`,
    autoStart: 'ラウンドは自動で始まります',
    botsFill: (n) => `空いた席にはコンピューター${n}人が入ります`,
    nobodySeated: 'まだ誰も参加していません。誰かが参加すると始まります',
    seatsFull: '席がいっぱいです。空いたら参加できます',
    openSeats: (n) => `空き席 ${n} · 友だちを誘えます`,
    sitNextRound: '🙋 次のラウンドから参加',
    lastTitle: '前回の優勝',
    close: '閉じる',
    scoreboard: 'スコア表',
    host: 'ホスト',
    handHost: 'ホストを渡す',
    handHostTo: (name) => `${name}さんにホストを渡しますか？`,
    botLevel: 'コンピューター',
    hamsters: 'ハムスターの数',
    computer: 'コンピューター',
    addComputer: '+ コンピューターを入れる',
    removeComputer: '外す',
    emptySeat: '空き席',
    hostOnly: 'ホストだけが変えられます',
    howTo: 'あそびかた',
    waitingHostNamed: (name) => `ホストの${name}さんが始めるのを待っています…`,
    pickTeam: '自分のチーム',
    hostReady: '準備ができたらスタートを押してね',
    handHostConfirm: '渡す',
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
