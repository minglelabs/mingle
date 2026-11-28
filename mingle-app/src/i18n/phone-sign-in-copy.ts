import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The sign-in screen's phone number button and sheet (codes and errors come from phone-friends-copy). */
export type PhoneSignInCopy = {
  button: string;
  sheetTitle: string;
  sheetBody: string;
  failed: string;
  /** Korean sign-in screen (phone first): opens Apple, Google and email. */
  otherWays: string;
};

const COPY: Record<PrimaryUiLocale, PhoneSignInCopy> = {
  ko: { button: "전화번호로 계속하기", sheetTitle: "전화번호로 시작하기", sheetBody: "문자로 받은 인증번호만 넣으면 돼요. 처음이면 바로 가입돼요.", failed: "로그인하지 못했어요. 다시 시도해 주세요.", otherWays: "다른 방법으로 로그인" },
  en: { button: "Continue with phone number", sheetTitle: "Start with your phone number", sheetBody: "Just enter the code we text you. New here? Your account is made right away.", failed: "Couldn't sign in. Please try again.", otherWays: "Other ways to sign in" },
  ja: { button: "電話番号で続ける", sheetTitle: "電話番号ではじめる", sheetBody: "SMSで届く認証コードを入力するだけ。初めての方はそのまま登録されます。", failed: "ログインできませんでした。もう一度お試しください。", otherWays: "他の方法でログイン" },
  "zh-CN": { button: "用手机号继续", sheetTitle: "用手机号开始", sheetBody: "输入短信收到的验证码即可。首次使用会直接注册。", failed: "登录失败，请重试。", otherWays: "其他登录方式" },
  "zh-TW": { button: "用手機號碼繼續", sheetTitle: "用手機號碼開始", sheetBody: "輸入簡訊收到的驗證碼即可。第一次使用會直接註冊。", failed: "登入失敗，請再試一次。", otherWays: "其他登入方式" },
  fr: { button: "Continuer avec un numéro", sheetTitle: "Commencer avec votre numéro", sheetBody: "Saisissez simplement le code reçu par SMS. Nouveau ? Votre compte est créé tout de suite.", failed: "Connexion impossible. Réessayez.", otherWays: "Autres moyens de connexion" },
  de: { button: "Mit Telefonnummer fortfahren", sheetTitle: "Mit deiner Telefonnummer starten", sheetBody: "Gib einfach den Code aus der SMS ein. Neu hier? Dein Konto wird sofort angelegt.", failed: "Anmeldung fehlgeschlagen. Bitte versuch es erneut.", otherWays: "Andere Anmeldemöglichkeiten" },
  es: { button: "Continuar con el teléfono", sheetTitle: "Empieza con tu número", sheetBody: "Solo escribe el código que te enviamos por SMS. ¿Eres nuevo? Tu cuenta se crea al momento.", failed: "No se pudo iniciar sesión. Inténtalo de nuevo.", otherWays: "Otras formas de iniciar sesión" },
  pt: { button: "Continuar com o telefone", sheetTitle: "Comece com seu número", sheetBody: "É só digitar o código enviado por SMS. Primeira vez? A conta é criada na hora.", failed: "Não foi possível entrar. Tente de novo.", otherWays: "Outras formas de entrar" },
  it: { button: "Continua con il numero", sheetTitle: "Inizia con il tuo numero", sheetBody: "Inserisci il codice che ti mandiamo via SMS. Sei nuovo? L’account viene creato subito.", failed: "Accesso non riuscito. Riprova.", otherWays: "Altri modi per accedere" },
  ru: { button: "Продолжить по номеру", sheetTitle: "Начать с номера телефона", sheetBody: "Просто введите код из SMS. Впервые здесь? Аккаунт создастся сразу.", failed: "Не удалось войти. Попробуйте ещё раз.", otherWays: "Другие способы входа" },
  ar: { button: "المتابعة برقم الهاتف", sheetTitle: "ابدأ برقم هاتفك", sheetBody: "أدخل الرمز الذي يصلك برسالة نصية فقط. جديد هنا؟ يُنشأ حسابك فورًا.", failed: "تعذّر تسجيل الدخول. حاول مرة أخرى.", otherWays: "طرق أخرى لتسجيل الدخول" },
  hi: { button: "फ़ोन नंबर से जारी रखें", sheetTitle: "अपने फ़ोन नंबर से शुरू करें", sheetBody: "बस SMS में आया कोड डालें। नए हैं? खाता तुरंत बन जाएगा।", failed: "साइन इन नहीं हो सका। फिर से कोशिश करें।", otherWays: "साइन इन के दूसरे तरीके" },
  th: { button: "ดำเนินการต่อด้วยเบอร์โทร", sheetTitle: "เริ่มด้วยเบอร์โทรของคุณ", sheetBody: "แค่ใส่รหัสที่ได้รับทาง SMS ถ้าเป็นครั้งแรกจะสมัครให้ทันที", failed: "เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง", otherWays: "เข้าสู่ระบบด้วยวิธีอื่น" },
  vi: { button: "Tiếp tục bằng số điện thoại", sheetTitle: "Bắt đầu bằng số điện thoại", sheetBody: "Chỉ cần nhập mã gửi qua SMS. Lần đầu? Tài khoản được tạo ngay.", failed: "Không đăng nhập được. Hãy thử lại.", otherWays: "Cách đăng nhập khác" },
};

export function resolvePhoneSignInCopy(rawLocale: string): PhoneSignInCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
