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
  },
}

export function hashRushInviteCopy(locale: string | null | undefined): HashRushInviteCopy {
  const lang = (locale || '').toLowerCase()
  if (lang.startsWith('ko')) return COPY.ko
  if (lang.startsWith('ja')) return COPY.ja
  return COPY.en
}
