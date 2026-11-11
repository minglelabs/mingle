import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";
import type { SpeechLengthOption } from "@/lib/speech-length";

/**
 * Copy for a new user's first run: the "say something" card on the
 * conversation list and the speech length choice shown after the first
 * translation. Wording avoids the settings' terms (automatic detection,
 * silence, steps); the card only asks how long a sentence should be kept
 * together.
 */
export type FirstRunCopy = {
  speakTitle: string;
  speakHint: string;
  speakButton: string;
  lengthTitle: string;
  lengthHint: string;
  lengthApplied: string;
  lengthClose: string;
  lengthOptions: Record<SpeechLengthOption, { label: string; hint: string | null }>;
};

const FIRST_RUN_COPY: Record<PrimaryUiLocale, FirstRunCopy> = {
  ko: {
    speakTitle: "말하면 바로 통역돼요",
    speakHint: "아무 말이나 해 보세요. 알아듣고 바로 번역해 드려요.",
    speakButton: "눌러서 말해 보기",
    lengthTitle: "문장을 얼마나 길게 묶을까요?",
    lengthHint: "고르면 바로 바뀌어요. 설정에서 언제든 다시 바꿀 수 있어요.",
    lengthApplied: "바꿨어요. 다시 말해 보세요.",
    lengthClose: "닫기",
    lengthOptions: {
      auto3: { label: "짧게", hint: "수다에 좋아요" },
      auto5: { label: "보통", hint: null },
      silence2s: { label: "길게", hint: null },
      silence3s: { label: "아주 길게", hint: "회의·통역에 좋아요" },
    },
  },
  en: {
    speakTitle: "Speak, and it's interpreted right away",
    speakHint: "Say anything. It listens and translates at once.",
    speakButton: "Tap to speak",
    lengthTitle: "How long should a sentence run?",
    lengthHint: "It changes as soon as you pick. You can change it again in settings.",
    lengthApplied: "Changed. Try speaking again.",
    lengthClose: "Close",
    lengthOptions: {
      auto3: { label: "Short", hint: "Good for chatting" },
      auto5: { label: "Medium", hint: null },
      silence2s: { label: "Long", hint: null },
      silence3s: { label: "Very long", hint: "Good for meetings and interpreting" },
    },
  },
  ja: {
    speakTitle: "話すとすぐに通訳されます",
    speakHint: "何か話してみてください。聞き取ってすぐに翻訳します。",
    speakButton: "タップして話してみる",
    lengthTitle: "文をどのくらいの長さでまとめますか？",
    lengthHint: "選ぶとすぐに変わります。設定でいつでも変更できます。",
    lengthApplied: "変更しました。もう一度話してみてください。",
    lengthClose: "閉じる",
    lengthOptions: {
      auto3: { label: "短め", hint: "おしゃべり向き" },
      auto5: { label: "ふつう", hint: null },
      silence2s: { label: "長め", hint: null },
      silence3s: { label: "とても長め", hint: "会議・通訳向き" },
    },
  },
  "zh-CN": {
    speakTitle: "一开口，立即翻译",
    speakHint: "随便说点什么。它会听懂并立即翻译。",
    speakButton: "点一下说说看",
    lengthTitle: "一句话要多长才断开？",
    lengthHint: "选择后立即生效。之后可以在设置里随时更改。",
    lengthApplied: "已更改。请再说一次试试。",
    lengthClose: "关闭",
    lengthOptions: {
      auto3: { label: "短", hint: "适合闲聊" },
      auto5: { label: "适中", hint: null },
      silence2s: { label: "长", hint: null },
      silence3s: { label: "很长", hint: "适合会议和口译" },
    },
  },
  "zh-TW": {
    speakTitle: "一開口，立即翻譯",
    speakHint: "隨便說點什麼。它會聽懂並立即翻譯。",
    speakButton: "點一下說說看",
    lengthTitle: "一句話要多長才斷開？",
    lengthHint: "選擇後立即生效。之後可以在設定裡隨時更改。",
    lengthApplied: "已更改。請再說一次試試。",
    lengthClose: "關閉",
    lengthOptions: {
      auto3: { label: "短", hint: "適合閒聊" },
      auto5: { label: "適中", hint: null },
      silence2s: { label: "長", hint: null },
      silence3s: { label: "很長", hint: "適合會議和口譯" },
    },
  },
  fr: {
    speakTitle: "Parlez, c’est interprété aussitôt",
    speakHint: "Dites ce que vous voulez. L’appli écoute et traduit tout de suite.",
    speakButton: "Touchez pour parler",
    lengthTitle: "Quelle longueur pour une phrase ?",
    lengthHint: "Le changement est immédiat. Vous pouvez le modifier dans les réglages.",
    lengthApplied: "C’est changé. Essayez de parler à nouveau.",
    lengthClose: "Fermer",
    lengthOptions: {
      auto3: { label: "Courte", hint: "Idéal pour bavarder" },
      auto5: { label: "Moyenne", hint: null },
      silence2s: { label: "Longue", hint: null },
      silence3s: { label: "Très longue", hint: "Idéal pour les réunions et l’interprétation" },
    },
  },
  de: {
    speakTitle: "Sprich, und es wird sofort gedolmetscht",
    speakHint: "Sag einfach etwas. Die App hört zu und übersetzt sofort.",
    speakButton: "Tippen und sprechen",
    lengthTitle: "Wie lang soll ein Satz werden?",
    lengthHint: "Die Auswahl gilt sofort. Du kannst sie in den Einstellungen ändern.",
    lengthApplied: "Geändert. Sprich noch einmal.",
    lengthClose: "Schließen",
    lengthOptions: {
      auto3: { label: "Kurz", hint: "Gut zum Plaudern" },
      auto5: { label: "Mittel", hint: null },
      silence2s: { label: "Lang", hint: null },
      silence3s: { label: "Sehr lang", hint: "Gut für Meetings und Dolmetschen" },
    },
  },
  es: {
    speakTitle: "Habla y se interpreta al instante",
    speakHint: "Di lo que quieras. La app escucha y traduce enseguida.",
    speakButton: "Toca para hablar",
    lengthTitle: "¿Qué longitud debe tener una frase?",
    lengthHint: "Cambia en cuanto eliges. Puedes modificarlo en los ajustes.",
    lengthApplied: "Cambiado. Prueba a hablar de nuevo.",
    lengthClose: "Cerrar",
    lengthOptions: {
      auto3: { label: "Corta", hint: "Ideal para charlar" },
      auto5: { label: "Media", hint: null },
      silence2s: { label: "Larga", hint: null },
      silence3s: { label: "Muy larga", hint: "Ideal para reuniones e interpretación" },
    },
  },
  pt: {
    speakTitle: "Fale e a interpretação sai na hora",
    speakHint: "Diga qualquer coisa. O app escuta e traduz na hora.",
    speakButton: "Toque para falar",
    lengthTitle: "Qual o tamanho de uma frase?",
    lengthHint: "Muda assim que você escolhe. Dá para alterar nos ajustes.",
    lengthApplied: "Alterado. Tente falar de novo.",
    lengthClose: "Fechar",
    lengthOptions: {
      auto3: { label: "Curta", hint: "Boa para bater papo" },
      auto5: { label: "Média", hint: null },
      silence2s: { label: "Longa", hint: null },
      silence3s: { label: "Muito longa", hint: "Boa para reuniões e interpretação" },
    },
  },
  it: {
    speakTitle: "Parla e viene interpretato subito",
    speakHint: "Di’ qualcosa. L’app ascolta e traduce subito.",
    speakButton: "Tocca per parlare",
    lengthTitle: "Quanto deve essere lunga una frase?",
    lengthHint: "Cambia appena scegli. Puoi modificarlo nelle impostazioni.",
    lengthApplied: "Modificato. Prova a parlare di nuovo.",
    lengthClose: "Chiudi",
    lengthOptions: {
      auto3: { label: "Corta", hint: "Ideale per chiacchierare" },
      auto5: { label: "Media", hint: null },
      silence2s: { label: "Lunga", hint: null },
      silence3s: { label: "Molto lunga", hint: "Ideale per riunioni e interpretariato" },
    },
  },
  ru: {
    speakTitle: "Говорите — перевод появится сразу",
    speakHint: "Скажите что угодно. Приложение услышит и сразу переведёт.",
    speakButton: "Нажмите и говорите",
    lengthTitle: "Какой длины должна быть фраза?",
    lengthHint: "Изменится сразу после выбора. Позже можно поменять в настройках.",
    lengthApplied: "Изменено. Попробуйте сказать ещё раз.",
    lengthClose: "Закрыть",
    lengthOptions: {
      auto3: { label: "Короткая", hint: "Для болтовни" },
      auto5: { label: "Средняя", hint: null },
      silence2s: { label: "Длинная", hint: null },
      silence3s: { label: "Очень длинная", hint: "Для встреч и перевода" },
    },
  },
  ar: {
    speakTitle: "تحدّث وستُترجم فورًا",
    speakHint: "قل أي شيء. التطبيق يسمع ويترجم في الحال.",
    speakButton: "اضغط وتحدّث",
    lengthTitle: "ما طول الجملة المناسب؟",
    lengthHint: "يتغيّر فور الاختيار. يمكنك تغييره لاحقًا من الإعدادات.",
    lengthApplied: "تم التغيير. جرّب التحدّث مرة أخرى.",
    lengthClose: "إغلاق",
    lengthOptions: {
      auto3: { label: "قصيرة", hint: "مناسبة للدردشة" },
      auto5: { label: "متوسطة", hint: null },
      silence2s: { label: "طويلة", hint: null },
      silence3s: { label: "طويلة جدًا", hint: "مناسبة للاجتماعات والترجمة الفورية" },
    },
  },
  hi: {
    speakTitle: "बोलिए, तुरंत अनुवाद हो जाएगा",
    speakHint: "कुछ भी बोलकर देखें। ऐप सुनकर तुरंत अनुवाद करता है।",
    speakButton: "दबाकर बोलें",
    lengthTitle: "एक वाक्य कितना लंबा रखा जाए?",
    lengthHint: "चुनते ही बदल जाता है। सेटिंग्स में कभी भी बदल सकते हैं।",
    lengthApplied: "बदल दिया। फिर से बोलकर देखें।",
    lengthClose: "बंद करें",
    lengthOptions: {
      auto3: { label: "छोटा", hint: "गपशप के लिए अच्छा" },
      auto5: { label: "मध्यम", hint: null },
      silence2s: { label: "लंबा", hint: null },
      silence3s: { label: "बहुत लंबा", hint: "मीटिंग और अनुवाद के लिए अच्छा" },
    },
  },
  th: {
    speakTitle: "พูดแล้วแปลให้ทันที",
    speakHint: "ลองพูดอะไรก็ได้ แอปจะฟังและแปลให้ทันที",
    speakButton: "แตะเพื่อพูด",
    lengthTitle: "อยากให้หนึ่งประโยคยาวแค่ไหน",
    lengthHint: "เลือกแล้วเปลี่ยนทันที เปลี่ยนได้อีกในการตั้งค่า",
    lengthApplied: "เปลี่ยนแล้ว ลองพูดอีกครั้ง",
    lengthClose: "ปิด",
    lengthOptions: {
      auto3: { label: "สั้น", hint: "เหมาะกับการคุยเล่น" },
      auto5: { label: "ปานกลาง", hint: null },
      silence2s: { label: "ยาว", hint: null },
      silence3s: { label: "ยาวมาก", hint: "เหมาะกับการประชุมและล่าม" },
    },
  },
  vi: {
    speakTitle: "Nói là được phiên dịch ngay",
    speakHint: "Hãy nói bất cứ điều gì. Ứng dụng nghe và dịch ngay.",
    speakButton: "Chạm để nói",
    lengthTitle: "Một câu nên dài bao nhiêu?",
    lengthHint: "Chọn là đổi ngay. Bạn có thể đổi lại trong phần cài đặt.",
    lengthApplied: "Đã đổi. Hãy thử nói lại.",
    lengthClose: "Đóng",
    lengthOptions: {
      auto3: { label: "Ngắn", hint: "Hợp để trò chuyện" },
      auto5: { label: "Vừa", hint: null },
      silence2s: { label: "Dài", hint: null },
      silence3s: { label: "Rất dài", hint: "Hợp cho họp và phiên dịch" },
    },
  },
};

export function resolveFirstRunCopy(rawLocale: string): FirstRunCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return FIRST_RUN_COPY[locale] ?? FIRST_RUN_COPY.en;
}
