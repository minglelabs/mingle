import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { SELFIE_VERIFY_COPY_LOCALES, resolveSelfieVerifyCopy } from '@/i18n/selfie-verify-copy'
import {
  FACE_MATCH_THRESHOLD,
  advanceLiveness,
  initialLivenessState,
  isSameFace,
  type LivenessFrame,
  type LivenessHint,
  type LivenessState,
} from './selfie-liveness'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const face = (yaw: number, extra: Partial<LivenessFrame> = {}): LivenessFrame => ({
  faces: 1, yaw, faceWidth: 0.4, embedding: [0.1, 0.2], score: 0.9, ...extra,
})

function run(frames: LivenessFrame[]): { state: LivenessState; hints: LivenessHint[] } {
  let state = initialLivenessState()
  const hints: LivenessHint[] = []
  for (const frame of frames) {
    const next = advanceLiveness(state, frame)
    state = next.state
    hints.push(next.hint)
  }
  return { state, hints }
}

describe('selfie check steps', () => {
  it('passes straight, one side, the other side, straight again', () => {
    const { state, hints } = run([face(0), face(-0.4), face(0.4), face(0.02)])
    expect(hints).toEqual(['turn_first', 'turn_other', 'return', 'done'])
    expect(state.step).toBe('done')
    expect(state.centerEmbedding).toEqual([0.1, 0.2])
  })

  it('takes either side first', () => {
    expect(run([face(0), face(0.5), face(-0.5), face(0)]).state.step).toBe('done')
  })

  it('does not count turning the same way twice, or a small turn', () => {
    expect(run([face(0), face(-0.4), face(-0.5), face(0)]).state.step).toBe('turn_other')
    expect(run([face(0), face(-0.2), face(0.2), face(0)]).state.step).toBe('turn_first')
  })

  it('a still photo never finishes: it cannot turn', () => {
    expect(run(Array.from({ length: 30 }, () => face(0.01))).state.step).toBe('turn_first')
  })

  it('stops on no face, two faces, or a face too far away', () => {
    expect(run([face(0, { faces: 0, yaw: null })]).hints).toEqual(['no_face'])
    expect(run([face(0, { faces: 2 })]).hints).toEqual(['one_face'])
    expect(run([face(0, { faceWidth: 0.1 })]).hints).toEqual(['closer'])
    // A second person stepping in midway does not move the steps on.
    expect(run([face(0), face(-0.4), face(0.4, { faces: 2 })]).state.step).toBe('turn_other')
  })

  it('keeps the clearest straight face for the comparison', () => {
    const { state } = run([
      face(0, { embedding: [1], score: 0.6 }),
      face(0.05, { embedding: [2], score: 0.95 }),
      face(-0.4), face(0.4),
      face(0, { embedding: [3], score: 0.7 }),
    ])
    expect(state.centerEmbedding).toEqual([2])
  })

  it('needs the faces to be at least as similar as the bar', () => {
    expect(isSameFace(FACE_MATCH_THRESHOLD)).toBe(true)
    expect(isSameFace(FACE_MATCH_THRESHOLD - 0.01)).toBe(false)
    expect(isSameFace(Number.NaN)).toBe(false)
  })

  it('has the copy in every app language', () => {
    expect([...SELFIE_VERIFY_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) {
      for (const [key, value] of Object.entries(resolveSelfieVerifyCopy(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('is wired: badge on profiles, cleared by a new photo, models served from this site', () => {
    expect(read('../app/api/profile/face-verification/route.ts')).toContain('isSameFace(similarity)')
    expect(read('../app/api/profile/image/route.ts')).toContain('faceVerifiedAt: null')
    expect(read('../server/user-profile.ts')).toContain('faceVerified: true')
    expect(read('../app/api/users/[userId]/route.ts')).toContain('faceVerified: true')
    expect(read('../components/public-user-profile-screen.tsx')).toContain('<FaceVerifiedBadge')
    expect(read('../components/my-page.tsx')).toContain('<SelfieVerifyScreen')
    const screen = read('../components/selfie-verify-screen.tsx')
    expect(screen).toContain('const MODEL_PATH = "/models/human/"')
    // Only the similarity goes to the server, never a frame or a face description.
    expect(screen).toContain('JSON.stringify({ similarity })')
    for (const model of ['blazeface', 'facemesh', 'faceres']) {
      expect(() => read(`../../public/models/human/${model}.json`), model).not.toThrow()
    }
    expect(read('../../rn/App.tsx')).toContain('mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"')
  })
})
