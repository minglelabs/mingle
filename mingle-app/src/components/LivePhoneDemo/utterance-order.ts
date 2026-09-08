type OrderableUtterance = {
  id: string
  createdAtMs?: number
  serverCreatedAtMs?: number
  serverMessageId?: string
}

// Local capture time keeps pending messages immediate. Once persisted, every
// member uses the reserved server start time (or persistence time). The client
// message ID survives preview, finalization and hydration; the DB ID does not.
// History cursors retain persistence time independently of this display order.
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
  const left = a.id
  const right = b.id
  return left < right ? -1 : left > right ? 1 : 0
}
