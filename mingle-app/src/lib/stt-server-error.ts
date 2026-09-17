export function parseSttServerError(message: Record<string, unknown>) {
  if (message.type !== 'error' || message.provider !== 'soniox') return null
  return {
    provider: 'soniox',
    code: typeof message.error_code === 'string' || typeof message.error_code === 'number'
      ? String(message.error_code) : 'unknown',
    errorType: typeof message.error_type === 'string' ? message.error_type : 'upstream_error',
    message: typeof message.error_message === 'string' ? message.error_message : 'Speech recognition failed.',
    requestId: typeof message.request_id === 'string' ? message.request_id : undefined,
  }
}
