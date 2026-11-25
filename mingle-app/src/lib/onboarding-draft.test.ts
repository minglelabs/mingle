import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOnboardingDraft } from '@/lib/onboarding-draft'
import { normalizeKoreaVisitAnswer } from '@/lib/korea-visit'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('onboarding draft', () => {
  it('reads back what was kept', () => {
    const draft = parseOnboardingDraft(JSON.stringify({
      step: 'profile-photo', language: 'ja', gender: 'male',
      birthDate: { year: 1995, month: 4, day: 12 }, birthDatePicked: true,
      heightCm: 181, heightPicked: true, tripPlan: 'planned',
      koreaVisit: { start: '2027-01-10', end: null }, visitedAgo: null,
      interestCode: 'ko', interestLevel: 2, discoverySource: 'friend',
    }))
    expect(draft).toMatchObject({
      step: 'profile-photo', language: 'ja', gender: 'male', birthDatePicked: true,
      heightCm: 181, heightPicked: true, koreaVisit: { start: '2027-01-10', end: null }, interestLevel: 2,
    })
  })

  it('drops what it cannot read, and never claims a pick without a value', () => {
    expect(parseOnboardingDraft(null)).toBeNull()
    expect(parseOnboardingDraft('{')).toBeNull()
    expect(parseOnboardingDraft(JSON.stringify({ language: 'ko' }))).toBeNull()
    const draft = parseOnboardingDraft(JSON.stringify({
      step: 'height', language: 'ko', heightPicked: true, birthDatePicked: true,
      koreaVisit: { start: 'soon', end: '2027-01-12' },
    }))
    expect(draft).toMatchObject({
      heightCm: null, heightPicked: false, birthDate: null, birthDatePicked: false,
      koreaVisit: { start: null, end: null }, interestLevel: 1,
    })
  })

  it('is wired into the first run: kept, picked up, cleared, and skippable by an existing account', () => {
    const modal = read('src/components/LivePhoneDemo/LanguageOnboardingModal.tsx')
    expect(modal).toContain('readOnboardingDraft()')
    expect(modal).toContain('writeOnboardingDraft({')
    expect(modal).toContain('if (keepsDraft) clearOnboardingDraft()')
    expect(modal).toContain('data-qa="onboarding-have-account"')
    // The height is locked once saved: the wheel's suggestion is not an answer.
    expect(modal).toContain('heightCm > 0 && heightPicked')
    // A photo the phone could not keep stops the step instead of passing it.
    expect(modal).toContain('throw new Error("photo_not_kept")')
    const list = read('src/components/conversation-list.tsx')
    expect(list).toContain('onHaveAccount={sessionStatus === "unauthenticated" ? handleHaveAccount : undefined}')
    expect(list).toContain('have_account_was_new')
  })
})

describe('the speak trial', () => {
  it('translates every 10 characters and at least every second, without cancelling an answer just asked for', async () => {
    const stt = await import('@/components/LivePhoneDemo/use-realtime-stt')
    expect(stt.EAGER_PARTIAL_TRANSLATE_STEP).toBe(10)
    expect(stt.EAGER_PARTIAL_TRANSLATE_INTERVAL_MS).toBe(1000)
    const ask = (textLength: number, lastTranslateLen: number, elapsed: number) => stt.shouldTriggerPartialTranslate({
      mode: 'both', isInitialRequest: false, targetLanguagesChanged: false, textLength,
      currentText: 'x'.repeat(textLength), lastRequestedText: 'x'.repeat(lastTranslateLen), lastTranslateLen,
      charStep: stt.EAGER_PARTIAL_TRANSLATE_STEP, elapsedSinceLastRequestMs: elapsed, intervalMs: stt.EAGER_PARTIAL_TRANSLATE_INTERVAL_MS,
    }).shouldRequest
    expect(ask(10, 0, 100)).toBe(true)
    expect(ask(14, 10, 100)).toBe(false)
    expect(ask(14, 10, 1000)).toBe(true)
    const source = read('src/components/LivePhoneDemo/use-realtime-stt.ts')
    expect(source).toContain('Date.now() - runtime.lastRequestedAtMs < EAGER_PARTIAL_TRANSLATE_MIN_GAP_MS')
    expect(read('src/components/LivePhoneDemo/LivePhoneDemo.tsx')).toContain('eagerPartialTranslate: Boolean(trialSpeechLength)')
    // The sign-in notice gives way to the loading line once a sign-in starts.
    expect(read('src/components/mingle-home.tsx')).toContain('props.authNotice && signingInProvider === null && !isSigningIn')
  })
})

describe('the Korea trip on the profile', () => {
  it('accepts the three answers and nothing else', () => {
    expect(normalizeKoreaVisitAnswer({ kind: 'undecided' })).toEqual({ kind: 'undecided' })
    expect(normalizeKoreaVisitAnswer({ kind: 'dates', start: '2027-01-10' })).toEqual({ kind: 'dates', start: '2027-01-10', end: null })
    expect(normalizeKoreaVisitAnswer({ kind: 'dates', start: '2027-01-10', end: '2027-01-05' })).toBeNull()
    expect(normalizeKoreaVisitAnswer({ kind: 'visited', ago: 'month' })).toEqual({ kind: 'visited', ago: 'month' })
    expect(normalizeKoreaVisitAnswer({ kind: 'visited', ago: 'yesterday' })).toBeNull()
    expect(normalizeKoreaVisitAnswer('dates')).toBeNull()
    expect(normalizeKoreaVisitAnswer(null)).toBeNull()
  })

  it('is saved after sign-in, with the photo retried and refused photos asked again', () => {
    const sync = read('src/components/pending-profile-sync.tsx')
    expect(sync).toContain('body: JSON.stringify({ koreaVisit })')
    expect(sync).toContain('if (uploaded === "rejected") return askForAnother()')
    expect(sync).toContain('if (uploaded === "failed") return')
    expect(read('src/app/api/profile/route.ts')).toContain('normalizeKoreaVisitAnswer(body.koreaVisit)')
    expect(read('prisma/schema.prisma')).toContain('@map("korea_visit")')
  })
})
