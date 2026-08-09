import type { AdminDashboardDateRange, DeployMarker } from "@/lib/admin-dashboard-metrics";

const GITHUB_REPO_OWNER = "minglelabs";
const GITHUB_REPO_NAME = "mingle";
const GITHUB_DEFAULT_BRANCH = "main";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_HISTORY_PAGE_SIZE = 100;

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
 * is invisible in practice, and this keeps GitHub calls to 1/hour regardless of how
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

type GraphqlHistoryNode = {
  oid: string;
  message: string;
  committedDate: string;
};

type GraphqlHistoryConnection = {
  pageInfo: { hasNextPage: boolean };
  nodes: GraphqlHistoryNode[];
};

type GraphqlDeployMarkersResponse = {
  data?: {
    repository?: {
      ref?: {
        target?: Record<string, GraphqlHistoryConnection | null> | null;
      } | null;
    } | null;
  };
  errors?: { message: string }[];
};

/** One alias per watched path (`p0`, `p1`, ...), each running its own `history(path:
 * ...)` lookup -- GitHub has no "commits touching any of these paths" filter, but
 * GraphQL lets N of those lookups ride in a single HTTP request/response instead of
 * REST's one-request-per-path. Built once at module load since LATENCY_SENSITIVE_PATHS
 * is static. */
const DEPLOY_MARKERS_QUERY = `
  query DeployMarkers($owner: String!, $name: String!, $branch: String!, $since: GitTimestamp!, $until: GitTimestamp!, ${LATENCY_SENSITIVE_PATHS.map((_, i) => `$path${i}: String!`).join(", ")}) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $branch) {
        target {
          ... on Commit {
            ${LATENCY_SENSITIVE_PATHS.map(
              (_, i) =>
                `p${i}: history(since: $since, until: $until, first: ${GITHUB_HISTORY_PAGE_SIZE}, path: $path${i}) { pageInfo { hasNextPage } nodes { oid message committedDate } }`,
            ).join("\n            ")}
          }
        }
      }
    }
  }
`;

/**
 * Replaces the old N-REST-calls-per-refresh approach (one `GET .../commits?path=`
 * request per LATENCY_SENSITIVE_PATHS entry) with a single GraphQL request that
 * aliases a `history(path: ...)` lookup per path -- same data, 1/10th the rate-limit
 * cost and no fan-out latency. GitHub's GraphQL API has no unauthenticated tier at
 * all (unlike REST's 60/hr anonymous allowance), so this requires GITHUB_TOKEN;
 * loadCachedMarkers() below treats a missing token as a best-effort no-op, same as
 * any other failure to fetch.
 */
async function fetchLatencySensitiveMarkers(now: Date, githubToken: string): Promise<DeployMarker[]> {
  const since = new Date(now.getTime() - CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const variables: Record<string, string> = {
    owner: GITHUB_REPO_OWNER,
    name: GITHUB_REPO_NAME,
    branch: GITHUB_DEFAULT_BRANCH,
    since: since.toISOString(),
    until: now.toISOString(),
  };
  LATENCY_SENSITIVE_PATHS.forEach((path, i) => {
    variables[`path${i}`] = path;
  });

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${githubToken}`,
    },
    body: JSON.stringify({ query: DEPLOY_MARKERS_QUERY, variables }),
    cache: "no-store", // caching is handled explicitly below, at the merged-result level
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL commits fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as GraphqlDeployMarkersResponse;
  // GraphQL can return 200 with an `errors` array (e.g. a bad token, a field-level
  // failure) -- must not be read as "zero matching commits everywhere", same reasoning
  // as a failed REST call: throw so the caller falls back to the last known-good cache.
  if (body.errors?.length) {
    throw new Error(`GitHub GraphQL commits fetch returned errors: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  const target = body.data?.repository?.ref?.target;
  if (!target) {
    throw new Error("GitHub GraphQL commits fetch: repository/ref/target missing from response");
  }

  const commitsByPath: GithubCommit[][] = LATENCY_SENSITIVE_PATHS.map((path, i) => {
    const connection = target[`p${i}`];
    if (connection?.pageInfo.hasNextPage) {
      // Silently dropping the overflow would look identical to "this path just didn't
      // have more commits" -- surface it instead so a future maintainer notices before
      // markers start quietly going missing.
      console.warn(
        `[admin-dashboard-deploy-markers] path "${path}" has more than ${GITHUB_HISTORY_PAGE_SIZE} commits in the last ${CACHE_WINDOW_DAYS} days; older ones are omitted from deploy markers`,
      );
    }
    return (connection?.nodes ?? []).map((node) => ({
      sha: node.oid,
      commit: { message: node.message, author: { date: node.committedDate } },
    }));
  });

  return buildDeployMarkersFromCommits(commitsByPath);
}

/**
 * mingle-app runs as one long-lived Railway process (not per-request serverless
 * functions), so a plain module-level variable survives across requests for that
 * process's whole lifetime -- no DB table or external cache needed to avoid refetching
 * on every dashboard view.
 */
let cache: { fetchedAtMs: number; markers: DeployMarker[] } | null = null;
/** Collapses concurrent cache misses (e.g. two people opening the dashboard right as
 * the TTL expires) into a single GitHub request instead of one per caller. */
let inflight: Promise<DeployMarker[]> | null = null;
let hasWarnedMissingToken = false;

async function loadCachedMarkers(): Promise<DeployMarker[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.markers;
  }
  if (inflight) {
    return inflight;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    if (!hasWarnedMissingToken) {
      console.warn(
        "[admin-dashboard-deploy-markers] GITHUB_TOKEN is not set; deploy markers are disabled (GitHub's GraphQL API has no unauthenticated tier)",
      );
      hasWarnedMissingToken = true;
    }
    return cache?.markers ?? [];
  }

  inflight = fetchLatencySensitiveMarkers(new Date(now), githubToken)
    .then((markers) => {
      cache = { fetchedAtMs: now, markers };
      return markers;
    })
    .catch((error: unknown) => {
      // Best effort: a transient GitHub failure serves the last good cache instead of
      // dropping markers, and falls back to "none" only if nothing has ever succeeded.
      // Still logged -- swallowing it entirely would leave repeated failures invisible.
      console.error("[admin-dashboard-deploy-markers] failed to refresh deploy markers", error);
      return cache?.markers ?? [];
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function withinRange(date: string, range: AdminDashboardDateRange): boolean {
  const first = range.dayKeys[0];
  const last = range.dayKeys[range.dayKeys.length - 1];
  return date >= first && date <= last;
}

/**
 * Deploy markers, derived from main's commit history instead of a hand-maintained
 * list -- nobody has to remember to add a line here when they ship something. Best
 * effort: a missing token or any GitHub API failure (rate limit, network, repo access)
 * degrades to no markers rather than breaking the dashboard, since this is a
 * decorative annotation, not core dashboard data.
 */
export async function loadDeployMarkers(range: AdminDashboardDateRange): Promise<DeployMarker[]> {
  const markers = await loadCachedMarkers();
  return markers.filter((marker) => withinRange(marker.date, range));
}
