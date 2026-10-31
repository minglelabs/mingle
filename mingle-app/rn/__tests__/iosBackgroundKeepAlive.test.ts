// A module, so these helpers do not collide with runtimeContract.test.ts globals.
export {};

declare const __dirname: string;

type FileSystemModule = {
  readFileSync: (filePath: string, encoding: 'utf8') => string;
};

type PathModule = {
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
};

const fs = require('fs') as FileSystemModule;
const path = require('path') as PathModule;

const rnRoot = path.resolve(__dirname, '..');

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(rnRoot, relativePath), 'utf8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

// The pure decisions are unit-tested in
// ios/NativeLogicTests/MingleBackgroundAudioPolicyTests.swift; this guards the
// wiring that only exists in the iOS sources.
describe('iOS background keep-alive and live STT in the background', () => {
  const sttModule = readWorkspaceFile('ios/mingle/NativeSTTModule.swift');

  it('installs the keep-alive at launch and builds its policy into the app target', () => {
    const appDelegate = readWorkspaceFile('ios/mingle/AppDelegate.swift');
    const projectFile = readWorkspaceFile('ios/mingle.xcodeproj/project.pbxproj');
    const sourcesPhase = sliceBetween(
      projectFile,
      '/* Begin PBXSourcesBuildPhase section */',
      '/* End PBXSourcesBuildPhase section */',
    );

    expect(appDelegate).toContain('MingleAudioSessionCoordinator.shared.installBackgroundKeepAlive()');
    expect(sourcesPhase).toContain('MingleBackgroundAudioPolicy.swift in Sources');
    expect(projectFile).toContain('path = mingle/MingleBackgroundAudioPolicy.swift;');
  });

  it('never releases the audio session because the app entered the background', () => {
    expect(sttModule).not.toContain('scheduleDeactivateAudioSessionIfIdle(trigger: "app_background")');

    const idleWorkItem = sliceBetween(
      sttModule,
      'private func runIdleSessionWorkItem(',
      'func snapshot()',
    );
    // In the background an idle session moves to the keep-alive before any deactivation.
    expect(idleWorkItem.indexOf('startKeepAliveLocked(trigger: "idle_\\(trigger)")'))
      .toBeLessThan(idleWorkItem.indexOf('setActive(false'));
  });

  it('plays the keep-alive in a mixable playback session and never under live STT', () => {
    const startKeepAlive = sliceBetween(
      sttModule,
      'private func startKeepAliveLocked(trigger: String) {',
      'private func stopKeepAliveLocked(',
    );
    expect(startKeepAlive).toContain('setCategory(.playback, mode: .default, options: [.mixWithOthers])');
    expect(startKeepAlive).not.toContain('.playAndRecord');
    expect(startKeepAlive).not.toContain('.duckOthers');

    const acquireStt = sliceBetween(sttModule, 'func acquireSTT() {', 'func releaseSTT() {');
    expect(acquireStt).toContain('updateBackgroundKeepAlive(trigger: "stt_acquired")');
  });

  it('takes the STT owner before configuring the recording session', () => {
    const startSession = sliceBetween(sttModule, 'private func startSession(', 'installAudioObserversIfNeeded()');
    const acquireIndex = startSession.indexOf('MingleAudioSessionCoordinator.shared.acquireSTT()');
    const configureIndex = startSession.indexOf('try configureAudioSession(aecEnabled: aecEnabled)');

    expect(acquireIndex).toBeGreaterThanOrEqual(0);
    expect(configureIndex).toBeGreaterThan(acquireIndex);
  });

  it('keeps live STT running through interruptions instead of ending it', () => {
    const interruption = sliceBetween(
      sttModule,
      'private func handleAudioSessionInterruption(',
      'private func handleAudioSessionRouteChange(',
    );
    expect(interruption).not.toContain('emitStatus("interrupted")');
    expect(interruption).toContain('markCaptureSuspended()');
    expect(interruption).toContain('restartAudioCapture(reason: "interruption_ended", bypassThrottle: true)');

    const restart = sliceBetween(
      sttModule,
      'private func restartAudioCapture(reason: String, bypassThrottle: Bool = false) {',
      'private func handleCaptureRestartFailure(',
    );
    expect(restart).not.toContain('self.emitError(');
    expect(restart).toContain('self.handleCaptureRestartFailure(');

    // `silenced` is a live status for the RN shell, the room and the conversation list.
    expect(sttModule).toContain('emitStatus("silenced")');
    expect(sttModule).toContain('self.sendSilenceKeepaliveIfIdle()');
  });
});
