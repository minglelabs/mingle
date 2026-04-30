import type { AppLocale } from "@/i18n/config";
import type { MyPageDictionary, NavigationDictionary } from "@/i18n/types";

type DraftScreenCopy = {
  navigation: NavigationDictionary;
  myPage: MyPageDictionary;
};

const ENGLISH_DRAFT_SCREEN_COPY: DraftScreenCopy = {
  navigation: {
    bottomTabBarLabel: "Bottom tab bar",
    conversationsTab: "Conversations",
    myPageTab: "My page",
    profileImageAlt: "Profile",
  },
  myPage: {
    languageSettings: "Language settings",
    accountSettings: "Account settings",
    comingSoonTitle: "Coming soon",
    comingSoonDescription: "This will be available here soon.",
    confirmAction: "OK",
    editProfileTitle: "Edit profile",
    cancelAction: "Cancel",
    doneAction: "Done",
    usernameLabel: "Username",
    usernamePlaceholder: "Username",
    addPostButtonLabel: "Add post",
    backButtonLabel: "Back",
    profileImageAlt: "Profile",
    sharePostsTitle: "Share posts",
    sharePostsDescription: "Share photos and videos",
    anonymousUser: "User",
    savedToast: "Saved.",
    saveFailedToast: "Could not save. Please try again.",
  },
};

const DRAFT_SCREEN_COPY_BY_LOCALE: Partial<Record<AppLocale, DraftScreenCopy>> = {
  ko: {
    navigation: {
      bottomTabBarLabel: "하단 탭 바",
      conversationsTab: "대화목록",
      myPageTab: "마이페이지",
      profileImageAlt: "프로필",
    },
    myPage: {
      languageSettings: "언어 설정",
      accountSettings: "계정 설정",
      comingSoonTitle: "아직 준비중입니다",
      comingSoonDescription: "빠른 시일 내에 만나보실 수 있어요.",
      confirmAction: "확인",
      editProfileTitle: "프로필 편집",
      cancelAction: "취소",
      doneAction: "완료",
      usernameLabel: "사용자 이름",
      usernamePlaceholder: "사용자 이름",
      addPostButtonLabel: "게시물 추가",
      backButtonLabel: "뒤로",
      profileImageAlt: "프로필",
      sharePostsTitle: "게시물 공유",
      sharePostsDescription: "사진과 영상을 공유해보세요",
      anonymousUser: "사용자",
      savedToast: "저장되었습니다.",
      saveFailedToast: "저장하지 못했습니다. 다시 시도해주세요.",
    },
  },
  ja: {
    navigation: {
      bottomTabBarLabel: "下部タブバー",
      conversationsTab: "会話一覧",
      myPageTab: "マイページ",
      profileImageAlt: "プロフィール",
    },
    myPage: {
      languageSettings: "言語設定",
      accountSettings: "アカウント設定",
      comingSoonTitle: "準備中です",
      comingSoonDescription: "まもなくこちらでご利用いただけます。",
      confirmAction: "確認",
      editProfileTitle: "プロフィール編集",
      cancelAction: "キャンセル",
      doneAction: "完了",
      usernameLabel: "ユーザー名",
      usernamePlaceholder: "ユーザー名",
      addPostButtonLabel: "投稿を追加",
      backButtonLabel: "戻る",
      profileImageAlt: "プロフィール",
      sharePostsTitle: "投稿をシェア",
      sharePostsDescription: "写真や動画を共有してみましょう",
      anonymousUser: "ユーザー",
      savedToast: "保存しました。",
      saveFailedToast: "保存できませんでした。もう一度お試しください。",
    },
  },
};

export function getDraftScreenCopy(locale: AppLocale): DraftScreenCopy {
  return DRAFT_SCREEN_COPY_BY_LOCALE[locale] ?? ENGLISH_DRAFT_SCREEN_COPY;
}
