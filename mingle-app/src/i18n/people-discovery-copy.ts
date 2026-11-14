import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Copy for the people cards on the explore (탐색) tab: a two-column grid of
 * other users with photo, name, age, flag and language levels. One entry per
 * primary UI locale (15), English fallback. Kept short: the badges sit on a
 * small photo corner.
 */
export type PeopleDiscoveryCopy = {
  /** Grid heading for a foreign viewer (Korean speakers come first). */
  headingForForeigner: string
  /** Grid heading for a Korean viewer (foreigners come first). */
  headingForKorean: string
  /** Badge: joined in the last 7 days. */
  badgeNew: string
  /** Badge: seen in the last 24 hours. */
  badgeActive: string
  /** Accessible prefix for the languages the person speaks. */
  speaks: string
  /** Accessible prefix for the languages the person is learning. */
  learning: string
  /** Button under the grid that loads the next page. */
  loadMore: string
  /** Fallback display name when a user has neither name nor handle. */
  userFallback: string
}

const copy: Record<LegalDocumentLocale, PeopleDiscoveryCopy> = {
  ko: {
    headingForForeigner: '한국 친구 만나기',
    headingForKorean: '외국인 친구 만나기',
    badgeNew: '신규',
    badgeActive: '최근 접속',
    speaks: '사용 언어',
    learning: '배우는 언어',
    loadMore: '더 보기',
    userFallback: '사용자',
  },
  en: {
    headingForForeigner: 'Meet Korean friends',
    headingForKorean: 'Meet friends from abroad',
    badgeNew: 'New',
    badgeActive: 'Active',
    speaks: 'Speaks',
    learning: 'Learning',
    loadMore: 'Show more',
    userFallback: 'User',
  },
  ja: {
    headingForForeigner: '韓国の友だちに出会う',
    headingForKorean: '海外の友だちに出会う',
    badgeNew: '新規',
    badgeActive: '最近アクティブ',
    speaks: '話せる言語',
    learning: '学習中の言語',
    loadMore: 'もっと見る',
    userFallback: 'ユーザー',
  },
  'zh-CN': {
    headingForForeigner: '认识韩国朋友',
    headingForKorean: '认识外国朋友',
    badgeNew: '新人',
    badgeActive: '最近在线',
    speaks: '会说',
    learning: '正在学',
    loadMore: '查看更多',
    userFallback: '用户',
  },
  'zh-TW': {
    headingForForeigner: '認識韓國朋友',
    headingForKorean: '認識外國朋友',
    badgeNew: '新人',
    badgeActive: '最近上線',
    speaks: '會說',
    learning: '正在學',
    loadMore: '查看更多',
    userFallback: '使用者',
  },
  fr: {
    headingForForeigner: 'Rencontrer des amis coréens',
    headingForKorean: 'Rencontrer des amis étrangers',
    badgeNew: 'Nouveau',
    badgeActive: 'Actif',
    speaks: 'Parle',
    learning: 'Apprend',
    loadMore: 'Voir plus',
    userFallback: 'Utilisateur',
  },
  de: {
    headingForForeigner: 'Koreanische Freunde finden',
    headingForKorean: 'Freunde aus dem Ausland finden',
    badgeNew: 'Neu',
    badgeActive: 'Aktiv',
    speaks: 'Spricht',
    learning: 'Lernt',
    loadMore: 'Mehr anzeigen',
    userFallback: 'Nutzer',
  },
  es: {
    headingForForeigner: 'Conoce amigos coreanos',
    headingForKorean: 'Conoce amigos extranjeros',
    badgeNew: 'Nuevo',
    badgeActive: 'Activo',
    speaks: 'Habla',
    learning: 'Aprende',
    loadMore: 'Ver más',
    userFallback: 'Usuario',
  },
  pt: {
    headingForForeigner: 'Conheça amigos coreanos',
    headingForKorean: 'Conheça amigos estrangeiros',
    badgeNew: 'Novo',
    badgeActive: 'Ativo',
    speaks: 'Fala',
    learning: 'Aprende',
    loadMore: 'Ver mais',
    userFallback: 'Usuário',
  },
  it: {
    headingForForeigner: 'Conosci amici coreani',
    headingForKorean: 'Conosci amici stranieri',
    badgeNew: 'Nuovo',
    badgeActive: 'Attivo',
    speaks: 'Parla',
    learning: 'Impara',
    loadMore: 'Mostra altro',
    userFallback: 'Utente',
  },
  ru: {
    headingForForeigner: 'Друзья из Кореи',
    headingForKorean: 'Друзья из других стран',
    badgeNew: 'Новый',
    badgeActive: 'Онлайн недавно',
    speaks: 'Говорит',
    learning: 'Изучает',
    loadMore: 'Показать ещё',
    userFallback: 'Пользователь',
  },
  ar: {
    headingForForeigner: 'تعرّف على أصدقاء كوريين',
    headingForKorean: 'تعرّف على أصدقاء من الخارج',
    badgeNew: 'جديد',
    badgeActive: 'نشط مؤخرًا',
    speaks: 'يتحدث',
    learning: 'يتعلم',
    loadMore: 'عرض المزيد',
    userFallback: 'مستخدم',
  },
  hi: {
    headingForForeigner: 'कोरियाई दोस्तों से मिलें',
    headingForKorean: 'विदेशी दोस्तों से मिलें',
    badgeNew: 'नया',
    badgeActive: 'हाल में सक्रिय',
    speaks: 'बोलते हैं',
    learning: 'सीख रहे हैं',
    loadMore: 'और देखें',
    userFallback: 'उपयोगकर्ता',
  },
  th: {
    headingForForeigner: 'พบเพื่อนชาวเกาหลี',
    headingForKorean: 'พบเพื่อนชาวต่างชาติ',
    badgeNew: 'ใหม่',
    badgeActive: 'ออนไลน์ล่าสุด',
    speaks: 'พูดได้',
    learning: 'กำลังเรียน',
    loadMore: 'ดูเพิ่มเติม',
    userFallback: 'ผู้ใช้',
  },
  vi: {
    headingForForeigner: 'Gặp bạn Hàn Quốc',
    headingForKorean: 'Gặp bạn nước ngoài',
    badgeNew: 'Mới',
    badgeActive: 'Vừa hoạt động',
    speaks: 'Nói',
    learning: 'Đang học',
    loadMore: 'Xem thêm',
    userFallback: 'Người dùng',
  },
}

export function resolvePeopleDiscoveryCopy(locale: string): PeopleDiscoveryCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
