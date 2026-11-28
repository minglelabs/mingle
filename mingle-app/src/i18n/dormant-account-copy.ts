import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The screen a dormant account sees (owner, 2026-11-25; src/server/dormancy.ts). */
export type DormantAccountCopy = {
  title: string;
  /** Men: a photo and the selfie check. */
  body: string;
  /** Women: a photo only. */
  bodyPhotoOnly: string;
  action: string;
  actionPhotoOnly: string;
  released: string;
  signOut: string;
};

const COPY: Record<PrimaryUiLocale, DormantAccountCopy> = {
  ko: {
    title: "휴면 계정이에요",
    body: "프로필 사진이 없어서 계정이 휴면 상태가 됐어요. 얼굴이 보이는 프로필 사진을 올리고 얼굴 인증을 마치면 바로 다시 쓸 수 있어요.",
    bodyPhotoOnly: "프로필 사진이 없어서 계정이 휴면 상태가 됐어요. 얼굴이 보이는 프로필 사진을 올리면 바로 다시 쓸 수 있어요.",
    action: "사진 올리고 얼굴 인증하기",
    actionPhotoOnly: "프로필 사진 올리기",
    released: "휴면이 풀렸어요. 다시 만나서 반가워요!",
    signOut: "로그아웃",
  },
  en: {
    title: "Your account is dormant",
    body: "Your account went dormant because it has no profile photo. Add a photo that shows your face and finish the face check to use HashChat again.",
    bodyPhotoOnly: "Your account went dormant because it has no profile photo. Add a photo that shows your face to use HashChat again.",
    action: "Add a photo and verify my face",
    actionPhotoOnly: "Add a profile photo",
    released: "Your account is active again. Welcome back!",
    signOut: "Sign out",
  },
  ja: {
    title: "休眠アカウントです",
    body: "プロフィール写真がないため、アカウントが休眠状態になりました。顔が写った写真を登録して顔認証を終えると、すぐにまた使えます。",
    bodyPhotoOnly: "プロフィール写真がないため、アカウントが休眠状態になりました。顔が写った写真を登録すると、すぐにまた使えます。",
    action: "写真を登録して顔認証する",
    actionPhotoOnly: "プロフィール写真を登録",
    released: "休眠が解除されました。おかえりなさい!",
    signOut: "ログアウト",
  },
  "zh-CN": {
    title: "账号已休眠",
    body: "由于没有头像,你的账号已进入休眠状态。上传一张能看清脸的头像并完成人脸验证后,即可继续使用。",
    bodyPhotoOnly: "由于没有头像,你的账号已进入休眠状态。上传一张能看清脸的头像后,即可继续使用。",
    action: "上传头像并验证人脸",
    actionPhotoOnly: "上传头像",
    released: "账号已恢复,欢迎回来!",
    signOut: "退出登录",
  },
  "zh-TW": {
    title: "帳號已休眠",
    body: "由於沒有大頭貼,你的帳號已進入休眠狀態。上傳一張看得清楚臉的大頭貼並完成臉部驗證後,即可繼續使用。",
    bodyPhotoOnly: "由於沒有大頭貼,你的帳號已進入休眠狀態。上傳一張看得清楚臉的大頭貼後,即可繼續使用。",
    action: "上傳大頭貼並驗證臉部",
    actionPhotoOnly: "上傳大頭貼",
    released: "帳號已恢復,歡迎回來!",
    signOut: "登出",
  },
  fr: {
    title: "Votre compte est en sommeil",
    body: "Votre compte est en sommeil car il n'a pas de photo de profil. Ajoutez une photo où l'on voit votre visage et terminez la vérification du visage pour le réactiver.",
    bodyPhotoOnly: "Votre compte est en sommeil car il n'a pas de photo de profil. Ajoutez une photo où l'on voit votre visage pour le réactiver.",
    action: "Ajouter une photo et vérifier mon visage",
    actionPhotoOnly: "Ajouter une photo de profil",
    released: "Votre compte est de nouveau actif. Bon retour !",
    signOut: "Se déconnecter",
  },
  de: {
    title: "Dein Konto ruht",
    body: "Dein Konto ruht, weil es kein Profilfoto hat. Lade ein Foto hoch, auf dem dein Gesicht zu sehen ist, und schließe die Gesichtsprüfung ab, um es wieder zu nutzen.",
    bodyPhotoOnly: "Dein Konto ruht, weil es kein Profilfoto hat. Lade ein Foto hoch, auf dem dein Gesicht zu sehen ist, um es wieder zu nutzen.",
    action: "Foto hochladen und Gesicht prüfen",
    actionPhotoOnly: "Profilfoto hochladen",
    released: "Dein Konto ist wieder aktiv. Willkommen zurück!",
    signOut: "Abmelden",
  },
  es: {
    title: "Tu cuenta está inactiva",
    body: "Tu cuenta quedó inactiva porque no tiene foto de perfil. Sube una foto donde se vea tu cara y completa la verificación facial para volver a usarla.",
    bodyPhotoOnly: "Tu cuenta quedó inactiva porque no tiene foto de perfil. Sube una foto donde se vea tu cara para volver a usarla.",
    action: "Subir foto y verificar mi cara",
    actionPhotoOnly: "Subir foto de perfil",
    released: "Tu cuenta vuelve a estar activa. ¡Qué bueno verte de nuevo!",
    signOut: "Cerrar sesión",
  },
  pt: {
    title: "Sua conta está inativa",
    body: "Sua conta ficou inativa porque não tem foto de perfil. Envie uma foto que mostre seu rosto e conclua a verificação facial para voltar a usá-la.",
    bodyPhotoOnly: "Sua conta ficou inativa porque não tem foto de perfil. Envie uma foto que mostre seu rosto para voltar a usá-la.",
    action: "Enviar foto e verificar meu rosto",
    actionPhotoOnly: "Enviar foto de perfil",
    released: "Sua conta está ativa de novo. Que bom ter você de volta!",
    signOut: "Sair",
  },
  it: {
    title: "Il tuo account è inattivo",
    body: "Il tuo account è inattivo perché non ha una foto profilo. Carica una foto in cui si vede il tuo viso e completa la verifica del viso per usarlo di nuovo.",
    bodyPhotoOnly: "Il tuo account è inattivo perché non ha una foto profilo. Carica una foto in cui si vede il tuo viso per usarlo di nuovo.",
    action: "Carica una foto e verifica il viso",
    actionPhotoOnly: "Carica una foto profilo",
    released: "Il tuo account è di nuovo attivo. Bentornato!",
    signOut: "Esci",
  },
  ru: {
    title: "Аккаунт неактивен",
    body: "Аккаунт стал неактивным, потому что в нём нет фото профиля. Добавьте фото, на котором видно ваше лицо, и пройдите проверку лица, чтобы снова пользоваться приложением.",
    bodyPhotoOnly: "Аккаунт стал неактивным, потому что в нём нет фото профиля. Добавьте фото, на котором видно ваше лицо, чтобы снова пользоваться приложением.",
    action: "Добавить фото и пройти проверку лица",
    actionPhotoOnly: "Добавить фото профиля",
    released: "Аккаунт снова активен. С возвращением!",
    signOut: "Выйти",
  },
  ar: {
    title: "حسابك خامل",
    body: "أصبح حسابك خاملاً لأنه بلا صورة شخصية. أضف صورة يظهر فيها وجهك وأكمل التحقق من الوجه لتستخدمه من جديد.",
    bodyPhotoOnly: "أصبح حسابك خاملاً لأنه بلا صورة شخصية. أضف صورة يظهر فيها وجهك لتستخدمه من جديد.",
    action: "إضافة صورة والتحقق من وجهي",
    actionPhotoOnly: "إضافة صورة شخصية",
    released: "عاد حسابك نشطاً. أهلاً بعودتك!",
    signOut: "تسجيل الخروج",
  },
  hi: {
    title: "आपका खाता निष्क्रिय है",
    body: "प्रोफ़ाइल फ़ोटो न होने के कारण आपका खाता निष्क्रिय हो गया है। ऐसा फ़ोटो जोड़ें जिसमें आपका चेहरा दिखे और चेहरे की जाँच पूरी करें, फिर आप इसे दोबारा इस्तेमाल कर सकेंगे।",
    bodyPhotoOnly: "प्रोफ़ाइल फ़ोटो न होने के कारण आपका खाता निष्क्रिय हो गया है। ऐसा फ़ोटो जोड़ें जिसमें आपका चेहरा दिखे, फिर आप इसे दोबारा इस्तेमाल कर सकेंगे।",
    action: "फ़ोटो जोड़ें और चेहरा सत्यापित करें",
    actionPhotoOnly: "प्रोफ़ाइल फ़ोटो जोड़ें",
    released: "आपका खाता फिर से सक्रिय है। वापसी पर स्वागत है!",
    signOut: "साइन आउट",
  },
  th: {
    title: "บัญชีของคุณถูกพักการใช้งาน",
    body: "บัญชีของคุณถูกพักเพราะไม่มีรูปโปรไฟล์ เพิ่มรูปที่เห็นใบหน้าและยืนยันใบหน้าให้เสร็จ แล้วกลับมาใช้ได้ทันที",
    bodyPhotoOnly: "บัญชีของคุณถูกพักเพราะไม่มีรูปโปรไฟล์ เพิ่มรูปที่เห็นใบหน้า แล้วกลับมาใช้ได้ทันที",
    action: "เพิ่มรูปและยืนยันใบหน้า",
    actionPhotoOnly: "เพิ่มรูปโปรไฟล์",
    released: "บัญชีกลับมาใช้งานได้แล้ว ยินดีต้อนรับกลับมา!",
    signOut: "ออกจากระบบ",
  },
  vi: {
    title: "Tài khoản đang tạm ngủ",
    body: "Tài khoản của bạn tạm ngủ vì chưa có ảnh đại diện. Hãy thêm ảnh thấy rõ khuôn mặt và hoàn tất xác minh khuôn mặt để dùng lại ngay.",
    bodyPhotoOnly: "Tài khoản của bạn tạm ngủ vì chưa có ảnh đại diện. Hãy thêm ảnh thấy rõ khuôn mặt để dùng lại ngay.",
    action: "Thêm ảnh và xác minh khuôn mặt",
    actionPhotoOnly: "Thêm ảnh đại diện",
    released: "Tài khoản đã hoạt động trở lại. Chào mừng bạn quay lại!",
    signOut: "Đăng xuất",
  },
};

export function resolveDormantAccountCopy(rawLocale: string): DormantAccountCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
