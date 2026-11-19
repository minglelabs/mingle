import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Voice talk interpretation always runs on the default translation model,
// whatever a speaker picked for their own rooms (owner decision 2026-11-19).
// Chat rooms keep the speaker's own pick.
const reportsSource = readFileSync(new URL('./voice-interpreter-reports.ts', import.meta.url), 'utf8')
const controllerSource = readFileSync(new URL('../api/controllers/shared/voice-interpreter-controller.ts', import.meta.url), 'utf8')
const roomSource = readFileSync(new URL('../../components/LivePhoneDemo/LivePhoneDemo.tsx', import.meta.url), 'utf8')

describe('voice talk interpretation model', () => {
  it('hands the interpreter no speaker model', () => {
    expect(reportsSource).toContain('    translationModel: null,')
    expect(reportsSource).not.toContain('translationModel: true')
  })

  it('passes no model on to the translation, even one the interpreter sends', () => {
    const forward = controllerSource.slice(controllerSource.indexOf('export async function postVoiceTranslateResponse'), controllerSource.indexOf('export async function postVoiceSpeakerSttResponse'))
    expect(forward).not.toContain('translationModel: body.translationModel')
  })

  it('keeps the model pickers for chat rooms', () => {
    expect(roomSource).toContain('{translationModelLabel}')
    expect(roomSource).toContain('{ttsModelLabel}')
  })
})
