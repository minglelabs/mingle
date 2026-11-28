/**
 * The face models for the selfie check (Human, MIT), served from this site;
 * nothing is fetched from elsewhere. Loading them and compiling the GPU
 * shaders takes 10 s or more on a phone the first time (11 to 13 s on a
 * Galaxy S9 and an iPhone 11 Pro), so the onboarding starts it early, while
 * the person is still answering (preloadSelfieModels), and the selfie screen
 * finds it ready instead of showing "Getting ready" (owner, 2026-11-25).
 */
type HumanModule = typeof import("@vladmandic/human");
export type HumanInstance = InstanceType<HumanModule["Human"]>;

const MODEL_PATH = "/models/human/";

let humanPromise: Promise<HumanInstance> | null = null;

export function loadHuman(): Promise<HumanInstance> {
  // Only ever reached through next/dynamic with ssr: false (selfie screen,
  // SelfiePreloader): for a server the package resolves to its Node build,
  // which needs @tensorflow/tfjs-node.
  humanPromise ??= import("@vladmandic/human").then(async ({ Human }) => {
    const human = new Human({
      modelBasePath: `${window.location.origin}${MODEL_PATH}`,
      backend: "webgl",
      // The first detection compiles the GPU shaders (11 to 13 s on a Galaxy S9
      // and an iPhone 11 Pro); warming up does it behind the "Getting ready" spinner.
      warmup: "face",
      cacheSensitivity: 0,
      debug: false,
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 2, minConfidence: 0.5, return: false },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        attention: { enabled: false },
        gear: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
      filter: { enabled: true, flip: false },
    });
    await human.load();
    await human.warmup();
    return human;
  }).catch((error) => {
    humanPromise = null;
    throw error;
  });
  return humanPromise;
}

/** Starts loading early; failures are left for the selfie screen to report. */
export function preloadSelfieModels(): void {
  if (typeof window === "undefined") return;
  void loadHuman().catch(() => undefined);
}
