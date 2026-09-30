import type { OperatorBioStatus } from '@/server/operators/operator-admin-query'

/** Korean copy for the operator admin pages (staff-only UI, Korean only). */

const FIELD_ERROR_COPY: Record<string, string> = {
  name_required: '이름을 입력하세요.',
  name_too_long: '이름은 40자까지 쓸 수 있습니다.',
  invalid_name: '이름에 쓸 수 없는 문자(@, 링크, 줄바꿈 등)가 있습니다.',
  reserved_name: 'Mingle·운영·공식·admin 같은 단어는 이름에 쓸 수 없습니다.',
  invalid_handle: '핸들은 영문 소문자·숫자·밑줄(_)·마침표(.)로, 영문을 넣어 3-30자로 쓰세요. 마침표로 끝나거나 마침표 두 개를 붙일 수 없습니다.',
  handle_too_short: '핸들은 3자 이상이어야 합니다.',
  reserved_handle: 'mingle·admin·official 같은 단어가 들어간 핸들은 쓸 수 없습니다.',
  handle_taken: '이미 사용 중인 핸들입니다. 다른 핸들을 쓰세요.',
  bio_too_long: '소개는 160자까지 쓸 수 있습니다.',
  invalid_bio: '소개에 쓸 수 없는 문자가 있습니다.',
  bio_contact_details: '소개에 링크·이메일·전화번호·@아이디를 넣을 수 없습니다.',
  bio_mentions_mingle: '소개에 Mingle을 언급할 수 없습니다.',
  invalid_birth_year: '태어난 해를 확인하세요 (올해 기준 20-80세).',
  too_young: '성인만 만들 수 있습니다 (올해 20세 이상).',
  invalid_language: '주 언어를 선택하세요.',
  invalid_country: '나라를 선택하세요.',
  invalid_city: '도시를 선택하세요.',
  invalid_gender: '성별을 다시 선택하세요.',
  notes_too_long: '메모는 1000자까지 쓸 수 있습니다.',
  invalid_notes: '메모를 확인하세요.',
  invalid_draft: '초안을 확인하세요.',
}

const REQUEST_ERROR_COPY: Record<string, string> = {
  unauthorized: '관리자 로그인이 만료되었습니다. 다시 로그인하세요.',
  network: '네트워크 오류입니다. 연결을 확인하고 다시 시도하세요.',
  invalid_json: '요청을 보내지 못했습니다. 다시 시도하세요.',
  invalid_body: '요청을 보내지 못했습니다. 다시 시도하세요.',
  invalid_count: '만들 개수는 1-20개입니다.',
  invalid_countries: '나라를 하나 이상 고르세요.',
  invalid_age_range: '나이는 20-80세, 최소가 최대보다 클 수 없습니다.',
  invalid_gender_mix: '성별 구성을 다시 고르세요.',
  invalid_notes: '말투 메모는 300자까지 쓸 수 있습니다.',
  invalid_avoid_list: '초안이 너무 많습니다. 일부를 지운 뒤 다시 시도하세요.',
  llm_unavailable: '초안 생성 기능이 설정되지 않았습니다 (서버에 GEMINI_API_KEY 필요).',
  draft_generation_failed: '초안을 만들지 못했습니다. 잠시 후 다시 시도하세요.',
  invalid_drafts: '만들 초안이 없거나 20개를 넘었습니다.',
  invalid_draft: '고쳐야 할 항목이 있습니다.',
  handle_unavailable: '이 핸들과 비슷한 핸들이 모두 사용 중입니다. 핸들을 바꿔 주세요.',
  create_failed: '계정을 만들지 못했습니다. 다시 시도하세요.',
  image_required: '사진을 고르세요.',
  invalid_image: 'JPG·PNG·WEBP 사진만, 10MB 이하로 올릴 수 있습니다.',
  image_too_large: '사진이 너무 큽니다 (10MB 이하).',
  invalid_form_data: '사진을 보내지 못했습니다. 다시 시도하세요.',
  image_storage_not_configured: '사진 저장소(R2)가 설정되지 않았습니다.',
  image_upload_failed: '사진을 올리지 못했습니다. 다시 시도하세요.',
  profile_update_failed: '사진을 저장하지 못했습니다. 다시 시도하세요.',
  operator_not_found: '운영 계정을 찾을 수 없습니다.',
  invalid_patch: '고쳐야 할 항목이 있습니다.',
  no_fields_to_update: '바뀐 내용이 없습니다.',
  handle_taken: '이미 사용 중인 핸들입니다.',
  update_failed: '저장하지 못했습니다. 다시 시도하세요.',
}

export function fieldErrorMessage(code: string): string {
  return FIELD_ERROR_COPY[code] ?? '값을 확인하세요.'
}

export function requestErrorMessage(code: string): string {
  return REQUEST_ERROR_COPY[code] ?? '문제가 생겼습니다. 다시 시도하세요.'
}

export function bioStatusLabel(status: OperatorBioStatus): string {
  switch (status) {
    case 'pending':
      return '소개 저장·번역 중'
    case 'translated':
      return '소개 번역 완료'
    case 'partial':
      return '일부 언어만 번역됨 (보는 사람이 번역을 누르면 다시 번역)'
    default:
      return '소개 없음'
  }
}
