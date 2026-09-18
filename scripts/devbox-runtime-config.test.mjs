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

const iosInstallCases = [0, 1].flatMap(cleanInstall =>
  [false, true].flatMap(explicitTarget =>
    [false, true].map(hasCoreDeviceMapping => ({ cleanInstall, explicitTarget, hasCoreDeviceMapping })),
  ),
);
for (const { cleanInstall, explicitTarget, hasCoreDeviceMapping } of iosInstallCases) {
  test(`iOS install uses one selected phone (clean=${cleanInstall}, explicit=${explicitTarget}, mapping=${hasCoreDeviceMapping})`, () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-ios-target-"));
    const callsPath = path.join(tempDir, "calls.log");
    fs.mkdirSync(path.join(tempDir, "mingle-app/rn/ios/mingle.xcworkspace"), { recursive: true });
    runDevboxEval(`
ROOT_DIR=${JSON.stringify(tempDir)}
RN_APP_JSON_FILE="$ROOT_DIR/app.json"
RN_IOS_RUNTIME_XCCONFIG="$ROOT_DIR/runtime.xcconfig"
DEVBOX_WORKTREE_NAME="target-test"
IOS_RN_REQUIRED_API_NAMESPACE="ios/v2.0.2"
require_cmd() { :; }
ensure_rn_workspace_dependencies() { :; }
ensure_ios_pods_if_needed() { :; }
write_rn_ios_runtime_xcconfig() { :; }
write_rn_mobile_ads_app_json() { :; }
resolve_devbox_admob_app_id_ios() { printf 'test-ios'; }
resolve_devbox_admob_app_id_android() { printf 'test-android'; }
resolve_devbox_qa_bridge_enabled() { printf '0'; }
resolve_ios_bundle_id() { printf 'com.example.test'; }
detect_ios_coredevice_id() {
  if [[ "\${1:-}" != "00008030-000D45822298802E" ]]; then
    printf 'WRONG-FIRST-CONNECTED-PHONE'
  elif [[ ${hasCoreDeviceMapping ? 1 : 0} -eq 1 ]]; then
    printf 'MATCHED-COREDEVICE-ID'
  fi
}
detect_ios_xcode_destination_udid() { printf '${explicitTarget ? "WRONG-AUTO-DETECTED-PHONE" : "00008030-000D45822298802E"}'; }
xcodebuild() {
  printf 'build %s\\n' "$*" >> ${JSON.stringify(callsPath)}
  mkdir -p "$ROOT_DIR/.devbox-cache/ios/$DEVBOX_WORKTREE_NAME/Build/Products/Release-iphoneos/mingle.app"
}
xcrun() { printf 'device %s\\n' "$*" >> ${JSON.stringify(callsPath)}; }
run_ios_mobile_install "${explicitTarget ? "00008030-000D45822298802E" : ""}" "Release" "${cleanInstall}"
`);
    const calls = fs.readFileSync(callsPath, "utf8");
    const destination = explicitTarget ? "generic/platform=iOS" : "id=00008030-000D45822298802E";
    const deviceId = hasCoreDeviceMapping ? "MATCHED-COREDEVICE-ID" : "00008030-000D45822298802E";
    assert.ok(calls.includes(`-destination ${destination}`));
    assert.ok(calls.includes(`device info details --device ${deviceId}`));
    assert.ok(calls.includes(`device install app --device ${deviceId}`));
    assert.ok(calls.includes(`device process launch --device ${deviceId}`));
    if (cleanInstall) assert.ok(calls.includes(`device uninstall app --device ${deviceId}`));
    else assert.doesNotMatch(calls, /device uninstall app/);
    assert.doesNotMatch(calls, /WRONG-/);
  });
}

test("iOS install stops before building or uninstalling when the chosen phone is unreachable", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-ios-unreachable-"));
  const callsPath = path.join(tempDir, "calls.log");
  assert.throws(() => runDevboxEval(`
detect_ios_coredevice_id() { :; }
detect_ios_xcode_destination_udid() { printf 'WRONG-AUTO-DETECTED-PHONE'; }
xcodebuild() { printf 'UNEXPECTED-BUILD\\n' >> ${JSON.stringify(callsPath)}; }
xcrun() {
  printf 'device %s\\n' "$*" >> ${JSON.stringify(callsPath)}
  return 1
}
run_ios_mobile_install "00008030-000D45822298802E" "Release" "1"
`), /selected iOS device is not reachable/);
  assert.equal(
    fs.readFileSync(callsPath, "utf8").trim(),
    "device devicectl device info details --device 00008030-000D45822298802E",
  );
});

test("CoreDevice lookup resolves the requested UDID despite stale tunnel state and never another phone", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-ios-device-list-"));
  const devicesPath = path.join(tempDir, "devices.json");
  fs.writeFileSync(devicesPath, JSON.stringify({ result: { devices: [
    { identifier: "WRONG-FIRST-PHONE", hardwareProperties: { udid: "other-udid" }, connectionProperties: { tunnelState: "connected" } },
    { identifier: "MATCHED-COREDEVICE-ID", hardwareProperties: { udid: "requested-udid" }, connectionProperties: { tunnelState: "disconnected" } },
  ] } }));
  const output = runDevboxEval(`
xcrun() {
  [[ "$*" == "devicectl list devices --json-output "* ]] || return 1
  cp ${JSON.stringify(devicesPath)} "$5"
}
printf '%s\\n' "$(detect_ios_coredevice_id requested-udid)"
printf 'missing=%s\\n' "$(detect_ios_coredevice_id absent-udid)"
`);
  assert.equal(output, "MATCHED-COREDEVICE-ID\nmissing=");
});

test("an explicit CoreDevice lookup failure does not use the first connected phone fallback", () => {
  const output = runDevboxEval(`
xcrun() {
  if [[ "$*" == *"--json-output"* ]]; then return 1; fi
  printf 'OTHER-PHONE 11111111-1111-1111-1111-111111111111 connected'
}
if ! detect_ios_coredevice_id requested-udid; then printf 'lookup-failed'; fi
`);
  assert.equal(output, "lookup-failed");
});

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
    root) printf '%s' ${JSON.stringify(mainEnvPath)} ;;
    app) printf '%s' ${JSON.stringify(mainEnvPath)} ;;
    stt) printf '%s' ${JSON.stringify(mainEnvPath)} ;;
    *) return 1 ;;
  esac
}
read_app_setting_value DEVBOX_CLOUDFLARE_WEB_HOSTNAME
`);

  assert.equal(output, "main.example.test");
});

test("devbox uses one shared Vault path for all service runtime values", () => {
  const output = runDevboxEval(`
DEVBOX_VAULT_PATH=""
resolve_vault_path
printf '%s' "$DEVBOX_VAULT_PATH"
`);

  assert.equal(output, "secret/mingle/dev");
});

test("prod devbox fallback keeps production AdMob identifiers when overrides are absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbox-runtime-config-"));
  const emptyEnvPath = path.join(tempDir, "empty.env");
  fs.writeFileSync(emptyEnvPath, "", "utf8");

  const output = runDevboxEval(`
APP_ENV_FILE="${emptyEnvPath}"
DEVBOX_VAULT_PATH=""
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
DEVBOX_VAULT_PATH=""
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
DEVBOX_VAULT_PATH=""
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
DEVBOX_VAULT_PATH=""
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
