// Quick chat: the game's own ready-made lines (hash-rush src/client/i18n.js,
// `quickChat`), in the game's languages. In the app they sit right above the
// room's composer while it is up over the game (QuickChatBar.tsx), and a tap
// sends one as a normal room message, translated like any other
// (UIUX-ISSUES #155, #156, #201). Moved here from the iframe sheet's
// HashRushSheet.logic.ts, which re-exports them until it goes.

export const HASH_RUSH_QUICK_CHAT = {
  // The game's own list, minus its swear words: these are app-wide default chips.
  ko: ['ㄱㄱ', '잠만', 'ㅋㅋㅋ', 'ㅇㅋ', 'ㄴㄴ', 'ㅎㅇ', '굳굳 👍', 'ㄲㅂ', 'ㅈㅅ', 'ㄷㄷ', '한 판 더?', '팀 바꾸자', 'ㅂㅂ'],
  en: ['gogo', 'wait', 'lol', 'ok', 'nope', 'hey', 'gj 👍', 'unlucky', 'my bad', 'omg', 'Again?', 'swap teams?', 'bye'],
  ja: ['いこいこ', 'ちょい待ち', 'www', 'おけ', 'むり', 'ちわ', 'ナイス 👍', 'おしい', 'すまん', 'やば', 'もう一回?', 'チーム替えよう', 'またね'],
  'zh-Hans': ['冲冲冲', '等下', '哈哈哈', '好', '不要', '嗨', '666 👍', '可惜', '我的锅', '天哪', '再来?', '换队吧', '拜拜'],
  'zh-Hant': ['衝衝衝', '等一下', '哈哈哈', '好', '不要', '嗨', '讚啦 👍', '可惜', '歹勢', '天啊', '再來?', '換隊吧', '掰掰'],
} as const satisfies Record<string, readonly string[]>

/** The game's own pick (its pickLanguage): Korean, Japanese, Chinese by script, else English. */
export function hashRushQuickChat(locale: string): readonly string[] {
  const tag = (locale || '').trim().toLowerCase().replace(/_/g, '-')
  if (tag.startsWith('ko')) return HASH_RUSH_QUICK_CHAT.ko
  if (tag.startsWith('ja')) return HASH_RUSH_QUICK_CHAT.ja
  if (tag.startsWith('zh')) {
    return !tag.includes('hans') && /hant|-(tw|hk|mo)\b/.test(tag)
      ? HASH_RUSH_QUICK_CHAT['zh-Hant']
      : HASH_RUSH_QUICK_CHAT['zh-Hans']
  }
  return HASH_RUSH_QUICK_CHAT.en
}
