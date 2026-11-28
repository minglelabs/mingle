import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The voice room screen (owner, 2026-11-25): the stage on top of an open
// room, with labelled buttons under it. 15 primary UI languages.
export type VoiceRoomCopy = {
  /** The wide button of someone who is in the room but not in its voice talk. */
  join: string
  /** Small badge on the host's seat. */
  host: string
  /** Under an empty seat. */
  emptySeat: string
  /** Labels under the round buttons. */
  mic: string
  hand: string
  interpret: string
  listen: string
  leave: string
  /** How many people only listen, e.g. "Listening 12". */
  audience: (count: number) => string
  /** Nobody is in the voice talk yet. */
  quiet: string
}

const COPY: Record<LegalDocumentLocale, VoiceRoomCopy> = {
  ko: { join: '보이스룸 참여하기', host: '방장', emptySeat: '빈 자리', mic: '마이크', hand: '손들기', interpret: '통역', listen: '듣기', leave: '나가기', audience: (n) => `듣는 사람 ${n}`, quiet: '아직 아무도 없어요. 먼저 말을 걸어 보세요' },
  en: { join: 'Join the voice room', host: 'Host', emptySeat: 'Open seat', mic: 'Mic', hand: 'Raise hand', interpret: 'Interpret', listen: 'Listen', leave: 'Leave', audience: (n) => `Listening ${n}`, quiet: 'Nobody is here yet. Be the first to say hi' },
  ja: { join: 'ボイスルームに参加', host: 'ホスト', emptySeat: '空席', mic: 'マイク', hand: '挙手', interpret: '通訳', listen: '聞く', leave: '退出', audience: (n) => `聞いている人 ${n}`, quiet: 'まだ誰もいません。最初に話しかけてみましょう' },
  'zh-CN': { join: '加入语音房', host: '房主', emptySeat: '空位', mic: '麦克风', hand: '举手', interpret: '翻译', listen: '收听', leave: '离开', audience: (n) => `听众 ${n}`, quiet: '还没有人，来第一个打招呼吧' },
  'zh-TW': { join: '加入語音房', host: '房主', emptySeat: '空位', mic: '麥克風', hand: '舉手', interpret: '翻譯', listen: '收聽', leave: '離開', audience: (n) => `聽眾 ${n}`, quiet: '還沒有人，來第一個打招呼吧' },
  fr: { join: 'Rejoindre le salon vocal', host: 'Hôte', emptySeat: 'Place libre', mic: 'Micro', hand: 'Lever la main', interpret: 'Interprète', listen: 'Écouter', leave: 'Quitter', audience: (n) => `À l’écoute ${n}`, quiet: 'Personne pour l’instant. Dites bonjour en premier' },
  de: { join: 'Sprachraum beitreten', host: 'Gastgeber', emptySeat: 'Freier Platz', mic: 'Mikro', hand: 'Hand heben', interpret: 'Dolmetschen', listen: 'Zuhören', leave: 'Verlassen', audience: (n) => `Hören zu ${n}`, quiet: 'Noch ist niemand da. Sag als Erste:r Hallo' },
  es: { join: 'Unirse a la sala de voz', host: 'Anfitrión', emptySeat: 'Asiento libre', mic: 'Micro', hand: 'Levantar mano', interpret: 'Intérprete', listen: 'Escuchar', leave: 'Salir', audience: (n) => `Escuchando ${n}`, quiet: 'Aún no hay nadie. Sé el primero en saludar' },
  pt: { join: 'Entrar na sala de voz', host: 'Anfitrião', emptySeat: 'Lugar livre', mic: 'Microfone', hand: 'Levantar mão', interpret: 'Intérprete', listen: 'Ouvir', leave: 'Sair', audience: (n) => `Ouvindo ${n}`, quiet: 'Ainda não há ninguém. Seja o primeiro a dizer oi' },
  it: { join: 'Entra nella stanza vocale', host: 'Host', emptySeat: 'Posto libero', mic: 'Microfono', hand: 'Alza la mano', interpret: 'Interprete', listen: 'Ascolta', leave: 'Esci', audience: (n) => `In ascolto ${n}`, quiet: 'Non c’è ancora nessuno. Saluta per primo' },
  ru: { join: 'Войти в голосовую комнату', host: 'Ведущий', emptySeat: 'Свободно', mic: 'Микрофон', hand: 'Поднять руку', interpret: 'Перевод', listen: 'Слушать', leave: 'Выйти', audience: (n) => `Слушают ${n}`, quiet: 'Пока никого нет. Поздоровайтесь первым' },
  ar: { join: 'انضم إلى الغرفة الصوتية', host: 'المضيف', emptySeat: 'مقعد شاغر', mic: 'الميكروفون', hand: 'رفع اليد', interpret: 'ترجمة', listen: 'استماع', leave: 'مغادرة', audience: (n) => `المستمعون ${n}`, quiet: 'لا أحد هنا بعد. كن أول من يلقي التحية' },
  hi: { join: 'वॉइस रूम में शामिल हों', host: 'होस्ट', emptySeat: 'खाली सीट', mic: 'माइक', hand: 'हाथ उठाएँ', interpret: 'अनुवाद', listen: 'सुनें', leave: 'बाहर जाएँ', audience: (n) => `सुन रहे हैं ${n}`, quiet: 'अभी कोई नहीं है। सबसे पहले नमस्ते कहें' },
  th: { join: 'เข้าร่วมห้องเสียง', host: 'โฮสต์', emptySeat: 'ที่ว่าง', mic: 'ไมค์', hand: 'ยกมือ', interpret: 'ล่าม', listen: 'ฟัง', leave: 'ออก', audience: (n) => `ผู้ฟัง ${n}`, quiet: 'ยังไม่มีใครเลย มาทักทายเป็นคนแรกกัน' },
  vi: { join: 'Tham gia phòng thoại', host: 'Chủ phòng', emptySeat: 'Ghế trống', mic: 'Micro', hand: 'Giơ tay', interpret: 'Phiên dịch', listen: 'Nghe', leave: 'Rời', audience: (n) => `Đang nghe ${n}`, quiet: 'Chưa có ai. Hãy là người đầu tiên chào nhé' },
}

export function voiceRoomCopy(locale: string): VoiceRoomCopy {
  return COPY[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) ?? 'en')] ?? COPY.en
}
