import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'

const WEB_PORT_CANDIDATES = [3000, 3001, 3002, 3003]
const STT_PORT_CANDIDATES = [3001, 3002, 3003, 3004]

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.listen(port, () => {
      server.close(() => resolve(true))
    })
  })
}

async function pickPort(candidates, reserved = new Set()) {
  for (const candidate of candidates) {
    if (reserved.has(candidate)) continue
    if (await isPortAvailable(candidate)) return candidate
  }

  throw new Error(`No available port found in: ${candidates.join(', ')}`)
}

const webPort = await pickPort(WEB_PORT_CANDIDATES)
const sttPort = await pickPort(STT_PORT_CANDIDATES, new Set([webPort]))

const sharedEnv = {
  ...process.env,
  WEB_PORT: String(webPort),
  STT_PORT: String(sttPort),
  NEXT_PUBLIC_STT_PORT: String(sttPort),
}

console.log(`[model-test] starting web on ${webPort}, stt on ${sttPort}`)

const processes = [
  {
    name: 'web',
    child: spawn('pnpm', ['exec', 'next', 'dev', '--port', String(webPort)], {
      cwd: process.cwd(),
      env: sharedEnv,
      stdio: 'inherit',
    }),
  },
  {
    name: 'stt',
    child: spawn('pnpm exec tsx stt-server.ts', {
      cwd: process.cwd(),
      env: sharedEnv,
      shell: true,
      stdio: 'inherit',
    }),
  },
]

let shuttingDown = false

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true

  for (const { child } of processes) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal))
}

for (const { name, child } of processes) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[model-test] ${name} exited (${signal || code || 0}), stopping the other process`)
      shutdown(signal || 'SIGTERM')
    }

    process.exitCode = code ?? (signal ? 1 : 0)
  })
}
