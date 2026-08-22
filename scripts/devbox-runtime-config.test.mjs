import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const devboxScriptPath = path.join(repoRoot, "scripts", "devbox.sh");

function runDevboxEval(shellBody) {
  const isolatedMainEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-runtime-main-env-"));
  const isolatedMainEnvPath = path.join(isolatedMainEnvDir, "empty.env");
  fs.writeFileSync(isolatedMainEnvPath, "", "utf8");

  return execFileSync(
    "/bin/bash",
    [
      "-lc",
      `set -euo pipefail
source "${devboxScriptPath}"
main_worktree_env_file() {
  printf '%s' ${JSON.stringify(isolatedMainEnvPath)}
}
${shellBody}
`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
      },
    },
  ).trim();
}

test("shared devbox settings prefer the main worktree over local derived files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-shared-setting-"));
  const mainEnvPath = path.join(tempDir, "main.env");
  const worktreeEnvPath = path.join(tempDir, "worktree.env");
  const devboxEnvPath = path.join(tempDir, "devbox.env");
  fs.writeFileSync(mainEnvPath, "DEVBOX_CLOUDFLARE_WEB_HOSTNAME=main.example.test\n", "utf8");
  fs.writeFileSync(worktreeEnvPath, "DEVBOX_CLOUDFLARE_WEB_HOSTNAME=stale-worktree.example.test\n", "utf8");
  fs.writeFileSync(devboxEnvPath, "DEVBOX_CLOUDFLARE_WEB_HOSTNAME=stale-derived.example.test\n", "utf8");

  const output = runDevboxEval(`
APP_ENV_FILE=${JSON.stringify(worktreeEnvPath)}
DEVBOX_ENV_FILE=${JSON.stringify(devboxEnvPath)}
DEVBOX_CLOUDFLARE_WEB_HOSTNAME=""
main_worktree_env_file() {
  case "$1" in
    app) printf '%s' ${JSON.stringify(mainEnvPath)} ;;
    stt) printf '%s' ${JSON.stringify(mainEnvPath)} ;;
    *) return 1 ;;
  esac
}
read_app_setting_value DEVBOX_CLOUDFLARE_WEB_HOSTNAME
`);

  assert.equal(output, "main.example.test");
});

test("prod devbox fallback keeps production AdMob identifiers when overrides are absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-runtime-config-"));
  const emptyEnvPath = path.join(tempDir, "empty.env");
  fs.writeFileSync(emptyEnvPath, "", "utf8");

  const output = runDevboxEval(`
APP_ENV_FILE="${emptyEnvPath}"
DEVBOX_VAULT_APP_PATH=""
DEVBOX_ACTIVE_DEVICE_APP_ENV="prod"
printf '%s\\n%s\\n%s\\n%s' \
  "$(resolve_devbox_admob_app_id_ios)" \
  "$(resolve_devbox_admob_app_id_android)" \
  "$(resolve_devbox_admob_banner_unit_id_ios)" \
  "$(resolve_devbox_admob_banner_unit_id_android)"
`);

  assert.deepEqual(output.split("\n"), [
    "ca-app-pub-7057041881494735~7844963551",
    "ca-app-pub-7057041881494735~1471126891",
    "ca-app-pub-7057041881494735/3768106846",
    "ca-app-pub-7057041881494735/6522262692",
  ]);
});

test("dev device app env always uses Google sample AdMob identifiers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-runtime-config-"));
  const prodLikeEnvPath = path.join(tempDir, "prod-like.env");
  fs.writeFileSync(
    prodLikeEnvPath,
    [
      "RN_ADMOB_APP_ID_IOS=ca-app-pub-7057041881494735~7844963551",
      "RN_ADMOB_APP_ID_ANDROID=ca-app-pub-7057041881494735~1471126891",
      "RN_ADMOB_BANNER_UNIT_ID_IOS=ca-app-pub-7057041881494735/3768106846",
      "RN_ADMOB_BANNER_UNIT_ID_ANDROID=ca-app-pub-7057041881494735/6522262692",
    ].join("\n"),
    "utf8",
  );

  const output = runDevboxEval(`
APP_ENV_FILE="${prodLikeEnvPath}"
DEVBOX_VAULT_APP_PATH=""
DEVBOX_ACTIVE_DEVICE_APP_ENV="dev"
printf '%s\\n%s\\n%s\\n%s' \
  "$(resolve_devbox_admob_app_id_ios)" \
  "$(resolve_devbox_admob_app_id_android)" \
  "$(resolve_devbox_admob_banner_unit_id_ios)" \
  "$(resolve_devbox_admob_banner_unit_id_android)"
`);

  assert.deepEqual(output.split("\n"), [
    "ca-app-pub-3940256099942544~1458002511",
    "ca-app-pub-3940256099942544~3347511713",
    "ca-app-pub-3940256099942544/2435281174",
    "ca-app-pub-3940256099942544/6300978111",
  ]);
});

test("iOS runtime xcconfig never writes an empty AdMob app id for prod installs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-ios-xcconfig-"));
  const emptyEnvPath = path.join(tempDir, "empty.env");
  const xcconfigPath = path.join(tempDir, "devbox.runtime.xcconfig");
  fs.writeFileSync(emptyEnvPath, "", "utf8");

  runDevboxEval(`
APP_ENV_FILE="${emptyEnvPath}"
DEVBOX_VAULT_APP_PATH=""
DEVBOX_ACTIVE_DEVICE_APP_ENV="prod"
DEVBOX_SITE_URL="https://example.com"
DEVBOX_RN_WS_URL="wss://example.com"
RN_IOS_RUNTIME_XCCONFIG="${xcconfigPath}"
write_rn_ios_runtime_xcconfig
`);

  const contents = fs.readFileSync(xcconfigPath, "utf8");
  assert.match(contents, /^RN_ADMOB_APP_ID_IOS = ca-app-pub-7057041881494735~7844963551$/m);
  assert.match(contents, /^NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_IOS = ca-app-pub-7057041881494735\/3768106846$/m);
});

test("iOS runtime xcconfig escapes URL scheme separators without quoting values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-ios-xcconfig-"));
  const emptyEnvPath = path.join(tempDir, "empty.env");
  const xcconfigPath = path.join(tempDir, "devbox.runtime.xcconfig");
  fs.writeFileSync(emptyEnvPath, "", "utf8");

  runDevboxEval(`
APP_ENV_FILE="${emptyEnvPath}"
DEVBOX_VAULT_APP_PATH=""
DEVBOX_ACTIVE_DEVICE_APP_ENV="prod"
DEVBOX_SITE_URL="https://example.com"
DEVBOX_RN_WS_URL="wss://example.com/socket"
RN_IOS_RUNTIME_XCCONFIG="${xcconfigPath}"
write_rn_ios_runtime_xcconfig
`);

  const contents = fs.readFileSync(xcconfigPath, "utf8");
  assert.match(contents, /^NEXT_PUBLIC_SITE_URL = https:\/\$\(\)\/example\.com$/m);
  assert.match(contents, /^NEXT_PUBLIC_WS_URL = wss:\/\$\(\)\/example\.com\/socket$/m);
  assert.doesNotMatch(contents, /^NEXT_PUBLIC_SITE_URL = "https:\/\//m);
  assert.doesNotMatch(contents, /^NEXT_PUBLIC_WS_URL = "wss:\/\//m);
});

test("mobile ads app.json generation fails fast when either AdMob app id is empty", () => {
  assert.throws(
    () =>
      runDevboxEval(`
RN_APP_JSON_FILE="$(mktemp)"
write_rn_mobile_ads_app_json "" "ca-app-pub-7057041881494735~7844963551"
`),
    /resolved empty RN_ADMOB_APP_ID_ANDROID for devbox runtime/,
  );
});

test("devbox .env formatting keeps AdMob app ids unquoted", () => {
  const output = runDevboxEval(`
printf '%s\\n%s' \
  "$(format_env_value_for_dotenv 'ca-app-pub-7057041881494735~7844963551')" \
  "$(format_env_value_for_dotenv 'ca-app-pub-7057041881494735~1471126891')"
`);

  assert.deepEqual(output.split("\n"), [
    "ca-app-pub-7057041881494735~7844963551",
    "ca-app-pub-7057041881494735~1471126891",
  ]);
});
