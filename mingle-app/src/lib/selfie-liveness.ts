/**
 * The selfie check, step by step, from what the face model reports for each
 * camera frame: a face held straight, turned to one side, turned to the other
 * side, then straight again. A photo held up to the camera cannot turn its
 * head, so this tells a live person from a picture. The straight frames give
 * the face description that is compared with the profile photo.
 *
 * Everything runs on the phone (the free Human library, MIT); no frame or
 * face description leaves it. Only "verified" is sent to the server.
 */
export type LivenessStep = 'center' | 'turn_first' | 'turn_other' | 'return' | 'done'

export type LivenessHint = LivenessStep | 'no_face' | 'one_face' | 'closer'

export type LivenessFrame = {
  /** Faces found in the frame. */
  faces: number
  /** Head turn in radians (left/right), null when unknown. */
  yaw: number | null
  /** Width of the face as a share of the frame's width. */
  faceWidth: number
  /** The face description (embedding) of this frame, when the model gave one. */
  embedding?: number[] | null
  /** How sure the detector is of this face, 0 to 1. */
  score?: number
}

export type LivenessState = {
  step: LivenessStep
  firstSide: -1 | 1 | null
  centerEmbedding: number[] | null
  centerScore: number
}

/** About 17 degrees: a clear head turn, easy for anyone. */
export const YAW_TURN = 0.3
/** About 7 degrees: looking straight at the camera. */
export const YAW_CENTER = 0.12
/** The face should fill a good part of the frame (phone held at arm's length or closer). */
export const MIN_LIVE_FACE_WIDTH = 0.22
/**
 * Same person when the selfie and the profile photo are at least this
 * similar (Human's `match.similarity`, 0 to 1). Measured on a Galaxy S9
 * (2026-11-19): one photo against a mirrored, cropped, darker copy of itself
 * scored 0.73 to 0.95; 55 pairs of different people scored 0.28 in the
 * middle and at most 0.54, once a photo with a tiny face (0.59) was left out.
 */
export const FACE_MATCH_THRESHOLD = 0.55
/**
 * The profile photo's face must be at least this wide (share of the photo)
 * to compare: a small, far-away face gives a loose description that can look
 * like anyone.
 */
export const MIN_PHOTO_FACE_WIDTH = 0.15

export function initialLivenessState(): LivenessState {
  return { step: 'center', firstSide: null, centerEmbedding: null, centerScore: 0 }
}

function keepBestCenter(state: LivenessState, frame: LivenessFrame): LivenessState {
  const score = frame.score ?? 0
  if (!frame.embedding?.length || (state.centerEmbedding && score <= state.centerScore)) return state
  return { ...state, centerEmbedding: frame.embedding, centerScore: score }
}

export function advanceLiveness(state: LivenessState, frame: LivenessFrame): { state: LivenessState; hint: LivenessHint } {
  if (state.step === 'done') return { state, hint: 'done' }
  if (frame.faces === 0 || frame.yaw === null) return { state, hint: 'no_face' }
  if (frame.faces > 1) return { state, hint: 'one_face' }
  if (frame.faceWidth < MIN_LIVE_FACE_WIDTH) return { state, hint: 'closer' }
  const yaw = frame.yaw
  const straight = Math.abs(yaw) <= YAW_CENTER
  switch (state.step) {
    case 'center': {
      if (!straight) return { state, hint: 'center' }
      const next = keepBestCenter(state, frame)
      return next.centerEmbedding
        ? { state: { ...next, step: 'turn_first' }, hint: 'turn_first' }
        : { state: next, hint: 'center' }
    }
    case 'turn_first': {
      if (Math.abs(yaw) < YAW_TURN) return { state: straight ? keepBestCenter(state, frame) : state, hint: 'turn_first' }
      return { state: { ...state, step: 'turn_other', firstSide: yaw < 0 ? -1 : 1 }, hint: 'turn_other' }
    }
    case 'turn_other': {
      const side = yaw < 0 ? -1 : 1
      if (Math.abs(yaw) < YAW_TURN || side === state.firstSide) return { state, hint: 'turn_other' }
      return { state: { ...state, step: 'return' }, hint: 'return' }
    }
    case 'return': {
      if (!straight) return { state, hint: 'return' }
      return { state: { ...keepBestCenter(state, frame), step: 'done' }, hint: 'done' }
    }
  }
}

export function isSameFace(similarity: number): boolean {
  return Number.isFinite(similarity) && similarity >= FACE_MATCH_THRESHOLD
}
