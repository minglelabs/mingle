import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS,
  evaluateFpsRun,
  isIphone12ClassViewport,
  parseIosScrollFpsCaptureArgs,
  resolveCaptureDurationMs,
  resolveTouchScrollGesturePlan,
  summarizeCaptureRuns,
  summarizeFrameIntervals,
} from './ios-live-demo-scroll-fps-capture.logic.mjs';

test('parseIosScrollFpsCaptureArgs defaults to the physical iOS UDID environment value', () => {
  const options = parseIosScrollFpsCaptureArgs([], {
    MINGLE_UI_QA_IOS_REAL_UDID: 'real-device-udid',
    MINGLE_UI_QA_IOS_UDID: 'fallback-udid',
    MINGLE_UI_QA_APPIUM_PORT: '4777',
  });

  assert.equal(options.iosUdid, 'real-device-udid');
  assert.equal(options.appiumPort, 4777);
  assert.equal(options.reuseAppium, false);
  assert.equal(options.runs, DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.runs);
  assert.equal(options.captureDurationMs, resolveCaptureDurationMs(options));
});

test('summarizeFrameIntervals reports 60fps without jank for regular frame timestamps', () => {
  const timestamps = Array.from({ length: 301 }, (_, index) => index * (1000 / 60));
  const summary = summarizeFrameIntervals(timestamps);
  const evaluation = evaluateFpsRun(summary);

  assert.equal(summary.frameCount, 301);
  assert.equal(summary.intervalCount, 300);
  assert.equal(summary.averageFps, 60);
  assert.equal(summary.jankFrames, 0);
  assert.equal(summary.longFrames, 0);
  assert.equal(summary.estimatedDroppedFrames, 0);
  assert.equal(evaluation.pass, true);
});

test('summarizeFrameIntervals records jank and dropped-frame estimates', () => {
  const timestamps = [0, 16.7, 33.4, 88.4, 105.1, 160.1, 176.8, 193.5, 260.2];
  const summary = summarizeFrameIntervals(timestamps);

  assert.equal(summary.frameCount, 9);
  assert.equal(summary.jankFrames, 3);
  assert.equal(summary.longFrames, 3);
  assert.equal(summary.estimatedDroppedFrames, 7);
  assert.equal(evaluateFpsRun(summary, { minAverageFps: 55, minimumFrameIntervals: 1 }).pass, false);
});

test('summarizeCaptureRuns exposes repeatability and failed-run details', () => {
  const runs = [
    {
      runIndex: 1,
      metrics: { averageFps: 59.8, jankRatio: 0.01, maxFrameMs: 34, estimatedDroppedFrames: 2 },
      evaluation: { pass: true },
    },
    {
      runIndex: 2,
      metrics: { averageFps: 54.9, jankRatio: 0.04, maxFrameMs: 58, estimatedDroppedFrames: 9 },
      evaluation: { pass: false },
    },
  ];
  const summary = summarizeCaptureRuns(runs, { minAverageFps: 55 });

  assert.equal(summary.pass, false);
  assert.deepEqual(summary.failedRuns, [2]);
  assert.equal(summary.averageFpsMin, 54.9);
  assert.equal(summary.averageFpsMax, 59.8);
  assert.equal(summary.maxJankRatio, 0.04);
  assert.equal(summary.totalEstimatedDroppedFrames, 11);
});

test('resolveTouchScrollGesturePlan targets the inner chat viewport with a downward touch scroll', () => {
  const plan = resolveTouchScrollGesturePlan({
    nativeWindowRect: { x: 0, y: 0, width: 390, height: 844 },
    scrollRect: { x: 0, y: 96, width: 390, height: 620 },
    gestureCount: 5,
    gestureDurationMs: 650,
    gesturePauseMs: 180,
  });

  assert.equal(plan.x, 195);
  assert.equal(plan.gestureCount, 5);
  assert.equal(plan.gestureDurationMs, 650);
  assert.equal(plan.gesturePauseMs, 180);
  assert.ok(plan.startY > 96);
  assert.ok(plan.endY > plan.startY);
  assert.ok(plan.endY < 716);
});

test('isIphone12ClassViewport recognizes the reference viewport class', () => {
  assert.equal(isIphone12ClassViewport({ width: 390, height: 844 }), true);
  assert.equal(isIphone12ClassViewport({ width: 428, height: 926 }), true);
  assert.equal(isIphone12ClassViewport({ width: 375, height: 812 }), false);
});
