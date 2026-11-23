import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The voice tab (2026-11-23): the always-open lounge on top and the open rooms
// with a live voice talk or game under it, in the 15 primary UI languages.
// `{count}` is replaced with a number.
export type VoiceRoomsCopy = {
  tabLabel: string
  title: string
  loungeName: string
  loungeDescription: string
  enter: string
  peopleHere: string
  nobodyYet: string
  inCall: string
  liveHeading: string
  statusVoice: string
  statusGame: string
  signInPrompt: string
  signIn: string
  loadError: string
  retry: string
  joinFailed: string
}

const COPY: Record<LegalDocumentLocale, VoiceRoomsCopy> = {
  ko: { tabLabel: '보이스룸', title: '보이스룸', loungeName: '라운지', loungeDescription: '언제나 열려 있는 방이에요. 들어와서 아무하고나 이야기해 보세요', enter: '입장하기', peopleHere: '{count}명 있어요', nobodyYet: '첫 번째로 들어가 보세요', inCall: '{count}명 통화 중', liveHeading: '지금 진행 중인 방', statusVoice: '보이스톡 중', statusGame: '게임 중', signInPrompt: '로그인하고 라운지에 들어가 보세요.', signIn: '로그인', loadError: '불러오지 못했어요', retry: '다시 시도', joinFailed: '들어가지 못했어요. 잠시 뒤에 다시 해 주세요' },
  en: { tabLabel: 'Voice rooms', title: 'Voice rooms', loungeName: 'Lounge', loungeDescription: 'Always open. Come in and talk with anyone here', enter: 'Join', peopleHere: '{count} here', nobodyYet: 'Be the first one in', inCall: '{count} on a call', liveHeading: 'Live now', statusVoice: 'Voice talk', statusGame: 'Playing a game', signInPrompt: 'Sign in to join the lounge.', signIn: 'Sign in', loadError: 'Could not load', retry: 'Try again', joinFailed: 'Could not join. Please try again in a moment' },
  ja: { tabLabel: 'ボイスルーム', title: 'ボイスルーム', loungeName: 'ラウンジ', loungeDescription: 'いつでも開いている部屋です。入って誰とでも話してみましょう', enter: '入室する', peopleHere: '{count}人います', nobodyYet: '最初に入ってみましょう', inCall: '{count}人が通話中', liveHeading: '今にぎわっている部屋', statusVoice: 'ボイストーク中', statusGame: 'ゲーム中', signInPrompt: 'ログインしてラウンジに入ってみましょう。', signIn: 'ログイン', loadError: '読み込めませんでした', retry: '再試行', joinFailed: '入室できませんでした。少し後でもう一度お試しください' },
  'zh-CN': { tabLabel: '语音房', title: '语音房', loungeName: '休息室', loungeDescription: '随时开放的房间。进来和任何人聊聊吧', enter: '进入', peopleHere: '{count}人在这里', nobodyYet: '来做第一个进来的人', inCall: '{count}人通话中', liveHeading: '正在进行的房间', statusVoice: '语音通话中', statusGame: '游戏中', signInPrompt: '登录后进入休息室吧。', signIn: '登录', loadError: '加载失败', retry: '重试', joinFailed: '无法进入，请稍后再试' },
  'zh-TW': { tabLabel: '語音房', title: '語音房', loungeName: '交誼廳', loungeDescription: '隨時開放的房間。進來和任何人聊聊吧', enter: '進入', peopleHere: '{count}人在這裡', nobodyYet: '來當第一個進來的人', inCall: '{count}人通話中', liveHeading: '正在進行的房間', statusVoice: '語音通話中', statusGame: '遊戲中', signInPrompt: '登入後進入交誼廳吧。', signIn: '登入', loadError: '載入失敗', retry: '重試', joinFailed: '無法進入，請稍後再試' },
  fr: { tabLabel: 'Salons vocaux', title: 'Salons vocaux', loungeName: 'Salon', loungeDescription: 'Toujours ouvert. Entre et parle avec qui tu veux', enter: 'Entrer', peopleHere: '{count} ici', nobodyYet: 'Sois le premier à entrer', inCall: '{count} en appel', liveHeading: 'En direct', statusVoice: 'Appel vocal', statusGame: 'Partie en cours', signInPrompt: 'Connecte-toi pour entrer dans le salon.', signIn: 'Se connecter', loadError: 'Chargement impossible', retry: 'Réessayer', joinFailed: 'Impossible d’entrer. Réessaie dans un instant' },
  de: { tabLabel: 'Sprachräume', title: 'Sprachräume', loungeName: 'Treffpunkt', loungeDescription: 'Immer offen. Komm rein und sprich mit irgendwem', enter: 'Beitreten', peopleHere: '{count} hier', nobodyYet: 'Sei als Erste:r drin', inCall: '{count} im Anruf', liveHeading: 'Gerade aktiv', statusVoice: 'Sprachanruf', statusGame: 'Spiel läuft', signInPrompt: 'Melde dich an, um den Treffpunkt zu betreten.', signIn: 'Anmelden', loadError: 'Konnte nicht laden', retry: 'Erneut versuchen', joinFailed: 'Beitritt fehlgeschlagen. Bitte gleich noch einmal versuchen' },
  es: { tabLabel: 'Salas de voz', title: 'Salas de voz', loungeName: 'Sala común', loungeDescription: 'Siempre abierta. Entra y habla con quien quieras', enter: 'Entrar', peopleHere: '{count} aquí', nobodyYet: 'Sé el primero en entrar', inCall: '{count} en llamada', liveHeading: 'En vivo ahora', statusVoice: 'Llamada de voz', statusGame: 'Jugando', signInPrompt: 'Inicia sesión para entrar en la sala común.', signIn: 'Iniciar sesión', loadError: 'No se pudo cargar', retry: 'Reintentar', joinFailed: 'No se pudo entrar. Inténtalo de nuevo en un momento' },
  pt: { tabLabel: 'Salas de voz', title: 'Salas de voz', loungeName: 'Sala de convivência', loungeDescription: 'Sempre aberta. Entre e converse com qualquer pessoa', enter: 'Entrar', peopleHere: '{count} aqui', nobodyYet: 'Seja o primeiro a entrar', inCall: '{count} em chamada', liveHeading: 'Ao vivo agora', statusVoice: 'Chamada de voz', statusGame: 'Jogando', signInPrompt: 'Entre na sua conta para acessar a sala.', signIn: 'Entrar na conta', loadError: 'Não foi possível carregar', retry: 'Tentar de novo', joinFailed: 'Não foi possível entrar. Tente de novo daqui a pouco' },
  it: { tabLabel: 'Stanze vocali', title: 'Stanze vocali', loungeName: 'Salotto', loungeDescription: 'Sempre aperto. Entra e parla con chiunque', enter: 'Entra', peopleHere: '{count} qui', nobodyYet: 'Entra per primo', inCall: '{count} in chiamata', liveHeading: 'Attive ora', statusVoice: 'Chiamata vocale', statusGame: 'Partita in corso', signInPrompt: 'Accedi per entrare nel salotto.', signIn: 'Accedi', loadError: 'Impossibile caricare', retry: 'Riprova', joinFailed: 'Impossibile entrare. Riprova tra poco' },
  ru: { tabLabel: 'Голосовые комнаты', title: 'Голосовые комнаты', loungeName: 'Лаунж', loungeDescription: 'Открыто всегда. Заходите и говорите с кем угодно', enter: 'Войти', peopleHere: 'Здесь: {count}', nobodyYet: 'Зайдите первым', inCall: 'В звонке: {count}', liveHeading: 'Сейчас идут', statusVoice: 'Голосовой звонок', statusGame: 'Идёт игра', signInPrompt: 'Войдите в аккаунт, чтобы зайти в лаунж.', signIn: 'Войти в аккаунт', loadError: 'Не удалось загрузить', retry: 'Повторить', joinFailed: 'Не удалось войти. Попробуйте чуть позже' },
  ar: { tabLabel: 'غرف صوتية', title: 'غرف صوتية', loungeName: 'الصالة', loungeDescription: 'مفتوحة دائمًا. ادخل وتحدث مع أي شخص', enter: 'دخول', peopleHere: '{count} هنا', nobodyYet: 'كن أول من يدخل', inCall: '{count} في مكالمة', liveHeading: 'مباشر الآن', statusVoice: 'مكالمة صوتية', statusGame: 'لعبة جارية', signInPrompt: 'سجّل الدخول لتدخل الصالة.', signIn: 'تسجيل الدخول', loadError: 'تعذر التحميل', retry: 'إعادة المحاولة', joinFailed: 'تعذر الدخول. حاول مرة أخرى بعد قليل' },
  hi: { tabLabel: 'वॉइस रूम', title: 'वॉइस रूम', loungeName: 'लाउंज', loungeDescription: 'हमेशा खुला रहता है। आइए और किसी से भी बात कीजिए', enter: 'शामिल हों', peopleHere: '{count} लोग यहाँ', nobodyYet: 'सबसे पहले आइए', inCall: '{count} कॉल पर', liveHeading: 'अभी चल रहे रूम', statusVoice: 'वॉइस कॉल', statusGame: 'गेम चल रहा है', signInPrompt: 'लाउंज में आने के लिए लॉग इन करें।', signIn: 'लॉग इन', loadError: 'लोड नहीं हो सका', retry: 'फिर कोशिश करें', joinFailed: 'शामिल नहीं हो सके। थोड़ी देर बाद फिर कोशिश करें' },
  th: { tabLabel: 'ห้องเสียง', title: 'ห้องเสียง', loungeName: 'เลานจ์', loungeDescription: 'เปิดตลอดเวลา เข้ามาคุยกับใครก็ได้', enter: 'เข้าห้อง', peopleHere: 'มี {count} คน', nobodyYet: 'เข้าไปเป็นคนแรกเลย', inCall: '{count} คนกำลังโทร', liveHeading: 'ห้องที่กำลังคึกคัก', statusVoice: 'กำลังโทรด้วยเสียง', statusGame: 'กำลังเล่นเกม', signInPrompt: 'เข้าสู่ระบบเพื่อเข้าเลานจ์', signIn: 'เข้าสู่ระบบ', loadError: 'โหลดไม่ได้', retry: 'ลองอีกครั้ง', joinFailed: 'เข้าห้องไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่' },
  vi: { tabLabel: 'Phòng thoại', title: 'Phòng thoại', loungeName: 'Phòng chung', loungeDescription: 'Luôn mở cửa. Vào và trò chuyện với bất kỳ ai', enter: 'Vào phòng', peopleHere: '{count} người ở đây', nobodyYet: 'Hãy là người vào đầu tiên', inCall: '{count} người đang gọi', liveHeading: 'Đang diễn ra', statusVoice: 'Gọi thoại', statusGame: 'Đang chơi game', signInPrompt: 'Đăng nhập để vào phòng chung.', signIn: 'Đăng nhập', loadError: 'Không tải được', retry: 'Thử lại', joinFailed: 'Không vào được. Hãy thử lại sau ít phút' },
}

export function voiceRoomsCopy(locale: string): VoiceRoomsCopy {
  return COPY[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')] ?? COPY.en
}

export function fillVoiceRoomsCount(template: string, count: number): string {
  return template.replace('{count}', String(count))
}
