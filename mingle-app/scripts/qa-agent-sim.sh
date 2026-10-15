#!/usr/bin/env bash
# Simulator plumbing for the /qa skill (agent-driven UI/UX QA).
#
#   scripts/qa-agent-sim.sh servers          # is this worktree's devbox web/STT server up?
#   scripts/qa-agent-sim.sh build            # Release simulator build with the QA bridge on
#   scripts/qa-agent-sim.sh device [LOCALE]  # create/boot the QA simulator (default ko_KR); prints its UDID
#   scripts/qa-agent-sim.sh install [--fresh] # install the QA build on the QA simulator and launch it
#
# This script never starts the dev server. Start it yourself with `scripts/devbox up --profile local`.
#
# The build points both the primary and the legacy fallback web URLs at this worktree's devbox,
# so a QA app can never fall back to production when the local server is down.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$APP_ROOT/.." && pwd)"
DEVBOX_ENV="$ROOT_DIR/.devbox.env"
RUNTIME_XCCONFIG="$APP_ROOT/rn/ios/devbox.runtime.xcconfig"
QA_XCCONFIG="$ROOT_DIR/.devbox-cache/ios/qa-agent.runtime.xcconfig"
DERIVED_DATA="$ROOT_DIR/.devbox-cache/ios/qa-agent-sim"
APP_PATH="$DERIVED_DATA/Build/Products/Release-iphonesimulator/mingle.app"
BUNDLE_ID="com.minglelabs.mingle.rn"
DEVICE_NAME="${MINGLE_QA_SIM_NAME:-Mingle QA iPhone 17}"
DEVICE_TYPE="${MINGLE_QA_SIM_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-17}"
API_NAMESPACE="ios/v2.1.1"

die() { echo "qa-agent-sim: $*" >&2; exit 1; }

devbox_value() {
  [[ -f "$DEVBOX_ENV" ]] || die "missing $DEVBOX_ENV; run scripts/devbox init"
  grep -E "^$1=" "$DEVBOX_ENV" | tail -n1 | cut -d= -f2-
}

cmd_servers() {
  local web_port stt_port web_status stt_open=no
  web_port="$(devbox_value DEVBOX_WEB_PORT)"
  stt_port="$(devbox_value DEVBOX_STT_PORT)"
  web_status="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$web_port/" || true)"
  nc -z 127.0.0.1 "$stt_port" >/dev/null 2>&1 && stt_open=yes
  printf '{"webUrl":"http://127.0.0.1:%s","webHttpStatus":"%s","sttPort":%s,"sttListening":"%s"}\n' \
    "$web_port" "${web_status:-000}" "$stt_port" "$stt_open"
  [[ "$web_status" =~ ^[23] && "$stt_open" == yes ]]
}

write_qa_xcconfig() {
  [[ -f "$RUNTIME_XCCONFIG" ]] || die "missing $RUNTIME_XCCONFIG; run scripts/devbox init"
  mkdir -p "$(dirname "$QA_XCCONFIG")"
  local site ws
  site="$(grep -E '^NEXT_PUBLIC_SITE_URL = ' "$RUNTIME_XCCONFIG" | cut -d= -f2- | sed 's/^ //')"
  ws="$(grep -E '^NEXT_PUBLIC_WS_URL = ' "$RUNTIME_XCCONFIG" | cut -d= -f2- | sed 's/^ //')"
  [[ "$site" == *127.0.0.1* || "$site" == *localhost* ]] || die "devbox site URL is not local ($site); use the local profile"
  sed -e 's/^NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = .*/NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = 1/' \
      -e "s#^MINGLE_LEGACY_SITE_URL = .*#MINGLE_LEGACY_SITE_URL = $site#" \
      -e "s#^MINGLE_LEGACY_WS_URL = .*#MINGLE_LEGACY_WS_URL = $ws#" \
      "$RUNTIME_XCCONFIG" > "$QA_XCCONFIG"
}

cmd_build() {
  [[ -d "$APP_ROOT/rn/node_modules" ]] || (cd "$APP_ROOT/rn" && pnpm install --frozen-lockfile)
  if [[ ! -d "$APP_ROOT/rn/ios/Pods" ]]; then
    (cd "$APP_ROOT/rn/ios" && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install)
  fi
  write_qa_xcconfig
  (
    cd "$APP_ROOT/rn/ios"
    NEXT_PUBLIC_API_NAMESPACE="$API_NAMESPACE" xcodebuild \
      -workspace mingle.xcworkspace \
      -scheme mingle \
      -configuration Release \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$DERIVED_DATA" \
      -xcconfig "$QA_XCCONFIG" \
      build -quiet
  )
  [[ -d "$APP_PATH" ]] || die "build finished but $APP_PATH is missing"
  plutil -extract MingleQaBridgeEnabled raw "$APP_PATH/Info.plist" | grep -qx 1 || die "QA bridge is not enabled in the build"
  echo "$APP_PATH"
}

device_udid() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
devices = json.load(sys.stdin)["devices"]
for runtime, entries in devices.items():
    for device in entries:
        if device["name"] == name:
            print(device["udid"]); sys.exit(0)
' "$DEVICE_NAME"
}

cmd_device() {
  local locale="${1:-ko_KR}" udid runtime
  udid="$(device_udid || true)"
  if [[ -z "$udid" ]]; then
    runtime="$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
ios = [r for r in json.load(sys.stdin)["runtimes"] if r.get("platform") == "iOS" and r.get("isAvailable")]
print(ios[-1]["identifier"] if ios else "")')"
    [[ -n "$runtime" ]] || die "no available iOS simulator runtime"
    udid="$(xcrun simctl create "$DEVICE_NAME" "$DEVICE_TYPE" "$runtime")"
  fi
  if ! xcrun simctl list devices booted | grep -q "$udid"; then
    xcrun simctl spawn "$udid" defaults write .GlobalPreferences AppleLanguages -array "${locale%%_*}" >/dev/null 2>&1 || true
    xcrun simctl spawn "$udid" defaults write .GlobalPreferences AppleLocale -string "$locale" >/dev/null 2>&1 || true
    xcrun simctl boot "$udid"
  fi
  xcrun simctl bootstatus "$udid" -b >/dev/null
  echo "$udid"
}

cmd_install() {
  local fresh=0 udid
  [[ "${1:-}" == "--fresh" ]] && fresh=1
  [[ -d "$APP_PATH" ]] || die "no QA build at $APP_PATH; run: $0 build"
  udid="$(cmd_device)"
  if [[ "$fresh" -eq 1 ]]; then
    xcrun simctl uninstall "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  fi
  xcrun simctl install "$udid" "$APP_PATH"
  xcrun simctl privacy "$udid" grant microphone "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl privacy "$udid" grant photos "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl terminate "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$udid" "$BUNDLE_ID" >/dev/null
  echo "$udid"
}

case "${1:-}" in
  servers) cmd_servers ;;
  build) cmd_build ;;
  device) shift; cmd_device "$@" ;;
  install) shift; cmd_install "$@" ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
