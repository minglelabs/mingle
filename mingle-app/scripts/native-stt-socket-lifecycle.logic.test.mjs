import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Compile and execute the production callbacks with a controllable socket.
// No microphone, React Native runtime, or external network is required.
test('retired iOS socket callbacks cannot fail or stop a replacement recording', {
  skip: process.platform !== 'darwin',
}, () => {
  const source = readFileSync(new URL('../rn/ios/mingle/NativeSTTModule.swift', import.meta.url), 'utf8')
  const callbacks = source.slice(source.indexOf('    private func sendJson('), source.indexOf('    private func encodePcmBase64('))
    .replaceAll('private func ', 'func ')
  assert.ok(callbacks.includes('func receiveLoop()'))
  const folder = mkdtempSync(join(tmpdir(), 'mingle-stt-socket-'))
  try {
    const file = join(folder, 'main.swift')
    writeFileSync(file, `
import Foundation
final class Socket {
    enum Message { case string(String), data(Data) }
    var receiveCallback: ((Result<Message, Error>) -> Void)?
    var sendCallback: ((Error?) -> Void)?
    func receive(completion: @escaping (Result<Message, Error>) -> Void) { receiveCallback = completion }
    func send(_ message: Message, completion: @escaping (Error?) -> Void) { sendCallback = completion }
}
final class Recorder {
    var socketTask: Socket?
    var isRunning = true
    var wsMessageCount = 0
    var gracefulStopPending = false
    var errors = [String]()
    var messages = [String]()
    var closes = [String]()
    func emitError(_ error: String) { errors.append(error) }
    func emitMessage(raw: String) { messages.append(raw) }
    func stopAndCleanup(reason: String) { closes.append(reason); isRunning = false }
    func isStopRecordingAck(_ text: String) -> Bool { text == "stop_recording_ack" }
    func finishGracefulStop() { stopAndCleanup(reason: "stopped") }
${callbacks}
}
let failure = NSError(domain: "cancelled", code: -999)
let recorder = Recorder()
let retired = Socket()
recorder.socketTask = retired
recorder.receiveLoop()
recorder.sendJson(["type": "audio_chunk"])
let active = Socket()
recorder.socketTask = active
recorder.receiveLoop()
recorder.sendJson(["type": "audio_chunk"])
retired.sendCallback?(failure)
retired.receiveCallback?(.failure(failure))
retired.receiveCallback?(.success(.string("stale transcript")))
precondition(recorder.errors.isEmpty && recorder.closes.isEmpty && recorder.messages.isEmpty)
precondition(recorder.isRunning && recorder.socketTask === active)
active.receiveCallback?(.success(.string("current transcript")))
precondition(recorder.messages == ["current transcript"])
active.sendCallback?(failure)
precondition(recorder.errors.count == 1)
active.receiveCallback?(.failure(failure))
precondition(!recorder.isRunning && recorder.closes == ["receive_failed"])
precondition(recorder.errors.count == 2)
print("socket lifecycle passed")
`)
    const result = spawnSync('swift', [file], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    assert.match(result.stdout, /socket lifecycle passed/)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
