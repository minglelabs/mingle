export type ConversationMessageImage = { conversationId: string; messageId: string; width: number; height: number }
export const CONVERSATION_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export function normalizeConversationMessageImage(value: unknown): ConversationMessageImage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const image = value as Record<string, unknown>
  if (typeof image.conversationId !== 'string' || !/^[\w-]{1,128}$/.test(image.conversationId)
    || typeof image.messageId !== 'string' || !/^[\w-]{1,128}$/.test(image.messageId)
    || typeof image.width !== 'number' || !Number.isInteger(image.width) || image.width < 1 || image.width > 2048
    || typeof image.height !== 'number' || !Number.isInteger(image.height) || image.height < 1 || image.height > 2048) return undefined
  return { conversationId: image.conversationId, messageId: image.messageId, width: image.width, height: image.height }
}
export function conversationImageCopy(locale: string) {
  if (locale === 'ko') return { attach: '첨부', choose: '사진 선택', closeKeyboard: '키보드 닫기', preview: '사진 미리보기', send: '사진 보내기', sending: '보내는 중…', cancel: '취소', close: '닫기', image: '사진', copyLink: '사진 링크 복사', error: '사진을 보내지 못했습니다. 다시 시도해 주세요.', invalid: '10MB 이하의 JPG, PNG, WebP 이미지를 선택해 주세요.', loadError: '사진을 불러오지 못했습니다.', retry: '다시 시도' }
  if (locale === 'ja') return { attach: '添付', choose: '写真を選択', closeKeyboard: 'キーボードを閉じる', preview: '写真のプレビュー', send: '写真を送信', sending: '送信中…', cancel: 'キャンセル', close: '閉じる', image: '写真', copyLink: '写真リンクをコピー', error: '写真を送信できませんでした。もう一度お試しください。', invalid: '10MB以下のJPG、PNG、WebP画像を選んでください。', loadError: '写真を読み込めませんでした。', retry: '再試行' }
  return { attach: 'Attach', choose: 'Choose photo', closeKeyboard: 'Hide keyboard', preview: 'Photo preview', send: 'Send photo', sending: 'Sending…', cancel: 'Cancel', close: 'Close', image: 'Photo', copyLink: 'Copy photo link', error: 'Could not send the photo. Please try again.', invalid: 'Choose a JPG, PNG, or WebP image up to 10MB.', loadError: 'Could not load the photo.', retry: 'Try again' }
}
