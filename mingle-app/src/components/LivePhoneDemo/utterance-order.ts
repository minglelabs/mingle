type OrderableUtterance = {
  id: string
  createdAtMs?: number
  serverCreatedAtMs?: number
  serverMessageId?: string
}

// Local capture time keeps pending messages immediate. Once persisted, every
// member uses the DB timestamp/ID pair, also used by server history pagination.
export function utteranceOrderTime(utterance: OrderableUtterance): number {
  if (typeof utterance.serverCreatedAtMs === 'number' && Number.isFinite(utterance.serverCreatedAtMs)) {
    return utterance.serverCreatedAtMs
  }
  return typeof utterance.createdAtMs === 'number' && Number.isFinite(utterance.createdAtMs)
    ? utterance.createdAtMs : 0
}

export function compareUtteranceOrder(a: OrderableUtterance, b: OrderableUtterance): number {
  const time = utteranceOrderTime(a) - utteranceOrderTime(b)
  if (time) return time
  const left = a.serverMessageId ?? a.id
  const right = b.serverMessageId ?? b.id
  return left < right ? -1 : left > right ? 1 : 0
}
