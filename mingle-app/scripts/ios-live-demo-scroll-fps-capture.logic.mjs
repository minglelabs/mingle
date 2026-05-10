export const IOS_SCROLL_FPS_CAPTURE_CHAT_SCROLL_SELECTOR = '[data-qa="live-demo-chat-scroll"]';
export const IOS_SCROLL_FPS_CAPTURE_GLOBAL_KEY = '__MINGLE_IOS_SCROLL_FPS_CAPTURE__';
export const IOS_SCROLL_FPS_CAPTURE_REFERENCE_DEVICE = 'iPhone 12-class physical iOS WebView';
export const IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT = 500;
export const IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_SEARCH_PARAM = 'mingleScrollMeasure';
export const IOS_SCROLL_FPS_CAPTURE_MEASUREMENT_STORAGE_KEY = 'mingle_live_demo_scroll_measure';

export const DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS = {
  appiumPort: 4723,
  runs: 3,
  gestureCount: 6,
  gestureDurationMs: 700,
  gesturePauseMs: 250,
  captureSettleMs: 1400,
  minCaptureDurationMs: 5200,
  minAverageFps: 55,
  targetFps: 60,
  jankFrameThresholdMs: 33.4,
  longFrameThresholdMs: 50,
  minimumFrameIntervals: 120,
};

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = normalizeNumber(value, fallback);
  return Math.max(1, Math.floor(parsed));
}

function normalizePositiveNumber(value, fallback) {
  const parsed = normalizeNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

export function roundMetric(value, digits = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function resolveCaptureDurationMs(options) {
  const gestureWindowMs = (
    normalizePositiveInteger(options.gestureCount, DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureCount)
    * (
      normalizePositiveInteger(options.gestureDurationMs, DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureDurationMs)
      + normalizePositiveInteger(options.gesturePauseMs, DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gesturePauseMs)
    )
  );
  const settleMs = normalizePositiveInteger(
    options.captureSettleMs,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.captureSettleMs,
  );
  const minCaptureDurationMs = normalizePositiveInteger(
    options.minCaptureDurationMs,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minCaptureDurationMs,
  );

  return Math.max(minCaptureDurationMs, gestureWindowMs + settleMs);
}

export function parseIosScrollFpsCaptureArgs(argv, env = {}) {
  const options = {
    iosUdid: env.MINGLE_UI_QA_IOS_REAL_UDID || env.MINGLE_UI_QA_IOS_UDID || '',
    appiumPort: normalizePositiveInteger(
      env.MINGLE_UI_QA_APPIUM_PORT,
      DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.appiumPort,
    ),
    reuseAppium: env.MINGLE_UI_QA_REUSE_APPIUM === '1',
    allowSimulator: false,
    runs: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.runs,
    gestureCount: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureCount,
    gestureDurationMs: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureDurationMs,
    gesturePauseMs: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gesturePauseMs,
    captureSettleMs: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.captureSettleMs,
    minCaptureDurationMs: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minCaptureDurationMs,
    minAverageFps: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minAverageFps,
    targetFps: DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.targetFps,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case '--ios-udid':
        options.iosUdid = next || '';
        index += 1;
        break;
      case '--appium-port':
        options.appiumPort = normalizePositiveInteger(next, options.appiumPort);
        index += 1;
        break;
      case '--reuse-appium':
        options.reuseAppium = true;
        break;
      case '--allow-simulator':
        options.allowSimulator = true;
        break;
      case '--runs':
        options.runs = normalizePositiveInteger(next, options.runs);
        index += 1;
        break;
      case '--gesture-count':
        options.gestureCount = normalizePositiveInteger(next, options.gestureCount);
        index += 1;
        break;
      case '--gesture-duration-ms':
        options.gestureDurationMs = normalizePositiveInteger(next, options.gestureDurationMs);
        index += 1;
        break;
      case '--gesture-pause-ms':
        options.gesturePauseMs = normalizePositiveInteger(next, options.gesturePauseMs);
        index += 1;
        break;
      case '--capture-settle-ms':
        options.captureSettleMs = normalizePositiveInteger(next, options.captureSettleMs);
        index += 1;
        break;
      case '--min-capture-duration-ms':
        options.minCaptureDurationMs = normalizePositiveInteger(next, options.minCaptureDurationMs);
        index += 1;
        break;
      case '--min-average-fps':
        options.minAverageFps = normalizePositiveNumber(next, options.minAverageFps);
        index += 1;
        break;
      case '--target-fps':
        options.targetFps = normalizePositiveNumber(next, options.targetFps);
        index += 1;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return {
    ...options,
    captureDurationMs: resolveCaptureDurationMs(options),
  };
}

export function summarizeFrameIntervals(frameTimestampsMs, options = {}) {
  const targetFps = normalizePositiveNumber(
    options.targetFps,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.targetFps,
  );
  const jankFrameThresholdMs = normalizePositiveNumber(
    options.jankFrameThresholdMs,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.jankFrameThresholdMs,
  );
  const longFrameThresholdMs = normalizePositiveNumber(
    options.longFrameThresholdMs,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.longFrameThresholdMs,
  );
  const timestamps = frameTimestampsMs
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const intervalsMs = [];

  for (let index = 1; index < timestamps.length; index += 1) {
    const intervalMs = timestamps[index] - timestamps[index - 1];
    if (Number.isFinite(intervalMs) && intervalMs >= 0) {
      intervalsMs.push(intervalMs);
    }
  }

  const sortedIntervals = [...intervalsMs].sort((a, b) => a - b);
  const sampleDurationMs = timestamps.length >= 2
    ? timestamps[timestamps.length - 1] - timestamps[0]
    : 0;
  const averageFps = sampleDurationMs > 0
    ? (intervalsMs.length * 1000) / sampleDurationMs
    : 0;
  const targetFrameMs = 1000 / targetFps;
  const jankFrames = intervalsMs.filter((intervalMs) => intervalMs > jankFrameThresholdMs).length;
  const longFrames = intervalsMs.filter((intervalMs) => intervalMs > longFrameThresholdMs).length;
  const estimatedDroppedFrames = intervalsMs.reduce((total, intervalMs) => {
    return total + Math.max(0, Math.round(intervalMs / targetFrameMs) - 1);
  }, 0);

  return {
    frameCount: timestamps.length,
    intervalCount: intervalsMs.length,
    sampleDurationMs: roundMetric(sampleDurationMs),
    averageFps: roundMetric(averageFps, 2),
    medianFrameMs: roundMetric(percentile(sortedIntervals, 0.5)),
    p95FrameMs: roundMetric(percentile(sortedIntervals, 0.95)),
    maxFrameMs: roundMetric(sortedIntervals[sortedIntervals.length - 1] ?? 0),
    jankFrames,
    longFrames,
    jankRatio: intervalsMs.length > 0 ? roundMetric(jankFrames / intervalsMs.length, 4) : 0,
    estimatedDroppedFrames,
  };
}

export function evaluateFpsRun(summary, options = {}) {
  const minAverageFps = normalizePositiveNumber(
    options.minAverageFps,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minAverageFps,
  );
  const minimumFrameIntervals = normalizePositiveInteger(
    options.minimumFrameIntervals,
    DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minimumFrameIntervals,
  );
  const checks = {
    averageFps: summary.averageFps >= minAverageFps,
    frameSamples: summary.intervalCount >= minimumFrameIntervals,
  };

  return {
    pass: Object.values(checks).every(Boolean),
    checks,
    budget: {
      minAverageFps,
      minimumFrameIntervals,
    },
  };
}

export function summarizeCaptureRuns(runs, options = {}) {
  const averageFpsValues = runs.map((run) => Number(run.metrics?.averageFps ?? 0));
  const sortedAverageFps = [...averageFpsValues].sort((a, b) => a - b);
  const maxJankRatio = runs.reduce((max, run) => Math.max(max, Number(run.metrics?.jankRatio ?? 0)), 0);
  const maxFrameMs = runs.reduce((max, run) => Math.max(max, Number(run.metrics?.maxFrameMs ?? 0)), 0);
  const totalEstimatedDroppedFrames = runs.reduce((total, run) => {
    return total + Number(run.metrics?.estimatedDroppedFrames ?? 0);
  }, 0);
  const failedRuns = runs.filter((run) => run.evaluation?.pass !== true).map((run) => run.runIndex);

  return {
    runCount: runs.length,
    pass: failedRuns.length === 0 && runs.length > 0,
    failedRuns,
    averageFpsMean: roundMetric(
      averageFpsValues.reduce((sum, value) => sum + value, 0) / Math.max(1, averageFpsValues.length),
      2,
    ),
    averageFpsMedian: roundMetric(percentile(sortedAverageFps, 0.5), 2),
    averageFpsMin: roundMetric(sortedAverageFps[0] ?? 0, 2),
    averageFpsMax: roundMetric(sortedAverageFps[sortedAverageFps.length - 1] ?? 0, 2),
    averageFpsStdDev: roundMetric(standardDeviation(averageFpsValues), 2),
    maxJankRatio: roundMetric(maxJankRatio, 4),
    maxFrameMs: roundMetric(maxFrameMs),
    totalEstimatedDroppedFrames,
    budget: {
      minAverageFps: normalizePositiveNumber(
        options.minAverageFps,
        DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.minAverageFps,
      ),
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function resolveTouchScrollGesturePlan(input) {
  const windowRect = input.nativeWindowRect || {};
  const scrollRect = input.scrollRect || {};
  const windowX = normalizeNumber(windowRect.x, 0);
  const windowY = normalizeNumber(windowRect.y, 0);
  const windowWidth = normalizePositiveNumber(windowRect.width, 390);
  const windowHeight = normalizePositiveNumber(windowRect.height, 844);
  const top = normalizeNumber(scrollRect.y, windowY);
  const left = normalizeNumber(scrollRect.x, windowX);
  const width = normalizePositiveNumber(scrollRect.width, windowWidth);
  const height = normalizePositiveNumber(scrollRect.height, windowHeight);
  const edgeInsetPx = 16;
  const minX = windowX + edgeInsetPx;
  const maxX = windowX + windowWidth - edgeInsetPx;
  const minY = windowY + edgeInsetPx;
  const maxY = windowY + windowHeight - edgeInsetPx;
  const x = Math.round(clamp(left + (width * 0.5), minX, maxX));
  const startY = Math.round(clamp(top + (height * 0.34), minY, maxY));
  const endY = Math.round(clamp(top + (height * 0.78), minY, maxY));

  return {
    pointerType: 'touch',
    gestureCount: normalizePositiveInteger(
      input.gestureCount,
      DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureCount,
    ),
    gestureDurationMs: normalizePositiveInteger(
      input.gestureDurationMs,
      DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gestureDurationMs,
    ),
    gesturePauseMs: normalizePositiveInteger(
      input.gesturePauseMs,
      DEFAULT_IOS_SCROLL_FPS_CAPTURE_OPTIONS.gesturePauseMs,
    ),
    x,
    startY,
    endY,
  };
}

export function isIphone12ClassViewport(windowRect) {
  const width = normalizePositiveNumber(windowRect?.width, 0);
  const height = normalizePositiveNumber(windowRect?.height, 0);
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);

  return shortEdge >= 390 && shortEdge <= 430 && longEdge >= 840 && longEdge <= 940;
}

export function buildMarkdownReport(report) {
  const lines = [
    '# iOS Live Demo Scroll FPS Capture',
    '',
    `- Timestamp: ${report.timestamp}`,
    `- Reference device: ${report.referenceDevice}`,
    `- Device: ${report.deviceLabel}`,
    `- 500-utterance scenario: ${report.utteranceCount === IOS_SCROLL_FPS_CAPTURE_UTTERANCE_COUNT ? 'loaded' : 'not loaded'}`,
    `- App scroll instrumentation: ${report.instrumentationOff ? 'off' : 'on'}`,
    `- Summary: ${report.summary.pass ? 'passed' : 'failed'}`,
    `- Average FPS: ${report.summary.averageFpsMean} mean, ${report.summary.averageFpsMedian} median, ${report.summary.averageFpsMin}-${report.summary.averageFpsMax} range`,
    `- Jank: max ratio ${report.summary.maxJankRatio}, max frame ${report.summary.maxFrameMs}ms, estimated dropped frames ${report.summary.totalEstimatedDroppedFrames}`,
    '',
    '## Runs',
    '',
  ];

  for (const run of report.runs) {
    lines.push(`### Run ${run.runIndex}`);
    lines.push('');
    lines.push(`- Status: ${run.evaluation.pass ? 'passed' : 'failed'}`);
    lines.push(`- Average FPS: ${run.metrics.averageFps}`);
    lines.push(`- Frame intervals: median ${run.metrics.medianFrameMs}ms, p95 ${run.metrics.p95FrameMs}ms, max ${run.metrics.maxFrameMs}ms`);
    lines.push(`- Jank frames: ${run.metrics.jankFrames}; long frames: ${run.metrics.longFrames}; estimated dropped frames: ${run.metrics.estimatedDroppedFrames}`);
    lines.push(`- Inner DOM scroll delta: ${run.scrollDeltaPx}px`);
    lines.push('');
  }

  lines.push('## Raw JSON');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
