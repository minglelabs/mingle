import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/**
 * Copy for the one-pass onboarding steps added on 2026-11-24: the profile
 * photo and the "HashChat is spoken" screen that asks for the microphone.
 */
export type OnboardingExtraCopy = {
  photoLabel: string;
  photoTitle: string;
  photoDescription: string;
  photoPick: string;
  photoChange: string;
  photoSkip: string;
  photoFailed: string;
  voiceLabel: string;
  voiceTitle: string;
  voiceDescription: string;
  micTitle: string;
  micDescription: string;
  micAllow: string;
  micGranted: string;
  micDenied: string;
  nationalityLabel: string;
  nationalityTitle: string;
  nationalityDescription: string;
  nationalitySearch: string;
  /** Headers of the two blocks: Korea and the top visitor countries, then the rest. */
  nationalityMajor: string;
  nationalityAll: string;
  faceCheck: string;
  faceVerified: string;
};

const COPY: Record<PrimaryUiLocale, OnboardingExtraCopy> = {
  ko: {
    photoLabel: "프로필 사진", photoTitle: "프로필 사진을 올려 주세요", photoDescription: "얼굴이 잘 보이는 사진이면 친구가 훨씬 많이 생겨요.", photoPick: "사진 고르기", photoChange: "다른 사진으로 바꾸기", photoSkip: "나중에 할게요", photoFailed: "사진을 불러오지 못했어요. 다른 사진을 골라 주세요.",
    voiceLabel: "목소리 대화를 권장해요", voiceTitle: "해시챗에서는 키보드 대신\n말로 쓰고 말로 대화해요", voiceDescription: "메시지를 말로 하면 글자로 받아 적어 주고, 상대 언어로 바로 번역돼요. 보이스룸에서는 목소리로 바로 이야기해요.", micTitle: "마이크 권한", micDescription: "말하면 받아 적어 메시지를 써 주고, 보이스룸에서 이야기할 때 써요.", micAllow: "마이크 허용하고 계속", micGranted: "마이크가 켜졌어요", micDenied: "설정에서 언제든 켤 수 있어요", nationalityLabel: "국적", nationalityTitle: "어느 나라 사람이에요?", nationalityDescription: "프로필 사진에 국기로 보여요. 쓰는 언어와는 따로예요.", nationalitySearch: "나라 검색", nationalityMajor: "주요 국가", nationalityAll: "모든 국가", faceCheck: "얼굴 인증하기", faceVerified: "얼굴 인증 완료",
  },
  en: {
    photoLabel: "Profile photo", photoTitle: "Add a profile photo", photoDescription: "A photo where your face is clear brings far more friends.", photoPick: "Choose a photo", photoChange: "Choose another photo", photoSkip: "I'll do it later", photoFailed: "Couldn't open that photo. Please choose another.",
    voiceLabel: "Voice comes first", voiceTitle: "On HashChat you speak\ninstead of typing", voiceDescription: "Say your message and it's written down for you, then translated into their language. In voice rooms you just talk.", micTitle: "Microphone", micDescription: "Writes down what you say as your message, and lets you talk in voice rooms.", micAllow: "Allow microphone and continue", micGranted: "Microphone is on", micDenied: "You can turn it on anytime in Settings", nationalityLabel: "Nationality", nationalityTitle: "Where are you from?", nationalityDescription: "Shown as a flag on your profile photo, apart from the languages you speak.", nationalitySearch: "Search countries", nationalityMajor: "Popular", nationalityAll: "All countries", faceCheck: "Verify your face", faceVerified: "Face verified",
  },
  ja: {
    photoLabel: "プロフィール写真", photoTitle: "プロフィール写真を追加してください", photoDescription: "顔がよく見える写真だと、友達がずっと増えます。", photoPick: "写真を選ぶ", photoChange: "別の写真にする", photoSkip: "あとでする", photoFailed: "写真を開けませんでした。別の写真を選んでください。",
    voiceLabel: "声での会話がおすすめ", voiceTitle: "HashChatではキーボードの代わりに\n話して書いて、話して会話します", voiceDescription: "メッセージは話すだけで文字になり、相手の言語にすぐ翻訳されます。ボイスルームでは声でそのまま話せます。", micTitle: "マイクの許可", micDescription: "話した内容を書き起こしてメッセージにし、ボイスルームで話すときに使います。", micAllow: "マイクを許可して続ける", micGranted: "マイクがオンになりました", micDenied: "設定からいつでもオンにできます", nationalityLabel: "国籍", nationalityTitle: "どこの国の方ですか？", nationalityDescription: "プロフィール写真に国旗で表示されます。話す言語とは別です。", nationalitySearch: "国を検索", nationalityMajor: "主な国", nationalityAll: "すべての国", faceCheck: "顔認証をする", faceVerified: "顔認証完了",
  },
  "zh-CN": {
    photoLabel: "头像", photoTitle: "上传一张头像吧", photoDescription: "能看清脸的照片，会让你多交很多朋友。", photoPick: "选择照片", photoChange: "换一张照片", photoSkip: "以后再说", photoFailed: "无法打开这张照片，请换一张。",
    voiceLabel: "推荐用声音聊天", voiceTitle: "在 HashChat\n用说的来打字、来聊天", voiceDescription: "说出你的消息就会自动写成文字，并马上翻译成对方的语言。在语音房里直接开口聊。", micTitle: "麦克风权限", micDescription: "把你说的话写成消息，并在语音房里聊天时使用。", micAllow: "允许麦克风并继续", micGranted: "麦克风已开启", micDenied: "随时可以在设置中开启", nationalityLabel: "国籍", nationalityTitle: "你来自哪个国家？", nationalityDescription: "会以国旗显示在头像上，与你使用的语言无关。", nationalitySearch: "搜索国家", nationalityMajor: "主要国家", nationalityAll: "所有国家", faceCheck: "进行人脸验证", faceVerified: "人脸验证完成",
  },
  "zh-TW": {
    photoLabel: "大頭貼", photoTitle: "上傳一張大頭貼吧", photoDescription: "看得清臉的照片，會讓你多交很多朋友。", photoPick: "選擇照片", photoChange: "換一張照片", photoSkip: "之後再說", photoFailed: "無法開啟這張照片，請換一張。",
    voiceLabel: "推薦用聲音聊天", voiceTitle: "在 HashChat\n用說的來打字、來聊天", voiceDescription: "說出你的訊息就會自動寫成文字，並馬上翻譯成對方的語言。在語音房裡直接開口聊。", micTitle: "麥克風權限", micDescription: "把你說的話寫成訊息，並在語音房裡聊天時使用。", micAllow: "允許麥克風並繼續", micGranted: "麥克風已開啟", micDenied: "隨時可以在設定中開啟", nationalityLabel: "國籍", nationalityTitle: "你來自哪個國家？", nationalityDescription: "會以國旗顯示在大頭貼上，與你使用的語言無關。", nationalitySearch: "搜尋國家", nationalityMajor: "主要國家", nationalityAll: "所有國家", faceCheck: "進行臉部驗證", faceVerified: "臉部驗證完成",
  },
  fr: {
    photoLabel: "Photo de profil", photoTitle: "Ajoutez une photo de profil", photoDescription: "Une photo où l’on voit bien votre visage vous apporte bien plus d’amis.", photoPick: "Choisir une photo", photoChange: "Choisir une autre photo", photoSkip: "Plus tard", photoFailed: "Impossible d’ouvrir cette photo. Choisissez-en une autre.",
    voiceLabel: "La voix d’abord", voiceTitle: "Sur HashChat, on parle\nau lieu de taper", voiceDescription: "Dites votre message, il s’écrit tout seul puis se traduit dans leur langue. Dans les salons vocaux, vous parlez directement.", micTitle: "Micro", micDescription: "Écrit ce que vous dites comme message et vous permet de parler dans les salons vocaux.", micAllow: "Autoriser le micro et continuer", micGranted: "Le micro est activé", micDenied: "Vous pouvez l’activer à tout moment dans Réglages", nationalityLabel: "Nationalité", nationalityTitle: "D’où venez-vous ?", nationalityDescription: "Affichée en drapeau sur votre photo, indépendamment des langues que vous parlez.", nationalitySearch: "Rechercher un pays", nationalityMajor: "Pays principaux", nationalityAll: "Tous les pays", faceCheck: "Vérifier mon visage", faceVerified: "Visage vérifié",
  },
  de: {
    photoLabel: "Profilfoto", photoTitle: "Füge ein Profilfoto hinzu", photoDescription: "Mit einem Foto, auf dem dein Gesicht gut zu sehen ist, findest du viel mehr Freunde.", photoPick: "Foto auswählen", photoChange: "Anderes Foto wählen", photoSkip: "Später", photoFailed: "Das Foto ließ sich nicht öffnen. Bitte wähle ein anderes.",
    voiceLabel: "Sprache zuerst", voiceTitle: "Bei HashChat sprichst du,\nstatt zu tippen", voiceDescription: "Sprich deine Nachricht und sie wird für dich aufgeschrieben und in ihre Sprache übersetzt. In Voice-Räumen redest du einfach.", micTitle: "Mikrofon", micDescription: "Schreibt auf, was du sagst, als Nachricht und lässt dich in Voice-Räumen reden.", micAllow: "Mikrofon erlauben und weiter", micGranted: "Mikrofon ist an", micDenied: "Du kannst es jederzeit in den Einstellungen einschalten", nationalityLabel: "Nationalität", nationalityTitle: "Woher kommst du?", nationalityDescription: "Wird als Flagge auf deinem Profilfoto gezeigt, unabhängig von deinen Sprachen.", nationalitySearch: "Land suchen", nationalityMajor: "Häufige Länder", nationalityAll: "Alle Länder", faceCheck: "Gesicht verifizieren", faceVerified: "Gesicht verifiziert",
  },
  es: {
    photoLabel: "Foto de perfil", photoTitle: "Añade una foto de perfil", photoDescription: "Con una foto donde se vea bien tu cara harás muchos más amigos.", photoPick: "Elegir foto", photoChange: "Elegir otra foto", photoSkip: "Más tarde", photoFailed: "No se pudo abrir esa foto. Elige otra.",
    voiceLabel: "Primero la voz", voiceTitle: "En HashChat hablas\nen vez de escribir", voiceDescription: "Di tu mensaje y se escribe solo, y se traduce al instante a su idioma. En las salas de voz hablas directamente.", micTitle: "Micrófono", micDescription: "Escribe lo que dices como mensaje y te deja hablar en las salas de voz.", micAllow: "Permitir micrófono y continuar", micGranted: "El micrófono está activado", micDenied: "Puedes activarlo cuando quieras en Ajustes", nationalityLabel: "Nacionalidad", nationalityTitle: "¿De dónde eres?", nationalityDescription: "Se muestra como bandera en tu foto, aparte de los idiomas que hablas.", nationalitySearch: "Buscar país", nationalityMajor: "Países principales", nationalityAll: "Todos los países", faceCheck: "Verificar mi cara", faceVerified: "Cara verificada",
  },
  pt: {
    photoLabel: "Foto de perfil", photoTitle: "Adicione uma foto de perfil", photoDescription: "Uma foto em que dá para ver bem o seu rosto traz muito mais amigos.", photoPick: "Escolher foto", photoChange: "Escolher outra foto", photoSkip: "Depois", photoFailed: "Não foi possível abrir essa foto. Escolha outra.",
    voiceLabel: "A voz em primeiro lugar", voiceTitle: "No HashChat você fala\nem vez de digitar", voiceDescription: "Diga sua mensagem e ela é escrita para você e traduzida na hora. Nas salas de voz, é só falar.", micTitle: "Microfone", micDescription: "Escreve o que você diz como mensagem e permite falar nas salas de voz.", micAllow: "Permitir microfone e continuar", micGranted: "O microfone está ligado", micDenied: "Você pode ativá-lo a qualquer momento em Ajustes", nationalityLabel: "Nacionalidade", nationalityTitle: "De onde você é?", nationalityDescription: "Aparece como bandeira na sua foto, à parte dos idiomas que você fala.", nationalitySearch: "Buscar país", nationalityMajor: "Principais países", nationalityAll: "Todos os países", faceCheck: "Verificar meu rosto", faceVerified: "Rosto verificado",
  },
  it: {
    photoLabel: "Foto profilo", photoTitle: "Aggiungi una foto profilo", photoDescription: "Con una foto in cui si vede bene il viso trovi molti più amici.", photoPick: "Scegli una foto", photoChange: "Scegli un’altra foto", photoSkip: "Più tardi", photoFailed: "Impossibile aprire la foto. Scegline un’altra.",
    voiceLabel: "Prima la voce", voiceTitle: "Su HashChat parli\ninvece di scrivere", voiceDescription: "Detta il messaggio e viene scritto per te, poi tradotto subito nella loro lingua. Nelle stanze vocali parli e basta.", micTitle: "Microfono", micDescription: "Scrive come messaggio quello che dici e ti fa parlare nelle stanze vocali.", micAllow: "Consenti il microfono e continua", micGranted: "Il microfono è attivo", micDenied: "Puoi attivarlo quando vuoi in Impostazioni", nationalityLabel: "Nazionalità", nationalityTitle: "Di dove sei?", nationalityDescription: "Appare come bandiera sulla tua foto, a parte le lingue che parli.", nationalitySearch: "Cerca un paese", nationalityMajor: "Paesi principali", nationalityAll: "Tutti i paesi", faceCheck: "Verifica il volto", faceVerified: "Volto verificato",
  },
  ru: {
    photoLabel: "Фото профиля", photoTitle: "Добавьте фото профиля", photoDescription: "С фото, где хорошо видно лицо, друзей будет гораздо больше.", photoPick: "Выбрать фото", photoChange: "Выбрать другое фото", photoSkip: "Позже", photoFailed: "Не удалось открыть фото. Выберите другое.",
    voiceLabel: "Сначала голос", voiceTitle: "В HashChat говорят,\nа не печатают", voiceDescription: "Скажите сообщение — оно запишется само и сразу переведётся на язык собеседника. В голосовых комнатах просто говорите.", micTitle: "Микрофон", micDescription: "Записывает сказанное как сообщение и позволяет говорить в голосовых комнатах.", micAllow: "Разрешить микрофон и продолжить", micGranted: "Микрофон включён", micDenied: "Его можно включить в Настройках в любое время", nationalityLabel: "Гражданство", nationalityTitle: "Откуда вы?", nationalityDescription: "Показывается флагом на фото профиля, отдельно от языков, на которых вы говорите.", nationalitySearch: "Поиск страны", nationalityMajor: "Основные страны", nationalityAll: "Все страны", faceCheck: "Подтвердить лицо", faceVerified: "Лицо подтверждено",
  },
  ar: {
    photoLabel: "صورة الملف الشخصي", photoTitle: "أضف صورة للملف الشخصي", photoDescription: "الصورة التي يظهر فيها وجهك بوضوح تجلب لك أصدقاء أكثر بكثير.", photoPick: "اختر صورة", photoChange: "اختر صورة أخرى", photoSkip: "لاحقًا", photoFailed: "تعذّر فتح هذه الصورة. اختر صورة أخرى.",
    voiceLabel: "الصوت أولًا", voiceTitle: "في HashChat تتحدث\nبدل أن تكتب", voiceDescription: "قل رسالتك فتُكتب لك وتُترجم فورًا إلى لغة الطرف الآخر. وفي غرف الصوت تتحدث مباشرة.", micTitle: "الميكروفون", micDescription: "يكتب ما تقوله كرسالة ويتيح لك التحدث في غرف الصوت.", micAllow: "اسمح بالميكروفون وتابع", micGranted: "الميكروفون يعمل", micDenied: "يمكنك تشغيله في أي وقت من الإعدادات", nationalityLabel: "الجنسية", nationalityTitle: "من أين أنت؟", nationalityDescription: "تظهر كعلم على صورتك، بشكل منفصل عن اللغات التي تتحدثها.", nationalitySearch: "ابحث عن دولة", nationalityMajor: "الدول الرئيسية", nationalityAll: "كل الدول", faceCheck: "تحقق من وجهك", faceVerified: "تم التحقق من الوجه",
  },
  hi: {
    photoLabel: "प्रोफ़ाइल फ़ोटो", photoTitle: "प्रोफ़ाइल फ़ोटो जोड़ें", photoDescription: "जिस फ़ोटो में चेहरा साफ़ दिखे, उससे कहीं ज़्यादा दोस्त बनते हैं।", photoPick: "फ़ोटो चुनें", photoChange: "दूसरी फ़ोटो चुनें", photoSkip: "बाद में", photoFailed: "यह फ़ोटो नहीं खुली। कृपया दूसरी चुनें।",
    voiceLabel: "आवाज़ पहले", voiceTitle: "HashChat पर टाइप नहीं,\nबोलकर लिखते और बात करते हैं", voiceDescription: "अपना संदेश बोलें, वह अपने आप लिखा जाता है और तुरंत उनकी भाषा में अनुवाद होता है। वॉइस रूम में सीधे बात करें।", micTitle: "माइक्रोफ़ोन", micDescription: "आप जो बोलते हैं उसे संदेश के रूप में लिखता है और वॉइस रूम में बात करने देता है।", micAllow: "माइक्रोफ़ोन की अनुमति दें और आगे बढ़ें", micGranted: "माइक्रोफ़ोन चालू है", micDenied: "आप इसे कभी भी सेटिंग्स में चालू कर सकते हैं", nationalityLabel: "राष्ट्रीयता", nationalityTitle: "आप कहाँ से हैं?", nationalityDescription: "आपकी प्रोफ़ाइल फ़ोटो पर झंडे के रूप में दिखती है, आपकी भाषाओं से अलग।", nationalitySearch: "देश खोजें", nationalityMajor: "मुख्य देश", nationalityAll: "सभी देश", faceCheck: "चेहरा सत्यापित करें", faceVerified: "चेहरा सत्यापित",
  },
  th: {
    photoLabel: "รูปโปรไฟล์", photoTitle: "เพิ่มรูปโปรไฟล์", photoDescription: "รูปที่เห็นหน้าชัด ช่วยให้ได้เพื่อนมากขึ้นเยอะเลย", photoPick: "เลือกรูป", photoChange: "เปลี่ยนรูป", photoSkip: "ไว้ทีหลัง", photoFailed: "เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น",
    voiceLabel: "เน้นคุยด้วยเสียง", voiceTitle: "ใน HashChat\nพูดแทนการพิมพ์", voiceDescription: "พูดข้อความของคุณแล้วระบบจะพิมพ์ให้ และแปลเป็นภาษาของอีกฝ่ายทันที ในห้องเสียงก็คุยได้เลย", micTitle: "ไมโครโฟน", micDescription: "พิมพ์สิ่งที่คุณพูดเป็นข้อความ และใช้คุยในห้องเสียง", micAllow: "อนุญาตไมโครโฟนแล้วไปต่อ", micGranted: "เปิดไมโครโฟนแล้ว", micDenied: "เปิดได้ทุกเมื่อในการตั้งค่า", nationalityLabel: "สัญชาติ", nationalityTitle: "คุณมาจากประเทศอะไร?", nationalityDescription: "จะแสดงเป็นธงบนรูปโปรไฟล์ แยกจากภาษาที่คุณพูด", nationalitySearch: "ค้นหาประเทศ", nationalityMajor: "ประเทศหลัก", nationalityAll: "ทุกประเทศ", faceCheck: "ยืนยันใบหน้า", faceVerified: "ยืนยันใบหน้าแล้ว",
  },
  vi: {
    photoLabel: "Ảnh đại diện", photoTitle: "Thêm ảnh đại diện", photoDescription: "Ảnh thấy rõ khuôn mặt sẽ giúp bạn có thêm nhiều bạn hơn.", photoPick: "Chọn ảnh", photoChange: "Chọn ảnh khác", photoSkip: "Để sau", photoFailed: "Không mở được ảnh này. Hãy chọn ảnh khác.",
    voiceLabel: "Ưu tiên giọng nói", voiceTitle: "Trên HashChat bạn nói\nthay vì gõ", voiceDescription: "Nói tin nhắn của bạn và nó được ghi lại thành chữ, rồi dịch ngay sang ngôn ngữ của họ. Trong phòng thoại, cứ thế nói chuyện.", micTitle: "Micro", micDescription: "Ghi lại lời bạn nói thành tin nhắn và để bạn nói chuyện trong phòng thoại.", micAllow: "Cho phép micro và tiếp tục", micGranted: "Micro đã bật", micDenied: "Bạn có thể bật bất cứ lúc nào trong Cài đặt", nationalityLabel: "Quốc tịch", nationalityTitle: "Bạn đến từ đâu?", nationalityDescription: "Hiển thị bằng lá cờ trên ảnh đại diện, tách biệt với ngôn ngữ bạn nói.", nationalitySearch: "Tìm quốc gia", nationalityMajor: "Quốc gia phổ biến", nationalityAll: "Tất cả quốc gia", faceCheck: "Xác minh khuôn mặt", faceVerified: "Đã xác minh khuôn mặt",
  },
};

export function resolveOnboardingExtraCopy(rawLocale: string): OnboardingExtraCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
