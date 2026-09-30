/**
 * Korean copy for the notification-target settings screen (client-safe, pure).
 */

export type NotifyTargetCopyInput = {
  active: boolean
  deviceCount: number
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_handle: '핸들을 확인해 주세요. 영문, 숫자, 밑줄(_), 마침표(.)만 쓸 수 있습니다.',
  not_found: '이 핸들을 쓰는 계정이 없습니다.',
  operator_account: '운영 계정은 추가할 수 없습니다. 본인 Mingle 계정의 핸들을 입력하세요.',
  inactive_account: '비활성화되었거나 탈퇴·삭제된 계정은 추가할 수 없습니다.',
  guest_account: '가입한 계정만 추가할 수 있습니다. 앱에서 로그인한 본인 계정의 핸들을 입력하세요.',
}

const UNAUTHORIZED_MESSAGE = '관리자 로그인이 만료되었습니다. 페이지를 새로고침해 다시 로그인하세요.'
const FALLBACK_MESSAGE = '저장하지 못했습니다. 잠시 후 다시 시도하세요.'

/** The message for a failed add/remove request (`status` 0 = the request itself failed). */
export function describeNotifyTargetError(status: number, code: unknown): string {
  if (status === 401) return UNAUTHORIZED_MESSAGE
  return (typeof code === 'string' && ERROR_MESSAGES[code]) || FALLBACK_MESSAGE
}

/** One line under a target: whether its devices will actually ring. */
export function describeNotifyTargetDevices(target: NotifyTargetCopyInput): { text: string; ready: boolean } {
  if (!target.active) return { text: '비활성 계정이라 알림을 받지 않습니다.', ready: false }
  if (target.deviceCount > 0) return { text: `기기 ${target.deviceCount}대에서 알림을 받습니다.`, ready: true }
  return { text: '알림 받을 기기가 아직 없습니다. 이 계정으로 Mingle 앱에 로그인하고 알림을 허용하세요.', ready: false }
}

export function describeNotifyTargetAdded(handle: string, added: boolean): string {
  return added ? `@${handle} 계정을 추가했습니다.` : `@${handle} 계정은 이미 알림을 받고 있습니다.`
}

export function describeNotifyTargetRemoved(handle: string): string {
  return `@${handle} 계정의 알림을 해제했습니다.`
}
