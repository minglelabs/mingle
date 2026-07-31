import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { getAuthOptions } from '@/lib/auth-options'
import { getConversationHydrationStateForUser } from '@/lib/app-conversations'
import { resolveOrCreateUserIdForRequest } from '@/lib/request-user-identity'
import {
  buildConversationSummaryPrompt,
  CONVERSATION_SUMMARY_RESPONSE_SCHEMA,
  parseConversationSummaryResponse,
  sanitizeConversationSummaryUtterances,
} from '@/server/api/conversation-summary-service'

const DEFAULT_CONVERSATION_SUMMARY_MODEL = 'gemini-2.5-flash-lite'

export async function postConversationSummaryResponse(
  request: NextRequest,
  conversationId: string,
) {
  const session = await getServerSession(getAuthOptions())
  const resolvedUser = await resolveOrCreateUserIdForRequest({ request, session })

  if (!resolvedUser.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const conversationState = await getConversationHydrationStateForUser({
    conversationId,
    userId: resolvedUser.userId,
  })
  if (!conversationState) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let body: { locale?: unknown; utterances?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const utterances = sanitizeConversationSummaryUtterances(body?.utterances)
  if (utterances.length < 2) {
    return NextResponse.json({ error: 'insufficient_conversation' }, { status: 422 })
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'summary_provider_unavailable' }, { status: 503 })
  }

  const outputLocale = typeof body?.locale === 'string'
    ? body.locale.trim().slice(0, 32) || 'en'
    : 'en'
  const modelName = (process.env.CONVERSATION_SUMMARY_MODEL || '').trim()
    || DEFAULT_CONVERSATION_SUMMARY_MODEL

  try {
    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: 'You create faithful, concise conversation summaries for travelers.',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: CONVERSATION_SUMMARY_RESPONSE_SCHEMA,
      },
    })
    const result = await model.generateContent(buildConversationSummaryPrompt({
      utterances,
      outputLocale,
    }))
    const rawText = result.response.text().trim()
    const parsed = parseConversationSummaryResponse(JSON.parse(rawText) as unknown)
    if (!parsed) {
      return NextResponse.json({ error: 'empty_summary' }, { status: 502 })
    }

    return NextResponse.json({ summary: parsed })
  } catch (error) {
    console.error('[conversation-summary] generation failed', {
      conversationId,
      model: modelName,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'summary_generation_failed' }, { status: 502 })
  }
}
