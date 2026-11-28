import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";

/** The sheet shown before the system notification prompt (see @/lib/push-prompt). */
export type PushPromptCopy = {
  title: string;
  body: string;
  allow: string;
  later: string;
};

const COPY: Record<PrimaryUiLocale, PushPromptCopy> = {
  ko: { title: "답장이 오면 알려 드릴까요?", body: "친구가 답장하거나 말을 걸면 알림으로 알려 드려요.", allow: "알림 받기", later: "나중에" },
  en: { title: "Want to know when a friend replies?", body: "We'll notify you when a friend replies or says hi.", allow: "Turn on notifications", later: "Not now" },
  ja: { title: "返信が来たらお知らせしましょうか？", body: "友達から返信やメッセージが届いたら通知でお知らせします。", allow: "通知を受け取る", later: "あとで" },
  "zh-CN": { title: "朋友回复时通知你吗？", body: "朋友回复或找你聊天时，我们会通知你。", allow: "开启通知", later: "以后再说" },
  "zh-TW": { title: "朋友回覆時通知你嗎？", body: "朋友回覆或找你聊天時，我們會通知你。", allow: "開啟通知", later: "之後再說" },
  fr: { title: "Voulez-vous savoir quand un ami répond ?", body: "Nous vous prévenons quand un ami répond ou vous écrit.", allow: "Activer les notifications", later: "Plus tard" },
  de: { title: "Möchtest du wissen, wenn ein Freund antwortet?", body: "Wir benachrichtigen dich, wenn ein Freund antwortet oder dir schreibt.", allow: "Benachrichtigungen einschalten", later: "Später" },
  es: { title: "¿Quieres saber cuándo responde un amigo?", body: "Te avisamos cuando un amigo responde o te escribe.", allow: "Activar notificaciones", later: "Ahora no" },
  pt: { title: "Quer saber quando um amigo responder?", body: "Avisamos quando um amigo responder ou falar com você.", allow: "Ativar notificações", later: "Agora não" },
  it: { title: "Vuoi sapere quando un amico risponde?", body: "Ti avvisiamo quando un amico risponde o ti scrive.", allow: "Attiva le notifiche", later: "Non ora" },
  ru: { title: "Сообщать, когда друг ответит?", body: "Мы пришлём уведомление, когда друг ответит или напишет вам.", allow: "Включить уведомления", later: "Не сейчас" },
  ar: { title: "هل تريد أن تعرف عندما يرد صديق؟", body: "سنُعلمك عندما يرد صديق أو يراسلك.", allow: "تفعيل الإشعارات", later: "ليس الآن" },
  hi: { title: "दोस्त का जवाब आने पर बताएं?", body: "जब कोई दोस्त जवाब देगा या बात शुरू करेगा, हम आपको सूचना देंगे।", allow: "सूचनाएं चालू करें", later: "अभी नहीं" },
  th: { title: "ให้แจ้งเตือนเมื่อเพื่อนตอบกลับไหม?", body: "เราจะแจ้งเตือนเมื่อเพื่อนตอบกลับหรือทักมา", allow: "เปิดการแจ้งเตือน", later: "ไว้ทีหลัง" },
  vi: { title: "Báo cho bạn khi bạn bè trả lời nhé?", body: "Chúng tôi sẽ thông báo khi bạn bè trả lời hoặc nhắn cho bạn.", allow: "Bật thông báo", later: "Để sau" },
};

export const PUSH_PROMPT_COPY_LOCALES = Object.keys(COPY);

export function resolvePushPromptCopy(rawLocale: string): PushPromptCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return COPY[locale] ?? COPY.en;
}
