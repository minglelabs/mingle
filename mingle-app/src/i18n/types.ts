export type BaseAppDictionarySource = {
  conversations?: {
    searchPlaceholder: string;
    cancelAction: string;
    recentSearchesTitle: string;
    clearRecentSearchesAction: string;
    noRecentSearches: string;
    noSearchResults: string;
    searchButtonLabel: string;
    newConversationButtonLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    activeStatusLabel: string;
    pausedStatusLabel: string;
    switchLiveRoomToastLabel: string;
    createErrorMessage: string;
    openErrorMessage: string;
    pauseErrorMessage: string;
  };
  demo: {
    tapPlayToStart: string;
    usageLimitReached: string;
    usageLimitRetryHint: string;
    connecting: string;
    connectionFailed: string;
    muteTts: string;
    unmuteTts: string;
    textSizeLabel?: string;
    silenceFinalizeLabel?: string;
    translationModelLabel?: string;
    adBannerPositionLabel?: string;
    adBannerPositionTopLabel?: string;
    adBannerPositionBottomLabel?: string;
  };
  tabs: {
    chats: string;
    connect: string;
    moments: string;
    my: string;
  };
  titles: {
    chats: string;
    connect: string;
    moments: string;
    my: string;
  };
  chat: {
    searchPlaceholder: string;
    saveConversation: string;
    generateInvite: string;
    recentInvite: string;
    joinTitle: string;
    inviteTokenPlaceholder: string;
    join: string;
    recordsTitle: string;
    noConversation: string;
    joinedSuffix: string;
    joinNotFound: string;
    unknownConversation: string;
    joinSuccessSuffix: string;
  };
  connect: {
    aboutTitle: string;
    interestsTitle: string;
  };
  moments: {
    minutesAgoSuffix: string;
    videoLabel: string;
    likesLabel: string;
    commentsLabel: string;
  };
  authLauncher: {
    title: string;
    description: string;
    launching: string;
    retry: string;
  };
  account: {
    title: string;
    description: string;
    nameLabel: string;
    emailLabel: string;
    unknownUser: string;
    noEmail: string;
    backHome: string;
  };
  profile: {
    postsLabel: string;
    followersLabel: string;
    followingLabel: string;
    bio: string;
    comingSoonLabel?: string;
    editProfile: string;
    shareProfile: string;
    authTitle: string;
    loginRequiredTitle: string;
    loginRequiredDescription: string;
    loginLoading: string;
    signedInAs: string;
    accountPage: string;
    loginApple: string;
    loginGoogle: string;
    loginEmail: string;
    loginDemo: string;
    serviceTermsTitle: string;
    agreeToAll: string;
    privacyPolicyTitle: string;
    privacyPolicyRequired: string;
    termsOfUseTitle: string;
    termsOfUseRequired: string;
    agreeAndContinue: string;
    signInWithAnotherMethod: string;
    closeLegalSheet: string;
    closeEmailAuthSheet: string;
    emailBackLabel: string;
    emailAuthLoginTitle: string;
    emailAuthLoginSubtitle: string;
    emailAuthSignupTitle: string;
    emailAuthSignupSubtitle: string;
    emailAuthForgotTitle: string;
    emailAuthForgotSubtitle: string;
    emailFieldLabel: string;
    emailFieldPlaceholder: string;
    nameFieldLabel: string;
    nameFieldPlaceholder: string;
    passwordFieldLabel: string;
    passwordFieldPlaceholder: string;
    passwordConfirmFieldLabel: string;
    passwordConfirmFieldPlaceholder: string;
    emailSignInAction: string;
    emailSignUpAction: string;
    emailForgotPasswordLink: string;
    emailSendResetAction: string;
    emailNoAccountPrompt: string;
    emailAlreadyAccountPrompt: string;
    emailCreateAccountLink: string;
    emailBackToLoginLink: string;
    emailResetPageTitle: string;
    emailResetPageSubtitle: string;
    emailResetPasswordAction: string;
    emailResetPasswordSuccess: string;
    orLabel: string;
    emailAuthFailedMessage: string;
    emailAuthNotReadyMessage: string;
    emailResetRequestedMessage: string;
    emailRequiredFieldsMessage: string;
    emailInvalidFormatMessage: string;
    emailPasswordMismatchMessage: string;
    logout: string;
    deleteAccount: string;
    menuLabel: string;
    deleteAccountConfirm: string;
    deleteAccountConfirmAction: string;
    deleteAccountCancel: string;
    deleteAccountFailed: string;
    appleNotConfigured: string;
    googleNotConfigured: string;
    nativeSignInFailed: string;
    translatorPage: string;
    populateSeedData: string;
    mobileRuntime: string;
    nativeBridge: string;
    connected: string;
    webMode: string;
    safeArea: string;
    enabled: string;
    disabled: string;
    backgroundPush: string;
    ready: string;
    webLimited: string;
  };
};

export type LivePhoneDemoFeedbackCategory = "feedback" | "suggestion" | "inquiry";

export type AppDictionary = Omit<BaseAppDictionarySource, "demo"> & {
  demo: {
    tapPlayToStart: string;
    usageLimitReached: string;
    usageLimitRetryHint: string;
    connecting: string;
    connectionFailed: string;
    muteTts: string;
    unmuteTts: string;
    textSizeLabel: string;
    silenceFinalizeLabel: string;
    translationModelLabel: string;
    adBannerPositionLabel: string;
    adBannerPositionTopLabel: string;
    adBannerPositionBottomLabel: string;
  };
  livePhoneDemo: {
    composer: {
      manualSpeakerLabel: string;
      openKeyboardLabel: string;
      closeKeyboardLabel: string;
      composerPlaceholder: string;
      sendMessageLabel: string;
    };
    copyActions: {
      copyBubbleLabel: string;
      copyAllBubblesLabel: string;
      copiedToastLabel: string;
    };
    feedback: {
      pageTitle: string;
      feedbackMenuItemLabel: string;
      composeTabLabel: string;
      historyTabLabel: string;
      backButtonLabel: string;
      closeButtonLabel: string;
      historyTitle: string;
      historyDescription: string;
      historyLoadingLabel: string;
      historyEmptyLabel: string;
      historyErrorMessage: string;
      pendingReplyLabel: string;
      meLabel: string;
      teamLabel: string;
      categoryLabel: string;
      messageLabel: string;
      messagePlaceholder: string;
      emailLabel: string;
      emailPlaceholder: string;
      sendButtonLabel: string;
      sendingButtonLabel: string;
      successMessage: string;
      errorMessage: string;
      invalidEmailMessage: string;
      messageTooShortMessage: string;
      categoryLabels: Record<LivePhoneDemoFeedbackCategory, string>;
    };
    ttsAction: {
      playPronunciationLabel: string;
      playbackFailedLabel: string;
    };
    nativeAppUpdate: {
      sectionLabel: string;
      installedLabel: string;
      latestLabel: string;
      unknownVersionLabel: string;
      checkingMessage: string;
      availableMessage: string;
      currentMessage: string;
      unknownMessage: string;
      updateButtonLabel: string;
    };
    silenceSliderUpgrade: {
      message: string;
      buttonLabel: string;
    };
  };
  versionPolicy: {
    checkingTitle: string;
    checkingMessage: string;
    forceMessage: string;
    recommendMessage: string;
    forceTitle: string;
    recommendTitle: string;
    updateButtonLabel: string;
    laterButtonLabel: string;
    updateNowA11y: string;
    webViewLoadFailedTitle: string;
    unknownVersionLabel: string;
  };
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]>
      : T[K];
};
