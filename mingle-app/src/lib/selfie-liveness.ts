/**
 * The selfie check, step by step, from what the face model reports for each
 * camera frame: a face held straight, turned to one side, turned to the other
 * side, then straight again. A photo held up to the camera cannot turn its
 * head, so this tells a live person from a picture. The straight frames give
 * the face description that is compared with the profile photo.
 *
 * Left and right are the person's own: in the camera's frame (not mirrored)
 * a head turned to its own left has a negative yaw (measured with Human on a
 * Galaxy S9: the nose sits toward the frame's right, yaw -0.44). The preview
 * is mirrored, so it also moves to the left of the screen.
 *
 * Everything runs on the phone (the free Human library, MIT); no frame or
 * face description leaves it. Only "verified" is sent to the server.
 */
export type LivenessStep = 'center' | 'turn_left' | 'turn_right' | 'return' | 'done'

export type LivenessHint = LivenessStep | 'no_face' | 'one_face' | 'closer'

export type LivenessFrame = {
  /** Faces found in the frame. */
  faces: number
  /** Head turn in radians, negative to the person's own left; null when unknown. */
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
  return { step: 'center', centerEmbedding: null, centerScore: 0 }
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
        ? { state: { ...next, step: 'turn_left' }, hint: 'turn_left' }
        : { state: next, hint: 'center' }
    }
    case 'turn_left': {
      if (yaw > -YAW_TURN) return { state: straight ? keepBestCenter(state, frame) : state, hint: 'turn_left' }
      return { state: { ...state, step: 'turn_right' }, hint: 'turn_right' }
    }
    case 'turn_right': {
      if (yaw < YAW_TURN) return { state, hint: 'turn_right' }
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

/**
 * Where the head is on the gauge under the camera, -1 (far left) to 1 (far
 * right), as the person sees it in the mirrored preview. The target of a
 * turn sits at TURN_GAUGE_TARGET on each side.
 */
export const TURN_GAUGE_RANGE = YAW_TURN * 1.5
export const TURN_GAUGE_TARGET = YAW_TURN / TURN_GAUGE_RANGE

/** How much of the new head position each frame takes (the rest stays): lower = calmer dot. */
export const GAUGE_SMOOTHING = 0.3
/** The farthest the dot moves in one frame (a fraction of the half-bar). */
export const GAUGE_MAX_STEP = 0.12

/** Eases the gauge dot toward `target`, at most GAUGE_MAX_STEP a frame (owner, 2026-11-25: it jumped). */
export function smoothGaugePosition(current: number, target: number, smoothing = GAUGE_SMOOTHING): number {
  const eased = current + (target - current) * smoothing
  const step = Math.max(-GAUGE_MAX_STEP, Math.min(GAUGE_MAX_STEP, eased - current))
  return current + step
}

export function turnGaugePosition(yaw: number | null): number {
  if (yaw === null || !Number.isFinite(yaw)) return 0
  return Math.max(-1, Math.min(1, yaw / TURN_GAUGE_RANGE))
}
