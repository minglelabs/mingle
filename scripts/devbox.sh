#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# IMPORTANT CONFIGURATION POLICY
#
# Vault is the source of truth for persistent devbox/app/STT/messaging configuration.
# The local Vault is bootstrapped from the MAIN worktree's root
# /Users/nam/mingle/.env.local plus its service env files, not from this
# feature worktree's generated .env files. Keep persistent secrets and shared
# runtime configuration in the main root env, then synchronize them through
# Vault. Do not add persistent configuration to .devbox.env or use a generated
# .devbox.env as the solution for missing config.
#
# .devbox.env may still be generated as a derived, worktree-local compatibility
# artifact by existing devbox flows. It is not a source of truth and must not be
# copied between worktrees or used instead of the main-worktree bootstrap/Vault
# flow.
# =============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_CANON="$(cd "$ROOT_DIR" && pwd -P)"
LOCAL_TOOLS_BIN="$ROOT_DIR/.tools/bin"
DEVBOX_LOG_DIR="$ROOT_DIR/.devbox-logs"
DEVBOX_ENV_FILE="$ROOT_DIR/.devbox.env"
ROOT_ENV_FILE="$ROOT_DIR/.env.local"
APP_ENV_FILE="$ROOT_DIR/mingle-app/.env.local"
STT_ENV_FILE="$ROOT_DIR/mingle-stt/.env.local"
MESSAGING_ENV_FILE="$ROOT_DIR/mingle-messaging/.env.local"
NGROK_LOCAL_CONFIG="$ROOT_DIR/ngrok.mobile.local.yml"
RN_IOS_RUNTIME_XCCONFIG="$ROOT_DIR/mingle-app/rn/ios/devbox.runtime.xcconfig"
RN_APP_JSON_FILE="$ROOT_DIR/mingle-app/rn/app.json"
ANDROID_LOCAL_PROPERTIES_FILE="$ROOT_DIR/mingle-app/rn/android/local.properties"
MANAGED_START="# >>> devbox managed (auto)"
MANAGED_END="# <<< devbox managed (auto)"
IOS_RN_REQUIRED_API_NAMESPACE="ios/v2.0.0"
ANDROID_RN_REQUIRED_API_NAMESPACE="android/v2.0.0"
DEVBOX_TEST_ADMOB_APP_ID_IOS="ca-app-pub-3940256099942544~1458002511"
DEVBOX_TEST_ADMOB_APP_ID_ANDROID="ca-app-pub-3940256099942544~3347511713"
DEVBOX_TEST_ADMOB_BANNER_UNIT_ID_IOS="ca-app-pub-3940256099942544/2435281174"
DEVBOX_TEST_ADMOB_BANNER_UNIT_ID_ANDROID="ca-app-pub-3940256099942544/6300978111"
DEFAULT_ADMOB_APP_ID_IOS="ca-app-pub-7057041881494735~7844963551"
DEFAULT_ADMOB_APP_ID_ANDROID="ca-app-pub-7057041881494735~1471126891"
DEFAULT_ADMOB_BANNER_UNIT_ID_IOS="ca-app-pub-7057041881494735/3768106846"
DEFAULT_ADMOB_BANNER_UNIT_ID_ANDROID="ca-app-pub-7057041881494735/6522262692"
DEVBOX_BASE_WEB_PORT=3518
DEVBOX_BASE_STT_PORT=5518
DEVBOX_BASE_MESSAGING_PORT=7518
DEVBOX_BASE_METRO_PORT=8518
DEVBOX_BASE_NGROK_API_PORT=10518
DEVBOX_PORT_SLOT_SPACING=20
DEVBOX_PORT_SLOT_LIMIT=1000

if [[ -d "$LOCAL_TOOLS_BIN" ]]; then
  PATH="$LOCAL_TOOLS_BIN:$PATH"
fi

prefer_supported_node_runtime() {
  local current_node_path=""
  local current_node_version=""
  local current_node_major=""
  local candidate_bin=""
  local preferred_bin=""

  current_node_path="$(command -v node 2>/dev/null || true)"
  if [[ -n "$current_node_path" ]]; then
    current_node_version="$("$current_node_path" -v 2>/dev/null || true)"
    current_node_version="${current_node_version#v}"
    current_node_major="${current_node_version%%.*}"
  fi

  for candidate_bin in \
    "/opt/homebrew/opt/node@22/bin" \
    "/usr/local/opt/node@22/bin"
  do
    if [[ -x "$candidate_bin/node" ]]; then
      preferred_bin="$candidate_bin"
      break
    fi
  done

  [[ -n "$preferred_bin" ]] || return 0

  if [[ -z "$current_node_major" || ! "$current_node_major" =~ ^[0-9]+$ || "$current_node_major" -gt 22 ]]; then
    PATH="$preferred_bin:$PATH"
    if [[ -n "$current_node_version" ]]; then
      printf '[devbox] using Homebrew node@22 runtime instead of node v%s\n' "$current_node_version" >&2
    fi
  fi
}

prefer_supported_node_runtime

APP_MANAGED_KEYS=(
  DEVBOX_WORKTREE_NAME
  DEVBOX_ROOT_DIR
  DEVBOX_PROFILE
  DEVBOX_WEB_PORT
  DEVBOX_STT_PORT
  DEVBOX_MESSAGING_PORT
  DEVBOX_METRO_PORT
  DEVBOX_NGROK_API_PORT
  DEVBOX_SITE_URL
  DEVBOX_RN_WS_URL
  DEVBOX_RN_MESSAGING_WS_URL
  DEVBOX_PUBLIC_WS_URL
  DEVBOX_PUBLIC_MESSAGING_WS_URL
  DEVBOX_TEST_API_BASE_URL
  DEVBOX_TEST_WS_URL
  NEXT_PUBLIC_SITE_URL
  NEXTAUTH_URL
  NEXT_PUBLIC_WS_PORT
  NEXT_PUBLIC_WS_URL
  NEXT_PUBLIC_MESSAGING_WS_URL
  NEXT_PUBLIC_API_NAMESPACE
  MINGLE_MESSAGING_URL
  # Legacy keys are stripped for migration cleanup.
  RN_WEB_APP_BASE_URL
  RN_DEFAULT_WS_URL
  RN_API_NAMESPACE
  PORT
  MINGLE_TEST_API_BASE_URL
  MINGLE_TEST_WS_URL
)

STT_MANAGED_KEYS=(
  DEVBOX_WORKTREE_NAME
  DEVBOX_ROOT_DIR
  DEVBOX_PROFILE
  DEVBOX_WEB_PORT
  DEVBOX_STT_PORT
  DEVBOX_MESSAGING_PORT
  DEVBOX_METRO_PORT
  DEVBOX_NGROK_API_PORT
  DEVBOX_SITE_URL
  DEVBOX_RN_WS_URL
  DEVBOX_RN_MESSAGING_WS_URL
  DEVBOX_PUBLIC_WS_URL
  DEVBOX_PUBLIC_MESSAGING_WS_URL
  DEVBOX_TEST_API_BASE_URL
  DEVBOX_TEST_WS_URL
  PORT
)

is_persistent_devbox_key() {
  case "$1" in
    DEVBOX_NGROK_WEB_DOMAIN|\
    DEVBOX_CLOUDFLARE_TUNNEL_TOKEN|\
    DEVBOX_CLOUDFLARE_WEB_HOSTNAME|\
    DEVBOX_CLOUDFLARE_STT_HOSTNAME|\
    DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME|\
    DEVBOX_RN_FALLBACK_SITE_URL|\
    DEVBOX_RN_FALLBACK_WS_URL|\
    DEVBOX_TUNNEL_PROVIDER|\
    DEVBOX_VAULT_PATH|\
    DEVBOX_VAULT_PROD_PATH|\
    DEVBOX_LOCAL_HOST|\
    DEVBOX_OPENCLAW_ROOT|\
    DEVBOX_IOS_TEAM_ID)
      return 0
      ;;
  esac
  return 1
}

is_shared_app_setting_key() {
  case "$1" in
    DEVBOX_NGROK_WEB_DOMAIN|\
    DEVBOX_CLOUDFLARE_*|\
    DEVBOX_RN_FALLBACK_*|\
    DEVBOX_TUNNEL_PROVIDER|\
    DEVBOX_VAULT_PATH|\
    DEVBOX_VAULT_PROD_PATH|\
    DEVBOX_LOCAL_HOST|\
    DEVBOX_OPENCLAW_ROOT|\
    DEVBOX_IOS_TEAM_ID|\
    RN_AD_BANNER_POSITION|\
    RN_AD_BANNER_HEIGHT_PX|\
    RN_ADMOB_APP_ID_IOS|\
    RN_ADMOB_APP_ID_ANDROID|\
    RN_ADMOB_BANNER_UNIT_ID_IOS|\
    RN_ADMOB_BANNER_UNIT_ID_ANDROID)
      return 0
      ;;
  esac
  return 1
}

# Populated by collect_reserved_ports/calc_default_ports.
RESERVED_ALL_PORTS=""
DEFAULT_WEB_PORT=""
DEFAULT_STT_PORT=""
DEFAULT_MESSAGING_PORT=""
DEFAULT_METRO_PORT=""
DEFAULT_NGROK_API_PORT=""

# Populated by ngrok tunnel lookup.
NGROK_WEB_URL=""
NGROK_STT_URL=""
NGROK_MESSAGING_URL=""
NGROK_LAST_ERROR=""
NGROK_LAST_ERROR_KIND=""

# Values loaded from process env, the main-worktree root .env.local, service
# env files, Vault, or the worktree-local .devbox.env depending on the setting.
DEFAULT_RN_FALLBACK_SITE_URL="https://mingle-app-xi.vercel.app"
DEFAULT_RN_FALLBACK_WS_URL="wss://mingle-stt.fly.dev"
DEVBOX_WORKTREE_NAME=""
DEVBOX_ROOT_DIR=""
DEVBOX_WEB_PORT=""
DEVBOX_STT_PORT=""
DEVBOX_MESSAGING_PORT=""
DEVBOX_METRO_PORT=""
DEVBOX_PROFILE=""
DEVBOX_LOCAL_HOST=""
DEVBOX_SITE_URL=""
DEVBOX_RN_WS_URL=""
DEVBOX_RN_MESSAGING_WS_URL=""
DEVBOX_RN_FALLBACK_SITE_URL=""
DEVBOX_RN_FALLBACK_WS_URL=""
DEVBOX_PUBLIC_WS_URL=""
DEVBOX_PUBLIC_MESSAGING_WS_URL=""
DEVBOX_TEST_API_BASE_URL=""
DEVBOX_TEST_WS_URL=""
DEVBOX_VAULT_PATH=""
DEVBOX_VAULT_PROD_PATH=""
DEVBOX_NGROK_API_PORT=""
DEVBOX_TUNNEL_PROVIDER="${DEVBOX_TUNNEL_PROVIDER:-}"
# NOTE:
# Cloudflare named tunnel variables are persistent shared settings. Keep them
# in the MAIN worktree's root .env.local and synchronize them to Vault.
# An explicitly exported process value may still override them for one run.
DEVBOX_CLOUDFLARE_TUNNEL_TOKEN="${DEVBOX_CLOUDFLARE_TUNNEL_TOKEN:-}"
DEVBOX_CLOUDFLARE_WEB_HOSTNAME="${DEVBOX_CLOUDFLARE_WEB_HOSTNAME:-}"
DEVBOX_CLOUDFLARE_STT_HOSTNAME="${DEVBOX_CLOUDFLARE_STT_HOSTNAME:-}"
DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME="${DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME:-}"
DEVBOX_LOG_FILE=""
DEVBOX_OPENCLAW_ROOT=""
DEVBOX_IOS_TEAM_ID="${DEVBOX_IOS_TEAM_ID:-}"
DEVBOX_ACTIVE_DEVICE_APP_ENV=""
DEVBOX_QA_BRIDGE_ENABLED="${DEVBOX_QA_BRIDGE_ENABLED:-}"

log() {
  printf '[devbox] %s\n' "$*"
}

warn() {
  printf '[devbox] warning: %s\n' "$*" >&2
}

die() {
  printf '[devbox] %s\n' "$*" >&2
  exit 1
}

cleanup_watchman_cookie_files() {
  find "$ROOT_DIR" -maxdepth 1 -type f -name '.watchman-cookie-*' -delete 2>/dev/null || true
}

trap cleanup_watchman_cookie_files EXIT

require_nonempty_runtime_value() {
  local key="$1"
  local value="${2:-}"

  [[ -n "$value" ]] || die "resolved empty $key for devbox runtime"
}

ensure_prisma_app_schema_url() {
  local raw_value="${1:-}"

  if [[ -z "$raw_value" || "$raw_value" == *"schema="* ]]; then
    printf '%s' "$raw_value"
    return 0
  fi

  if [[ "$raw_value" == *\?* ]]; then
    printf '%s&schema=app' "$raw_value"
    return 0
  fi

  printf '%s?schema=app' "$raw_value"
}

normalize_prisma_database_env() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="$(ensure_prisma_app_schema_url "$DATABASE_URL")"
    export DATABASE_URL
  fi

  if [[ -n "${DIRECT_DATABASE_URL:-}" ]]; then
    DIRECT_DATABASE_URL="$(ensure_prisma_app_schema_url "$DIRECT_DATABASE_URL")"
    export DIRECT_DATABASE_URL
  fi

  if [[ -n "${POSTGRES_PRISMA_URL:-}" ]]; then
    POSTGRES_PRISMA_URL="$(ensure_prisma_app_schema_url "$POSTGRES_PRISMA_URL")"
    export POSTGRES_PRISMA_URL
  fi
}

best_effort_raise_nofile_limit() {
  local target="${DEVBOX_ULIMIT_NOFILE:-65536}"
  if [[ "$target" =~ ^[0-9]+$ ]]; then
    ulimit -n "$target" 2>/dev/null || true
  fi
}

usage() {
  cat <<'EOF'
Usage:
  scripts/devbox [--log-file PATH|auto] <command> [options]
  scripts/devbox init [--web-port N] [--stt-port N] [--messaging-port N] [--metro-port N] [--ngrok-api-port N] [--host HOST] [--vault-path PATH] [--openclaw-root PATH]
  scripts/devbox bootstrap [--vault-path PATH] [--vault-push] [--openclaw-root PATH]
  scripts/devbox vault-up [--seed] [--vault-path PATH]
  scripts/devbox profile --profile local|device [--host HOST]
  scripts/devbox ngrok-config
  scripts/devbox gateway [--openclaw-root PATH] [--mode dev|run] [--]
  scripts/devbox ios-appstore-sync-metadata [--json PATH] [--api-key-json PATH] [--app-id BUNDLE_ID] [--dry-run] [--no-fallback]
  scripts/devbox ios-rn-ipa [--ios-configuration Debug|Release] [--device-app-env dev|prod] [--site-url URL] [--ws-url URL] [--archive-path PATH] [--export-path PATH] [--export-options-plist PATH] [--export-method app-store-connect|release-testing|debugging|enterprise|app-store|ad-hoc|development] [--team-id TEAM_ID] [--allow-provisioning-updates|--no-allow-provisioning-updates] [--skip-export] [--dry-run]
  scripts/devbox ios-rn-ipa-prod [ios-rn-ipa options...]
  scripts/devbox mobile [--profile local|device] [--host HOST] [--platform ios|android|all] [--ios-udid UDID] [--android-serial SERIAL] [--ios-configuration Debug|Release] [--android-variant debug|release] [--with-ios-clean-install] [--qa-bridge] [--device-app-env dev|prod] [--tunnel-provider ngrok|cloudflare] [--site-url URL] [--ws-url URL]
  scripts/devbox up [--profile local|device] [--host HOST] [--with-metro] [--with-ios-install] [--with-android-install] [--with-mobile-install] [--with-ios-clean-install] [--qa-bridge] [--ios-udid UDID] [--android-serial SERIAL] [--ios-configuration Debug|Release] [--android-variant debug|release] [--tunnel-provider ngrok|cloudflare] [--device-app-env dev|prod] [--vault-path PATH]
  scripts/devbox down
  scripts/devbox test [--target app] [--with-live] [vitest args...]
  scripts/devbox qa [--platform ios|android|all] [--contracts] [--ios-regressions] [--android-regressions] [--ios-scroll-fps] [--ios-udid UDID] [--ios-real-udid UDID] [--ios-sim-udid UDID] [--android-serial SERIAL] [--qa-arg ARG...]
  scripts/devbox status

Commands:
  init         Generate worktree-aware ports/config runtime files.
  bootstrap    Upload main root shared values and service env values to Vault, then install dependencies.
               --vault-push is accepted as a backward-compatible no-op.
  vault-up     Start local Vault via Homebrew service and optionally seed main root/service env values.
  profile      Apply local/device profile to managed env files.
  ngrok-config Regenerate ngrok.mobile.local.yml from current ports.
  gateway      Run OpenClaw gateway from configured openclaw root.
  ios-appstore-sync-metadata Sync App Store Connect metadata from appstore-connect-info.i18n.json.
  ios-rn-ipa   Archive/export RN iOS app to .xcarchive/.ipa for App Store/TestFlight.
  ios-rn-ipa-prod Same as ios-rn-ipa, defaulting to --device-app-env prod.
  mobile       Build/install RN iOS and Android apps.
  up           Start STT + messaging + Next app together (device profile includes tunnel startup).
  down         Stop devbox runtime processes (web/stt/messaging/metro/tunnels) for this repo.
  test         Run mingle-app unit tests by default (live with --with-live).
  qa           Run mingle-app mobile UI QA wrappers (contracts/Appium/iOS regression inventory).
  status       Print current endpoints for PC/iOS/Android web and app targets.

Global Options:
  --log-file PATH|auto  Save combined devbox stdout/stderr to PATH.
                        Relative paths resolve from repository root.
                        auto -> .devbox-logs/devbox-<worktree>-<timestamp>.log

Default Shortcut:
  scripts/devbox up
    == scripts/devbox --log-file auto up --profile device --tunnel-provider cloudflare --with-ios-install

Environment:
  DEVBOX_NGROK_WEB_DOMAIN  Optional fixed ngrok domain for devbox_web tunnel.
                           Example: abcdef.ngrok-free.app
  DEVBOX_TUNNEL_PROVIDER   Device profile tunnel provider (ngrok|cloudflare).
                           Default: ngrok
  DEVBOX_VAULT_PATH        Shared development Vault KV path for all services.
                           Default: secret/mingle/dev
  DEVBOX_VAULT_PROD_PATH   Optional production Vault KV path for --device-app-env prod.
                           Default: secret/mingle/prod
  DEVBOX_CLOUDFLARE_TUNNEL_TOKEN  Optional: when set with hostnames below,
                           cloudflare provider uses named tunnel mode.
                           Store persistent values in the MAIN worktree root
                           .env.local and synchronize them to Vault.
  DEVBOX_CLOUDFLARE_WEB_HOSTNAME  Named tunnel web hostname (e.g. web-dev.example.com)
  DEVBOX_CLOUDFLARE_STT_HOSTNAME  Named tunnel stt hostname (e.g. stt-dev.example.com)
  DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME Named tunnel messaging hostname (e.g. msg-dev.example.com)
  DEVBOX_IOS_TEAM_ID       Optional iOS Team ID used by ios-rn-ipa exportOptions.
                           Store it in the MAIN worktree root .env.local or Vault.
                           Example: 3RFBMN8TKZ
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

read_rn_gemfile_lock_ruby_version_base() {
  local gemfile_lock="$ROOT_DIR/mingle-app/rn/Gemfile.lock"
  local ruby_version=""

  [[ -f "$gemfile_lock" ]] || return 1
  ruby_version="$(awk '
    $1 == "RUBY" && $2 == "VERSION" { getline; gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0); print $2; exit }
  ' "$gemfile_lock" 2>/dev/null || true)"
  ruby_version="${ruby_version%%p*}"
  [[ -n "$ruby_version" ]] || return 1
  printf "%s" "$ruby_version"
}

bundle_cmd_ruby_path() {
  local bundle_cmd_path="$1"
  local ruby_path=""

  [[ -x "$bundle_cmd_path" ]] || return 1
  ruby_path="$(head -n 1 "$bundle_cmd_path" 2>/dev/null | sed -n 's/^#!//p')"
  [[ -n "$ruby_path" ]] || return 1
  [[ -x "$ruby_path" ]] || return 1
  printf "%s" "$ruby_path"
}

bundle_cmd_ruby_version() {
  local bundle_cmd_path="$1"
  local ruby_path=""

  ruby_path="$(bundle_cmd_ruby_path "$bundle_cmd_path" || true)"
  [[ -n "$ruby_path" ]] || return 1
  "$ruby_path" -e 'print RUBY_VERSION' 2>/dev/null || return 1
}

resolve_direct_pod_runner() {
  local ruby_cmd="$1"
  local ruby_api_version=""
  local pod_cmd=""

  [[ -x "$ruby_cmd" ]] || return 1
  ruby_api_version="$("$ruby_cmd" -e 'require "rbconfig"; print RbConfig::CONFIG["ruby_version"]' 2>/dev/null || true)"
  [[ -n "$ruby_api_version" ]] || return 1

  for pod_cmd in \
    "/opt/homebrew/lib/ruby/gems/${ruby_api_version}/bin/pod" \
    "/usr/local/lib/ruby/gems/${ruby_api_version}/bin/pod"
  do
    [[ -x "$pod_cmd" ]] || continue
    printf "%s\n%s\n" "$ruby_cmd" "$pod_cmd"
    return 0
  done

  return 1
}

resolve_bundle_cmd() {
  local candidate=""
  local ruby_version_base=""
  local current_bundle=""
  local current_bundle_ruby_version=""
  local env_bundle_cmd="${DEVBOX_BUNDLE_CMD:-}"

  ruby_version_base="$(read_rn_gemfile_lock_ruby_version_base || true)"

  if [[ -n "$env_bundle_cmd" && -x "$env_bundle_cmd" ]]; then
    printf "%s" "$env_bundle_cmd"
    return 0
  fi

  current_bundle="$(command -v bundle 2>/dev/null || true)"
  if [[ -n "$current_bundle" && ! "$current_bundle" =~ ^/opt/homebrew/lib/ruby/gems/.*/bin/bundle$ ]]; then
    current_bundle_ruby_version="$(bundle_cmd_ruby_version "$current_bundle" || true)"
    if [[ -n "$ruby_version_base" && "$current_bundle_ruby_version" == "$ruby_version_base" ]]; then
      printf "%s" "$current_bundle"
      return 0
    fi
  fi

  for candidate in \
    "/opt/homebrew/Cellar/ruby/${ruby_version_base}/bin/bundle" \
    "/usr/local/Cellar/ruby/${ruby_version_base}/bin/bundle"
  do
    [[ -n "$ruby_version_base" ]] || continue
    [[ -x "$candidate" ]] || continue
    printf "%s" "$candidate"
    return 0
  done

  for candidate in \
    "/opt/homebrew/opt/ruby/bin/bundle" \
    "/usr/local/opt/ruby/bin/bundle"
  do
    [[ -x "$candidate" ]] || continue
    printf "%s" "$candidate"
    return 0
  done

  # Avoid homebrew gem-bin shim path which can hang on some environments.
  if [[ -n "$current_bundle" && ! "$current_bundle" =~ ^/opt/homebrew/lib/ruby/gems/.*/bin/bundle$ ]]; then
    printf "%s" "$current_bundle"
    return 0
  fi

  return 1
}

trim_whitespace() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

normalize_cli_output() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
  trim_whitespace "$value"
}

is_truthy() {
  local raw="${1:-}"
  local value
  value="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_devbox_qa_bridge_enabled() {
  if is_truthy "${DEVBOX_QA_BRIDGE_ENABLED:-0}"; then
    printf '1'
    return 0
  fi
  printf '0'
}

normalize_domain_input() {
  local value
  value="$(trim_whitespace "${1:-}")"
  value="${value#https://}"
  value="${value#http://}"
  value="${value%%/*}"
  printf '%s' "$value"
}

is_numeric() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

validate_port() {
  local name="$1"
  local port="$2"
  is_numeric "$port" || die "$name must be numeric: $port"
  ((port >= 1 && port <= 65535)) || die "$name out of range (1-65535): $port"
}

validate_host() {
  local host="$1"
  [[ -n "$host" ]] || die "host must not be empty"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || die "invalid host format: $host"
}

validate_http_url() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]] || die "invalid $name: $value"
}

validate_https_url() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]] || die "invalid $name (https required): $value"
}

validate_ws_url() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^wss?://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]] || die "invalid $name: $value"
}

validate_wss_url() {
  local name="$1"
  local value="$2"
  [[ "$value" =~ ^wss://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]] || die "invalid $name (wss required): $value"
}

ensure_single_line_value() {
  local name="$1"
  local value="$2"
  [[ "$value" != *$'\n'* ]] || die "$name cannot contain newline"
  [[ "$value" != *$'\r'* ]] || die "$name cannot contain carriage return"
}

is_valid_env_key() {
  [[ "${1:-}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

is_managed_key_for_target() {
  local target="$1"
  local key="$2"
  shift 2 || true

  local item
  case "$target" in
    app)
      for item in "${APP_MANAGED_KEYS[@]}"; do
        [[ "$item" == "$key" ]] && return 0
      done
      ;;
    stt)
      for item in "${STT_MANAGED_KEYS[@]}"; do
        [[ "$item" == "$key" ]] && return 0
      done
      ;;
    mingle)
      for item in "${APP_MANAGED_KEYS[@]}" "${STT_MANAGED_KEYS[@]}"; do
        [[ "$item" == "$key" ]] && return 0
      done
      ;;
    *)
      return 1
      ;;
  esac
  return 1
}

format_env_value_for_dotenv() {
  local value="$1"
  if [[ "$value" =~ ^[A-Za-z0-9_./:@,+=~-]*$ ]]; then
    printf '%s' "$value"
    return 0
  fi

  local escaped
  escaped="$(printf '%s' "$value" | sed "s/'/'\"'\"'/g")"
  printf "'%s'" "$escaped"
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  return 1
}

port_list_contains() {
  local list="$1"
  local port="$2"
  [[ -z "$list" ]] && return 1
  printf '%s\n' "$list" | grep -Fx -- "$port" >/dev/null 2>&1
}

append_port() {
  local list="$1"
  local port="$2"
  if [[ -z "$list" ]]; then
    printf '%s' "$port"
    return
  fi
  printf '%s\n%s' "$list" "$port"
}

read_env_value_from_file() {
  local key="$1"
  local file="$2"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file"
}

read_env_or_export_value_from_file() {
  local key="$1"
  local file="$2"
  local raw=""

  [[ -f "$file" ]] || return 1

  raw="$(
    awk -v key="$key" '
      {
        line = $0
        sub(/\r$/, "", line)
        if (line ~ /^[[:space:]]*#/) {
          next
        }
        if (match(line, "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=")) {
          sub("^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=[[:space:]]*", "", line)
          print line
          exit
        }
      }
    ' "$file" 2>/dev/null || true
  )"
  raw="$(trim_whitespace "$raw")"
  [[ -n "$raw" ]] || return 1
  decode_dotenv_value "$raw"
}

read_devbox_shell_setting_value() {
  local key="$1"
  local value=""
  local shell_file=""
  local zdotdir="${ZDOTDIR:-$HOME}"
  local -a shell_files=(
    "$zdotdir/.zshrc"
    "$zdotdir/.zprofile"
    "$HOME/.bashrc"
    "$HOME/.bash_profile"
  )

  for shell_file in "${shell_files[@]}"; do
    [[ -f "$shell_file" ]] || continue
    value="$(read_env_or_export_value_from_file "$key" "$shell_file" || true)"
    value="$(trim_whitespace "$value")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done

  return 1
}

read_devbox_env_value_from_file() {
  local file="$1"
  local key="$2"
  local value=""

  [[ -f "$file" ]] || return 1
  value="$(read_env_or_export_value_from_file "$key" "$file" || true)"
  value="$(trim_whitespace "$value")"
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

read_devbox_env_value() {
  read_devbox_env_value_from_file "$DEVBOX_ENV_FILE" "$1"
}

read_vault_cli_env_value_from_local_env_files() {
  local key="$1"
  local value=""
  local file=""
  local main_root_env_file=""
  local main_app_env_file=""
  local main_stt_env_file=""
  local main_messaging_env_file=""
  local -a env_files=()

  main_root_env_file="$(main_worktree_env_file root || true)"
  main_app_env_file="$(main_worktree_env_file app || true)"
  main_stt_env_file="$(main_worktree_env_file stt || true)"
  main_messaging_env_file="$(main_worktree_env_file messaging || true)"
  env_files=(
    "$main_root_env_file"
    "$main_app_env_file"
    "$main_stt_env_file"
    "$main_messaging_env_file"
    "$ROOT_ENV_FILE"
    "$APP_ENV_FILE"
    "$STT_ENV_FILE"
    "$MESSAGING_ENV_FILE"
  )

  for file in "${env_files[@]}"; do
    [[ -n "$file" ]] || continue
    [[ -f "$file" ]] || continue
    value="$(read_env_value_from_file "$key" "$file" || true)"
    value="$(decode_dotenv_value "$value")"
    value="$(trim_whitespace "$value")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

prepare_vault_cli_env() {
  local value=""
  if [[ -z "${VAULT_ADDR:-}" ]]; then
    value="$(read_vault_cli_env_value_from_local_env_files "VAULT_ADDR" || true)"
    if [[ -n "$value" ]]; then
      export VAULT_ADDR="$value"
    fi
  fi

  if [[ -z "${VAULT_NAMESPACE:-}" ]]; then
    value="$(read_vault_cli_env_value_from_local_env_files "VAULT_NAMESPACE" || true)"
    if [[ -n "$value" ]]; then
      export VAULT_NAMESPACE="$value"
    fi
  fi
}

vault_mount_exists_for_path() {
  local path="$1"
  local mount=""
  local payload=""

  [[ -n "$path" ]] || return 1
  mount="${path%%/*}/"

  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env

  payload="$(vault secrets list -format=json 2>/dev/null)" || return 1
  printf '%s' "$payload" | jq -e --arg mount "$mount" '.[$mount] != null' >/dev/null 2>&1
}

vault_output_indicates_missing_path() {
  local output="${1:-}"
  local lower=""

  lower="$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == *"no value found at"* ]] && return 0
  [[ "$lower" == *"/data/"* && "$lower" == *"code: 404"* ]] && return 0
  return 1
}

wait_for_vault_ready() {
  local attempts="${1:-20}"
  local sleep_seconds="${2:-1}"
  local i=0

  while [[ "$i" -lt "$attempts" ]]; do
    if vault status >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_seconds"
    i=$((i + 1))
  done

  return 1
}

read_env_value_from_vault() {
  local path="$1"
  local key="$2"
  local value

  [[ -n "$path" ]] || return 1
  [[ -n "$key" ]] || return 1

  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env

  value="$(vault kv get -format=json "$path" 2>/dev/null | jq -r --arg key "$key" '.data.data[$key] // ""')"
  [[ "$value" == "null" ]] && value=""
  [[ -n "$value" ]] && printf '%s' "$value"
}

try_read_env_value_from_vault_path() {
  local path="$1"
  local key="$2"
  local value=""

  [[ -n "$path" ]] || return 1
  [[ -n "$key" ]] || return 1
  command -v vault >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  value="$(read_env_value_from_vault "$path" "$key" || true)"
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

read_app_setting_value() {
  local key="$1"
  local value=""
  local path=""
  local vault_path=""
  local seen_paths=""
  local -a candidate_paths=()

  [[ -n "$key" ]] || return 1

  value="${!key:-}"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi

  if [[ "$key" == DEVBOX_* ]] && ! is_persistent_devbox_key "$key"; then
    value="$(read_devbox_env_value "$key" || true)"
    value="$(trim_whitespace "$value")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  value="$(read_main_root_setting_value "$key" || true)"
  value="$(decode_dotenv_value "$value")"
  value="$(trim_whitespace "$value")"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi

  if [[ -f "$APP_ENV_FILE" ]]; then
    value="$(read_env_value_from_file "$key" "$APP_ENV_FILE" || true)"
    value="$(decode_dotenv_value "$value")"
    value="$(trim_whitespace "$value")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  vault_path="${DEVBOX_VAULT_PATH:-}"
  if [[ -z "$vault_path" ]]; then
    vault_path="$(read_main_root_setting_value DEVBOX_VAULT_PATH || true)"
    vault_path="$(trim_whitespace "$vault_path")"
  fi

  if [[ -n "$vault_path" ]] && command -v vault >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    value="$(read_env_value_from_vault "$vault_path" "$key" || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if [[ "$key" == DEVBOX_* ]] && ! is_shared_app_setting_key "$key"; then
    value="$(read_devbox_shell_setting_value "$key" || true)"
    value="$(trim_whitespace "$value")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  candidate_paths+=("$vault_path")
  candidate_paths+=("secret/mingle/dev")
  candidate_paths+=("secret/mingle/prod")

  for path in "${candidate_paths[@]}"; do
    path="$(trim_whitespace "$path")"
    [[ -n "$path" ]] || continue
    if printf '%s\n' "$seen_paths" | grep -Fxq -- "$path"; then
      continue
    fi
    seen_paths="${seen_paths}${seen_paths:+$'\n'}$path"

    value="$(try_read_env_value_from_vault_path "$path" "$key" || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done

  return 1
}

is_nonprod_mobile_build() {
  [[ -n "${DEVBOX_ACTIVE_DEVICE_APP_ENV:-}" && "${DEVBOX_ACTIVE_DEVICE_APP_ENV:-}" != "prod" ]]
}

resolve_devbox_ad_banner_position() {
  local platform="${1:-${DEVBOX_ACTIVE_MOBILE_PLATFORM:-}}"
  local platform_key=""
  local value=""
  case "$platform" in
    ios)
      platform_key="RN_AD_BANNER_POSITION_IOS"
      ;;
    android)
      platform_key="RN_AD_BANNER_POSITION_ANDROID"
      ;;
  esac

  if [[ -n "$platform_key" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value "$platform_key" || true)")"
  fi
  if [[ -z "$value" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value RN_AD_BANNER_POSITION || true)")"
  fi
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"

  case "$value" in
    top|bottom)
      printf '%s' "$value"
      ;;
    "")
      printf '%s' "bottom"
      ;;
    *)
      printf '%s' "bottom"
      ;;
  esac
}

resolve_devbox_ad_banner_height_px() {
  local value=""
  value="$(trim_whitespace "$(read_app_setting_value RN_AD_BANNER_HEIGHT_PX || true)")"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "50"
}

resolve_devbox_admob_app_id_ios() {
  local value=""
  if is_nonprod_mobile_build; then
    printf '%s' "$DEVBOX_TEST_ADMOB_APP_ID_IOS"
    return 0
  fi
  value="$(trim_whitespace "$(read_app_setting_value RN_ADMOB_APP_ID_IOS || true)")"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "$DEFAULT_ADMOB_APP_ID_IOS"
}

resolve_devbox_admob_app_id_android() {
  local value=""
  if is_nonprod_mobile_build; then
    printf '%s' "$DEVBOX_TEST_ADMOB_APP_ID_ANDROID"
    return 0
  fi
  value="$(trim_whitespace "$(read_app_setting_value RN_ADMOB_APP_ID_ANDROID || true)")"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "$DEFAULT_ADMOB_APP_ID_ANDROID"
}

resolve_devbox_admob_banner_unit_id_ios() {
  local value=""
  if is_nonprod_mobile_build; then
    printf '%s' "$DEVBOX_TEST_ADMOB_BANNER_UNIT_ID_IOS"
    return 0
  fi
  value="$(trim_whitespace "$(read_app_setting_value RN_ADMOB_BANNER_UNIT_ID_IOS || true)")"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "$DEFAULT_ADMOB_BANNER_UNIT_ID_IOS"
}

resolve_devbox_admob_banner_unit_id_android() {
  local value=""
  if is_nonprod_mobile_build; then
    printf '%s' "$DEVBOX_TEST_ADMOB_BANNER_UNIT_ID_ANDROID"
    return 0
  fi
  value="$(trim_whitespace "$(read_app_setting_value RN_ADMOB_BANNER_UNIT_ID_ANDROID || true)")"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "$DEFAULT_ADMOB_BANNER_UNIT_ID_ANDROID"
}

derive_worktree_name() {
  local fallback hash
  # Keep this stable per worktree path (independent of current git branch).
  fallback="$(basename "$(dirname "$ROOT_CANON")")"
  hash="$(printf '%s' "$ROOT_CANON" | cksum | awk '{print $1}')"
  printf '%s-%s' "$fallback" "$((hash % 100000))"
}

collect_reserved_ports() {
  RESERVED_ALL_PORTS=""
  local line="" worktree_path="" worktree_canon="" env_file="" port="" key=""

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        worktree_path="${line#worktree }"
        worktree_canon="$(cd "$worktree_path" 2>/dev/null && pwd -P || true)"
        [[ -n "$worktree_canon" ]] || continue
        [[ "$worktree_canon" != "$ROOT_CANON" ]] || continue

        env_file="$worktree_canon/.devbox.env"
        [[ -f "$env_file" ]] || continue

        for key in \
          DEVBOX_WEB_PORT \
          DEVBOX_STT_PORT \
          DEVBOX_MESSAGING_PORT \
          DEVBOX_METRO_PORT \
          DEVBOX_NGROK_API_PORT
        do
          port="$(read_devbox_env_value_from_file "$env_file" "$key" || true)"
          if is_numeric "$port" && ! port_list_contains "$RESERVED_ALL_PORTS" "$port"; then
            RESERVED_ALL_PORTS="$(append_port "$RESERVED_ALL_PORTS" "$port")"
          fi
        done
        ;;
    esac
  done < <(git -C "$ROOT_DIR" worktree list --porcelain 2>/dev/null || true)
}

calc_slot_port() {
  local base="$1"
  local slot="$2"
  printf '%s' "$((base + (slot * DEVBOX_PORT_SLOT_SPACING)))"
}

default_port_set_available() {
  local web_port="$1"
  local stt_port="$2"
  local messaging_port="$3"
  local metro_port="$4"
  local ngrok_api_port="$5"
  local port=""

  for port in "$web_port" "$stt_port" "$messaging_port" "$metro_port" "$ngrok_api_port"; do
    (( port >= 1 && port <= 65535 )) || return 1
    port_list_contains "$RESERVED_ALL_PORTS" "$port" && return 1
    port_in_use "$port" && return 1
  done

  return 0
}

calc_default_ports() {
  collect_reserved_ports

  local preferred_slot=0
  local slot=0
  local attempt=0

  preferred_slot="$(printf '%s' "$ROOT_CANON" | cksum | awk -v mod="$DEVBOX_PORT_SLOT_LIMIT" '{print $1 % mod}')"

  while [[ "$attempt" -lt "$DEVBOX_PORT_SLOT_LIMIT" ]]; do
    slot="$(((preferred_slot + attempt) % DEVBOX_PORT_SLOT_LIMIT))"
    DEFAULT_WEB_PORT="$(calc_slot_port "$DEVBOX_BASE_WEB_PORT" "$slot")"
    DEFAULT_STT_PORT="$(calc_slot_port "$DEVBOX_BASE_STT_PORT" "$slot")"
    DEFAULT_MESSAGING_PORT="$(calc_slot_port "$DEVBOX_BASE_MESSAGING_PORT" "$slot")"
    DEFAULT_METRO_PORT="$(calc_slot_port "$DEVBOX_BASE_METRO_PORT" "$slot")"
    DEFAULT_NGROK_API_PORT="$(calc_slot_port "$DEVBOX_BASE_NGROK_API_PORT" "$slot")"

    if default_port_set_available \
      "$DEFAULT_WEB_PORT" \
      "$DEFAULT_STT_PORT" \
      "$DEFAULT_MESSAGING_PORT" \
      "$DEFAULT_METRO_PORT" \
      "$DEFAULT_NGROK_API_PORT"
    then
      return 0
    fi

    attempt=$((attempt + 1))
  done

  die "unable to allocate devbox ports for this worktree after ${DEVBOX_PORT_SLOT_LIMIT} attempts"
}

ensure_file_parent() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
}

prepare_generated_file() {
  local file="$1"
  ensure_file_parent "$file"
  if [[ -L "$file" ]]; then
    rm -f "$file"
  fi
  : > "$file"
}

find_main_worktree_root() {
  local line=""
  local worktree_path=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        worktree_path="${line#worktree }"
        ;;
      branch\ refs/heads/main)
        printf '%s' "$worktree_path"
        return 0
        ;;
    esac
  done < <(git -C "$ROOT_DIR" worktree list --porcelain)
  return 1
}

main_worktree_env_file() {
  local target="$1"
  local main_root=""

  main_root="$(find_main_worktree_root || true)"
  [[ -n "$main_root" ]] || return 1
  main_root="$(cd "$main_root" 2>/dev/null && pwd -P || true)"
  [[ -n "$main_root" ]] || return 1

  case "$target" in
    root) printf '%s/.env.local' "$main_root" ;;
    app) printf '%s/mingle-app/.env.local' "$main_root" ;;
    stt) printf '%s/mingle-stt/.env.local' "$main_root" ;;
    messaging) printf '%s/mingle-messaging/.env.local' "$main_root" ;;
    *) return 1 ;;
  esac
}

read_main_root_setting_value() {
  local key="$1"
  local file=""
  local value=""

  file="$(main_worktree_env_file root || true)"
  [[ -n "$file" ]] || return 1
  value="$(read_env_value_from_file "$key" "$file" || true)"
  decode_dotenv_value "$value"
}

read_main_app_setting_value() {
  local key="$1"
  local file=""
  local value=""

  file="$(main_worktree_env_file app || true)"
  [[ -n "$file" ]] || return 1
  value="$(read_env_value_from_file "$key" "$file" || true)"
  decode_dotenv_value "$value"
}

workspace_dependency_manifest_checksum() {
  local workspace_dir="${1:-}"
  local package_json="$workspace_dir/package.json"
  local lockfile="$workspace_dir/pnpm-lock.yaml"
  [[ -f "$package_json" && -f "$lockfile" ]] || return 1

  cat "$package_json" "$lockfile" | cksum | awk '{print $1 ":" $2}'
}

workspace_dependency_install_marker_path() {
  local workspace_dir="${1:-}"
  printf '%s/node_modules/.devbox-install-state' "$workspace_dir"
}

workspace_dependencies_need_install() {
  local workspace_dir="${1:-}"
  local primary_path="${2:-}"
  shift 2 || true
  local expected_state=""
  local marker_path=""
  local actual_state=""
  local extra_path=""

  [[ -n "$primary_path" ]] || return 0
  [[ -e "$primary_path" ]] || return 0
  for extra_path in "$@"; do
    [[ -e "$extra_path" ]] || return 0
  done

  expected_state="$(workspace_dependency_manifest_checksum "$workspace_dir" || true)"
  [[ -n "$expected_state" ]] || return 0

  marker_path="$(workspace_dependency_install_marker_path "$workspace_dir")"
  [[ -f "$marker_path" ]] || return 0

  actual_state="$(tr -d '\r\n' < "$marker_path" 2>/dev/null || true)"
  [[ "$actual_state" != "$expected_state" ]] && return 0

  return 1
}

write_workspace_dependency_install_marker() {
  local workspace_dir="${1:-}"
  local expected_state=""
  local marker_path=""

  expected_state="$(workspace_dependency_manifest_checksum "$workspace_dir" || true)"
  [[ -n "$expected_state" ]] || return 0
  [[ -d "$workspace_dir/node_modules" ]] || return 0

  marker_path="$(workspace_dependency_install_marker_path "$workspace_dir")"
  printf '%s\n' "$expected_state" > "$marker_path"
}

ensure_workspace_dependencies() {
  local app_dir="$ROOT_DIR/mingle-app"
  local stt_dir="$ROOT_DIR/mingle-stt"
  local messaging_dir="$ROOT_DIR/mingle-messaging"
  local app_next_bin="$app_dir/node_modules/.bin/next"
  local stt_tsnode_bin="$stt_dir/node_modules/.bin/ts-node"
  local messaging_tsnode_bin="$messaging_dir/node_modules/.bin/ts-node"

  if workspace_dependencies_need_install "$app_dir" "$app_next_bin"; then
    log "installing dependencies: mingle-app"
    pnpm --dir "$app_dir" install --frozen-lockfile
  fi
  if workspace_dependencies_need_install "$stt_dir" "$stt_tsnode_bin"; then
    log "installing dependencies: mingle-stt"
    pnpm --dir "$stt_dir" install --frozen-lockfile
  fi
  if workspace_dependencies_need_install "$messaging_dir" "$messaging_tsnode_bin"; then
    log "installing dependencies: mingle-messaging"
    pnpm --dir "$messaging_dir" install --frozen-lockfile
  fi
  write_workspace_dependency_install_marker "$app_dir"
  write_workspace_dependency_install_marker "$stt_dir"
  write_workspace_dependency_install_marker "$messaging_dir"

  ensure_mingle_app_prisma_client
}

ensure_mingle_app_prisma_client() {
  local app_dir="$ROOT_DIR/mingle-app"
  if [[ -f "$app_dir/node_modules/.prisma/client/default.js" ]]; then
    return 0
  fi

  if ! ls "$app_dir"/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/default.js >/dev/null 2>&1; then
    log "generating prisma client: mingle-app"
    pnpm --dir "$app_dir" db:generate
  fi
}

ensure_rn_workspace_dependencies() {
  local rn_dir="$ROOT_DIR/mingle-app/rn"
  local rn_cli_bin="$rn_dir/node_modules/.bin/react-native"
  local rn_gradle_plugin_dir="$rn_dir/node_modules/@react-native/gradle-plugin"
  if workspace_dependencies_need_install "$rn_dir" "$rn_cli_bin" "$rn_gradle_plugin_dir"; then
    log "installing dependencies: mingle-app/rn"
    pnpm --dir "$rn_dir" install --frozen-lockfile
  fi
  write_workspace_dependency_install_marker "$rn_dir"
}

resolve_android_sdk_path() {
  local candidate="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -n "$candidate" && -d "$candidate" ]]; then
    (cd "$candidate" && pwd -P)
    return 0
  fi

  candidate="$HOME/Library/Android/sdk"
  [[ -d "$candidate" ]] || return 1
  (cd "$candidate" && pwd -P)
}

ensure_android_sdk_config() {
  local sdk_path=""
  sdk_path="$(resolve_android_sdk_path || true)"
  [[ -n "$sdk_path" ]] || die "Android SDK not found; set ANDROID_HOME or install it at $HOME/Library/Android/sdk"

  export ANDROID_HOME="$sdk_path"
  export ANDROID_SDK_ROOT="$sdk_path"
  mkdir -p "$(dirname "$ANDROID_LOCAL_PROPERTIES_FILE")"
  if [[ ! -f "$ANDROID_LOCAL_PROPERTIES_FILE" ]] || [[ "$(<"$ANDROID_LOCAL_PROPERTIES_FILE")" != "sdk.dir=$sdk_path" ]]; then
    printf 'sdk.dir=%s\n' "$sdk_path" > "$ANDROID_LOCAL_PROPERTIES_FILE"
    log "Android SDK configured automatically: $sdk_path"
  fi
}

ensure_ios_pods_if_needed() {
  local ios_dir="$ROOT_DIR/mingle-app/rn/ios"
  local pods_dir="$ROOT_DIR/mingle-app/rn/ios/Pods"
  local podfile_lock="$ios_dir/Podfile.lock"
  local manifest_lock="$ios_dir/Pods/Manifest.lock"
  local bundle_cmd=""
  local bundle_home="$ROOT_DIR/.devbox-cache/bundle/rn"
  local bundle_ruby_cmd=""
  local direct_pod_payload=""
  local direct_pod_ruby_cmd=""
  local direct_pod_cmd=""
  local needs_install=0
  local reason="already synced"

  if [[ ! -d "$pods_dir" ]]; then
    needs_install=1
    reason="Pods directory missing"
  elif [[ ! -f "$manifest_lock" ]]; then
    needs_install=1
    reason="Pods/Manifest.lock missing"
  elif [[ ! -f "$podfile_lock" ]]; then
    needs_install=1
    reason="Podfile.lock missing"
  elif ! cmp -s "$podfile_lock" "$manifest_lock"; then
    if is_truthy "${DEVBOX_ENFORCE_POD_INSTALL_ON_LOCK_MISMATCH:-0}"; then
      needs_install=1
      reason="Podfile.lock and Manifest.lock out of sync"
    else
      log "Podfile.lock and Manifest.lock out of sync; syncing Manifest.lock without pod install (set DEVBOX_ENFORCE_POD_INSTALL_ON_LOCK_MISMATCH=1 to enforce pod install)"
      cp "$podfile_lock" "$manifest_lock"
      return 0
    fi
  fi

  if [[ "$needs_install" -eq 0 ]]; then
    return 0
  fi

  log "installing iOS pods: mingle-app/rn/ios ($reason)"

  bundle_cmd="$(resolve_bundle_cmd || true)"
  if [[ -n "$bundle_cmd" ]]; then
    bundle_ruby_cmd="$(bundle_cmd_ruby_path "$bundle_cmd" || true)"
    (
      cd "$ROOT_DIR/mingle-app/rn/ios"
      mkdir -p "$bundle_home"
      if ! BUNDLE_USER_HOME="$bundle_home" \
        BUNDLE_PATH="$bundle_home" \
        BUNDLE_DISABLE_SHARED_GEMS=true \
          "$bundle_cmd" check >/dev/null 2>&1; then
        log "installing RN ruby gems for CocoaPods via: $bundle_cmd"
        if ! BUNDLE_USER_HOME="$bundle_home" \
          BUNDLE_PATH="$bundle_home" \
          BUNDLE_DISABLE_SHARED_GEMS=true \
            "$bundle_cmd" install; then
          warn "bundle install failed for RN CocoaPods; attempting direct pod fallback"
        else
          BUNDLE_USER_HOME="$bundle_home" \
          BUNDLE_PATH="$bundle_home" \
          BUNDLE_DISABLE_SHARED_GEMS=true \
            "$bundle_cmd" exec pod install
          exit $?
        fi
      else
        BUNDLE_USER_HOME="$bundle_home" \
        BUNDLE_PATH="$bundle_home" \
        BUNDLE_DISABLE_SHARED_GEMS=true \
          "$bundle_cmd" exec pod install
        exit $?
      fi
    ) && return 0
  fi

  if [[ -n "$bundle_ruby_cmd" ]]; then
    direct_pod_payload="$(resolve_direct_pod_runner "$bundle_ruby_cmd" || true)"
    direct_pod_ruby_cmd="$(printf '%s\n' "$direct_pod_payload" | sed -n '1p')"
    direct_pod_cmd="$(printf '%s\n' "$direct_pod_payload" | sed -n '2p')"
    if [[ -n "$direct_pod_ruby_cmd" && -n "$direct_pod_cmd" ]]; then
      warn "using direct pod fallback via: $direct_pod_ruby_cmd $direct_pod_cmd"
      (
        cd "$ROOT_DIR/mingle-app/rn/ios"
        "$direct_pod_ruby_cmd" "$direct_pod_cmd" install
      )
      return 0
    fi
  fi

  if command -v pod >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR/mingle-app/rn/ios"
      pod install
    )
    return 0
  fi

  die "failed to install iOS pods: neither 'bundle' nor 'pod' command is available"
}

upsert_non_managed_env_entry() {
  local file="$1"
  local key="$2"
  local value="$3"

  ensure_single_line_value "$key" "$value"
  is_valid_env_key "$key" || return 0
  ensure_file_parent "$file"

  strip_env_keys "$file" "$key"

  local formatted
  formatted="$(format_env_value_for_dotenv "$value")"

  if [[ -f "$file" && -s "$file" ]]; then
    if [[ "$(tail -c 1 "$file" 2>/dev/null || true)" != $'\n' ]]; then
      printf '\n' >> "$file"
    fi
    printf '%s=%s\n' "$key" "$formatted" >> "$file"
  else
    printf '%s=%s\n' "$key" "$formatted" > "$file"
  fi
}

decode_dotenv_value() {
  local raw="$1"
  local value
  value="$(trim_whitespace "$raw")"

  if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\"/\"}"
    value="${value//\\\\/\\}"
    value="${value//\\t/$'\t'}"
    value="${value//\\r/$'\r'}"
    value="${value//\\n/$'\n'}"
    printf '%s' "$value"
    return 0
  fi

  if [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
    value="$(printf '%s' "$value" | sed "s/'\"'\"'/\'/g")"
    printf '%s' "$value"
    return 0
  fi

  value="$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//')"
  value="$(trim_whitespace "$value")"
  printf '%s' "$value"
}

encode_private_key_for_vault() {
  local value="$1"
  # Keep PEM values single-line in Vault; service runtimes restore these
  # escaped newlines before using the key.
  value="${value//$'\r'/}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

push_env_file_to_vault_path() {
  local target="$1"
  local path="$2"
  local file="$3"
  local inspect_output=""
  local patch_output=""
  local put_output=""
  [[ -n "$path" ]] || return 0
  [[ -f "$file" ]] || {
    warn "skip vault push (${target}): env file not found: $file"
    return 0
  }

  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env
  local line raw_line key value_raw value count
  local -a kv_args=()
  count=0

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="${raw_line%$'\r'}"
    line="$(trim_whitespace "$line")"
    [[ -n "$line" ]] || continue
    [[ "${line:0:1}" == "#" ]] && continue
    line="$(printf '%s' "$line" | sed -E 's/^export[[:space:]]+//')"
    [[ "$line" == *=* ]] || continue

    key="${line%%=*}"
    value_raw="${line#*=}"
    key="$(trim_whitespace "$key")"
    is_valid_env_key "$key" || continue
    if is_managed_key_for_target "$target" "$key"; then
      continue
    fi

    value="$(decode_dotenv_value "$value_raw")"
    case "$key" in
      *_PRIVATE_KEY) value="$(encode_private_key_for_vault "$value")" ;;
    esac
    ensure_single_line_value "$key" "$value"
    kv_args+=("${key}=${value}")
    count=$((count + 1))
  done < "$file"

  if [[ "$count" -eq 0 ]]; then
    log "no non-managed keys to push from ${target} env: $file"
    return 0
  fi

  log "pushing ${count} keys from ${target} env to vault path: $path"
  if inspect_output="$(vault kv get -format=json "$path" 2>&1)"; then
    if patch_output="$(vault kv patch "$path" "${kv_args[@]}" 2>&1)"; then
      log "pushed ${count} keys to vault (${target}, patch)"
      return 0
    fi

    patch_output="$(normalize_cli_output "$patch_output")"
    if [[ -n "$patch_output" ]]; then
      die "failed to push ${target} env keys to vault path: $path (${patch_output}; refusing destructive kv put fallback)"
    fi
    die "failed to push ${target} env keys to vault path: $path (patch failed; refusing destructive kv put fallback)"
  fi

  inspect_output="$(normalize_cli_output "$inspect_output")"
  if vault_output_indicates_missing_path "$inspect_output" && vault_mount_exists_for_path "$path"; then
    log "vault path is empty; seeding initial values at: $path"
    if put_output="$(vault kv put "$path" "${kv_args[@]}" 2>&1)"; then
      log "seeded ${count} keys to vault (${target}, put)"
      return 0
    fi

    put_output="$(normalize_cli_output "$put_output")"
    if [[ -n "$put_output" ]]; then
      die "failed to seed ${target} env keys to vault path: $path (${put_output})"
    fi
    die "failed to seed ${target} env keys to vault path: $path (kv put failed)"
  fi

  if [[ -n "$inspect_output" ]]; then
    die "failed to inspect vault path for ${target}: $path (${inspect_output})"
  fi
  die "failed to inspect vault path for ${target}: $path"
}

push_env_to_vault_path() {
  local path="${1:-}"
  local root_file=""
  local app_file=""
  local stt_file=""
  local messaging_file=""

  root_file="$(main_worktree_env_file root || true)"
  app_file="$(main_worktree_env_file app || true)"
  stt_file="$(main_worktree_env_file stt || true)"
  messaging_file="$(main_worktree_env_file messaging || true)"
  [[ -n "$app_file" && -f "$app_file" ]] || die "missing main mingle-app/.env.local for Vault bootstrap"
  [[ -n "$stt_file" && -f "$stt_file" ]] || die "missing main mingle-stt/.env.local for Vault bootstrap"

  push_env_file_to_vault_path "mingle" "$path" "$app_file"
  push_env_file_to_vault_path "mingle" "$path" "$stt_file"
  if [[ -n "$messaging_file" && -f "$messaging_file" ]]; then
    push_env_file_to_vault_path "mingle" "$path" "$messaging_file"
  else
    warn "main mingle-messaging/.env.local not found; skipping messaging service env upload"
  fi
  if [[ -n "$root_file" && -f "$root_file" ]]; then
    # Push the root env last so shared values are the final source when a
    # legacy service env still contains a duplicate key.
    push_env_file_to_vault_path "mingle" "$path" "$root_file"
  else
    warn "main root .env.local not found; skipping shared root env upload"
  fi
}

cmd_vault_up() {
  local seed=0
  local vault_override=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --seed) seed=1; shift ;;
      --vault-path) vault_override="${2:-}"; shift 2 ;;
      *) die "unknown option for vault-up: $1" ;;
    esac
  done

  require_cmd brew
  require_cmd vault

  prepare_vault_cli_env
  if vault status >/dev/null 2>&1; then
    log "vault is already reachable at ${VAULT_ADDR:-"(default)"}"
  else
    log "starting local vault via Homebrew service"
    brew services start hashicorp/tap/vault >/dev/null || die "failed to start Homebrew vault service"
    wait_for_vault_ready 20 1 || die "vault did not become ready after start"
    log "vault is ready at ${VAULT_ADDR:-"(default)"}"
  fi

  if [[ "$seed" -eq 1 ]]; then
    require_devbox_env
    resolve_vault_path "$vault_override"
    [[ -n "$DEVBOX_VAULT_PATH" ]] || die "missing shared vault path for --seed (set DEVBOX_VAULT_PATH in the main root .env.local or pass --vault-path)"
    vault token lookup >/dev/null 2>&1 || die "vault is running but token lookup failed (run: vault login)"
    push_env_to_vault_path "$DEVBOX_VAULT_PATH"
  fi
}

sync_env_from_vault_path() {
  local target="$1"
  local path="$2"
  local file="$3"
  [[ -n "$path" ]] || return 0

  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env

  log "syncing ${target} env from vault path: $path"

  local payload
  payload="$(vault kv get -format=json "$path")" || die "failed to read vault path: $path"

  local line key value count
  count=0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key="${line%%$'\t'*}"
    value="${line#*$'\t'}"
    is_valid_env_key "$key" || continue
    if is_managed_key_for_target "$target" "$key"; then
      continue
    fi
    upsert_non_managed_env_entry "$file" "$key" "$value"
    count=$((count + 1))
  done < <(
    printf '%s' "$payload" | jq -r '
      ((.data.data // .data // {}) | to_entries[]? | [.key, (.value | if type=="string" then . else tojson end)] | @tsv)
    '
  )

  normalize_file_spacing "$file"
  log "synced ${count} keys from vault (${target})"
}

sync_env_from_vault_paths() {
  local path="${1:-}"
  sync_env_from_vault_path "mingle" "$path" "$ROOT_ENV_FILE"
}

write_runtime_env_from_vault_path() {
  local target="$1"
  local path="$2"
  local file="$3"

  : > "$file"
  [[ -n "$path" ]] || return 0

  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env
  log "loading ${target} runtime env from vault path: $path"

  local payload
  payload="$(vault kv get -format=json "$path")" || die "failed to read vault path: $path"

  local line key value count formatted
  count=0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key="${line%%$'\t'*}"
    value="${line#*$'\t'}"
    is_valid_env_key "$key" || continue
    if is_managed_key_for_target "$target" "$key"; then
      continue
    fi
    ensure_single_line_value "$key" "$value"
    formatted="$(format_env_value_for_dotenv "$value")"
    printf '%s=%s\n' "$key" "$formatted" >> "$file"
    count=$((count + 1))
  done < <(
    printf '%s' "$payload" | jq -r '
      ((.data.data // .data // {}) | to_entries[]? | [.key, (.value | if type=="string" then . else tojson end)] | @tsv)
    '
  )

  log "loaded ${count} runtime keys from vault (${target})"
}

resolve_vault_path() {
  local override="${1:-}"
  local path="${DEVBOX_VAULT_PATH:-}"

  if [[ -n "$override" ]]; then
    path="$override"
  fi

  if [[ -z "$path" ]]; then
    path="secret/mingle/dev"
  fi

  DEVBOX_VAULT_PATH="$path"
}

resolve_openclaw_root() {
  local root="${DEVBOX_OPENCLAW_ROOT:-}"
  if [[ -z "$root" ]]; then
    root="$(read_app_setting_value DEVBOX_OPENCLAW_ROOT || true)"
  fi
  if [[ -z "$root" ]]; then
    root="/Users/nam/openclaw"
  fi
  printf '%s' "$root"
}

remove_managed_block() {
  local file="$1"
  local out="$2"

  if [[ -f "$file" ]]; then
    awk -v start="$MANAGED_START" -v end="$MANAGED_END" '
      $0 == start { skip = 1; next }
      $0 == end { skip = 0; next }
      !skip { print }
    ' "$file" > "$out"
  else
    : > "$out"
  fi
}

normalize_file_spacing() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  local tmp
  tmp="$(mktemp)"

  # .env-like files are easiest to read with no blank lines.
  awk 'NF { print }' "$file" > "$tmp"

  mv "$tmp" "$file"
}

upsert_managed_block() {
  local file="$1"
  local block="$2"
  local tmp
  tmp="$(mktemp)"

  ensure_file_parent "$file"
  remove_managed_block "$file" "$tmp"

  if [[ -s "$tmp" ]]; then
    cat "$tmp" > "$file"
    printf '\n%s\n%s\n%s\n' "$MANAGED_START" "$block" "$MANAGED_END" >> "$file"
  else
    printf '%s\n%s\n%s\n' "$MANAGED_START" "$block" "$MANAGED_END" > "$file"
  fi

  normalize_file_spacing "$file"
  rm -f "$tmp"
}

strip_env_keys() {
  local file="$1"
  shift || true
  [[ -f "$file" ]] || return 0
  [[ "$#" -gt 0 ]] || return 0

  local key src tmp
  src="$(mktemp)"
  cp "$file" "$src"

  for key in "$@"; do
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "invalid env key for strip: $key"
    tmp="$(mktemp)"
    sed -E "/^[[:space:]]*(export[[:space:]]+)?${key}=.*/d" "$src" > "$tmp"
    mv "$tmp" "$src"
  done

  mv "$src" "$file"
  normalize_file_spacing "$file"
}

require_devbox_env() {
  local value=""

  if [[ -z "$DEVBOX_WORKTREE_NAME" ]]; then
    DEVBOX_WORKTREE_NAME="$(derive_worktree_name)"
  fi
  DEVBOX_ROOT_DIR="$ROOT_CANON"

  if [[ -z "${DEVBOX_VAULT_PATH:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_VAULT_PATH || true)")"
    [[ -n "$value" ]] && DEVBOX_VAULT_PATH="$value"
  fi
  resolve_vault_path "$DEVBOX_VAULT_PATH"
  if [[ -z "${DEVBOX_VAULT_PROD_PATH:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_VAULT_PROD_PATH || true)")"
    [[ -n "$value" ]] && DEVBOX_VAULT_PROD_PATH="$value"
  fi

  if [[ -z "${DEVBOX_OPENCLAW_ROOT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_OPENCLAW_ROOT || true)")"
    [[ -n "$value" ]] && DEVBOX_OPENCLAW_ROOT="$value"
  fi
  if [[ -z "${DEVBOX_OPENCLAW_ROOT:-}" ]]; then
    DEVBOX_OPENCLAW_ROOT="$(resolve_openclaw_root)"
  fi

  calc_default_ports
  if [[ -z "${DEVBOX_WEB_PORT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_WEB_PORT || true)")"
    [[ -n "$value" ]] && DEVBOX_WEB_PORT="$value"
  fi
  if [[ -z "${DEVBOX_STT_PORT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_STT_PORT || true)")"
    [[ -n "$value" ]] && DEVBOX_STT_PORT="$value"
  fi
  if [[ -z "${DEVBOX_MESSAGING_PORT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_MESSAGING_PORT || true)")"
    [[ -n "$value" ]] && DEVBOX_MESSAGING_PORT="$value"
  fi
  if [[ -z "${DEVBOX_METRO_PORT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_METRO_PORT || true)")"
    [[ -n "$value" ]] && DEVBOX_METRO_PORT="$value"
  fi
  if [[ -z "${DEVBOX_NGROK_API_PORT:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_NGROK_API_PORT || true)")"
    [[ -n "$value" ]] && DEVBOX_NGROK_API_PORT="$value"
  fi
  [[ -n "${DEVBOX_WEB_PORT:-}" ]] || DEVBOX_WEB_PORT="$DEFAULT_WEB_PORT"
  [[ -n "${DEVBOX_STT_PORT:-}" ]] || DEVBOX_STT_PORT="$DEFAULT_STT_PORT"
  [[ -n "${DEVBOX_MESSAGING_PORT:-}" ]] || DEVBOX_MESSAGING_PORT="$DEFAULT_MESSAGING_PORT"
  [[ -n "${DEVBOX_METRO_PORT:-}" ]] || DEVBOX_METRO_PORT="$DEFAULT_METRO_PORT"
  [[ -n "${DEVBOX_NGROK_API_PORT:-}" ]] || DEVBOX_NGROK_API_PORT="$DEFAULT_NGROK_API_PORT"

  if [[ -z "${DEVBOX_PROFILE:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_PROFILE || true)")"
    [[ -n "$value" ]] && DEVBOX_PROFILE="$value"
  fi
  [[ -n "${DEVBOX_PROFILE:-}" ]] || DEVBOX_PROFILE="local"

  if [[ -z "${DEVBOX_LOCAL_HOST:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_LOCAL_HOST || true)")"
    [[ -n "$value" ]] && DEVBOX_LOCAL_HOST="$value"
  fi
  [[ -n "${DEVBOX_LOCAL_HOST:-}" ]] || DEVBOX_LOCAL_HOST="127.0.0.1"

  if [[ -z "${DEVBOX_SITE_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_SITE_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_SITE_URL="$value"
  fi
  if [[ -z "${DEVBOX_RN_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_RN_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_RN_WS_URL="$value"
  fi
  if [[ -z "${DEVBOX_RN_MESSAGING_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_RN_MESSAGING_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_RN_MESSAGING_WS_URL="$value"
  fi
  if [[ -z "${DEVBOX_PUBLIC_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_PUBLIC_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_PUBLIC_WS_URL="$value"
  fi
  if [[ -z "${DEVBOX_PUBLIC_MESSAGING_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_PUBLIC_MESSAGING_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_PUBLIC_MESSAGING_WS_URL="$value"
  fi
  if [[ -z "${DEVBOX_RN_FALLBACK_SITE_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_RN_FALLBACK_SITE_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_RN_FALLBACK_SITE_URL="$value"
  fi
  if [[ -z "${DEVBOX_RN_FALLBACK_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_RN_FALLBACK_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_RN_FALLBACK_WS_URL="$value"
  fi
  if [[ -z "${DEVBOX_TEST_API_BASE_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_TEST_API_BASE_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_TEST_API_BASE_URL="$value"
  fi
  if [[ -z "${DEVBOX_TEST_WS_URL:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_TEST_WS_URL || true)")"
    [[ -n "$value" ]] && DEVBOX_TEST_WS_URL="$value"
  fi

  if [[ -z "${DEVBOX_IOS_TEAM_ID:-}" ]]; then
    value="$(trim_whitespace "$(read_app_setting_value DEVBOX_IOS_TEAM_ID || true)")"
    [[ -n "$value" ]] && DEVBOX_IOS_TEAM_ID="$value"
  fi

  : "${DEVBOX_WORKTREE_NAME:?missing DEVBOX_WORKTREE_NAME}"
  : "${DEVBOX_WEB_PORT:?missing DEVBOX_WEB_PORT}"
  : "${DEVBOX_STT_PORT:?missing DEVBOX_STT_PORT}"
  : "${DEVBOX_MESSAGING_PORT:?missing DEVBOX_MESSAGING_PORT}"
  : "${DEVBOX_METRO_PORT:?missing DEVBOX_METRO_PORT}"
  : "${DEVBOX_PROFILE:?missing DEVBOX_PROFILE}"
  case "$DEVBOX_PROFILE" in
    local|device) ;;
    *) die "invalid DEVBOX_PROFILE: $DEVBOX_PROFILE (expected local|device)" ;;
  esac
  if [[ -z "${DEVBOX_SITE_URL:-}" ]]; then
    DEVBOX_SITE_URL="http://$DEVBOX_LOCAL_HOST:$DEVBOX_WEB_PORT"
  fi
  if [[ -z "${DEVBOX_RN_WS_URL:-}" ]]; then
    DEVBOX_RN_WS_URL="ws://$DEVBOX_LOCAL_HOST:$DEVBOX_STT_PORT"
  fi
  if [[ -z "${DEVBOX_RN_MESSAGING_WS_URL:-}" ]]; then
    DEVBOX_RN_MESSAGING_WS_URL="ws://$DEVBOX_LOCAL_HOST:$DEVBOX_MESSAGING_PORT"
  fi
  if [[ -z "${DEVBOX_PUBLIC_WS_URL:-}" && "$DEVBOX_PROFILE" == "device" ]]; then
    DEVBOX_PUBLIC_WS_URL="$DEVBOX_RN_WS_URL"
  fi
  if [[ -z "${DEVBOX_PUBLIC_MESSAGING_WS_URL:-}" && "$DEVBOX_PROFILE" == "device" ]]; then
    DEVBOX_PUBLIC_MESSAGING_WS_URL="$DEVBOX_RN_MESSAGING_WS_URL"
  fi
  if [[ -z "${DEVBOX_PUBLIC_MESSAGING_WS_URL:-}" && "$DEVBOX_PROFILE" == "local" ]]; then
    DEVBOX_PUBLIC_MESSAGING_WS_URL="$DEVBOX_RN_MESSAGING_WS_URL"
  fi
  if [[ -z "${DEVBOX_TEST_API_BASE_URL:-}" ]]; then
    DEVBOX_TEST_API_BASE_URL="http://127.0.0.1:$DEVBOX_WEB_PORT"
  fi
  if [[ -z "${DEVBOX_TEST_WS_URL:-}" ]]; then
    DEVBOX_TEST_WS_URL="ws://127.0.0.1:$DEVBOX_STT_PORT"
  fi
  : "${DEVBOX_SITE_URL:?missing DEVBOX_SITE_URL}"
  : "${DEVBOX_RN_WS_URL:?missing DEVBOX_RN_WS_URL}"
  : "${DEVBOX_RN_MESSAGING_WS_URL:?missing DEVBOX_RN_MESSAGING_WS_URL}"
  : "${DEVBOX_TEST_API_BASE_URL:?missing DEVBOX_TEST_API_BASE_URL}"
  : "${DEVBOX_TEST_WS_URL:?missing DEVBOX_TEST_WS_URL}"

  validate_port "DEVBOX_WEB_PORT" "$DEVBOX_WEB_PORT"
  validate_port "DEVBOX_STT_PORT" "$DEVBOX_STT_PORT"
  validate_port "DEVBOX_MESSAGING_PORT" "$DEVBOX_MESSAGING_PORT"
  validate_port "DEVBOX_METRO_PORT" "$DEVBOX_METRO_PORT"
  validate_port "DEVBOX_NGROK_API_PORT" "$DEVBOX_NGROK_API_PORT"
  validate_http_url "DEVBOX_SITE_URL" "$DEVBOX_SITE_URL"
  validate_ws_url "DEVBOX_RN_WS_URL" "$DEVBOX_RN_WS_URL"
  validate_ws_url "DEVBOX_RN_MESSAGING_WS_URL" "$DEVBOX_RN_MESSAGING_WS_URL"
  if [[ -n "$DEVBOX_PUBLIC_WS_URL" ]]; then
    validate_ws_url "DEVBOX_PUBLIC_WS_URL" "$DEVBOX_PUBLIC_WS_URL"
  fi
  if [[ -n "$DEVBOX_PUBLIC_MESSAGING_WS_URL" ]]; then
    validate_ws_url "DEVBOX_PUBLIC_MESSAGING_WS_URL" "$DEVBOX_PUBLIC_MESSAGING_WS_URL"
  fi
  validate_http_url "DEVBOX_TEST_API_BASE_URL" "$DEVBOX_TEST_API_BASE_URL"
  validate_ws_url "DEVBOX_TEST_WS_URL" "$DEVBOX_TEST_WS_URL"

  if [[ "$DEVBOX_PROFILE" == "local" ]]; then
    validate_host "$DEVBOX_LOCAL_HOST"
  fi
}

write_devbox_env_file() {
  local key=""
  local value=""

  prepare_generated_file "$DEVBOX_ENV_FILE"
  cat > "$DEVBOX_ENV_FILE" <<EOF
# Auto-generated by scripts/devbox.
# Worktree-local runtime configuration.
EOF

  for key in \
    DEVBOX_WORKTREE_NAME \
    DEVBOX_ROOT_DIR \
    DEVBOX_PROFILE \
    DEVBOX_WEB_PORT \
    DEVBOX_STT_PORT \
    DEVBOX_MESSAGING_PORT \
    DEVBOX_METRO_PORT \
    DEVBOX_NGROK_API_PORT \
    DEVBOX_SITE_URL \
    DEVBOX_RN_WS_URL \
    DEVBOX_RN_MESSAGING_WS_URL \
    DEVBOX_PUBLIC_WS_URL \
    DEVBOX_PUBLIC_MESSAGING_WS_URL \
    DEVBOX_TEST_API_BASE_URL \
    DEVBOX_TEST_WS_URL \
    NEXT_PUBLIC_SITE_URL \
    NEXTAUTH_URL \
    NEXT_PUBLIC_WS_PORT \
    NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_MESSAGING_WS_URL \
    MINGLE_MESSAGING_URL \
    MINGLE_TEST_API_BASE_URL \
    MINGLE_TEST_WS_URL
  do
    case "$key" in
      NEXT_PUBLIC_SITE_URL|NEXTAUTH_URL) value="${DEVBOX_SITE_URL:-}" ;;
      NEXT_PUBLIC_WS_PORT) value="${DEVBOX_STT_PORT:-}" ;;
      NEXT_PUBLIC_WS_URL) value="${DEVBOX_RN_WS_URL:-}" ;;
      NEXT_PUBLIC_MESSAGING_WS_URL) value="${DEVBOX_RN_MESSAGING_WS_URL:-}" ;;
      MINGLE_MESSAGING_URL) value="http://127.0.0.1:${DEVBOX_MESSAGING_PORT:-}" ;;
      MINGLE_TEST_API_BASE_URL) value="${DEVBOX_TEST_API_BASE_URL:-}" ;;
      MINGLE_TEST_WS_URL) value="${DEVBOX_TEST_WS_URL:-}" ;;
      *) value="${!key:-}" ;;
    esac
    printf '%s=%s\n' "$key" "$(format_env_value_for_dotenv "$value")" >> "$DEVBOX_ENV_FILE"
  done
}

write_app_env_block() {
  local block
  strip_env_keys "$APP_ENV_FILE" "${APP_MANAGED_KEYS[@]}"

  block="$(cat <<EOF
DEVBOX_WORKTREE_NAME=$DEVBOX_WORKTREE_NAME
DEVBOX_PROFILE=$DEVBOX_PROFILE
DEVBOX_WEB_PORT=$DEVBOX_WEB_PORT
DEVBOX_STT_PORT=$DEVBOX_STT_PORT
DEVBOX_MESSAGING_PORT=$DEVBOX_MESSAGING_PORT
DEVBOX_METRO_PORT=$DEVBOX_METRO_PORT
NEXT_PUBLIC_SITE_URL=$DEVBOX_SITE_URL
NEXTAUTH_URL=$DEVBOX_SITE_URL
NEXT_PUBLIC_WS_PORT=$DEVBOX_STT_PORT
NEXT_PUBLIC_WS_URL=$DEVBOX_PUBLIC_WS_URL
NEXT_PUBLIC_MESSAGING_WS_URL=$DEVBOX_PUBLIC_MESSAGING_WS_URL
MINGLE_MESSAGING_URL=http://127.0.0.1:$DEVBOX_MESSAGING_PORT
NEXT_PUBLIC_API_NAMESPACE=$IOS_RN_REQUIRED_API_NAMESPACE
MINGLE_TEST_API_BASE_URL=$DEVBOX_TEST_API_BASE_URL
MINGLE_TEST_WS_URL=$DEVBOX_TEST_WS_URL
EOF
)"

  upsert_managed_block "$APP_ENV_FILE" "$block"
}

build_devbox_nextauth_secret() {
  local checksum
  checksum="$(printf '%s' "${ROOT_CANON}|${DEVBOX_WORKTREE_NAME}|${DEVBOX_WEB_PORT}" | cksum | awk '{print $1}')"
  printf 'devbox-nextauth-%s-%s' "$DEVBOX_WORKTREE_NAME" "$checksum"
}

ensure_devbox_nextauth_secret() {
  local existing_nextauth_secret existing_auth_secret
  existing_nextauth_secret="$(read_env_value_from_file NEXTAUTH_SECRET "$APP_ENV_FILE")"
  existing_auth_secret="$(read_env_value_from_file AUTH_SECRET "$APP_ENV_FILE")"
  if [[ -n "$existing_nextauth_secret" || -n "$existing_auth_secret" ]]; then
    return 0
  fi

  upsert_non_managed_env_entry "$APP_ENV_FILE" "NEXTAUTH_SECRET" "$(build_devbox_nextauth_secret)"
}

resolve_runtime_nextauth_secret() {
  local runtime_file="$1"
  local value=""

  value="$(read_env_value_from_file NEXTAUTH_SECRET "$runtime_file")"
  if [[ -z "$value" ]]; then
    value="$(read_env_value_from_file AUTH_SECRET "$runtime_file")"
  fi
  if [[ -z "$value" ]]; then
    value="$(read_main_root_setting_value NEXTAUTH_SECRET || true)"
  fi
  if [[ -z "$value" ]]; then
    value="$(read_main_root_setting_value AUTH_SECRET || true)"
  fi
  if [[ -z "$value" ]]; then
    value="$(read_env_value_from_file NEXTAUTH_SECRET "$APP_ENV_FILE")"
  fi
  if [[ -z "$value" ]]; then
    value="$(read_env_value_from_file AUTH_SECRET "$APP_ENV_FILE")"
  fi
  if [[ -z "$value" ]]; then
    value="$(build_devbox_nextauth_secret)"
  fi

  ensure_single_line_value "NEXTAUTH_SECRET" "$value"
  printf '%s' "$value"
}

write_stt_env_block() {
  local block
  strip_env_keys "$STT_ENV_FILE" "${STT_MANAGED_KEYS[@]}"

  block="$(cat <<EOF
DEVBOX_WORKTREE_NAME=$DEVBOX_WORKTREE_NAME
DEVBOX_PROFILE=$DEVBOX_PROFILE
PORT=$DEVBOX_STT_PORT
EOF
)"

  upsert_managed_block "$STT_ENV_FILE" "$block"
}

resolve_ngrok_web_domain() {
  local raw=""
  local domain=""
  raw="$(read_app_setting_value DEVBOX_NGROK_WEB_DOMAIN || true)"
  domain="$(normalize_domain_input "$raw")"
  [[ -n "$domain" ]] || return 1
  validate_host "$domain"
  printf '%s' "$domain"
}

write_ngrok_local_config() {
  local ngrok_web_domain=""
  ngrok_web_domain="$(resolve_ngrok_web_domain || true)"

  cat > "$NGROK_LOCAL_CONFIG" <<EOF
version: "3"
agent:
  web_addr: 127.0.0.1:$DEVBOX_NGROK_API_PORT
tunnels:
  devbox_web:
    addr: $DEVBOX_WEB_PORT
    proto: http
EOF

  if [[ -n "$ngrok_web_domain" ]]; then
    cat >> "$NGROK_LOCAL_CONFIG" <<EOF
    domain: $ngrok_web_domain
EOF
  fi

  cat >> "$NGROK_LOCAL_CONFIG" <<EOF
  devbox_stt:
    addr: $DEVBOX_STT_PORT
    proto: http
  devbox_messaging:
    addr: $DEVBOX_MESSAGING_PORT
    proto: http
EOF
}

write_rn_ios_runtime_xcconfig() {
  local site_scheme="${DEVBOX_SITE_URL%%://*}"
  local site_host="${DEVBOX_SITE_URL#*://}"
  local ws_scheme="${DEVBOX_RN_WS_URL%%://*}"
  local ws_host="${DEVBOX_RN_WS_URL#*://}"
  local qa_bridge_enabled=""
  local ad_banner_position=""
  local ad_banner_height_px=""
  local admob_app_id_ios=""
  local admob_banner_unit_id_ios=""
  local xcconfig_site_url="$DEVBOX_SITE_URL"
  local xcconfig_ws_url="$DEVBOX_RN_WS_URL"
  local xcconfig_fallback_site_url="${DEVBOX_RN_FALLBACK_SITE_URL:-$DEFAULT_RN_FALLBACK_SITE_URL}"
  local xcconfig_fallback_ws_url="${DEVBOX_RN_FALLBACK_WS_URL:-$DEFAULT_RN_FALLBACK_WS_URL}"
  local xcconfig_url_comment_breaker='$()'
  local xcconfig_url_scheme_separator='://'
  local xcconfig_url_scheme_replacement=":/$xcconfig_url_comment_breaker/"
  local xcconfig_admob_app_id_ios=""
  local xcconfig_admob_banner_unit_id_ios=""
  xcconfig_site_url="${xcconfig_site_url//\\/\\\\}"
  xcconfig_site_url="${xcconfig_site_url//\"/\\\"}"
  xcconfig_site_url="${xcconfig_site_url/$xcconfig_url_scheme_separator/$xcconfig_url_scheme_replacement}"
  xcconfig_ws_url="${xcconfig_ws_url//\\/\\\\}"
  xcconfig_ws_url="${xcconfig_ws_url//\"/\\\"}"
  xcconfig_ws_url="${xcconfig_ws_url/$xcconfig_url_scheme_separator/$xcconfig_url_scheme_replacement}"
  xcconfig_fallback_site_url="${xcconfig_fallback_site_url//\\/\\\\}"
  xcconfig_fallback_site_url="${xcconfig_fallback_site_url//\"/\\\"}"
  xcconfig_fallback_site_url="${xcconfig_fallback_site_url/$xcconfig_url_scheme_separator/$xcconfig_url_scheme_replacement}"
  xcconfig_fallback_ws_url="${xcconfig_fallback_ws_url//\\/\\\\}"
  xcconfig_fallback_ws_url="${xcconfig_fallback_ws_url//\"/\\\"}"
  xcconfig_fallback_ws_url="${xcconfig_fallback_ws_url/$xcconfig_url_scheme_separator/$xcconfig_url_scheme_replacement}"
  qa_bridge_enabled="$(resolve_devbox_qa_bridge_enabled)"
  ad_banner_position="$(resolve_devbox_ad_banner_position ios)"
  ad_banner_height_px="$(resolve_devbox_ad_banner_height_px)"
  admob_app_id_ios="$(resolve_devbox_admob_app_id_ios)"
  admob_banner_unit_id_ios="$(resolve_devbox_admob_banner_unit_id_ios)"
  require_nonempty_runtime_value "RN_ADMOB_APP_ID_IOS" "$admob_app_id_ios"
  require_nonempty_runtime_value "RN_ADMOB_BANNER_UNIT_ID_IOS" "$admob_banner_unit_id_ios"
  xcconfig_admob_app_id_ios="${admob_app_id_ios//\\/\\\\}"
  xcconfig_admob_app_id_ios="${xcconfig_admob_app_id_ios//\"/\\\"}"
  xcconfig_admob_banner_unit_id_ios="${admob_banner_unit_id_ios//\\/\\\\}"
  xcconfig_admob_banner_unit_id_ios="${xcconfig_admob_banner_unit_id_ios//\"/\\\"}"

  cat > "$RN_IOS_RUNTIME_XCCONFIG" <<EOF
// Auto-generated by scripts/devbox.
// iOS RN runtime endpoints for this worktree/profile.
NEXT_PUBLIC_SITE_URL = $xcconfig_site_url
NEXT_PUBLIC_WS_URL = $xcconfig_ws_url
NEXT_PUBLIC_SITE_SCHEME = $site_scheme
NEXT_PUBLIC_SITE_HOST = $site_host
NEXT_PUBLIC_WS_SCHEME = $ws_scheme
NEXT_PUBLIC_WS_HOST = $ws_host
MINGLE_LEGACY_SITE_URL = $xcconfig_fallback_site_url
MINGLE_LEGACY_WS_URL = $xcconfig_fallback_ws_url
NEXT_PUBLIC_API_NAMESPACE = $IOS_RN_REQUIRED_API_NAMESPACE
NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED = $qa_bridge_enabled
RN_ADMOB_APP_ID_IOS = $xcconfig_admob_app_id_ios
NEXT_PUBLIC_RN_AD_BANNER_POSITION = $ad_banner_position
NEXT_PUBLIC_RN_AD_BANNER_HEIGHT_PX = $ad_banner_height_px
NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_IOS = $xcconfig_admob_banner_unit_id_ios
EOF
}

refresh_runtime_files() {
  # Default runtime refresh is stateless for app/stt dotenv files.
  # Keep ngrok/xcconfig outputs up-to-date for current run/install.
  write_ngrok_local_config
  write_rn_ios_runtime_xcconfig
}

set_local_profile_values() {
  local host="$1"
  validate_host "$host"

  DEVBOX_PROFILE="local"
  DEVBOX_LOCAL_HOST="$host"
  DEVBOX_SITE_URL="http://$host:$DEVBOX_WEB_PORT"
  DEVBOX_RN_WS_URL="ws://$host:$DEVBOX_STT_PORT"
  DEVBOX_RN_MESSAGING_WS_URL="ws://$host:$DEVBOX_MESSAGING_PORT"
  DEVBOX_PUBLIC_WS_URL=""
  DEVBOX_PUBLIC_MESSAGING_WS_URL="$DEVBOX_RN_MESSAGING_WS_URL"
  DEVBOX_TEST_API_BASE_URL="http://127.0.0.1:$DEVBOX_WEB_PORT"
  DEVBOX_TEST_WS_URL="ws://127.0.0.1:$DEVBOX_STT_PORT"
}

to_wss_url() {
  local input="$1"
  case "$input" in
    https://*) printf 'wss://%s' "${input#https://}" ;;
    http://*) printf 'ws://%s' "${input#http://}" ;;
    ws://*|wss://*) printf '%s' "$input" ;;
    *) die "unsupported websocket url format: $input" ;;
  esac
}

ngrok_plan_capacity_hint() {
  cat <<'EOF'
hint: ngrok free plan limits can vary by account generation (often 1~3 online endpoints).
      devbox device profile uses 3 endpoints (web+stt+messaging) per worktree.
      verify your exact limits from ngrok dashboard usage/billing pages.
EOF
}

escape_for_osascript_string() {
  local input="$1"
  input="${input//\\/\\\\}"
  input="${input//\"/\\\"}"
  printf '%s' "$input"
}

build_ngrok_launch_command() {
  local root_q
  root_q="$(printf '%q' "$ROOT_DIR")"
  printf 'cd %s && scripts/ngrok-start-mobile.sh --log stdout --log-format logfmt' "$root_q"
}

launch_ngrok_in_iterm_app() {
  local app_name="$1"
  local command_text="$2"
  local escaped_command
  escaped_command="$(escape_for_osascript_string "$command_text")"

  osascript >/dev/null <<EOF
tell application "$app_name"
  activate
  if (count of windows) = 0 then
    create window with default profile
  end if
  tell current window
    tell current session
      set newSession to (split vertically with default profile)
    end tell
    tell newSession
      write text "$escaped_command"
    end tell
  end tell
end tell
EOF
}

launch_ngrok_in_terminal_app() {
  local command_text="$1"
  local escaped_command
  escaped_command="$(escape_for_osascript_string "$command_text")"

  osascript >/dev/null <<EOF
tell application "Terminal"
  activate
  do script "$escaped_command"
end tell
EOF
}

launch_ngrok_in_separate_terminal() {
  local ngrok_command
  ngrok_command="$(build_ngrok_launch_command)"

  command -v osascript >/dev/null 2>&1 || return 1

  case "${TERM_PROGRAM:-}" in
    iTerm.app)
      launch_ngrok_in_iterm_app "iTerm2" "$ngrok_command" \
        || launch_ngrok_in_iterm_app "iTerm" "$ngrok_command"
      ;;
    Apple_Terminal)
      launch_ngrok_in_terminal_app "$ngrok_command"
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_ios_configuration() {
  local raw="${1:-Release}"
  case "$raw" in
    Debug|debug) printf 'Debug' ;;
    Release|release) printf 'Release' ;;
    *) die "invalid --ios-configuration: $raw (expected Debug|Release)" ;;
  esac
}

normalize_ios_runtime() {
  local raw="${1:-rn}"
  local lowered
  lowered="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$lowered" in
    rn) printf 'rn' ;;
    native|both) die "mingle-ios has been removed; use React Native iOS only." ;;
    *) die "invalid --ios-runtime: $raw (expected rn)" ;;
  esac
}

normalize_android_variant() {
  local raw="${1:-release}"
  case "$raw" in
    debug|Debug) printf 'debug' ;;
    release|Release) printf 'release' ;;
    *) die "invalid --android-variant: $raw (expected debug|release)" ;;
  esac
}

normalize_tunnel_provider() {
  local raw="${1:-ngrok}"
  local lowered
  lowered="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$lowered" in
    ngrok) printf 'ngrok' ;;
    cloudflare|cloudflared|cf) printf 'cloudflare' ;;
    *)
      die "invalid tunnel provider: $raw (expected ngrok|cloudflare)"
      ;;
  esac
}

resolve_tunnel_provider() {
  local override="${1:-}"
  local raw="$override"

  if [[ -z "$raw" ]]; then
    raw="${DEVBOX_TUNNEL_PROVIDER:-}"
  fi
  if [[ -z "$raw" ]]; then
    raw="$(trim_whitespace "$(read_app_setting_value DEVBOX_TUNNEL_PROVIDER || true)")"
  fi
  if [[ -z "$raw" ]]; then
    raw="ngrok"
  fi

  normalize_tunnel_provider "$raw"
}

cloudflared_named_pid_file_path() {
  local worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/.devbox-cache/cloudflared/%s.named.pid' "$ROOT_DIR" "$worktree"
}

cloudflared_named_log_file_path() {
  local worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/.devbox-cache/cloudflared/%s.named.log' "$ROOT_DIR" "$worktree"
}

cloudflared_named_config_file_path() {
  local worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/.devbox-cache/cloudflared/%s.named.yml' "$ROOT_DIR" "$worktree"
}

cloudflared_named_bridge_pid_file_path() {
  local kind="$1"
  local worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/.devbox-cache/cloudflared/%s.named-bridge-%s.pid' "$ROOT_DIR" "$worktree" "$kind"
}

cloudflared_named_bridge_log_file_path() {
  local kind="$1"
  local worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/.devbox-cache/cloudflared/%s.named-bridge-%s.log' "$ROOT_DIR" "$worktree" "$kind"
}

resolve_cloudflare_named_tunnel_settings() {
  local token web_host stt_host messaging_host
  token="$(trim_whitespace "${DEVBOX_CLOUDFLARE_TUNNEL_TOKEN:-}")"
  web_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_WEB_HOSTNAME:-}")"
  stt_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_STT_HOSTNAME:-}")"
  messaging_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME:-}")"

  if [[ -z "$token" ]]; then
    token="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_TUNNEL_TOKEN || true)")"
  fi
  if [[ -z "$web_host" ]]; then
    web_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_WEB_HOSTNAME || true)")"
  fi
  if [[ -z "$stt_host" ]]; then
    stt_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_STT_HOSTNAME || true)")"
  fi
  if [[ -z "$messaging_host" ]]; then
    messaging_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME || true)")"
  fi

  if [[ -z "$token" && -z "$web_host" && -z "$stt_host" && -z "$messaging_host" ]]; then
    return 1
  fi

  [[ -n "$token" ]] || die "missing DEVBOX_CLOUDFLARE_TUNNEL_TOKEN for named tunnel mode"
  [[ -n "$web_host" ]] || die "missing DEVBOX_CLOUDFLARE_WEB_HOSTNAME for named tunnel mode"
  [[ -n "$stt_host" ]] || die "missing DEVBOX_CLOUDFLARE_STT_HOSTNAME for named tunnel mode"
  [[ -n "$messaging_host" ]] || die "missing DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME for named tunnel mode"

  web_host="$(normalize_domain_input "$web_host")"
  stt_host="$(normalize_domain_input "$stt_host")"
  messaging_host="$(normalize_domain_input "$messaging_host")"
  validate_host "$web_host"
  validate_host "$stt_host"
  validate_host "$messaging_host"
  ensure_single_line_value "DEVBOX_CLOUDFLARE_TUNNEL_TOKEN" "$token"

  printf '%s\n%s\n%s\n%s\n' "$token" "$web_host" "$stt_host" "$messaging_host"
}

resolve_cloudflare_named_hostnames() {
  local web_host stt_host messaging_host
  web_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_WEB_HOSTNAME:-}")"
  stt_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_STT_HOSTNAME:-}")"
  messaging_host="$(trim_whitespace "${DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME:-}")"

  if [[ -z "$web_host" ]]; then
    web_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_WEB_HOSTNAME || true)")"
  fi
  if [[ -z "$stt_host" ]]; then
    stt_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_STT_HOSTNAME || true)")"
  fi
  if [[ -z "$messaging_host" ]]; then
    messaging_host="$(trim_whitespace "$(read_app_setting_value DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME || true)")"
  fi

  if [[ -z "$web_host" && -z "$stt_host" && -z "$messaging_host" ]]; then
    return 1
  fi

  [[ -n "$web_host" ]] || die "missing DEVBOX_CLOUDFLARE_WEB_HOSTNAME for cloudflare named host profile"
  [[ -n "$stt_host" ]] || die "missing DEVBOX_CLOUDFLARE_STT_HOSTNAME for cloudflare named host profile"
  [[ -n "$messaging_host" ]] || die "missing DEVBOX_CLOUDFLARE_MESSAGING_HOSTNAME for cloudflare named host profile"

  web_host="$(normalize_domain_input "$web_host")"
  stt_host="$(normalize_domain_input "$stt_host")"
  messaging_host="$(normalize_domain_input "$messaging_host")"
  validate_host "$web_host"
  validate_host "$stt_host"
  validate_host "$messaging_host"

  printf '%s\n%s\n%s\n' "$web_host" "$stt_host" "$messaging_host"
}

wait_for_cloudflared_named_tunnel() {
  local log_file="$1"
  local pid="$2"
  local timeout_sec="${3:-20}"
  local elapsed=0
  local ready_pattern='Registered tunnel connection|Connection .* registered|Initial protocol'

  while (( elapsed < timeout_sec )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 1
    fi
    if [[ -f "$log_file" ]] && grep -Eq "$ready_pattern" "$log_file"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

stop_cloudflared_named_tunnel_from_pidfile() {
  local pid_file
  local pid

  pid_file="$(cloudflared_named_pid_file_path)"
  [[ -f "$pid_file" ]] || return 0

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "stopping cloudflared named tunnel connector (pid: $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "$pid_file"
}

write_cloudflared_named_config() {
  local config_file="$1"
  local web_host="$2"
  local stt_host="$3"
  local messaging_host="$4"

  mkdir -p "$(dirname "$config_file")"
  cat >"$config_file" <<EOF
originRequest:
  noTLSVerify: true
  http2Origin: false
ingress:
  - hostname: $web_host
    service: http://127.0.0.1:$DEVBOX_WEB_PORT
  - hostname: $stt_host
    service: http://127.0.0.1:$DEVBOX_STT_PORT
  - hostname: $messaging_host
    service: http://127.0.0.1:$DEVBOX_MESSAGING_PORT
  - service: http_status:404
EOF
}

extract_cloudflared_named_service_port() {
  local log_file="$1"
  local hostname="$2"
  [[ -f "$log_file" ]] || return 0

  python3 - "$log_file" "$hostname" <<'PY'
import json
import re
import sys

log_file, hostname = sys.argv[1], sys.argv[2]
config_pattern = re.compile(r'config="((?:\\.|[^"])*)"')
service_pattern = re.compile(r"^http://localhost:(\d+)$")
port = ""
with open(log_file, "r", encoding="utf-8", errors="ignore") as handle:
    for line in handle:
        if "Updated to new configuration" not in line:
            continue
        config_match = config_pattern.search(line)
        if not config_match:
            continue
        try:
            config_json = bytes(config_match.group(1), "utf-8").decode("unicode_escape")
            payload = json.loads(config_json)
        except Exception:
            continue

        for ingress in payload.get("ingress", []):
            if ingress.get("hostname") != hostname:
                continue
            service = ingress.get("service", "")
            service_match = service_pattern.match(service)
            if service_match:
                port = service_match.group(1)
                break
        if port:
            break
if port:
    print(port)
PY
}

wait_for_cloudflared_named_service_port() {
  local log_file="$1"
  local pid="$2"
  local hostname="$3"
  local timeout_sec="${4:-15}"
  local elapsed=0
  local port=""

  while (( elapsed < timeout_sec )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 1
    fi

    port="$(extract_cloudflared_named_service_port "$log_file" "$hostname" || true)"
    if [[ -n "$port" ]]; then
      printf '%s' "$port"
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

stop_cloudflared_named_bridge() {
  local kind="$1"
  local pid_file
  local pid

  pid_file="$(cloudflared_named_bridge_pid_file_path "$kind")"
  [[ -f "$pid_file" ]] || return 0

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "stopping cloudflared named bridge($kind) (pid: $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "$pid_file"
}

ensure_cloudflared_named_bridge() {
  local kind="$1"
  local remote_port="$2"
  local target_port="$3"
  local tracked_pids_ref="${4:-}"
  local pid_file log_file bridge_pid

  [[ -n "$remote_port" ]] || return 0
  if [[ "$remote_port" == "$target_port" ]]; then
    stop_cloudflared_named_bridge "$kind"
    return 0
  fi

  pid_file="$(cloudflared_named_bridge_pid_file_path "$kind")"
  log_file="$(cloudflared_named_bridge_log_file_path "$kind")"
  mkdir -p "$(dirname "$pid_file")"

  stop_cloudflared_named_bridge "$kind"
  rm -f "$log_file"
  stop_listeners_by_port "cloudflared named bridge($kind)" "$remote_port"

  log "starting cloudflared named bridge($kind): localhost:$remote_port -> 127.0.0.1:$target_port"
  python3 "$ROOT_DIR/scripts/devbox-port-bridge.py" \
    --listen-host 127.0.0.1 \
    --listen-port "$remote_port" \
    --target-host 127.0.0.1 \
    --target-port "$target_port" >"$log_file" 2>&1 &
  bridge_pid="$!"
  printf '%s\n' "$bridge_pid" > "$pid_file"

  if [[ -n "$tracked_pids_ref" ]]; then
    eval "$tracked_pids_ref+=(\"$bridge_pid\")"
  fi
}

detect_ios_coredevice_id() {
  command -v xcrun >/dev/null 2>&1 || return 1
  xcrun devicectl list devices 2>/dev/null | awk '
      /connected|available \(paired\)/ {
        if (match($0, /[0-9A-F-]{20,40}/)) {
          id = substr($0, RSTART, RLENGTH)
          if ($0 ~ / connected/) {
            print id
            exit
          }
          if (first == "") first = id
        }
      }
      END {
        if (first != "") print first
      }
    ' | head -n 1
}

detect_ios_xcode_destination_udid() {
  command -v xcodebuild >/dev/null 2>&1 || return 1
  local workspace="$ROOT_DIR/mingle-app/rn/ios/mingle.xcworkspace"
  local destination_udid=""
  [[ -d "$workspace" ]] || return 1

  destination_udid="$(
    xcodebuild \
      -workspace "$workspace" \
      -scheme mingle \
      -showdestinations 2>&1 | awk '
      /platform:iOS/ && /id:/ && /name:/ {
        line = $0
        if (line ~ /platform:iOS Simulator/) next
        if (line ~ /Any iOS Device/) next
        if (line ~ /error:[^,}]*not connected/) next
        id = ""
        if (match(line, /id:[^,}]+/)) {
          id = substr(line, RSTART + 3, RLENGTH - 3)
          gsub(/[[:space:]]/, "", id)
        }
        if (id == "" || id ~ /placeholder/) next
        print id
        exit
      }
    ' || true
  )"

  if [[ -n "$destination_udid" ]]; then
    printf '%s' "$destination_udid"
    return 0
  fi

  command -v xcrun >/dev/null 2>&1 || return 1
  xcrun xctrace list devices 2>/dev/null | awk '
    /^== Devices ==/ { in_devices = 1; next }
    /^== Simulators ==/ { in_devices = 0 }
    !in_devices { next }
    {
      line = $0
      if (line ~ /MacBook|^Mac /) next
      if (match(line, /\([0-9A-F-]{20,40}\)[[:space:]]*$/)) {
        id = substr(line, RSTART + 1, RLENGTH - 2)
        print id
        exit
      }
    }
  '
}

detect_ios_device_udid() {
  # Backward-compatible alias used by native paths.
  # For RN xcodebuild destination, use detect_ios_xcode_destination_udid.
  local coredevice_id=""
  coredevice_id="$(
    xcrun devicectl list devices 2>/dev/null | awk '
      /connected|available \(paired\)/ {
        if (match($0, /[0-9A-F-]{20,40}/)) {
          id = substr($0, RSTART, RLENGTH)
          if ($0 ~ / connected/) {
            print id
            exit
          }
          if (first == "") first = id
        }
      }
      END {
        if (first != "") print first
      }
    ' | head -n 1
  )"
  if [[ -n "$coredevice_id" ]]; then
    printf '%s' "$coredevice_id"
    return 0
  fi

  detect_ios_xcode_destination_udid || true
}

detect_android_device_serial() {
  command -v adb >/dev/null 2>&1 || return 1
  adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

resolve_ios_bundle_id() {
  local project_file="$ROOT_DIR/mingle-app/rn/ios/mingle.xcodeproj/project.pbxproj"
  if [[ -f "$project_file" ]]; then
    awk -F'= ' '/PRODUCT_BUNDLE_IDENTIFIER = /{gsub(/;$/, "", $2); print $2; exit}' "$project_file"
    return 0
  fi
  printf '%s' "com.minglelabs.mingle.rn"
}

resolve_rn_ios_development_team() {
  local project_file="$ROOT_DIR/mingle-app/rn/ios/mingle.xcodeproj/project.pbxproj"
  if [[ -f "$project_file" ]]; then
    awk -F'= ' '/DEVELOPMENT_TEAM = /{gsub(/;$/, "", $2); print $2; exit}' "$project_file"
    return 0
  fi
  printf '%s' ""
}

resolve_ios_wda_bundle_id() {
  local app_bundle_id=""
  app_bundle_id="$(trim_whitespace "$(resolve_ios_bundle_id)")"
  if [[ -n "$app_bundle_id" ]]; then
    printf '%s' "${app_bundle_id}.WebDriverAgentRunner"
    return 0
  fi
  printf '%s' "com.minglelabs.mingle.rn.WebDriverAgentRunner"
}

resolve_android_application_id() {
  local gradle_file="$ROOT_DIR/mingle-app/rn/android/app/build.gradle"
  if [[ -f "$gradle_file" ]]; then
    awk -F'"' '/applicationId[[:space:]]+"/{print $2; exit}' "$gradle_file"
    return 0
  fi
  printf '%s' "com.minglelabs.mingle.rn"
}

write_rn_mobile_ads_app_json() {
  local android_app_id="$1"
  local ios_app_id="$2"
  local tmp=""

  require_nonempty_runtime_value "RN_ADMOB_APP_ID_ANDROID" "$android_app_id"
  require_nonempty_runtime_value "RN_ADMOB_APP_ID_IOS" "$ios_app_id"
  require_cmd jq
  tmp="$(mktemp)"

  if [[ -f "$RN_APP_JSON_FILE" ]]; then
    jq \
      --arg androidAppId "$android_app_id" \
      --arg iosAppId "$ios_app_id" \
      '
        .name = (.name // "mingle")
        | .displayName = (.displayName // "mingle")
        | ."react-native-google-mobile-ads" = (
            ."react-native-google-mobile-ads" // {}
            | .android_app_id = $androidAppId
            | .ios_app_id = $iosAppId
          )
      ' \
      "$RN_APP_JSON_FILE" > "$tmp"
  else
    jq -n \
      --arg androidAppId "$android_app_id" \
      --arg iosAppId "$ios_app_id" \
      '{
        name: "mingle",
        displayName: "mingle",
        "react-native-google-mobile-ads": {
          android_app_id: $androidAppId,
          ios_app_id: $iosAppId
        }
      }' > "$tmp"
  fi

  mv "$tmp" "$RN_APP_JSON_FILE"
}

restore_rn_mobile_ads_app_json() {
  local backup_file="$1"
  local had_original="${2:-0}"

  if [[ "$had_original" == "1" ]]; then
    mv "$backup_file" "$RN_APP_JSON_FILE"
  else
    rm -f "$RN_APP_JSON_FILE" "$backup_file"
  fi
}

resolve_ios_simulator_udid_for_uninstall() {
  local requested_name="${1:-iPhone 16}"
  local requested_udid="${2:-}"
  local simctl_devices=""

  simctl_devices="$(xcrun simctl list devices available 2>/dev/null)" || \
    die "CoreSimulator is unavailable. Open Simulator once and retry."

  if [[ -n "$requested_udid" ]]; then
    local matched
    matched="$(
      printf '%s\n' "$simctl_devices" | awk -v udid="$requested_udid" '
        {
          line = $0
          sub(/^[[:space:]]+/, "", line)
          if (line !~ /\(Booted\)|\(Shutdown\)|\(Shutdown \(SimDiskImageMounting\)\)/) next
          if (line !~ /iPhone / && line !~ /iPad /) next
          if (match(line, /\([0-9A-F-]+\)/)) {
            candidate = substr(line, RSTART + 1, RLENGTH - 2)
            if (candidate == udid) {
              print candidate
              exit
            }
          }
        }
      '
    )"
    [[ -n "$matched" ]] || die "SIMULATOR_UDID '$requested_udid' is not available."
    printf '%s' "$requested_udid"
    return 0
  fi

  local candidates=""
  candidates="$(
    printf '%s\n' "$simctl_devices" | awk -v name="$requested_name" '
      {
        line = $0
        sub(/^[[:space:]]+/, "", line)
        if (index(line, name " (") != 1) next
        if (line !~ /\(Booted\)|\(Shutdown\)|\(Shutdown \(SimDiskImageMounting\)\)/) next
        if (line !~ /iPhone / && line !~ /iPad /) next
        if (match(line, /\([0-9A-F-]+\)/)) {
          udid = substr(line, RSTART + 1, RLENGTH - 2)
          print line " :: " udid
        }
      }
    '
  )"

  local count
  count="$(printf '%s\n' "$candidates" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$count" == "1" ]]; then
    printf '%s\n' "$candidates" | awk -F' :: ' 'NR == 1 { print $2 }'
    return 0
  fi
  if [[ "$count" -gt 1 ]]; then
    die "multiple simulators match '$requested_name'; specify --ios-simulator-udid explicitly.
$(printf '%s\n' "$candidates" | sed -n '1,20p')"
  fi

  die "no available simulator matched '$requested_name'. Use --ios-simulator-udid or check: xcrun simctl list devices available"
}

run_ios_mobile_install() {
  local requested_udid="${1:-}"
  local configuration="$2"
  local with_clean_install="${3:-0}"
  local destination_udid="$requested_udid"
  local coredevice_id=""
  local runtime_admob_app_id_ios=""
  local runtime_admob_app_id_android=""
  local runtime_qa_bridge_enabled=""

  if [[ -z "$destination_udid" ]]; then
    destination_udid="$(detect_ios_xcode_destination_udid || true)"
  fi

  if [[ -z "$destination_udid" ]]; then
    log "iOS device not detected; skipping iOS build/install"
    return 0
  fi
  coredevice_id="$(detect_ios_coredevice_id || true)"
  if [[ -z "$coredevice_id" ]]; then
    # Fallback for environments where only xcodebuild destination id is visible.
    coredevice_id="$destination_udid"
  fi

  require_cmd xcodebuild
  require_cmd xcrun
  ensure_rn_workspace_dependencies
  ensure_ios_pods_if_needed

  local derived_data_path="$ROOT_DIR/.devbox-cache/ios/$DEVBOX_WORKTREE_NAME"
  local app_path="$derived_data_path/Build/Products/${configuration}-iphoneos/mingle.app"
  local workspace_path="$ROOT_DIR/mingle-app/rn/ios/mingle.xcworkspace"
  local bundle_id
  bundle_id="$(resolve_ios_bundle_id)"
  runtime_admob_app_id_ios="$(resolve_devbox_admob_app_id_ios)"
  runtime_admob_app_id_android="$(resolve_devbox_admob_app_id_android)"
  runtime_qa_bridge_enabled="$(resolve_devbox_qa_bridge_enabled)"

  if [[ "$with_clean_install" -eq 1 && -n "$bundle_id" ]]; then
    log "uninstalling existing iOS app before reinstall: $bundle_id (device=$coredevice_id)"
    xcrun devicectl device uninstall app --device "$coredevice_id" "$bundle_id" || \
      log "iOS uninstall skipped (app may not be installed)"
  fi

  if [[ "$with_clean_install" -eq 1 ]]; then
    log "cleaning iOS build artifacts for consistent runtime injection: $derived_data_path"
    rm -rf "$derived_data_path"
  fi

  write_rn_ios_runtime_xcconfig

  mkdir -p "$(dirname "$derived_data_path")"
  [[ -d "$workspace_path" ]] || die "RN iOS workspace not found: $workspace_path"

  log "building iOS app ($configuration) for destination: $destination_udid"
  if [[ "$runtime_qa_bridge_enabled" == "1" ]]; then
    log "iOS QA bridge is enabled for this install"
  fi
  (
    local rn_app_json_backup=""
    local had_original_rn_app_json=0
    rn_app_json_backup="$(mktemp)"
    if [[ -f "$RN_APP_JSON_FILE" ]]; then
      cp "$RN_APP_JSON_FILE" "$rn_app_json_backup"
      had_original_rn_app_json=1
    fi
    trap 'restore_rn_mobile_ads_app_json "$rn_app_json_backup" "$had_original_rn_app_json"' EXIT
    write_rn_mobile_ads_app_json "$runtime_admob_app_id_android" "$runtime_admob_app_id_ios"
    NEXT_PUBLIC_API_NAMESPACE="$IOS_RN_REQUIRED_API_NAMESPACE" \
    xcodebuild \
      -allowProvisioningUpdates \
      -workspace "$workspace_path" \
      -scheme mingle \
      -configuration "$configuration" \
      -destination "id=$destination_udid" \
      -derivedDataPath "$derived_data_path" \
      -xcconfig "$RN_IOS_RUNTIME_XCCONFIG" \
      build
  )

  [[ -d "$app_path" ]] || die "built iOS app not found: $app_path"

  log "installing iOS app on device: $coredevice_id"
  xcrun devicectl device install app --device "$coredevice_id" "$app_path"

  if [[ -n "$bundle_id" ]]; then
    log "launching iOS app bundle: $bundle_id"
    xcrun devicectl device process launch --device "$coredevice_id" "$bundle_id" >/dev/null 2>&1 || \
      log "iOS app launch skipped (manual launch may be required)"
  fi
}

run_android_mobile_install() {
  local requested_serial="${1:-}"
  local variant="$2"
  local serial="$requested_serial"
  local runtime_ad_banner_position=""
  local runtime_ad_banner_height_px=""
  local runtime_admob_app_id_android=""
  local runtime_admob_app_id_ios=""
  local runtime_admob_banner_unit_id_android=""
  local runtime_qa_bridge_enabled=""

  if [[ -z "$serial" ]]; then
    serial="$(detect_android_device_serial || true)"
  fi

  if [[ -z "$serial" ]]; then
    log "Android device not detected; skipping Android build/install"
    return 0
  fi

  require_cmd adb
  ensure_rn_workspace_dependencies
  ensure_android_sdk_config

  local gradle_task="installRelease"
  if [[ "$variant" == "debug" ]]; then
    gradle_task="installDebug"
  fi
  local app_id
  app_id="$(resolve_android_application_id)"
  runtime_ad_banner_position="$(resolve_devbox_ad_banner_position android)"
  runtime_ad_banner_height_px="$(resolve_devbox_ad_banner_height_px)"
  runtime_admob_app_id_android="$(resolve_devbox_admob_app_id_android)"
  runtime_admob_app_id_ios="$(resolve_devbox_admob_app_id_ios)"
  runtime_admob_banner_unit_id_android="$(resolve_devbox_admob_banner_unit_id_android)"
  runtime_qa_bridge_enabled="$(resolve_devbox_qa_bridge_enabled)"

  log "building Android app ($variant) for device: $serial"
  if [[ "$runtime_qa_bridge_enabled" == "1" ]]; then
    log "Android QA bridge is enabled for this install"
  fi
  (
    local rn_app_json_backup=""
    local had_original_rn_app_json=0
    rn_app_json_backup="$(mktemp)"
    if [[ -f "$RN_APP_JSON_FILE" ]]; then
      cp "$RN_APP_JSON_FILE" "$rn_app_json_backup"
      had_original_rn_app_json=1
    fi
    trap 'restore_rn_mobile_ads_app_json "$rn_app_json_backup" "$had_original_rn_app_json"' EXIT
    write_rn_mobile_ads_app_json "$runtime_admob_app_id_android" "$runtime_admob_app_id_ios"
    cd "$ROOT_DIR/mingle-app/rn/android"
    ANDROID_SERIAL="$serial" \
    NEXT_PUBLIC_SITE_URL="$DEVBOX_SITE_URL" \
    NEXT_PUBLIC_WS_URL="$DEVBOX_RN_WS_URL" \
    MINGLE_API_FALLBACK_SITE_URL="${DEVBOX_RN_FALLBACK_SITE_URL:-$DEFAULT_RN_FALLBACK_SITE_URL}" \
    MINGLE_STT_FALLBACK_WS_URL="${DEVBOX_RN_FALLBACK_WS_URL:-$DEFAULT_RN_FALLBACK_WS_URL}" \
    MINGLE_LEGACY_SITE_URL="${DEVBOX_RN_FALLBACK_SITE_URL:-$DEFAULT_RN_FALLBACK_SITE_URL}" \
    MINGLE_LEGACY_WS_URL="${DEVBOX_RN_FALLBACK_WS_URL:-$DEFAULT_RN_FALLBACK_WS_URL}" \
    NEXT_PUBLIC_API_NAMESPACE="$ANDROID_RN_REQUIRED_API_NAMESPACE" \
    RN_AD_BANNER_POSITION="$runtime_ad_banner_position" \
    RN_AD_BANNER_HEIGHT_PX="$runtime_ad_banner_height_px" \
    RN_ADMOB_APP_ID_ANDROID="$runtime_admob_app_id_android" \
    RN_ADMOB_BANNER_UNIT_ID_ANDROID="$runtime_admob_banner_unit_id_android" \
    RN_QA_BRIDGE_ENABLED="$runtime_qa_bridge_enabled" \
      ./gradlew "$gradle_task"
  )

  if [[ -n "$app_id" ]]; then
    log "launching Android app package: $app_id"
    adb -s "$serial" shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
      log "Android app launch skipped (manual launch may be required)"
  fi
}

run_mobile_install_targets() {
  local do_rn_ios="$1"
  local do_android="$2"
  local ios_udid="$3"
  local android_serial="$4"
  local ios_configuration="$5"
  local android_variant="$6"
  local with_ios_clean_install="${7:-0}"
  local app_site_override="${8:-}"
  local app_ws_override="${9:-}"
  local device_app_env="${10:-}"
  local qa_bridge_enabled="${11:-0}"
  local app_fallback_site_override="${12:-}"
  local app_fallback_ws_override="${13:-}"

  (
    DEVBOX_ACTIVE_DEVICE_APP_ENV="$device_app_env"
    DEVBOX_QA_BRIDGE_ENABLED="$qa_bridge_enabled"
    DEVBOX_RN_FALLBACK_SITE_URL="${app_fallback_site_override:-${DEVBOX_RN_FALLBACK_SITE_URL:-$DEFAULT_RN_FALLBACK_SITE_URL}}"
    DEVBOX_RN_FALLBACK_WS_URL="${app_fallback_ws_override:-${DEVBOX_RN_FALLBACK_WS_URL:-$DEFAULT_RN_FALLBACK_WS_URL}}"
    if [[ -n "$app_site_override" ]]; then
      DEVBOX_SITE_URL="$app_site_override"
    fi
    if [[ -n "$app_ws_override" ]]; then
      DEVBOX_RN_WS_URL="$app_ws_override"
    fi

    if [[ "$do_rn_ios" -eq 1 ]]; then
      run_ios_mobile_install "$ios_udid" "$ios_configuration" "$with_ios_clean_install"
    fi
    if [[ "$do_android" -eq 1 ]]; then
      run_android_mobile_install "$android_serial" "$android_variant"
    fi
  )
}

is_loopback_http_or_ws_url() {
  local value="${1:-}"
  [[ -n "$value" ]] || return 1

  local without_scheme="${value#*://}"
  local host_port="${without_scheme%%/*}"
  local host=""

  # IPv6 bracketed address: [::1]:port — extract the part inside [ ]
  if [[ "$host_port" == \[* ]]; then
    host="${host_port#[}"
    host="${host%%]*}"
  else
    host="${host_port%%:*}"
  fi

  local host_lower=""
  host_lower="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"

  case "$host_lower" in
    127.0.0.1|localhost|::1) return 0 ;;
    *) return 1 ;;
  esac
}

guard_rn_ios_local_profile_on_device() {
  local profile="$1"
  local do_rn_ios="$2"
  local ios_udid="${3:-}"
  local effective_site_url="${4:-}"

  [[ "$do_rn_ios" -eq 1 ]] || return 0
  [[ "$profile" == "local" ]] || return 0
  is_loopback_http_or_ws_url "$effective_site_url" || return 0

  if is_truthy "${DEVBOX_ALLOW_LOCAL_PROFILE_IOS_DEVICE:-}"; then
    warn "DEVBOX_ALLOW_LOCAL_PROFILE_IOS_DEVICE=1; allowing local-profile RN iOS install on real device"
    return 0
  fi

  local connected_coredevice_id=""
  connected_coredevice_id="$(detect_ios_coredevice_id || true)"
  [[ -n "$connected_coredevice_id" ]] || return 0

  local suggested_udid="$ios_udid"
  if [[ -z "$suggested_udid" ]]; then
    suggested_udid="$(detect_ios_xcode_destination_udid || true)"
  fi

  die "DEVBOX_PROFILE=local with RN iOS device install is blocked because DEVBOX_SITE_URL points to loopback ($effective_site_url). This causes WebView load failures on real iPhone and can trigger local-network permission prompts.
Use:
- scripts/devbox up --profile device --device-app-env prod --with-ios-install --ios-runtime rn --ios-udid ${suggested_udid:-<XCODE_UDID>}
or:
- scripts/devbox profile --profile device
- scripts/devbox mobile --platform ios --ios-runtime rn --device-app-env prod --ios-udid ${suggested_udid:-<XCODE_UDID>}
(For ngrok-backed dev URL, use --device-app-env dev)
Override only if intentional: DEVBOX_ALLOW_LOCAL_PROFILE_IOS_DEVICE=1"
}

stop_existing_ngrok_by_inspector_port() {
  local inspector_port="$1"
  local name_patterns=(
    "ngrok.start.*devbox_web.*devbox_stt.*devbox_messaging"
    "scripts/ngrok-start-mobile.sh .*devbox_web.*devbox_stt.*devbox_messaging"
    "ngrok.*devbox.mobile.local.yml"
  )
  local pids=""
  local kill_pids=""
  local candidate=""
  local pid=""
  local unique_pids=""

  [[ -n "$inspector_port" ]] || return 0
  [[ "$inspector_port" =~ ^[0-9]+$ ]] || return 0

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$inspector_port" -sTCP:LISTEN 2>/dev/null || true)"
  fi
  if [[ -z "$pids" ]] && command -v pgrep >/dev/null 2>&1; then
    local pattern
    for pattern in "${name_patterns[@]}"; do
      while IFS= read -r candidate; do
        [[ -n "$candidate" ]] || continue
        if ! printf '%s\n' "$pids" | grep -Fxq "$candidate"; then
          pids="${pids}${pids:+$'\n'}$candidate"
        fi
      done < <(pgrep -f "$pattern" 2>/dev/null || true)
    done
  fi

  unique_pids="$(printf '%s' "$pids" | awk 'NF {print $1}' | awk '!seen[$0]++')"
  pids="$unique_pids"
  kill_pids="$unique_pids"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  log "stopping existing ngrok processes on inspector port $inspector_port"
  printf '%s\n' "$pids" | while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done

  local elapsed=0
  while (( elapsed < 5 )); do
    pids="$(lsof -tiTCP:"$inspector_port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -z "$pids" ]] && return 0
    sleep 1
    elapsed=$((elapsed + 1))
  done

  printf '%s\n' "$kill_pids" | while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" >/dev/null 2>&1 || true
  done
}

stop_existing_cloudflared_by_local_port() {
  local local_port="$1"
  local pids=""
  local pid=""
  local unique_pids=""

  [[ -n "$local_port" ]] || return 0
  [[ "$local_port" =~ ^[0-9]+$ ]] || return 0
  command -v pgrep >/dev/null 2>&1 || return 0

  pids="$(pgrep -f "cloudflared.*tunnel.*--url http://127\\.0\\.0\\.1:${local_port}" 2>/dev/null || true)"
  unique_pids="$(printf '%s' "$pids" | awk 'NF {print $1}' | awk '!seen[$0]++')"
  [[ -n "$unique_pids" ]] || return 0

  log "stopping existing cloudflared quick tunnels for local port $local_port"
  printf '%s\n' "$unique_pids" | while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done

  sleep 1
  pids="$(pgrep -f "cloudflared.*tunnel.*--url http://127\\.0\\.0\\.1:${local_port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    printf '%s\n' "$pids" | while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill -9 "$pid" >/dev/null 2>&1 || true
    done
  fi
}

extract_cloudflared_quicktunnel_url_from_log() {
  local log_file="$1"
  [[ -f "$log_file" ]] || return 1
  sed -nE 's/.*(https:\/\/[a-z0-9-]+\.trycloudflare\.com).*/\1/p' "$log_file" | tail -n 1
}

wait_for_cloudflared_tunnel_url() {
  local log_file="$1"
  local pid="$2"
  local timeout_sec="${3:-20}"
  local elapsed=0
  local url=""

  while (( elapsed < timeout_sec )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 1
    fi
    url="$(extract_cloudflared_quicktunnel_url_from_log "$log_file" || true)"
    if [[ -n "$url" ]]; then
      printf '%s' "$url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

try_read_ngrok_urls() {
  local expected_web_port="${1:-}"
  local expected_stt_port="${2:-}"
  local expected_messaging_port="${3:-}"
  local require_https="${4:-0}"
  local inspector_port="${5:-$DEVBOX_NGROK_API_PORT}"

  local raw parsed
  NGROK_LAST_ERROR=""
  NGROK_LAST_ERROR_KIND=""

  raw="$(curl -fsS "http://127.0.0.1:${inspector_port}/api/tunnels" 2>/dev/null)" || {
    NGROK_LAST_ERROR_KIND="inspector_unreachable"
    NGROK_LAST_ERROR="cannot reach ngrok inspector at http://127.0.0.1:${inspector_port}"
    return 1
  }

  parsed="$(
    printf '%s' "$raw" | \
      DEVBOX_EXPECT_WEB_PORT="$expected_web_port" \
      DEVBOX_EXPECT_STT_PORT="$expected_stt_port" \
      DEVBOX_EXPECT_MESSAGING_PORT="$expected_messaging_port" \
      DEVBOX_REQUIRE_HTTPS="$require_https" \
      node "$ROOT_DIR/scripts/devbox-ngrok-parse.mjs" 2>&1
  )" || {
    NGROK_LAST_ERROR_KIND="tunnel_mismatch"
    NGROK_LAST_ERROR="$parsed"
    return 1
  }

  NGROK_WEB_URL="$(printf '%s\n' "$parsed" | sed -n '1p')"
  NGROK_STT_URL="$(printf '%s\n' "$parsed" | sed -n '2p')"
  NGROK_MESSAGING_URL="$(printf '%s\n' "$parsed" | sed -n '3p')"

  [[ -n "$NGROK_WEB_URL" ]] || {
    NGROK_LAST_ERROR_KIND="tunnel_mismatch"
    NGROK_LAST_ERROR="ngrok web tunnel url is empty"
    return 1
  }
  [[ -n "$NGROK_STT_URL" ]] || {
    NGROK_LAST_ERROR_KIND="tunnel_mismatch"
    NGROK_LAST_ERROR="ngrok stt tunnel url is empty"
    return 1
  }
  [[ -n "$NGROK_MESSAGING_URL" ]] || {
    NGROK_LAST_ERROR_KIND="tunnel_mismatch"
    NGROK_LAST_ERROR="ngrok messaging tunnel url is empty"
    return 1
  }
  return 0
}

read_ngrok_urls() {
  local expected_web_port="${1:-}"
  local expected_stt_port="${2:-}"
  local expected_messaging_port="${3:-}"
  local require_https="${4:-0}"
  local inspector_port="${5:-$DEVBOX_NGROK_API_PORT}"

  require_cmd curl
  require_cmd node
  try_read_ngrok_urls "$expected_web_port" "$expected_stt_port" "$expected_messaging_port" "$require_https" "$inspector_port" || {
    if [[ -n "$NGROK_LAST_ERROR" ]]; then
      die "$NGROK_LAST_ERROR"
    fi
    die "cannot read ngrok web/stt/messaging tunnels from inspector (http://127.0.0.1:${inspector_port})"
  }
}

wait_for_ngrok_tunnels() {
  local expected_web_port="$1"
  local expected_stt_port="$2"
  local expected_messaging_port="$3"
  local require_https="$4"
  local inspector_port="${5:-$DEVBOX_NGROK_API_PORT}"
  local timeout_sec="${6:-20}"
  local elapsed=0
  while ((elapsed < timeout_sec)); do
    if try_read_ngrok_urls "$expected_web_port" "$expected_stt_port" "$expected_messaging_port" "$require_https" "$inspector_port"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  return 1
}

resolve_google_cloud_project() {
  local project=""

  project="$(read_app_setting_value DEVBOX_GOOGLE_CLOUD_PROJECT || true)"
  [[ -z "$project" ]] && project="$(read_app_setting_value GOOGLE_CLOUD_PROJECT || true)"
  [[ -z "$project" ]] && project="$(read_app_setting_value GCLOUD_PROJECT || true)"
  if [[ -z "$project" ]] && command -v gcloud >/dev/null 2>&1; then
    project="$(gcloud config get-value core/project 2>/dev/null || true)"
    if [[ "$project" == "(unset)" ]]; then
      project=""
    fi
  fi

  printf '%s' "$(trim_whitespace "$project")"
}

resolve_google_access_token() {
  local token_cmd=""
  local token=""

  token_cmd="$(read_app_setting_value DEVBOX_GOOGLE_ACCESS_TOKEN_CMD || true)"
  if [[ -n "$token_cmd" ]]; then
    token="$(bash -lc "$token_cmd" 2>/dev/null || true)"
  elif command -v gcloud >/dev/null 2>&1; then
    token="$(gcloud auth print-access-token 2>/dev/null || true)"
  fi

  printf '%s' "$(trim_whitespace "$token")"
}

build_google_redirect_uris_for_site() {
  local site_url="$1"
  local paths_raw=""
  local item trimmed normalized
  local -a items=()

  paths_raw="$(read_app_setting_value DEVBOX_GOOGLE_REDIRECT_PATHS || true)"
  if [[ -z "$paths_raw" ]]; then
    paths_raw="/api/auth/callback/google"
  fi

  IFS=',' read -r -a items <<< "$paths_raw"
  for item in "${items[@]}"; do
    trimmed="$(trim_whitespace "$item")"
    [[ -n "$trimmed" ]] || continue

    if [[ "$trimmed" =~ ^https?:// ]]; then
      printf '%s\n' "${trimmed%/}"
      continue
    fi

    normalized="$trimmed"
    [[ "$normalized" == /* ]] || normalized="/$normalized"
    printf '%s%s\n' "${site_url%/}" "$normalized"
  done | awk 'NF && !seen[$0]++'
}

sync_google_oauth_redirect_uris_for_site_change() {
  local previous_site_url="${1:-}"
  local current_site_url="${2:-}"
  local enabled_raw=""
  local client_id=""
  local location=""
  local project=""
  local token=""
  local encoded_client_id=""
  local endpoint=""
  local current_client_json=""
  local updated=0
  local current_uri=""
  local desired_uri=""
  local found=0
  local uris_json=""
  local payload=""
  local -a desired_redirect_uris=()
  local -a merged_redirect_uris=()

  [[ -n "$current_site_url" ]] || return 0
  [[ "$current_site_url" =~ ^https:// ]] || return 0

  enabled_raw="$(read_app_setting_value DEVBOX_GOOGLE_REDIRECT_SYNC_ENABLED || true)"
  if [[ -n "$enabled_raw" ]] && ! is_truthy "$enabled_raw"; then
    log "google oauth redirect sync disabled (DEVBOX_GOOGLE_REDIRECT_SYNC_ENABLED=$enabled_raw)"
    return 0
  fi

  if [[ "$current_site_url" == "$previous_site_url" ]]; then
    log "google oauth redirect sync check: ngrok host unchanged; validating redirect URI presence"
  fi

  client_id="$(read_app_setting_value DEVBOX_GOOGLE_OAUTH_CLIENT_ID || true)"
  [[ -z "$client_id" ]] && client_id="$(read_app_setting_value AUTH_GOOGLE_ID || true)"
  client_id="$(trim_whitespace "$client_id")"
  if [[ -z "$client_id" ]]; then
    warn "skipping google redirect sync: missing oauth client id (set AUTH_GOOGLE_ID in secret/mingle/dev|prod or DEVBOX_GOOGLE_OAUTH_CLIENT_ID)"
    return 0
  fi

  location="$(read_app_setting_value DEVBOX_GOOGLE_OAUTH_LOCATION || true)"
  location="$(trim_whitespace "$location")"
  [[ -n "$location" ]] || location="global"

  project="$(resolve_google_cloud_project)"
  if [[ -z "$project" ]]; then
    warn "skipping google redirect sync: missing project id (set DEVBOX_GOOGLE_CLOUD_PROJECT or gcloud core/project)"
    return 0
  fi

  while IFS= read -r desired_uri; do
    desired_uri="$(trim_whitespace "$desired_uri")"
    [[ -n "$desired_uri" ]] || continue
    desired_redirect_uris+=("$desired_uri")
  done < <(build_google_redirect_uris_for_site "$current_site_url")

  if [[ "${#desired_redirect_uris[@]}" -eq 0 ]]; then
    return 0
  fi

  token="$(resolve_google_access_token)"
  if [[ -z "$token" ]]; then
    warn "skipping google redirect sync: missing access token (run gcloud auth login or set DEVBOX_GOOGLE_ACCESS_TOKEN_CMD)"
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1; then
    warn "skipping google redirect sync: jq not found"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "skipping google redirect sync: curl not found"
    return 0
  fi

  encoded_client_id="$(printf '%s' "$client_id" | jq -sRr @uri)"
  endpoint="https://iam.googleapis.com/v1/projects/${project}/locations/${location}/oauthClients/${encoded_client_id}"
  current_client_json="$(curl -fsS \
    -H "Authorization: Bearer $token" \
    -H "X-Goog-User-Project: $project" \
    "$endpoint" 2>/dev/null || true)"
  if [[ -z "$current_client_json" ]]; then
    warn "google redirect sync skipped: failed to load oauth client (project=$project location=$location client=$client_id)"
    return 0
  fi

  while IFS= read -r current_uri; do
    current_uri="$(trim_whitespace "$current_uri")"
    [[ -n "$current_uri" ]] || continue
    merged_redirect_uris+=("$current_uri")
  done < <(printf '%s' "$current_client_json" | jq -r '.allowedRedirectUris[]?' 2>/dev/null || true)

  for desired_uri in "${desired_redirect_uris[@]}"; do
    found=0
    for current_uri in "${merged_redirect_uris[@]}"; do
      if [[ "$current_uri" == "$desired_uri" ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" -eq 0 ]]; then
      merged_redirect_uris+=("$desired_uri")
      updated=1
    fi
  done

  if [[ "$updated" -eq 0 ]]; then
    log "google oauth redirect URI already present for current ngrok host"
    return 0
  fi

  uris_json="$(printf '%s\n' "${merged_redirect_uris[@]}" | jq -R . | jq -s 'map(select(length>0))')"
  payload="$(jq -cn --argjson uris "$uris_json" '{allowedRedirectUris: $uris}')"
  if ! curl -fsS -X PATCH \
    -H "Authorization: Bearer $token" \
    -H "X-Goog-User-Project: $project" \
    -H "Content-Type: application/json" \
    "$endpoint?update_mask=allowed_redirect_uris" \
    --data "$payload" >/dev/null 2>&1; then
    if ! curl -fsS -X PATCH \
      -H "Authorization: Bearer $token" \
      -H "X-Goog-User-Project: $project" \
      -H "Content-Type: application/json" \
      "$endpoint?updateMask=allowedRedirectUris" \
      --data "$payload" >/dev/null 2>&1; then
      warn "google redirect sync failed while patching oauth client (project=$project location=$location client=$client_id)"
      return 0
    fi
  fi

  log "google oauth redirect URI synced for ngrok host: ${desired_redirect_uris[*]}"
}

set_device_profile_values_from_urls() {
  local site_url="$1"
  local stt_url="$2"
  local messaging_url="$3"
  local provider_label="${4:-tunnel}"
  local previous_site_url="${DEVBOX_SITE_URL:-}"

  DEVBOX_PROFILE="device"
  DEVBOX_LOCAL_HOST="127.0.0.1"
  DEVBOX_SITE_URL="$site_url"
  DEVBOX_RN_WS_URL="$(to_wss_url "$stt_url")"
  DEVBOX_RN_MESSAGING_WS_URL="$(to_wss_url "$messaging_url")"
  DEVBOX_PUBLIC_WS_URL="$DEVBOX_RN_WS_URL"
  DEVBOX_PUBLIC_MESSAGING_WS_URL="$DEVBOX_RN_MESSAGING_WS_URL"
  DEVBOX_TEST_API_BASE_URL="http://127.0.0.1:$DEVBOX_WEB_PORT"
  DEVBOX_TEST_WS_URL="ws://127.0.0.1:$DEVBOX_STT_PORT"

  validate_https_url "$provider_label web url" "$DEVBOX_SITE_URL"
  validate_wss_url "$provider_label stt url" "$DEVBOX_RN_WS_URL"
  validate_wss_url "$provider_label messaging url" "$DEVBOX_RN_MESSAGING_WS_URL"
  sync_google_oauth_redirect_uris_for_site_change "$previous_site_url" "$DEVBOX_SITE_URL"
}

set_device_profile_values() {
  read_ngrok_urls "$DEVBOX_WEB_PORT" "$DEVBOX_STT_PORT" "$DEVBOX_MESSAGING_PORT" "1" "$DEVBOX_NGROK_API_PORT"
  set_device_profile_values_from_urls "$NGROK_WEB_URL" "$NGROK_STT_URL" "$NGROK_MESSAGING_URL" "ngrok"
}

resolve_device_app_env_override() {
  local mode="$1"
  local path=""
  local site_url=""
  local ws_url=""
  local fallback_site_url=""
  local fallback_ws_url=""
  local prod_path=""

  case "$mode" in
    dev)
      path="runtime:device-profile"
      site_url="${DEVBOX_SITE_URL:-}"
      ws_url="${DEVBOX_RN_WS_URL:-}"
      fallback_site_url="${DEVBOX_RN_FALLBACK_SITE_URL:-$DEFAULT_RN_FALLBACK_SITE_URL}"
      fallback_ws_url="${DEVBOX_RN_FALLBACK_WS_URL:-$DEFAULT_RN_FALLBACK_WS_URL}"
      [[ -n "$site_url" ]] || die "missing runtime site url for --device-app-env dev. Run with --profile device so tunnel URLs are resolved first."
      [[ -n "$ws_url" ]] || die "missing runtime ws url for --device-app-env dev. Run with --profile device so tunnel URLs are resolved first."
      ;;
    prod)
      prod_path="${DEVBOX_VAULT_PROD_PATH:-}"
      if [[ -z "$prod_path" ]]; then
        prod_path="$(read_main_root_setting_value DEVBOX_VAULT_PROD_PATH || true)"
        prod_path="$(trim_whitespace "$prod_path")"
      fi
      path="${prod_path:-secret/mingle/prod}"
      site_url="$(read_env_value_from_vault "$path" NEXT_PUBLIC_SITE_URL || true)"
      [[ -z "$site_url" ]] && site_url="$(read_env_value_from_vault "$path" MINGLE_API_BASE_URL || true)"
      [[ -z "$site_url" ]] && site_url="$(read_env_value_from_vault "$path" RN_WEB_APP_BASE_URL || true)"
      [[ -z "$site_url" ]] && site_url="$(read_env_value_from_vault "$path" MINGLE_WEB_APP_BASE_URL || true)"

      ws_url="$(read_env_value_from_vault "$path" NEXT_PUBLIC_WS_URL || true)"
      [[ -z "$ws_url" ]] && ws_url="$(read_env_value_from_vault "$path" MINGLE_WS_URL || true)"
      [[ -z "$ws_url" ]] && ws_url="$(read_env_value_from_vault "$path" RN_DEFAULT_WS_URL || true)"
      [[ -z "$ws_url" ]] && ws_url="$(read_env_value_from_vault "$path" MINGLE_DEFAULT_WS_URL || true)"

      fallback_site_url="$(read_env_value_from_vault "$path" MINGLE_API_FALLBACK_SITE_URL || true)"
      [[ -z "$fallback_site_url" ]] && fallback_site_url="$(read_env_value_from_vault "$path" RN_WEB_APP_FALLBACK_BASE_URL || true)"
      [[ -z "$fallback_site_url" ]] && fallback_site_url="$(read_env_value_from_vault "$path" MINGLE_LEGACY_SITE_URL || true)"
      [[ -z "$fallback_site_url" ]] && fallback_site_url="$DEFAULT_RN_FALLBACK_SITE_URL"

      fallback_ws_url="$(read_env_value_from_vault "$path" MINGLE_STT_FALLBACK_WS_URL || true)"
      [[ -z "$fallback_ws_url" ]] && fallback_ws_url="$(read_env_value_from_vault "$path" RN_DEFAULT_WS_FALLBACK_URL || true)"
      [[ -z "$fallback_ws_url" ]] && fallback_ws_url="$(read_env_value_from_vault "$path" MINGLE_LEGACY_WS_URL || true)"
      [[ -z "$fallback_ws_url" ]] && fallback_ws_url="$DEFAULT_RN_FALLBACK_WS_URL"

      [[ -n "$site_url" ]] || die "missing NEXT_PUBLIC_SITE_URL in vault path: $path (fallbacks checked: MINGLE_API_BASE_URL/RN_WEB_APP_BASE_URL/MINGLE_WEB_APP_BASE_URL)"
      [[ -n "$ws_url" ]] || die "missing NEXT_PUBLIC_WS_URL in vault path: $path (fallbacks checked: MINGLE_WS_URL/RN_DEFAULT_WS_URL/MINGLE_DEFAULT_WS_URL)"
      ;;
    *)
      die "invalid --device-app-env: $mode (expected dev|prod)"
      ;;
  esac

  validate_http_url "device app env site url" "$site_url"
  validate_ws_url "device app env ws url" "$ws_url"
  validate_http_url "device app fallback site url" "$fallback_site_url"
  validate_ws_url "device app fallback ws url" "$fallback_ws_url"

  printf '%s\n%s\n%s\n' "$path" "$site_url" "$ws_url"
  printf '%s\n%s\n' "$fallback_site_url" "$fallback_ws_url"
}

save_and_refresh() {
  if [[ -z "${DEVBOX_WORKTREE_NAME:-}" ]]; then
    DEVBOX_WORKTREE_NAME="$(derive_worktree_name)"
  fi
  DEVBOX_ROOT_DIR="$ROOT_CANON"
  write_devbox_env_file
  refresh_runtime_files
}

apply_profile() {
  local profile="$1"
  local host="${2:-}"

  case "$profile" in
    local)
      if [[ -z "$host" ]]; then
        host="${DEVBOX_LOCAL_HOST:-127.0.0.1}"
      fi
      set_local_profile_values "$host"
      ;;
    device)
      set_device_profile_values
      ;;
    *)
      die "unsupported profile: $profile (expected local|device)"
      ;;
  esac

  save_and_refresh
}

port_conflict_check() {
  local name="$1"
  local port="$2"
  if port_list_contains "$RESERVED_ALL_PORTS" "$port"; then
    die "$name port already reserved by another worktree: $port"
  fi
  if port_in_use "$port"; then
    die "$name port already in use by another process: $port"
  fi
}

terminate_process_tree() {
  local pid="$1"
  [[ -n "$pid" ]] || return
  kill -0 "$pid" >/dev/null 2>&1 || return

  if command -v pgrep >/dev/null 2>&1; then
    local child
    while IFS= read -r child; do
      [[ -n "$child" ]] || continue
      terminate_process_tree "$child"
    done < <(pgrep -P "$pid" 2>/dev/null || true)
  fi

  kill "$pid" >/dev/null 2>&1 || true
}

cleanup_processes() {
  local pid
  for pid in "$@"; do
    terminate_process_tree "$pid"
  done
}

collect_listening_pids_by_port() {
  local port="$1"
  local raw=""
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  raw="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  printf '%s\n' "$raw" | awk 'NF {print $1}' | awk '!seen[$0]++'
}

collect_pids_by_pattern() {
  local pattern="$1"
  local raw=""
  if ! command -v pgrep >/dev/null 2>&1; then
    return 0
  fi
  raw="$(pgrep -f "$pattern" 2>/dev/null || true)"
  printf '%s\n' "$raw" | awk 'NF {print $1}' | awk '!seen[$0]++'
}

force_kill_pids() {
  local pid
  for pid in "$@"; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" >/dev/null 2>&1 || true
  done
}

stop_pids_with_grace() {
  local label="$1"
  shift

  local -a pids=("$@")
  local -a alive=("${pids[@]}")
  local retries=0

  [[ "${#pids[@]}" -gt 0 ]] || return 0
  log "stopping $label (pids: ${pids[*]})"
  cleanup_processes "${pids[@]}"

  while [[ "$retries" -lt 10 ]]; do
    alive=()
    local pid
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        alive+=("$pid")
      fi
    done
    [[ "${#alive[@]}" -eq 0 ]] && return 0
    sleep 0.2
    retries=$((retries + 1))
  done

  log "force-killing $label (pids: ${alive[*]})"
  force_kill_pids "${alive[@]}"
}

stop_listeners_by_port() {
  local label="$1"
  local port="$2"
  local pids_text=""
  local -a pids=()

  pids_text="$(collect_listening_pids_by_port "$port")"
  if [[ -z "$pids_text" ]]; then
    return 0
  fi
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    pids+=("$pid")
  done <<< "$pids_text"
  if [[ "${#pids[@]}" -eq 0 ]]; then
    return 0
  fi
  stop_pids_with_grace "$label(port=$port)" "${pids[@]}"
}

stop_processes_by_pattern() {
  local label="$1"
  local pattern="$2"
  local pids_text=""
  local -a pids=()

  pids_text="$(collect_pids_by_pattern "$pattern")"
  if [[ -z "$pids_text" ]]; then
    return 0
  fi
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    pids+=("$pid")
  done <<< "$pids_text"
  if [[ "${#pids[@]}" -eq 0 ]]; then
    return 0
  fi
  stop_pids_with_grace "$label" "${pids[@]}"
}

wait_for_any_child_exit() {
  local pid
  local -a pids=("$@")
  while true; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        wait "$pid"
        return $?
      fi
    done
    sleep 1
  done
}

cmd_init() {
  require_cmd pnpm
  local web_port="" stt_port="" messaging_port="" metro_port="" ngrok_api_port="" host="127.0.0.1"
  local vault_override=""
  local openclaw_root_override=""
  local current_web_port="" current_stt_port="" current_messaging_port="" current_metro_port="" current_ngrok_api_port=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --web-port) web_port="${2:-}"; shift 2 ;;
      --stt-port) stt_port="${2:-}"; shift 2 ;;
      --messaging-port) messaging_port="${2:-}"; shift 2 ;;
      --metro-port) metro_port="${2:-}"; shift 2 ;;
      --ngrok-api-port) ngrok_api_port="${2:-}"; shift 2 ;;
      --host) host="${2:-}"; shift 2 ;;
      --vault-path) vault_override="${2:-}"; shift 2 ;;
      --openclaw-root) openclaw_root_override="${2:-}"; shift 2 ;;
      *) die "unknown option for init: $1" ;;
    esac
  done

  resolve_vault_path "$vault_override"
  if [[ -n "$openclaw_root_override" ]]; then
    DEVBOX_OPENCLAW_ROOT="$openclaw_root_override"
  fi
  if [[ -z "$DEVBOX_OPENCLAW_ROOT" ]]; then
    DEVBOX_OPENCLAW_ROOT="$(resolve_openclaw_root)"
  fi

  DEVBOX_WORKTREE_NAME="$(derive_worktree_name)"
  current_web_port="$(read_devbox_env_value DEVBOX_WEB_PORT || true)"
  current_stt_port="$(read_devbox_env_value DEVBOX_STT_PORT || true)"
  current_messaging_port="$(read_devbox_env_value DEVBOX_MESSAGING_PORT || true)"
  current_metro_port="$(read_devbox_env_value DEVBOX_METRO_PORT || true)"
  current_ngrok_api_port="$(read_devbox_env_value DEVBOX_NGROK_API_PORT || true)"
  calc_default_ports

  [[ -n "$web_port" ]] || web_port="${current_web_port:-$DEFAULT_WEB_PORT}"
  [[ -n "$stt_port" ]] || stt_port="${current_stt_port:-$DEFAULT_STT_PORT}"
  [[ -n "$messaging_port" ]] || messaging_port="${current_messaging_port:-$DEFAULT_MESSAGING_PORT}"
  [[ -n "$metro_port" ]] || metro_port="${current_metro_port:-$DEFAULT_METRO_PORT}"
  [[ -n "$ngrok_api_port" ]] || ngrok_api_port="${current_ngrok_api_port:-$DEFAULT_NGROK_API_PORT}"

  validate_port "web port" "$web_port"
  validate_port "stt port" "$stt_port"
  validate_port "messaging port" "$messaging_port"
  validate_port "metro port" "$metro_port"
  validate_port "ngrok api port" "$ngrok_api_port"

  [[ "$web_port" != "$stt_port" ]] || die "web/stt ports must differ"
  [[ "$web_port" != "$messaging_port" ]] || die "web/messaging ports must differ"
  [[ "$stt_port" != "$messaging_port" ]] || die "stt/messaging ports must differ"
  [[ "$web_port" != "$metro_port" ]] || die "web/metro ports must differ"
  [[ "$stt_port" != "$metro_port" ]] || die "stt/metro ports must differ"
  [[ "$ngrok_api_port" != "$web_port" ]] || die "ngrok api/web ports must differ"
  [[ "$ngrok_api_port" != "$stt_port" ]] || die "ngrok api/stt ports must differ"
  [[ "$ngrok_api_port" != "$messaging_port" ]] || die "ngrok api/messaging ports must differ"
  [[ "$ngrok_api_port" != "$metro_port" ]] || die "ngrok api/metro ports must differ"

  port_conflict_check "web" "$web_port"
  port_conflict_check "stt" "$stt_port"
  port_conflict_check "messaging" "$messaging_port"
  port_conflict_check "metro" "$metro_port"
  port_conflict_check "ngrok api" "$ngrok_api_port"

  DEVBOX_WEB_PORT="$web_port"
  DEVBOX_STT_PORT="$stt_port"
  DEVBOX_MESSAGING_PORT="$messaging_port"
  DEVBOX_METRO_PORT="$metro_port"
  DEVBOX_NGROK_API_PORT="$ngrok_api_port"
  set_local_profile_values "$host"

  save_and_refresh
  ensure_rn_workspace_dependencies
  ensure_ios_pods_if_needed

  log "initialized for worktree: $DEVBOX_WORKTREE_NAME"
  cmd_status
}

cmd_bootstrap() {
  require_cmd pnpm
  local vault_override=""
  local openclaw_root_override=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --vault-path) vault_override="${2:-}"; shift 2 ;;
      --vault-push) shift ;; # Backward-compatible no-op: bootstrap always pushes now.
      --openclaw-root) openclaw_root_override="${2:-}"; shift 2 ;;
      *) die "unknown option for bootstrap: $1" ;;
    esac
  done

  require_devbox_env

  resolve_vault_path "$vault_override"
  if [[ -n "$openclaw_root_override" ]]; then
    DEVBOX_OPENCLAW_ROOT="$openclaw_root_override"
  fi
  if [[ -z "$DEVBOX_OPENCLAW_ROOT" ]]; then
    DEVBOX_OPENCLAW_ROOT="$(resolve_openclaw_root)"
  fi

  [[ -n "$DEVBOX_VAULT_PATH" ]] || die "missing shared vault path (set DEVBOX_VAULT_PATH in the main root .env.local or pass --vault-path)"
  require_cmd vault
  require_cmd jq
  prepare_vault_cli_env
  vault token lookup >/dev/null 2>&1 || die "Vault is not authenticated (run: vault login)"
  push_env_to_vault_path "$DEVBOX_VAULT_PATH"
  log "bootstrap uploaded main root shared values and service env values to one Vault path"
  ensure_workspace_dependencies
  ensure_rn_workspace_dependencies
  ensure_ios_pods_if_needed
  save_and_refresh
  log "bootstrap complete"
}

cmd_profile() {
  require_devbox_env

  local profile=""
  local host=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile) profile="${2:-}"; shift 2 ;;
      --host) host="${2:-}"; shift 2 ;;
      *) die "unknown option for profile: $1" ;;
    esac
  done

  [[ -n "$profile" ]] || die "missing --profile local|device"
  apply_profile "$profile" "$host"
  log "applied profile: $profile"
  cmd_status
}

cmd_ngrok_config() {
  require_devbox_env
  write_ngrok_local_config
  log "wrote $NGROK_LOCAL_CONFIG"
}

cmd_gateway() {
  require_cmd pnpm
  local openclaw_root=""
  local mode="dev"
  local dry_run=0
  local -a passthrough=()
  local -a cmd=()

  require_devbox_env

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --openclaw-root) openclaw_root="${2:-}"; shift 2 ;;
      --mode) mode="${2:-}"; shift 2 ;;
      --dry-run) dry_run=1; shift ;;
      --) shift; passthrough+=("$@"); break ;;
      *)
        passthrough+=("$1")
        shift
        ;;
    esac
  done

  if [[ -z "$openclaw_root" ]]; then
    openclaw_root="$(resolve_openclaw_root)"
  fi
  [[ -n "$openclaw_root" ]] || die "unable to resolve openclaw root (use --openclaw-root)"
  [[ -d "$openclaw_root" ]] || die "openclaw root not found: $openclaw_root"

  case "$mode" in
    dev)
      [[ "${#passthrough[@]}" -eq 0 ]] || die "--mode dev does not accept extra args (use --mode run -- ...)"
      cmd=(pnpm --dir "$openclaw_root" gateway:dev)
      ;;
    run)
      cmd=(pnpm --dir "$openclaw_root" openclaw gateway run)
      ;;
    *)
      die "invalid --mode: $mode (expected dev|run)"
      ;;
  esac

  log "openclaw gateway command (mode=$mode, root=$openclaw_root)"
  if [[ "$dry_run" -eq 1 ]]; then
    printf '%q ' "${cmd[@]}"
    if [[ "${#passthrough[@]}" -gt 0 ]]; then
      printf '%q ' "${passthrough[@]}"
    fi
    printf '\n'
    return 0
  fi

  if [[ "$mode" == "run" ]]; then
    if [[ "${#passthrough[@]}" -gt 0 ]]; then
      "${cmd[@]}" "${passthrough[@]}"
    else
      "${cmd[@]}"
    fi
  else
    "${cmd[@]}"
  fi
}

cmd_ios_rn_ipa() {
  require_cmd xcodebuild

  local ios_configuration="Release"
  local device_app_env=""
  local site_override=""
  local ws_override=""
  local archive_path=""
  local export_path=""
  local export_options_plist=""
  local export_method="app-store-connect"
  local allow_provisioning_updates=1
  local team_id=""
  local shell_team_id="${DEVBOX_IOS_TEAM_ID:-}"
  local skip_export=0
  local dry_run=0
  local timestamp=""
  local archive_site_url=""
  local archive_ws_url=""
  local archive_fallback_site_url=""
  local archive_fallback_ws_url=""
  local previous_site_url=""
  local previous_ws_url=""
  local previous_fallback_site_url=""
  local previous_fallback_ws_url=""
  local restore_runtime_xcconfig=0
  local device_app_env_payload=""
  local device_app_env_path=""
  local temp_export_options_plist=""
  local previous_active_device_app_env="${DEVBOX_ACTIVE_DEVICE_APP_ENV:-}"
  local runtime_admob_app_id_ios=""
  local runtime_admob_app_id_android=""

  require_devbox_env

  timestamp="$(date '+%Y%m%d-%H%M%S')"
  archive_path="/tmp/mingle-${timestamp}.xcarchive"
  export_path="/tmp/mingle-ipa-${timestamp}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ios-configuration) ios_configuration="${2:-}"; shift 2 ;;
      --device-app-env) device_app_env="${2:-}"; shift 2 ;;
      --site-url) site_override="${2:-}"; shift 2 ;;
      --ws-url) ws_override="${2:-}"; shift 2 ;;
      --archive-path) archive_path="${2:-}"; shift 2 ;;
      --export-path) export_path="${2:-}"; shift 2 ;;
      --export-options-plist) export_options_plist="${2:-}"; shift 2 ;;
      --export-method) export_method="${2:-}"; shift 2 ;;
      --team-id) team_id="${2:-}"; shift 2 ;;
      --allow-provisioning-updates) allow_provisioning_updates=1; shift ;;
      --no-allow-provisioning-updates) allow_provisioning_updates=0; shift ;;
      --skip-export) skip_export=1; shift ;;
      --dry-run) dry_run=1; shift ;;
      *) die "unknown option for ios-rn-ipa: $1" ;;
    esac
  done

  ios_configuration="$(normalize_ios_configuration "$ios_configuration")"

  case "$export_method" in
    app-store) export_method="app-store-connect" ;;
    ad-hoc) export_method="release-testing" ;;
    development) export_method="debugging" ;;
    app-store-connect|release-testing|debugging|enterprise|validation) ;;
    *) die "invalid --export-method: $export_method (expected app-store-connect|release-testing|debugging|enterprise|validation)" ;;
  esac

  if [[ -n "$device_app_env" ]]; then
    DEVBOX_ACTIVE_DEVICE_APP_ENV="$device_app_env"
    device_app_env_payload="$(resolve_device_app_env_override "$device_app_env")"
    device_app_env_path="$(printf '%s\n' "$device_app_env_payload" | sed -n '1p')"
    archive_site_url="$(printf '%s\n' "$device_app_env_payload" | sed -n '2p')"
    archive_ws_url="$(printf '%s\n' "$device_app_env_payload" | sed -n '3p')"
    archive_fallback_site_url="$(printf '%s\n' "$device_app_env_payload" | sed -n '4p')"
    archive_fallback_ws_url="$(printf '%s\n' "$device_app_env_payload" | sed -n '5p')"
    log "ipa build app env override: $device_app_env (${device_app_env_path:-})"
  fi

  if [[ -n "$site_override" || -n "$ws_override" ]]; then
    [[ -n "$site_override" ]] || die "--ws-url requires --site-url"
    [[ -n "$ws_override" ]] || die "--site-url requires --ws-url"
    archive_site_url="$site_override"
    archive_ws_url="$ws_override"
  fi

  if [[ -z "$archive_site_url" ]]; then
    archive_site_url="${DEVBOX_SITE_URL:-}"
  fi
  if [[ -z "$archive_ws_url" ]]; then
    archive_ws_url="${DEVBOX_RN_WS_URL:-}"
  fi

  if [[ -z "$archive_site_url" ]]; then
    archive_site_url="$(trim_whitespace "$(read_app_setting_value NEXT_PUBLIC_SITE_URL || true)")"
  fi
  if [[ -z "$archive_ws_url" ]]; then
    archive_ws_url="$(trim_whitespace "$(read_app_setting_value NEXT_PUBLIC_WS_URL || true)")"
  fi
  if [[ -z "$archive_site_url" ]]; then
    archive_site_url="$(trim_whitespace "$(read_app_setting_value MINGLE_API_BASE_URL || true)")"
  fi
  if [[ -z "$archive_ws_url" ]]; then
    archive_ws_url="$(trim_whitespace "$(read_app_setting_value MINGLE_WS_URL || true)")"
  fi
  if [[ -z "$archive_site_url" ]]; then
    archive_site_url="$(trim_whitespace "$(read_app_setting_value RN_WEB_APP_BASE_URL || true)")"
  fi
  if [[ -z "$archive_site_url" ]]; then
    archive_site_url="$(trim_whitespace "$(read_app_setting_value MINGLE_WEB_APP_BASE_URL || true)")"
  fi
  if [[ -z "$archive_ws_url" ]]; then
    archive_ws_url="$(trim_whitespace "$(read_app_setting_value RN_DEFAULT_WS_URL || true)")"
  fi
  if [[ -z "$archive_ws_url" ]]; then
    archive_ws_url="$(trim_whitespace "$(read_app_setting_value MINGLE_DEFAULT_WS_URL || true)")"
  fi
  if [[ -z "$archive_fallback_site_url" ]]; then
    archive_fallback_site_url="$(trim_whitespace "$(read_app_setting_value MINGLE_API_FALLBACK_SITE_URL || true)")"
  fi
  if [[ -z "$archive_fallback_site_url" ]]; then
    archive_fallback_site_url="$(trim_whitespace "$(read_app_setting_value RN_WEB_APP_FALLBACK_BASE_URL || true)")"
  fi
  if [[ -z "$archive_fallback_site_url" ]]; then
    archive_fallback_site_url="$(trim_whitespace "$(read_app_setting_value MINGLE_LEGACY_SITE_URL || true)")"
  fi
  if [[ -z "$archive_fallback_ws_url" ]]; then
    archive_fallback_ws_url="$(trim_whitespace "$(read_app_setting_value MINGLE_STT_FALLBACK_WS_URL || true)")"
  fi
  if [[ -z "$archive_fallback_ws_url" ]]; then
    archive_fallback_ws_url="$(trim_whitespace "$(read_app_setting_value RN_DEFAULT_WS_FALLBACK_URL || true)")"
  fi
  if [[ -z "$archive_fallback_ws_url" ]]; then
    archive_fallback_ws_url="$(trim_whitespace "$(read_app_setting_value MINGLE_LEGACY_WS_URL || true)")"
  fi
  if [[ -z "$archive_fallback_site_url" ]]; then
    archive_fallback_site_url="$DEFAULT_RN_FALLBACK_SITE_URL"
  fi
  if [[ -z "$archive_fallback_ws_url" ]]; then
    archive_fallback_ws_url="$DEFAULT_RN_FALLBACK_WS_URL"
  fi

  [[ -n "$archive_site_url" ]] || die "missing archive site url (use --device-app-env, --site-url/--ws-url, or set NEXT_PUBLIC_SITE_URL)"
  [[ -n "$archive_ws_url" ]] || die "missing archive ws url (use --device-app-env, --site-url/--ws-url, or set NEXT_PUBLIC_WS_URL)"

  validate_http_url "archive site url" "$archive_site_url"
  validate_ws_url "archive ws url" "$archive_ws_url"
  validate_http_url "archive fallback site url" "$archive_fallback_site_url"
  validate_ws_url "archive fallback ws url" "$archive_fallback_ws_url"

  if [[ "$device_app_env" == "prod" ]]; then
    validate_https_url "archive site url (prod)" "$archive_site_url"
    validate_wss_url "archive ws url (prod)" "$archive_ws_url"
  fi

  if [[ -z "$team_id" ]]; then
    team_id="$(trim_whitespace "${DEVBOX_IOS_TEAM_ID:-}")"
  fi

  if [[ -z "$team_id" ]]; then
    team_id="$(trim_whitespace "$shell_team_id")"
  fi

  if [[ -z "$team_id" ]]; then
    team_id="$(trim_whitespace "$(resolve_rn_ios_development_team || true)")"
  fi

  [[ -n "$archive_path" ]] || die "--archive-path must not be empty"
  [[ -n "$export_path" ]] || die "--export-path must not be empty"
  ensure_single_line_value "archive path" "$archive_path"
  ensure_single_line_value "export path" "$export_path"

  if [[ "$skip_export" -eq 0 ]]; then
    if [[ -n "$export_options_plist" ]]; then
      [[ -f "$export_options_plist" ]] || die "export options plist not found: $export_options_plist"
    elif [[ "$dry_run" -eq 1 ]]; then
      export_options_plist="/tmp/mingle-export-options-${timestamp}.plist"
    else
      temp_export_options_plist="$(mktemp -t mingle-export-options)"
      cat > "$temp_export_options_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>$export_method</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>export</string>
EOF
      if [[ -n "$team_id" ]]; then
        cat >> "$temp_export_options_plist" <<EOF
  <key>teamID</key>
  <string>$team_id</string>
EOF
      fi
      cat >> "$temp_export_options_plist" <<'EOF'
</dict>
</plist>
EOF
      export_options_plist="$temp_export_options_plist"
    fi
  fi

  previous_site_url="${DEVBOX_SITE_URL:-}"
  previous_ws_url="${DEVBOX_RN_WS_URL:-}"
  previous_fallback_site_url="${DEVBOX_RN_FALLBACK_SITE_URL:-}"
  previous_fallback_ws_url="${DEVBOX_RN_FALLBACK_WS_URL:-}"
  if [[ -n "$previous_site_url" && -n "$previous_ws_url" ]]; then
    restore_runtime_xcconfig=1
  fi
  DEVBOX_SITE_URL="$archive_site_url"
  DEVBOX_RN_WS_URL="$archive_ws_url"
  DEVBOX_RN_FALLBACK_SITE_URL="$archive_fallback_site_url"
  DEVBOX_RN_FALLBACK_WS_URL="$archive_fallback_ws_url"
  write_rn_ios_runtime_xcconfig
  runtime_admob_app_id_ios="$(resolve_devbox_admob_app_id_ios)"
  runtime_admob_app_id_android="$(resolve_devbox_admob_app_id_android)"

  local -a xcode_provisioning_args=()
  if [[ "$allow_provisioning_updates" -eq 1 ]]; then
    xcode_provisioning_args+=(-allowProvisioningUpdates)
  fi

  log "building RN iOS archive (config=$ios_configuration, archive=$archive_path)"
  log "runtime URL: site=$archive_site_url ws=$archive_ws_url"

  if [[ "$dry_run" -eq 1 ]]; then
    cat <<EOF
xcodebuild -workspace $ROOT_DIR/mingle-app/rn/ios/mingle.xcworkspace -scheme mingle -configuration $ios_configuration -destination generic/platform=iOS -archivePath $archive_path -xcconfig $RN_IOS_RUNTIME_XCCONFIG ${xcode_provisioning_args[*]} archive
EOF
    if [[ "$skip_export" -eq 0 ]]; then
      cat <<EOF
xcodebuild -exportArchive ${xcode_provisioning_args[*]} -archivePath $archive_path -exportOptionsPlist $export_options_plist -exportPath $export_path
EOF
    fi
    if [[ "$restore_runtime_xcconfig" -eq 1 ]]; then
      DEVBOX_SITE_URL="$previous_site_url"
      DEVBOX_RN_WS_URL="$previous_ws_url"
      DEVBOX_RN_FALLBACK_SITE_URL="$previous_fallback_site_url"
      DEVBOX_RN_FALLBACK_WS_URL="$previous_fallback_ws_url"
      write_rn_ios_runtime_xcconfig
    fi
    DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"
    return 0
  fi

  ensure_rn_workspace_dependencies
  ensure_ios_pods_if_needed

  (
    local rn_app_json_backup=""
    local had_original_rn_app_json=0
    rn_app_json_backup="$(mktemp)"
    if [[ -f "$RN_APP_JSON_FILE" ]]; then
      cp "$RN_APP_JSON_FILE" "$rn_app_json_backup"
      had_original_rn_app_json=1
    fi
    trap 'restore_rn_mobile_ads_app_json "$rn_app_json_backup" "$had_original_rn_app_json"' EXIT
    write_rn_mobile_ads_app_json "$runtime_admob_app_id_android" "$runtime_admob_app_id_ios"
    cd "$ROOT_DIR/mingle-app/rn/ios"
    NEXT_PUBLIC_API_NAMESPACE="$IOS_RN_REQUIRED_API_NAMESPACE" \
      xcodebuild \
        "${xcode_provisioning_args[@]}" \
        -workspace "$ROOT_DIR/mingle-app/rn/ios/mingle.xcworkspace" \
        -scheme mingle \
        -configuration "$ios_configuration" \
        -destination "generic/platform=iOS" \
        -archivePath "$archive_path" \
        -xcconfig "$RN_IOS_RUNTIME_XCCONFIG" \
        archive
  )

  [[ -d "$archive_path" ]] || die "archive not found after build: $archive_path"

  if [[ "$skip_export" -eq 1 ]]; then
    if [[ "$restore_runtime_xcconfig" -eq 1 ]]; then
      DEVBOX_SITE_URL="$previous_site_url"
      DEVBOX_RN_WS_URL="$previous_ws_url"
      DEVBOX_RN_FALLBACK_SITE_URL="$previous_fallback_site_url"
      DEVBOX_RN_FALLBACK_WS_URL="$previous_fallback_ws_url"
      write_rn_ios_runtime_xcconfig
    fi
    DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"
    log "archive complete (export skipped): $archive_path"
    return 0
  fi

  xcodebuild \
    "${xcode_provisioning_args[@]}" \
    -exportArchive \
    -archivePath "$archive_path" \
    -exportOptionsPlist "$export_options_plist" \
    -exportPath "$export_path"

  local ipa_file=""
  ipa_file="$(find "$export_path" -maxdepth 1 -type f -name '*.ipa' | head -n 1)"
  [[ -n "$ipa_file" ]] || die "ipa export failed: no .ipa in $export_path"

  if [[ "$restore_runtime_xcconfig" -eq 1 ]]; then
    DEVBOX_SITE_URL="$previous_site_url"
    DEVBOX_RN_WS_URL="$previous_ws_url"
    DEVBOX_RN_FALLBACK_SITE_URL="$previous_fallback_site_url"
    DEVBOX_RN_FALLBACK_WS_URL="$previous_fallback_ws_url"
    write_rn_ios_runtime_xcconfig
  fi
  DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"

  log "archive complete: $archive_path"
  log "ipa exported: $ipa_file"
  log "next: Xcode Organizer -> Distribute App -> App Store Connect -> Upload"
}

cmd_ios_appstore_sync_metadata() {
  local appstore_connect_info_root="${APPSTORE_CONNECT_INFO_ROOT:-$ROOT_DIR/mingle-app/rn/appstore-connect-info}"
  local default_copy_json="$appstore_connect_info_root/appstore-connect-info.i18n.json"
  local legacy_copy_json="$ROOT_DIR/mingle-app/rn/appstore-media/copy/screenshot-copy.i18n.json"
  local copy_json="${COPY_JSON:-$default_copy_json}"
  local api_key_json="${API_KEY_JSON:-$ROOT_DIR/.credentials/appstore-connect/api-key.json}"
  local app_identifier="${APP_IDENTIFIER:-com.minglelabs.mingle.rn}"
  local dry_run="false"
  local no_fallback="false"
  local only_app_info="false"
  local only_version_urls="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        copy_json="${2:-}"
        shift 2
        ;;
      --api-key-json)
        api_key_json="${2:-}"
        shift 2
        ;;
      --app-id)
        app_identifier="${2:-}"
        shift 2
        ;;
      --dry-run)
        dry_run="true"
        shift
        ;;
      --no-fallback)
        no_fallback="true"
        shift
        ;;
      --only-app-info)
        only_app_info="true"
        shift
        ;;
      --only-version-urls)
        only_version_urls="true"
        shift
        ;;
      -h|--help)
        cat <<EOF
Usage: scripts/devbox ios-appstore-sync-metadata [options]

Options:
  --json <path>           i18n JSON path (default: $copy_json)
  --api-key-json <path>   App Store Connect API key JSON path (default: $api_key_json)
  --app-id <bundle-id>    App bundle identifier (default: $app_identifier)
  --dry-run               Print planned updates only (no ASC write)
  --no-fallback           Do not fallback metadata locale when target locale is missing
  --only-app-info         Only sync app info localizations (title, subtitle); skip version localizations
  --only-version-urls     Only sync version support/marketing URLs; skip other version metadata and app info
  -h, --help              Show help
EOF
        return 0
        ;;
      *)
        die "unknown option for ios-appstore-sync-metadata: $1"
        ;;
    esac
  done

  if [[ ! -f "$copy_json" && "$copy_json" == "$default_copy_json" && -f "$legacy_copy_json" ]]; then
    copy_json="$legacy_copy_json"
  fi

  [[ -f "$copy_json" ]] || die "missing JSON: $copy_json"
  [[ -f "$api_key_json" ]] || die "missing API key JSON: $api_key_json"
  if [[ "$only_app_info" == "true" && "$only_version_urls" == "true" ]]; then
    die "--only-app-info and --only-version-urls cannot be used together"
  fi
  require_cmd ruby

  log "syncing App Store Connect metadata from: $copy_json"
  log "target app id: $app_identifier (dry_run=$dry_run)"

  PATH="/opt/homebrew/opt/ruby/bin:/opt/homebrew/Cellar/fastlane/2.232.2/libexec/bin:$PATH" \
  GEM_HOME="${FASTLANE_GEM_HOME:-$HOME/.local/share/fastlane/4.0.0}" \
  GEM_PATH="${FASTLANE_GEM_HOME:-$HOME/.local/share/fastlane/4.0.0}:/opt/homebrew/Cellar/fastlane/2.232.2/libexec" \
  COPY_JSON="$copy_json" API_KEY_JSON="$api_key_json" APP_IDENTIFIER="$app_identifier" DRY_RUN="$dry_run" NO_FALLBACK="$no_fallback" ONLY_APP_INFO="$only_app_info" ONLY_VERSION_URLS="$only_version_urls" \
  ruby - <<'RUBY'
require 'json'
require 'spaceship'

def presence(value)
  return nil if value.nil?
  if value.is_a?(String)
    text = value.strip
    return nil if text.empty?
    return text
  end
  value
end

copy_json = ENV.fetch('COPY_JSON')
api_key_json = ENV.fetch('API_KEY_JSON')
app_identifier = ENV.fetch('APP_IDENTIFIER')
dry_run = ENV.fetch('DRY_RUN') == 'true'
no_fallback = ENV.fetch('NO_FALLBACK') == 'true'
only_app_info = ENV.fetch('ONLY_APP_INFO') == 'true'
only_version_urls = ENV.fetch('ONLY_VERSION_URLS') == 'true'

payload = JSON.parse(File.read(copy_json))

ios = payload['ios'].is_a?(Hash) ? payload['ios'] : {}
general_info = ios['generalInfo'].is_a?(Hash) ? ios['generalInfo'] : {}
app_info = general_info['appInfo'].is_a?(Hash) ? general_info['appInfo'] : {}
submission = ios['submission'].is_a?(Hash) ? ios['submission'] : {}
submission_app_store_info = submission['appStoreInfo'].is_a?(Hash) ? submission['appStoreInfo'] : {}

legacy_title_map = payload['title'].is_a?(Hash) ? payload['title'] : {}
legacy_subtitle_map = payload['subtitle'].is_a?(Hash) ? payload['subtitle'] : {}
legacy_app_store = payload['appStore'].is_a?(Hash) ? payload['appStore'] : {}

title_map = app_info['title'].is_a?(Hash) ? app_info['title'] : legacy_title_map
subtitle_map = app_info['subtitle'].is_a?(Hash) ? app_info['subtitle'] : legacy_subtitle_map
metadata_map = submission_app_store_info['metadata'].is_a?(Hash) ? submission_app_store_info['metadata'] : (legacy_app_store['metadata'].is_a?(Hash) ? legacy_app_store['metadata'] : {})
default_metadata_locale = no_fallback ? nil : (
  presence(submission_app_store_info['defaultMetadataLocale']) ||
  presence(legacy_app_store['defaultMetadataLocale']) ||
  'en'
)
expected_version = presence(submission['version']) || presence(legacy_app_store['version'])
copyright_value = presence(submission['copyright']) || presence(legacy_app_store['copyright'])

api = JSON.parse(File.read(api_key_json))
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
  key_id: api.fetch('key_id'),
  issuer_id: api.fetch('issuer_id'),
  key: api.fetch('key'),
  duration: 1200,
  in_house: api['in_house']
)

def json_locale_key_for_asc(locale)
  normalized = locale.to_s.strip.downcase
  return '' if normalized.empty?

  explicit = {
    'en-us' => 'en',
    'ko' => 'ko',
    'ja' => 'ja',
    'zh-hans' => 'zh-cn',
    'zh-hant' => 'zh-tw',
    'de-de' => 'de',
    'es-es' => 'es',
    'fr-fr' => 'fr',
    'fr-ca' => 'fr',
    'it' => 'it',
    'pt-br' => 'pt',
    'pt-pt' => 'pt',
    'ru' => 'ru',
    'ar-sa' => 'ar',
    'hi' => 'hi',
    'th' => 'th',
    'vi' => 'vi'
  }
  return explicit.fetch(normalized, normalized.split('-').first.to_s)
end

client = Spaceship::ConnectAPI.client.tunes_request_client
app = Spaceship::ConnectAPI::App.find(app_identifier)
raise "app not found: #{app_identifier}" unless app

def choose_ios_version(client, app, expected_version = nil)
  versions = client.get("https://api.appstoreconnect.apple.com/v1/apps/#{app.id}/appStoreVersions?filter[platform]=IOS&limit=50").body['data'] || []
  if expected_version
    exact = versions.find do |version|
      attrs = version['attributes'] || {}
      attrs['versionString'].to_s == expected_version
    end
    if exact
      exact_version_id = exact.respond_to?(:id) ? exact.id : exact['id']
      return Spaceship::ConnectAPI::AppStoreVersion.get(app_store_version_id: exact_version_id)
    end
  end

  editable = app.get_edit_app_store_version(platform: Spaceship::ConnectAPI::Platform::IOS)
  return editable if editable

  preferred = %w[READY_FOR_REVIEW READY_FOR_SALE PENDING_DEVELOPER_RELEASE PRE_ORDER_READY_FOR_SALE PREPARE_FOR_SUBMISSION]
  versions.sort_by! do |version|
    attrs = version['attributes'] || {}
    state = attrs['appStoreState'].to_s
    preferred_index = preferred.index(state) || preferred.length
    created_at = attrs['createdDate'].to_s
    [preferred_index, created_at.empty? ? '' : created_at]
  end
  selected = versions.reverse.find do |version|
    attrs = version['attributes'] || {}
    preferred.include?(attrs['appStoreState'].to_s)
  end || versions.last
  raise "iOS App Store version not found for #{app.bundle_id}" unless selected

  selected_version_id = selected.respond_to?(:id) ? selected.id : selected['id']
  Spaceship::ConnectAPI::AppStoreVersion.get(app_store_version_id: selected_version_id)
end

version = choose_ios_version(client, app, expected_version)

if expected_version && version.version_string != expected_version
  raise "editable version mismatch: expected #{expected_version}, actual #{version.version_string}"
end

version_loc_updates = 0
version_loc_skips = 0
app_info_loc_updates = 0
app_info_loc_skips = 0

unless only_app_info
version.get_app_store_version_localizations.each do |loc|
  asc_locale = loc.locale
  locale_key = json_locale_key_for_asc(asc_locale)
  metadata = metadata_map[locale_key]
  if metadata.nil? && default_metadata_locale
    metadata = metadata_map[default_metadata_locale]
  end
  metadata ||= {}

  attributes = {}
  if metadata.key?('supportUrl')
    attributes[:supportUrl] = metadata['supportUrl'].to_s
  end
  if metadata.key?('marketingUrl')
    attributes[:marketingUrl] = metadata['marketingUrl'].to_s
  end
  unless only_version_urls
    if metadata.key?('promotionalText')
      attributes[:promotionalText] = metadata['promotionalText'].to_s
    end
    if metadata.key?('whatsNew')
      attributes[:whatsNew] = metadata['whatsNew'].to_s
    end
    if metadata.key?('description')
      attributes[:description] = metadata['description'].to_s
    end
    if metadata.key?('keywords')
      raw_keywords = metadata['keywords']
      attributes[:keywords] = raw_keywords.is_a?(Array) ? raw_keywords.map(&:to_s).join(',') : raw_keywords.to_s
    end
  end

  attributes.delete_if { |_k, v| v.nil? }
  next if attributes.empty?

  puts "[version-loc] #{asc_locale} <- #{locale_key} #{attributes.keys.join(',')}"
  unless dry_run
    begin
      client.patch(
        "https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/#{loc.id}",
        {
          data: {
            type: 'appStoreVersionLocalizations',
            id: loc.id,
            attributes: attributes
          }
        }
      )
    rescue => error
      message = error.to_s
      if only_version_urls &&
         (message.include?("cannot be modified in the current state") ||
          message.include?("can not be modified in the current state") ||
          message.include?("cannot be edited at this time") ||
          message.include?("can not be edited at this time"))
        updated = false
        attributes.each do |key, value|
          begin
            client.patch(
              "https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/#{loc.id}",
              {
                data: {
                  type: 'appStoreVersionLocalizations',
                  id: loc.id,
                  attributes: {
                    key => value
                  }
                }
              }
            )
            puts "[version-loc] #{asc_locale} <- #{locale_key} #{key}-only"
            updated = true
          rescue => single_error
            single_message = single_error.to_s
            if single_message.include?("cannot be modified in the current state") ||
               single_message.include?("can not be modified in the current state") ||
               single_message.include?("cannot be edited at this time") ||
               single_message.include?("can not be edited at this time")
              puts "[skip version-loc] #{asc_locale} #{key} #{single_message.lines.first.to_s.strip}"
              next
            end
            raise
          end
        end
        if updated
          version_loc_updates += 1
        else
          version_loc_skips += 1
        end
        next
      end
      if message.include?("cannot be modified in the current state") ||
         message.include?("can not be modified in the current state") ||
         message.include?("cannot be edited at this time") ||
         message.include?("can not be edited at this time")
        puts "[skip version-loc] #{asc_locale} #{message.lines.first.to_s.strip}"
        version_loc_skips += 1
        next
      end
      raise
    end
  end
  version_loc_updates += 1
end
end # unless only_app_info

unless only_version_urls
  app_infos = client.get("https://api.appstoreconnect.apple.com/v1/apps/#{app.id}/appInfos").body['data'] || []
  raise "appInfo not found for app #{app.id}" if app_infos.empty?
  editable_states = %w[PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED METADATA_REJECTED REJECTED DEVELOPER_ACTION_NEEDED]
  preferred_app_info = app_infos.min_by do |ai|
    state = ai.dig('attributes', 'appStoreState').to_s
    idx = editable_states.index(state)
    idx ? idx : editable_states.length
  end
  app_info_id = preferred_app_info&.dig('id')
  puts "[app-info] selected appInfo #{app_info_id} (state=#{preferred_app_info&.dig('attributes', 'appStoreState')})"
  raise "appInfo not found for app #{app.id}" unless app_info_id

  app_info_loc_refs = client.get(
    "https://api.appstoreconnect.apple.com/v1/appInfos/#{app_info_id}/relationships/appInfoLocalizations"
  ).body['data'] || []

  app_info_loc_refs.each do |ref|
    loc_id = ref['id']
    instance = client.get("https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/#{loc_id}").body['data']
    asc_locale = instance.dig('attributes', 'locale').to_s
    locale_key = json_locale_key_for_asc(asc_locale)

    name = title_map[locale_key] || title_map['en']
    subtitle = subtitle_map[locale_key] || subtitle_map['en']
    current_name = instance.dig('attributes', 'name').to_s
    current_subtitle = instance.dig('attributes', 'subtitle').to_s

    attributes = {}
    attributes[:name] = name if name && name.to_s != current_name
    attributes[:subtitle] = subtitle if subtitle && subtitle.to_s != current_subtitle
    next if attributes.empty?

    puts "[app-info-loc] #{asc_locale} <- #{locale_key} #{attributes.keys.join(',')}"
    unless dry_run
      begin
        client.patch(
          "https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/#{loc_id}",
          {
            data: {
              type: 'appInfoLocalizations',
              id: loc_id,
              attributes: attributes
            }
          }
        )
      rescue => error
        message = error.to_s
        if attributes[:subtitle] && attributes[:name] &&
           (message.include?("cannot be modified in the current state") ||
            message.include?("can not be modified in the current state") ||
            message.include?("cannot be edited at this time") ||
            message.include?("can not be edited at this time"))
          begin
            client.patch(
              "https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/#{loc_id}",
              {
                data: {
                  type: 'appInfoLocalizations',
                  id: loc_id,
                  attributes: {
                    subtitle: attributes[:subtitle]
                  }
                }
              }
            )
            app_info_loc_updates += 1
            puts "[app-info-loc] #{asc_locale} <- #{locale_key} subtitle-only"
            next
          rescue => subtitle_error
            message = subtitle_error.to_s
          end
        end
        if message.include?("cannot be modified in the current state") ||
           message.include?("can not be modified in the current state") ||
           message.include?("cannot be edited at this time") ||
           message.include?("can not be edited at this time")
          puts "[skip app-info-loc] #{asc_locale} #{message.lines.first.to_s.strip}"
          app_info_loc_skips += 1
          next
        end
        raise
      end
    end
    app_info_loc_updates += 1
  end
end

if copyright_value && !only_version_urls
  puts "[version] set copyright on #{version.version_string}"
  unless dry_run
    begin
      client.patch(
        "https://api.appstoreconnect.apple.com/v1/appStoreVersions/#{version.id}",
        {
          data: {
            type: 'appStoreVersions',
            id: version.id,
            attributes: {
              copyright: copyright_value
            }
          }
        }
      )
    rescue => error
      message = error.to_s
      if message.include?("cannot be edited at this time")
        puts "[skip version] #{message.lines.first.to_s.strip}"
      else
        raise
      end
    end
  end
end

puts "done: version_localizations=#{version_loc_updates}, skipped_version_localizations=#{version_loc_skips}, app_info_localizations=#{app_info_loc_updates}, skipped_app_info_localizations=#{app_info_loc_skips}, dry_run=#{dry_run}"
RUBY
}

cmd_mobile() {
  require_devbox_env
  require_cmd pnpm

  local active_profile="${DEVBOX_PROFILE:-local}"
  local active_host="${DEVBOX_LOCAL_HOST:-127.0.0.1}"
  local profile_override=""
  local host_override=""
  local with_ios_clean_install=0
  local device_app_env=""
  local platform="all"
  local ios_runtime="rn"
  local ios_udid=""
  local android_serial=""
  local ios_configuration="Release"
  local android_variant="release"
  local qa_bridge_enabled=0
  local tunnel_provider_override=""
  local mobile_site_override=""
  local mobile_ws_override=""
  local site_override=""
  local ws_override=""
  local previous_active_device_app_env="${DEVBOX_ACTIVE_DEVICE_APP_ENV:-}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile) profile_override="${2:-}"; shift 2 ;;
      --host) host_override="${2:-}"; shift 2 ;;
      --platform) platform="${2:-}"; shift 2 ;;
      --ios-runtime) ios_runtime="${2:-}"; shift 2 ;;
      --ios-udid) ios_udid="${2:-}"; shift 2 ;;
      --android-serial) android_serial="${2:-}"; shift 2 ;;
      --ios-configuration) ios_configuration="${2:-}"; shift 2 ;;
      --android-variant) android_variant="${2:-}"; shift 2 ;;
      --with-ios-clean-install) with_ios_clean_install=1; shift ;;
      --qa-bridge) qa_bridge_enabled=1; shift ;;
      --device-app-env) device_app_env="${2:-}"; shift 2 ;;
      --tunnel-provider) tunnel_provider_override="${2:-}"; shift 2 ;;
      --site-url) site_override="${2:-}"; shift 2 ;;
      --ws-url) ws_override="${2:-}"; shift 2 ;;
      *) die "unknown option for mobile: $1" ;;
    esac
  done

  if [[ -n "$profile_override" ]]; then
    case "$profile_override" in
      local|device) active_profile="$profile_override" ;;
      *) die "invalid --profile for mobile: $profile_override (expected local|device)" ;;
    esac
  fi

  if [[ -n "$host_override" ]]; then
    active_host="$host_override"
  fi

  if [[ -n "$site_override" || -n "$ws_override" ]]; then
    [[ -n "$site_override" ]] || die "--ws-url requires --site-url"
    [[ -n "$ws_override" ]] || die "--site-url requires --ws-url"
    validate_http_url "mobile site url override" "$site_override"
    validate_ws_url "mobile ws url override" "$ws_override"
    mobile_site_override="$site_override"
    mobile_ws_override="$ws_override"
  fi

  if [[ -n "${ios_runtime:-}" ]]; then
    normalize_ios_runtime "${ios_runtime:-rn}" >/dev/null
  fi
  local tunnel_provider=""
  tunnel_provider="$(resolve_tunnel_provider "$tunnel_provider_override")"
  DEVBOX_TUNNEL_PROVIDER="$tunnel_provider"
  DEVBOX_ACTIVE_DEVICE_APP_ENV="$device_app_env"
  local profile_already_saved=0
  case "$active_profile" in
    device)
      if [[ "$device_app_env" == "prod" ]]; then
        log "device app env is prod; skipping device tunnel profile refresh"
      elif [[ -n "$mobile_site_override" || -n "$mobile_ws_override" ]]; then
        log "manual mobile runtime URL override is set; skipping device tunnel profile refresh"
      else
        case "$tunnel_provider" in
          ngrok)
            # Refresh ngrok-derived URLs before mobile build/install to avoid stale app URL embedding.
            # Keep existing ngrok alive so mobile clean-install can run while `devbox up --profile device` is active.
            apply_profile "device"
            profile_already_saved=1
            ;;
          cloudflare)
            local cloudflare_named_hosts=""
            cloudflare_named_hosts="$(resolve_cloudflare_named_hostnames || true)"
            if [[ -z "$cloudflare_named_hosts" ]]; then
              die "cloudflare mobile profile refresh requires named tunnel hostnames (DEVBOX_CLOUDFLARE_WEB_HOSTNAME/STT_HOSTNAME/MESSAGING_HOSTNAME)."
            fi
            local cloudflare_named_web_host=""
            local cloudflare_named_stt_host=""
            local cloudflare_named_messaging_host=""
            cloudflare_named_web_host="$(printf '%s\n' "$cloudflare_named_hosts" | sed -n '1p')"
            cloudflare_named_stt_host="$(printf '%s\n' "$cloudflare_named_hosts" | sed -n '2p')"
            cloudflare_named_messaging_host="$(printf '%s\n' "$cloudflare_named_hosts" | sed -n '3p')"
            set_device_profile_values_from_urls \
              "https://$cloudflare_named_web_host" \
              "https://$cloudflare_named_stt_host" \
              "https://$cloudflare_named_messaging_host" \
              "cloudflare"
            ;;
          *)
            die "unsupported tunnel provider for mobile: $tunnel_provider"
            ;;
        esac
      fi
      ;;
    local)
      apply_profile "local" "$active_host"
      profile_already_saved=1
      ;;
    *)
      die "unsupported DEVBOX_PROFILE: $active_profile (expected local|device)"
      ;;
  esac
  if [[ "$profile_already_saved" -eq 0 ]]; then
    save_and_refresh
  fi

  if [[ -n "$device_app_env" ]]; then
    [[ "$active_profile" == "device" ]] || die "--device-app-env is only supported when DEVBOX_PROFILE=device"
    local device_app_env_payload=""
    local device_app_env_path=""
    device_app_env_payload="$(resolve_device_app_env_override "$device_app_env")"
    device_app_env_path="$(printf '%s\n' "$device_app_env_payload" | sed -n '1p')"
    mobile_site_override="$(printf '%s\n' "$device_app_env_payload" | sed -n '2p')"
    mobile_ws_override="$(printf '%s\n' "$device_app_env_payload" | sed -n '3p')"
    DEVBOX_RN_FALLBACK_SITE_URL="$(printf '%s\n' "$device_app_env_payload" | sed -n '4p')"
    DEVBOX_RN_FALLBACK_WS_URL="$(printf '%s\n' "$device_app_env_payload" | sed -n '5p')"
    log "device app env override: $device_app_env (${device_app_env_path:-})"
  fi
  DEVBOX_ACTIVE_DEVICE_APP_ENV="$device_app_env"
  ios_configuration="$(normalize_ios_configuration "$ios_configuration")"
  android_variant="$(normalize_android_variant "$android_variant")"

  local do_rn_ios=0
  local do_android=0

  case "$platform" in
    ios) do_rn_ios=1 ;;
    android)
      do_android=1
      ;;
    all)
      do_rn_ios=1
      do_android=1
      ;;
    *)
      die "invalid --platform: $platform (expected ios|android|all)"
    ;;
  esac

  if [[ -n "$ios_udid" ]]; then
    do_rn_ios=1
  fi
  if [[ -n "$android_serial" ]]; then
    do_android=1
  fi

  local effective_ios_site_url="${mobile_site_override:-$DEVBOX_SITE_URL}"
  guard_rn_ios_local_profile_on_device \
    "$active_profile" \
    "$do_rn_ios" \
    "$ios_udid" \
    "$effective_ios_site_url"

  run_mobile_install_targets \
    "$do_rn_ios" \
    "$do_android" \
    "$ios_udid" \
    "$android_serial" \
    "$ios_configuration" \
    "$android_variant" \
    "$with_ios_clean_install" \
    "$mobile_site_override" \
    "$mobile_ws_override" \
    "$device_app_env" \
    "$qa_bridge_enabled" \
    "${DEVBOX_RN_FALLBACK_SITE_URL:-}" \
    "${DEVBOX_RN_FALLBACK_WS_URL:-}"

  DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"
  log "mobile build/install complete"
}

cmd_up() {
  require_devbox_env
  require_cmd pnpm
  local vault_override=""

  local profile="local"
  local host=""
  local with_metro=0
  local with_ios_install=0
  local with_android_install=0
  local ios_runtime="rn"
  local with_ios_clean_install=0
  local qa_bridge_enabled=0
  local device_app_env=""
  local ios_udid=""
  local android_serial=""
  local ios_configuration="Release"
  local android_variant="release"
  local mobile_site_override=""
  local mobile_ws_override=""
  local tunnel_provider_override=""
  local previous_active_device_app_env="${DEVBOX_ACTIVE_DEVICE_APP_ENV:-}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile) profile="${2:-}"; shift 2 ;;
      --host) host="${2:-}"; shift 2 ;;
      --with-metro) with_metro=1; shift ;;
      --with-ios-install) with_ios_install=1; shift ;;
      --with-android-install) with_android_install=1; shift ;;
      --with-mobile-install) with_ios_install=1; with_android_install=1; shift ;;
      --ios-runtime) ios_runtime="${2:-}"; shift 2 ;;
      --with-ios-clean-install) with_ios_clean_install=1; shift ;;
      --qa-bridge) qa_bridge_enabled=1; shift ;;
      --ios-udid) ios_udid="${2:-}"; with_ios_install=1; shift 2 ;;
      --android-serial) android_serial="${2:-}"; with_android_install=1; shift 2 ;;
      --ios-configuration) ios_configuration="${2:-}"; shift 2 ;;
      --android-variant) android_variant="${2:-}"; shift 2 ;;
      --tunnel-provider) tunnel_provider_override="${2:-}"; shift 2 ;;
      --device-app-env) device_app_env="${2:-}"; shift 2 ;;
      --vault-path) vault_override="${2:-}"; shift 2 ;;
      *) die "unknown option for up: $1" ;;
    esac
  done

  ios_runtime="$(normalize_ios_runtime "$ios_runtime")"
  ios_configuration="$(normalize_ios_configuration "$ios_configuration")"
  android_variant="$(normalize_android_variant "$android_variant")"
  local tunnel_provider=""
  tunnel_provider="$(resolve_tunnel_provider "$tunnel_provider_override")"
  DEVBOX_TUNNEL_PROVIDER="$tunnel_provider"
  DEVBOX_ACTIVE_DEVICE_APP_ENV="$device_app_env"

  resolve_vault_path "$vault_override"
  log "stateless mode: skipping automatic vault -> .env.local sync (.env.local is user-managed)"
  local runtime_env_file=""
  local runtime_nextauth_secret=""
  local runtime_realtime_secret=""
  local runtime_admob_app_id_ios=""
  local runtime_admob_app_id_android=""
  local runtime_admob_banner_unit_id_ios=""
  local runtime_admob_banner_unit_id_android=""
  runtime_env_file="$(mktemp "${TMPDIR:-/tmp}/devbox-runtime-env.XXXXXX")"
  write_runtime_env_from_vault_path "mingle" "$DEVBOX_VAULT_PATH" "$runtime_env_file"
  runtime_nextauth_secret="$(resolve_runtime_nextauth_secret "$runtime_env_file")"
  runtime_realtime_secret="$(read_env_value_from_file MINGLE_REALTIME_SECRET "$runtime_env_file")"
  if [[ -z "$runtime_realtime_secret" ]]; then
    runtime_realtime_secret="$(read_main_root_setting_value MINGLE_REALTIME_SECRET || true)"
  fi
  if [[ -z "$runtime_realtime_secret" ]]; then
    runtime_realtime_secret="$(read_env_value_from_file MINGLE_REALTIME_SECRET "$APP_ENV_FILE")"
  fi
  if [[ -z "$runtime_realtime_secret" ]]; then
    runtime_realtime_secret="$(read_env_value_from_file MINGLE_REALTIME_SECRET "$STT_ENV_FILE")"
  fi
  runtime_admob_app_id_ios="$(resolve_devbox_admob_app_id_ios)"
  runtime_admob_app_id_android="$(resolve_devbox_admob_app_id_android)"
  runtime_admob_banner_unit_id_ios="$(resolve_devbox_admob_banner_unit_id_ios)"
  runtime_admob_banner_unit_id_android="$(resolve_devbox_admob_banner_unit_id_android)"
  ensure_workspace_dependencies

  local -a pids=()
  local exit_code=0
  local started_tunnel_mode="none"
  local cloudflared_web_url=""
  local cloudflared_stt_url=""
  local cloudflared_messaging_url=""
  local cloudflared_web_log=""
  local cloudflared_stt_log=""
  local cloudflared_messaging_log=""
  local cloudflared_web_pid=""
  local cloudflared_stt_pid=""
  local cloudflared_messaging_pid=""
  local cloudflared_named_log=""
  local cloudflared_named_pid_file=""
  local cloudflared_named_config_file=""
  local cloudflared_named_token=""
  local cloudflared_named_web_host=""
  local cloudflared_named_stt_host=""
  local cloudflared_named_messaging_host=""

  if [[ "$profile" == "device" ]]; then
    if [[ "$device_app_env" == "prod" ]]; then
      log "device app env is prod; skipping device tunnel startup/check"
    else
      case "$tunnel_provider" in
        ngrok)
          if [[ "$with_ios_clean_install" -eq 1 ]]; then
            stop_existing_ngrok_by_inspector_port "$DEVBOX_NGROK_API_PORT"
          fi
          write_ngrok_local_config

          if ! try_read_ngrok_urls "$DEVBOX_WEB_PORT" "$DEVBOX_STT_PORT" "$DEVBOX_MESSAGING_PORT" "1" "$DEVBOX_NGROK_API_PORT"; then
            if [[ "$NGROK_LAST_ERROR_KIND" == "tunnel_mismatch" ]]; then
              die "running ngrok tunnels do not match this worktree ports(web=$DEVBOX_WEB_PORT stt=$DEVBOX_STT_PORT messaging=$DEVBOX_MESSAGING_PORT) or are not https/wss (inspector port=$DEVBOX_NGROK_API_PORT).
$NGROK_LAST_ERROR
$(ngrok_plan_capacity_hint)"
            fi
            require_cmd ngrok
            log "starting ngrok for device profile"
            if launch_ngrok_in_separate_terminal; then
              started_tunnel_mode="ngrok-separate"
              log "ngrok started in a separate terminal pane/tab"
            else
              log "separate terminal launch unavailable; falling back to inline ngrok"
              (
                cd "$ROOT_DIR"
                scripts/ngrok-start-mobile.sh --log stdout --log-format logfmt
              ) &
              pids+=("$!")
              started_tunnel_mode="ngrok-inline"
            fi

            if ! wait_for_ngrok_tunnels "$DEVBOX_WEB_PORT" "$DEVBOX_STT_PORT" "$DEVBOX_MESSAGING_PORT" "1" "$DEVBOX_NGROK_API_PORT" 20; then
              if [[ "$started_tunnel_mode" == "ngrok-inline" ]]; then
                cleanup_processes "${pids[@]}"
              fi
              if [[ -n "$NGROK_LAST_ERROR" ]]; then
                die "$NGROK_LAST_ERROR
$(ngrok_plan_capacity_hint)"
              fi
              die "ngrok inspector(port=$DEVBOX_NGROK_API_PORT) did not expose matching web/stt/messaging tunnels within 20s.
$(ngrok_plan_capacity_hint)"
            fi
          else
            started_tunnel_mode="ngrok-reused"
          fi
          ;;
        cloudflare)
          require_cmd cloudflared
          local cloudflare_named_payload=""
          cloudflare_named_payload="$(resolve_cloudflare_named_tunnel_settings || true)"

          if [[ -n "$cloudflare_named_payload" ]]; then
            cloudflared_named_token="$(printf '%s\n' "$cloudflare_named_payload" | sed -n '1p')"
            cloudflared_named_web_host="$(printf '%s\n' "$cloudflare_named_payload" | sed -n '2p')"
            cloudflared_named_stt_host="$(printf '%s\n' "$cloudflare_named_payload" | sed -n '3p')"

            cloudflared_named_messaging_host="$(printf '%s\n' "$cloudflare_named_payload" | sed -n '4p')"
            cloudflared_named_pid_file="$(cloudflared_named_pid_file_path)"
            cloudflared_named_log="$(cloudflared_named_log_file_path)"
            cloudflared_named_config_file="$(cloudflared_named_config_file_path)"
            mkdir -p "$(dirname "$cloudflared_named_pid_file")"

            stop_cloudflared_named_tunnel_from_pidfile
            rm -f "$cloudflared_named_log"
            write_cloudflared_named_config \
              "$cloudflared_named_config_file" \
              "$cloudflared_named_web_host" \
              "$cloudflared_named_stt_host" \
              "$cloudflared_named_messaging_host"

            log "starting cloudflared named tunnel connector"
            cloudflared --config "$cloudflared_named_config_file" tunnel --no-autoupdate run --token "$cloudflared_named_token" >"$cloudflared_named_log" 2>&1 &
            local cloudflared_named_pid="$!"
            printf '%s\n' "$cloudflared_named_pid" > "$cloudflared_named_pid_file"
            pids+=("$cloudflared_named_pid")

            if ! wait_for_cloudflared_named_tunnel "$cloudflared_named_log" "$cloudflared_named_pid" 25; then
              cleanup_processes "${pids[@]}"
              rm -f "$cloudflared_named_pid_file"
              die "cloudflared named tunnel startup failed (log: $cloudflared_named_log)"
            fi

            local cloudflared_named_remote_web_port=""
            local cloudflared_named_remote_stt_port=""
            local cloudflared_named_remote_messaging_port=""
            if ! cloudflared_named_remote_web_port="$(wait_for_cloudflared_named_service_port "$cloudflared_named_log" "$cloudflared_named_pid" "$cloudflared_named_web_host" 15)"; then
              cleanup_processes "${pids[@]}"
              rm -f "$cloudflared_named_pid_file"
              die "cloudflared named tunnel did not publish web bridge port for $cloudflared_named_web_host (log: $cloudflared_named_log)"
            fi
            if ! cloudflared_named_remote_stt_port="$(wait_for_cloudflared_named_service_port "$cloudflared_named_log" "$cloudflared_named_pid" "$cloudflared_named_stt_host" 15)"; then
              cleanup_processes "${pids[@]}"
              rm -f "$cloudflared_named_pid_file"
              die "cloudflared named tunnel did not publish stt bridge port for $cloudflared_named_stt_host (log: $cloudflared_named_log)"
            fi
            if ! cloudflared_named_remote_messaging_port="$(wait_for_cloudflared_named_service_port "$cloudflared_named_log" "$cloudflared_named_pid" "$cloudflared_named_messaging_host" 15)"; then
              cleanup_processes "${pids[@]}"
              rm -f "$cloudflared_named_pid_file"
              die "cloudflared named tunnel did not publish messaging bridge port for $cloudflared_named_messaging_host (log: $cloudflared_named_log)"
            fi
            ensure_cloudflared_named_bridge "web" "$cloudflared_named_remote_web_port" "$DEVBOX_WEB_PORT" pids
            ensure_cloudflared_named_bridge "stt" "$cloudflared_named_remote_stt_port" "$DEVBOX_STT_PORT" pids
            ensure_cloudflared_named_bridge "messaging" "$cloudflared_named_remote_messaging_port" "$DEVBOX_MESSAGING_PORT" pids

            cloudflared_web_url="https://$cloudflared_named_web_host"
            cloudflared_stt_url="https://$cloudflared_named_stt_host"
            cloudflared_messaging_url="https://$cloudflared_named_messaging_host"
            started_tunnel_mode="cloudflare-named"
            log "cloudflared named tunnel ready: web=$cloudflared_web_url stt=$cloudflared_stt_url messaging=$cloudflared_messaging_url"
          else
            if [[ "$with_ios_clean_install" -eq 1 ]]; then
              stop_existing_cloudflared_by_local_port "$DEVBOX_WEB_PORT"
              stop_existing_cloudflared_by_local_port "$DEVBOX_STT_PORT"
              stop_existing_cloudflared_by_local_port "$DEVBOX_MESSAGING_PORT"
            fi

            cloudflared_web_log="$(mktemp "${TMPDIR:-/tmp}/devbox-cloudflared-web.XXXXXX")"
            cloudflared_stt_log="$(mktemp "${TMPDIR:-/tmp}/devbox-cloudflared-stt.XXXXXX")"
            cloudflared_messaging_log="$(mktemp "${TMPDIR:-/tmp}/devbox-cloudflared-messaging.XXXXXX")"

            log "starting cloudflared quick tunnel for web(port=$DEVBOX_WEB_PORT)"
            cloudflared tunnel --url "http://127.0.0.1:$DEVBOX_WEB_PORT" --no-autoupdate >"$cloudflared_web_log" 2>&1 &
            cloudflared_web_pid="$!"
            pids+=("$cloudflared_web_pid")

            log "starting cloudflared quick tunnel for stt(port=$DEVBOX_STT_PORT)"
            cloudflared tunnel --url "http://127.0.0.1:$DEVBOX_STT_PORT" --no-autoupdate >"$cloudflared_stt_log" 2>&1 &
            cloudflared_stt_pid="$!"
            pids+=("$cloudflared_stt_pid")

            log "starting cloudflared quick tunnel for messaging(port=$DEVBOX_MESSAGING_PORT)"
            cloudflared tunnel --url "http://127.0.0.1:$DEVBOX_MESSAGING_PORT" --no-autoupdate >"$cloudflared_messaging_log" 2>&1 &
            cloudflared_messaging_pid="$!"
            pids+=("$cloudflared_messaging_pid")

            if ! cloudflared_web_url="$(wait_for_cloudflared_tunnel_url "$cloudflared_web_log" "$cloudflared_web_pid" 25)"; then
              cleanup_processes "${pids[@]}"
              die "cloudflared web tunnel startup failed (log: $cloudflared_web_log)"
            fi
            if ! cloudflared_stt_url="$(wait_for_cloudflared_tunnel_url "$cloudflared_stt_log" "$cloudflared_stt_pid" 25)"; then
              cleanup_processes "${pids[@]}"
              die "cloudflared stt tunnel startup failed (log: $cloudflared_stt_log)"
            fi
            if ! cloudflared_messaging_url="$(wait_for_cloudflared_tunnel_url "$cloudflared_messaging_log" "$cloudflared_messaging_pid" 25)"; then
              cleanup_processes "${pids[@]}"
              die "cloudflared messaging tunnel startup failed (log: $cloudflared_messaging_log)"
            fi

            started_tunnel_mode="cloudflare-quick"
            log "cloudflared quick tunnel ready: web=$cloudflared_web_url stt=$cloudflared_stt_url messaging=$cloudflared_messaging_url"
          fi
          ;;
        *)
          die "unsupported tunnel provider: $tunnel_provider"
          ;;
      esac
    fi
  elif [[ -n "$device_app_env" ]]; then
    die "--device-app-env is only supported with --profile device"
  fi

  if [[ "$profile" == "device" && "$device_app_env" == "prod" ]]; then
    log "device app env is prod; skipping device profile URL sync"
  else
    if [[ "$profile" == "device" && "$tunnel_provider" == "cloudflare" && "$device_app_env" != "prod" ]]; then
      set_device_profile_values_from_urls "$cloudflared_web_url" "$cloudflared_stt_url" "$cloudflared_messaging_url" "cloudflare"
      save_and_refresh
    else
      apply_profile "$profile" "$host"
    fi
    cmd_status
  fi

  if [[ "$profile" == "device" && -n "$device_app_env" ]]; then
    local device_app_env_payload=""
    local device_app_env_path=""
    device_app_env_payload="$(resolve_device_app_env_override "$device_app_env")"
    device_app_env_path="$(printf '%s\n' "$device_app_env_payload" | sed -n '1p')"
    mobile_site_override="$(printf '%s\n' "$device_app_env_payload" | sed -n '2p')"
    mobile_ws_override="$(printf '%s\n' "$device_app_env_payload" | sed -n '3p')"
    DEVBOX_RN_FALLBACK_SITE_URL="$(printf '%s\n' "$device_app_env_payload" | sed -n '4p')"
    DEVBOX_RN_FALLBACK_WS_URL="$(printf '%s\n' "$device_app_env_payload" | sed -n '5p')"
    log "device app env override: $device_app_env (${device_app_env_path:-})"
  fi

  if [[ "$with_ios_install" -eq 1 || "$with_android_install" -eq 1 ]]; then
    local do_rn_ios=0
    local do_android=0

    if [[ "$with_ios_install" -eq 1 ]]; then
      do_rn_ios=1
    fi

    if [[ "$with_android_install" -eq 1 ]]; then
      do_android=1
    fi

    if [[ -n "$ios_udid" ]]; then
      do_rn_ios=1
    fi
    if [[ -n "$android_serial" ]]; then
      do_android=1
    fi

    local effective_ios_site_url="${mobile_site_override:-$DEVBOX_SITE_URL}"
    guard_rn_ios_local_profile_on_device \
      "$profile" \
      "$do_rn_ios" \
      "$ios_udid" \
      "$effective_ios_site_url"

    run_mobile_install_targets \
      "$do_rn_ios" \
      "$do_android" \
      "$ios_udid" \
      "$android_serial" \
      "$ios_configuration" \
      "$android_variant" \
      "$with_ios_clean_install" \
      "$mobile_site_override" \
      "$mobile_ws_override" \
      "$device_app_env" \
      "$qa_bridge_enabled" \
      "${DEVBOX_RN_FALLBACK_SITE_URL:-}" \
      "${DEVBOX_RN_FALLBACK_WS_URL:-}"
  fi

  if [[ "$profile" == "device" && "$device_app_env" == "prod" ]]; then
    log "device app env is prod; skipping mingle-app/mingle-stt/mingle-messaging/tunnel runtime startup"
    rm -f "$runtime_env_file"
    DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"
    return 0
  fi

  log "starting mingle-stt(port=$DEVBOX_STT_PORT) + mingle-messaging(port=$DEVBOX_MESSAGING_PORT) + mingle-app(port=$DEVBOX_WEB_PORT)"
  (
    cd "$ROOT_DIR/mingle-stt"
    best_effort_raise_nofile_limit
    if [[ -s "$runtime_env_file" ]]; then
      set -a
      # shellcheck disable=SC1090
      . "$runtime_env_file"
      set +a
    fi
    PORT="$DEVBOX_STT_PORT" pnpm dev
  ) &
  pids+=("$!")

  (
    cd "$ROOT_DIR/mingle-messaging"
    best_effort_raise_nofile_limit
    if [[ -s "$runtime_env_file" ]]; then
      set -a
      # shellcheck disable=SC1090
      . "$runtime_env_file"
      set +a
    fi
    MINGLE_REALTIME_SECRET="$runtime_realtime_secret" PORT="$DEVBOX_MESSAGING_PORT" pnpm dev
  ) &
  pids+=("$!")

  (
    cd "$ROOT_DIR/mingle-app"
    best_effort_raise_nofile_limit
    if [[ -s "$runtime_env_file" ]]; then
      set -a
      # shellcheck disable=SC1090
      . "$runtime_env_file"
      set +a
    fi
    normalize_prisma_database_env
    # Turbopack is the default for devbox because webpack's macOS watcher can
    # wedge after startup on some worktrees and leave every route unresponsive.
    # Set DEVBOX_NEXT_DEV_BUNDLER=webpack when debugging webpack-specific issues.
    export DEVBOX_WORKTREE_NAME="$DEVBOX_WORKTREE_NAME"
    export DEVBOX_PROFILE="$DEVBOX_PROFILE"
    export DEVBOX_WEB_PORT="$DEVBOX_WEB_PORT"
    export DEVBOX_STT_PORT="$DEVBOX_STT_PORT"
    export DEVBOX_MESSAGING_PORT="$DEVBOX_MESSAGING_PORT"
    export DEVBOX_METRO_PORT="$DEVBOX_METRO_PORT"
    export NEXT_PUBLIC_SITE_URL="$DEVBOX_SITE_URL"
    export NEXTAUTH_URL="$DEVBOX_SITE_URL"
    export NEXTAUTH_SECRET="$runtime_nextauth_secret"
    export AUTH_SECRET="$runtime_nextauth_secret"
    export NEXT_PUBLIC_WS_PORT="$DEVBOX_STT_PORT"
    export NEXT_PUBLIC_WS_URL="$DEVBOX_PUBLIC_WS_URL"
    export NEXT_PUBLIC_MESSAGING_WS_URL="$DEVBOX_PUBLIC_MESSAGING_WS_URL"
    export MINGLE_MESSAGING_URL="http://127.0.0.1:$DEVBOX_MESSAGING_PORT"
    export MINGLE_REALTIME_SECRET="$runtime_realtime_secret"
    export NEXT_PUBLIC_API_NAMESPACE="$IOS_RN_REQUIRED_API_NAMESPACE"
    export RN_ADMOB_APP_ID_IOS="$runtime_admob_app_id_ios"
    export RN_ADMOB_APP_ID_ANDROID="$runtime_admob_app_id_android"
    export RN_ADMOB_BANNER_UNIT_ID_IOS="$runtime_admob_banner_unit_id_ios"
    export RN_ADMOB_BANNER_UNIT_ID_ANDROID="$runtime_admob_banner_unit_id_android"
    export MINGLE_TEST_API_BASE_URL="$DEVBOX_TEST_API_BASE_URL"
    export MINGLE_TEST_WS_URL="$DEVBOX_TEST_WS_URL"
    export WATCHPACK_POLLING="${WATCHPACK_POLLING:-false}"
    export CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-0}"
    if [[ "${DEVBOX_NEXT_DEV_BUNDLER:-turbopack}" == "turbopack" ]]; then
      pnpm exec next dev --port "$DEVBOX_WEB_PORT"
    else
      pnpm exec next dev --webpack --port "$DEVBOX_WEB_PORT"
    fi
  ) &
  pids+=("$!")

  if [[ "$with_metro" -eq 1 ]]; then
    require_cmd node
    log "starting Metro(port=$DEVBOX_METRO_PORT)"
    (
      cd "$ROOT_DIR/mingle-app"
      if [[ -s "$runtime_env_file" ]]; then
        set -a
        # shellcheck disable=SC1090
        . "$runtime_env_file"
        set +a
      fi
      normalize_prisma_database_env
      DEVBOX_WORKTREE_NAME="$DEVBOX_WORKTREE_NAME" \
      DEVBOX_PROFILE="$DEVBOX_PROFILE" \
      DEVBOX_WEB_PORT="$DEVBOX_WEB_PORT" \
      DEVBOX_STT_PORT="$DEVBOX_STT_PORT" \
      DEVBOX_METRO_PORT="$DEVBOX_METRO_PORT" \
      NEXT_PUBLIC_SITE_URL="$DEVBOX_SITE_URL" \
      NEXTAUTH_URL="$DEVBOX_SITE_URL" \
      NEXTAUTH_SECRET="$runtime_nextauth_secret" \
      AUTH_SECRET="$runtime_nextauth_secret" \
      NEXT_PUBLIC_WS_PORT="$DEVBOX_STT_PORT" \
      NEXT_PUBLIC_WS_URL="$DEVBOX_PUBLIC_WS_URL" \
      NEXT_PUBLIC_API_NAMESPACE="$IOS_RN_REQUIRED_API_NAMESPACE" \
      RN_ADMOB_APP_ID_IOS="$runtime_admob_app_id_ios" \
      RN_ADMOB_APP_ID_ANDROID="$runtime_admob_app_id_android" \
      RN_ADMOB_BANNER_UNIT_ID_IOS="$runtime_admob_banner_unit_id_ios" \
      RN_ADMOB_BANNER_UNIT_ID_ANDROID="$runtime_admob_banner_unit_id_android" \
      MINGLE_TEST_API_BASE_URL="$DEVBOX_TEST_API_BASE_URL" \
      MINGLE_TEST_WS_URL="$DEVBOX_TEST_WS_URL" \
      node scripts/run-with-env-local.mjs pnpm --dir rn start --port "$DEVBOX_METRO_PORT"
    ) &
    pids+=("$!")
  fi

  rm -f "$runtime_env_file"

  if [[ "$started_tunnel_mode" == "ngrok-inline" ]]; then
    log "ngrok is running with this process group (Ctrl+C to stop all)"
  elif [[ "$started_tunnel_mode" == "ngrok-separate" ]]; then
    log "ngrok is running in separate terminal pane/tab"
  elif [[ "$started_tunnel_mode" == "ngrok-reused" ]]; then
    log "reusing existing ngrok tunnels from inspector"
  elif [[ "$started_tunnel_mode" == "cloudflare-quick" ]]; then
    log "cloudflared quick tunnels are running with this process group (Ctrl+C to stop all)"
    log "cloudflared logs: web=$cloudflared_web_log stt=$cloudflared_stt_log"
  elif [[ "$started_tunnel_mode" == "cloudflare-named" ]]; then
    log "cloudflared named tunnel connector is running with this process group (Ctrl+C to stop all)"
    log "cloudflared named tunnel log: $cloudflared_named_log"
  fi

  trap 'cleanup_processes "${pids[@]:-}"' INT TERM EXIT

  if ! wait_for_any_child_exit "${pids[@]}"; then
    exit_code=$?
  fi

  cleanup_processes "${pids[@]}"
  trap - INT TERM EXIT
  DEVBOX_ACTIVE_DEVICE_APP_ENV="$previous_active_device_app_env"
  return "$exit_code"
}

cmd_down() {
  if [[ $# -gt 0 ]]; then
    die "unknown option for down: $1"
  fi

  require_devbox_env
  log "stopping devbox runtime processes for repo: $ROOT_DIR"

  stop_processes_by_pattern "mingle-app next dev" "$ROOT_DIR/mingle-app.*next dev --port"
  stop_processes_by_pattern "mingle-stt dev server" "$ROOT_DIR/mingle-stt.*stt-server.ts"
  stop_processes_by_pattern "mingle-messaging dev server" "$ROOT_DIR/mingle-messaging.*messaging-server.ts"
  stop_processes_by_pattern "metro" "$ROOT_DIR/mingle-app.*pnpm --dir rn start --port"

  stop_listeners_by_port "mingle-app next dev" "$DEVBOX_WEB_PORT"
  stop_listeners_by_port "mingle-stt dev server" "$DEVBOX_STT_PORT"
  stop_listeners_by_port "mingle-messaging dev server" "$DEVBOX_MESSAGING_PORT"
  stop_listeners_by_port "metro" "$DEVBOX_METRO_PORT"
  stop_existing_ngrok_by_inspector_port "$DEVBOX_NGROK_API_PORT"
  stop_existing_cloudflared_by_local_port "$DEVBOX_WEB_PORT"
  stop_existing_cloudflared_by_local_port "$DEVBOX_STT_PORT"
  stop_existing_cloudflared_by_local_port "$DEVBOX_MESSAGING_PORT"
  stop_cloudflared_named_tunnel_from_pidfile
  stop_cloudflared_named_bridge "web"
  stop_cloudflared_named_bridge "stt"
  stop_cloudflared_named_bridge "messaging"
  rm -f "$(cloudflared_named_config_file_path)"

  local next_lock_file="$ROOT_DIR/mingle-app/.next/dev/lock"
  if [[ -f "$next_lock_file" ]]; then
    rm -f "$next_lock_file"
    log "removed stale lock file: $next_lock_file"
  fi

  log "devbox down complete"
}

cmd_ios_native_build() {
  die "mingle-ios has been removed. Use 'scripts/devbox up --with-ios-install' or 'scripts/devbox ios-rn-ipa'."
}

cmd_ios_native_uninstall() {
  die "mingle-ios has been removed. Uninstall the React Native app bundle instead if cleanup is needed."
}

cmd_test() {
  require_devbox_env
  local target="app"
  local with_live=0
  local -a app_test_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target) target="${2:-}"; shift 2 ;;
      --with-live) with_live=1; shift ;;
      --) shift; app_test_args+=("$@"); break ;;
      *) app_test_args+=("$1"); shift ;;
    esac
  done

  local run_app=0
  case "$target" in
    app) run_app=1 ;;
    ios-native) die "mingle-ios has been removed. Use 'scripts/devbox test --target app'." ;;
    all)
      warn "--target all now runs app tests only because mingle-ios has been removed."
      run_app=1
      ;;
    *) die "invalid --target: $target (expected app)" ;;
  esac

  if [[ "$run_app" -eq 1 ]]; then
    require_cmd pnpm
    local app_test_script="test"
    if [[ "$with_live" -eq 1 ]]; then
      app_test_script="test:live"
      log "running mingle-app live integration tests (--with-live)"
    elif ((${#app_test_args[@]} > 0)); then
      app_test_script="test:unit"
      log "running mingle-app vitest with passthrough args (test:scripts skipped)"
    else
      log "running mingle-app unit + scripts tests (live tests are disabled by default; add --with-live to enable)"
    fi
    (
      cd "$ROOT_DIR/mingle-app"
      if ((${#app_test_args[@]} > 0)); then
        MINGLE_TEST_API_BASE_URL="$DEVBOX_TEST_API_BASE_URL" \
        MINGLE_TEST_WS_URL="$DEVBOX_TEST_WS_URL" \
          pnpm "$app_test_script" "${app_test_args[@]}"
      else
        MINGLE_TEST_API_BASE_URL="$DEVBOX_TEST_API_BASE_URL" \
        MINGLE_TEST_WS_URL="$DEVBOX_TEST_WS_URL" \
          pnpm "$app_test_script"
      fi
    )
  fi
}

cmd_qa() {
  require_devbox_env
  require_cmd pnpm

  local platform="all"
  local mode="platform"
  local ios_udid="${MINGLE_UI_QA_IOS_UDID:-}"
  local ios_real_udid="${MINGLE_UI_QA_IOS_REAL_UDID:-${MINGLE_UI_QA_IOS_UDID:-}}"
  local ios_sim_udid="${MINGLE_UI_QA_IOS_SIM_UDID:-}"
  local android_serial="${MINGLE_UI_QA_ANDROID_SERIAL:-}"
  local ios_xcode_org_id="${MINGLE_UI_QA_IOS_XCODE_ORG_ID:-}"
  local ios_xcode_signing_id="${MINGLE_UI_QA_IOS_XCODE_SIGNING_ID:-}"
  local ios_updated_wda_bundle_id="${MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID:-}"
  local -a qa_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --platform) platform="${2:-}"; shift 2 ;;
      --contracts)
        [[ "$mode" == "platform" ]] || die "choose only one QA mode: --contracts, --ios-regressions, --android-regressions, or --ios-scroll-fps"
        mode="contracts"
        shift
        ;;
      --ios-regressions)
        [[ "$mode" == "platform" ]] || die "choose only one QA mode: --contracts, --ios-regressions, --android-regressions, or --ios-scroll-fps"
        mode="ios-regressions"
        shift
        ;;
      --android-regressions)
        [[ "$mode" == "platform" ]] || die "choose only one QA mode: --contracts, --ios-regressions, --android-regressions, or --ios-scroll-fps"
        mode="android-regressions"
        shift
        ;;
      --ios-scroll-fps)
        [[ "$mode" == "platform" ]] || die "choose only one QA mode: --contracts, --ios-regressions, --android-regressions, or --ios-scroll-fps"
        mode="ios-scroll-fps"
        shift
        ;;
      --ios-udid) ios_udid="${2:-}"; shift 2 ;;
      --ios-real-udid) ios_real_udid="${2:-}"; shift 2 ;;
      --ios-sim-udid) ios_sim_udid="${2:-}"; shift 2 ;;
      --android-serial) android_serial="${2:-}"; shift 2 ;;
      --)
        shift
        qa_args+=("$@")
        break
        ;;
      -h|--help)
        cat <<'EOF'
Usage: scripts/devbox qa [options] [-- extra-runner-args...]

Options:
  --platform ios|android|all   Run the standard mobile UI QA runner for one platform or both.
                               Default: all
  --contracts                  Run the fast contract gate only.
  --ios-regressions            Run the expanded iOS regression inventory.
  --android-regressions        Run the expanded Android regression inventory.
  --ios-scroll-fps             Capture physical iPhone WebView touch-scroll FPS for the 500-utterance live demo.
  --ios-udid UDID              Physical iPhone or simulator UDID for the standard iOS QA runner.
  --ios-real-udid UDID         Physical iPhone UDID for the expanded iOS regression inventory.
  --ios-sim-udid UDID          Simulator UDID for the expanded iOS regression inventory.
  --android-serial SERIAL      Android device serial for the standard Android QA runner.
  --                          Pass remaining arguments directly to the underlying QA script.

Examples:
  scripts/devbox qa --contracts
  scripts/devbox qa --platform ios --ios-udid <UDID>
  scripts/devbox qa --ios-regressions --ios-real-udid <REAL_UDID> --ios-sim-udid <SIM_UDID>
  scripts/devbox qa --android-regressions --android-serial <SERIAL>
  scripts/devbox qa --ios-scroll-fps --ios-real-udid <REAL_UDID>
EOF
        return 0
        ;;
      *)
        qa_args+=("$1")
        shift
        ;;
    esac
  done

  case "$platform" in
    ios|android|all) ;;
    *) die "invalid --platform for qa: $platform (expected ios|android|all)" ;;
  esac

  if [[ "$platform" == "ios" || "$platform" == "all" || "$mode" == "ios-regressions" || "$mode" == "ios-scroll-fps" ]]; then
    if [[ -z "$ios_xcode_org_id" ]]; then
      ios_xcode_org_id="$(trim_whitespace "${DEVBOX_IOS_TEAM_ID:-}")"
    fi
    if [[ -z "$ios_xcode_org_id" ]]; then
      ios_xcode_org_id="$(trim_whitespace "$(resolve_rn_ios_development_team)")"
    fi
    if [[ -z "$ios_xcode_signing_id" ]]; then
      ios_xcode_signing_id="Apple Development"
    fi
    if [[ -z "$ios_updated_wda_bundle_id" ]]; then
      ios_updated_wda_bundle_id="$(resolve_ios_wda_bundle_id)"
    fi
  fi

  local script_name=""
  local -a runner_args=()
  local -a command_args=()

  case "$mode" in
    contracts)
      script_name="test:qa:ui:contracts"
      ;;
    ios-regressions)
      script_name="test:qa:ui:ios:regressions"
      [[ -n "$ios_real_udid" ]] && runner_args+=(--ios-real-udid "$ios_real_udid")
      [[ -n "$ios_sim_udid" ]] && runner_args+=(--ios-sim-udid "$ios_sim_udid")
      ;;
    android-regressions)
      script_name="test:qa:ui:android:regressions"
      [[ -n "$android_serial" ]] && runner_args+=(--android-serial "$android_serial")
      ;;
    ios-scroll-fps)
      script_name="test:qa:ui:ios:scroll-fps"
      if [[ -n "$ios_real_udid" ]]; then
        runner_args+=(--ios-udid "$ios_real_udid")
      elif [[ -n "$ios_udid" ]]; then
        runner_args+=(--ios-udid "$ios_udid")
      fi
      ;;
    platform)
      case "$platform" in
        ios)
          script_name="test:qa:ui:ios"
          [[ -n "$ios_udid" ]] && runner_args+=(--ios-udid "$ios_udid")
          ;;
        android)
          script_name="test:qa:ui:android"
          [[ -n "$android_serial" ]] && runner_args+=(--android-serial "$android_serial")
          ;;
        all)
          script_name="test:qa:ui"
          [[ -n "$ios_udid" ]] && runner_args+=(--ios-udid "$ios_udid")
          [[ -n "$android_serial" ]] && runner_args+=(--android-serial "$android_serial")
          ;;
      esac
      ;;
    *)
      die "unsupported QA mode: $mode"
      ;;
  esac

  log "running mingle-app QA via devbox (script=$script_name)"
  command_args=("$script_name")
  if ((${#runner_args[@]} > 0)); then
    command_args+=("${runner_args[@]}")
  fi
  if ((${#qa_args[@]} > 0)); then
    command_args+=("${qa_args[@]}")
  fi
  (
    cd "$ROOT_DIR/mingle-app"
    DEVBOX_WORKTREE_NAME="$DEVBOX_WORKTREE_NAME" \
    DEVBOX_PROFILE="$DEVBOX_PROFILE" \
    DEVBOX_WEB_PORT="$DEVBOX_WEB_PORT" \
    DEVBOX_STT_PORT="$DEVBOX_STT_PORT" \
    DEVBOX_METRO_PORT="$DEVBOX_METRO_PORT" \
    NEXT_PUBLIC_SITE_URL="$DEVBOX_SITE_URL" \
    NEXT_PUBLIC_WS_URL="$DEVBOX_PUBLIC_WS_URL" \
    MINGLE_TEST_API_BASE_URL="$DEVBOX_TEST_API_BASE_URL" \
    MINGLE_TEST_WS_URL="$DEVBOX_TEST_WS_URL" \
    MINGLE_UI_QA_IOS_UDID="$ios_udid" \
    MINGLE_UI_QA_IOS_REAL_UDID="$ios_real_udid" \
    MINGLE_UI_QA_IOS_SIM_UDID="$ios_sim_udid" \
    MINGLE_UI_QA_IOS_XCODE_ORG_ID="$ios_xcode_org_id" \
    MINGLE_UI_QA_IOS_XCODE_SIGNING_ID="$ios_xcode_signing_id" \
    MINGLE_UI_QA_IOS_UPDATED_WDA_BUNDLE_ID="$ios_updated_wda_bundle_id" \
    MINGLE_UI_QA_ANDROID_SERIAL="$android_serial" \
    MINGLE_UI_QA_ANDROID_METRO_HOST_PORT="$DEVBOX_METRO_PORT" \
    MINGLE_UI_QA_ANDROID_WEB_HOST_PORT="$DEVBOX_WEB_PORT" \
    MINGLE_UI_QA_IOS_METRO_HOST_PORT="$DEVBOX_METRO_PORT" \
      pnpm "${command_args[@]}"
  )
}

cmd_status() {
  require_devbox_env
  local ngrok_web_domain="(auto)"
  local detected_ngrok_web_domain=""
  local tunnel_provider=""
  local cloudflare_mode="quick"
  local ngrok_line=""
  local ngrok_domain_line=""
  detected_ngrok_web_domain="$(resolve_ngrok_web_domain || true)"
  tunnel_provider="$(resolve_tunnel_provider "")"
  if [[ "$tunnel_provider" == "cloudflare" ]]; then
    if resolve_cloudflare_named_tunnel_settings >/dev/null 2>&1; then
      cloudflare_mode="named"
    fi
  fi
  if [[ -n "$detected_ngrok_web_domain" ]]; then
    ngrok_web_domain="$detected_ngrok_web_domain"
  fi
  ngrok_line="[devbox] ngrok:    inspector=http://127.0.0.1:$DEVBOX_NGROK_API_PORT"
  ngrok_domain_line="[devbox] ngrok-web-domain: $ngrok_web_domain"
  if [[ "$tunnel_provider" != "ngrok" ]]; then
    ngrok_line="[devbox] ngrok:    disabled for provider=$tunnel_provider"
    ngrok_domain_line="[devbox] ngrok-web-domain: (n/a)"
  fi

  cat <<EOF
[devbox] worktree: $DEVBOX_WORKTREE_NAME
[devbox] profile:  $DEVBOX_PROFILE
[devbox] ports:    web=$DEVBOX_WEB_PORT stt=$DEVBOX_STT_PORT messaging=$DEVBOX_MESSAGING_PORT metro=$DEVBOX_METRO_PORT
[devbox] tunnel:   provider=$tunnel_provider$( [[ "$tunnel_provider" == "cloudflare" ]] && printf ' mode=%s' "$cloudflare_mode" )
$ngrok_line
$ngrok_domain_line

PC Web      : $DEVBOX_SITE_URL
iOS Web     : $DEVBOX_SITE_URL
Android Web : $DEVBOX_SITE_URL
iOS App     : NEXT_PUBLIC_SITE_URL=$DEVBOX_SITE_URL | NEXT_PUBLIC_WS_URL=$DEVBOX_RN_WS_URL | NEXT_PUBLIC_MESSAGING_WS_URL=$DEVBOX_RN_MESSAGING_WS_URL | NEXT_PUBLIC_API_NAMESPACE=$IOS_RN_REQUIRED_API_NAMESPACE
Android App : NEXT_PUBLIC_SITE_URL=$DEVBOX_SITE_URL | NEXT_PUBLIC_WS_URL=$DEVBOX_RN_WS_URL | NEXT_PUBLIC_MESSAGING_WS_URL=$DEVBOX_RN_MESSAGING_WS_URL | NEXT_PUBLIC_API_NAMESPACE=$ANDROID_RN_REQUIRED_API_NAMESPACE
Live Test   : MINGLE_TEST_API_BASE_URL=$DEVBOX_TEST_API_BASE_URL | MINGLE_TEST_WS_URL=$DEVBOX_TEST_WS_URL
Vault       : ${DEVBOX_VAULT_PATH:-"(unset)"}
Vault Prod  : ${DEVBOX_VAULT_PROD_PATH:-"secret/mingle/prod (default)"}
OpenClaw    : root=${DEVBOX_OPENCLAW_ROOT:-$(resolve_openclaw_root)}
iOS Team ID : ${DEVBOX_IOS_TEAM_ID:-"(auto: mingle.xcodeproj DEVELOPMENT_TEAM)"}

Files:
- $DEVBOX_ENV_FILE
- $APP_ENV_FILE
- $STT_ENV_FILE
- $ROOT_DIR/mingle-messaging/
- $NGROK_LOCAL_CONFIG
- $RN_IOS_RUNTIME_XCCONFIG

Run:
- scripts/devbox vault-up --seed
- scripts/devbox up --profile local
- scripts/devbox up --profile device
- scripts/devbox up --profile device --tunnel-provider cloudflare
- scripts/devbox bootstrap
- scripts/devbox gateway --mode dev
- scripts/devbox gateway --mode run -- --bind loopback --port 18789
- scripts/devbox up --profile device --device-app-env dev --with-ios-install
- scripts/devbox up --profile device --device-app-env prod --with-ios-install
- scripts/devbox up --profile device --with-mobile-install
- scripts/devbox up --profile local --with-metro
- scripts/devbox ios-rn-ipa --device-app-env prod
- scripts/devbox ios-rn-ipa-prod
- scripts/devbox mobile --platform ios
- scripts/devbox mobile --platform android
- scripts/devbox test --with-live
- scripts/devbox qa --contracts
- scripts/devbox qa --platform ios --ios-udid <IOS_UDID>
- scripts/devbox qa --ios-regressions --ios-real-udid <IOS_REAL_UDID> --ios-sim-udid <IOS_SIM_UDID>
- scripts/devbox qa --android-regressions --android-serial <ANDROID_SERIAL>
- scripts/devbox qa --ios-scroll-fps --ios-real-udid <IOS_REAL_UDID>
- scripts/devbox profile --profile local --host <LAN_IP>
- scripts/devbox test
EOF
}

default_log_file_path() {
  local timestamp worktree
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  worktree="${DEVBOX_WORKTREE_NAME:-$(derive_worktree_name)}"
  worktree="${worktree//[^A-Za-z0-9._-]/-}"
  printf '%s/devbox-%s-%s.log' "$DEVBOX_LOG_DIR" "$worktree" "$timestamp"
}

resolve_log_file_path() {
  local raw_value="$1"
  local value="$raw_value"

  [[ -n "$value" ]] || die "missing value for --log-file (expected PATH or auto)"
  if [[ "$value" == "auto" ]]; then
    value="$(default_log_file_path)"
  elif [[ "$value" != /* ]]; then
    value="$ROOT_DIR/$value"
  fi

  ensure_single_line_value "log file path" "$value"
  printf '%s' "$value"
}

enable_log_capture() {
  local file="$1"
  local fifo_path

  command -v tee >/dev/null 2>&1 || die "required command not found: tee"
  mkdir -p "$(dirname "$file")"
  printf '===== devbox log started %s =====\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" >> "$file"
  fifo_path="$(mktemp -u "${TMPDIR:-/tmp}/devbox-log.XXXXXX")"
  mkfifo "$fifo_path"
  tee -a "$file" < "$fifo_path" &
  exec > "$fifo_path" 2>&1
  rm -f "$fifo_path"
  log "log capture enabled: $file"
}

main() {
  local log_file_option=""
  local -a filtered_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --log-file)
        [[ $# -ge 2 ]] || die "missing value for --log-file"
        log_file_option="$2"
        shift 2
        ;;
      --log-file=*)
        log_file_option="${1#--log-file=}"
        shift
        ;;
      *)
        filtered_args+=("$1")
        shift
        ;;
    esac
  done

  if [[ -n "$log_file_option" ]]; then
    DEVBOX_LOG_FILE="$(resolve_log_file_path "$log_file_option")"
    enable_log_capture "$DEVBOX_LOG_FILE"
  fi

  local cmd="help"
  if [[ "${#filtered_args[@]}" -gt 0 ]]; then
    cmd="${filtered_args[0]}"
    if [[ "${#filtered_args[@]}" -gt 1 ]]; then
      set -- "${filtered_args[@]:1}"
    else
      set --
    fi
  else
    set --
  fi

  local auto_up_defaults=0
  local -a auto_up_default_args=(
    --profile device
    --tunnel-provider cloudflare
    --with-ios-install
  )
  if [[ "$cmd" == "up" && "$#" -eq 0 ]]; then
    auto_up_defaults=1
    if [[ -z "$log_file_option" ]]; then
      DEVBOX_LOG_FILE="$(default_log_file_path)"
      enable_log_capture "$DEVBOX_LOG_FILE"
    fi
    log "no options for 'up'; applying defaults: --profile device --tunnel-provider cloudflare --with-ios-install"
  fi

  case "$cmd" in
    init) cmd_init "$@" ;;
    bootstrap) cmd_bootstrap "$@" ;;
    vault-up) cmd_vault_up "$@" ;;
    profile) cmd_profile "$@" ;;
    profile-local) cmd_profile --profile local "$@" ;;
    profile-device|profile-ngrok) cmd_profile --profile device "$@" ;;
    ngrok-config) cmd_ngrok_config "$@" ;;
    gateway|openclaw-gateway) cmd_gateway "$@" ;;
    ios-native-build|ios-build-native) cmd_ios_native_build "$@" ;;
    ios-native-uninstall|ios-uninstall-native|ios-native-remove) cmd_ios_native_uninstall "$@" ;;
    ios-appstore-sync-metadata|ios-sync-appstore-metadata) cmd_ios_appstore_sync_metadata "$@" ;;
    ios-rn-ipa|ios-build-rn-ipa) cmd_ios_rn_ipa "$@" ;;
    ios-rn-ipa-prod|ios-build-rn-ipa-prod) cmd_ios_rn_ipa --device-app-env prod "$@" ;;
    mobile) cmd_mobile "$@" ;;
    up)
      if [[ "$auto_up_defaults" -eq 1 ]]; then
        cmd_up "${auto_up_default_args[@]}"
      else
        cmd_up "$@"
      fi
      ;;
    down) cmd_down "$@" ;;
    test|test-live) cmd_test "$@" ;;
    qa|qa-ui) cmd_qa "$@" ;;
    status) cmd_status "$@" ;;
    help|-h|--help) usage ;;
    *) die "unknown command: $cmd (run: scripts/devbox help)" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
