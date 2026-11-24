import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveFirstMessageGateCopy } from '@/i18n/first-message-gate-copy'
import { SELFIE_VERIFY_COPY_LOCALES, resolveSelfieVerifyCopy } from '@/i18n/selfie-verify-copy'
import {
  FACE_MATCH_THRESHOLD,
  TURN_GAUGE_TARGET,
  YAW_TURN,
  advanceLiveness,
  initialLivenessState,
  isSameFace,
  turnGaugePosition,
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
  it('passes straight, left, right, straight again (negative yaw is the person\'s own left)', () => {
    const { state, hints } = run([face(0), face(-0.4), face(0.4), face(0.02)])
    expect(hints).toEqual(['turn_left', 'turn_right', 'return', 'done'])
    expect(state.step).toBe('done')
    expect(state.centerEmbedding).toEqual([0.1, 0.2])
  })

  it('asks for left first: turning right first does not count', () => {
    expect(run([face(0), face(0.5)]).hints).toEqual(['turn_left', 'turn_left'])
    expect(run([face(0), face(0.5), face(-0.5), face(0)]).state.step).toBe('turn_right')
  })

  it('does not count a small turn', () => {
    expect(run([face(0), face(-0.2), face(0.2), face(0)]).state.step).toBe('turn_left')
    expect(run([face(0), face(-0.4), face(0.2), face(0)]).state.step).toBe('turn_right')
  })

  it('a still photo never finishes: it cannot turn', () => {
    expect(run(Array.from({ length: 30 }, () => face(0.01))).state.step).toBe('turn_left')
  })

  it('puts the head on the gauge: left of the middle for a left turn, the target at the turn needed', () => {
    expect(turnGaugePosition(0)).toBe(0)
    expect(turnGaugePosition(-YAW_TURN)).toBeCloseTo(-TURN_GAUGE_TARGET)
    expect(turnGaugePosition(YAW_TURN)).toBeCloseTo(TURN_GAUGE_TARGET)
    expect(turnGaugePosition(-5)).toBe(-1)
    expect(turnGaugePosition(null)).toBe(0)
  })

  it('stops on no face, two faces, or a face too far away', () => {
    expect(run([face(0, { faces: 0, yaw: null })]).hints).toEqual(['no_face'])
    expect(run([face(0, { faces: 2 })]).hints).toEqual(['one_face'])
    expect(run([face(0, { faceWidth: 0.1 })]).hints).toEqual(['closer'])
    // A second person stepping in midway does not move the steps on.
    expect(run([face(0), face(-0.4), face(0.4, { faces: 2 })]).state.step).toBe('turn_right')
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
    expect(screen).toContain('<TurnGauge step={step} position={gauge} />')
    expect(screen).toContain('<TurnArrows step={step} />')
    expect(screen).toContain('const MODEL_PATH = "/models/human/"')
    // Only the similarity goes to the server, never a frame or a face description.
    expect(screen).toContain('JSON.stringify({ similarity })')
    for (const model of ['blazeface', 'facemesh', 'faceres']) {
      expect(() => read(`../../public/models/human/${model}.json`), model).not.toThrow()
    }
    expect(read('../../rn/App.tsx')).toContain('mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"')
  })

  // QA on the iPhone 14, 2026-11-20.
  it('lets a person with no photo add one right there, on a light screen the status bar shows on', () => {
    const screen = read('../components/selfie-verify-screen.tsx')
    expect(screen).toContain('data-qa="selfie-verify-add-photo"')
    expect(screen).toContain('await uploadProfilePhotoWithFaceCheck(file)')
    expect(screen).toContain('bg-white text-gray-950')
    expect(screen).not.toContain('bg-gray-950 text-white"')
    expect(read('../components/my-page.tsx')).toContain('onPhotoUploaded={(image) =>')
    // The first-message sheet opens this screen (a photo is added here when there is none).
    expect(read('../components/first-message-gate.tsx')).toContain('hasPhoto={!needs.includes("face_photo")}')
  })

  // Owner, 2026-11-20: the camera should be on before Start, and the turn should be shown, not only told.
  it('shows the camera on the intro and a moving head-turn demo over it', () => {
    const screen = read('../components/selfie-verify-screen.tsx')
    expect(screen).toContain('const LIVE_PREVIEW_PHASES: readonly string[] = ["intro", "mismatch", "failed", "need_photo"];')
    expect(screen).toContain('phase === "camera" || (previewing && phase !== "passed")')
    // The retry screen keeps the camera on: the comparison stops only the detection loop.
    expect(screen).toContain('// Stop the detection loop; the camera stays on behind the result, for a retry.\n    runRef.current += 1;')
    expect(screen).toContain('<TurnHeadDemo side={turning} />')
    const css = read('../app/globals.css')
    expect(css).toContain('.selfie-head-turn-left .selfie-head-features')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  // Owner failed with their own photo on the iPhone 14 (2026-11-20): an iPhone front-camera photo is saved mirrored.
  it('compares the selfie with the photo as saved and mirrored, and keeps the better score', () => {
    const screen = read('../components/selfie-verify-screen.tsx')
    expect(screen).toContain('context.setTransform(-1, 0, 0, 1, canvas.width, 0);')
    expect(screen).toContain('Math.max(...photo.map((embedding) => human.match.similarity(centerEmbedding, embedding)))')
  })

  it('titles the first-message sheet by how many checks it shows', () => {
    expect(read('../components/first-message-gate.tsx')).toContain('showPhoneRow && showPhotoRow ? copy.title : copy.titleOne')
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveFirstMessageGateCopy(locale).titleOne.trim(), locale).not.toBe('')
    }
    expect(resolveFirstMessageGateCopy('ko').titleOne).toBe('처음 말 걸기 전에 하나만 확인할게요')
  })
})
