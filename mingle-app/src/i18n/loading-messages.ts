// Relative import on purpose: the React Native shell imports this file too.
import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "./mingle-locales";

type LocalizedText = Partial<Record<PrimaryUiLocale, string>>;

/**
 * One line shown next to the spinner on a loading screen (login, the web
 * splash, the native startup splash). One is picked at random each time.
 *
 * A line is only shown in the locales it has text for: Korean proverbs stay
 * Korean-only, tips and quotes have Korean and English. `source` is printed
 * under the line as "— source".
 */
export type LoadingMessage = { text: LocalizedText; source?: LocalizedText };

export type ResolvedLoadingMessage = { text: string; source: string | null };

const tip = (ko: string, en: string): LoadingMessage => ({ text: { ko, en } });
const quote = (ko: string, en: string, sourceKo: string, sourceEn: string): LoadingMessage => ({
  text: { ko, en },
  source: { ko: sourceKo, en: sourceEn },
});
const proverb = (ko: string): LoadingMessage => ({ text: { ko }, source: { ko: "한국 속담" } });

export const LOADING_MESSAGES: readonly LoadingMessage[] = [
  // Service tips
  tip(
    "해시챗 대화에서 음성 메시지의 발화 간격은 햄버거 메뉴에서 변경할 수 있습니다",
    "In a HashChat conversation, you can change how speech is split from the menu",
  ),
  tip(
    "수다엔 문장 길이 '짧게', 회의·통역엔 '길게'가 잘 맞아요",
    "Short sentences suit casual chats; long ones suit meetings and interpreting",
  ),
  tip("글자가 작다면 메뉴에서 텍스트 크기를 키울 수 있어요", "Text too small? Make it bigger from the menu"),
  tip(
    "스피커 모드를 켜면 번역 결과를 소리로 자동으로 읽어줘요",
    "Turn on speaker mode to hear translations read aloud automatically",
  ),
  tip(
    "메시지의 스피커 버튼을 누르면 그 메시지만 소리로 들을 수 있어요",
    "Tap a message's speaker button to hear just that message",
  ),
  tip("말하기 곤란한 자리에선 키보드 모드로 바꿔서 입력하세요", "Can't talk out loud? Switch to keyboard mode and type"),
  tip("사진 속 글자도 번역할 수 있어요", "You can translate the text in photos too"),
  tip("번역이 어색하면 메시지를 다시 번역해 볼 수 있어요", "Translation feels off? Try translating the message again"),
  tip("잘못 보낸 메시지는 회수할 수 있어요", "Sent something by mistake? You can unsend it"),
  tip("메시지에 이모지로 반응을 남겨 보세요", "React to messages with an emoji"),
  tip(
    "대화방 링크를 보내면 상대도 바로 같은 대화방에 들어올 수 있어요",
    "Send a chat room link and the other person can join the same room right away",
  ),
  tip(
    "대화목록 설정에서 '안 읽은 대화 먼저'로 정렬할 수 있어요",
    "Sort your chats by 'Unread first' in chat list settings",
  ),
  tip("대화 내용은 파일로 내보낼 수 있어요", "You can export a conversation to a file"),
  tip("연락처를 연동하면 해시챗을 쓰는 친구를 찾을 수 있어요", "Sync your contacts to find friends on HashChat"),
  tip("친구에게 해씨를 선물할 수 있어요", "You can gift Hash to your friends"),
  tip("피드의 글과 댓글도 내 언어로 번역돼요", "Feed posts and comments are translated into your language too"),
  tip("프로필 링크를 공유해서 팔로워를 늘려 보세요", "Share your profile link to grow your followers"),
  tip("불편한 사용자는 차단하거나 신고할 수 있어요", "You can block or report users who bother you"),

  // Humor (every UI locale)
  {
    text: {
      ko: "로그인 각도 좁히는 중..",
      en: "Lining up the login angle..",
      ja: "ログインの角度を詰めています..",
      "zh-CN": "正在缩小登录角度..",
      "zh-TW": "正在縮小登入角度..",
      fr: "On resserre l'angle de connexion..",
      de: "Login-Winkel wird verengt..",
      es: "Cerrando el ángulo del inicio de sesión..",
      pt: "Fechando o ângulo do login..",
      it: "Stringiamo l'angolo del login..",
      ru: "Сужаем угол входа..",
      ar: "نضيّق زاوية تسجيل الدخول..",
      hi: "लॉगिन का एंगल कसा जा रहा है..",
      th: "กำลังบีบมุมล็อกอิน..",
      vi: "Đang khép góc đăng nhập..",
    },
  },

  // Quotes
  quote(
    "내 언어의 한계는 내 세계의 한계다",
    "The limits of my language mean the limits of my world",
    "비트겐슈타인",
    "Ludwig Wittgenstein",
  ),
  quote(
    "다른 언어를 안다는 것은 두 번째 영혼을 갖는 것이다",
    "To have another language is to possess a second soul",
    "샤를마뉴",
    "Charlemagne",
  ),
  quote(
    "상대가 이해하는 말로 하면 머리에 닿고, 그의 모국어로 하면 가슴에 닿는다",
    "If you talk to a man in a language he understands, that goes to his head. If you talk to him in his language, that goes to his heart",
    "넬슨 만델라",
    "Nelson Mandela",
  ),
  quote(
    "Big things have small beginnings",
    "Big things have small beginnings",
    "데이빗, 영화 프로메테우스",
    "David, Prometheus",
  ),
  quote(
    "세상을 바꾸고 싶다면 침대 정리부터 하라",
    "If you want to change the world, start off by making your bed",
    "맥 레이븐, 미 해군 제독",
    "Admiral William H. McRaven",
  ),
  quote(
    "하루 3시간씩 걸으면 7년 뒤 지구를 한 바퀴 돈다",
    "Walk three hours a day and in seven years you will have walked around the Earth",
    "사무엘 존슨",
    "Samuel Johnson",
  ),
  quote(
    "완벽함이란 더 이상 뺄 게 없을 때 이루어진다",
    "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away",
    "생텍쥐페리",
    "Antoine de Saint-Exupéry",
  ),
  quote(
    "진리는 혼동보다 실수에서 더 많이 나온다",
    "Truth emerges more readily from error than from confusion",
    "프랜시스 베이컨",
    "Francis Bacon",
  ),
  quote(
    "아침형과 저녁형 인간의 유일한 차이는, 일찍 일어나는 쪽이 지나치게 우쭐댄다는 것",
    "The only difference between early birds and night owls is that early risers tend to be smug",
    "러셀 포스터, 옥스퍼드대 교수",
    "Russell Foster, University of Oxford",
  ),
  quote(
    "사람들에게 진실을 말하려면 웃기게 말하라",
    "If you're going to tell people the truth, be funny",
    "빌리 와일더",
    "Billy Wilder",
  ),
  quote(
    "인간은 받은 은혜만큼 베푼 은혜로도 유대가 깊어진다",
    "It is the nature of men to be bound by the benefits they confer as much as by those they receive",
    "마키아벨리, 군주론",
    "Niccolò Machiavelli, The Prince",
  ),
  quote(
    "인생에서 가장 많이 얻는 사람은 남을 가장 많이 돕는 사람이다",
    "The people who get the most out of life are the ones who help others the most",
    "앤드류 카네기",
    "Andrew Carnegie",
  ),
  quote(
    "우리는 경험이 아니라 경험에 대한 회고로부터 배운다",
    "We do not learn from experience; we learn from reflecting on experience",
    "존 듀이",
    "John Dewey",
  ),
  quote(
    "자신감 있는 표정을 지으면 자신감이 생긴다",
    "Put on a confident face and confidence will follow",
    "찰스 다윈",
    "Charles Darwin",
  ),
  quote(
    "우리가 역사에서 배우는 것은 사람들이 역사로부터 배우지 않는다는 사실이다",
    "What we learn from history is that people don't learn from history",
    "워렌 버핏",
    "Warren Buffett",
  ),

  // Korean proverbs (Korean only)
  proverb("말 한마디로 천 냥 빚을 갚는다"),
  proverb("가는 말이 고와야 오는 말이 곱다"),
  proverb("아 다르고 어 다르다"),
  proverb("발 없는 말이 천 리 간다"),
  proverb("말 안 하면 귀신도 모른다"),
  proverb("말이 씨가 된다"),
  proverb("낮말은 새가 듣고 밤말은 쥐가 듣는다"),
  proverb("입은 비뚤어져도 말은 바로 해라"),
  proverb("웃는 얼굴에 침 못 뱉는다"),
  proverb("호랑이도 제 말 하면 온다"),
  proverb("천 리 길도 한 걸음부터"),
  proverb("시작이 반이다"),
  proverb("급할수록 돌아가라"),
  proverb("첫술에 배부르랴"),
  proverb("고생 끝에 낙이 온다"),
  proverb("쥐구멍에도 볕 들 날 있다"),
  proverb("금강산도 식후경"),
  proverb("백지장도 맞들면 낫다"),
  proverb("친구 따라 강남 간다"),
  proverb("열 길 물속은 알아도 한 길 사람 속은 모른다"),
  proverb("벼는 익을수록 고개를 숙인다"),
  proverb("사공이 많으면 배가 산으로 간다"),
  proverb("떡 줄 사람은 생각도 안 하는데 김칫국부터 마신다"),
  proverb("원숭이도 나무에서 떨어진다"),
  proverb("누워서 떡 먹기"),
  proverb("빈 수레가 요란하다"),
  proverb("등잔 밑이 어둡다"),
  proverb("티끌 모아 태산"),
];

function resolveLocale(rawLocale: string | null | undefined): PrimaryUiLocale {
  return (rawLocale ? resolvePrimaryUiLocaleTag(rawLocale) : null) ?? "en";
}

/** Every loading line that has text in the given locale, in declaration order. */
export function resolveLoadingMessages(rawLocale: string | null | undefined): ResolvedLoadingMessage[] {
  const locale = resolveLocale(rawLocale);
  const messages: ResolvedLoadingMessage[] = [];
  for (const message of LOADING_MESSAGES) {
    const text = message.text[locale];
    if (!text) continue;
    messages.push({ text, source: message.source?.[locale] ?? null });
  }
  return messages;
}

/** One loading line, picked at random. `random` is injectable for tests. */
export function pickLoadingMessage(
  rawLocale: string | null | undefined,
  random: () => number = Math.random,
): ResolvedLoadingMessage | null {
  const messages = resolveLoadingMessages(rawLocale);
  if (messages.length === 0) return null;
  const index = Math.min(messages.length - 1, Math.max(0, Math.floor(random() * messages.length)));
  return messages[index];
}
