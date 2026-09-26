import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * UI copy for unified search (people + posts), the "see all people" screen,
 * the profile 3-column post grid, and recent searches.
 *
 * Follows the `profile-bio-copy.ts` pattern: one entry per primary UI locale
 * (15 languages), resolved to the viewer's primary UI locale with an English
 * fallback. Kept in a feature copy module rather than the shared dictionary so
 * eight parallel teams do not collide on `src/i18n/dictionaries/**`.
 *
 * Wording is intentionally short so longer translations (German, French) do not
 * overflow small tiles, chips, or the search field surroundings.
 */
export type SearchCopy = {
  /** Placeholder inside the single search field for people + posts. */
  searchPlaceholder: string
  /** Accessible label / tooltip for the clear-input button. */
  clearSearch: string
  /** Small inline indicator shown near the field while refreshing results. */
  searching: string
  /** Section heading above the (max 3) people results. */
  peopleHeading: string
  /** "See all" affordance that opens the full people list screen. */
  seeAllPeople: string
  /** Title of the full people list screen. */
  peopleScreenTitle: string
  /** Section heading above the 3-column post results. */
  postsHeading: string
  /** Shown when both people and posts are empty. */
  noResults: string
  /** Follow / following button labels reused inside people rows. */
  follow: string
  following: string
  /** Fallback display name when a user has neither name nor handle. */
  userFallback: string
  /** Recent-searches list heading (empty field, focused). */
  recentHeading: string
  /** Accessible label to remove a single recent search entry. */
  removeRecent: string
  /** "Clear all" recent searches action. */
  clearAllRecent: string
  /** Accessible label for a post grid tile with no preview text. */
  postTileLabel: string
  /** Accessible name for the profile post grid region. */
  profileGridLabel: string
  /** Shown in the profile grid when the author has no public posts. */
  profileGridEmpty: string
  /** Load-more affordance for infinite lists (people/posts/grid). */
  loadMore: string
}

const copy: Record<LegalDocumentLocale, SearchCopy> = {
  ko: {
    searchPlaceholder: '사람 또는 게시물 검색',
    clearSearch: '검색어 지우기',
    searching: '검색 중…',
    peopleHeading: '사람',
    seeAllPeople: '모두 보기',
    peopleScreenTitle: '사람',
    postsHeading: '게시물',
    noResults: '검색 결과가 없습니다.',
    follow: '팔로우',
    following: '팔로잉',
    userFallback: 'Mingle 사용자',
    recentHeading: '최근 검색어',
    removeRecent: '검색어 삭제',
    clearAllRecent: '전체 삭제',
    postTileLabel: '게시물 열기',
    profileGridLabel: '게시물 그리드',
    profileGridEmpty: '아직 게시물이 없습니다.',
    loadMore: '더 보기',
  },
  en: {
    searchPlaceholder: 'Search people or posts',
    clearSearch: 'Clear search',
    searching: 'Searching…',
    peopleHeading: 'People',
    seeAllPeople: 'See all',
    peopleScreenTitle: 'People',
    postsHeading: 'Posts',
    noResults: 'No results found.',
    follow: 'Follow',
    following: 'Following',
    userFallback: 'Mingle user',
    recentHeading: 'Recent searches',
    removeRecent: 'Remove search',
    clearAllRecent: 'Clear all',
    postTileLabel: 'Open post',
    profileGridLabel: 'Post grid',
    profileGridEmpty: 'No posts yet.',
    loadMore: 'Load more',
  },
  ja: {
    searchPlaceholder: 'ユーザーや投稿を検索',
    clearSearch: '検索をクリア',
    searching: '検索中…',
    peopleHeading: 'ユーザー',
    seeAllPeople: 'すべて表示',
    peopleScreenTitle: 'ユーザー',
    postsHeading: '投稿',
    noResults: '検索結果がありません。',
    follow: 'フォロー',
    following: 'フォロー中',
    userFallback: 'Mingle ユーザー',
    recentHeading: '最近の検索',
    removeRecent: '検索を削除',
    clearAllRecent: 'すべて削除',
    postTileLabel: '投稿を開く',
    profileGridLabel: '投稿グリッド',
    profileGridEmpty: 'まだ投稿がありません。',
    loadMore: 'もっと見る',
  },
  'zh-CN': {
    searchPlaceholder: '搜索用户或帖子',
    clearSearch: '清除搜索',
    searching: '搜索中…',
    peopleHeading: '用户',
    seeAllPeople: '查看全部',
    peopleScreenTitle: '用户',
    postsHeading: '帖子',
    noResults: '没有找到结果。',
    follow: '关注',
    following: '已关注',
    userFallback: 'Mingle 用户',
    recentHeading: '最近搜索',
    removeRecent: '删除搜索',
    clearAllRecent: '全部清除',
    postTileLabel: '打开帖子',
    profileGridLabel: '帖子网格',
    profileGridEmpty: '还没有帖子。',
    loadMore: '加载更多',
  },
  'zh-TW': {
    searchPlaceholder: '搜尋用戶或貼文',
    clearSearch: '清除搜尋',
    searching: '搜尋中…',
    peopleHeading: '用戶',
    seeAllPeople: '查看全部',
    peopleScreenTitle: '用戶',
    postsHeading: '貼文',
    noResults: '找不到結果。',
    follow: '追蹤',
    following: '追蹤中',
    userFallback: 'Mingle 用戶',
    recentHeading: '最近搜尋',
    removeRecent: '刪除搜尋',
    clearAllRecent: '全部清除',
    postTileLabel: '開啟貼文',
    profileGridLabel: '貼文格線',
    profileGridEmpty: '還沒有貼文。',
    loadMore: '載入更多',
  },
  fr: {
    searchPlaceholder: 'Rechercher personnes ou publications',
    clearSearch: 'Effacer la recherche',
    searching: 'Recherche…',
    peopleHeading: 'Personnes',
    seeAllPeople: 'Tout voir',
    peopleScreenTitle: 'Personnes',
    postsHeading: 'Publications',
    noResults: 'Aucun résultat.',
    follow: 'Suivre',
    following: 'Suivi',
    userFallback: 'Utilisateur Mingle',
    recentHeading: 'Recherches récentes',
    removeRecent: 'Supprimer la recherche',
    clearAllRecent: 'Tout effacer',
    postTileLabel: 'Ouvrir la publication',
    profileGridLabel: 'Grille de publications',
    profileGridEmpty: 'Aucune publication.',
    loadMore: 'Voir plus',
  },
  de: {
    searchPlaceholder: 'Personen oder Beiträge suchen',
    clearSearch: 'Suche löschen',
    searching: 'Suchen…',
    peopleHeading: 'Personen',
    seeAllPeople: 'Alle ansehen',
    peopleScreenTitle: 'Personen',
    postsHeading: 'Beiträge',
    noResults: 'Keine Ergebnisse.',
    follow: 'Folgen',
    following: 'Gefolgt',
    userFallback: 'Mingle-Nutzer',
    recentHeading: 'Letzte Suchen',
    removeRecent: 'Suche entfernen',
    clearAllRecent: 'Alle löschen',
    postTileLabel: 'Beitrag öffnen',
    profileGridLabel: 'Beitragsraster',
    profileGridEmpty: 'Noch keine Beiträge.',
    loadMore: 'Mehr laden',
  },
  es: {
    searchPlaceholder: 'Buscar personas o publicaciones',
    clearSearch: 'Borrar búsqueda',
    searching: 'Buscando…',
    peopleHeading: 'Personas',
    seeAllPeople: 'Ver todo',
    peopleScreenTitle: 'Personas',
    postsHeading: 'Publicaciones',
    noResults: 'Sin resultados.',
    follow: 'Seguir',
    following: 'Siguiendo',
    userFallback: 'Usuario de Mingle',
    recentHeading: 'Búsquedas recientes',
    removeRecent: 'Eliminar búsqueda',
    clearAllRecent: 'Borrar todo',
    postTileLabel: 'Abrir publicación',
    profileGridLabel: 'Cuadrícula de publicaciones',
    profileGridEmpty: 'Aún no hay publicaciones.',
    loadMore: 'Ver más',
  },
  pt: {
    searchPlaceholder: 'Buscar pessoas ou publicações',
    clearSearch: 'Limpar busca',
    searching: 'Buscando…',
    peopleHeading: 'Pessoas',
    seeAllPeople: 'Ver tudo',
    peopleScreenTitle: 'Pessoas',
    postsHeading: 'Publicações',
    noResults: 'Nenhum resultado.',
    follow: 'Seguir',
    following: 'Seguindo',
    userFallback: 'Usuário do Mingle',
    recentHeading: 'Buscas recentes',
    removeRecent: 'Remover busca',
    clearAllRecent: 'Limpar tudo',
    postTileLabel: 'Abrir publicação',
    profileGridLabel: 'Grade de publicações',
    profileGridEmpty: 'Ainda não há publicações.',
    loadMore: 'Ver mais',
  },
  it: {
    searchPlaceholder: 'Cerca persone o post',
    clearSearch: 'Cancella ricerca',
    searching: 'Ricerca…',
    peopleHeading: 'Persone',
    seeAllPeople: 'Vedi tutto',
    peopleScreenTitle: 'Persone',
    postsHeading: 'Post',
    noResults: 'Nessun risultato.',
    follow: 'Segui',
    following: 'Seguìto',
    userFallback: 'Utente Mingle',
    recentHeading: 'Ricerche recenti',
    removeRecent: 'Rimuovi ricerca',
    clearAllRecent: 'Cancella tutto',
    postTileLabel: 'Apri post',
    profileGridLabel: 'Griglia dei post',
    profileGridEmpty: 'Ancora nessun post.',
    loadMore: 'Mostra altro',
  },
  ru: {
    searchPlaceholder: 'Поиск людей или постов',
    clearSearch: 'Очистить поиск',
    searching: 'Поиск…',
    peopleHeading: 'Люди',
    seeAllPeople: 'Показать все',
    peopleScreenTitle: 'Люди',
    postsHeading: 'Посты',
    noResults: 'Ничего не найдено.',
    follow: 'Подписаться',
    following: 'Вы подписаны',
    userFallback: 'Пользователь Mingle',
    recentHeading: 'Недавние запросы',
    removeRecent: 'Удалить запрос',
    clearAllRecent: 'Очистить все',
    postTileLabel: 'Открыть пост',
    profileGridLabel: 'Сетка постов',
    profileGridEmpty: 'Постов пока нет.',
    loadMore: 'Показать ещё',
  },
  ar: {
    searchPlaceholder: 'ابحث عن أشخاص أو منشورات',
    clearSearch: 'مسح البحث',
    searching: 'جارٍ البحث…',
    peopleHeading: 'أشخاص',
    seeAllPeople: 'عرض الكل',
    peopleScreenTitle: 'أشخاص',
    postsHeading: 'منشورات',
    noResults: 'لا توجد نتائج.',
    follow: 'متابعة',
    following: 'تتابع',
    userFallback: 'مستخدم Mingle',
    recentHeading: 'عمليات البحث الأخيرة',
    removeRecent: 'حذف البحث',
    clearAllRecent: 'مسح الكل',
    postTileLabel: 'فتح المنشور',
    profileGridLabel: 'شبكة المنشورات',
    profileGridEmpty: 'لا توجد منشورات بعد.',
    loadMore: 'عرض المزيد',
  },
  hi: {
    searchPlaceholder: 'लोग या पोस्ट खोजें',
    clearSearch: 'खोज साफ़ करें',
    searching: 'खोज रहे हैं…',
    peopleHeading: 'लोग',
    seeAllPeople: 'सभी देखें',
    peopleScreenTitle: 'लोग',
    postsHeading: 'पोस्ट',
    noResults: 'कोई परिणाम नहीं मिला।',
    follow: 'फ़ॉलो करें',
    following: 'फ़ॉलो किया',
    userFallback: 'Mingle उपयोगकर्ता',
    recentHeading: 'हाल की खोजें',
    removeRecent: 'खोज हटाएँ',
    clearAllRecent: 'सभी साफ़ करें',
    postTileLabel: 'पोस्ट खोलें',
    profileGridLabel: 'पोस्ट ग्रिड',
    profileGridEmpty: 'अभी तक कोई पोस्ट नहीं।',
    loadMore: 'और देखें',
  },
  th: {
    searchPlaceholder: 'ค้นหาผู้คนหรือโพสต์',
    clearSearch: 'ล้างการค้นหา',
    searching: 'กำลังค้นหา…',
    peopleHeading: 'ผู้คน',
    seeAllPeople: 'ดูทั้งหมด',
    peopleScreenTitle: 'ผู้คน',
    postsHeading: 'โพสต์',
    noResults: 'ไม่พบผลลัพธ์',
    follow: 'ติดตาม',
    following: 'กำลังติดตาม',
    userFallback: 'ผู้ใช้ Mingle',
    recentHeading: 'การค้นหาล่าสุด',
    removeRecent: 'ลบการค้นหา',
    clearAllRecent: 'ล้างทั้งหมด',
    postTileLabel: 'เปิดโพสต์',
    profileGridLabel: 'ตารางโพสต์',
    profileGridEmpty: 'ยังไม่มีโพสต์',
    loadMore: 'ดูเพิ่มเติม',
  },
  vi: {
    searchPlaceholder: 'Tìm người hoặc bài viết',
    clearSearch: 'Xóa tìm kiếm',
    searching: 'Đang tìm…',
    peopleHeading: 'Mọi người',
    seeAllPeople: 'Xem tất cả',
    peopleScreenTitle: 'Mọi người',
    postsHeading: 'Bài viết',
    noResults: 'Không có kết quả.',
    follow: 'Theo dõi',
    following: 'Đang theo dõi',
    userFallback: 'Người dùng Mingle',
    recentHeading: 'Tìm kiếm gần đây',
    removeRecent: 'Xóa tìm kiếm',
    clearAllRecent: 'Xóa tất cả',
    postTileLabel: 'Mở bài viết',
    profileGridLabel: 'Lưới bài viết',
    profileGridEmpty: 'Chưa có bài viết.',
    loadMore: 'Xem thêm',
  },
}

export function searchCopy(locale: string): SearchCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
