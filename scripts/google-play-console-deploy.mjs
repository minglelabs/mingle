#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_CREDENTIALS_ROOT = path.join(REPO_ROOT, ".credentials");
const DEFAULT_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = path.join(
  DEFAULT_CREDENTIALS_ROOT,
  "google-play/service-account.json",
);
const DEFAULT_ANDROID_CREDENTIALS_DIR = path.join(
  DEFAULT_CREDENTIALS_ROOT,
  "android",
);
const DEFAULT_CONFIG_JSON = path.join(
  REPO_ROOT,
  "mingle-app/rn/google-play-console-info/google-play-console-info.i18n.json",
);
const DEFAULT_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const ANDROID_PUBLISHER_UPLOAD_BASE =
  "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const DEFAULT_ANDROID_DIR = path.join(REPO_ROOT, "mingle-app/rn/android");
const DEFAULT_AAB_PATH = path.join(
  DEFAULT_ANDROID_DIR,
  "app/build/outputs/bundle/release/app-release.aab",
);
const DEFAULT_SYNC_SCRIPT = path.join(REPO_ROOT, "scripts/google-play-console-sync.mjs");
const LEGACY_PRODUCTION_WEB_APP_BASE_URL = "https://mingle-app-xi.vercel.app";
const LEGACY_PRODUCTION_WS_URL = "wss://mingle-stt.fly.dev";
const RAILWAY_WEB_APP_BASE_URL = "https://mingle-1-1-4-production.up.railway.app";
const RAILWAY_WS_URL = "wss://mingle-1-1-4-production.up.railway.app/stt";

function printUsage() {
  console.log(`Usage: scripts/google-play-console-deploy.mjs [options]

Options:
  --json <path>                  Play metadata JSON path
  --service-account-json <path>  Google service account JSON file path
  --package-name <name>          Override Android package name
  --aab <path>                   Explicit AAB path (default: app/build/outputs/bundle/release/app-release.aab)
  --existing-version-code <n>    Reuse an already uploaded versionCode without uploading a new AAB
  --track <name>                 Release track (default: googlePlay.release.defaultTrack or internal)
  --release-status <status>      Release status: draft|completed|inProgress|halted
  --release-name <name>          Override release name
  --user-fraction <0-1>          Required for inProgress staged rollout releases
  --build                        Run ./gradlew bundleRelease before uploading
  --skip-sync-metadata           Skip store listing/icon/screenshot sync before upload
  --validate-only                Validate the edit without committing it
  --dry-run                      Print the upload plan without calling Google APIs
  --changes-not-sent-for-review  Commit with changesNotSentForReview=true
  --no-changes-not-sent-for-review
  -h, --help                     Show help

Environment:
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH  Path to a Google service account JSON file
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON       Raw service account JSON payload

Notes:
  - Google Play only allows the Publishing API for apps that already exist and have had at least one APK uploaded through Play Console once.
  - Play App Signing still needs a local upload key. Configure it through .credentials/android/keystore.properties or ANDROID_UPLOAD_* env vars before using --build.
  - If present, ${DEFAULT_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON} is used automatically.
`);
}

function parseArgs(argv) {
  const options = {
    configJson: DEFAULT_CONFIG_JSON,
    serviceAccountJsonPath: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH
      ?? (fs.existsSync(DEFAULT_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
        ? DEFAULT_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
        : ""),
    packageName: "",
    aabPath: DEFAULT_AAB_PATH,
    existingVersionCode: "",
    track: "",
    releaseStatus: "",
    releaseName: "",
    userFraction: "",
    build: false,
    skipSyncMetadata: false,
    validateOnly: false,
    dryRun: false,
    changesNotSentForReview: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--json":
        options.configJson = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--service-account-json":
        options.serviceAccountJsonPath = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--package-name":
        options.packageName = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--aab":
        options.aabPath = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--existing-version-code":
        options.existingVersionCode = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--track":
        options.track = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--release-status":
        options.releaseStatus = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--release-name":
        options.releaseName = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--user-fraction":
        options.userFraction = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--build":
        options.build = true;
        break;
      case "--skip-sync-metadata":
        options.skipSyncMetadata = true;
        break;
      case "--validate-only":
        options.validateOnly = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--changes-not-sent-for-review":
        options.changesNotSentForReview = true;
        break;
      case "--no-changes-not-sent-for-review":
        options.changesNotSentForReview = false;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseSemver3(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(
    typeof value === "string" ? value.trim() : "",
  );
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function isReleaseAtLeast(value, minimum) {
  const parsed = parseSemver3(value);
  if (!parsed) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (parsed[index] > minimum[index]) return true;
    if (parsed[index] < minimum[index]) return false;
  }
  return true;
}

function resolveDefaultReleaseRuntimeUrls(plan) {
  if (isReleaseAtLeast(plan.releaseVersion, [1, 1, 2])) {
    return {
      siteUrl: RAILWAY_WEB_APP_BASE_URL,
      wsUrl: RAILWAY_WS_URL,
    };
  }

  return {
    siteUrl: LEGACY_PRODUCTION_WEB_APP_BASE_URL,
    wsUrl: LEGACY_PRODUCTION_WS_URL,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function resolveWorkspacePath(workspaceRoot, maybeRelativePath) {
  if (!isNonEmptyString(maybeRelativePath)) {
    return "";
  }

  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.join(workspaceRoot, maybeRelativePath);
}

function readPropertiesFile(filePath) {
  const properties = {};
  if (!fs.existsSync(filePath)) {
    return properties;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      continue;
    }

    const separatorIndex = trimmed.search(/[:=]/);
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    properties[key] = value;
  }

  return properties;
}

function readSigningConfig(androidDir) {
  const properties = readPropertiesFile(
    path.join(DEFAULT_ANDROID_CREDENTIALS_DIR, "keystore.properties"),
  );
  const legacyProperties = readPropertiesFile(path.join(androidDir, "keystore.properties"));
  const readValue = (envKey, propertyKey) => {
    const envValue = process.env[envKey];
    if (isNonEmptyString(envValue)) {
      return envValue.trim();
    }

    const propertyValue = properties[propertyKey];
    if (isNonEmptyString(propertyValue)) {
      return propertyValue.trim();
    }

    const legacyPropertyValue = legacyProperties[propertyKey];
    return isNonEmptyString(legacyPropertyValue) ? legacyPropertyValue.trim() : "";
  };

  const defaultStoreFile = path.join(DEFAULT_ANDROID_CREDENTIALS_DIR, "mingle-upload.keystore");
  return {
    storeFile: readValue("ANDROID_UPLOAD_STORE_FILE", "storeFile")
      || (fs.existsSync(defaultStoreFile) ? defaultStoreFile : ""),
    storePassword: readValue("ANDROID_UPLOAD_STORE_PASSWORD", "storePassword"),
    keyAlias: readValue("ANDROID_UPLOAD_KEY_ALIAS", "keyAlias"),
    keyPassword: readValue("ANDROID_UPLOAD_KEY_PASSWORD", "keyPassword"),
  };
}

function assertUploadSigningConfigured(androidDir) {
  const signing = readSigningConfig(androidDir);
  const missing = Object.entries(signing)
    .filter(([, value]) => !isNonEmptyString(value))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing Play upload signing config: ${missing.join(", ")}. Configure .credentials/android/keystore.properties or ANDROID_UPLOAD_* env vars.`,
    );
  }
}

function loadServiceAccount(options) {
  if (isNonEmptyString(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)) {
    return JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  }

  if (!isNonEmptyString(options.serviceAccountJsonPath)) {
    throw new Error(
      "Missing service account JSON. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH or pass --service-account-json.",
    );
  }

  return readJson(options.serviceAccountJsonPath);
}

async function getAccessToken(serviceAccount) {
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: DEFAULT_SCOPE,
    aud: tokenUri,
    exp: expiresAt,
    iat: issuedAt,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to acquire Google OAuth token (${response.status}): ${body}`);
  }

  const payloadJson = await response.json();
  if (!isNonEmptyString(payloadJson.access_token)) {
    throw new Error("Google OAuth response did not contain an access token.");
  }

  return payloadJson.access_token;
}

async function googleApiRequest(accessToken, method, url, body, extraHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
  const init = { method, headers };

  if (body !== undefined) {
    init.body = body;
  }

  const response = await fetch(url, init);
  const responseText = await response.text();
  const isJson =
    response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
  const payload = isJson && responseText ? JSON.parse(responseText) : responseText;

  if (!response.ok) {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    throw new Error(`${method} ${url} failed (${response.status}): ${message}`);
  }

  return payload;
}

function buildReleasePlan(config, workspaceRoot, options) {
  const googlePlay = config.googlePlay ?? {};
  const appDetails = googlePlay.appDetails ?? {};
  const release = googlePlay.release ?? {};
  const packageName = options.packageName || appDetails.packageName || "";
  const aabPath = path.resolve(options.aabPath || DEFAULT_AAB_PATH);
  const track = options.track || release.defaultTrack || "internal";
  const releaseStatus =
    options.releaseStatus || release.defaultReleaseStatus || "draft";
  const releaseName = options.releaseName || release.releaseName || "";
  const releaseVersion =
    typeof release.version === "string" ? release.version.trim() : "";
  const changesNotSentForReview =
    options.changesNotSentForReview ?? Boolean(release.changesNotSentForReview);
  const releaseNotesSource =
    release.releaseNotes && typeof release.releaseNotes === "object"
      ? release.releaseNotes
      : {};
  const releaseNotes = Object.entries(releaseNotesSource)
    .filter(([, value]) => isNonEmptyString(value))
    .map(([language, text]) => ({ language, text: text.trim() }));

  const plan = {
    workspaceRoot,
    packageName,
    aabPath,
    track,
    releaseStatus,
    releaseName,
    releaseVersion,
    runtimeApiNamespace: releaseVersion ? `android/v${releaseVersion}` : "android/v1.1.0",
    changesNotSentForReview,
    releaseNotes,
    userFraction: options.userFraction,
  };

  if (!isNonEmptyString(plan.packageName)) {
    throw new Error("googlePlay.appDetails.packageName is missing.");
  }

  if (!["draft", "completed", "inProgress", "halted"].includes(plan.releaseStatus)) {
    throw new Error(`Invalid release status: ${plan.releaseStatus}`);
  }

  if (plan.releaseStatus === "inProgress") {
    const parsed = Number(plan.userFraction);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
      throw new Error("inProgress releases require --user-fraction with a value between 0 and 1.");
    }
  }

  if (
    !options.build
    && !isNonEmptyString(options.existingVersionCode)
    && !fs.existsSync(plan.aabPath)
  ) {
    throw new Error(`AAB does not exist: ${plan.aabPath}`);
  }

  return plan;
}

function printPlan(plan, options) {
  console.log(`Package name: ${plan.packageName}`);
  console.log(`AAB path: ${plan.aabPath}`);
  console.log(`Track: ${plan.track}`);
  if (isNonEmptyString(options.existingVersionCode)) {
    console.log(`Existing versionCode: ${options.existingVersionCode}`);
  }
  console.log(`Release status: ${plan.releaseStatus}`);
  console.log(`Release name: ${isNonEmptyString(plan.releaseName) ? plan.releaseName : "(none)"}`);
  console.log(`Release notes: ${plan.releaseNotes.length}`);
  console.log(`Sync metadata first: ${options.skipSyncMetadata ? "no" : "yes"}`);
  console.log(`Mode: ${options.validateOnly ? "validate edit" : "commit edit"}`);
  console.log(
    `changesNotSentForReview: ${plan.changesNotSentForReview ? "true" : "false"}`,
  );
}

function runMetadataSync(configJsonPath, options) {
  const args = [DEFAULT_SYNC_SCRIPT, "--json", configJsonPath];
  if (isNonEmptyString(options.serviceAccountJsonPath)) {
    args.push("--service-account-json", options.serviceAccountJsonPath);
  }
  if (isNonEmptyString(options.packageName)) {
    args.push("--package-name", options.packageName);
  }
  if (options.changesNotSentForReview) {
    args.push("--changes-not-sent-for-review");
  } else {
    args.push("--no-changes-not-sent-for-review");
  }

  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Metadata sync failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function buildReleaseAab(plan) {
  const defaultRuntimeUrls = resolveDefaultReleaseRuntimeUrls(plan);
  const buildEnv = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || defaultRuntimeUrls.siteUrl,
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL?.trim() || defaultRuntimeUrls.wsUrl,
    MINGLE_API_FALLBACK_SITE_URL:
      process.env.MINGLE_API_FALLBACK_SITE_URL?.trim() || LEGACY_PRODUCTION_WEB_APP_BASE_URL,
    MINGLE_STT_FALLBACK_WS_URL:
      process.env.MINGLE_STT_FALLBACK_WS_URL?.trim() || LEGACY_PRODUCTION_WS_URL,
    MINGLE_LEGACY_SITE_URL:
      process.env.MINGLE_LEGACY_SITE_URL?.trim()
      || process.env.MINGLE_API_FALLBACK_SITE_URL?.trim()
      || LEGACY_PRODUCTION_WEB_APP_BASE_URL,
    MINGLE_LEGACY_WS_URL:
      process.env.MINGLE_LEGACY_WS_URL?.trim()
      || process.env.MINGLE_STT_FALLBACK_WS_URL?.trim()
      || LEGACY_PRODUCTION_WS_URL,
    NEXT_PUBLIC_API_NAMESPACE: plan.runtimeApiNamespace,
    RN_API_NAMESPACE: plan.runtimeApiNamespace,
  };
  const result = spawnSync("./gradlew", ["bundleRelease"], {
    cwd: DEFAULT_ANDROID_DIR,
    stdio: "inherit",
    env: buildEnv,
  });

  if (result.status !== 0) {
    throw new Error(`bundleRelease failed with exit code ${result.status ?? "unknown"}.`);
  }

  if (!fs.existsSync(plan.aabPath)) {
    throw new Error(`Expected AAB was not produced: ${plan.aabPath}`);
  }
}

async function createEdit(accessToken, packageName) {
  const payload = await googleApiRequest(
    accessToken,
    "POST",
    `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/edits`,
    "{}",
    {
      "Content-Type": "application/json",
    },
  );

  if (!isNonEmptyString(payload.id)) {
    throw new Error("Google Play edit creation did not return an edit id.");
  }

  return payload.id;
}

async function uploadBundle(accessToken, packageName, editId, aabPath) {
  const data = fs.readFileSync(aabPath);
  const payload = await googleApiRequest(
    accessToken,
    "POST",
    `${ANDROID_PUBLISHER_UPLOAD_BASE}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/bundles?uploadType=media`,
    data,
    {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.byteLength),
    },
  );

  if (!payload.versionCode) {
    throw new Error("Bundle upload succeeded but no versionCode was returned.");
  }

  return String(payload.versionCode);
}

async function updateTrack(accessToken, packageName, editId, plan, versionCode) {
  const release = {
    versionCodes: [versionCode],
    status: plan.releaseStatus,
  };

  if (isNonEmptyString(plan.releaseName)) {
    release.name = plan.releaseName;
  }

  if (plan.releaseNotes.length > 0) {
    release.releaseNotes = plan.releaseNotes;
  }

  if (plan.releaseStatus === "inProgress") {
    release.userFraction = Number(plan.userFraction);
  }

  await googleApiRequest(
    accessToken,
    "PUT",
    `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(plan.track)}`,
    JSON.stringify({
      track: plan.track,
      releases: [release],
    }),
    {
      "Content-Type": "application/json",
    },
  );
}

async function finalizeEdit(accessToken, packageName, editId, options, plan) {
  if (options.validateOnly) {
    await googleApiRequest(
      accessToken,
      "POST",
      `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}:validate`,
      "",
    );
    return;
  }

  const commitUrl = new URL(
    `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}:commit`,
  );
  if (plan.changesNotSentForReview) {
    commitUrl.searchParams.set("changesNotSentForReview", "true");
  }

  await googleApiRequest(accessToken, "POST", commitUrl.toString(), "");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const configJsonPath = path.resolve(options.configJson);
  const workspaceRoot = path.dirname(configJsonPath);
  const config = readJson(configJsonPath);
  const plan = buildReleasePlan(config, workspaceRoot, options);

  if (options.build) {
    assertUploadSigningConfigured(DEFAULT_ANDROID_DIR);
  }

  printPlan(plan, options);

  if (options.dryRun) {
    return;
  }

  const serviceAccount = loadServiceAccount(options);
  if (!options.skipSyncMetadata) {
    runMetadataSync(configJsonPath, options);
  }

  if (options.build) {
    buildReleaseAab(plan);
  }

  const accessToken = await getAccessToken(serviceAccount);
  const editId = await createEdit(accessToken, plan.packageName);

  try {
    const versionCode = isNonEmptyString(options.existingVersionCode)
      ? options.existingVersionCode.trim()
      : await uploadBundle(accessToken, plan.packageName, editId, plan.aabPath);
    if (isNonEmptyString(options.existingVersionCode)) {
      console.log(`[ok] Reusing existing versionCode=${versionCode}`);
    } else {
      console.log(`[ok] Uploaded AAB versionCode=${versionCode}`);
    }
    await updateTrack(accessToken, plan.packageName, editId, plan, versionCode);
    console.log(`[ok] Updated track: ${plan.track}`);
    await finalizeEdit(accessToken, plan.packageName, editId, options, plan);
    console.log(options.validateOnly ? "[ok] Validated edit" : "[ok] Committed edit");
  } catch (error) {
    await googleApiRequest(
      accessToken,
      "DELETE",
      `${ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(plan.packageName)}/edits/${encodeURIComponent(editId)}`,
    ).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
