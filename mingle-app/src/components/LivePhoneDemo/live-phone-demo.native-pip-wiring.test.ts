import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { supportsNativePipNamespace } from '@/lib/native-pip'

const source = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const tree = ts.createSourceFile('LivePhoneDemo.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function evaluateInitializer(name: string, context: Record<string, unknown>): unknown {
  let expression = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) {
      expression = node.initializer.getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!expression) throw new Error(`Missing room initializer: ${name}`)
  return runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
}

describe('room PiP compatibility wiring', () => {
  it.each([
    ['ios/v2.0.0', true, true, false],
    ['ios/v2.0.1', true, true, false],
    ['ios/v2.0.2', true, true, true],
    ['ios/v2.0.3', true, true, true],
    ['android/v2.0.1', true, false, false],
    ['ios/v2.0.2', false, true, false],
  ])('gates the actual room availability on the native shell (%s, native=%s)', (namespace, native, ios, expected) => {
    expect(evaluateInitializer('isNativeIosPipAvailable', {
      isNativeAppRuntime: native,
      isNativeIosAppRuntime: () => ios,
      clientApiNamespace: namespace,
      supportsNativePipNamespace,
    })).toBe(expected)
  })

  it.each([false, true])('guards the actual start callback as well as the button (supported=%s)', supported => {
    const postNativePipCommand = vi.fn()
    const state = { conversationId: 'room', messages: [] }
    const callback = evaluateInitializer('handleNativePipStart', {
      useCallback: (fn: () => void) => fn,
      isNativeIosPipAvailable: supported,
      nativePipStateRef: { current: state },
      nativePipLastSyncedPlaybackStateRef: { current: null },
      postNativePipCommand,
    }) as () => void
    callback()
    if (supported) expect(postNativePipCommand).toHaveBeenCalledWith({ type: 'native_pip_start', payload: state })
    else expect(postNativePipCommand).not.toHaveBeenCalled()
    expect(source).toContain("{isNativeIosPipAvailable && headerMode === 'conversation' && conversationId ? (")
  })
})
