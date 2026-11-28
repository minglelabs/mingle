import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the speak trial before sign-in (see @/lib/speak-trial). */
export type SpeakTrialCopy = {
  /** The card's title before and while speaking ("음성 인식 테스트", owner 2026-11-25). */
  hint: string;
  /** The line under it ("따라 해 보세요"), above the phrase to read aloud (@/i18n/speak-trial-phrases). */
  followAlong: string;
  /** The title after a try in which nothing was heard: as short as the first one (owner, 2026-11-25). */
  retryHint: string;
  /** Read out by the countdown ring: "{seconds} seconds left". */
  secondsLeft: string;
  /** The length card at the end of the trial. */
  howTitle: string;
  howHint: string;
  continue: string;
  /** "Skip and sign in": the trial's way past for anyone, new or with an account (until 2026-11-21 it read "I already have an account", so new users saw no way past it). */
  haveAccount: string;
  /** Under the logo on the sign-in screen right after the trial. */
  signInNotice: string;
};

const COPY: Record<PrimaryUiLocale, SpeakTrialCopy> = {
  ko: { retryHint: "다시 한 번 테스트", haveAccount: "건너뛰고 로그인하기", hint: "음성 인식 테스트", followAlong: "따라 해 보세요", secondsLeft: "{seconds}초 남음", howTitle: "음성 인식에서 문장을 얼마나 길게 묶을까요?", howHint: "나중에 메뉴의 통역·음성 설정에서 바꿀 수 있어요", continue: "계속하기", signInNotice: "계속 쓰려면 로그인해 주세요" },
  en: { retryHint: "Let's try again", haveAccount: "Skip and sign in", hint: "Speech recognition test", followAlong: "Say this:", secondsLeft: "{seconds} seconds left", howTitle: "How long should speech recognition make each sentence?", howHint: "You can change this later in the menu, under interpretation and voice settings.", continue: "Continue", signInNotice: "Sign in to keep going" },
  ja: { retryHint: "もう一度テスト", haveAccount: "スキップしてログイン", hint: "音声認識テスト", followAlong: "まねして言ってみてください", secondsLeft: "残り{seconds}秒", howTitle: "音声認識で文をどのくらいの長さでまとめますか？", howHint: "あとでメニューの通訳・音声設定から変更できます", continue: "続ける", signInNotice: "続けるにはログインしてください" },
  "zh-CN": { retryHint: "再测试一次", haveAccount: "跳过并登录", hint: "语音识别测试", followAlong: "跟着说一遍", secondsLeft: "还剩 {seconds} 秒", howTitle: "语音识别时，句子要合并成多长？", howHint: "之后可以在菜单的口译和语音设置中更改", continue: "继续", signInNotice: "登录后即可继续使用" },
  "zh-TW": { retryHint: "再測試一次", haveAccount: "略過並登入", hint: "語音辨識測試", followAlong: "跟著說一遍", secondsLeft: "還剩 {seconds} 秒", howTitle: "語音辨識時，句子要合併成多長？", howHint: "之後可以在選單的口譯與語音設定中更改", continue: "繼續", signInNotice: "登入後即可繼續使用" },
  fr: { retryHint: "Encore une fois", haveAccount: "Passer et se connecter", hint: "Test de reconnaissance vocale", followAlong: "Répétez :", secondsLeft: "{seconds} secondes restantes", howTitle: "Quelle longueur pour chaque phrase reconnue à la voix ?", howHint: "Vous pourrez la modifier plus tard dans le menu, sous Interprétation et voix.", continue: "Continuer", signInNotice: "Connectez-vous pour continuer" },
  de: { retryHint: "Noch einmal testen", haveAccount: "Überspringen und anmelden", hint: "Spracherkennungstest", followAlong: "Sprich nach:", secondsLeft: "Noch {seconds} Sekunden", howTitle: "Wie lang soll die Spracherkennung einen Satz fassen?", howHint: "Du kannst das später im Menü unter „Dolmetschen & Stimme“ ändern.", continue: "Weiter", signInNotice: "Melde dich an, um weiterzumachen" },
  es: { retryHint: "Probemos otra vez", haveAccount: "Saltar e iniciar sesión", hint: "Prueba de reconocimiento de voz", followAlong: "Repite:", secondsLeft: "Quedan {seconds} segundos", howTitle: "¿Qué longitud debe tener cada frase del reconocimiento de voz?", howHint: "Podrás cambiarlo más tarde en el menú, en Interpretación y voz.", continue: "Continuar", signInNotice: "Inicia sesión para seguir" },
  pt: { retryHint: "Vamos testar de novo", haveAccount: "Pular e entrar", hint: "Teste de reconhecimento de voz", followAlong: "Repita:", secondsLeft: "Faltam {seconds} segundos", howTitle: "Qual deve ser o tamanho de cada frase no reconhecimento de voz?", howHint: "Você pode mudar isso depois no menu, em Interpretação e voz.", continue: "Continuar", signInNotice: "Entre para continuar" },
  it: { retryHint: "Riproviamo", haveAccount: "Salta e accedi", hint: "Test di riconoscimento vocale", followAlong: "Ripeti:", secondsLeft: "{seconds} secondi rimasti", howTitle: "Quanto deve essere lunga ogni frase nel riconoscimento vocale?", howHint: "Potrai cambiarlo più tardi nel menu, in Interpretazione e voce.", continue: "Continua", signInNotice: "Accedi per continuare" },
  ru: { retryHint: "Ещё раз", haveAccount: "Пропустить и войти", hint: "Проверка распознавания речи", followAlong: "Повторите:", secondsLeft: "Осталось {seconds} с", howTitle: "Какой длины делать фразы при распознавании речи?", howHint: "Позже это можно изменить в меню, в настройках перевода и голоса.", continue: "Продолжить", signInNotice: "Войдите, чтобы продолжить" },
  ar: { retryHint: "لنجرّب مرة أخرى", haveAccount: "تخطَّ وسجّل الدخول", hint: "اختبار التعرّف على الصوت", followAlong: "ردّد بعدي:", secondsLeft: "تبقّى {seconds} ثانية", howTitle: "كم يجب أن يكون طول الجملة في التعرّف على الكلام؟", howHint: "يمكنك تغيير ذلك لاحقًا من القائمة، في إعدادات الترجمة والصوت.", continue: "متابعة", signInNotice: "سجّل الدخول للمتابعة" },
  hi: { retryHint: "एक बार फिर टेस्ट", haveAccount: "छोड़ें और साइन इन करें", hint: "आवाज़ पहचान टेस्ट", followAlong: "दोहराएँ:", secondsLeft: "{seconds} सेकंड बाकी", howTitle: "वॉइस पहचान में हर वाक्य कितना लंबा हो?", howHint: "इसे बाद में मेनू की अनुवाद और आवाज़ सेटिंग में बदल सकते हैं।", continue: "आगे बढ़ें", signInNotice: "जारी रखने के लिए साइन इन करें" },
  th: { retryHint: "ทดสอบอีกครั้ง", haveAccount: "ข้ามและเข้าสู่ระบบ", hint: "ทดสอบการจดจำเสียง", followAlong: "พูดตามนี้", secondsLeft: "เหลือ {seconds} วินาที", howTitle: "ให้ระบบจดจำเสียงรวมประโยคยาวแค่ไหน?", howHint: "เปลี่ยนได้ภายหลังที่เมนู ในการตั้งค่าล่ามและเสียง", continue: "ต่อไป", signInNotice: "เข้าสู่ระบบเพื่อใช้งานต่อ" },
  vi: { retryHint: "Thử lại lần nữa", haveAccount: "Bỏ qua và đăng nhập", hint: "Thử nhận diện giọng nói", followAlong: "Nói theo:", secondsLeft: "Còn {seconds} giây", howTitle: "Nhận dạng giọng nói nên gộp mỗi câu dài bao nhiêu?", howHint: "Bạn có thể đổi sau trong menu, ở phần cài đặt phiên dịch và giọng nói.", continue: "Tiếp tục", signInNotice: "Đăng nhập để dùng tiếp" },
};

export function resolveSpeakTrialCopy(rawLocale: string): SpeakTrialCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
