import { requireAdminApi } from '@/server/admin/guard'
import {
  convertToPersonaLanguage,
  PersonaConversionFailedError,
  PersonaLanguageMissingError,
} from '@/server/operator-posts/convert'
import { OPERATOR_POST_CONVERT_INPUT_MAX } from '@/server/operator-posts/types'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { adminJson, readJsonObject } from '../http'

export const runtime = 'nodejs'

/**
 * POST `{ operatorUserId, text }` → `{ text, language, converted, sourceLanguage }`:
 * the staff's text rendered in the operator's persona language, shown to
 * staff before they queue the post (contract §5 Post language). Nothing is
 * stored; the composer submits the text it showed.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await readJsonObject(request)
  if (!body) return adminJson({ error: 'invalid_body' }, 400)

  const operatorUserId = typeof body.operatorUserId === 'string' ? body.operatorUserId.trim() : ''
  if (!operatorUserId) return adminJson({ error: 'not_operator' }, 404)
  if (typeof body.text !== 'string' || !body.text.trim()) return adminJson({ error: 'text_required' }, 400)
  if (body.text.length > OPERATOR_POST_CONVERT_INPUT_MAX) {
    return adminJson({ error: 'text_too_long', limit: OPERATOR_POST_CONVERT_INPUT_MAX }, 400)
  }

  try {
    const conversion = await convertToPersonaLanguage({ operatorUserId, text: body.text })
    return adminJson(conversion)
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return adminJson({ error: 'not_operator' }, 404)
    if (error instanceof PersonaLanguageMissingError) return adminJson({ error: 'persona_language_missing' }, 422)
    if (error instanceof PersonaConversionFailedError) return adminJson({ error: 'conversion_failed' }, 502)
    throw error
  }
}
