import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the sheet shown before a first message to someone new (see @/server/first-message-gate). */
export type FirstMessageGateCopy = {
  title: string;
  /** The title when only one row is shown (the number or the photo). */
  titleOne: string;
  /** Why: everyone you talk to is a real person with a real face. */
  body: string;
  phoneRow: string;
  phoneAction: string;
  photoRow: string;
  photoHint: string;
  photoAction: string;
  /** The face-verified photo row (owner, 2026-11-25): a selfie, or someone who follows you. */
  verifyRow: string;
  verifyHint: string;
  verifyAction: string;
  /** The current photo is being checked on the phone. */
  photoChecking: string;
  /** No face found in the photo just picked (or the current one). */
  photoNoFace: string;
  photoFailed: string;
  done: string;
  /** The photo is checked on the phone; only the answer is kept. */
  privacyNote: string;
  continueLabel: string;
  close: string;
};

const COPY: Record<PrimaryUiLocale, FirstMessageGateCopy> = {
  ko: {
    title: "처음 말 걸기 전에 두 가지만 확인할게요",
    titleOne: "처음 말 걸기 전에 하나만 확인할게요",
    body: "해시챗에서 대화하는 사람은 모두 진짜 얼굴과 번호가 확인된 사람이에요. 한 번만 하면 돼요.",
    phoneRow: "전화번호 인증", phoneAction: "인증하기",
    photoRow: "얼굴이 보이는 프로필 사진", photoHint: "내 얼굴이 잘 보이는 사진이면 돼요.", photoAction: "사진 올리기",
    photoChecking: "사진을 확인하고 있어요…",
    photoNoFace: "사진에서 얼굴을 찾지 못했어요. 얼굴이 잘 보이는 사진을 골라 주세요.",
    photoFailed: "사진을 올리지 못했어요. 다시 시도해 주세요.",
    done: "완료",
    verifyRow: "얼굴 인증된 프로필 사진", verifyHint: "셀카로 프사 속 얼굴이 나인지 확인해요. 나를 팔로우한 사람에게는 인증 없이 보낼 수 있어요.", verifyAction: "얼굴 인증",
    privacyNote: "셀카는 폰 안에서만 비교하고, 인증 결과만 저장해요.",
    continueLabel: "메시지 보내러 가기", close: "닫기",
  },
  en: {
    title: "Two quick checks before your first message",
    titleOne: "One quick check before your first message",
    body: "Everyone you talk to on HashChat has a real face and a verified number. You only do this once.",
    phoneRow: "Verify your phone number", phoneAction: "Verify",
    photoRow: "A profile photo that shows your face", photoHint: "Any photo where your face is clearly visible.", photoAction: "Add photo",
    photoChecking: "Checking your photo…",
    photoNoFace: "We couldn't find a face in this photo. Please pick one where your face is clearly visible.",
    photoFailed: "Couldn't upload the photo. Please try again.",
    done: "Done",
    verifyRow: "A face-verified profile photo", verifyHint: "A quick selfie confirms the face in your photo is you. You can message people who follow you without it.", verifyAction: "Verify face",
    privacyNote: "Your selfie is compared on your phone; only the result is saved.",
    continueLabel: "Go send the message", close: "Close",
  },
  ja: {
    title: "初めて話しかける前に、2つだけ確認します",
    titleOne: "初めて話しかける前に、1つだけ確認します",
    body: "HashChatで話す相手は、みんな顔と電話番号が確認された人です。一度だけで大丈夫です。",
    phoneRow: "電話番号の認証", phoneAction: "認証する",
    photoRow: "顔が見えるプロフィール写真", photoHint: "自分の顔がはっきり見える写真ならOKです。", photoAction: "写真を追加",
    photoChecking: "写真を確認しています…",
    photoNoFace: "写真から顔が見つかりませんでした。顔がはっきり見える写真を選んでください。",
    photoFailed: "写真をアップロードできませんでした。もう一度お試しください。",
    done: "完了",
    verifyRow: "顔認証済みのプロフィール写真", verifyHint: "セルフィーで写真の顔が本人か確認します。あなたをフォローしている人には認証なしで送れます。", verifyAction: "顔認証",
    privacyNote: "セルフィーはスマホの中だけで比べ、結果だけを保存します。",
    continueLabel: "メッセージを送る", close: "閉じる",
  },
  "zh-CN": {
    title: "第一次打招呼前，只需确认两件事",
    titleOne: "第一次打招呼前，只需确认一件事",
    body: "在 HashChat 上和你聊天的人，都确认过真实面孔和手机号。只需做一次。",
    phoneRow: "验证手机号", phoneAction: "去验证",
    photoRow: "能看到脸的头像", photoHint: "能清楚看到你脸的照片就可以。", photoAction: "上传照片",
    photoChecking: "正在检查照片…",
    photoNoFace: "照片里没有找到人脸。请选择一张能清楚看到脸的照片。",
    photoFailed: "照片上传失败，请重试。",
    done: "完成",
    verifyRow: "已通过人脸认证的头像", verifyHint: "用自拍确认头像里的人是你。关注你的人，不认证也能发消息。", verifyAction: "人脸认证",
    privacyNote: "自拍只在手机里比对，只保存认证结果。",
    continueLabel: "去发消息", close: "关闭",
  },
  "zh-TW": {
    title: "第一次打招呼前，只需確認兩件事",
    titleOne: "第一次打招呼前，只需確認一件事",
    body: "在 HashChat 上和你聊天的人，都確認過真實面孔和手機號碼。只需做一次。",
    phoneRow: "驗證手機號碼", phoneAction: "去驗證",
    photoRow: "看得到臉的大頭貼", photoHint: "能清楚看到你臉的照片就可以。", photoAction: "上傳照片",
    photoChecking: "正在檢查照片…",
    photoNoFace: "照片裡沒有找到臉。請選一張能清楚看到臉的照片。",
    photoFailed: "照片上傳失敗，請再試一次。",
    done: "完成",
    verifyRow: "已通過臉部認證的大頭貼", verifyHint: "用自拍確認大頭貼裡的人是你。追蹤你的人，不認證也能傳訊息。", verifyAction: "臉部認證",
    privacyNote: "自拍只在手機裡比對，只保存認證結果。",
    continueLabel: "去傳訊息", close: "關閉",
  },
  fr: {
    title: "Deux vérifications rapides avant votre premier message",
    titleOne: "Une vérification rapide avant votre premier message",
    body: "Sur HashChat, chaque personne a un vrai visage et un numéro vérifié. Il suffit de le faire une fois.",
    phoneRow: "Vérifier votre numéro", phoneAction: "Vérifier",
    photoRow: "Une photo de profil où l’on voit votre visage", photoHint: "N’importe quelle photo où votre visage se voit bien.", photoAction: "Ajouter une photo",
    photoChecking: "Vérification de la photo…",
    photoNoFace: "Aucun visage trouvé sur cette photo. Choisissez-en une où votre visage se voit bien.",
    photoFailed: "Impossible d’envoyer la photo. Réessayez.",
    done: "Fait",
    verifyRow: "Une photo de profil vérifiée par selfie", verifyHint: "Un selfie rapide confirme que le visage de votre photo est bien le vôtre. Vous pouvez écrire sans cela aux personnes qui vous suivent.", verifyAction: "Vérifier",
    privacyNote: "Le selfie est comparé sur votre téléphone ; seul le résultat est enregistré.",
    continueLabel: "Envoyer le message", close: "Fermer",
  },
  de: {
    title: "Zwei kurze Checks vor deiner ersten Nachricht",
    titleOne: "Ein kurzer Check vor deiner ersten Nachricht",
    body: "Auf HashChat hat jede Person ein echtes Gesicht und eine bestätigte Nummer. Das machst du nur einmal.",
    phoneRow: "Telefonnummer bestätigen", phoneAction: "Bestätigen",
    photoRow: "Ein Profilfoto, auf dem man dein Gesicht sieht", photoHint: "Jedes Foto, auf dem dein Gesicht gut zu sehen ist.", photoAction: "Foto hinzufügen",
    photoChecking: "Foto wird geprüft…",
    photoNoFace: "Auf diesem Foto wurde kein Gesicht gefunden. Wähle eins, auf dem dein Gesicht gut zu sehen ist.",
    photoFailed: "Das Foto konnte nicht hochgeladen werden. Bitte versuch es noch einmal.",
    done: "Fertig",
    verifyRow: "Ein per Selfie bestätigtes Profilfoto", verifyHint: "Ein kurzes Selfie bestätigt, dass das Gesicht auf deinem Foto du bist. Leuten, die dir folgen, kannst du auch ohne schreiben.", verifyAction: "Bestätigen",
    privacyNote: "Das Selfie wird auf deinem Handy verglichen; gespeichert wird nur das Ergebnis.",
    continueLabel: "Zur Nachricht", close: "Schließen",
  },
  es: {
    title: "Dos comprobaciones rápidas antes de tu primer mensaje",
    titleOne: "Una comprobación rápida antes de tu primer mensaje",
    body: "En HashChat todas las personas tienen una cara real y un número verificado. Solo lo haces una vez.",
    phoneRow: "Verificar tu número", phoneAction: "Verificar",
    photoRow: "Una foto de perfil donde se vea tu cara", photoHint: "Cualquier foto en la que se vea bien tu cara.", photoAction: "Añadir foto",
    photoChecking: "Comprobando la foto…",
    photoNoFace: "No encontramos ninguna cara en esta foto. Elige una en la que se vea bien tu cara.",
    photoFailed: "No se pudo subir la foto. Inténtalo de nuevo.",
    done: "Hecho",
    verifyRow: "Una foto de perfil verificada con selfie", verifyHint: "Un selfie rápido confirma que la cara de tu foto eres tú. A quien te sigue puedes escribirle sin esto.", verifyAction: "Verificar",
    privacyNote: "El selfie se compara en tu teléfono; solo se guarda el resultado.",
    continueLabel: "Ir a enviar el mensaje", close: "Cerrar",
  },
  pt: {
    title: "Duas verificações rápidas antes da primeira mensagem",
    titleOne: "Uma verificação rápida antes da primeira mensagem",
    body: "No HashChat, todas as pessoas têm um rosto real e um número verificado. Você só faz isso uma vez.",
    phoneRow: "Verificar seu número", phoneAction: "Verificar",
    photoRow: "Uma foto de perfil que mostre seu rosto", photoHint: "Qualquer foto em que seu rosto apareça bem.", photoAction: "Adicionar foto",
    photoChecking: "Verificando a foto…",
    photoNoFace: "Não encontramos um rosto nesta foto. Escolha uma em que seu rosto apareça bem.",
    photoFailed: "Não foi possível enviar a foto. Tente de novo.",
    done: "Pronto",
    verifyRow: "Uma foto de perfil verificada por selfie", verifyHint: "Uma selfie rápida confirma que o rosto da sua foto é você. Para quem segue você, dá para mandar mensagem sem isso.", verifyAction: "Verificar",
    privacyNote: "A selfie é comparada no seu celular; só o resultado é salvo.",
    continueLabel: "Ir enviar a mensagem", close: "Fechar",
  },
  it: {
    title: "Due controlli veloci prima del primo messaggio",
    titleOne: "Un controllo veloce prima del primo messaggio",
    body: "Su HashChat ogni persona ha un volto vero e un numero verificato. Basta farlo una volta.",
    phoneRow: "Verifica il tuo numero", phoneAction: "Verifica",
    photoRow: "Una foto profilo che mostri il tuo volto", photoHint: "Qualsiasi foto in cui il tuo volto si veda bene.", photoAction: "Aggiungi foto",
    photoChecking: "Controllo della foto…",
    photoNoFace: "Non abbiamo trovato un volto in questa foto. Scegline una in cui il tuo volto si veda bene.",
    photoFailed: "Impossibile caricare la foto. Riprova.",
    done: "Fatto",
    verifyRow: "Una foto profilo verificata con un selfie", verifyHint: "Un selfie veloce conferma che il volto nella foto sei tu. A chi ti segue puoi scrivere anche senza.", verifyAction: "Verifica",
    privacyNote: "Il selfie viene confrontato sul telefono; viene salvato solo il risultato.",
    continueLabel: "Vai al messaggio", close: "Chiudi",
  },
  ru: {
    title: "Две быстрые проверки перед первым сообщением",
    titleOne: "Одна быстрая проверка перед первым сообщением",
    body: "В HashChat у каждого настоящее лицо и подтверждённый номер. Это нужно сделать только один раз.",
    phoneRow: "Подтвердить номер телефона", phoneAction: "Подтвердить",
    photoRow: "Фото профиля, на котором видно лицо", photoHint: "Подойдёт любое фото, где хорошо видно ваше лицо.", photoAction: "Добавить фото",
    photoChecking: "Проверяем фото…",
    photoNoFace: "На этом фото не нашлось лица. Выберите фото, где хорошо видно ваше лицо.",
    photoFailed: "Не удалось загрузить фото. Попробуйте ещё раз.",
    done: "Готово",
    verifyRow: "Фото профиля, подтверждённое селфи", verifyHint: "Короткое селфи подтвердит, что на фото именно вы. Тем, кто на вас подписан, можно писать и без этого.", verifyAction: "Подтвердить",
    privacyNote: "Селфи сравнивается на телефоне, сохраняется только результат.",
    continueLabel: "Отправить сообщение", close: "Закрыть",
  },
  ar: {
    title: "تحققان سريعان قبل رسالتك الأولى",
    titleOne: "تحقق سريع قبل رسالتك الأولى",
    body: "كل من تتحدث معه على HashChat له وجه حقيقي ورقم موثّق. تفعل ذلك مرة واحدة فقط.",
    phoneRow: "توثيق رقم هاتفك", phoneAction: "توثيق",
    photoRow: "صورة شخصية يظهر فيها وجهك", photoHint: "أي صورة يظهر فيها وجهك بوضوح.", photoAction: "إضافة صورة",
    photoChecking: "جارٍ فحص الصورة…",
    photoNoFace: "لم نجد وجهًا في هذه الصورة. اختر صورة يظهر فيها وجهك بوضوح.",
    photoFailed: "تعذّر رفع الصورة. حاول مرة أخرى.",
    done: "تم",
    verifyRow: "صورة شخصية موثّقة بصورة سيلفي", verifyHint: "صورة سيلفي سريعة تؤكد أن الوجه في صورتك هو أنت. يمكنك مراسلة من يتابعك بدونها.", verifyAction: "توثيق الوجه",
    privacyNote: "تُقارن صورة السيلفي على هاتفك فقط، ولا يُحفظ إلا الناتج.",
    continueLabel: "الذهاب لإرسال الرسالة", close: "إغلاق",
  },
  hi: {
    title: "पहला मैसेज भेजने से पहले दो छोटी जाँचें",
    titleOne: "पहला मैसेज भेजने से पहले एक छोटी जाँच",
    body: "HashChat पर हर व्यक्ति का असली चेहरा और वेरिफ़ाइड नंबर होता है। यह सिर्फ़ एक बार करना है।",
    phoneRow: "फ़ोन नंबर वेरिफ़ाई करें", phoneAction: "वेरिफ़ाई करें",
    photoRow: "ऐसी प्रोफ़ाइल फ़ोटो जिसमें आपका चेहरा दिखे", photoHint: "कोई भी फ़ोटो जिसमें आपका चेहरा साफ़ दिखे।", photoAction: "फ़ोटो जोड़ें",
    photoChecking: "फ़ोटो जाँची जा रही है…",
    photoNoFace: "इस फ़ोटो में चेहरा नहीं मिला। ऐसी फ़ोटो चुनें जिसमें आपका चेहरा साफ़ दिखे।",
    photoFailed: "फ़ोटो अपलोड नहीं हो सकी। फिर से कोशिश करें।",
    done: "हो गया",
    verifyRow: "सेल्फ़ी से सत्यापित प्रोफ़ाइल फ़ोटो", verifyHint: "एक छोटी सेल्फ़ी से पक्का होता है कि फ़ोटो में आप ही हैं। जो आपको फ़ॉलो करते हैं, उन्हें इसके बिना भी मैसेज कर सकते हैं।", verifyAction: "सत्यापित करें",
    privacyNote: "सेल्फ़ी आपके फ़ोन में ही मिलाई जाती है; सिर्फ़ नतीजा सेव होता है।",
    continueLabel: "मैसेज भेजने चलें", close: "बंद करें",
  },
  th: {
    title: "ตรวจสอบสองอย่างก่อนส่งข้อความแรก",
    titleOne: "ตรวจสอบหนึ่งอย่างก่อนส่งข้อความแรก",
    body: "ทุกคนที่คุยกันใน HashChat มีหน้าจริงและเบอร์ที่ยืนยันแล้ว ทำแค่ครั้งเดียวเท่านั้น",
    phoneRow: "ยืนยันเบอร์โทรศัพท์", phoneAction: "ยืนยัน",
    photoRow: "รูปโปรไฟล์ที่เห็นหน้าคุณ", photoHint: "รูปไหนก็ได้ที่เห็นหน้าคุณชัดเจน", photoAction: "เพิ่มรูป",
    photoChecking: "กำลังตรวจรูป…",
    photoNoFace: "ไม่พบใบหน้าในรูปนี้ กรุณาเลือกรูปที่เห็นหน้าคุณชัดเจน",
    photoFailed: "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง",
    done: "เสร็จแล้ว",
    verifyRow: "รูปโปรไฟล์ที่ยืนยันใบหน้าแล้ว", verifyHint: "เซลฟีสั้นๆ เพื่อยืนยันว่าหน้าในรูปคือคุณ คนที่ติดตามคุณอยู่ ส่งข้อความหาได้เลยโดยไม่ต้องยืนยัน", verifyAction: "ยืนยันใบหน้า",
    privacyNote: "เซลฟีถูกเทียบในโทรศัพท์ของคุณเท่านั้น และเก็บไว้แค่ผลการยืนยัน",
    continueLabel: "ไปส่งข้อความ", close: "ปิด",
  },
  vi: {
    title: "Hai bước kiểm tra nhanh trước tin nhắn đầu tiên",
    titleOne: "Một bước kiểm tra nhanh trước tin nhắn đầu tiên",
    body: "Mọi người bạn trò chuyện trên HashChat đều có khuôn mặt thật và số điện thoại đã xác minh. Chỉ cần làm một lần.",
    phoneRow: "Xác minh số điện thoại", phoneAction: "Xác minh",
    photoRow: "Ảnh đại diện thấy rõ khuôn mặt", photoHint: "Ảnh nào thấy rõ khuôn mặt bạn đều được.", photoAction: "Thêm ảnh",
    photoChecking: "Đang kiểm tra ảnh…",
    photoNoFace: "Không tìm thấy khuôn mặt trong ảnh này. Hãy chọn ảnh thấy rõ khuôn mặt bạn.",
    photoFailed: "Không tải ảnh lên được. Hãy thử lại.",
    done: "Xong",
    verifyRow: "Ảnh đại diện đã xác minh khuôn mặt", verifyHint: "Một tấm selfie nhanh xác nhận khuôn mặt trong ảnh là bạn. Với người đang theo dõi bạn, bạn nhắn được mà không cần bước này.", verifyAction: "Xác minh",
    privacyNote: "Selfie chỉ được so sánh trên điện thoại của bạn; chỉ lưu kết quả.",
    continueLabel: "Đi gửi tin nhắn", close: "Đóng",
  },
};

export const FIRST_MESSAGE_GATE_COPY_LOCALES = Object.keys(COPY);

export function resolveFirstMessageGateCopy(rawLocale: string): FirstMessageGateCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
