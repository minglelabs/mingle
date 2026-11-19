import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the speak trial before sign-in (see @/lib/speak-trial). */
export type SpeakTrialCopy = {
  /** The banner under the header before and while speaking. */
  hint: string;
  /** The same banner after a try in which nothing was heard. */
  retryHint: string;
  /** Read out by the countdown ring: "{seconds} seconds left". */
  secondsLeft: string;
  /** The length card at the end of the trial. */
  howTitle: string;
  howHint: string;
  continue: string;
  /** Skips the trial straight to sign-in (an existing account on a new device). */
  haveAccount: string;
  /** Under the logo on the sign-in screen right after the trial. */
  signInNotice: string;
};

const COPY: Record<PrimaryUiLocale, SpeakTrialCopy> = {
  ko: { retryHint: "잘 안 들렸어요. 마이크 가까이에서 다시 말해 보세요.", haveAccount: "이미 계정이 있어요", hint: "10초 동안 아무 말이나 해 보세요. 바로 통역해 드려요.", secondsLeft: "{seconds}초 남음", howTitle: "문장을 얼마나 길게 묶을까요?", howHint: "나중에 메뉴의 통역·음성 설정에서 바꿀 수 있어요", continue: "계속하기", signInNotice: "계속 쓰려면 로그인해 주세요" },
  en: { retryHint: "Didn't catch that. Try again a little closer to the mic.", haveAccount: "I already have an account", hint: "Say anything for 10 seconds. It's interpreted as you speak.", secondsLeft: "{seconds} seconds left", howTitle: "How long should each sentence run?", howHint: "You can change this later in the menu, under interpretation and voice settings.", continue: "Continue", signInNotice: "Sign in to keep going" },
  ja: { retryHint: "うまく聞き取れませんでした。マイクに近づいてもう一度話してみてください。", haveAccount: "アカウントをお持ちの方", hint: "10秒間、何でも話してみてください。すぐに通訳します。", secondsLeft: "残り{seconds}秒", howTitle: "文をどのくらいの長さでまとめますか？", howHint: "あとでメニューの通訳・音声設定から変更できます", continue: "続ける", signInNotice: "続けるにはログインしてください" },
  "zh-CN": { retryHint: "没听清。请靠近麦克风再说一次。", haveAccount: "我已有账号", hint: "随便说 10 秒钟，马上为你口译。", secondsLeft: "还剩 {seconds} 秒", howTitle: "句子要合并成多长？", howHint: "之后可以在菜单的口译和语音设置中更改", continue: "继续", signInNotice: "登录后即可继续使用" },
  "zh-TW": { retryHint: "沒聽清楚。請靠近麥克風再說一次。", haveAccount: "我已有帳號", hint: "隨便說 10 秒鐘，馬上為你口譯。", secondsLeft: "還剩 {seconds} 秒", howTitle: "句子要合併成多長？", howHint: "之後可以在選單的口譯與語音設定中更改", continue: "繼續", signInNotice: "登入後即可繼續使用" },
  fr: { retryHint: "Je n’ai rien entendu. Réessayez un peu plus près du micro.", haveAccount: "J’ai déjà un compte", hint: "Dites ce que vous voulez pendant 10 secondes. C’est interprété en direct.", secondsLeft: "{seconds} secondes restantes", howTitle: "Quelle longueur pour chaque phrase ?", howHint: "Vous pourrez la modifier plus tard dans le menu, sous Interprétation et voix.", continue: "Continuer", signInNotice: "Connectez-vous pour continuer" },
  de: { retryHint: "Nichts verstanden. Versuch es noch einmal näher am Mikrofon.", haveAccount: "Ich habe schon ein Konto", hint: "Sag 10 Sekunden lang irgendetwas. Es wird sofort gedolmetscht.", secondsLeft: "Noch {seconds} Sekunden", howTitle: "Wie lang soll ein Satz sein?", howHint: "Du kannst das später im Menü unter „Dolmetschen & Stimme“ ändern.", continue: "Weiter", signInNotice: "Melde dich an, um weiterzumachen" },
  es: { retryHint: "No se oyó bien. Prueba otra vez más cerca del micrófono.", haveAccount: "Ya tengo una cuenta", hint: "Di lo que quieras durante 10 segundos. Se interpreta al instante.", secondsLeft: "Quedan {seconds} segundos", howTitle: "¿Qué longitud debe tener cada frase?", howHint: "Podrás cambiarlo más tarde en el menú, en Interpretación y voz.", continue: "Continuar", signInNotice: "Inicia sesión para seguir" },
  pt: { retryHint: "Não deu para ouvir. Tente de novo mais perto do microfone.", haveAccount: "Já tenho uma conta", hint: "Fale qualquer coisa por 10 segundos. A interpretação é na hora.", secondsLeft: "Faltam {seconds} segundos", howTitle: "Qual deve ser o tamanho de cada frase?", howHint: "Você pode mudar isso depois no menu, em Interpretação e voz.", continue: "Continuar", signInNotice: "Entre para continuar" },
  it: { retryHint: "Non ho sentito. Riprova un po’ più vicino al microfono.", haveAccount: "Ho già un account", hint: "Di’ quello che vuoi per 10 secondi. Viene interpretato subito.", secondsLeft: "{seconds} secondi rimasti", howTitle: "Quanto deve essere lunga ogni frase?", howHint: "Potrai cambiarlo più tardi nel menu, in Interpretazione e voce.", continue: "Continua", signInNotice: "Accedi per continuare" },
  ru: { retryHint: "Не расслышали. Попробуйте ещё раз ближе к микрофону.", haveAccount: "У меня уже есть аккаунт", hint: "Скажите что угодно в течение 10 секунд — перевод появится сразу.", secondsLeft: "Осталось {seconds} с", howTitle: "Какой длины должна быть фраза?", howHint: "Позже это можно изменить в меню, в настройках перевода и голоса.", continue: "Продолжить", signInNotice: "Войдите, чтобы продолжить" },
  ar: { retryHint: "لم نسمعك جيدًا. حاول مرة أخرى بالقرب من الميكروفون.", haveAccount: "لديّ حساب بالفعل", hint: "قل أي شيء لمدة 10 ثوانٍ، وستُترجم كلماتك فورًا.", secondsLeft: "تبقّى {seconds} ثانية", howTitle: "كم يجب أن يكون طول الجملة؟", howHint: "يمكنك تغيير ذلك لاحقًا من القائمة، في إعدادات الترجمة والصوت.", continue: "متابعة", signInNotice: "سجّل الدخول للمتابعة" },
  hi: { retryHint: "ठीक से सुनाई नहीं दिया। माइक के पास फिर से बोलें।", haveAccount: "मेरा अकाउंट पहले से है", hint: "10 सेकंड तक कुछ भी बोलिए। तुरंत अनुवाद होगा।", secondsLeft: "{seconds} सेकंड बाकी", howTitle: "हर वाक्य कितना लंबा हो?", howHint: "इसे बाद में मेनू की अनुवाद और आवाज़ सेटिंग में बदल सकते हैं।", continue: "आगे बढ़ें", signInNotice: "जारी रखने के लिए साइन इन करें" },
  th: { retryHint: "ได้ยินไม่ชัด ลองพูดใหม่ใกล้ไมค์อีกนิด", haveAccount: "มีบัญชีอยู่แล้ว", hint: "พูดอะไรก็ได้ 10 วินาที แล้วจะแปลให้ทันที", secondsLeft: "เหลือ {seconds} วินาที", howTitle: "จะให้แต่ละประโยคยาวแค่ไหน?", howHint: "เปลี่ยนได้ภายหลังที่เมนู ในการตั้งค่าล่ามและเสียง", continue: "ต่อไป", signInNotice: "เข้าสู่ระบบเพื่อใช้งานต่อ" },
  vi: { retryHint: "Chưa nghe rõ. Hãy nói lại gần micro hơn.", haveAccount: "Tôi đã có tài khoản", hint: "Hãy nói bất cứ điều gì trong 10 giây. Ứng dụng phiên dịch ngay.", secondsLeft: "Còn {seconds} giây", howTitle: "Mỗi câu nên dài bao nhiêu?", howHint: "Bạn có thể đổi sau trong menu, ở phần cài đặt phiên dịch và giọng nói.", continue: "Tiếp tục", signInNotice: "Đăng nhập để dùng tiếp" },
};

export function resolveSpeakTrialCopy(rawLocale: string): SpeakTrialCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
