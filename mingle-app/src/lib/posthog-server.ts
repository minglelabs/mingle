import { PostHog } from "posthog-node";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

type PostHogProperty = string | number | boolean | null;

let postHogClient: PostHog | null | undefined;

function resolvePostHogHost(): string {
  const configuredHost = process.env.POSTHOG_HOST?.trim();
  if (!configuredHost) return DEFAULT_POSTHOG_HOST;
  return configuredHost.replace(/\/+$/, "");
}

function getPostHogClient(): PostHog | null {
  if (postHogClient !== undefined) return postHogClient;

  const token = process.env.POSTHOG_TOKEN?.trim();
  if (!token) {
    postHogClient = null;
    return postHogClient;
  }

  postHogClient = new PostHog(token, {
    host: resolvePostHogHost(),
    flushAt: 20,
    flushInterval: 10_000,
    disableGeoip: true,
  });
  return postHogClient;
}

export function captureMingleEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, PostHogProperty | undefined>;
}): void {
  const distinctId = args.distinctId.trim();
  const event = args.event.trim();
  if (!distinctId || !event) return;

  const client = getPostHogClient();
  if (!client) return;

  const properties = Object.fromEntries(
    Object.entries(args.properties ?? {}).filter(([, value]) => value !== undefined),
  );

  try {
    client.capture({
      distinctId,
      event,
      properties,
    });
  } catch (error) {
    // Analytics must never make an app request fail. Keep diagnostics bounded and
    // do not print the token, distinct ID, or event properties.
    console.warn("[posthog] event capture failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

