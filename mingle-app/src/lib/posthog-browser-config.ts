const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type PostHogBrowserConfig = {
  projectToken: string;
  host: string;
};

function normalizeHost(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) return DEFAULT_POSTHOG_HOST;

  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:"
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !isLocalHttp) return DEFAULT_POSTHOG_HOST;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_POSTHOG_HOST;
  }
}

function isCloudProjectToken(value: string): boolean {
  return /^phc_[A-Za-z0-9_-]{8,}$/.test(value);
}

/**
 * Resolve the browser-safe PostHog project token at request time.
 *
 * `POSTHOG_PUBLIC_TOKEN` is an explicit override for self-hosted project tokens.
 * The server `POSTHOG_TOKEN` is reused only when it has PostHog Cloud's public
 * project-token prefix, which prevents accidentally serializing a personal API key.
 */
export function resolvePostHogBrowserConfig(
  env: Record<string, string | undefined> = process.env,
): PostHogBrowserConfig | null {
  const explicitPublicToken = env.POSTHOG_PUBLIC_TOKEN?.trim();
  const serverToken = env.POSTHOG_TOKEN?.trim();
  const projectToken = explicitPublicToken
    || (serverToken && isCloudProjectToken(serverToken) ? serverToken : "");

  if (!projectToken) return null;

  return {
    projectToken,
    host: normalizeHost(env.POSTHOG_HOST),
  };
}
