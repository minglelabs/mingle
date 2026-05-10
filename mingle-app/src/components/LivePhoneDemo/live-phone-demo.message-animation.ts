export type ResolveAnimatedLiveDemoMessageIdsInput = {
  previousIds: readonly string[] | null
  nextIds: readonly string[]
  maxAnimatedMessages?: number
}

export function resolveAnimatedLiveDemoMessageIds({
  previousIds,
  nextIds,
  maxAnimatedMessages = 1,
}: ResolveAnimatedLiveDemoMessageIdsInput): Set<string> {
  const animationLimit = Math.max(0, Math.floor(maxAnimatedMessages))
  if (previousIds === null || animationLimit === 0) return new Set()

  const previousIdSet = new Set(previousIds)
  const animatedIds: string[] = []

  for (let index = nextIds.length - 1; index >= 0; index -= 1) {
    const id = nextIds[index]
    if (previousIdSet.has(id)) break

    animatedIds.push(id)
    if (animatedIds.length >= animationLimit) break
  }

  return new Set(animatedIds)
}
