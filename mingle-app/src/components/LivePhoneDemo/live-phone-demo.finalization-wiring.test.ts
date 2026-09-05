import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Exercise the actual room callback without mounting native microphone/TTS
// surfaces. The journal tests cover recovery; this guards the UI handoff.
const source = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('LivePhoneDemo.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function deleteCallback(context: Record<string, unknown>): () => Promise<void> {
  let callback = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleDeleteConversationConfirm'
      && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!callback) throw new Error('Missing removal callback')
  return runInNewContext(ts.transpileModule(`(${callback})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
}

describe('durable finalization removal wiring', () => {
  it.each([true, false])('only clears the view after queued removal acceptance (%s), preserving delivery until acknowledgement', async accepted => {
    const clearConversationHistory = vi.fn()
    const onConversationRemoveRequested = vi.fn(async () => accepted)
    const toast = { success: vi.fn(), error: vi.fn() }
    await deleteCallback({
      isDeletingConversation: false, conversationId: 'room', isSttSessionRunning: false,
      setIsDeletingConversation: vi.fn(), onConversationRemoveRequested,
      manualTtsRequestSeqRef: { current: 0 }, setPendingManualTtsTarget: vi.fn(),
      forceStopTtsPlayback: vi.fn(), clearConversationHistory,
      setDeleteConversationDialogOpen: vi.fn(), requestCloseMenuPanel: vi.fn(),
      isMultiMember: false, toast,
      deleteConversationCopy: { successToastLabel: 'Deleted', errorToastLabel: 'Failed' },
      leaveConversationCopy: {},
    })()
    expect(onConversationRemoveRequested).toHaveBeenCalledOnce()
    if (accepted) {
      expect(clearConversationHistory).toHaveBeenCalledWith({ preservePendingDelivery: true })
      expect(toast.success).toHaveBeenCalledOnce()
    } else {
      expect(clearConversationHistory).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledOnce()
    }
  })
})
