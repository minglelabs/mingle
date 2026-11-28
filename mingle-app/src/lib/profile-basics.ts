/**
 * Gender and birth date ("profile basics") are no longer asked before the
 * first screen. They are asked the first time the user does something that
 * puts them in front of people they do not know: a follow, a comment, a post,
 * a message from someone's profile, or opening a room with other people in it. `requestProfileBasics()` is awaited at
 * those moments; it resolves true when the profile already has both (or once
 * the user fills them in) and false when the user closes the question, in
 * which case the caller drops the action.
 *
 * The question itself is shown by `ProfileBasicsGate`, mounted once in the
 * root layout. With no gate mounted (a screen outside the app shell) the
 * action is never blocked.
 */
export type ProfileBasicsField = 'gender' | 'birth-date' | 'height'

type ProfileBasicsHandler = () => Promise<boolean>

let handler: ProfileBasicsHandler | null = null

export function registerProfileBasicsHandler(next: ProfileBasicsHandler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

export function requestProfileBasics(): Promise<boolean> {
  return handler ? handler() : Promise.resolve(true)
}

/** Which of the two the profile still lacks, in the order they are asked. */
export function resolveMissingProfileBasics(profile: {
  gender?: unknown
  birthDate?: unknown
  heightCm?: unknown
} | null): ProfileBasicsField[] {
  if (!profile) return []
  const missing: ProfileBasicsField[] = []
  const hasGender = typeof profile.gender === 'string' && Boolean(profile.gender)
  if (!hasGender) missing.push('gender')
  if (typeof profile.birthDate !== 'string' || !profile.birthDate) missing.push('birth-date')
  // Height is asked of men only (owner decision 2026-11-19). With no gender
  // yet the step is listed and the screens skip it unless "male" is picked.
  if (typeof profile.heightCm !== 'number' && (!hasGender || profile.gender === 'male')) missing.push('height')
  return missing
}
