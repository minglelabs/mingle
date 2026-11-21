import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the speak trial before sign-in (see @/lib/speak-trial). */
export type SpeakTrialCopy = {
  /** The card's title before and while speaking; the phrase to read aloud (@/i18n/speak-trial-phrases) shows under it. */
  hint: string;
  /** The same banner after a try in which nothing was heard. */
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
  ko: { retryHint: "잘 안 들렸어요. 마이크 가까이에서 다시 말해 보세요.", haveAccount: "건너뛰고 로그인하기", hint: "10초 동안 아래 문장을 소리 내어 말해 보세요", secondsLeft: "{seconds}초 남음", howTitle: "문장을 얼마나 길게 묶을까요?", howHint: "나중에 메뉴의 통역·음성 설정에서 바꿀 수 있어요", continue: "계속하기", signInNotice: "계속 쓰려면 로그인해 주세요" },
  en: { retryHint: "Didn't catch that. Try again a little closer to the mic.", haveAccount: "Skip and sign in", hint: "Read this out loud. You have 10 seconds", secondsLeft: "{seconds} seconds left", howTitle: "How long should each sentence run?", howHint: "You can change this later in the menu, under interpretation and voice settings.", continue: "Continue", signInNotice: "Sign in to keep going" },
  ja: { retryHint: "うまく聞き取れませんでした。マイクに近づいてもう一度話してみてください。", haveAccount: "スキップしてログイン", hint: "下の文を声に出して読んでみてください（10秒）", secondsLeft: "残り{seconds}秒", howTitle: "文をどのくらいの長さでまとめますか？", howHint: "あとでメニューの通訳・音声設定から変更できます", continue: "続ける", signInNotice: "続けるにはログインしてください" },
  "zh-CN": { retryHint: "没听清。请靠近麦克风再说一次。", haveAccount: "跳过并登录", hint: "请大声读出下面这句话（10 秒）", secondsLeft: "还剩 {seconds} 秒", howTitle: "句子要合并成多长？", howHint: "之后可以在菜单的口译和语音设置中更改", continue: "继续", signInNotice: "登录后即可继续使用" },
  "zh-TW": { retryHint: "沒聽清楚。請靠近麥克風再說一次。", haveAccount: "略過並登入", hint: "請大聲讀出下面這句話（10 秒）", secondsLeft: "還剩 {seconds} 秒", howTitle: "句子要合併成多長？", howHint: "之後可以在選單的口譯與語音設定中更改", continue: "繼續", signInNotice: "登入後即可繼續使用" },
  fr: { retryHint: "Je n’ai rien entendu. Réessayez un peu plus près du micro.", haveAccount: "Passer et se connecter", hint: "Lisez cette phrase à voix haute (10 secondes)", secondsLeft: "{seconds} secondes restantes", howTitle: "Quelle longueur pour chaque phrase ?", howHint: "Vous pourrez la modifier plus tard dans le menu, sous Interprétation et voix.", continue: "Continuer", signInNotice: "Connectez-vous pour continuer" },
  de: { retryHint: "Nichts verstanden. Versuch es noch einmal näher am Mikrofon.", haveAccount: "Überspringen und anmelden", hint: "Lies diesen Satz laut vor (10 Sekunden)", secondsLeft: "Noch {seconds} Sekunden", howTitle: "Wie lang soll ein Satz sein?", howHint: "Du kannst das später im Menü unter „Dolmetschen & Stimme“ ändern.", continue: "Weiter", signInNotice: "Melde dich an, um weiterzumachen" },
  es: { retryHint: "No se oyó bien. Prueba otra vez más cerca del micrófono.", haveAccount: "Saltar e iniciar sesión", hint: "Lee esta frase en voz alta (10 segundos)", secondsLeft: "Quedan {seconds} segundos", howTitle: "¿Qué longitud debe tener cada frase?", howHint: "Podrás cambiarlo más tarde en el menú, en Interpretación y voz.", continue: "Continuar", signInNotice: "Inicia sesión para seguir" },
  pt: { retryHint: "Não deu para ouvir. Tente de novo mais perto do microfone.", haveAccount: "Pular e entrar", hint: "Leia esta frase em voz alta (10 segundos)", secondsLeft: "Faltam {seconds} segundos", howTitle: "Qual deve ser o tamanho de cada frase?", howHint: "Você pode mudar isso depois no menu, em Interpretação e voz.", continue: "Continuar", signInNotice: "Entre para continuar" },
  it: { retryHint: "Non ho sentito. Riprova un po’ più vicino al microfono.", haveAccount: "Salta e accedi", hint: "Leggi questa frase ad alta voce (10 secondi)", secondsLeft: "{seconds} secondi rimasti", howTitle: "Quanto deve essere lunga ogni frase?", howHint: "Potrai cambiarlo più tardi nel menu, in Interpretazione e voce.", continue: "Continua", signInNotice: "Accedi per continuare" },
  ru: { retryHint: "Не расслышали. Попробуйте ещё раз ближе к микрофону.", haveAccount: "Пропустить и войти", hint: "Прочитайте эту фразу вслух (10 секунд)", secondsLeft: "Осталось {seconds} с", howTitle: "Какой длины должна быть фраза?", howHint: "Позже это можно изменить в меню, в настройках перевода и голоса.", continue: "Продолжить", signInNotice: "Войдите, чтобы продолжить" },
  ar: { retryHint: "لم نسمعك جيدًا. حاول مرة أخرى بالقرب من الميكروفون.", haveAccount: "تخطَّ وسجّل الدخول", hint: "اقرأ هذه الجملة بصوت عالٍ (10 ثوانٍ)", secondsLeft: "تبقّى {seconds} ثانية", howTitle: "كم يجب أن يكون طول الجملة؟", howHint: "يمكنك تغيير ذلك لاحقًا من القائمة، في إعدادات الترجمة والصوت.", continue: "متابعة", signInNotice: "سجّل الدخول للمتابعة" },
  hi: { retryHint: "ठीक से सुनाई नहीं दिया। माइक के पास फिर से बोलें।", haveAccount: "छोड़ें और साइन इन करें", hint: "यह वाक्य ज़ोर से पढ़िए (10 सेकंड)", secondsLeft: "{seconds} सेकंड बाकी", howTitle: "हर वाक्य कितना लंबा हो?", howHint: "इसे बाद में मेनू की अनुवाद और आवाज़ सेटिंग में बदल सकते हैं।", continue: "आगे बढ़ें", signInNotice: "जारी रखने के लिए साइन इन करें" },
  th: { retryHint: "ได้ยินไม่ชัด ลองพูดใหม่ใกล้ไมค์อีกนิด", haveAccount: "ข้ามและเข้าสู่ระบบ", hint: "อ่านประโยคนี้ออกเสียงดู (10 วินาที)", secondsLeft: "เหลือ {seconds} วินาที", howTitle: "จะให้แต่ละประโยคยาวแค่ไหน?", howHint: "เปลี่ยนได้ภายหลังที่เมนู ในการตั้งค่าล่ามและเสียง", continue: "ต่อไป", signInNotice: "เข้าสู่ระบบเพื่อใช้งานต่อ" },
  vi: { retryHint: "Chưa nghe rõ. Hãy nói lại gần micro hơn.", haveAccount: "Bỏ qua và đăng nhập", hint: "Hãy đọc to câu này (10 giây)", secondsLeft: "Còn {seconds} giây", howTitle: "Mỗi câu nên dài bao nhiêu?", howHint: "Bạn có thể đổi sau trong menu, ở phần cài đặt phiên dịch và giọng nói.", continue: "Tiếp tục", signInNotice: "Đăng nhập để dùng tiếp" },
};

export function resolveSpeakTrialCopy(rawLocale: string): SpeakTrialCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
