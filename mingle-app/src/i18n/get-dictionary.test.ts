import { describe, expect, it } from "vitest";
import { PRIMARY_UI_LANGUAGE_OPTIONS, SUPPORTED_LOCALES, getDictionary } from "@/i18n";
import { localeDictionaries } from "@/i18n/dictionaries/catalog";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

const LIVE_DEMO_PREFERENCE_LABEL_KEYS = [
  "silenceFinalizeLabel",
  "endpointTuningLabel",
  "endpointTuningShortLabel",
  "endpointTuningLongLabel",
  "adBannerPositionLabel",
  "adBannerPositionTopLabel",
  "adBannerPositionBottomLabel",
  "sttSegmentationModeLabel",
  "sttSegmentationModeEndLabel",
  "sttSegmentationModeFinLabel",
] as const;

const NEW_CONVERSATION_LABELS: Record<(typeof PRIMARY_UI_LOCALES)[number], {
  newConversationButtonLabel: string;
  startAloneOptionLabel: string;
}> = {
  ko: {
    newConversationButtonLabel: "새 대화방 만들기",
    startAloneOptionLabel: "혼자 쓰는 대화방",
  },
  en: {
    newConversationButtonLabel: "Create a new chat",
    startAloneOptionLabel: "Your own room",
  },
  ja: {
    newConversationButtonLabel: "新しいチャットを作成",
    startAloneOptionLabel: "自分用チャット",
  },
  "zh-CN": {
    newConversationButtonLabel: "新建聊天",
    startAloneOptionLabel: "专属房间",
  },
  "zh-TW": {
    newConversationButtonLabel: "新增聊天",
    startAloneOptionLabel: "專屬房間",
  },
  fr: {
    newConversationButtonLabel: "Nouvelle discussion",
    startAloneOptionLabel: "Espace personnel",
  },
  de: {
    newConversationButtonLabel: "Neuer Chat",
    startAloneOptionLabel: "Eigener Chat",
  },
  es: {
    newConversationButtonLabel: "Nuevo chat",
    startAloneOptionLabel: "Chat personal",
  },
  pt: {
    newConversationButtonLabel: "Novo chat",
    startAloneOptionLabel: "Chat pessoal",
  },
  it: {
    newConversationButtonLabel: "Nuova chat",
    startAloneOptionLabel: "Chat personale",
  },
  ru: {
    newConversationButtonLabel: "Новый чат",
    startAloneOptionLabel: "Личный чат",
  },
  ar: {
    newConversationButtonLabel: "محادثة جديدة",
    startAloneOptionLabel: "غرفتك الخاصة",
  },
  hi: {
    newConversationButtonLabel: "नई चैट",
    startAloneOptionLabel: "निजी चैट",
  },
  th: {
    newConversationButtonLabel: "แชทใหม่",
    startAloneOptionLabel: "ห้องส่วนตัว",
  },
  vi: {
    newConversationButtonLabel: "Chat mới",
    startAloneOptionLabel: "Chat riêng",
  },
};

const SEARCH_PAGINATION_COPY: Record<(typeof PRIMARY_UI_LOCALES)[number], {
  loadMoreLabel: string;
  loadingMoreLabel: string;
  loadMoreError: string;
}> = {
  ko: {
    loadMoreLabel: "더 보기",
    loadingMoreLabel: "불러오는 중...",
    loadMoreError: "추가 결과를 불러오지 못했습니다. 다시 시도해 주세요.",
  },
  en: {
    loadMoreLabel: "Load more",
    loadingMoreLabel: "Loading more...",
    loadMoreError: "Could not load more results. Please try again.",
  },
  ja: {
    loadMoreLabel: "もっと見る",
    loadingMoreLabel: "追加読み込み中...",
    loadMoreError: "追加の結果を読み込めませんでした。もう一度お試しください。",
  },
  "zh-CN": {
    loadMoreLabel: "加载更多",
    loadingMoreLabel: "正在加载更多...",
    loadMoreError: "无法加载更多结果，请重试。",
  },
  "zh-TW": {
    loadMoreLabel: "載入更多",
    loadingMoreLabel: "正在載入更多...",
    loadMoreError: "無法載入更多結果，請再試一次。",
  },
  fr: {
    loadMoreLabel: "Voir plus",
    loadingMoreLabel: "Chargement...",
    loadMoreError: "Impossible de charger plus de résultats. Réessayez.",
  },
  de: {
    loadMoreLabel: "Mehr laden",
    loadingMoreLabel: "Weitere Ergebnisse werden geladen...",
    loadMoreError: "Weitere Ergebnisse konnten nicht geladen werden. Bitte erneut versuchen.",
  },
  es: {
    loadMoreLabel: "Cargar más",
    loadingMoreLabel: "Cargando más...",
    loadMoreError: "No se pudieron cargar más resultados. Inténtalo de nuevo.",
  },
  pt: {
    loadMoreLabel: "Carregar mais",
    loadingMoreLabel: "Carregando mais...",
    loadMoreError: "Não foi possível carregar mais resultados. Tente novamente.",
  },
  it: {
    loadMoreLabel: "Carica altro",
    loadingMoreLabel: "Caricamento...",
    loadMoreError: "Impossibile caricare altri risultati. Riprova.",
  },
  ru: {
    loadMoreLabel: "Загрузить ещё",
    loadingMoreLabel: "Загрузка...",
    loadMoreError: "Не удалось загрузить другие результаты. Попробуйте ещё раз.",
  },
  ar: {
    loadMoreLabel: "تحميل المزيد",
    loadingMoreLabel: "جارٍ تحميل المزيد...",
    loadMoreError: "تعذر تحميل المزيد من النتائج. يرجى المحاولة مرة أخرى.",
  },
  hi: {
    loadMoreLabel: "और लोड करें",
    loadingMoreLabel: "और लोड हो रहा है...",
    loadMoreError: "और परिणाम लोड नहीं हो सके। फिर कोशिश करें।",
  },
  th: {
    loadMoreLabel: "โหลดเพิ่มเติม",
    loadingMoreLabel: "กำลังโหลดเพิ่มเติม...",
    loadMoreError: "โหลดผลลัพธ์เพิ่มเติมไม่สำเร็จ โปรดลองอีกครั้ง",
  },
  vi: {
    loadMoreLabel: "Tải thêm",
    loadingMoreLabel: "Đang tải thêm...",
    loadMoreError: "Không thể tải thêm kết quả. Vui lòng thử lại.",
  },
};

describe("getDictionary", () => {
  it("returns dedicated dictionaries for the expanded locale catalog", () => {
    expect(getDictionary("pl").account.title).toBe("Konto");
    expect(getDictionary("he").account.title).toBe("חשבון");
    expect(getDictionary("zh-TW").account.title).toBe("帳戶");
  });

  it("hydrates supplemental i18n sections for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dictionary = getDictionary(locale);

      expect(dictionary.demo.textSizeLabel).toBeTruthy();
      expect(dictionary.demo.translationModelLabel).toBeTruthy();
      expect(dictionary.demo.adBannerPositionBottomLabel).toBeTruthy();
      expect(dictionary.conversations?.searchPlaceholder).toBeTruthy();
      expect(dictionary.conversations?.newConversationButtonLabel).toBeTruthy();
      expect(dictionary.conversations?.switchLiveRoomToastLabel).toBeTruthy();
      expect(dictionary.conversations?.inviteFriendsPageTitle).toBeTruthy();
      expect(dictionary.livePhoneDemo.composer.sendMessageLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.composer.blockedComposerMessage).toBeTruthy();
      expect(dictionary.livePhoneDemo.copyActions.copiedToastLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.feedback.categoryLabels.feedback).toBeTruthy();
      expect(dictionary.livePhoneDemo.ttsAction.playPronunciationLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.nativeAppUpdate.updateButtonLabel).toBeTruthy();
      expect(dictionary.livePhoneDemo.silenceSliderUpgrade.buttonLabel).toBeTruthy();
      expect(dictionary.versionPolicy.checkingTitle).toBeTruthy();
      expect(dictionary.versionPolicy.updateButtonLabel).toBeTruthy();
      expect(dictionary.versionPolicy.unknownVersionLabel).toBeTruthy();
    }
  });

  it("defines live-demo preference labels for every primary UI locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const demo = localeDictionaries[locale].demo;

      for (const key of LIVE_DEMO_PREFERENCE_LABEL_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(demo, key), `${locale}.${key}`).toBe(true);
        expect(demo[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("merges generated version policy labels on top of the primary-ui fallback", () => {
    const polishDictionary = getDictionary("pl");

    expect(polishDictionary.versionPolicy.checkingTitle).toBe("Checking version");
    expect(polishDictionary.versionPolicy.updateButtonLabel).toBe("Aktualizacja");
    expect(polishDictionary.livePhoneDemo.composer.sendMessageLabel).toBe("Send message");
  });

  it("provides localized copy for the app language and social profile surfaces", () => {
    expect(PRIMARY_UI_LANGUAGE_OPTIONS).toHaveLength(15);

    for (const option of PRIMARY_UI_LANGUAGE_OPTIONS) {
      const dictionary = getDictionary(option.code);

      expect(dictionary.profile.appLanguageTitle).toBeTruthy();
      expect(dictionary.profile.appLanguageDescription).toBeTruthy();
      expect(dictionary.profile.profileShareCopyLinkLabel).toBeTruthy();
      expect(dictionary.profile.settingsLoadError).toBeTruthy();
      expect(dictionary.profile.messageAction).toBeTruthy();
      expect(dictionary.profile.messageError).toBeTruthy();
      expect(dictionary.profile.noFollowersLabel).toBeTruthy();
      expect(dictionary.profile.noFollowingLabel).toBeTruthy();
      expect(dictionary.profile.profileShareQrInstruction).toBeTruthy();
      expect(dictionary.connect.searchPlaceholder).toBeTruthy();
      expect(dictionary.connect.clearSearchLabel).toBeTruthy();
    }
  });

  it("localizes new conversation creation labels for every primary UI locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const conversations = getDictionary(locale).conversations;
      const expected = NEW_CONVERSATION_LABELS[locale];

      expect(conversations?.newConversationButtonLabel, `${locale}.newConversationButtonLabel`)
        .toBe(expected.newConversationButtonLabel);
      expect(conversations?.startAloneOptionLabel, `${locale}.startAloneOptionLabel`)
        .toBe(expected.startAloneOptionLabel);
    }
  });

  it("localizes Explore pagination copy for every primary UI locale", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const connect = getDictionary(locale).connect;
      const expected = SEARCH_PAGINATION_COPY[locale];

      expect(connect.loadMoreLabel, `${locale}.loadMoreLabel`).toBe(expected.loadMoreLabel);
      expect(connect.loadingMoreLabel, `${locale}.loadingMoreLabel`)
        .toBe(expected.loadingMoreLabel);
      expect(connect.loadMoreError, `${locale}.loadMoreError`).toBe(expected.loadMoreError);
    }
  });

  it("uses English for new supplemental copy outside the 15 primary UI locales", () => {
    const dictionary = getDictionary("pl");

    expect(dictionary.conversations?.startAloneOptionLabel).toBe("Your own room");
    expect(dictionary.livePhoneDemo.composer.blockedComposerMessage).toBe("This user is blocked.");
    expect(dictionary.profile.messageAction).toBe("Message");
    expect(dictionary.profile.profileShareQrInstruction).toBe("Place the profile QR code inside the frame.");
    expect(dictionary.connect.loadMoreLabel).toBe("Load more");
    expect(dictionary.connect.loadingMoreLabel).toBe("Loading more...");
    expect(dictionary.connect.loadMoreError).toBe("Could not load more results. Please try again.");
  });
});
