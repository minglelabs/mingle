import type { OperatorPostStatKey } from '@/lib/operator-post-stats'
import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * Copy of the staff-only stats row on operator posts in the app feed
 * (`operator-post-stats-row.tsx`). Only staff ever see it, but it renders in
 * the app's language like the rest of the card. Labels stay short: six of
 * them share the width of the card's caption column.
 */
export type OperatorPostStatsCopy = {
  /** Accessible name of the row. */
  title: string
  labels: Record<OperatorPostStatKey, string>
}

const copy: Record<LegalDocumentLocale, OperatorPostStatsCopy> = {
  ko: {
    title: '글 통계 (직원에게만 보여요)',
    labels: { views: '조회', likes: '좋아요', comments: '댓글', follows: '팔로우', profileVisits: '프로필', messages: '메시지' },
  },
  en: {
    title: 'Post stats (staff only)',
    labels: { views: 'Views', likes: 'Likes', comments: 'Comments', follows: 'Follows', profileVisits: 'Profile', messages: 'Messages' },
  },
  ja: {
    title: '投稿の統計（スタッフのみ表示）',
    labels: { views: '閲覧', likes: 'いいね', comments: 'コメント', follows: 'フォロー', profileVisits: 'プロフィール', messages: 'メッセージ' },
  },
  'zh-CN': {
    title: '帖子统计（仅员工可见）',
    labels: { views: '浏览', likes: '点赞', comments: '评论', follows: '关注', profileVisits: '主页', messages: '私信' },
  },
  'zh-TW': {
    title: '貼文統計（僅員工可見）',
    labels: { views: '瀏覽', likes: '按讚', comments: '留言', follows: '追蹤', profileVisits: '個人頁', messages: '訊息' },
  },
  fr: {
    title: 'Statistiques du post (équipe uniquement)',
    labels: { views: 'Vues', likes: "J'aime", comments: 'Commentaires', follows: 'Abonnés', profileVisits: 'Profil', messages: 'Messages' },
  },
  de: {
    title: 'Beitragsstatistik (nur Team)',
    labels: { views: 'Aufrufe', likes: 'Likes', comments: 'Kommentare', follows: 'Follower', profileVisits: 'Profil', messages: 'Nachrichten' },
  },
  es: {
    title: 'Estadísticas de la publicación (solo equipo)',
    labels: { views: 'Vistas', likes: 'Me gusta', comments: 'Comentarios', follows: 'Seguidores', profileVisits: 'Perfil', messages: 'Mensajes' },
  },
  pt: {
    title: 'Estatísticas da publicação (só equipe)',
    labels: { views: 'Visualizações', likes: 'Curtidas', comments: 'Comentários', follows: 'Seguidores', profileVisits: 'Perfil', messages: 'Mensagens' },
  },
  it: {
    title: 'Statistiche del post (solo staff)',
    labels: { views: 'Visualizzazioni', likes: 'Mi piace', comments: 'Commenti', follows: 'Follower', profileVisits: 'Profilo', messages: 'Messaggi' },
  },
  ru: {
    title: 'Статистика публикации (только для команды)',
    labels: { views: 'Просмотры', likes: 'Лайки', comments: 'Комментарии', follows: 'Подписки', profileVisits: 'Профиль', messages: 'Сообщения' },
  },
  ar: {
    title: 'إحصاءات المنشور (للفريق فقط)',
    labels: { views: 'المشاهدات', likes: 'الإعجابات', comments: 'التعليقات', follows: 'المتابعات', profileVisits: 'الملف الشخصي', messages: 'الرسائل' },
  },
  hi: {
    title: 'पोस्ट के आँकड़े (सिर्फ़ टीम के लिए)',
    labels: { views: 'व्यू', likes: 'लाइक', comments: 'टिप्पणियाँ', follows: 'फ़ॉलो', profileVisits: 'प्रोफ़ाइल', messages: 'संदेश' },
  },
  th: {
    title: 'สถิติโพสต์ (เฉพาะทีมงาน)',
    labels: { views: 'การดู', likes: 'ถูกใจ', comments: 'ความคิดเห็น', follows: 'ผู้ติดตาม', profileVisits: 'โปรไฟล์', messages: 'ข้อความ' },
  },
  vi: {
    title: 'Thống kê bài viết (chỉ nhân viên)',
    labels: { views: 'Lượt xem', likes: 'Lượt thích', comments: 'Bình luận', follows: 'Theo dõi', profileVisits: 'Hồ sơ', messages: 'Tin nhắn' },
  },
}

/** Stats row copy for the given app locale, resolved to one of the 15 primary UI locales. */
export function operatorPostStatsCopy(locale: string): OperatorPostStatsCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
