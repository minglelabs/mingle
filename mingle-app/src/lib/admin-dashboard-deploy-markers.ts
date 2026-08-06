import type { AdminDashboardDateRange, DeployMarker } from "@/lib/admin-dashboard-metrics";

const GITHUB_REPO_OWNER = "minglelabs";
const GITHUB_REPO_NAME = "mingle";

/**
 * Paths whose commits can actually shift the STT/번역 지연시간 charts -- verified
 * against the code that produces sttDurationMs/totalDurationMs (client-side timers in
 * use-realtime-stt*.ts, the translation engine in translate-finalize-handler.ts, the
 * STT server itself, and the shared Railway deploy). Every merge to main would drown
 * the handful of real latency-affecting deploys in noise, so this list is deliberately
 * narrow -- widen it only when a genuinely latency-relevant path is found missing.
 */
const LATENCY_SENSITIVE_PATHS = [
  "mingle-stt",
  "mingle-app/src/components/LivePhoneDemo/use-realtime-stt.ts",
  "mingle-app/src/components/LivePhoneDemo/use-realtime-stt-legacy.ts",
  "mingle-app/src/components/LivePhoneDemo/useRealtimeSTT.ts",
  "mingle-app/src/server/api/handlers/v1/translate-finalize-handler.ts",
  "mingle-app/src/server/api/handlers/v1/log-client-event-handler.ts",
  "mingle-app/src/lib/translation-models.ts",
  "mingle-app/src/app/api/translate/finalize",
  "railway.json",
  "Dockerfile.railway",
  "railway",
] as const;

/** Widest dayrange the dashboard's range picker offers (7/30/90) plus headroom, so one
 * fetch window covers every range option -- switching 7d/30d/90d never triggers a
 * refetch, it just re-filters the same in-memory list. */
const CACHE_WINDOW_DAYS = 100;
/** Deploy markers are a historical annotation, not live data -- an hour of staleness
 * is invisible in practice, and this keeps GitHub calls to ~9/hour regardless of how
 * many times the dashboard is viewed or which range is selected. */
const CACHE_TTL_MS = 60 * 60 * 1000;

export type GithubCommit = {
  sha: string;
  commit: {
    message: string;
    author: { date: string } | null;
  };
};

function firstLine(message: string): string {
  return message.split("\n")[0].trim();
}

/** "Merge pull request #N from ..." / "Merge remote-tracking branch ..." says nothing
 * about what actually shipped -- when a day has more than one matching commit, prefer
 * whichever one has a real description. */
function isGenericMergeMessage(message: string): boolean {
  return /^Merge (pull request #\d+|remote-tracking branch|branch )/i.test(message.trim());
}

/** Pure merge step, split out from the fetch orchestration below so it's unit-testable
 * without a live network call (see admin-dashboard-deploy-markers.test.ts). */
export function buildDeployMarkersFromCommits(commitsByPath: readonly GithubCommit[][]): DeployMarker[] {
  const commitsByDate = new Map<string, GithubCommit[]>();
  for (const commits of commitsByPath) {
    for (const commit of commits) {
      const authorDate = commit.commit.author?.date;
      if (!authorDate) continue;
      const date = authorDate.slice(0, 10);
      const existing = commitsByDate.get(date);
      if (existing) existing.push(commit);
      else commitsByDate.set(date, [commit]);
    }
  }

  const markers: DeployMarker[] = [];
  for (const [date, commits] of commitsByDate) {
    const best = commits.find((commit) => !isGenericMergeMessage(commit.commit.message)) ?? commits[0];
    markers.push({ date, label: firstLine(best.commit.message) });
  }
  return markers.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchCommitsTouchingPath(path: string, since: Date, until: Date): Promise<GithubCommit[]> {
  const url = new URL(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/commits`);
  url.searchParams.set("sha", "main");
  url.searchParams.set("path", path);
  url.searchParams.set("since", since.toISOString());
  url.searchParams.set("until", until.toISOString());
  url.searchParams.set("per_page", "100"); // GitHub's max page size; avoids silently truncating a busy path's history

  const githubToken = process.env.GITHUB_TOKEN;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
    },
    cache: "no-store", // caching is handled explicitly below, at the merged-result level
  });
  // A failed path fetch (rate limit, network blip) must not be read as "this path had
  // zero matching commits" -- that silently produced an undercounted-but-plausible-
  // looking result that then got cached as if it were correct for a whole hour. Throw
  // so the caller's try/catch falls back to the last known-good cache instead.
  if (!response.ok) {
    throw new Error(`GitHub commits fetch failed for path "${path}": ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GithubCommit[];
}

async function fetchLatencySensitiveMarkers(now: Date): Promise<DeployMarker[]> {
  const since = new Date(now.getTime() - CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const commitsByPath = await Promise.all(
    LATENCY_SENSITIVE_PATHS.map((path) => fetchCommitsTouchingPath(path, since, now)),
  );
  return buildDeployMarkersFromCommits(commitsByPath);
}

/**
 * mingle-app runs as one long-lived Railway process (not per-request serverless
 * functions), so a plain module-level variable survives across requests for that
 * process's whole lifetime -- no DB table or external cache needed to avoid refetching
 * on every dashboard view.
 */
let cache: { fetchedAtMs: number; markers: DeployMarker[] } | null = null;

async function loadCachedMarkers(): Promise<DeployMarker[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.markers;
  }
  try {
    const markers = await fetchLatencySensitiveMarkers(new Date(now));
    cache = { fetchedAtMs: now, markers };
    return markers;
  } catch {
    // Best effort: a transient GitHub failure serves the last good cache instead of
    // dropping markers, and falls back to "none" only if nothing has ever succeeded.
    return cache?.markers ?? [];
  }
}

export function withinRange(date: string, range: AdminDashboardDateRange): boolean {
  const first = range.dayKeys[0];
  const last = range.dayKeys[range.dayKeys.length - 1];
  return date >= first && date <= last;
}

/**
 * Deploy markers, derived from main's commit history instead of a hand-maintained
 * list -- nobody has to remember to add a line here when they ship something. Best
 * effort: any GitHub API failure (rate limit, network, repo access) degrades to no
 * markers rather than breaking the dashboard, since this is a decorative annotation,
 * not core dashboard data.
 */
export async function loadDeployMarkers(range: AdminDashboardDateRange): Promise<DeployMarker[]> {
  const markers = await loadCachedMarkers();
  return markers.filter((marker) => withinRange(marker.date, range));
}
