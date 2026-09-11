import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('./use-realtime-stt.ts', import.meta.url), 'utf8')
const tree = ts.createSourceFile('use-realtime-stt.ts', source, ts.ScriptTarget.Latest, true)
function offlineHandler(context: Record<string, unknown>): () => void {
  let callback = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleOffline' && node.initializer) {
      callback = node.initializer.getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!callback) throw new Error('Missing offline handler')
  return runInNewContext(ts.transpileModule(`(${callback})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
}

describe('WebView offline events', () => {
  it.each([true, false])('leaves native recording to its own transport (active=%s)', active => {
    const stopRecordingGracefully = vi.fn()
    offlineHandler({ useNativeSttRef: { current: true }, shouldStop: () => active, stopRecordingGracefully })()
    expect(stopRecordingGracefully).not.toHaveBeenCalled()
  })
  it('still stops active browser capture and ignores an idle browser', () => {
    const stopRecordingGracefully = vi.fn()
    let active = false
    const handler = offlineHandler({ useNativeSttRef: { current: false }, shouldStop: () => active, stopRecordingGracefully })
    handler()
    expect(stopRecordingGracefully).not.toHaveBeenCalled()
    active = true
    handler()
    expect(stopRecordingGracefully).toHaveBeenCalledOnce()
  })
})
