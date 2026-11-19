import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { FIRST_MESSAGE_GATE_COPY_LOCALES, resolveFirstMessageGateCopy } from '@/i18n/first-message-gate-copy'
import { parseFirstMessageSetupNeeds } from '@/lib/first-message-setup'
import { MIN_FACE_WIDTH, parseNativeFaceCheckCapability, resolveFaceCheckAnswer } from '@/lib/native-face-check'
import { isFirstMessageGateOn, parseImageFaceCheck, resolveFirstMessageNeeds, type FirstMessageGateUser } from './first-message-gate'

const verified: FirstMessageGateUser = {
  isOperator: false,
  isOfficial: false,
  email: 'a@example.com',
  phoneE164: '+12025550101',
  phoneVerifiedAt: new Date('2026-11-01T00:00:00Z'),
  image: 'https://images.example.com/profiles/u/1.jpg',
  imageFaceCheck: 'face',
}
const env = {} as NodeJS.ProcessEnv
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('first message gate: what an account still needs', () => {
  it('needs nothing with a verified number and a photo with a face', () => {
    expect(resolveFirstMessageNeeds(verified, { env, canSendCodes: true })).toEqual([])
  })

  it('asks for the number when it is missing or not verified', () => {
    expect(resolveFirstMessageNeeds({ ...verified, phoneE164: null, phoneVerifiedAt: null }, { env, canSendCodes: true })).toEqual(['phone'])
    expect(resolveFirstMessageNeeds({ ...verified, phoneVerifiedAt: null }, { env, canSendCodes: true })).toEqual(['phone'])
  })

  it('skips the number while the server cannot send codes', () => {
    expect(resolveFirstMessageNeeds({ ...verified, phoneE164: null, phoneVerifiedAt: null }, { env, canSendCodes: false })).toEqual([])
  })

  it('asks for a photo when there is none or the phone found no face', () => {
    expect(resolveFirstMessageNeeds({ ...verified, image: null, imageFaceCheck: null }, { env, canSendCodes: true })).toEqual(['face_photo'])
    expect(resolveFirstMessageNeeds({ ...verified, image: '  ' }, { env, canSendCodes: true })).toEqual(['face_photo'])
    expect(resolveFirstMessageNeeds({ ...verified, imageFaceCheck: 'no_face' }, { env, canSendCodes: true })).toEqual(['face_photo'])
  })

  it('checks a photo that was never checked, and lets an unchecked upload through', () => {
    expect(resolveFirstMessageNeeds({ ...verified, imageFaceCheck: null }, { env, canSendCodes: true })).toEqual(['face_check'])
    expect(resolveFirstMessageNeeds({ ...verified, imageFaceCheck: 'unchecked' }, { env, canSendCodes: true })).toEqual([])
  })

  it('asks for both at once, number first', () => {
    expect(resolveFirstMessageNeeds({ ...verified, phoneE164: null, phoneVerifiedAt: null, image: null }, { env, canSendCodes: true }))
      .toEqual(['phone', 'face_photo'])
  })

  it('skips operators, the official account, review accounts, and everyone when switched off', () => {
    const bare = { ...verified, phoneE164: null, phoneVerifiedAt: null, image: null }
    expect(resolveFirstMessageNeeds({ ...bare, isOperator: true }, { env, canSendCodes: true })).toEqual([])
    expect(resolveFirstMessageNeeds({ ...bare, isOfficial: true }, { env, canSendCodes: true })).toEqual([])
    expect(resolveFirstMessageNeeds(bare, { env: { REVIEW_ACCOUNT_EMAILS: 'a@example.com' } as NodeJS.ProcessEnv, canSendCodes: true })).toEqual([])
    expect(resolveFirstMessageNeeds(bare, { env: { FIRST_MESSAGE_GATE: 'off' } as NodeJS.ProcessEnv, canSendCodes: true })).toEqual([])
    expect(isFirstMessageGateOn(env)).toBe(true)
  })

  it('keeps only known face results', () => {
    expect(parseImageFaceCheck('face')).toBe('face')
    expect(parseImageFaceCheck('no_face')).toBe('no_face')
    expect(parseImageFaceCheck('unchecked')).toBe('unchecked')
    expect(parseImageFaceCheck('yes')).toBeNull()
    expect(parseImageFaceCheck(null)).toBeNull()
  })
})

describe('first message gate: the app side', () => {
  it('reads the refusal only for first_message_setup with known needs', () => {
    expect(parseFirstMessageSetupNeeds(403, { error: 'first_message_setup', needs: ['phone', 'face_photo', 'x'] })).toEqual(['phone', 'face_photo'])
    expect(parseFirstMessageSetupNeeds(403, { error: 'target_user_blocked' })).toBeNull()
    expect(parseFirstMessageSetupNeeds(429, { error: 'first_message_setup', needs: ['phone'] })).toBeNull()
    expect(parseFirstMessageSetupNeeds(403, { error: 'first_message_setup', needs: [] })).toBeNull()
  })

  it('counts a face only when it is big enough in the photo', () => {
    expect(resolveFaceCheckAnswer({ type: 'result', faces: 1, largestFaceWidth: MIN_FACE_WIDTH })).toBe('face')
    expect(resolveFaceCheckAnswer({ type: 'result', faces: 3, largestFaceWidth: 0.04 })).toBe('no_face')
    expect(resolveFaceCheckAnswer({ type: 'result', faces: 0, largestFaceWidth: 0 })).toBe('no_face')
    expect(resolveFaceCheckAnswer({ type: 'error' })).toBeNull()
    expect(resolveFaceCheckAnswer(null)).toBeNull()
  })

  it('checks only in a shell that says it can', () => {
    expect(parseNativeFaceCheckCapability({ type: 'capabilities', faceCheck: true })).toBe(true)
    expect(parseNativeFaceCheckCapability({ type: 'capabilities', contacts: true })).toBe(false)
    expect(parseNativeFaceCheckCapability(null)).toBe(false)
  })

  it('has the sheet copy in every app language', () => {
    expect([...FIRST_MESSAGE_GATE_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) {
      for (const [key, value] of Object.entries(resolveFirstMessageGateCopy(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('is wired: the direct room asks, the profile message answers, the layout mounts the sheet', () => {
    const controller = read('./api/controllers/shared/conversations-controller.ts')
    const direct = controller.slice(controller.indexOf('export async function postDirectConversationResponse'))
    expect(direct).toContain('readFirstMessageNeeds(resolvedUser.userId)')
    expect(direct).toContain('error: "first_message_setup", needs')
    // Only for a first room: inside the no-existing-room branch, before the daily limit.
    expect(direct.indexOf('if (!existingRoom)')).toBeLessThan(direct.indexOf('readFirstMessageNeeds'))
    expect(direct.indexOf('readFirstMessageNeeds')).toBeLessThan(direct.indexOf('checkDailyNewChatLimit'))

    const profile = read('../components/public-user-profile-screen.tsx')
    expect(profile).toContain('requestFirstMessageSetup(needs)')
    expect(profile).toContain('response = await send()')

    expect(read('../app/layout.tsx')).toContain('<FirstMessageGate />')
    expect(read('../app/api/profile/image/route.ts')).toContain('formData.get("faceCheck")')
    expect(read('../components/my-page.tsx')).toContain('checkPhotoForFace(draft.imageFile)')
    expect(read('../components/home/profile-start-card.tsx')).toContain('checkPhotoForFace(file)')
  })

  it('checks on the phone in both apps', () => {
    const shell = read('../../rn/App.tsx')
    expect(shell).toContain("parsed.type === 'native_face_check'")
    expect(shell).toContain('detectFaces(dataUrl)')
    expect(read('../../rn/ios/mingle/NativeQrImageModule.swift')).toContain('VNDetectFaceRectanglesRequest')
    expect(read('../../rn/ios/mingle/NativeQrImageModuleBridge.m')).toContain('RCT_EXTERN_METHOD(detectFaces:')
    const android = read('../../rn/android/app/src/main/java/com/minglelabs/mingle/rn/NativeQrImageModule.kt')
    expect(android).toContain('fun detectFaces(')
    // ML Kit: Android's old android.media.FaceDetector missed clear faces on a Galaxy S9.
    expect(android).toContain('FaceDetection.getClient(')
    expect(android).not.toContain('import android.media.FaceDetector')
    expect(read('../../rn/android/app/build.gradle')).toContain('com.google.mlkit:face-detection:')
  })
})
