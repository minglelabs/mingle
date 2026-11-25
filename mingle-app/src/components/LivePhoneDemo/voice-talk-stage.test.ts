import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENT_LOCALES } from '@/i18n/config'
import { voiceStageCopy } from '@/i18n/voice-stage-copy'
import { resolveVoiceStage, voiceStageTransition } from './voice-talk-stage'

const panelSource = readFileSync(new URL('./VoiceTalkPanel.tsx', import.meta.url), 'utf8')
const controllerSource = readFileSync(new URL('../../server/api/controllers/shared/voice-call-controller.ts', import.meta.url), 'utf8')

const person = (userId: string, role?: string, handRaised = false) => ({ userId, name: userId, image: null, role, handRaised })

describe('voice talk stage: what the panel reads from the call', () => {
  it('has no stage in a chat room: everyone speaks', () => {
    const view = resolveVoiceStage({ participants: [person('a'), person('b')] }, 'a')
    expect(view.enabled).toBe(false)
    expect(view.listeners).toEqual([])
    expect(resolveVoiceStage(null, 'a').enabled).toBe(false)
  })

  it('splits an open room into speakers and listeners, raised hands first', () => {
    const view = resolveVoiceStage({
      stage: { hostUserId: 'host' },
      participants: [person('host', 'speaker'), person('l1', 'listener'), person('l2', 'listener', true)],
    }, 'l1')
    expect(view.enabled).toBe(true)
    expect(view.isHost).toBe(false)
    expect(view.myRole).toBe('listener')
    expect(view.myHandRaised).toBe(false)
    expect(view.listeners.map((listener) => listener.userId)).toEqual(['l2', 'l1'])
    expect(view.listenerIds.has('host')).toBe(false)
  })

  it('knows the host, and someone who is not in the call', () => {
    const call = { stage: { hostUserId: 'host' }, participants: [person('host', 'speaker')] }
    expect(resolveVoiceStage(call, 'host')).toMatchObject({ isHost: true, myRole: 'speaker' })
    expect(resolveVoiceStage(call, 'visitor')).toMatchObject({ isHost: false, myRole: null })
  })

  it('tells being put on the stage and taken off it apart from joining and leaving', () => {
    expect(voiceStageTransition('listener', 'speaker')).toBe('promoted')
    expect(voiceStageTransition('speaker', 'listener')).toBe('demoted')
    expect(voiceStageTransition(null, 'speaker')).toBeNull()
    expect(voiceStageTransition('listener', null)).toBeNull()
    expect(voiceStageTransition('speaker', 'speaker')).toBeNull()
  })
})

describe('voice talk stage: the panel', () => {
  it('draws only the speakers on the seats, and the listeners in their own row', () => {
    expect(panelSource).toContain('visibleVoiceTalkSeats(stageSeats, MAX_SEATS)')
    expect(panelSource).toContain('data-qa="voice-stage-listeners"')
  })

  it('gives a listener the raise-hand button where a speaker has the mic', () => {
    expect(panelSource).toContain("{stage.enabled && stage.myRole === 'listener' ? (")
    expect(panelSource).toContain("stageAct(stage.myHandRaised ? 'lower' : 'raise')")
  })

  it('lets the host put a listener on the stage and take a speaker off it', () => {
    expect(panelSource).toContain("stageAct('invite', listener.userId)")
    expect(panelSource).toContain("stageAct('remove', s.userId)")
    expect(panelSource).toContain('stage.enabled && stage.isHost && s && s.userId !== viewerUserId')
  })

  it('lets someone the host put on the stage step off it', () => {
    expect(panelSource).toContain("stage.enabled && joined && stage.myRole === 'speaker' && !stage.isHost")
    expect(panelSource).toContain("stageAct('step_down')")
  })

  it('joins again when put on the stage, and turns the mic off when taken off it', () => {
    expect(panelSource).toContain("if (change === 'promoted') {\n      post({ type: 'native_voice_close' })")
    expect(panelSource).toContain("if (change === 'demoted') onListenOnlyChange?.(true)")
  })

  it('has a stage only for an open room, and takes the voice away on the media server', () => {
    expect(controllerSource).toContain('if (!channel?.isPublic) return null;')
    // The lounge's host is the team account that is always in it; any other open room's is who made it.
    expect(controllerSource).toContain('return { hostUserId: (await resolveVoiceLoungeHost(conversationId)) ?? channel.ownerUserId };')
    expect(controllerSource).toContain('canPublish: self?.role !== "listener",')
    expect(controllerSource).toContain('canPublish: result.changed.role === "speaker"')
  })

  it('has its words in all 15 languages', () => {
    for (const locale of LEGAL_DOCUMENT_LOCALES) {
      for (const value of Object.values(voiceStageCopy(locale))) expect(value).toBeTruthy()
    }
    expect(voiceStageCopy('ko').raiseHand).toBe('손들기')
  })
})
