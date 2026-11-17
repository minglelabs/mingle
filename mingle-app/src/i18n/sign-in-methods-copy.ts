import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Copy for the "sign-in methods" sheet in Settings (one account per person):
 * the ways into the account, and taking off one that was attached later.
 * {last4} is the last four digits of a phone number.
 */
export type SignInMethodsCopy = {
  title: string;
  body: string;
  phone: string;
  extraPhone: string;
  addedLater: string;
  remove: string;
  removeConfirm: string;
  removed: string;
  failed: string;
  close: string;
  /** Shown for a moment when this sign-in was folded into the account that was already here. */
  switched: string;
  /** Asked before signing out (My Page). */
  signOutConfirm: string;
};

const COPY: Record<PrimaryUiLocale, SignInMethodsCopy> = {
  ko: { title: "로그인 수단", body: "이 계정에 들어올 수 있는 방법이에요. 나중에 연결된 것은 뗄 수 있어요.", phone: "전화번호 ••••{last4}", extraPhone: "추가 번호 ••••{last4}", addedLater: "나중에 연결됨", remove: "떼기", removeConfirm: "떼면 이 방법으로는 이 계정에 들어올 수 없어요. 뗄까요?", removed: "뗐어요.", failed: "처리하지 못했어요. 다시 시도해 주세요.", close: "닫기", switched: "이미 쓰던 계정이 있어서 그 계정으로 들어갑니다.", signOutConfirm: "로그아웃할까요?" },
  en: { title: "Sign-in methods", body: "These are the ways into this account. You can remove the ones that were added later.", phone: "Phone ••••{last4}", extraPhone: "Extra number ••••{last4}", addedLater: "Added later", remove: "Remove", removeConfirm: "Once removed, it can no longer sign in to this account. Remove it?", removed: "Removed.", failed: "That didn't work. Please try again.", close: "Close", switched: "You already have an account, so we're signing you in to it.", signOutConfirm: "Sign out?" },
  ja: { title: "ログイン方法", body: "このアカウントに入れる方法です。あとから追加されたものは解除できます。", phone: "電話番号 ••••{last4}", extraPhone: "追加の番号 ••••{last4}", addedLater: "あとから追加", remove: "解除", removeConfirm: "解除すると、この方法ではこのアカウントにログインできなくなります。解除しますか？", removed: "解除しました。", failed: "処理できませんでした。もう一度お試しください。", close: "閉じる", switched: "すでにお使いのアカウントがあるため、そのアカウントでログインします。", signOutConfirm: "ログアウトしますか？" },
  "zh-CN": { title: "登录方式", body: "这些是进入此账号的方式。之后添加的可以移除。", phone: "手机号 ••••{last4}", extraPhone: "附加号码 ••••{last4}", addedLater: "之后添加", remove: "移除", removeConfirm: "移除后将无法用它登录此账号。要移除吗？", removed: "已移除。", failed: "操作失败，请重试。", close: "关闭", switched: "你已经有一个账号，将为你登录该账号。", signOutConfirm: "要退出登录吗？" },
  "zh-TW": { title: "登入方式", body: "這些是進入此帳號的方式。之後新增的可以移除。", phone: "手機號碼 ••••{last4}", extraPhone: "附加號碼 ••••{last4}", addedLater: "之後新增", remove: "移除", removeConfirm: "移除後將無法用它登入此帳號。要移除嗎？", removed: "已移除。", failed: "操作失敗，請再試一次。", close: "關閉", switched: "你已經有一個帳號，將為你登入該帳號。", signOutConfirm: "要登出嗎？" },
  fr: { title: "Moyens de connexion", body: "Voici les façons d’accéder à ce compte. Vous pouvez retirer celles ajoutées plus tard.", phone: "Téléphone ••••{last4}", extraPhone: "Numéro supplémentaire ••••{last4}", addedLater: "Ajouté plus tard", remove: "Retirer", removeConfirm: "Une fois retiré, il ne permettra plus de se connecter à ce compte. Le retirer ?", removed: "Retiré.", failed: "Cela n’a pas fonctionné. Réessayez.", close: "Fermer", switched: "Vous avez déjà un compte : nous vous y connectons.", signOutConfirm: "Se déconnecter ?" },
  de: { title: "Anmeldemethoden", body: "So kommst du in dieses Konto. Später hinzugefügte Methoden kannst du entfernen.", phone: "Telefon ••••{last4}", extraPhone: "Zusätzliche Nummer ••••{last4}", addedLater: "Später hinzugefügt", remove: "Entfernen", removeConfirm: "Danach ist damit keine Anmeldung bei diesem Konto mehr möglich. Entfernen?", removed: "Entfernt.", failed: "Das hat nicht geklappt. Bitte versuche es erneut.", close: "Schließen", switched: "Du hast bereits ein Konto. Wir melden dich dort an.", signOutConfirm: "Möchtest du dich abmelden?" },
  es: { title: "Métodos de inicio de sesión", body: "Estas son las formas de entrar en esta cuenta. Puedes quitar las que se añadieron después.", phone: "Teléfono ••••{last4}", extraPhone: "Número adicional ••••{last4}", addedLater: "Añadido después", remove: "Quitar", removeConfirm: "Si lo quitas, ya no servirá para entrar en esta cuenta. ¿Quitarlo?", removed: "Quitado.", failed: "No se pudo completar. Inténtalo de nuevo.", close: "Cerrar", switched: "Ya tienes una cuenta, así que entrarás en ella.", signOutConfirm: "¿Cerrar sesión?" },
  pt: { title: "Métodos de login", body: "Estas são as formas de entrar nesta conta. Você pode remover as que foram adicionadas depois.", phone: "Telefone ••••{last4}", extraPhone: "Número adicional ••••{last4}", addedLater: "Adicionado depois", remove: "Remover", removeConfirm: "Depois de removido, não será mais possível entrar nesta conta com ele. Remover?", removed: "Removido.", failed: "Não deu certo. Tente novamente.", close: "Fechar", switched: "Você já tem uma conta, então vamos entrar nela.", signOutConfirm: "Sair da conta?" },
  it: { title: "Metodi di accesso", body: "Questi sono i modi per entrare in questo account. Puoi rimuovere quelli aggiunti in seguito.", phone: "Telefono ••••{last4}", extraPhone: "Numero aggiuntivo ••••{last4}", addedLater: "Aggiunto in seguito", remove: "Rimuovi", removeConfirm: "Una volta rimosso, non potrà più accedere a questo account. Rimuoverlo?", removed: "Rimosso.", failed: "Non ha funzionato. Riprova.", close: "Chiudi", switched: "Hai già un account: ti facciamo accedere a quello.", signOutConfirm: "Vuoi uscire?" },
  ru: { title: "Способы входа", body: "Это способы входа в этот аккаунт. Добавленные позже можно удалить.", phone: "Телефон ••••{last4}", extraPhone: "Дополнительный номер ••••{last4}", addedLater: "Добавлен позже", remove: "Удалить", removeConfirm: "После удаления войти в этот аккаунт этим способом будет нельзя. Удалить?", removed: "Удалено.", failed: "Не получилось. Попробуйте ещё раз.", close: "Закрыть", switched: "У вас уже есть аккаунт, поэтому мы входим в него.", signOutConfirm: "Выйти из аккаунта?" },
  ar: { title: "طرق تسجيل الدخول", body: "هذه هي طرق الدخول إلى هذا الحساب. يمكنك إزالة ما أُضيف لاحقًا.", phone: "الهاتف ••••{last4}", extraPhone: "رقم إضافي ••••{last4}", addedLater: "أُضيف لاحقًا", remove: "إزالة", removeConfirm: "بعد الإزالة لن يمكن الدخول إلى هذا الحساب بهذه الطريقة. هل تريد الإزالة؟", removed: "تمت الإزالة.", failed: "تعذّر تنفيذ ذلك. حاول مرة أخرى.", close: "إغلاق", switched: "لديك حساب بالفعل، لذا سنسجّل دخولك إليه.", signOutConfirm: "هل تريد تسجيل الخروج؟" },
  hi: { title: "साइन-इन के तरीके", body: "इस अकाउंट में आने के ये तरीके हैं। बाद में जोड़े गए तरीकों को आप हटा सकते हैं।", phone: "फ़ोन ••••{last4}", extraPhone: "अतिरिक्त नंबर ••••{last4}", addedLater: "बाद में जोड़ा गया", remove: "हटाएँ", removeConfirm: "हटाने के बाद इससे इस अकाउंट में साइन इन नहीं हो सकेगा। हटाएँ?", removed: "हटा दिया गया।", failed: "यह नहीं हो सका। फिर से कोशिश करें।", close: "बंद करें", switched: "आपका पहले से एक अकाउंट है, इसलिए हम आपको उसी में साइन इन कर रहे हैं।", signOutConfirm: "साइन आउट करें?" },
  th: { title: "วิธีเข้าสู่ระบบ", body: "นี่คือวิธีเข้าบัญชีนี้ คุณลบวิธีที่เพิ่มภายหลังได้", phone: "โทรศัพท์ ••••{last4}", extraPhone: "เบอร์เพิ่มเติม ••••{last4}", addedLater: "เพิ่มภายหลัง", remove: "ลบ", removeConfirm: "เมื่อลบแล้วจะใช้วิธีนี้เข้าบัญชีนี้ไม่ได้อีก ต้องการลบไหม", removed: "ลบแล้ว", failed: "ทำรายการไม่สำเร็จ ลองอีกครั้ง", close: "ปิด", switched: "คุณมีบัญชีอยู่แล้ว เราจะเข้าสู่ระบบด้วยบัญชีนั้น", signOutConfirm: "ออกจากระบบไหม" },
  vi: { title: "Phương thức đăng nhập", body: "Đây là các cách vào tài khoản này. Bạn có thể gỡ những cách được thêm sau.", phone: "Điện thoại ••••{last4}", extraPhone: "Số bổ sung ••••{last4}", addedLater: "Thêm sau", remove: "Gỡ", removeConfirm: "Sau khi gỡ, không thể dùng cách này để vào tài khoản này nữa. Gỡ chứ?", removed: "Đã gỡ.", failed: "Không thực hiện được. Hãy thử lại.", close: "Đóng", switched: "Bạn đã có tài khoản nên chúng tôi sẽ đăng nhập vào tài khoản đó.", signOutConfirm: "Đăng xuất?" },
};

export const SIGN_IN_METHODS_COPY_LOCALES = Object.keys(COPY);

export function resolveSignInMethodsCopy(rawLocale: string): SignInMethodsCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
