import { type AppLocale } from "@/i18n/config";
import { resolvePrimaryUiLocale, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// Copy for coins, shown to users as "Hash" (Korean "해씨", other languages
// the word "hash" in their own script): balance chip, store, "out of coins" sheet, banners and the
// usage screen (docs/coin-iap-spec.md 9). Placeholders: {free} {paid} {cap}
// {time} {minutes} {coins} {stt} {tts}.
export type CoinCopy = {
  coin: string;
  storeTitle: string;
  balanceLabel: string;
  freePaid: string;
  dailyTitle: string;
  dailyNext: string;
  dailyFull: string;
  recommended: string;
  minutesHint: string;
  purchasing: string;
  purchasePending: string;
  purchaseSuccess: string;
  purchaseFailed: string;
  productsLoadError: string;
  retry: string;
  updateRequired: string;
  webUnavailable: string;
  ttsCostNotice: string;
  restore: string;
  viewUsage: string;
  terms: string;
  exhaustedTitle: string;
  exhaustedBody: string;
  exhaustedBanner: string;
  lowBanner: string;
  charge: string;
  close: string;
  usedCoins: string;
  rangeToday: string;
  range7d: string;
  range30d: string;
  kindStt: string;
  kindTranslation: string;
  kindTts: string;
  kindImageText: string;
  history: string;
  sourceDailyFree: string;
  sourcePurchase: string;
  sourceAdmin: string;
  sourceBonus: string;
  sourceRefund: string;
  sourceExpired: string;
  conversationFallback: string;
  noHistory: string;
  loadMore: string;
  // Room participants list: Hash each member has spent in this room.
  roomUsageTitle: string;
  roomUsed: string;
};

const COIN_COPY: Record<PrimaryUiLocale, CoinCopy> = {
  ko: {
    coin: "해씨", storeTitle: "해씨 상점", balanceLabel: "보유 해씨", freePaid: "무료 {free} · 충전 {paid}",
    dailyTitle: "매일 무료 해씨를 {cap}까지 채워 드려요", dailyNext: "다음 충전까지 {time}", dailyFull: "무료 해씨가 가득 차 있어요",
    recommended: "추천", minutesHint: "통역 약 {minutes}분",
    purchasing: "결제 중…", purchasePending: "승인 대기 중", purchaseSuccess: "해씨 {coins}개가 충전됐어요", purchaseFailed: "결제를 완료하지 못했어요",
    productsLoadError: "상품을 불러오지 못했어요", retry: "다시 시도", updateRequired: "앱을 업데이트하면 충전할 수 있어요",
    webUnavailable: "지금은 앱에서만 충전할 수 있어요", ttsCostNotice: "음성 통역을 켜면 해씨가 더 빨리 줄어요. 음성 인식은 분당 약 {stt}해씨, 음성 재생은 1분당 약 {tts}해씨가 추가로 들어요.",
    restore: "구매 복원", viewUsage: "사용 내역 보기", terms: "구매한 해씨는 만료되지 않으며, 환불은 스토어 정책을 따릅니다.",
    exhaustedTitle: "해씨를 다 썼어요", exhaustedBody: "번역과 통역을 계속하려면 해씨를 충전해 주세요.",
    exhaustedBanner: "해씨가 없어 번역과 통역이 멈췄어요", lowBanner: "해씨가 얼마 남지 않았어요", charge: "충전하기", close: "닫기",
    usedCoins: "사용한 해씨", rangeToday: "오늘", range7d: "7일", range30d: "30일",
    kindStt: "음성 인식", kindTranslation: "번역", kindTts: "음성 통역", kindImageText: "사진 번역",
    history: "내역", sourceDailyFree: "무료 충전", sourcePurchase: "구매", sourceAdmin: "운영자 지급", sourceBonus: "보너스",
    sourceRefund: "환불", sourceExpired: "만료", conversationFallback: "대화", noHistory: "아직 내역이 없어요", loadMore: "더 보기",
    roomUsageTitle: "이 대화방에서 쓴 해씨", roomUsed: "{coins} 사용",
  },
  en: {
    coin: "Hash", storeTitle: "Hash Store", balanceLabel: "Your Hash", freePaid: "Free {free} · Purchased {paid}",
    dailyTitle: "Free Hash is topped up to {cap} every day", dailyNext: "Next top-up in {time}", dailyFull: "Your free Hash is full",
    recommended: "Best value", minutesHint: "About {minutes} min of interpreting",
    purchasing: "Processing…", purchasePending: "Waiting for approval", purchaseSuccess: "{coins} Hash added", purchaseFailed: "The purchase could not be completed",
    productsLoadError: "Could not load the products", retry: "Try again", updateRequired: "Update the app to get Hash",
    webUnavailable: "Hash can only be bought in the app for now", ttsCostNotice: "Voice interpreting uses Hash faster. Speech recognition costs about {stt} Hash per minute, and spoken playback adds about {tts} Hash per minute of audio.",
    restore: "Restore purchases", viewUsage: "View usage", terms: "Purchased Hash never expires. Refunds follow the store's policy.",
    exhaustedTitle: "You're out of Hash", exhaustedBody: "Add Hash to keep translating and interpreting.",
    exhaustedBanner: "Translation and interpreting are paused: no Hash left", lowBanner: "You're running low on Hash", charge: "Get Hash", close: "Close",
    usedCoins: "Hash used", rangeToday: "Today", range7d: "7 days", range30d: "30 days",
    kindStt: "Speech recognition", kindTranslation: "Translation", kindTts: "Voice interpreting", kindImageText: "Photo translation",
    history: "History", sourceDailyFree: "Free top-up", sourcePurchase: "Purchase", sourceAdmin: "From HashChat", sourceBonus: "Bonus",
    sourceRefund: "Refund", sourceExpired: "Expired", conversationFallback: "Conversation", noHistory: "No history yet", loadMore: "Show more",
    roomUsageTitle: "Hash used in this chat", roomUsed: "{coins} used",
  },
  ja: {
    coin: "ハッシュ", storeTitle: "ハッシュストア", balanceLabel: "保有ハッシュ", freePaid: "無料 {free} · 購入 {paid}",
    dailyTitle: "無料ハッシュを毎日 {cap} まで補充します", dailyNext: "次の補充まで {time}", dailyFull: "無料ハッシュは満タンです",
    recommended: "おすすめ", minutesHint: "通訳 約{minutes}分",
    purchasing: "処理中…", purchasePending: "承認待ち", purchaseSuccess: "{coins} ハッシュをチャージしました", purchaseFailed: "購入を完了できませんでした",
    productsLoadError: "商品を読み込めませんでした", retry: "再試行", updateRequired: "アプリを更新するとチャージできます",
    webUnavailable: "現在はアプリでのみチャージできます", ttsCostNotice: "音声通訳をオンにするとハッシュの消費が速くなります。音声認識は1分あたり約{stt}ハッシュ、音声再生は1分あたり約{tts}ハッシュが追加でかかります。",
    restore: "購入を復元", viewUsage: "利用履歴を見る", terms: "購入したハッシュに有効期限はありません。返金はストアのポリシーに従います。",
    exhaustedTitle: "ハッシュがなくなりました", exhaustedBody: "翻訳と通訳を続けるにはハッシュをチャージしてください。",
    exhaustedBanner: "ハッシュがないため翻訳と通訳が停止しました", lowBanner: "ハッシュが残りわずかです", charge: "チャージする", close: "閉じる",
    usedCoins: "使用したハッシュ", rangeToday: "今日", range7d: "7日間", range30d: "30日間",
    kindStt: "音声認識", kindTranslation: "翻訳", kindTts: "音声通訳", kindImageText: "写真翻訳",
    history: "履歴", sourceDailyFree: "無料チャージ", sourcePurchase: "購入", sourceAdmin: "運営からの付与", sourceBonus: "ボーナス",
    sourceRefund: "返金", sourceExpired: "期限切れ", conversationFallback: "会話", noHistory: "履歴はまだありません", loadMore: "もっと見る",
    roomUsageTitle: "このトークで使ったハッシュ", roomUsed: "{coins} 使用",
  },
  "zh-CN": {
    coin: "哈希", storeTitle: "哈希商店", balanceLabel: "持有哈希", freePaid: "免费 {free} · 充值 {paid}",
    dailyTitle: "每天将免费哈希补满至 {cap}", dailyNext: "距离下次补充 {time}", dailyFull: "免费哈希已满",
    recommended: "推荐", minutesHint: "约可口译 {minutes} 分钟",
    purchasing: "处理中…", purchasePending: "等待批准", purchaseSuccess: "已充值 {coins} 哈希", purchaseFailed: "未能完成购买",
    productsLoadError: "无法加载商品", retry: "重试", updateRequired: "更新应用后即可充值",
    webUnavailable: "目前只能在应用内充值", ttsCostNotice: "开启语音口译后哈希消耗更快。语音识别每分钟约 {stt} 哈希，语音播放每分钟另需约 {tts} 哈希。",
    restore: "恢复购买", viewUsage: "查看使用记录", terms: "购买的哈希不会过期，退款遵循应用商店政策。",
    exhaustedTitle: "哈希已用完", exhaustedBody: "请充值哈希以继续使用翻译和口译。",
    exhaustedBanner: "哈希不足，翻译和口译已暂停", lowBanner: "哈希即将用完", charge: "去充值", close: "关闭",
    usedCoins: "已用哈希", rangeToday: "今天", range7d: "7天", range30d: "30天",
    kindStt: "语音识别", kindTranslation: "翻译", kindTts: "语音口译", kindImageText: "图片翻译",
    history: "记录", sourceDailyFree: "免费补充", sourcePurchase: "购买", sourceAdmin: "官方赠送", sourceBonus: "奖励",
    sourceRefund: "退款", sourceExpired: "已过期", conversationFallback: "对话", noHistory: "暂无记录", loadMore: "查看更多",
    roomUsageTitle: "本聊天已用哈希", roomUsed: "已用 {coins}",
  },
  "zh-TW": {
    coin: "哈希", storeTitle: "哈希商店", balanceLabel: "持有哈希", freePaid: "免費 {free} · 儲值 {paid}",
    dailyTitle: "每天將免費哈希補滿至 {cap}", dailyNext: "距離下次補充 {time}", dailyFull: "免費哈希已滿",
    recommended: "推薦", minutesHint: "約可口譯 {minutes} 分鐘",
    purchasing: "處理中…", purchasePending: "等待核准", purchaseSuccess: "已儲值 {coins} 哈希", purchaseFailed: "無法完成購買",
    productsLoadError: "無法載入商品", retry: "重試", updateRequired: "更新 App 後即可儲值",
    webUnavailable: "目前只能在 App 內儲值", ttsCostNotice: "開啟語音口譯後哈希消耗更快。語音辨識每分鐘約 {stt} 哈希，語音播放每分鐘另需約 {tts} 哈希。",
    restore: "回復購買", viewUsage: "查看使用紀錄", terms: "購買的哈希不會過期，退款依商店政策辦理。",
    exhaustedTitle: "哈希已用完", exhaustedBody: "請儲值哈希以繼續使用翻譯和口譯。",
    exhaustedBanner: "哈希不足，翻譯和口譯已暫停", lowBanner: "哈希即將用完", charge: "前往儲值", close: "關閉",
    usedCoins: "已用哈希", rangeToday: "今天", range7d: "7天", range30d: "30天",
    kindStt: "語音辨識", kindTranslation: "翻譯", kindTts: "語音口譯", kindImageText: "圖片翻譯",
    history: "紀錄", sourceDailyFree: "免費補充", sourcePurchase: "購買", sourceAdmin: "官方贈送", sourceBonus: "獎勵",
    sourceRefund: "退款", sourceExpired: "已過期", conversationFallback: "對話", noHistory: "尚無紀錄", loadMore: "查看更多",
    roomUsageTitle: "本聊天已用哈希", roomUsed: "已用 {coins}",
  },
  fr: {
    coin: "Hash", storeTitle: "Boutique Hash", balanceLabel: "Vos Hash", freePaid: "Gratuits {free} · Achetés {paid}",
    dailyTitle: "Vos Hash gratuits sont complétés jusqu'à {cap} chaque jour", dailyNext: "Prochaine recharge dans {time}", dailyFull: "Vos Hash gratuits sont au maximum",
    recommended: "Meilleure offre", minutesHint: "Environ {minutes} min d'interprétation",
    purchasing: "Traitement…", purchasePending: "En attente d'approbation", purchaseSuccess: "{coins} Hash ajoutés", purchaseFailed: "L'achat n'a pas pu être finalisé",
    productsLoadError: "Impossible de charger les offres", retry: "Réessayer", updateRequired: "Mettez l'app à jour pour obtenir des Hash",
    webUnavailable: "Pour l'instant, les Hash s'achètent uniquement dans l'app", ttsCostNotice: "L'interprétation vocale consomme les Hash plus vite. La reconnaissance vocale coûte environ {stt} Hash par minute, et la lecture audio ajoute environ {tts} Hash par minute.",
    restore: "Restaurer les achats", viewUsage: "Voir l'utilisation", terms: "Les Hash achetés n'expirent pas. Les remboursements suivent la politique de la boutique.",
    exhaustedTitle: "Vous n'avez plus de Hash", exhaustedBody: "Ajoutez des Hash pour continuer à traduire et interpréter.",
    exhaustedBanner: "Traduction et interprétation en pause : plus de Hash", lowBanner: "Il vous reste peu de Hash", charge: "Obtenir des Hash", close: "Fermer",
    usedCoins: "Hash utilisés", rangeToday: "Aujourd'hui", range7d: "7 jours", range30d: "30 jours",
    kindStt: "Reconnaissance vocale", kindTranslation: "Traduction", kindTts: "Interprétation vocale", kindImageText: "Traduction de photos",
    history: "Historique", sourceDailyFree: "Recharge gratuite", sourcePurchase: "Achat", sourceAdmin: "Offert par HashChat", sourceBonus: "Bonus",
    sourceRefund: "Remboursement", sourceExpired: "Expiré", conversationFallback: "Conversation", noHistory: "Aucun historique", loadMore: "Voir plus",
    roomUsageTitle: "Hash utilisés dans cette discussion", roomUsed: "{coins} utilisés",
  },
  de: {
    coin: "Hash", storeTitle: "Hash-Shop", balanceLabel: "Deine Hash", freePaid: "Gratis {free} · Gekauft {paid}",
    dailyTitle: "Gratis-Hash wird täglich auf {cap} aufgefüllt", dailyNext: "Nächste Auffüllung in {time}", dailyFull: "Dein Gratis-Hash ist voll",
    recommended: "Bestes Angebot", minutesHint: "Ca. {minutes} Min. Dolmetschen",
    purchasing: "Wird verarbeitet…", purchasePending: "Wartet auf Genehmigung", purchaseSuccess: "{coins} Hash hinzugefügt", purchaseFailed: "Der Kauf konnte nicht abgeschlossen werden",
    productsLoadError: "Angebote konnten nicht geladen werden", retry: "Erneut versuchen", updateRequired: "Aktualisiere die App, um Hash zu kaufen",
    webUnavailable: "Hash kann derzeit nur in der App gekauft werden", ttsCostNotice: "Sprachdolmetschen verbraucht Hash schneller. Die Spracherkennung kostet etwa {stt} Hash pro Minute, die Sprachausgabe zusätzlich etwa {tts} Hash pro Minute Audio.",
    restore: "Käufe wiederherstellen", viewUsage: "Nutzung ansehen", terms: "Gekaufte Hash verfallen nicht. Erstattungen richten sich nach den Store-Richtlinien.",
    exhaustedTitle: "Kein Hash mehr", exhaustedBody: "Lade Hash auf, um weiter zu übersetzen und zu dolmetschen.",
    exhaustedBanner: "Übersetzung und Dolmetschen pausiert: kein Hash", lowBanner: "Dein Hash geht zur Neige", charge: "Hash holen", close: "Schließen",
    usedCoins: "Verbrauchte Hash", rangeToday: "Heute", range7d: "7 Tage", range30d: "30 Tage",
    kindStt: "Spracherkennung", kindTranslation: "Übersetzung", kindTts: "Sprachdolmetschen", kindImageText: "Fotoübersetzung",
    history: "Verlauf", sourceDailyFree: "Gratis-Auffüllung", sourcePurchase: "Kauf", sourceAdmin: "Von HashChat", sourceBonus: "Bonus",
    sourceRefund: "Erstattung", sourceExpired: "Abgelaufen", conversationFallback: "Unterhaltung", noHistory: "Noch kein Verlauf", loadMore: "Mehr anzeigen",
    roomUsageTitle: "In diesem Chat verbrauchte Hash", roomUsed: "{coins} verbraucht",
  },
  es: {
    coin: "Hash", storeTitle: "Tienda de Hash", balanceLabel: "Tus Hash", freePaid: "Gratis {free} · Comprados {paid}",
    dailyTitle: "Cada día completamos tus Hash gratis hasta {cap}", dailyNext: "Próxima recarga en {time}", dailyFull: "Tus Hash gratis están completos",
    recommended: "Mejor oferta", minutesHint: "Unos {minutes} min de interpretación",
    purchasing: "Procesando…", purchasePending: "Esperando aprobación", purchaseSuccess: "Se añadieron {coins} Hash", purchaseFailed: "No se pudo completar la compra",
    productsLoadError: "No se pudieron cargar los productos", retry: "Reintentar", updateRequired: "Actualiza la app para conseguir Hash",
    webUnavailable: "Por ahora los Hash solo se compran en la app", ttsCostNotice: "La interpretación por voz gasta Hash más rápido. El reconocimiento de voz cuesta unos {stt} Hash por minuto y la reproducción de voz añade unos {tts} Hash por minuto de audio.",
    restore: "Restaurar compras", viewUsage: "Ver uso", terms: "Los Hash comprados no caducan. Los reembolsos siguen la política de la tienda.",
    exhaustedTitle: "Te quedaste sin Hash", exhaustedBody: "Añade Hash para seguir traduciendo e interpretando.",
    exhaustedBanner: "Traducción e interpretación en pausa: sin Hash", lowBanner: "Te quedan pocos Hash", charge: "Conseguir Hash", close: "Cerrar",
    usedCoins: "Hash usados", rangeToday: "Hoy", range7d: "7 días", range30d: "30 días",
    kindStt: "Reconocimiento de voz", kindTranslation: "Traducción", kindTts: "Interpretación por voz", kindImageText: "Traducción de fotos",
    history: "Historial", sourceDailyFree: "Recarga gratis", sourcePurchase: "Compra", sourceAdmin: "Regalo de HashChat", sourceBonus: "Bono",
    sourceRefund: "Reembolso", sourceExpired: "Caducado", conversationFallback: "Conversación", noHistory: "Aún no hay historial", loadMore: "Ver más",
    roomUsageTitle: "Hash usados en este chat", roomUsed: "{coins} usados",
  },
  pt: {
    coin: "Hash", storeTitle: "Loja de Hash", balanceLabel: "Seus Hash", freePaid: "Grátis {free} · Comprados {paid}",
    dailyTitle: "Seus Hash grátis são completados até {cap} todos os dias", dailyNext: "Próxima recarga em {time}", dailyFull: "Seus Hash grátis estão completos",
    recommended: "Melhor oferta", minutesHint: "Cerca de {minutes} min de interpretação",
    purchasing: "Processando…", purchasePending: "Aguardando aprovação", purchaseSuccess: "{coins} Hash adicionados", purchaseFailed: "Não foi possível concluir a compra",
    productsLoadError: "Não foi possível carregar os produtos", retry: "Tentar novamente", updateRequired: "Atualize o app para conseguir Hash",
    webUnavailable: "Por enquanto, os Hash só podem ser comprados no app", ttsCostNotice: "A interpretação por voz gasta Hash mais rápido. O reconhecimento de voz custa cerca de {stt} Hash por minuto e a reprodução de voz adiciona cerca de {tts} Hash por minuto de áudio.",
    restore: "Restaurar compras", viewUsage: "Ver uso", terms: "Hash comprados não expiram. Reembolsos seguem a política da loja.",
    exhaustedTitle: "Seus Hash acabaram", exhaustedBody: "Adicione Hash para continuar traduzindo e interpretando.",
    exhaustedBanner: "Tradução e interpretação pausadas: sem Hash", lowBanner: "Seus Hash estão acabando", charge: "Obter Hash", close: "Fechar",
    usedCoins: "Hash usados", rangeToday: "Hoje", range7d: "7 dias", range30d: "30 dias",
    kindStt: "Reconhecimento de voz", kindTranslation: "Tradução", kindTts: "Interpretação por voz", kindImageText: "Tradução de fotos",
    history: "Histórico", sourceDailyFree: "Recarga grátis", sourcePurchase: "Compra", sourceAdmin: "Presente do HashChat", sourceBonus: "Bônus",
    sourceRefund: "Reembolso", sourceExpired: "Expirado", conversationFallback: "Conversa", noHistory: "Ainda não há histórico", loadMore: "Ver mais",
    roomUsageTitle: "Hash usados nesta conversa", roomUsed: "{coins} usados",
  },
  it: {
    coin: "Hash", storeTitle: "Negozio Hash", balanceLabel: "I tuoi Hash", freePaid: "Gratis {free} · Acquistati {paid}",
    dailyTitle: "Ogni giorno gli Hash gratis vengono ricaricati fino a {cap}", dailyNext: "Prossima ricarica tra {time}", dailyFull: "I tuoi Hash gratis sono al massimo",
    recommended: "Più conveniente", minutesHint: "Circa {minutes} min di interpretariato",
    purchasing: "Elaborazione…", purchasePending: "In attesa di approvazione", purchaseSuccess: "{coins} Hash aggiunti", purchaseFailed: "Impossibile completare l'acquisto",
    productsLoadError: "Impossibile caricare i prodotti", retry: "Riprova", updateRequired: "Aggiorna l'app per ottenere Hash",
    webUnavailable: "Per ora gli Hash si acquistano solo nell'app", ttsCostNotice: "L'interpretariato vocale consuma Hash più in fretta. Il riconoscimento vocale costa circa {stt} Hash al minuto e la riproduzione vocale aggiunge circa {tts} Hash per minuto di audio.",
    restore: "Ripristina acquisti", viewUsage: "Vedi utilizzo", terms: "Gli Hash acquistati non scadono. I rimborsi seguono le regole dello store.",
    exhaustedTitle: "Hai finito gli Hash", exhaustedBody: "Aggiungi Hash per continuare a tradurre e interpretare.",
    exhaustedBanner: "Traduzione e interpretariato in pausa: Hash esauriti", lowBanner: "Gli Hash stanno per finire", charge: "Ottieni Hash", close: "Chiudi",
    usedCoins: "Hash usati", rangeToday: "Oggi", range7d: "7 giorni", range30d: "30 giorni",
    kindStt: "Riconoscimento vocale", kindTranslation: "Traduzione", kindTts: "Interpretariato vocale", kindImageText: "Traduzione foto",
    history: "Cronologia", sourceDailyFree: "Ricarica gratis", sourcePurchase: "Acquisto", sourceAdmin: "Regalo di HashChat", sourceBonus: "Bonus",
    sourceRefund: "Rimborso", sourceExpired: "Scaduto", conversationFallback: "Conversazione", noHistory: "Nessuna cronologia", loadMore: "Mostra altro",
    roomUsageTitle: "Hash usati in questa chat", roomUsed: "{coins} usati",
  },
  ru: {
    coin: "Хэш", storeTitle: "Магазин Хэш", balanceLabel: "Ваш Хэш", freePaid: "Бесплатно {free} · Куплено {paid}",
    dailyTitle: "Каждый день бесплатный Хэш пополняется до {cap}", dailyNext: "Следующее пополнение через {time}", dailyFull: "Бесплатный Хэш заполнен",
    recommended: "Выгодно", minutesHint: "Около {minutes} мин перевода речи",
    purchasing: "Обработка…", purchasePending: "Ожидает одобрения", purchaseSuccess: "Добавлено Хэш: {coins}", purchaseFailed: "Не удалось завершить покупку",
    productsLoadError: "Не удалось загрузить товары", retry: "Повторить", updateRequired: "Обновите приложение, чтобы пополнять Хэш",
    webUnavailable: "Пока Хэш можно купить только в приложении", ttsCostNotice: "С голосовым переводом Хэш расходуется быстрее. Распознавание речи стоит около {stt} Хэш в минуту, а озвучивание добавляет около {tts} Хэш за минуту аудио.",
    restore: "Восстановить покупки", viewUsage: "Посмотреть расход", terms: "Купленный Хэш не сгорает. Возвраты выполняются по правилам магазина.",
    exhaustedTitle: "Хэш закончился", exhaustedBody: "Пополните Хэш, чтобы продолжить перевод.",
    exhaustedBanner: "Перевод приостановлен: Хэш закончился", lowBanner: "Хэш заканчивается", charge: "Пополнить", close: "Закрыть",
    usedCoins: "Потрачено Хэш", rangeToday: "Сегодня", range7d: "7 дней", range30d: "30 дней",
    kindStt: "Распознавание речи", kindTranslation: "Перевод", kindTts: "Голосовой перевод", kindImageText: "Перевод фото",
    history: "История", sourceDailyFree: "Бесплатное пополнение", sourcePurchase: "Покупка", sourceAdmin: "Подарок от HashChat", sourceBonus: "Бонус",
    sourceRefund: "Возврат", sourceExpired: "Истекло", conversationFallback: "Разговор", noHistory: "Истории пока нет", loadMore: "Показать ещё",
    roomUsageTitle: "Хэш, потраченный в этом чате", roomUsed: "Потрачено {coins}",
  },
  ar: {
    coin: "هاش", storeTitle: "متجر هاش", balanceLabel: "رصيدك من هاش", freePaid: "مجاني {free} · مشترى {paid}",
    dailyTitle: "نكمل رصيدك المجاني من هاش حتى {cap} كل يوم", dailyNext: "التعبئة التالية بعد {time}", dailyFull: "رصيدك المجاني من هاش ممتلئ",
    recommended: "الأفضل قيمة", minutesHint: "حوالي {minutes} دقيقة من الترجمة الفورية",
    purchasing: "جارٍ المعالجة…", purchasePending: "بانتظار الموافقة", purchaseSuccess: "تمت إضافة {coins} هاش", purchaseFailed: "تعذر إكمال الشراء",
    productsLoadError: "تعذر تحميل المنتجات", retry: "إعادة المحاولة", updateRequired: "حدّث التطبيق لشراء هاش",
    webUnavailable: "حاليًا يمكن شراء هاش من داخل التطبيق فقط", ttsCostNotice: "الترجمة الصوتية تستهلك هاش بسرعة أكبر. التعرف على الكلام يكلف نحو {stt} هاش في الدقيقة، وتشغيل الصوت يضيف نحو {tts} هاش لكل دقيقة صوت.",
    restore: "استعادة المشتريات", viewUsage: "عرض الاستخدام", terms: "رصيد هاش المشترى لا تنتهي صلاحيته. الاسترداد يتبع سياسة المتجر.",
    exhaustedTitle: "نفد رصيدك من هاش", exhaustedBody: "أضف هاش لمتابعة الترجمة والترجمة الفورية.",
    exhaustedBanner: "توقفت الترجمة والترجمة الفورية: لا يوجد هاش", lowBanner: "رصيدك من هاش على وشك النفاد", charge: "احصل على هاش", close: "إغلاق",
    usedCoins: "هاش المستخدم", rangeToday: "اليوم", range7d: "7 أيام", range30d: "30 يومًا",
    kindStt: "التعرف على الكلام", kindTranslation: "الترجمة", kindTts: "الترجمة الصوتية", kindImageText: "ترجمة الصور",
    history: "السجل", sourceDailyFree: "تعبئة مجانية", sourcePurchase: "شراء", sourceAdmin: "هدية من HashChat", sourceBonus: "مكافأة",
    sourceRefund: "استرداد", sourceExpired: "منتهية", conversationFallback: "محادثة", noHistory: "لا يوجد سجل بعد", loadMore: "عرض المزيد",
    roomUsageTitle: "هاش المستخدم في هذه المحادثة", roomUsed: "استخدم {coins}",
  },
  hi: {
    coin: "हैश", storeTitle: "हैश स्टोर", balanceLabel: "आपके हैश", freePaid: "मुफ़्त {free} · खरीदे गए {paid}",
    dailyTitle: "हर दिन मुफ़्त हैश {cap} तक भर दिए जाते हैं", dailyNext: "अगला रीफ़िल {time} में", dailyFull: "आपके मुफ़्त हैश पूरे हैं",
    recommended: "सबसे किफ़ायती", minutesHint: "लगभग {minutes} मिनट इंटरप्रेटिंग",
    purchasing: "प्रोसेस हो रहा है…", purchasePending: "मंज़ूरी की प्रतीक्षा", purchaseSuccess: "{coins} हैश जोड़े गए", purchaseFailed: "खरीदारी पूरी नहीं हो सकी",
    productsLoadError: "प्रोडक्ट लोड नहीं हो सके", retry: "फिर से कोशिश करें", updateRequired: "हैश पाने के लिए ऐप अपडेट करें",
    webUnavailable: "अभी हैश केवल ऐप में खरीदे जा सकते हैं", ttsCostNotice: "वॉइस इंटरप्रेटिंग चालू करने पर हैश तेज़ी से खर्च होते हैं। वाक् पहचान में प्रति मिनट लगभग {stt} हैश लगते हैं और आवाज़ चलाने पर प्रति मिनट ऑडियो लगभग {tts} हैश और लगते हैं।",
    restore: "खरीदारी बहाल करें", viewUsage: "उपयोग देखें", terms: "खरीदे गए हैश कभी समाप्त नहीं होते। रिफ़ंड स्टोर की नीति के अनुसार होते हैं।",
    exhaustedTitle: "आपके हैश खत्म हो गए", exhaustedBody: "अनुवाद और इंटरप्रेटिंग जारी रखने के लिए हैश जोड़ें।",
    exhaustedBanner: "हैश न होने से अनुवाद और इंटरप्रेटिंग रुक गई है", lowBanner: "आपके हैश कम बचे हैं", charge: "हैश पाएं", close: "बंद करें",
    usedCoins: "इस्तेमाल किए गए हैश", rangeToday: "आज", range7d: "7 दिन", range30d: "30 दिन",
    kindStt: "वाक् पहचान", kindTranslation: "अनुवाद", kindTts: "वॉइस इंटरप्रेटिंग", kindImageText: "फ़ोटो अनुवाद",
    history: "इतिहास", sourceDailyFree: "मुफ़्त रीफ़िल", sourcePurchase: "खरीदारी", sourceAdmin: "HashChat की ओर से", sourceBonus: "बोनस",
    sourceRefund: "रिफ़ंड", sourceExpired: "समाप्त", conversationFallback: "बातचीत", noHistory: "अभी कोई इतिहास नहीं", loadMore: "और देखें",
    roomUsageTitle: "इस चैट में इस्तेमाल हुए हैश", roomUsed: "{coins} इस्तेमाल",
  },
  th: {
    coin: "แฮช", storeTitle: "ร้านแฮช", balanceLabel: "แฮชของคุณ", freePaid: "ฟรี {free} · ซื้อ {paid}",
    dailyTitle: "เติมแฮชฟรีให้ถึง {cap} ทุกวัน", dailyNext: "เติมครั้งถัดไปในอีก {time}", dailyFull: "แฮชฟรีของคุณเต็มแล้ว",
    recommended: "คุ้มที่สุด", minutesHint: "ล่ามได้ประมาณ {minutes} นาที",
    purchasing: "กำลังดำเนินการ…", purchasePending: "รอการอนุมัติ", purchaseSuccess: "เติม {coins} แฮชแล้ว", purchaseFailed: "ทำรายการซื้อไม่สำเร็จ",
    productsLoadError: "โหลดสินค้าไม่สำเร็จ", retry: "ลองอีกครั้ง", updateRequired: "อัปเดตแอปเพื่อเติมแฮช",
    webUnavailable: "ตอนนี้ซื้อแฮชได้ในแอปเท่านั้น", ttsCostNotice: "เมื่อเปิดล่ามเสียง แฮชจะหมดเร็วขึ้น การรู้จำเสียงพูดใช้ประมาณ {stt} แฮชต่อนาที และการเล่นเสียงใช้เพิ่มประมาณ {tts} แฮชต่อเสียง 1 นาที",
    restore: "กู้คืนการซื้อ", viewUsage: "ดูการใช้งาน", terms: "แฮชที่ซื้อไม่มีวันหมดอายุ การคืนเงินเป็นไปตามนโยบายของสโตร์",
    exhaustedTitle: "แฮชหมดแล้ว", exhaustedBody: "เติมแฮชเพื่อแปลและล่ามต่อ",
    exhaustedBanner: "การแปลและล่ามหยุดชั่วคราวเพราะแฮชหมด", lowBanner: "แฮชใกล้หมดแล้ว", charge: "เติมแฮช", close: "ปิด",
    usedCoins: "แฮชที่ใช้ไป", rangeToday: "วันนี้", range7d: "7 วัน", range30d: "30 วัน",
    kindStt: "การรู้จำเสียงพูด", kindTranslation: "การแปล", kindTts: "ล่ามเสียง", kindImageText: "แปลรูปภาพ",
    history: "ประวัติ", sourceDailyFree: "เติมฟรี", sourcePurchase: "ซื้อ", sourceAdmin: "จาก HashChat", sourceBonus: "โบนัส",
    sourceRefund: "คืนเงิน", sourceExpired: "หมดอายุ", conversationFallback: "การสนทนา", noHistory: "ยังไม่มีประวัติ", loadMore: "ดูเพิ่มเติม",
    roomUsageTitle: "แฮชที่ใช้ในแชทนี้", roomUsed: "ใช้ไป {coins}",
  },
  vi: {
    coin: "Hash", storeTitle: "Cửa hàng Hash", balanceLabel: "Hash của bạn", freePaid: "Miễn phí {free} · Đã mua {paid}",
    dailyTitle: "Mỗi ngày Hash miễn phí được nạp đầy đến {cap}", dailyNext: "Lần nạp tiếp theo sau {time}", dailyFull: "Hash miễn phí của bạn đã đầy",
    recommended: "Tiết kiệm nhất", minutesHint: "Khoảng {minutes} phút phiên dịch",
    purchasing: "Đang xử lý…", purchasePending: "Đang chờ phê duyệt", purchaseSuccess: "Đã nạp {coins} Hash", purchaseFailed: "Không thể hoàn tất giao dịch",
    productsLoadError: "Không tải được sản phẩm", retry: "Thử lại", updateRequired: "Cập nhật ứng dụng để nạp Hash",
    webUnavailable: "Hiện chỉ có thể mua Hash trong ứng dụng", ttsCostNotice: "Bật phiên dịch giọng nói sẽ tốn Hash nhanh hơn. Nhận dạng giọng nói tốn khoảng {stt} Hash mỗi phút, và phát giọng nói tốn thêm khoảng {tts} Hash cho mỗi phút âm thanh.",
    restore: "Khôi phục giao dịch mua", viewUsage: "Xem mức sử dụng", terms: "Hash đã mua không hết hạn. Hoàn tiền theo chính sách của cửa hàng ứng dụng.",
    exhaustedTitle: "Bạn đã hết Hash", exhaustedBody: "Nạp Hash để tiếp tục dịch và phiên dịch.",
    exhaustedBanner: "Dịch và phiên dịch đã tạm dừng vì hết Hash", lowBanner: "Bạn sắp hết Hash", charge: "Nạp Hash", close: "Đóng",
    usedCoins: "Hash đã dùng", rangeToday: "Hôm nay", range7d: "7 ngày", range30d: "30 ngày",
    kindStt: "Nhận dạng giọng nói", kindTranslation: "Dịch", kindTts: "Phiên dịch giọng nói", kindImageText: "Dịch ảnh",
    history: "Lịch sử", sourceDailyFree: "Nạp miễn phí", sourcePurchase: "Mua", sourceAdmin: "HashChat tặng", sourceBonus: "Thưởng",
    sourceRefund: "Hoàn tiền", sourceExpired: "Hết hạn", conversationFallback: "Cuộc trò chuyện", noHistory: "Chưa có lịch sử", loadMore: "Xem thêm",
    roomUsageTitle: "Hash đã dùng trong cuộc trò chuyện này", roomUsed: "Đã dùng {coins}",
  },
};

export function getCoinCopy(locale: AppLocale): CoinCopy {
  return COIN_COPY[resolvePrimaryUiLocale(locale)];
}

export function fillCoinCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
