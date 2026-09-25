/**
 * Feed data types and mock data source.
 * This file is the single data source for the feed — swap the mock array
 * with a fetch call when the API is ready.
 */

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorImage: string;
  isFollowingAuthor: boolean;
  createdAt: string;
  bodyText: string;
  bodyLanguage: string;
  isTranslated: boolean;
  backgroundKey: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export const MOCK_FEED_POSTS: FeedPost[] = [
  {
    id: "post-1",
    authorId: "user-1",
    authorName: "지민",
    authorHandle: "jimin_life",
    authorImage: "",
    isFollowingAuthor: false,
    createdAt: "2026-09-25T12:00:00Z",
    bodyText: "오늘 하루도 수고했어요 🌟\n내일은 더 좋은 일이 생길 거예요.",
    bodyLanguage: "ko",
    isTranslated: false,
    backgroundKey: "sunset-orange",
    likeCount: 42,
    commentCount: 5,
    likedByMe: false,
  },
  {
    id: "post-2",
    authorId: "user-2",
    authorName: "Alex Chen",
    authorHandle: "alexc",
    authorImage: "",
    isFollowingAuthor: true,
    createdAt: "2026-09-25T10:30:00Z",
    bodyText:
      "Just landed in Tokyo! The city lights are absolutely breathtaking. Can't wait to explore Shibuya tonight. 🗼",
    bodyLanguage: "en",
    isTranslated: false,
    backgroundKey: "ocean-blue",
    likeCount: 128,
    commentCount: 23,
    likedByMe: true,
  },
  {
    id: "post-3",
    authorId: "user-3",
    authorName: "田中太郎",
    authorHandle: "tanaka_t",
    authorImage: "",
    isFollowingAuthor: false,
    createdAt: "2026-09-25T09:15:00Z",
    bodyText: "今日のランチは最高だった！新しいラーメン屋を見つけた 🍜",
    bodyLanguage: "ja",
    isTranslated: false,
    backgroundKey: "golden-hour",
    likeCount: 67,
    commentCount: 8,
    likedByMe: false,
  },
  {
    id: "post-4",
    authorId: "user-4",
    authorName: "서연",
    authorHandle: "seoyeon_art",
    authorImage: "",
    isFollowingAuthor: true,
    createdAt: "2026-09-24T22:00:00Z",
    bodyText:
      "그림을 그리다 보면 시간이 어떻게 가는지 모르겠어요. 새벽 3시까지 작업했는데 눈 떠보니 아침이었다는... 오늘도 열심히 그려봅니다 🎨",
    bodyLanguage: "ko",
    isTranslated: false,
    backgroundKey: "lavender-mist",
    likeCount: 203,
    commentCount: 31,
    likedByMe: false,
  },
  {
    id: "post-5",
    authorId: "user-5",
    authorName: "Maria Garcia",
    authorHandle: "maria.g",
    authorImage: "",
    isFollowingAuthor: false,
    createdAt: "2026-09-24T18:45:00Z",
    bodyText: "Life is short. Eat dessert first. 🍰",
    bodyLanguage: "en",
    isTranslated: false,
    backgroundKey: "dusty-rose",
    likeCount: 89,
    commentCount: 12,
    likedByMe: true,
  },
  {
    id: "post-6",
    authorId: "user-6",
    authorName: "현우",
    authorHandle: "hyunwoo_dev",
    authorImage: "",
    isFollowingAuthor: false,
    createdAt: "2026-09-24T15:30:00Z",
    bodyText: "코딩하다가 발견한 버그를 3시간 만에 고쳤다. 알고 보니 세미콜론 하나... 😅",
    bodyLanguage: "ko",
    isTranslated: false,
    backgroundKey: "soft-navy",
    likeCount: 156,
    commentCount: 42,
    likedByMe: false,
  },
  {
    id: "post-7",
    authorId: "user-7",
    authorName: "Yuki Sato",
    authorHandle: "yuki.s",
    authorImage: "",
    isFollowingAuthor: true,
    createdAt: "2026-09-24T12:00:00Z",
    bodyText:
      "桜の季節が待ち遠しい。去年撮った写真を見返していたら、もう一度あの場所に行きたくなった 🌸",
    bodyLanguage: "ja",
    isTranslated: false,
    backgroundKey: "aurora-green",
    likeCount: 94,
    commentCount: 7,
    likedByMe: false,
  },
  {
    id: "post-8",
    authorId: "user-8",
    authorName: "민수",
    authorHandle: "minsu.k",
    authorImage: "",
    isFollowingAuthor: false,
    createdAt: "2026-09-24T08:00:00Z",
    bodyText: "아침 러닝 5km 완료! 🏃‍♂️ 오늘도 건강한 하루 시작.",
    bodyLanguage: "ko",
    isTranslated: false,
    backgroundKey: "mint-green",
    likeCount: 33,
    commentCount: 2,
    likedByMe: false,
  },
];
