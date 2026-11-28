import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the required phone number screen after sign-in (see @/server/app-access, PHONE_REQUIRED). */
export type PhoneGateCopy = {
  title: string;
  /** Why the number is asked: one person, one account. */
  body: string;
  start: string;
  signOut: string;
  /** Someone who tapped "Korean" by mistake on the first screen: no number needed then. */
  notKorean: string;
  /** Said "no Korean number" while in Korea (owner, 2026-11-28): the number is still needed. */
  inKorea: string;
};

const COPY: Record<PrimaryUiLocale, PhoneGateCopy> = {
  ko: { title: "전화번호를 한 번만 인증해 주세요", body: "한 사람이 계정 하나만 쓰도록 하고, 퇴출된 사람이 다시 들어오지 못하게 하려고 확인해요. 번호는 다른 사람에게 보이지 않아요.", start: "전화번호 인증하기", signOut: "로그아웃", notKorean: "한국 전화번호가 없어요", inKorea: "한국에서는 한국 휴대폰 번호를 인증해야 쓸 수 있어요. 한국 밖에서는 번호 없이도 쓸 수 있어요." },
  en: { title: "Verify your phone number once", body: "We check it so each person has one account and anyone we ban can't come back. Your number is never shown to others.", start: "Verify phone number", signOut: "Sign out", notKorean: "I don't have a Korean phone number", inKorea: "In Korea, HashChat needs a Korean mobile number. Outside Korea you can use it without one." },
  ja: { title: "電話番号を一度だけ認証してください", body: "1人1アカウントを守り、利用停止になった人が戻れないようにするための確認です。番号がほかの人に表示されることはありません。", start: "電話番号を認証する", signOut: "ログアウト", notKorean: "韓国の電話番号を持っていません", inKorea: "韓国国内では韓国の携帯番号の認証が必要です。韓国の外では番号なしで使えます。" },
  "zh-CN": { title: "请验证一次手机号", body: "这是为了保证每人只用一个账号，并防止被封禁的人再次进入。你的号码不会展示给其他人。", start: "验证手机号", signOut: "退出登录", notKorean: "我没有韩国手机号", inKorea: "在韩国境内需要验证韩国手机号才能使用。在韩国以外无需号码也可使用。" },
  "zh-TW": { title: "請驗證一次手機號碼", body: "這是為了確保每人只用一個帳號，並防止被停權的人再次進入。你的號碼不會顯示給其他人。", start: "驗證手機號碼", signOut: "登出", notKorean: "我沒有韓國手機號碼", inKorea: "在韓國境內需要驗證韓國手機號碼才能使用。在韓國以外不需要號碼也能使用。" },
  fr: { title: "Vérifiez votre numéro une seule fois", body: "Nous le vérifions pour que chacun n’ait qu’un seul compte et qu’une personne bannie ne puisse pas revenir. Votre numéro n’est jamais montré aux autres.", start: "Vérifier mon numéro", signOut: "Se déconnecter", notKorean: "Je n’ai pas de numéro coréen", inKorea: "En Corée, il faut un numéro de mobile coréen. Hors de Corée, vous pouvez l’utiliser sans." },
  de: { title: "Bestätige einmal deine Telefonnummer", body: "So hat jede Person nur ein Konto, und wer gesperrt wurde, kommt nicht zurück. Deine Nummer wird anderen nie angezeigt.", start: "Telefonnummer bestätigen", signOut: "Abmelden", notKorean: "Ich habe keine koreanische Nummer", inKorea: "In Korea brauchst du eine koreanische Handynummer. Außerhalb Koreas geht es auch ohne." },
  es: { title: "Verifica tu número una sola vez", body: "Lo comprobamos para que cada persona tenga una sola cuenta y quien sea expulsado no pueda volver. Tu número nunca se muestra a los demás.", start: "Verificar número", signOut: "Cerrar sesión", notKorean: "No tengo un número coreano", inKorea: "En Corea necesitas un número móvil coreano. Fuera de Corea puedes usarla sin él." },
  pt: { title: "Verifique seu número uma única vez", body: "Conferimos para que cada pessoa tenha uma só conta e quem for banido não consiga voltar. Seu número nunca é mostrado a outras pessoas.", start: "Verificar número", signOut: "Sair", notKorean: "Não tenho um número coreano", inKorea: "Na Coreia, é preciso um número de celular coreano. Fora da Coreia dá para usar sem ele." },
  it: { title: "Verifica il tuo numero una sola volta", body: "Lo controlliamo perché ogni persona abbia un solo account e chi viene bandito non possa tornare. Il tuo numero non viene mai mostrato agli altri.", start: "Verifica il numero", signOut: "Esci", notKorean: "Non ho un numero coreano", inKorea: "In Corea serve un numero di cellulare coreano. Fuori dalla Corea puoi usarla anche senza." },
  ru: { title: "Подтвердите номер телефона один раз", body: "Так у каждого человека будет один аккаунт, а заблокированные не смогут вернуться. Ваш номер не виден другим.", start: "Подтвердить номер", signOut: "Выйти", notKorean: "У меня нет корейского номера", inKorea: "В Корее нужен корейский номер мобильного. За пределами Кореи можно пользоваться без него." },
  ar: { title: "تحقّق من رقم هاتفك مرة واحدة", body: "نتحقق منه ليكون لكل شخص حساب واحد فقط، وحتى لا يعود من تم حظره. رقمك لا يظهر للآخرين أبدًا.", start: "تحقّق من الرقم", signOut: "تسجيل الخروج", notKorean: "ليس لدي رقم هاتف كوري", inKorea: "داخل كوريا يلزم رقم هاتف كوري. خارج كوريا يمكنك الاستخدام بدونه." },
  hi: { title: "अपना फ़ोन नंबर एक बार वेरिफ़ाई करें", body: "हम यह इसलिए जाँचते हैं कि हर व्यक्ति का एक ही अकाउंट रहे और बैन किए गए लोग वापस न आ सकें। आपका नंबर दूसरों को कभी नहीं दिखता।", start: "फ़ोन नंबर वेरिफ़ाई करें", signOut: "साइन आउट", notKorean: "मेरे पास कोरियाई फ़ोन नंबर नहीं है", inKorea: "कोरिया में कोरियाई मोबाइल नंबर ज़रूरी है। कोरिया के बाहर बिना नंबर के भी इस्तेमाल कर सकते हैं।" },
  th: { title: "ยืนยันเบอร์โทรศัพท์เพียงครั้งเดียว", body: "เราตรวจสอบเพื่อให้หนึ่งคนมีบัญชีเดียว และคนที่ถูกแบนกลับเข้ามาไม่ได้ เบอร์ของคุณจะไม่แสดงให้คนอื่นเห็น", start: "ยืนยันเบอร์โทรศัพท์", signOut: "ออกจากระบบ", notKorean: "ฉันไม่มีเบอร์โทรศัพท์เกาหลี", inKorea: "ในเกาหลีต้องยืนยันเบอร์มือถือเกาหลีก่อนใช้งาน นอกเกาหลีใช้ได้โดยไม่ต้องมีเบอร์" },
  vi: { title: "Xác minh số điện thoại một lần", body: "Chúng tôi kiểm tra để mỗi người chỉ có một tài khoản và người bị cấm không thể quay lại. Số của bạn không bao giờ hiển thị cho người khác.", start: "Xác minh số điện thoại", signOut: "Đăng xuất", notKorean: "Tôi không có số điện thoại Hàn Quốc", inKorea: "Ở Hàn Quốc cần xác minh số điện thoại Hàn Quốc. Ngoài Hàn Quốc bạn có thể dùng mà không cần số." },
};

export const PHONE_GATE_COPY_LOCALES = Object.keys(COPY);

export function resolvePhoneGateCopy(rawLocale: string): PhoneGateCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
