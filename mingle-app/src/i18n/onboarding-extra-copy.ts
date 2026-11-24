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
};

const COPY: Record<PrimaryUiLocale, OnboardingExtraCopy> = {
  ko: {
    photoLabel: "프로필 사진", photoTitle: "프로필 사진을 올려 주세요", photoDescription: "얼굴이 잘 보이는 사진이면 친구가 훨씬 많이 생겨요.", photoPick: "사진 고르기", photoChange: "다른 사진으로 바꾸기", photoSkip: "나중에 할게요", photoFailed: "사진을 불러오지 못했어요. 다른 사진을 골라 주세요.",
    voiceLabel: "목소리로 대화해요", voiceTitle: "해시챗은 키보드 대신\n목소리로 대화해요", voiceDescription: "말하면 바로 글자가 되고, 상대 언어로 번역돼요. 보이스룸에서는 목소리로 바로 이야기해요.", micTitle: "마이크 권한", micDescription: "말을 글자로 바꾸고, 보이스룸에서 이야기할 때 써요.", micAllow: "마이크 허용하고 계속", micGranted: "마이크가 켜졌어요", micDenied: "설정에서 언제든 켤 수 있어요",
  },
  en: {
    photoLabel: "Profile photo", photoTitle: "Add a profile photo", photoDescription: "A photo where your face is clear brings far more friends.", photoPick: "Choose a photo", photoChange: "Choose another photo", photoSkip: "I'll do it later", photoFailed: "Couldn't open that photo. Please choose another.",
    voiceLabel: "Talk with your voice", voiceTitle: "On HashChat you talk,\nnot type", voiceDescription: "What you say turns into text and is translated into their language right away. In voice rooms you just talk.", micTitle: "Microphone", micDescription: "Turns your speech into text, and lets you talk in voice rooms.", micAllow: "Allow microphone and continue", micGranted: "Microphone is on", micDenied: "You can turn it on anytime in Settings",
  },
  ja: {
    photoLabel: "プロフィール写真", photoTitle: "プロフィール写真を追加してください", photoDescription: "顔がよく見える写真だと、友達がずっと増えます。", photoPick: "写真を選ぶ", photoChange: "別の写真にする", photoSkip: "あとでする", photoFailed: "写真を開けませんでした。別の写真を選んでください。",
    voiceLabel: "声で話そう", voiceTitle: "HashChatはキーボードではなく\n声で話すアプリです", voiceDescription: "話すとすぐ文字になり、相手の言語に翻訳されます。ボイスルームでは声でそのまま話せます。", micTitle: "マイクの許可", micDescription: "話した内容を文字にし、ボイスルームで話すときに使います。", micAllow: "マイクを許可して続ける", micGranted: "マイクがオンになりました", micDenied: "設定からいつでもオンにできます",
  },
  "zh-CN": {
    photoLabel: "头像", photoTitle: "上传一张头像吧", photoDescription: "能看清脸的照片，会让你多交很多朋友。", photoPick: "选择照片", photoChange: "换一张照片", photoSkip: "以后再说", photoFailed: "无法打开这张照片，请换一张。",
    voiceLabel: "用声音聊天", voiceTitle: "在 HashChat\n用说的，不用打字", voiceDescription: "你说的话会马上变成文字，并翻译成对方的语言。在语音房里直接开口聊。", micTitle: "麦克风权限", micDescription: "把你说的话转成文字，并在语音房里聊天时使用。", micAllow: "允许麦克风并继续", micGranted: "麦克风已开启", micDenied: "随时可以在设置中开启",
  },
  "zh-TW": {
    photoLabel: "大頭貼", photoTitle: "上傳一張大頭貼吧", photoDescription: "看得清臉的照片，會讓你多交很多朋友。", photoPick: "選擇照片", photoChange: "換一張照片", photoSkip: "之後再說", photoFailed: "無法開啟這張照片，請換一張。",
    voiceLabel: "用聲音聊天", voiceTitle: "在 HashChat\n用說的，不用打字", voiceDescription: "你說的話會馬上變成文字，並翻譯成對方的語言。在語音房裡直接開口聊。", micTitle: "麥克風權限", micDescription: "把你說的話轉成文字，並在語音房裡聊天時使用。", micAllow: "允許麥克風並繼續", micGranted: "麥克風已開啟", micDenied: "隨時可以在設定中開啟",
  },
  fr: {
    photoLabel: "Photo de profil", photoTitle: "Ajoutez une photo de profil", photoDescription: "Une photo où l’on voit bien votre visage vous apporte bien plus d’amis.", photoPick: "Choisir une photo", photoChange: "Choisir une autre photo", photoSkip: "Plus tard", photoFailed: "Impossible d’ouvrir cette photo. Choisissez-en une autre.",
    voiceLabel: "Parlez avec votre voix", voiceTitle: "Sur HashChat, on parle\nau lieu de taper", voiceDescription: "Ce que vous dites devient du texte, traduit aussitôt dans leur langue. Dans les salons vocaux, vous parlez directement.", micTitle: "Micro", micDescription: "Transforme votre voix en texte et vous permet de parler dans les salons vocaux.", micAllow: "Autoriser le micro et continuer", micGranted: "Le micro est activé", micDenied: "Vous pouvez l’activer à tout moment dans Réglages",
  },
  de: {
    photoLabel: "Profilfoto", photoTitle: "Füge ein Profilfoto hinzu", photoDescription: "Mit einem Foto, auf dem dein Gesicht gut zu sehen ist, findest du viel mehr Freunde.", photoPick: "Foto auswählen", photoChange: "Anderes Foto wählen", photoSkip: "Später", photoFailed: "Das Foto ließ sich nicht öffnen. Bitte wähle ein anderes.",
    voiceLabel: "Sprich mit deiner Stimme", voiceTitle: "Bei HashChat sprichst du,\nstatt zu tippen", voiceDescription: "Was du sagst, wird sofort zu Text und in ihre Sprache übersetzt. In Voice-Räumen redest du einfach.", micTitle: "Mikrofon", micDescription: "Macht aus deiner Sprache Text und lässt dich in Voice-Räumen reden.", micAllow: "Mikrofon erlauben und weiter", micGranted: "Mikrofon ist an", micDenied: "Du kannst es jederzeit in den Einstellungen einschalten",
  },
  es: {
    photoLabel: "Foto de perfil", photoTitle: "Añade una foto de perfil", photoDescription: "Con una foto donde se vea bien tu cara harás muchos más amigos.", photoPick: "Elegir foto", photoChange: "Elegir otra foto", photoSkip: "Más tarde", photoFailed: "No se pudo abrir esa foto. Elige otra.",
    voiceLabel: "Habla con tu voz", voiceTitle: "En HashChat hablas,\nno escribes", voiceDescription: "Lo que dices se convierte en texto y se traduce al instante a su idioma. En las salas de voz hablas directamente.", micTitle: "Micrófono", micDescription: "Convierte tu voz en texto y te deja hablar en las salas de voz.", micAllow: "Permitir micrófono y continuar", micGranted: "El micrófono está activado", micDenied: "Puedes activarlo cuando quieras en Ajustes",
  },
  pt: {
    photoLabel: "Foto de perfil", photoTitle: "Adicione uma foto de perfil", photoDescription: "Uma foto em que dá para ver bem o seu rosto traz muito mais amigos.", photoPick: "Escolher foto", photoChange: "Escolher outra foto", photoSkip: "Depois", photoFailed: "Não foi possível abrir essa foto. Escolha outra.",
    voiceLabel: "Fale com a sua voz", voiceTitle: "No HashChat você fala,\nnão digita", voiceDescription: "O que você diz vira texto e é traduzido na hora para o idioma da outra pessoa. Nas salas de voz, é só falar.", micTitle: "Microfone", micDescription: "Transforma sua fala em texto e permite falar nas salas de voz.", micAllow: "Permitir microfone e continuar", micGranted: "O microfone está ligado", micDenied: "Você pode ativá-lo a qualquer momento em Ajustes",
  },
  it: {
    photoLabel: "Foto profilo", photoTitle: "Aggiungi una foto profilo", photoDescription: "Con una foto in cui si vede bene il viso trovi molti più amici.", photoPick: "Scegli una foto", photoChange: "Scegli un’altra foto", photoSkip: "Più tardi", photoFailed: "Impossibile aprire la foto. Scegline un’altra.",
    voiceLabel: "Parla con la tua voce", voiceTitle: "Su HashChat si parla,\nnon si scrive", voiceDescription: "Quello che dici diventa testo e viene tradotto subito nella loro lingua. Nelle stanze vocali parli e basta.", micTitle: "Microfono", micDescription: "Trasforma la voce in testo e ti fa parlare nelle stanze vocali.", micAllow: "Consenti il microfono e continua", micGranted: "Il microfono è attivo", micDenied: "Puoi attivarlo quando vuoi in Impostazioni",
  },
  ru: {
    photoLabel: "Фото профиля", photoTitle: "Добавьте фото профиля", photoDescription: "С фото, где хорошо видно лицо, друзей будет гораздо больше.", photoPick: "Выбрать фото", photoChange: "Выбрать другое фото", photoSkip: "Позже", photoFailed: "Не удалось открыть фото. Выберите другое.",
    voiceLabel: "Говорите голосом", voiceTitle: "В HashChat говорят,\nа не печатают", voiceDescription: "Сказанное сразу становится текстом и переводится на язык собеседника. В голосовых комнатах вы просто говорите.", micTitle: "Микрофон", micDescription: "Превращает речь в текст и позволяет говорить в голосовых комнатах.", micAllow: "Разрешить микрофон и продолжить", micGranted: "Микрофон включён", micDenied: "Его можно включить в Настройках в любое время",
  },
  ar: {
    photoLabel: "صورة الملف الشخصي", photoTitle: "أضف صورة للملف الشخصي", photoDescription: "الصورة التي يظهر فيها وجهك بوضوح تجلب لك أصدقاء أكثر بكثير.", photoPick: "اختر صورة", photoChange: "اختر صورة أخرى", photoSkip: "لاحقًا", photoFailed: "تعذّر فتح هذه الصورة. اختر صورة أخرى.",
    voiceLabel: "تحدّث بصوتك", voiceTitle: "في HashChat تتحدث\nبدل أن تكتب", voiceDescription: "ما تقوله يتحول فورًا إلى نص ويُترجم إلى لغة الطرف الآخر. وفي غرف الصوت تتحدث مباشرة.", micTitle: "الميكروفون", micDescription: "يحوّل كلامك إلى نص ويتيح لك التحدث في غرف الصوت.", micAllow: "اسمح بالميكروفون وتابع", micGranted: "الميكروفون يعمل", micDenied: "يمكنك تشغيله في أي وقت من الإعدادات",
  },
  hi: {
    photoLabel: "प्रोफ़ाइल फ़ोटो", photoTitle: "प्रोफ़ाइल फ़ोटो जोड़ें", photoDescription: "जिस फ़ोटो में चेहरा साफ़ दिखे, उससे कहीं ज़्यादा दोस्त बनते हैं।", photoPick: "फ़ोटो चुनें", photoChange: "दूसरी फ़ोटो चुनें", photoSkip: "बाद में", photoFailed: "यह फ़ोटो नहीं खुली। कृपया दूसरी चुनें।",
    voiceLabel: "आवाज़ से बात करें", voiceTitle: "HashChat पर टाइप नहीं,\nबोलकर बात करते हैं", voiceDescription: "आप जो बोलते हैं वह तुरंत टेक्स्ट बनकर उनकी भाषा में अनुवाद होता है। वॉइस रूम में सीधे बात करें।", micTitle: "माइक्रोफ़ोन", micDescription: "आपकी बोली को टेक्स्ट में बदलता है और वॉइस रूम में बात करने देता है।", micAllow: "माइक्रोफ़ोन की अनुमति दें और आगे बढ़ें", micGranted: "माइक्रोफ़ोन चालू है", micDenied: "आप इसे कभी भी सेटिंग्स में चालू कर सकते हैं",
  },
  th: {
    photoLabel: "รูปโปรไฟล์", photoTitle: "เพิ่มรูปโปรไฟล์", photoDescription: "รูปที่เห็นหน้าชัด ช่วยให้ได้เพื่อนมากขึ้นเยอะเลย", photoPick: "เลือกรูป", photoChange: "เปลี่ยนรูป", photoSkip: "ไว้ทีหลัง", photoFailed: "เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น",
    voiceLabel: "คุยด้วยเสียง", voiceTitle: "ใน HashChat\nพูดแทนการพิมพ์", voiceDescription: "สิ่งที่คุณพูดจะกลายเป็นข้อความและแปลเป็นภาษาของอีกฝ่ายทันที ในห้องเสียงก็คุยได้เลย", micTitle: "ไมโครโฟน", micDescription: "แปลงเสียงพูดเป็นข้อความ และใช้คุยในห้องเสียง", micAllow: "อนุญาตไมโครโฟนแล้วไปต่อ", micGranted: "เปิดไมโครโฟนแล้ว", micDenied: "เปิดได้ทุกเมื่อในการตั้งค่า",
  },
  vi: {
    photoLabel: "Ảnh đại diện", photoTitle: "Thêm ảnh đại diện", photoDescription: "Ảnh thấy rõ khuôn mặt sẽ giúp bạn có thêm nhiều bạn hơn.", photoPick: "Chọn ảnh", photoChange: "Chọn ảnh khác", photoSkip: "Để sau", photoFailed: "Không mở được ảnh này. Hãy chọn ảnh khác.",
    voiceLabel: "Nói chuyện bằng giọng nói", voiceTitle: "Trên HashChat bạn nói,\nkhông cần gõ", voiceDescription: "Lời bạn nói thành chữ và được dịch ngay sang ngôn ngữ của họ. Trong phòng thoại, cứ thế nói chuyện.", micTitle: "Micro", micDescription: "Chuyển lời nói thành chữ và để bạn nói chuyện trong phòng thoại.", micAllow: "Cho phép micro và tiếp tục", micGranted: "Micro đã bật", micDenied: "Bạn có thể bật bất cứ lúc nào trong Cài đặt",
  },
};

export function resolveOnboardingExtraCopy(rawLocale: string): OnboardingExtraCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
