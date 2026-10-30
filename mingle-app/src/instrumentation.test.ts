import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ start: vi.fn(), kick: vi.fn() }))
vi.mock('./server/operator-posts/scheduler', () => ({
  startOperatorPostWorker: m.start,
  kickOperatorPostWorker: m.kick,
}))

import { kickOperatorPostWorker, operatorPostWorkerEnabled, register } from './instrumentation'

/** An environment where the worker may run: Node.js runtime, not a test, not switched off. */
function stubProductionNode() {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs')
  vi.stubEnv('VITEST', '')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('MINGLE_OPERATOR_POST_WORKER', '')
}

async function flushDynamicImport() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('instrumentation register()', () => {
  it('does not start the worker under vitest (the default test environment)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()
    expect(m.start).not.toHaveBeenCalled()
    expect(operatorPostWorkerEnabled()).toBe(false)
  })

  it('does not start the worker on the edge runtime', async () => {
    stubProductionNode()
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(m.start).not.toHaveBeenCalled()
  })

  it('does not start the worker without a Next runtime (scripts, builds)', async () => {
    stubProductionNode()
    vi.stubEnv('NEXT_RUNTIME', '')
    await register()
    expect(m.start).not.toHaveBeenCalled()
  })

  it('does not start the worker when switched off', async () => {
    stubProductionNode()
    vi.stubEnv('MINGLE_OPERATOR_POST_WORKER', 'off')
    await register()
    expect(m.start).not.toHaveBeenCalled()
  })

  it('does not start the worker when NODE_ENV is test', async () => {
    stubProductionNode()
    vi.stubEnv('NODE_ENV', 'test')
    await register()
    expect(m.start).not.toHaveBeenCalled()
  })

  it('starts the worker on the Node.js runtime', async () => {
    stubProductionNode()
    await register()
    expect(m.start).toHaveBeenCalledOnce()
  })
})

describe('kickOperatorPostWorker()', () => {
  it('kicks the scheduler on the Node.js runtime', async () => {
    stubProductionNode()
    kickOperatorPostWorker()
    await flushDynamicImport()
    expect(m.kick).toHaveBeenCalledOnce()
  })

  it('is a no-op under tests and when switched off', async () => {
    kickOperatorPostWorker()
    stubProductionNode()
    vi.stubEnv('MINGLE_OPERATOR_POST_WORKER', 'off')
    kickOperatorPostWorker()
    await flushDynamicImport()
    expect(m.kick).not.toHaveBeenCalled()
  })
})
