import type { OperatorPostInvalidReason, OperatorPostJobState } from '@/server/operator-posts/types'

export const JOB_STATE_LABEL: Record<OperatorPostJobState, string> = {
  queued: '대기 중',
  publishing: '게시 중',
  published: '게시됨',
  duplicate: '게시됨',
  conflict: '충돌',
  failed: '실패',
  cancelled: '취소됨',
}

/** Chip colors per state (slate neutrals + sky accent; red only for failures). */
export const JOB_STATE_TONE: Record<OperatorPostJobState, string> = {
  queued: 'bg-slate-100 text-slate-700',
  publishing: 'bg-sky-100 text-sky-800',
  published: 'bg-sky-600 text-white',
  duplicate: 'bg-sky-600 text-white',
  conflict: 'bg-rose-100 text-rose-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-500',
}

export const INVALID_REASON_LABEL: Record<OperatorPostInvalidReason, string> = {
  invalid_item: '게시물 정보가 올바르지 않아요.',
  not_operator: '운영 계정이 아니에요. 계정을 다시 골라 주세요.',
  operator_inactive: '비활성화된 운영 계정이에요.',
  account_restricted: '제재 중인 계정이라 게시할 수 없어요.',
  text_or_image_required: '내용이나 사진이 필요해요.',
  text_too_long: '1000자를 넘었어요.',
  invalid_image_key: '사진을 다시 올려 주세요.',
  invalid_background: '배경을 다시 골라 주세요.',
  invalid_publish_at: '게시 시간을 다시 골라 주세요.',
  publish_at_past: '이미 지난 시간이에요.',
  publish_at_too_far: '30일 안의 시간만 고를 수 있어요.',
}

const API_ERROR_LABEL: Record<string, string> = {
  unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요.',
  Unauthorized: '로그인이 풀렸어요. 다시 로그인해 주세요.',
  not_operator: '운영 계정이 아니에요.',
  operator_inactive: '비활성화된 운영 계정이에요.',
  account_restricted: '제재 중인 계정이라 게시할 수 없어요.',
  persona_language_missing: '이 계정에 페르소나 언어가 없어요. 계정 설정을 확인해 주세요.',
  conversion_failed: '변환하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  text_required: '내용을 입력해 주세요.',
  text_too_long: '글이 너무 길어요.',
  invalid_image: 'JPG, PNG, WebP 사진만 올릴 수 있어요 (최대 10MB).',
  image_too_large: '사진이 너무 커요 (최대 10MB).',
  image_upload_failed: '사진을 저장하지 못했어요. 다시 시도해 주세요.',
  invalid_form_data: '사진을 보내지 못했어요. 다시 시도해 주세요.',
  no_items: '게시물을 추가해 주세요.',
  too_many_items: '한 번에 100개까지 예약할 수 있어요.',
  queue_full: '대기 중인 게시물이 너무 많아요 (최대 500개). 일부가 게시된 뒤 다시 시도해 주세요.',
  invalid_body: '요청이 올바르지 않아요.',
  not_found: '찾을 수 없어요.',
  network: '네트워크 오류예요. 연결을 확인하고 다시 시도해 주세요.',
}

export function apiErrorMessage(code: string | null | undefined): string {
  return (code && API_ERROR_LABEL[code]) || '문제가 생겼어요. 다시 시도해 주세요.'
}

/** Why a job failed or is retrying, for staff. Unknown engine errors keep their raw text as detail. */
export function jobErrorLabel(error: string | null): { label: string; detail: string | null } | null {
  if (!error) return null
  switch (error) {
    case 'not_operator':
    case 'operator_account_required':
      return { label: '운영 계정이 아니게 되어 게시하지 않았어요.', detail: null }
    case 'operator_inactive':
      return { label: '계정이 비활성화되어 게시하지 않았어요.', detail: null }
    case 'account_restricted':
      return { label: '계정이 제재 중이라 게시하지 않았어요.', detail: null }
    case 'invalid_image_key':
      return { label: '사진이 이 계정 것이 아니라 게시하지 않았어요.', detail: null }
    case 'client_post_id_conflict':
      return { label: '같은 게시물 번호가 이미 다른 계정에 있어요.', detail: null }
    case 'publish_interrupted':
      return { label: '게시 도중 서버가 다시 시작돼서 다시 시도해요.', detail: null }
    case 'publish_timed_out':
      return { label: '게시가 끝나지 않아 멈췄어요.', detail: null }
    default:
      return { label: '게시 중 오류가 났어요.', detail: error }
  }
}

const LANGUAGE_NAME_KO: Record<string, string> = {
  af: '아프리칸스어',
  sq: '알바니아어',
  ar: '아랍어',
  az: '아제르바이잔어',
  eu: '바스크어',
  be: '벨라루스어',
  bn: '벵골어',
  bs: '보스니아어',
  bg: '불가리아어',
  ca: '카탈루냐어',
  zh: '중국어',
  'zh-CN': '중국어 간체',
  'zh-TW': '중국어 번체',
  hr: '크로아티아어',
  cs: '체코어',
  da: '덴마크어',
  nl: '네덜란드어',
  en: '영어',
  et: '에스토니아어',
  fi: '핀란드어',
  fr: '프랑스어',
  gl: '갈리시아어',
  de: '독일어',
  el: '그리스어',
  gu: '구자라트어',
  he: '히브리어',
  hi: '힌디어',
  hu: '헝가리어',
  id: '인도네시아어',
  it: '이탈리아어',
  ja: '일본어',
  kn: '칸나다어',
  kk: '카자흐어',
  ko: '한국어',
  lv: '라트비아어',
  lt: '리투아니아어',
  mk: '마케도니아어',
  ms: '말레이어',
  ml: '말라얄람어',
  mr: '마라티어',
  no: '노르웨이어',
  fa: '페르시아어',
  pl: '폴란드어',
  pt: '포르투갈어',
  pa: '펀자브어',
  ro: '루마니아어',
  ru: '러시아어',
  sr: '세르비아어',
  sk: '슬로바키아어',
  sl: '슬로베니아어',
  es: '스페인어',
  sw: '스와힐리어',
  sv: '스웨덴어',
  tl: '타갈로그어',
  ta: '타밀어',
  te: '텔루구어',
  th: '태국어',
  tr: '튀르키예어',
  uk: '우크라이나어',
  ur: '우르두어',
  vi: '베트남어',
  cy: '웨일스어',
}

/** Korean name of a language code ("pt" → "포르투갈어"); the code itself when unknown. */
export function languageLabel(code: string | null | undefined): string {
  if (!code) return '언어 없음'
  return LANGUAGE_NAME_KO[code] ?? LANGUAGE_NAME_KO[code.split('-')[0]] ?? code
}

/** "이름" or "@handle" when the account has no name. */
export function operatorDisplayName(operator: { name: string | null; handle: string }): string {
  return operator.name?.trim() || `@${operator.handle}`
}

const BACKGROUND_NAME_KO: Record<string, string> = {
  'warm-cream': '크림',
  'soft-navy': '네이비',
  'dusty-rose': '로즈',
  'mint-green': '민트',
  'sunset-orange': '선셋',
  'ocean-blue': '오션',
  'aurora-green': '오로라',
  'lavender-mist': '라벤더',
  'golden-hour': '골든아워',
  'midnight-purple': '미드나잇',
  'paper-texture': '종이 질감',
  'dark-mesh': '다크 메시',
}

/** Korean name of a post-background catalog key (the key itself for a new preset). */
export function backgroundLabel(key: string): string {
  return BACKGROUND_NAME_KO[key] ?? key
}
