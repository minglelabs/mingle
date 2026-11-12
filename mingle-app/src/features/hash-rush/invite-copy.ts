// Words for starting, joining and leaving a room's Hash Rush game: the room
// message, the dialogs and the invite card. Korean, English and Japanese, like
// the game's own words (copy.ts); every other app language reads the English.

export type HashRushInviteCopy = {
  startedBy: (name: string) => string
  startedByMe: string
  startedBySomeone: string
  join: string
  joined: string
  ended: string
  decline: string
  cancel: string
  startTitle: string
  startConfirm: string
  joinTitle: string
  quit: string
  quitTitle: string
  quitBody: string
  /** The room menu's Hash Rush page. */
  menuItem: string
  pageTitle: string
  statusNone: string
  statusLive: (name: string) => string
  statusLiveSomeone: string
  statusPlaying: string
  create: string
  backToGame: string
  pcLink: string
  pcLinkHint: string
  ranking: string
  howTo: string
  /** The rankings page. */
  rankingAll: string
  rankingRoom: string
  rankingEmpty: string
  rankingWins: string
  rankingRounds: string
  rankingSeeds: string
  rankingBonks: string
  rankingLoadFailed: string
  rankingMe: string
}

const COPY: Record<'ko' | 'en' | 'ja', HashRushInviteCopy> = {
  ko: {
    startedBy: (name) => `${name}님이 해시러시를 시작했습니다.`,
    startedByMe: '해시러시를 시작했습니다.',
    startedBySomeone: '해시러시가 시작됐습니다.',
    join: '참여하기',
    joined: '참여 중',
    ended: '종료된 해시러시',
    decline: '거절',
    cancel: '취소',
    startTitle: '대화방에서 해시러시를 시작하시겠습니까?',
    startConfirm: '시작하기',
    joinTitle: '해시러시에 참여하시겠습니까?',
    quit: '나가기',
    quitTitle: '해시러시에서 나가시겠습니까?',
    quitBody: '게임을 종료하고 채팅으로 돌아가요.',
    menuItem: '🌻 Hash Rush',
    pageTitle: 'Hash Rush',
    statusNone: '지금 진행 중인 게임이 없어요',
    statusLive: (name) => `${name}님의 게임이 진행 중이에요`,
    statusLiveSomeone: '게임이 진행 중이에요',
    statusPlaying: '게임에 참여 중이에요',
    create: '게임 만들기',
    backToGame: '게임으로 돌아가기',
    pcLink: '초대 링크 복사',
    pcLinkHint: '보내 주면 누구나 PC·폰 브라우저로 들어와요. 대화방이 있는 동안 계속 쓸 수 있어요',
    ranking: '랭킹',
    howTo: '게임 방법',
    rankingAll: '전체',
    rankingRoom: '이 대화방',
    rankingEmpty: '아직 기록이 없어요. 한 판 해보세요!',
    rankingWins: '승',
    rankingRounds: '판',
    rankingSeeds: '해씨',
    rankingBonks: '꿀밤',
    rankingLoadFailed: '랭킹을 불러오지 못했어요',
    rankingMe: '나',
  },
  en: {
    startedBy: (name) => `${name} started Hash Rush.`,
    startedByMe: 'You started Hash Rush.',
    startedBySomeone: 'A Hash Rush game has started.',
    join: 'Join',
    joined: 'Playing',
    ended: 'Hash Rush ended',
    decline: 'Decline',
    cancel: 'Cancel',
    startTitle: 'Start Hash Rush in this chat?',
    startConfirm: 'Start',
    joinTitle: 'Join Hash Rush?',
    quit: 'Quit',
    quitTitle: 'Quit Hash Rush?',
    quitBody: 'The game ends for you and you go back to the chat.',
    menuItem: '🌻 Hash Rush',
    pageTitle: 'Hash Rush',
    statusNone: 'No game is running right now',
    statusLive: (name) => `${name}'s game is running`,
    statusLiveSomeone: 'A game is running',
    statusPlaying: "You're in the game",
    create: 'Create a game',
    backToGame: 'Back to the game',
    pcLink: 'Copy invite link',
    pcLinkHint: 'Anyone can join from a computer or phone browser, for as long as this chat exists',
    ranking: 'Rankings',
    howTo: 'How to play',
    rankingAll: 'Everyone',
    rankingRoom: 'This chat',
    rankingEmpty: 'No games yet. Play one!',
    rankingWins: 'W',
    rankingRounds: 'Rounds',
    rankingSeeds: 'Seeds',
    rankingBonks: 'Bonks',
    rankingLoadFailed: "Couldn't load the rankings",
    rankingMe: 'Me',
  },
  ja: {
    startedBy: (name) => `${name}さんがHash Rushを始めました。`,
    startedByMe: 'Hash Rushを始めました。',
    startedBySomeone: 'Hash Rushが始まりました。',
    join: '参加する',
    joined: '参加中',
    ended: '終了したHash Rush',
    decline: '断る',
    cancel: 'キャンセル',
    startTitle: 'このチャットでHash Rushを始めますか？',
    startConfirm: '始める',
    joinTitle: 'Hash Rushに参加しますか？',
    quit: '退出',
    quitTitle: 'Hash Rushから退出しますか？',
    quitBody: 'ゲームを終了してチャットに戻ります。',
    menuItem: '🌻 Hash Rush',
    pageTitle: 'Hash Rush',
    statusNone: 'いま進行中のゲームはありません',
    statusLive: (name) => `${name}さんのゲームが進行中です`,
    statusLiveSomeone: 'ゲームが進行中です',
    statusPlaying: 'ゲームに参加中です',
    create: 'ゲームを作る',
    backToGame: 'ゲームに戻る',
    pcLink: '招待リンクをコピー',
    pcLinkHint: '送ればだれでもパソコンやスマホのブラウザで参加できます。チャットがある限り使えます',
    ranking: 'ランキング',
    howTo: 'あそびかた',
    rankingAll: '全体',
    rankingRoom: 'このチャット',
    rankingEmpty: 'まだ記録がありません。一戦どうぞ！',
    rankingWins: '勝',
    rankingRounds: '戦',
    rankingSeeds: '種',
    rankingBonks: 'げんこつ',
    rankingLoadFailed: 'ランキングを読み込めませんでした',
    rankingMe: '自分',
  },
}

export function hashRushInviteCopy(locale: string | null | undefined): HashRushInviteCopy {
  const lang = (locale || '').toLowerCase()
  if (lang.startsWith('ko')) return COPY.ko
  if (lang.startsWith('ja')) return COPY.ja
  return COPY.en
}
