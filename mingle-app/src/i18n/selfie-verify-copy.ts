import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** Copy for the optional selfie check (see @/lib/selfie-liveness) and its badge. */
export type SelfieVerifyCopy = {
  title: string;
  body: string;
  /** Nothing leaves the phone. */
  privacy: string;
  start: string;
  loading: string;
  /** A profile photo with a face is needed first. */
  needPhoto: string;
  cameraDenied: string;
  unsupported: string;
  center: string;
  noFace: string;
  oneFace: string;
  closer: string;
  /** The person's own left (the left of the mirrored preview). */
  turnLeft: string;
  turnRight: string;
  returnCenter: string;
  comparing: string;
  passed: string;
  passedBody: string;
  mismatch: string;
  failed: string;
  retry: string;
  close: string;
  /** The badge on a profile. */
  badge: string;
  /** My page row. */
  entry: string;
  entryHint: string;
  entryDone: string;
};

const COPY: Record<PrimaryUiLocale, SelfieVerifyCopy> = {
  ko: {
    title: "셀카로 본인인증", body: "앞 카메라로 얼굴을 비추고 고개를 양쪽으로 돌리면, 프로필 사진과 같은 사람인지 확인해요. 통과하면 프로필에 인증 배지가 붙어요.",
    privacy: "영상과 사진은 폰 안에서만 쓰고 저장하지 않아요. 인증 결과만 저장돼요.",
    start: "시작하기", loading: "준비하고 있어요…",
    needPhoto: "먼저 얼굴이 보이는 프로필 사진을 올려 주세요.",
    cameraDenied: "카메라를 쓸 수 없어요. 설정에서 카메라 권한을 켜 주세요.",
    unsupported: "이 기기에서는 셀카 인증을 할 수 없어요.",
    center: "얼굴을 화면 가운데에 맞추고 정면을 봐 주세요", noFace: "얼굴이 보이지 않아요", oneFace: "한 사람만 나오게 해 주세요", closer: "조금 더 가까이 와 주세요",
    turnLeft: "고개를 천천히 왼쪽으로 돌려 주세요", turnRight: "이번엔 오른쪽으로 돌려 주세요", returnCenter: "다시 정면을 봐 주세요",
    comparing: "프로필 사진과 비교하고 있어요…",
    passed: "인증됐어요", passedBody: "프로필에 인증 배지가 붙었어요.",
    mismatch: "프로필 사진과 같은 사람인지 확인하지 못했어요. 밝은 곳에서 다시 해 보거나, 내 얼굴이 잘 보이는 프로필 사진으로 바꿔 주세요.",
    failed: "인증을 마치지 못했어요. 다시 시도해 주세요.", retry: "다시 하기", close: "닫기",
    badge: "인증됨", entry: "셀카 본인인증", entryHint: "인증 배지를 받으면 더 믿고 대화할 수 있어요", entryDone: "인증 완료",
  },
  en: {
    title: "Verify with a selfie", body: "Show your face to the front camera and turn your head both ways. We check it's the same person as your profile photo. Pass and your profile gets a verified badge.",
    privacy: "The video stays on your phone and is never saved. Only the result is kept.",
    start: "Start", loading: "Getting ready…",
    needPhoto: "First add a profile photo that shows your face.",
    cameraDenied: "Can't use the camera. Turn on camera access in Settings.",
    unsupported: "Selfie verification isn't available on this device.",
    center: "Center your face and look straight ahead", noFace: "Can't see your face", oneFace: "Only one person in the frame, please", closer: "Come a little closer",
    turnLeft: "Slowly turn your head to the left", turnRight: "Now turn your head to the right", returnCenter: "Look straight ahead again",
    comparing: "Comparing with your profile photo…",
    passed: "You're verified", passedBody: "Your profile now has a verified badge.",
    mismatch: "We couldn't confirm it's the same person as your profile photo. Try again in good light, or change to a profile photo that clearly shows your face.",
    failed: "Couldn't finish verification. Please try again.", retry: "Try again", close: "Close",
    badge: "Verified", entry: "Selfie verification", entryHint: "A verified badge helps people trust you", entryDone: "Verified",
  },
  ja: {
    title: "セルフィーで本人確認", body: "前カメラに顔を映して左右に首を回すと、プロフィール写真と同じ人か確認します。通過するとプロフィールに認証バッジが付きます。",
    privacy: "映像はスマホの中だけで使い、保存しません。結果だけを保存します。",
    start: "はじめる", loading: "準備しています…",
    needPhoto: "先に顔が見えるプロフィール写真を追加してください。",
    cameraDenied: "カメラを使えません。設定でカメラへのアクセスをオンにしてください。",
    unsupported: "この端末ではセルフィー認証を使えません。",
    center: "顔を中央に合わせて正面を見てください", noFace: "顔が見えません", oneFace: "1人だけ映るようにしてください", closer: "もう少し近づいてください",
    turnLeft: "ゆっくり左に首を回してください", turnRight: "今度は右に回してください", returnCenter: "もう一度正面を見てください",
    comparing: "プロフィール写真と比べています…",
    passed: "認証されました", passedBody: "プロフィールに認証バッジが付きました。",
    mismatch: "プロフィール写真と同じ人か確認できませんでした。明るい場所でもう一度試すか、顔がはっきり見える写真に変えてください。",
    failed: "認証を完了できませんでした。もう一度お試しください。", retry: "もう一度", close: "閉じる",
    badge: "認証済み", entry: "セルフィー本人確認", entryHint: "認証バッジがあると安心して話してもらえます", entryDone: "認証済み",
  },
  "zh-CN": {
    title: "自拍验证", body: "用前置摄像头对准脸，向两侧转头，我们会确认你和头像是同一个人。通过后个人主页会显示认证徽章。",
    privacy: "视频只在手机里使用，不会保存。只保存验证结果。",
    start: "开始", loading: "正在准备…",
    needPhoto: "请先上传一张能看到脸的头像。",
    cameraDenied: "无法使用摄像头。请在设置中开启摄像头权限。",
    unsupported: "此设备无法进行自拍验证。",
    center: "把脸对准画面中间，看向正前方", noFace: "看不到你的脸", oneFace: "画面中只能有一个人", closer: "请再靠近一点",
    turnLeft: "慢慢把头转向左边", turnRight: "现在把头转向右边", returnCenter: "再看向正前方",
    comparing: "正在和头像比对…",
    passed: "验证成功", passedBody: "你的个人主页已显示认证徽章。",
    mismatch: "无法确认你和头像是同一个人。请在光线充足的地方重试，或换一张能清楚看到脸的头像。",
    failed: "验证未完成，请重试。", retry: "重试", close: "关闭",
    badge: "已认证", entry: "自拍验证", entryHint: "有认证徽章，别人会更放心和你聊天", entryDone: "已认证",
  },
  "zh-TW": {
    title: "自拍驗證", body: "用前鏡頭對準臉，向兩側轉頭，我們會確認你和大頭貼是同一個人。通過後個人頁面會顯示認證徽章。",
    privacy: "影片只在手機裡使用，不會儲存。只儲存驗證結果。",
    start: "開始", loading: "準備中…",
    needPhoto: "請先上傳一張看得到臉的大頭貼。",
    cameraDenied: "無法使用相機。請在設定中開啟相機權限。",
    unsupported: "這台裝置無法進行自拍驗證。",
    center: "把臉對準畫面中間，看向正前方", noFace: "看不到你的臉", oneFace: "畫面中只能有一個人", closer: "請再靠近一點",
    turnLeft: "慢慢把頭轉向左邊", turnRight: "現在把頭轉向右邊", returnCenter: "再看向正前方",
    comparing: "正在和大頭貼比對…",
    passed: "驗證成功", passedBody: "你的個人頁面已顯示認證徽章。",
    mismatch: "無法確認你和大頭貼是同一個人。請在光線充足的地方再試一次，或換一張能清楚看到臉的大頭貼。",
    failed: "驗證未完成，請再試一次。", retry: "再試一次", close: "關閉",
    badge: "已認證", entry: "自拍驗證", entryHint: "有認證徽章，別人會更放心和你聊天", entryDone: "已認證",
  },
  fr: {
    title: "Vérification par selfie", body: "Montrez votre visage à la caméra avant et tournez la tête des deux côtés. Nous vérifions que c’est la même personne que sur votre photo de profil. Réussi, votre profil reçoit un badge vérifié.",
    privacy: "La vidéo reste sur votre téléphone et n’est jamais enregistrée. Seul le résultat est conservé.",
    start: "Commencer", loading: "Préparation…",
    needPhoto: "Ajoutez d’abord une photo de profil où l’on voit votre visage.",
    cameraDenied: "Impossible d’utiliser la caméra. Autorisez-la dans les réglages.",
    unsupported: "La vérification par selfie n’est pas disponible sur cet appareil.",
    center: "Centrez votre visage et regardez droit devant", noFace: "Votre visage n’est pas visible", oneFace: "Une seule personne dans l’image, s’il vous plaît", closer: "Rapprochez-vous un peu",
    turnLeft: "Tournez lentement la tête vers la gauche", turnRight: "Maintenant vers la droite", returnCenter: "Regardez de nouveau droit devant",
    comparing: "Comparaison avec votre photo de profil…",
    passed: "Vous êtes vérifié", passedBody: "Votre profil a maintenant un badge vérifié.",
    mismatch: "Impossible de confirmer que c’est la même personne que sur votre photo. Réessayez avec une bonne lumière ou changez pour une photo où votre visage se voit bien.",
    failed: "La vérification n’a pas abouti. Réessayez.", retry: "Réessayer", close: "Fermer",
    badge: "Vérifié", entry: "Vérification par selfie", entryHint: "Un badge vérifié inspire confiance", entryDone: "Vérifié",
  },
  de: {
    title: "Mit Selfie verifizieren", body: "Zeig dein Gesicht der Frontkamera und dreh den Kopf in beide Richtungen. Wir prüfen, ob du dieselbe Person wie auf deinem Profilfoto bist. Danach bekommt dein Profil ein Verifiziert-Abzeichen.",
    privacy: "Das Video bleibt auf deinem Handy und wird nie gespeichert. Nur das Ergebnis wird gespeichert.",
    start: "Starten", loading: "Wird vorbereitet…",
    needPhoto: "Füge zuerst ein Profilfoto hinzu, auf dem man dein Gesicht sieht.",
    cameraDenied: "Die Kamera kann nicht genutzt werden. Erlaube den Kamerazugriff in den Einstellungen.",
    unsupported: "Selfie-Verifizierung ist auf diesem Gerät nicht verfügbar.",
    center: "Gesicht in die Mitte und geradeaus schauen", noFace: "Dein Gesicht ist nicht zu sehen", oneFace: "Bitte nur eine Person im Bild", closer: "Komm etwas näher",
    turnLeft: "Dreh den Kopf langsam nach links", turnRight: "Jetzt nach rechts", returnCenter: "Schau wieder geradeaus",
    comparing: "Wird mit deinem Profilfoto verglichen…",
    passed: "Du bist verifiziert", passedBody: "Dein Profil hat jetzt ein Verifiziert-Abzeichen.",
    mismatch: "Wir konnten nicht bestätigen, dass du die Person auf dem Profilfoto bist. Versuch es bei gutem Licht noch einmal oder nimm ein Foto, auf dem dein Gesicht gut zu sehen ist.",
    failed: "Die Verifizierung wurde nicht abgeschlossen. Bitte versuch es noch einmal.", retry: "Nochmal", close: "Schließen",
    badge: "Verifiziert", entry: "Selfie-Verifizierung", entryHint: "Mit Abzeichen vertrauen dir andere eher", entryDone: "Verifiziert",
  },
  es: {
    title: "Verificar con un selfie", body: "Muestra tu cara a la cámara frontal y gira la cabeza a ambos lados. Comprobamos que eres la misma persona de tu foto de perfil. Si lo superas, tu perfil recibe una insignia de verificado.",
    privacy: "El vídeo se queda en tu teléfono y nunca se guarda. Solo se guarda el resultado.",
    start: "Empezar", loading: "Preparando…",
    needPhoto: "Primero añade una foto de perfil en la que se vea tu cara.",
    cameraDenied: "No se puede usar la cámara. Activa el acceso a la cámara en Ajustes.",
    unsupported: "La verificación con selfie no está disponible en este dispositivo.",
    center: "Centra tu cara y mira al frente", noFace: "No se ve tu cara", oneFace: "Solo una persona en la imagen, por favor", closer: "Acércate un poco más",
    turnLeft: "Gira despacio la cabeza hacia la izquierda", turnRight: "Ahora hacia la derecha", returnCenter: "Vuelve a mirar al frente",
    comparing: "Comparando con tu foto de perfil…",
    passed: "Estás verificado", passedBody: "Tu perfil ya tiene la insignia de verificado.",
    mismatch: "No pudimos confirmar que eres la persona de tu foto de perfil. Inténtalo de nuevo con buena luz o cambia a una foto en la que se vea bien tu cara.",
    failed: "No se pudo completar la verificación. Inténtalo de nuevo.", retry: "Reintentar", close: "Cerrar",
    badge: "Verificado", entry: "Verificación con selfie", entryHint: "Con la insignia, la gente confía más en ti", entryDone: "Verificado",
  },
  pt: {
    title: "Verificar com selfie", body: "Mostre o rosto à câmera frontal e vire a cabeça para os dois lados. Conferimos se é a mesma pessoa da foto de perfil. Passou, seu perfil ganha um selo de verificado.",
    privacy: "O vídeo fica no seu celular e nunca é salvo. Só o resultado é guardado.",
    start: "Começar", loading: "Preparando…",
    needPhoto: "Primeiro adicione uma foto de perfil que mostre seu rosto.",
    cameraDenied: "Não é possível usar a câmera. Ative o acesso à câmera nos Ajustes.",
    unsupported: "A verificação por selfie não está disponível neste aparelho.",
    center: "Centralize o rosto e olhe para a frente", noFace: "Não dá para ver seu rosto", oneFace: "Só uma pessoa na imagem, por favor", closer: "Chegue um pouco mais perto",
    turnLeft: "Vire a cabeça devagar para a esquerda", turnRight: "Agora para a direita", returnCenter: "Olhe para a frente de novo",
    comparing: "Comparando com sua foto de perfil…",
    passed: "Você foi verificado", passedBody: "Seu perfil agora tem o selo de verificado.",
    mismatch: "Não conseguimos confirmar que é a mesma pessoa da foto de perfil. Tente de novo com boa luz ou troque para uma foto em que seu rosto apareça bem.",
    failed: "Não foi possível concluir a verificação. Tente de novo.", retry: "Tentar de novo", close: "Fechar",
    badge: "Verificado", entry: "Verificação por selfie", entryHint: "Com o selo, as pessoas confiam mais em você", entryDone: "Verificado",
  },
  it: {
    title: "Verifica con un selfie", body: "Mostra il viso alla fotocamera frontale e gira la testa da entrambi i lati. Controlliamo che tu sia la stessa persona della foto profilo. Superata, il profilo riceve un badge di verifica.",
    privacy: "Il video resta sul telefono e non viene mai salvato. Si conserva solo il risultato.",
    start: "Inizia", loading: "Preparazione…",
    needPhoto: "Prima aggiungi una foto profilo in cui si veda il tuo volto.",
    cameraDenied: "Impossibile usare la fotocamera. Attiva l’accesso nelle Impostazioni.",
    unsupported: "La verifica con selfie non è disponibile su questo dispositivo.",
    center: "Centra il viso e guarda dritto", noFace: "Non si vede il tuo viso", oneFace: "Una sola persona nell’inquadratura, per favore", closer: "Avvicinati un po’",
    turnLeft: "Gira lentamente la testa a sinistra", turnRight: "Ora a destra", returnCenter: "Guarda di nuovo dritto",
    comparing: "Confronto con la foto profilo…",
    passed: "Sei verificato", passedBody: "Il tuo profilo ora ha il badge di verifica.",
    mismatch: "Non siamo riusciti a confermare che sei la persona della foto profilo. Riprova con una buona luce o usa una foto in cui il viso si veda bene.",
    failed: "Verifica non completata. Riprova.", retry: "Riprova", close: "Chiudi",
    badge: "Verificato", entry: "Verifica con selfie", entryHint: "Con il badge gli altri si fidano di più", entryDone: "Verificato",
  },
  ru: {
    title: "Подтверждение селфи", body: "Покажите лицо фронтальной камере и поверните голову в обе стороны. Мы проверим, что вы — тот же человек, что на фото профиля. После проверки в профиле появится значок.",
    privacy: "Видео остаётся на телефоне и не сохраняется. Сохраняется только результат.",
    start: "Начать", loading: "Подготовка…",
    needPhoto: "Сначала добавьте фото профиля, на котором видно лицо.",
    cameraDenied: "Нет доступа к камере. Разрешите его в настройках.",
    unsupported: "Проверка селфи недоступна на этом устройстве.",
    center: "Расположите лицо по центру и смотрите прямо", noFace: "Лицо не видно", oneFace: "В кадре должен быть один человек", closer: "Подойдите чуть ближе",
    turnLeft: "Медленно поверните голову влево", turnRight: "Теперь вправо", returnCenter: "Снова смотрите прямо",
    comparing: "Сравниваем с фото профиля…",
    passed: "Вы подтверждены", passedBody: "В вашем профиле появился значок подтверждения.",
    mismatch: "Не удалось подтвердить, что вы — человек с фото профиля. Попробуйте ещё раз при хорошем свете или поставьте фото, где хорошо видно лицо.",
    failed: "Не удалось завершить проверку. Попробуйте ещё раз.", retry: "Ещё раз", close: "Закрыть",
    badge: "Подтверждён", entry: "Подтверждение селфи", entryHint: "Со значком вам больше доверяют", entryDone: "Подтверждено",
  },
  ar: {
    title: "التحقق بصورة سيلفي", body: "أظهر وجهك للكاميرا الأمامية وأدِر رأسك إلى الجانبين. نتحقق من أنك الشخص نفسه في صورتك الشخصية. عند النجاح يحصل ملفك على شارة التوثيق.",
    privacy: "يبقى الفيديو على هاتفك ولا يُحفظ أبدًا. يُحفظ الناتج فقط.",
    start: "ابدأ", loading: "جارٍ التجهيز…",
    needPhoto: "أضف أولًا صورة شخصية يظهر فيها وجهك.",
    cameraDenied: "لا يمكن استخدام الكاميرا. فعّل الوصول إلى الكاميرا من الإعدادات.",
    unsupported: "التحقق بالسيلفي غير متاح على هذا الجهاز.",
    center: "ضع وجهك في المنتصف وانظر إلى الأمام", noFace: "وجهك غير ظاهر", oneFace: "شخص واحد فقط في الصورة من فضلك", closer: "اقترب قليلًا",
    turnLeft: "أدِر رأسك ببطء إلى اليسار", turnRight: "الآن إلى اليمين", returnCenter: "انظر إلى الأمام مجددًا",
    comparing: "جارٍ المقارنة بصورتك الشخصية…",
    passed: "تم التحقق منك", passedBody: "أصبح لملفك شارة التوثيق.",
    mismatch: "لم نتمكن من التأكد من أنك الشخص في صورتك الشخصية. حاول مجددًا في إضاءة جيدة أو غيّر الصورة إلى صورة يظهر فيها وجهك بوضوح.",
    failed: "تعذّر إكمال التحقق. حاول مرة أخرى.", retry: "إعادة المحاولة", close: "إغلاق",
    badge: "موثّق", entry: "التحقق بالسيلفي", entryHint: "الشارة تجعل الآخرين يثقون بك أكثر", entryDone: "موثّق",
  },
  hi: {
    title: "सेल्फ़ी से वेरिफ़ाई करें", body: "फ़्रंट कैमरे को अपना चेहरा दिखाएँ और सिर दोनों तरफ़ घुमाएँ। हम जाँचते हैं कि आप वही व्यक्ति हैं जो प्रोफ़ाइल फ़ोटो में है। पास होने पर आपकी प्रोफ़ाइल पर वेरिफ़ाइड बैज लगता है।",
    privacy: "वीडियो आपके फ़ोन में ही रहता है और कभी सेव नहीं होता। सिर्फ़ नतीजा सेव होता है।",
    start: "शुरू करें", loading: "तैयारी हो रही है…",
    needPhoto: "पहले ऐसी प्रोफ़ाइल फ़ोटो जोड़ें जिसमें आपका चेहरा दिखे।",
    cameraDenied: "कैमरा इस्तेमाल नहीं हो सकता। सेटिंग्स में कैमरा की अनुमति चालू करें।",
    unsupported: "इस डिवाइस पर सेल्फ़ी वेरिफ़िकेशन उपलब्ध नहीं है।",
    center: "चेहरा बीच में रखें और सीधे देखें", noFace: "आपका चेहरा नहीं दिख रहा", oneFace: "फ़्रेम में सिर्फ़ एक व्यक्ति रहे", closer: "थोड़ा पास आएँ",
    turnLeft: "धीरे से सिर बाईं ओर घुमाएँ", turnRight: "अब दाईं ओर घुमाएँ", returnCenter: "फिर से सीधे देखें",
    comparing: "प्रोफ़ाइल फ़ोटो से मिलाया जा रहा है…",
    passed: "आप वेरिफ़ाइड हैं", passedBody: "आपकी प्रोफ़ाइल पर अब वेरिफ़ाइड बैज है।",
    mismatch: "हम पक्का नहीं कर सके कि आप प्रोफ़ाइल फ़ोटो वाले व्यक्ति हैं। अच्छी रोशनी में फिर कोशिश करें या ऐसी फ़ोटो लगाएँ जिसमें चेहरा साफ़ दिखे।",
    failed: "वेरिफ़िकेशन पूरा नहीं हो सका। फिर से कोशिश करें।", retry: "फिर से", close: "बंद करें",
    badge: "वेरिफ़ाइड", entry: "सेल्फ़ी वेरिफ़िकेशन", entryHint: "बैज से लोग आप पर ज़्यादा भरोसा करते हैं", entryDone: "वेरिफ़ाइड",
  },
  th: {
    title: "ยืนยันตัวตนด้วยเซลฟี", body: "หันหน้าเข้ากล้องหน้าแล้วหันศีรษะไปทั้งสองข้าง เราจะตรวจว่าคุณเป็นคนเดียวกับในรูปโปรไฟล์ ผ่านแล้วโปรไฟล์จะได้ป้ายยืนยันตัวตน",
    privacy: "วิดีโออยู่ในโทรศัพท์ของคุณเท่านั้นและไม่ถูกบันทึก เก็บไว้แค่ผลการยืนยัน",
    start: "เริ่ม", loading: "กำลังเตรียม…",
    needPhoto: "เพิ่มรูปโปรไฟล์ที่เห็นหน้าคุณก่อน",
    cameraDenied: "ใช้กล้องไม่ได้ เปิดสิทธิ์กล้องในการตั้งค่า",
    unsupported: "อุปกรณ์นี้ยืนยันด้วยเซลฟีไม่ได้",
    center: "จัดหน้าให้อยู่กลางจอและมองตรง", noFace: "มองไม่เห็นหน้าคุณ", oneFace: "ให้มีแค่คนเดียวในภาพ", closer: "เข้ามาใกล้อีกนิด",
    turnLeft: "ค่อยๆ หันศีรษะไปทางซ้าย", turnRight: "ตอนนี้หันไปทางขวา", returnCenter: "มองตรงอีกครั้ง",
    comparing: "กำลังเทียบกับรูปโปรไฟล์…",
    passed: "ยืนยันตัวตนแล้ว", passedBody: "โปรไฟล์ของคุณมีป้ายยืนยันตัวตนแล้ว",
    mismatch: "ยืนยันไม่ได้ว่าคุณเป็นคนเดียวกับในรูปโปรไฟล์ ลองอีกครั้งในที่สว่าง หรือเปลี่ยนเป็นรูปที่เห็นหน้าชัด",
    failed: "ยืนยันไม่สำเร็จ ลองอีกครั้ง", retry: "ลองอีกครั้ง", close: "ปิด",
    badge: "ยืนยันแล้ว", entry: "ยืนยันตัวตนด้วยเซลฟี", entryHint: "มีป้ายยืนยันแล้วคนอื่นจะไว้ใจคุณมากขึ้น", entryDone: "ยืนยันแล้ว",
  },
  vi: {
    title: "Xác minh bằng ảnh selfie", body: "Đưa mặt vào camera trước và quay đầu sang hai bên. Chúng tôi kiểm tra bạn có phải cùng người trong ảnh đại diện không. Qua bước này, hồ sơ của bạn có huy hiệu đã xác minh.",
    privacy: "Video chỉ ở trên điện thoại và không bao giờ được lưu. Chỉ lưu kết quả.",
    start: "Bắt đầu", loading: "Đang chuẩn bị…",
    needPhoto: "Trước tiên hãy thêm ảnh đại diện thấy rõ khuôn mặt.",
    cameraDenied: "Không dùng được camera. Hãy bật quyền camera trong Cài đặt.",
    unsupported: "Thiết bị này không hỗ trợ xác minh bằng selfie.",
    center: "Đặt mặt vào giữa và nhìn thẳng", noFace: "Không thấy khuôn mặt", oneFace: "Chỉ một người trong khung hình", closer: "Lại gần thêm một chút",
    turnLeft: "Từ từ quay đầu sang trái", turnRight: "Giờ quay sang phải", returnCenter: "Nhìn thẳng lại",
    comparing: "Đang so với ảnh đại diện…",
    passed: "Bạn đã được xác minh", passedBody: "Hồ sơ của bạn đã có huy hiệu xác minh.",
    mismatch: "Không xác nhận được bạn là người trong ảnh đại diện. Thử lại ở nơi đủ sáng hoặc đổi sang ảnh thấy rõ mặt bạn.",
    failed: "Chưa hoàn tất xác minh. Hãy thử lại.", retry: "Thử lại", close: "Đóng",
    badge: "Đã xác minh", entry: "Xác minh bằng selfie", entryHint: "Có huy hiệu, mọi người sẽ tin bạn hơn", entryDone: "Đã xác minh",
  },
};

export const SELFIE_VERIFY_COPY_LOCALES = Object.keys(COPY);

export function resolveSelfieVerifyCopy(rawLocale: string): SelfieVerifyCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
