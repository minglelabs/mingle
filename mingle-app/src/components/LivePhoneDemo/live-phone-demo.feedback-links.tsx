import { Fragment } from 'react'

export type LivePhoneDemoFeedbackTextPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string }

const FEEDBACK_URL_CANDIDATE_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi
const TRAILING_BASIC_PUNCTUATION_PATTERN = /[.,!?;:]+$/

function countCharacter(value: string, character: string): number {
  let count = 0

  for (const current of value) {
    if (current === character) count += 1
  }

  return count
}

function trimTrailingUrlPunctuation(candidate: string): { linkText: string; trailingText: string } {
  let linkText = candidate
  let trailingText = ''

  while (linkText.length > 0) {
    const nextLinkText = linkText.replace(TRAILING_BASIC_PUNCTUATION_PATTERN, '')
    if (nextLinkText.length === linkText.length) break

    trailingText = `${linkText.slice(nextLinkText.length)}${trailingText}`
    linkText = nextLinkText
  }

  const bracketPairs: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
  }

  while (linkText.length > 0) {
    const closingBracket = linkText[linkText.length - 1]
    const openingBracket = bracketPairs[closingBracket]
    if (!openingBracket) break

    const openingCount = countCharacter(linkText, openingBracket)
    const closingCount = countCharacter(linkText, closingBracket)
    if (closingCount <= openingCount) break

    trailingText = `${closingBracket}${trailingText}`
    linkText = linkText.slice(0, -1)
  }

  return { linkText, trailingText }
}

function normalizeFeedbackLinkHref(linkText: string): string | null {
  const hrefCandidate = linkText.toLowerCase().startsWith('www.')
    ? `https://${linkText}`
    : linkText

  try {
    const url = new URL(hrefCandidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return url.href
  } catch {
    return null
  }
}

function appendFeedbackTextPart(parts: LivePhoneDemoFeedbackTextPart[], text: string): void {
  if (!text) return

  const previousPart = parts[parts.length - 1]
  if (previousPart?.type === 'text') {
    previousPart.text += text
    return
  }

  parts.push({ type: 'text', text })
}

export function splitLivePhoneDemoFeedbackTextLinks(message: string): LivePhoneDemoFeedbackTextPart[] {
  const parts: LivePhoneDemoFeedbackTextPart[] = []
  let cursor = 0

  for (const match of message.matchAll(FEEDBACK_URL_CANDIDATE_PATTERN)) {
    const rawCandidate = match[0]
    const index = match.index
    if (index === undefined) continue

    const { linkText, trailingText } = trimTrailingUrlPunctuation(rawCandidate)
    const href = normalizeFeedbackLinkHref(linkText)
    if (!href) continue

    if (index > cursor) {
      appendFeedbackTextPart(parts, message.slice(cursor, index))
    }

    parts.push({ type: 'link', text: linkText, href })

    if (trailingText) {
      appendFeedbackTextPart(parts, trailingText)
    }

    cursor = index + rawCandidate.length
  }

  if (cursor < message.length) {
    appendFeedbackTextPart(parts, message.slice(cursor))
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: message }]
}

export function LivePhoneDemoFeedbackMessageText({ message }: { message: string }) {
  return (
    <>
      {splitLivePhoneDemoFeedbackTextLinks(message).map((part, index) => {
        if (part.type === 'text') {
          return <Fragment key={`${index}:text`}>{part.text}</Fragment>
        }

        return (
          <a
            key={`${index}:link:${part.href}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all rounded-sm font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 touch-manipulation transition hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            {part.text}
          </a>
        )
      })}
    </>
  )
}
