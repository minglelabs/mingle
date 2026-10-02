import { type AppLocale } from "@/i18n/config";
import { resolvePrimaryUiLocale, type PrimaryUiLocale } from "@/i18n/mingle-locales";

// Copy for coins: balance chip, store, "out of coins" sheet, banners and the
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
};

const COIN_COPY: Record<PrimaryUiLocale, CoinCopy> = {
  ko: {
    coin: "코인", storeTitle: "상점", balanceLabel: "보유 코인", freePaid: "무료 {free} · 충전 {paid}",
    dailyTitle: "매일 무료 코인을 {cap}까지 채워 드려요", dailyNext: "다음 충전까지 {time}", dailyFull: "무료 코인이 가득 차 있어요",
    recommended: "추천", minutesHint: "통역 약 {minutes}분",
    purchasing: "결제 중…", purchasePending: "승인 대기 중", purchaseSuccess: "{coins} 코인이 충전됐어요", purchaseFailed: "결제를 완료하지 못했어요",
    productsLoadError: "상품을 불러오지 못했어요", retry: "다시 시도", updateRequired: "앱을 업데이트하면 충전할 수 있어요",
    webUnavailable: "지금은 앱에서만 충전할 수 있어요", ttsCostNotice: "음성 통역을 켜면 코인이 더 빨리 줄어요. 음성 인식은 분당 약 {stt}코인, 음성 재생은 1분당 약 {tts}코인이 추가로 들어요.",
    restore: "구매 복원", viewUsage: "사용 내역 보기", terms: "구매한 코인은 만료되지 않으며, 환불은 스토어 정책을 따릅니다.",
    exhaustedTitle: "코인을 다 썼어요", exhaustedBody: "번역과 통역을 계속하려면 코인을 충전해 주세요.",
    exhaustedBanner: "코인이 없어 번역과 통역이 멈췄어요", lowBanner: "코인이 얼마 남지 않았어요", charge: "충전하기", close: "닫기",
    usedCoins: "사용한 코인", rangeToday: "오늘", range7d: "7일", range30d: "30일",
    kindStt: "음성 인식", kindTranslation: "번역", kindTts: "음성 통역", kindImageText: "사진 번역",
    history: "내역", sourceDailyFree: "무료 충전", sourcePurchase: "구매", sourceAdmin: "운영자 지급", sourceBonus: "보너스",
    sourceRefund: "환불", sourceExpired: "만료", conversationFallback: "대화", noHistory: "아직 내역이 없어요", loadMore: "더 보기",
  },
  en: {
    coin: "Coins", storeTitle: "Store", balanceLabel: "Your coins", freePaid: "Free {free} · Purchased {paid}",
    dailyTitle: "Free coins are topped up to {cap} every day", dailyNext: "Next top-up in {time}", dailyFull: "Your free coins are full",
    recommended: "Best value", minutesHint: "About {minutes} min of interpreting",
    purchasing: "Processing…", purchasePending: "Waiting for approval", purchaseSuccess: "{coins} coins added", purchaseFailed: "The purchase could not be completed",
    productsLoadError: "Could not load the products", retry: "Try again", updateRequired: "Update the app to buy coins",
    webUnavailable: "Coins can only be bought in the app for now", ttsCostNotice: "Voice interpreting uses coins faster. Speech recognition costs about {stt} coins per minute, and spoken playback adds about {tts} coins per minute of audio.",
    restore: "Restore purchases", viewUsage: "View usage", terms: "Purchased coins never expire. Refunds follow the store's policy.",
    exhaustedTitle: "You're out of coins", exhaustedBody: "Add coins to keep translating and interpreting.",
    exhaustedBanner: "Translation and interpreting are paused: no coins left", lowBanner: "You're running low on coins", charge: "Get coins", close: "Close",
    usedCoins: "Coins used", rangeToday: "Today", range7d: "7 days", range30d: "30 days",
    kindStt: "Speech recognition", kindTranslation: "Translation", kindTts: "Voice interpreting", kindImageText: "Photo translation",
    history: "History", sourceDailyFree: "Free top-up", sourcePurchase: "Purchase", sourceAdmin: "From Mingle", sourceBonus: "Bonus",
    sourceRefund: "Refund", sourceExpired: "Expired", conversationFallback: "Conversation", noHistory: "No history yet", loadMore: "Show more",
  },
  ja: {
    coin: "コイン", storeTitle: "ストア", balanceLabel: "保有コイン", freePaid: "無料 {free} · 購入 {paid}",
    dailyTitle: "無料コインを毎日 {cap} まで補充します", dailyNext: "次の補充まで {time}", dailyFull: "無料コインは満タンです",
    recommended: "おすすめ", minutesHint: "通訳 約{minutes}分",
    purchasing: "処理中…", purchasePending: "承認待ち", purchaseSuccess: "{coins} コインをチャージしました", purchaseFailed: "購入を完了できませんでした",
    productsLoadError: "商品を読み込めませんでした", retry: "再試行", updateRequired: "アプリを更新するとチャージできます",
    webUnavailable: "現在はアプリでのみチャージできます", ttsCostNotice: "音声通訳をオンにするとコインの消費が速くなります。音声認識は1分あたり約{stt}コイン、音声再生は1分あたり約{tts}コインが追加でかかります。",
    restore: "購入を復元", viewUsage: "利用履歴を見る", terms: "購入したコインに有効期限はありません。返金はストアのポリシーに従います。",
    exhaustedTitle: "コインがなくなりました", exhaustedBody: "翻訳と通訳を続けるにはコインをチャージしてください。",
    exhaustedBanner: "コインがないため翻訳と通訳が停止しました", lowBanner: "コインが残りわずかです", charge: "チャージする", close: "閉じる",
    usedCoins: "使用したコイン", rangeToday: "今日", range7d: "7日間", range30d: "30日間",
    kindStt: "音声認識", kindTranslation: "翻訳", kindTts: "音声通訳", kindImageText: "写真翻訳",
    history: "履歴", sourceDailyFree: "無料チャージ", sourcePurchase: "購入", sourceAdmin: "運営からの付与", sourceBonus: "ボーナス",
    sourceRefund: "返金", sourceExpired: "期限切れ", conversationFallback: "会話", noHistory: "履歴はまだありません", loadMore: "もっと見る",
  },
  "zh-CN": {
    coin: "金币", storeTitle: "商店", balanceLabel: "持有金币", freePaid: "免费 {free} · 充值 {paid}",
    dailyTitle: "每天将免费金币补满至 {cap}", dailyNext: "距离下次补充 {time}", dailyFull: "免费金币已满",
    recommended: "推荐", minutesHint: "约可口译 {minutes} 分钟",
    purchasing: "处理中…", purchasePending: "等待批准", purchaseSuccess: "已充值 {coins} 金币", purchaseFailed: "未能完成购买",
    productsLoadError: "无法加载商品", retry: "重试", updateRequired: "更新应用后即可充值",
    webUnavailable: "目前只能在应用内充值", ttsCostNotice: "开启语音口译后金币消耗更快。语音识别每分钟约 {stt} 金币，语音播放每分钟另需约 {tts} 金币。",
    restore: "恢复购买", viewUsage: "查看使用记录", terms: "购买的金币不会过期，退款遵循应用商店政策。",
    exhaustedTitle: "金币已用完", exhaustedBody: "请充值金币以继续使用翻译和口译。",
    exhaustedBanner: "金币不足，翻译和口译已暂停", lowBanner: "金币即将用完", charge: "去充值", close: "关闭",
    usedCoins: "已用金币", rangeToday: "今天", range7d: "7天", range30d: "30天",
    kindStt: "语音识别", kindTranslation: "翻译", kindTts: "语音口译", kindImageText: "图片翻译",
    history: "记录", sourceDailyFree: "免费补充", sourcePurchase: "购买", sourceAdmin: "官方赠送", sourceBonus: "奖励",
    sourceRefund: "退款", sourceExpired: "已过期", conversationFallback: "对话", noHistory: "暂无记录", loadMore: "查看更多",
  },
  "zh-TW": {
    coin: "金幣", storeTitle: "商店", balanceLabel: "持有金幣", freePaid: "免費 {free} · 儲值 {paid}",
    dailyTitle: "每天將免費金幣補滿至 {cap}", dailyNext: "距離下次補充 {time}", dailyFull: "免費金幣已滿",
    recommended: "推薦", minutesHint: "約可口譯 {minutes} 分鐘",
    purchasing: "處理中…", purchasePending: "等待核准", purchaseSuccess: "已儲值 {coins} 金幣", purchaseFailed: "無法完成購買",
    productsLoadError: "無法載入商品", retry: "重試", updateRequired: "更新 App 後即可儲值",
    webUnavailable: "目前只能在 App 內儲值", ttsCostNotice: "開啟語音口譯後金幣消耗更快。語音辨識每分鐘約 {stt} 金幣，語音播放每分鐘另需約 {tts} 金幣。",
    restore: "回復購買", viewUsage: "查看使用紀錄", terms: "購買的金幣不會過期，退款依商店政策辦理。",
    exhaustedTitle: "金幣已用完", exhaustedBody: "請儲值金幣以繼續使用翻譯和口譯。",
    exhaustedBanner: "金幣不足，翻譯和口譯已暫停", lowBanner: "金幣即將用完", charge: "前往儲值", close: "關閉",
    usedCoins: "已用金幣", rangeToday: "今天", range7d: "7天", range30d: "30天",
    kindStt: "語音辨識", kindTranslation: "翻譯", kindTts: "語音口譯", kindImageText: "圖片翻譯",
    history: "紀錄", sourceDailyFree: "免費補充", sourcePurchase: "購買", sourceAdmin: "官方贈送", sourceBonus: "獎勵",
    sourceRefund: "退款", sourceExpired: "已過期", conversationFallback: "對話", noHistory: "尚無紀錄", loadMore: "查看更多",
  },
  fr: {
    coin: "Pièces", storeTitle: "Boutique", balanceLabel: "Vos pièces", freePaid: "Gratuites {free} · Achetées {paid}",
    dailyTitle: "Vos pièces gratuites sont complétées jusqu'à {cap} chaque jour", dailyNext: "Prochaine recharge dans {time}", dailyFull: "Vos pièces gratuites sont au maximum",
    recommended: "Meilleure offre", minutesHint: "Environ {minutes} min d'interprétation",
    purchasing: "Traitement…", purchasePending: "En attente d'approbation", purchaseSuccess: "{coins} pièces ajoutées", purchaseFailed: "L'achat n'a pas pu être finalisé",
    productsLoadError: "Impossible de charger les offres", retry: "Réessayer", updateRequired: "Mettez l'app à jour pour acheter des pièces",
    webUnavailable: "Pour l'instant, les pièces s'achètent uniquement dans l'app", ttsCostNotice: "L'interprétation vocale consomme les pièces plus vite. La reconnaissance vocale coûte environ {stt} pièces par minute, et la lecture audio ajoute environ {tts} pièces par minute.",
    restore: "Restaurer les achats", viewUsage: "Voir l'utilisation", terms: "Les pièces achetées n'expirent pas. Les remboursements suivent la politique de la boutique.",
    exhaustedTitle: "Vous n'avez plus de pièces", exhaustedBody: "Ajoutez des pièces pour continuer à traduire et interpréter.",
    exhaustedBanner: "Traduction et interprétation en pause : plus de pièces", lowBanner: "Il vous reste peu de pièces", charge: "Obtenir des pièces", close: "Fermer",
    usedCoins: "Pièces utilisées", rangeToday: "Aujourd'hui", range7d: "7 jours", range30d: "30 jours",
    kindStt: "Reconnaissance vocale", kindTranslation: "Traduction", kindTts: "Interprétation vocale", kindImageText: "Traduction de photos",
    history: "Historique", sourceDailyFree: "Recharge gratuite", sourcePurchase: "Achat", sourceAdmin: "Offert par Mingle", sourceBonus: "Bonus",
    sourceRefund: "Remboursement", sourceExpired: "Expiré", conversationFallback: "Conversation", noHistory: "Aucun historique", loadMore: "Voir plus",
  },
  de: {
    coin: "Münzen", storeTitle: "Shop", balanceLabel: "Deine Münzen", freePaid: "Gratis {free} · Gekauft {paid}",
    dailyTitle: "Gratis-Münzen werden täglich auf {cap} aufgefüllt", dailyNext: "Nächste Auffüllung in {time}", dailyFull: "Deine Gratis-Münzen sind voll",
    recommended: "Bestes Angebot", minutesHint: "Ca. {minutes} Min. Dolmetschen",
    purchasing: "Wird verarbeitet…", purchasePending: "Wartet auf Genehmigung", purchaseSuccess: "{coins} Münzen hinzugefügt", purchaseFailed: "Der Kauf konnte nicht abgeschlossen werden",
    productsLoadError: "Angebote konnten nicht geladen werden", retry: "Erneut versuchen", updateRequired: "Aktualisiere die App, um Münzen zu kaufen",
    webUnavailable: "Münzen können derzeit nur in der App gekauft werden", ttsCostNotice: "Sprachdolmetschen verbraucht Münzen schneller. Die Spracherkennung kostet etwa {stt} Münzen pro Minute, die Sprachausgabe zusätzlich etwa {tts} Münzen pro Minute Audio.",
    restore: "Käufe wiederherstellen", viewUsage: "Nutzung ansehen", terms: "Gekaufte Münzen verfallen nicht. Erstattungen richten sich nach den Store-Richtlinien.",
    exhaustedTitle: "Keine Münzen mehr", exhaustedBody: "Lade Münzen auf, um weiter zu übersetzen und zu dolmetschen.",
    exhaustedBanner: "Übersetzung und Dolmetschen pausiert: keine Münzen", lowBanner: "Deine Münzen gehen zur Neige", charge: "Münzen holen", close: "Schließen",
    usedCoins: "Verbrauchte Münzen", rangeToday: "Heute", range7d: "7 Tage", range30d: "30 Tage",
    kindStt: "Spracherkennung", kindTranslation: "Übersetzung", kindTts: "Sprachdolmetschen", kindImageText: "Fotoübersetzung",
    history: "Verlauf", sourceDailyFree: "Gratis-Auffüllung", sourcePurchase: "Kauf", sourceAdmin: "Von Mingle", sourceBonus: "Bonus",
    sourceRefund: "Erstattung", sourceExpired: "Abgelaufen", conversationFallback: "Unterhaltung", noHistory: "Noch kein Verlauf", loadMore: "Mehr anzeigen",
  },
  es: {
    coin: "Monedas", storeTitle: "Tienda", balanceLabel: "Tus monedas", freePaid: "Gratis {free} · Compradas {paid}",
    dailyTitle: "Cada día completamos tus monedas gratis hasta {cap}", dailyNext: "Próxima recarga en {time}", dailyFull: "Tus monedas gratis están completas",
    recommended: "Mejor oferta", minutesHint: "Unos {minutes} min de interpretación",
    purchasing: "Procesando…", purchasePending: "Esperando aprobación", purchaseSuccess: "Se añadieron {coins} monedas", purchaseFailed: "No se pudo completar la compra",
    productsLoadError: "No se pudieron cargar los productos", retry: "Reintentar", updateRequired: "Actualiza la app para comprar monedas",
    webUnavailable: "Por ahora las monedas solo se compran en la app", ttsCostNotice: "La interpretación por voz gasta monedas más rápido. El reconocimiento de voz cuesta unas {stt} monedas por minuto y la reproducción de voz añade unas {tts} monedas por minuto de audio.",
    restore: "Restaurar compras", viewUsage: "Ver uso", terms: "Las monedas compradas no caducan. Los reembolsos siguen la política de la tienda.",
    exhaustedTitle: "Te quedaste sin monedas", exhaustedBody: "Añade monedas para seguir traduciendo e interpretando.",
    exhaustedBanner: "Traducción e interpretación en pausa: sin monedas", lowBanner: "Te quedan pocas monedas", charge: "Conseguir monedas", close: "Cerrar",
    usedCoins: "Monedas usadas", rangeToday: "Hoy", range7d: "7 días", range30d: "30 días",
    kindStt: "Reconocimiento de voz", kindTranslation: "Traducción", kindTts: "Interpretación por voz", kindImageText: "Traducción de fotos",
    history: "Historial", sourceDailyFree: "Recarga gratis", sourcePurchase: "Compra", sourceAdmin: "Regalo de Mingle", sourceBonus: "Bono",
    sourceRefund: "Reembolso", sourceExpired: "Caducado", conversationFallback: "Conversación", noHistory: "Aún no hay historial", loadMore: "Ver más",
  },
  pt: {
    coin: "Moedas", storeTitle: "Loja", balanceLabel: "Suas moedas", freePaid: "Grátis {free} · Compradas {paid}",
    dailyTitle: "Suas moedas grátis são completadas até {cap} todos os dias", dailyNext: "Próxima recarga em {time}", dailyFull: "Suas moedas grátis estão completas",
    recommended: "Melhor oferta", minutesHint: "Cerca de {minutes} min de interpretação",
    purchasing: "Processando…", purchasePending: "Aguardando aprovação", purchaseSuccess: "{coins} moedas adicionadas", purchaseFailed: "Não foi possível concluir a compra",
    productsLoadError: "Não foi possível carregar os produtos", retry: "Tentar novamente", updateRequired: "Atualize o app para comprar moedas",
    webUnavailable: "Por enquanto, as moedas só podem ser compradas no app", ttsCostNotice: "A interpretação por voz gasta moedas mais rápido. O reconhecimento de voz custa cerca de {stt} moedas por minuto e a reprodução de voz adiciona cerca de {tts} moedas por minuto de áudio.",
    restore: "Restaurar compras", viewUsage: "Ver uso", terms: "Moedas compradas não expiram. Reembolsos seguem a política da loja.",
    exhaustedTitle: "Suas moedas acabaram", exhaustedBody: "Adicione moedas para continuar traduzindo e interpretando.",
    exhaustedBanner: "Tradução e interpretação pausadas: sem moedas", lowBanner: "Suas moedas estão acabando", charge: "Obter moedas", close: "Fechar",
    usedCoins: "Moedas usadas", rangeToday: "Hoje", range7d: "7 dias", range30d: "30 dias",
    kindStt: "Reconhecimento de voz", kindTranslation: "Tradução", kindTts: "Interpretação por voz", kindImageText: "Tradução de fotos",
    history: "Histórico", sourceDailyFree: "Recarga grátis", sourcePurchase: "Compra", sourceAdmin: "Presente do Mingle", sourceBonus: "Bônus",
    sourceRefund: "Reembolso", sourceExpired: "Expirado", conversationFallback: "Conversa", noHistory: "Ainda não há histórico", loadMore: "Ver mais",
  },
  it: {
    coin: "Monete", storeTitle: "Negozio", balanceLabel: "Le tue monete", freePaid: "Gratis {free} · Acquistate {paid}",
    dailyTitle: "Ogni giorno le monete gratis vengono ricaricate fino a {cap}", dailyNext: "Prossima ricarica tra {time}", dailyFull: "Le tue monete gratis sono al massimo",
    recommended: "Più conveniente", minutesHint: "Circa {minutes} min di interpretariato",
    purchasing: "Elaborazione…", purchasePending: "In attesa di approvazione", purchaseSuccess: "{coins} monete aggiunte", purchaseFailed: "Impossibile completare l'acquisto",
    productsLoadError: "Impossibile caricare i prodotti", retry: "Riprova", updateRequired: "Aggiorna l'app per acquistare monete",
    webUnavailable: "Per ora le monete si acquistano solo nell'app", ttsCostNotice: "L'interpretariato vocale consuma monete più in fretta. Il riconoscimento vocale costa circa {stt} monete al minuto e la riproduzione vocale aggiunge circa {tts} monete per minuto di audio.",
    restore: "Ripristina acquisti", viewUsage: "Vedi utilizzo", terms: "Le monete acquistate non scadono. I rimborsi seguono le regole dello store.",
    exhaustedTitle: "Hai finito le monete", exhaustedBody: "Aggiungi monete per continuare a tradurre e interpretare.",
    exhaustedBanner: "Traduzione e interpretariato in pausa: monete esaurite", lowBanner: "Le monete stanno per finire", charge: "Ottieni monete", close: "Chiudi",
    usedCoins: "Monete usate", rangeToday: "Oggi", range7d: "7 giorni", range30d: "30 giorni",
    kindStt: "Riconoscimento vocale", kindTranslation: "Traduzione", kindTts: "Interpretariato vocale", kindImageText: "Traduzione foto",
    history: "Cronologia", sourceDailyFree: "Ricarica gratis", sourcePurchase: "Acquisto", sourceAdmin: "Regalo di Mingle", sourceBonus: "Bonus",
    sourceRefund: "Rimborso", sourceExpired: "Scaduto", conversationFallback: "Conversazione", noHistory: "Nessuna cronologia", loadMore: "Mostra altro",
  },
  ru: {
    coin: "Монеты", storeTitle: "Магазин", balanceLabel: "Ваши монеты", freePaid: "Бесплатные {free} · Купленные {paid}",
    dailyTitle: "Каждый день бесплатные монеты пополняются до {cap}", dailyNext: "Следующее пополнение через {time}", dailyFull: "Бесплатные монеты заполнены",
    recommended: "Выгодно", minutesHint: "Около {minutes} мин перевода речи",
    purchasing: "Обработка…", purchasePending: "Ожидает одобрения", purchaseSuccess: "Добавлено монет: {coins}", purchaseFailed: "Не удалось завершить покупку",
    productsLoadError: "Не удалось загрузить товары", retry: "Повторить", updateRequired: "Обновите приложение, чтобы покупать монеты",
    webUnavailable: "Пока монеты можно купить только в приложении", ttsCostNotice: "С голосовым переводом монеты тратятся быстрее. Распознавание речи стоит около {stt} монет в минуту, а озвучивание добавляет около {tts} монет за минуту аудио.",
    restore: "Восстановить покупки", viewUsage: "Посмотреть расход", terms: "Купленные монеты не сгорают. Возвраты выполняются по правилам магазина.",
    exhaustedTitle: "Монеты закончились", exhaustedBody: "Пополните монеты, чтобы продолжить перевод.",
    exhaustedBanner: "Перевод приостановлен: нет монет", lowBanner: "Монеты заканчиваются", charge: "Пополнить", close: "Закрыть",
    usedCoins: "Потрачено монет", rangeToday: "Сегодня", range7d: "7 дней", range30d: "30 дней",
    kindStt: "Распознавание речи", kindTranslation: "Перевод", kindTts: "Голосовой перевод", kindImageText: "Перевод фото",
    history: "История", sourceDailyFree: "Бесплатное пополнение", sourcePurchase: "Покупка", sourceAdmin: "Подарок от Mingle", sourceBonus: "Бонус",
    sourceRefund: "Возврат", sourceExpired: "Истекло", conversationFallback: "Разговор", noHistory: "Истории пока нет", loadMore: "Показать ещё",
  },
  ar: {
    coin: "العملات", storeTitle: "المتجر", balanceLabel: "عملاتك", freePaid: "مجانية {free} · مشتراة {paid}",
    dailyTitle: "نكمل عملاتك المجانية حتى {cap} كل يوم", dailyNext: "التعبئة التالية بعد {time}", dailyFull: "عملاتك المجانية ممتلئة",
    recommended: "الأفضل قيمة", minutesHint: "حوالي {minutes} دقيقة من الترجمة الفورية",
    purchasing: "جارٍ المعالجة…", purchasePending: "بانتظار الموافقة", purchaseSuccess: "تمت إضافة {coins} عملة", purchaseFailed: "تعذر إكمال الشراء",
    productsLoadError: "تعذر تحميل المنتجات", retry: "إعادة المحاولة", updateRequired: "حدّث التطبيق لشراء العملات",
    webUnavailable: "حاليًا يمكن شراء العملات من داخل التطبيق فقط", ttsCostNotice: "الترجمة الصوتية تستهلك العملات بسرعة أكبر. التعرف على الكلام يكلف نحو {stt} عملة في الدقيقة، وتشغيل الصوت يضيف نحو {tts} عملة لكل دقيقة صوت.",
    restore: "استعادة المشتريات", viewUsage: "عرض الاستخدام", terms: "العملات المشتراة لا تنتهي صلاحيتها. الاسترداد يتبع سياسة المتجر.",
    exhaustedTitle: "نفدت عملاتك", exhaustedBody: "أضف عملات لمتابعة الترجمة والترجمة الفورية.",
    exhaustedBanner: "توقفت الترجمة والترجمة الفورية: لا توجد عملات", lowBanner: "عملاتك على وشك النفاد", charge: "احصل على عملات", close: "إغلاق",
    usedCoins: "العملات المستخدمة", rangeToday: "اليوم", range7d: "7 أيام", range30d: "30 يومًا",
    kindStt: "التعرف على الكلام", kindTranslation: "الترجمة", kindTts: "الترجمة الصوتية", kindImageText: "ترجمة الصور",
    history: "السجل", sourceDailyFree: "تعبئة مجانية", sourcePurchase: "شراء", sourceAdmin: "هدية من Mingle", sourceBonus: "مكافأة",
    sourceRefund: "استرداد", sourceExpired: "منتهية", conversationFallback: "محادثة", noHistory: "لا يوجد سجل بعد", loadMore: "عرض المزيد",
  },
  hi: {
    coin: "कॉइन", storeTitle: "स्टोर", balanceLabel: "आपके कॉइन", freePaid: "मुफ़्त {free} · खरीदे गए {paid}",
    dailyTitle: "हर दिन मुफ़्त कॉइन {cap} तक भर दिए जाते हैं", dailyNext: "अगला रीफ़िल {time} में", dailyFull: "आपके मुफ़्त कॉइन पूरे हैं",
    recommended: "सबसे किफ़ायती", minutesHint: "लगभग {minutes} मिनट इंटरप्रेटिंग",
    purchasing: "प्रोसेस हो रहा है…", purchasePending: "मंज़ूरी की प्रतीक्षा", purchaseSuccess: "{coins} कॉइन जोड़े गए", purchaseFailed: "खरीदारी पूरी नहीं हो सकी",
    productsLoadError: "प्रोडक्ट लोड नहीं हो सके", retry: "फिर से कोशिश करें", updateRequired: "कॉइन खरीदने के लिए ऐप अपडेट करें",
    webUnavailable: "अभी कॉइन केवल ऐप में खरीदे जा सकते हैं", ttsCostNotice: "वॉइस इंटरप्रेटिंग चालू करने पर कॉइन तेज़ी से खर्च होते हैं। वाक् पहचान में प्रति मिनट लगभग {stt} कॉइन लगते हैं और आवाज़ चलाने पर प्रति मिनट ऑडियो लगभग {tts} कॉइन और लगते हैं।",
    restore: "खरीदारी बहाल करें", viewUsage: "उपयोग देखें", terms: "खरीदे गए कॉइन कभी समाप्त नहीं होते। रिफ़ंड स्टोर की नीति के अनुसार होते हैं।",
    exhaustedTitle: "आपके कॉइन खत्म हो गए", exhaustedBody: "अनुवाद और इंटरप्रेटिंग जारी रखने के लिए कॉइन जोड़ें।",
    exhaustedBanner: "कॉइन न होने से अनुवाद और इंटरप्रेटिंग रुक गई है", lowBanner: "आपके कॉइन कम बचे हैं", charge: "कॉइन पाएं", close: "बंद करें",
    usedCoins: "इस्तेमाल किए गए कॉइन", rangeToday: "आज", range7d: "7 दिन", range30d: "30 दिन",
    kindStt: "वाक् पहचान", kindTranslation: "अनुवाद", kindTts: "वॉइस इंटरप्रेटिंग", kindImageText: "फ़ोटो अनुवाद",
    history: "इतिहास", sourceDailyFree: "मुफ़्त रीफ़िल", sourcePurchase: "खरीदारी", sourceAdmin: "Mingle की ओर से", sourceBonus: "बोनस",
    sourceRefund: "रिफ़ंड", sourceExpired: "समाप्त", conversationFallback: "बातचीत", noHistory: "अभी कोई इतिहास नहीं", loadMore: "और देखें",
  },
  th: {
    coin: "เหรียญ", storeTitle: "ร้านค้า", balanceLabel: "เหรียญของคุณ", freePaid: "ฟรี {free} · ซื้อ {paid}",
    dailyTitle: "เติมเหรียญฟรีให้ถึง {cap} ทุกวัน", dailyNext: "เติมครั้งถัดไปในอีก {time}", dailyFull: "เหรียญฟรีของคุณเต็มแล้ว",
    recommended: "คุ้มที่สุด", minutesHint: "ล่ามได้ประมาณ {minutes} นาที",
    purchasing: "กำลังดำเนินการ…", purchasePending: "รอการอนุมัติ", purchaseSuccess: "เติม {coins} เหรียญแล้ว", purchaseFailed: "ทำรายการซื้อไม่สำเร็จ",
    productsLoadError: "โหลดสินค้าไม่สำเร็จ", retry: "ลองอีกครั้ง", updateRequired: "อัปเดตแอปเพื่อซื้อเหรียญ",
    webUnavailable: "ตอนนี้ซื้อเหรียญได้ในแอปเท่านั้น", ttsCostNotice: "เมื่อเปิดล่ามเสียง เหรียญจะหมดเร็วขึ้น การรู้จำเสียงพูดใช้ประมาณ {stt} เหรียญต่อนาที และการเล่นเสียงใช้เพิ่มประมาณ {tts} เหรียญต่อเสียง 1 นาที",
    restore: "กู้คืนการซื้อ", viewUsage: "ดูการใช้งาน", terms: "เหรียญที่ซื้อไม่มีวันหมดอายุ การคืนเงินเป็นไปตามนโยบายของสโตร์",
    exhaustedTitle: "เหรียญหมดแล้ว", exhaustedBody: "เติมเหรียญเพื่อแปลและล่ามต่อ",
    exhaustedBanner: "การแปลและล่ามหยุดชั่วคราวเพราะเหรียญหมด", lowBanner: "เหรียญใกล้หมดแล้ว", charge: "เติมเหรียญ", close: "ปิด",
    usedCoins: "เหรียญที่ใช้ไป", rangeToday: "วันนี้", range7d: "7 วัน", range30d: "30 วัน",
    kindStt: "การรู้จำเสียงพูด", kindTranslation: "การแปล", kindTts: "ล่ามเสียง", kindImageText: "แปลรูปภาพ",
    history: "ประวัติ", sourceDailyFree: "เติมฟรี", sourcePurchase: "ซื้อ", sourceAdmin: "จาก Mingle", sourceBonus: "โบนัส",
    sourceRefund: "คืนเงิน", sourceExpired: "หมดอายุ", conversationFallback: "การสนทนา", noHistory: "ยังไม่มีประวัติ", loadMore: "ดูเพิ่มเติม",
  },
  vi: {
    coin: "Xu", storeTitle: "Cửa hàng", balanceLabel: "Xu của bạn", freePaid: "Miễn phí {free} · Đã mua {paid}",
    dailyTitle: "Mỗi ngày xu miễn phí được nạp đầy đến {cap}", dailyNext: "Lần nạp tiếp theo sau {time}", dailyFull: "Xu miễn phí của bạn đã đầy",
    recommended: "Tiết kiệm nhất", minutesHint: "Khoảng {minutes} phút phiên dịch",
    purchasing: "Đang xử lý…", purchasePending: "Đang chờ phê duyệt", purchaseSuccess: "Đã nạp {coins} xu", purchaseFailed: "Không thể hoàn tất giao dịch",
    productsLoadError: "Không tải được sản phẩm", retry: "Thử lại", updateRequired: "Cập nhật ứng dụng để mua xu",
    webUnavailable: "Hiện chỉ có thể mua xu trong ứng dụng", ttsCostNotice: "Bật phiên dịch giọng nói sẽ tốn xu nhanh hơn. Nhận dạng giọng nói tốn khoảng {stt} xu mỗi phút, và phát giọng nói tốn thêm khoảng {tts} xu cho mỗi phút âm thanh.",
    restore: "Khôi phục giao dịch mua", viewUsage: "Xem mức sử dụng", terms: "Xu đã mua không hết hạn. Hoàn tiền theo chính sách của cửa hàng ứng dụng.",
    exhaustedTitle: "Bạn đã hết xu", exhaustedBody: "Nạp xu để tiếp tục dịch và phiên dịch.",
    exhaustedBanner: "Dịch và phiên dịch đã tạm dừng vì hết xu", lowBanner: "Bạn sắp hết xu", charge: "Nạp xu", close: "Đóng",
    usedCoins: "Xu đã dùng", rangeToday: "Hôm nay", range7d: "7 ngày", range30d: "30 ngày",
    kindStt: "Nhận dạng giọng nói", kindTranslation: "Dịch", kindTts: "Phiên dịch giọng nói", kindImageText: "Dịch ảnh",
    history: "Lịch sử", sourceDailyFree: "Nạp miễn phí", sourcePurchase: "Mua", sourceAdmin: "Mingle tặng", sourceBonus: "Thưởng",
    sourceRefund: "Hoàn tiền", sourceExpired: "Hết hạn", conversationFallback: "Cuộc trò chuyện", noHistory: "Chưa có lịch sử", loadMore: "Xem thêm",
  },
};

export function getCoinCopy(locale: AppLocale): CoinCopy {
  return COIN_COPY[resolvePrimaryUiLocale(locale)];
}

export function fillCoinCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
