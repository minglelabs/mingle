import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addNativeSttListener,
  getNativeSttMicrophonePermissionStatus,
  getNativeSttStatus,
  isNativeSttAvailable,
  setNativeSttAec,
  startNativeStt,
  stopNativeStt,
} from './src/nativeStt';
import {
  isNativeSttServerReadyMessage,
  resolveNativeSttStatusAfterStart,
} from './src/nativeSttStatus';

import {
  addNativeTtsListener,
  playNativeTts,
  stopNativeTts,
} from './src/nativeTts';
import {
  startNativeBrowserAuthSession,
  type NativeAuthProvider,
} from './src/nativeAuth';
import { validateRnApiNamespace } from './src/apiNamespace';
import {
  buildNativeQaBridgeBootstrapScript,
  WEBVIEW_NAVIGATION_BRIDGE_SCRIPT,
} from './src/nativeNavigationBridge';
import {
  appendNativeRuntimeWebViewParams,
  normalizeNativeBottomBarClearancePx,
  parseWebPathname,
  resolveNativeBannerContentHeightPx,
  resolveNativeBottomBannerContentInsetPx,
  resolveNativeBottomBannerWebInsetPx,
  shouldEnableIosWebViewBackForwardNavigation,
  shouldEnableNativeWebViewDebugging,
  shouldDisableIosWebViewScrolling,
  shouldHideIosKeyboardAccessoryView,
} from './src/webViewLayout';
import {
  WEB_SUPPORTED_LOCALE_SEGMENTS,
  getVersionPolicyFallbackCopy,
  resolveVersionPolicyLocale,
  resolveWebLocaleSegment,
} from './src/i18n';
import {
  createCheckingNativeAppUpdateSnapshot,
  createUnknownNativeAppUpdateSnapshot,
  normalizeClientVersion,
  resolveNativeAppUpdateSnapshot,
  type NativeAppUpdateSnapshot,
} from './src/appUpdateStatus';
import {
  readPreferredRuntimeBoolean,
  readPreferredRuntimeValue,
} from './src/runtimeConfig';
import {
  normalizeHttpBaseUrl,
  normalizeWsUrl,
  resolveDistinctFallbackTarget,
  shouldFallbackHttpStatus,
} from './src/fallbackTargets';
import {
  extractAndroidIntentBrowserFallbackUrl,
  shouldOpenNativeExternalUrl,
} from './src/externalNavigation';
import {
  buildConversationRestoreWebUrl,
  classifyConversationWebUrl,
  readNativeConversationRestorePayload,
  resolveConversationRestorePayloadFromUrl,
  type NativeConversationRestorePayload,
} from './src/webViewRestore';
import {
  resolveNativeBannerNavigationState,
  type NativeBannerZone as BannerZone,
  type StableNativeBannerZone,
} from './src/nativeBannerZone';
import NativeQrScanner, {
  type NativeQrScannerRequest,
} from './src/nativeQrScanner';
import {
  buildNativeProfileLinkEventScript,
  parseNativeProfileLink,
} from './src/profileLink';

type RuntimeEnvMap = Record<string, string | undefined>;
type WebViewLoadErrorEvent = { nativeEvent: { description?: string } };
type WebViewHttpStatusEvent = { nativeEvent: { statusCode: number } };
type NativeRuntimeConfig = {
  webAppBaseUrl?: string;
  defaultWsUrl?: string;
  legacyWebAppBaseUrl?: string;
  legacyDefaultWsUrl?: string;
  apiNamespace?: string;
  clientVersion?: string;
  clientBuild?: string;
  qaBridgeEnabled?: string | boolean;
  deviceLocaleTag?: string;
  devicePreferredLanguages?: string[];
  adBannerPosition?: string;
  adBannerUnitIdIos?: string;
  adBannerUnitIdAndroid?: string;
  adBannerHeightPx?: string | number;
  conversationRestoreUrl?: string;
  conversationRestoreConversationId?: string;
  conversationRestoreCreatedAtMs?: string | number;
};
type NativeConversationRestoreStorageModule = {
  rememberConversationRestoreUrl?: (
    url: string,
    conversationId: string,
    createdAtMs: number,
  ) => Promise<unknown> | void;
  clearConversationRestoreUrl?: () => Promise<unknown> | void;
  getPendingProfileLink?: () => Promise<NativePendingProfileLink | null>;
  clearPendingProfileLink?: (sequence: number) => Promise<unknown> | void;
  recordHistoryDebug?: (payload: string) => Promise<unknown> | void;
};
type NativePendingProfileLink = {
  url?: unknown;
  sequence?: unknown;
};
type NativeQrImageModule = {
  savePng?: (dataUrl: string, fileName: string) => Promise<unknown>;
};
type NativePushRegistrationInfo = {
  token?: unknown;
  installationId?: unknown;
  platform?: unknown;
  environment?: unknown;
  permission?: unknown;
  appVersion?: unknown;
  apiNamespace?: unknown;
};
type NativePushNotificationModule = {
  registerForPushNotifications?: () => Promise<NativePushRegistrationInfo>;
  getRegistrationInfo?: () => Promise<NativePushRegistrationInfo>;
};
type NativeLocationModule = {
  checkLocationPermission?: () => Promise<{ permission?: unknown; platform?: unknown }>;
  requestLocationPermission?: () => Promise<{ permission?: unknown; platform?: unknown }>;
  getCurrentLocation?: () => Promise<{
    latitude?: unknown;
    longitude?: unknown;
    accuracy?: unknown;
    provider?: unknown;
    receivedAtMs?: unknown;
  }>;
};
type NativePictureInPictureModule = {
  start?: (options: Record<string, unknown>) => Promise<unknown>;
  update?: (options: Record<string, unknown>) => void;
  stop?: (options: Record<string, unknown>) => Promise<unknown>;
};
type NativeAdModule = {
  default?: (() => {
    initialize?: () => Promise<unknown>;
  }) | {
    initialize?: () => Promise<unknown>;
  };
  BannerAd?: React.ComponentType<{
    unitId: string;
    size: string;
    width?: number;
    requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
    onAdLoaded?: (dimensions: { width: number; height: number }) => void;
    onAdFailedToLoad?: (error: Error) => void;
    onSizeChange?: (dimensions: { width: number; height: number }) => void;
  }>;
  BannerAdSize?: {
    BANNER?: string;
    ADAPTIVE_BANNER?: string;
    LARGE_ANCHORED_ADAPTIVE_BANNER?: string;
  };
};
type NativeBannerPosition = 'top' | 'bottom';
type VersionPolicyAction = 'force_update' | 'recommend_update' | 'none';
type VersionPolicyAdMobConfig = {
  bannerUnitId?: string;
};
type VersionGateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | {
      status: 'force_update';
      updateUrl: string;
      title: string;
      message: string;
      updateButtonLabel: string;
      clientVersion: string;
      latestVersion: string;
    };
type VersionPolicyResponse = {
  action: VersionPolicyAction;
  platform?: string;
  policyPlatform?: string;
  locale?: string;
  updateUrl?: string;
  title?: string;
  message?: string;
  latestVersion?: string;
  clientVersion?: string;
  updateButtonLabel?: string;
  laterButtonLabel?: string;
  adMob?: VersionPolicyAdMobConfig;
};
type IOSSettingsManager = {
  settings?: {
    AppleLocale?: string;
    AppleLanguages?: string[];
  };
};
type AndroidI18nManager = {
  localeIdentifier?: string;
};

function readRuntimeEnvValue(keys: string[]): string {
  const env = (globalThis as { process?: { env?: RuntimeEnvMap } }).process?.env;
  if (!env) return '';

  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return '';
}

function readNativeRuntimeConfig(): NativeRuntimeConfig {
  const runtimeConfigModule = (NativeModules as {
    NativeRuntimeConfigModule?: {
      runtimeConfig?: NativeRuntimeConfig;
      getConstants?: () => { runtimeConfig?: NativeRuntimeConfig };
    };
    NativeSTTModule?: {
      runtimeConfig?: NativeRuntimeConfig;
      getConstants?: () => { runtimeConfig?: NativeRuntimeConfig };
    };
  }).NativeRuntimeConfigModule;
  const sttModule = NativeModules.NativeSTTModule as
    | {
        runtimeConfig?: NativeRuntimeConfig;
        getConstants?: () => { runtimeConfig?: NativeRuntimeConfig };
      }
    | undefined;
  const runtimeConfig = runtimeConfigModule?.runtimeConfig
    ?? runtimeConfigModule?.getConstants?.().runtimeConfig
    ?? sttModule?.runtimeConfig
    ?? sttModule?.getConstants?.().runtimeConfig;
  if (!runtimeConfig || typeof runtimeConfig !== 'object') {
    return {};
  }
  return runtimeConfig;
}

function normalizeConfiguredUrl(
  raw: string,
  allowedProtocols: string[],
  options?: { trimTrailingSlash?: boolean },
): string {
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (!allowedProtocols.includes(parsed.protocol)) return '';
    if (options?.trimTrailingSlash) {
      return raw.replace(/\/+$/, '');
    }
    return raw;
  } catch {
    return '';
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function isLoopbackUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    return isLoopbackHost(new URL(raw).hostname);
  } catch {
    return /(127\.0\.0\.1|localhost|::1)/i.test(raw);
  }
}

function isDebugWebViewRemountAllowedUrl(raw: string): boolean {
  if (!raw) return false;

  try {
    const { hostname } = new URL(raw);
    return hostname.toLowerCase() === 'mingle-app-devbox.photo-for-passport.com';
  } catch {
    return /mingle-app-devbox\.photo-for-passport\.com/i.test(raw);
  }
}

function isDevelopmentTunnelUrl(raw: string): boolean {
  if (!raw) return false;

  try {
    const { hostname } = new URL(raw);
    const normalized = hostname.toLowerCase();
    return normalized.endsWith('.ngrok-free.dev')
      || normalized.endsWith('.ngrok-free.app')
      || normalized.endsWith('.trycloudflare.com')
      || normalized === 'mingle-app-devbox.photo-for-passport.com';
  } catch {
    return /(\.ngrok-free\.(dev|app)|\.trycloudflare\.com|mingle-app-devbox\.photo-for-passport\.com)/i.test(raw);
  }
}

function shouldApplyNgrokBrowserWarningBypass(raw: string): boolean {
  if (!raw) return false;

  try {
    const { hostname } = new URL(raw);
    const normalized = hostname.toLowerCase();
    return normalized.endsWith('.ngrok-free.dev')
      || normalized.endsWith('.ngrok-free.app');
  } catch {
    return /\.ngrok-free\.(dev|app)/i.test(raw);
  }
}

function appendNgrokBrowserWarningBypass(raw: string): string {
  if (!shouldApplyNgrokBrowserWarningBypass(raw)) return raw;

  try {
    const url = new URL(raw);
    if (!url.searchParams.has('ngrok-skip-browser-warning')) {
      url.searchParams.set('ngrok-skip-browser-warning', '1');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function appendNativeWebViewSession(raw: string, sessionId: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.set('__nativeWebViewSession', sessionId);
    return appendNgrokBrowserWarningBypass(url.toString());
  } catch {
    const separator = raw.includes('?') ? '&' : '?';
    return appendNgrokBrowserWarningBypass(
      `${raw}${separator}__nativeWebViewSession=${encodeURIComponent(sessionId)}`,
    );
  }
}

function shouldPreserveDebugRemountUrl(raw: string): boolean {
  if (!raw) return false;

  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function shouldEnableDebugWebViewRemount(rawUrl: string): boolean {
  return __DEV__ || isLoopbackUrl(rawUrl) || isDebugWebViewRemountAllowedUrl(rawUrl);
}

function shouldBypassWebViewCache(rawUrl: string): boolean {
  return __DEV__ || isLoopbackUrl(rawUrl) || isDevelopmentTunnelUrl(rawUrl);
}

function formatWebViewLoadError(description: string, currentWebUrl: string): string {
  const normalizedDescription = description.trim() || 'webview_load_failed';
  if (!currentWebUrl || !isLoopbackUrl(currentWebUrl)) {
    return normalizedDescription;
  }
  return `${normalizedDescription} (현재 앱 URL이 ${currentWebUrl} 입니다. 실기기에서는 127.0.0.1/localhost에 접속할 수 없습니다. scripts/devbox profile --profile device 후 --device-app-env prod 또는 dev로 설치해 주세요.)`;
}

function openNativeExternalUrl(rawUrl: string): void {
  void Linking.openURL(rawUrl).catch(() => {
    const fallbackUrl = extractAndroidIntentBrowserFallbackUrl(rawUrl);
    if (!fallbackUrl || fallbackUrl === rawUrl) return;

    void Linking.openURL(fallbackUrl).catch(() => {
      // Ignore external app/browser failures so the Mingle WebView remains intact.
    });
  });
}

const RN_RUNTIME_OS = Platform.OS;
const NATIVE_RUNTIME_CONFIG = readNativeRuntimeConfig();
const NATIVE_CONVERSATION_RESTORE_STORAGE = (NativeModules.NativeRuntimeConfigModule || {}) as NativeConversationRestoreStorageModule;
const RUNTIME_WEB_APP_BASE_URL = readPreferredRuntimeValue(
  NATIVE_RUNTIME_CONFIG.webAppBaseUrl,
  readRuntimeEnvValue(['NEXT_PUBLIC_SITE_URL', 'RN_WEB_APP_BASE_URL']),
);
const RUNTIME_DEFAULT_WS_URL = readPreferredRuntimeValue(
  NATIVE_RUNTIME_CONFIG.defaultWsUrl,
  readRuntimeEnvValue(['NEXT_PUBLIC_WS_URL', 'RN_DEFAULT_WS_URL']),
);
const RUNTIME_FALLBACK_WEB_APP_BASE_URL = readPreferredRuntimeValue(
  NATIVE_RUNTIME_CONFIG.legacyWebAppBaseUrl,
  readRuntimeEnvValue(['MINGLE_API_FALLBACK_SITE_URL', 'RN_WEB_APP_FALLBACK_BASE_URL', 'MINGLE_LEGACY_SITE_URL']),
);
const RUNTIME_FALLBACK_WS_URL = readPreferredRuntimeValue(
  NATIVE_RUNTIME_CONFIG.legacyDefaultWsUrl,
  readRuntimeEnvValue(['MINGLE_STT_FALLBACK_WS_URL', 'RN_DEFAULT_WS_FALLBACK_URL', 'MINGLE_LEGACY_WS_URL']),
);
const RUNTIME_API_NAMESPACE = readPreferredRuntimeValue(
  NATIVE_RUNTIME_CONFIG.apiNamespace,
  readRuntimeEnvValue(['NEXT_PUBLIC_API_NAMESPACE', 'RN_API_NAMESPACE']),
);
const RUNTIME_QA_BRIDGE_ENABLED = readPreferredRuntimeBoolean(
  NATIVE_RUNTIME_CONFIG.qaBridgeEnabled,
  readRuntimeEnvValue(['NEXT_PUBLIC_RN_QA_BRIDGE_ENABLED', 'RN_QA_BRIDGE_ENABLED']),
);
const WEB_APP_BASE_URL = normalizeConfiguredUrl(
  RUNTIME_WEB_APP_BASE_URL,
  ['http:', 'https:'],
  { trimTrailingSlash: true },
) || 'https://mingle-1-1-4-production.up.railway.app';
const DEFAULT_WS_URL = normalizeConfiguredUrl(
  RUNTIME_DEFAULT_WS_URL,
  ['ws:', 'wss:'],
) || 'wss://mingle-2-0-0-production.up.railway.app/stt';
const FALLBACK_WEB_APP_BASE_URL = resolveDistinctFallbackTarget(
  WEB_APP_BASE_URL,
  normalizeHttpBaseUrl(RUNTIME_FALLBACK_WEB_APP_BASE_URL),
);
const DEFAULT_WS_FALLBACK_URL = resolveDistinctFallbackTarget(
  DEFAULT_WS_URL,
  normalizeWsUrl(RUNTIME_FALLBACK_WS_URL),
);
const PROFILE_LINK_DUPLICATE_WINDOW_MS = 1_500;

function getProfileLinkUserIdHint(userId: string): string {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return '';
  return normalizedUserId.length <= 6 ? normalizedUserId : `…${normalizedUserId.slice(-6)}`;
}

function recordProfileLinkTrace(event: string, details: Record<string, unknown> = {}): void {
  try {
    console.info('[MingleProfileLink]', JSON.stringify({
      event,
      at: Date.now(),
      ...details,
    }));
  } catch {
    // Diagnostic logging must never affect navigation.
  }
}

function parseOptionalSonioxManualFinalizeSilenceMs(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor(parsed);
}

const STARTUP_SPLASH_BACKGROUND = '#F3C35A';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STARTUP_SPLASH_LOGO = require('./ios/mingle/Images.xcassets/LaunchLogo.imageset/launch-logo.png');
const {
  expectedApiNamespace: EXPECTED_API_NAMESPACE,
  configuredApiNamespace: CONFIGURED_API_NAMESPACE,
  validatedApiNamespace: VALIDATED_API_NAMESPACE,
} = validateRnApiNamespace({
  runtimeOs: RN_RUNTIME_OS,
  configuredApiNamespace: RUNTIME_API_NAMESPACE,
});

const missingRuntimeConfig: string[] = [];
if (!WEB_APP_BASE_URL) {
  missingRuntimeConfig.push('NEXT_PUBLIC_SITE_URL');
}
if (!DEFAULT_WS_URL) {
  missingRuntimeConfig.push('NEXT_PUBLIC_WS_URL');
}
if (EXPECTED_API_NAMESPACE && !CONFIGURED_API_NAMESPACE) {
  missingRuntimeConfig.push(`NEXT_PUBLIC_API_NAMESPACE (expected: ${EXPECTED_API_NAMESPACE})`);
} else if (EXPECTED_API_NAMESPACE && !VALIDATED_API_NAMESPACE) {
  missingRuntimeConfig.push(`NEXT_PUBLIC_API_NAMESPACE must match current platform namespace: ${EXPECTED_API_NAMESPACE}`);
}
const REQUIRED_CONFIG_ERROR = missingRuntimeConfig.length > 0
  ? `Missing or invalid runtime config: ${missingRuntimeConfig.join(', ')}`
  : null;

const NATIVE_STT_EVENT = 'mingle:native-stt';
const NATIVE_STT_MESSAGE_QUEUE_KEY = '__MINGLE_NATIVE_STT_MESSAGE_QUEUE';
const NATIVE_STT_MESSAGE_QUEUE_LIMIT = 200;
const NATIVE_TTS_EVENT = 'mingle:native-tts';
const NATIVE_UI_EVENT = 'mingle:native-ui';
const NATIVE_AUTH_EVENT = 'mingle:native-auth';
const NATIVE_QR_SCANNER_EVENT = 'mingle:native-qr-scanner';
const NATIVE_QR_SAVE_EVENT = 'mingle:native-qr-save';
const NATIVE_LOCATION_EVENT = 'mingle:native-location';
const NATIVE_LOCATION_QUEUE_LIMIT = 8;
const NATIVE_QR_SCANNER_QUEUE_LIMIT = 8;
const NATIVE_PUSH_TOKEN_EVENT = 'mingle:native-push-token';
const NATIVE_PUSH_REGISTRATION_QUEUE_LIMIT = 4;
const WEB_CANVAS_BASE_WIDTH_PX = 400;
const NATIVE_AD_BANNER_MIN_HEIGHT_PX = 48;
const NATIVE_AD_BANNER_MAX_HEIGHT_PX = 120;
const NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX = 50;
const NATIVE_CONVERSATION_LIST_HEADER_HEIGHT_PX = 56;
const NATIVE_CONVERSATION_HEADER_HEIGHT_PX = 56;
const NATIVE_CONVERSATION_BOTTOM_BAR_VISUAL_TOP_OFFSET_PX = 64;
const IOS_NATIVE_CONVERSATION_BOTTOM_BANNER_NUDGE_PX = 4;
const NATIVE_APP_UPDATE_EVENT = 'mingle:native-app-update';
const NATIVE_HISTORY_BACK_ANIMATE_FLAG = '__MINGLE_NATIVE_HISTORY_CLOSE_ANIMATE__';
const CONVERSATION_HISTORY_ROUTE_STATE_KEY = '__MINGLE_CONVERSATION_HISTORY_ROUTE__';
// Marks that a restored iOS room has received a synthetic list history entry.
const IOS_CONVERSATION_ROOM_HISTORY_SEEDED_FLAG = '__MINGLE_IOS_ROOM_HISTORY_SEEDED__';
const IOS_SAFE_BROWSER_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

type SafeAreaPalette = {
  topColor: string;
  topOverlayColor: string;
  bottomColor: string;
  webViewColor: string;
  statusBarStyle: 'dark-content' | 'light-content';
  topEdgeMode: 'fill' | 'overlay' | 'transparent';
  bottomEdgeMode: 'fill' | 'transparent';
};

const DEFAULT_SAFE_AREA_PALETTE: SafeAreaPalette = {
  topColor: '#ffffff',
  topOverlayColor: 'transparent',
  bottomColor: '#ffffff',
  webViewColor: '#ffffff',
  statusBarStyle: 'dark-content',
  topEdgeMode: 'overlay',
  bottomEdgeMode: 'fill',
};

const AUTH_LOGIN_SAFE_AREA_PALETTE: SafeAreaPalette = {
  topColor: '#fbbc32',
  topOverlayColor: 'transparent',
  bottomColor: '#1c1c1e',
  webViewColor: '#1c1c1e',
  statusBarStyle: 'light-content',
  topEdgeMode: 'transparent',
  bottomEdgeMode: 'transparent',
};

const CONVERSATIONS_SAFE_AREA_PALETTE: SafeAreaPalette = {
  ...DEFAULT_SAFE_AREA_PALETTE,
  bottomEdgeMode: 'transparent',
};

const PROFILE_SHARE_SAFE_AREA_PALETTE: SafeAreaPalette = {
  topColor: '#1295e8',
  topOverlayColor: 'transparent',
  bottomColor: '#7338f2',
  webViewColor: '#3569ed',
  statusBarStyle: 'light-content',
  topEdgeMode: 'transparent',
  bottomEdgeMode: 'transparent',
};

type VersionPolicyLocale =
  | 'ko'
  | 'en'
  | 'ja'
  | 'zh-CN'
  | 'zh-TW'
  | 'fr'
  | 'de'
  | 'es'
  | 'pt'
  | 'it'
  | 'ru'
  | 'ar'
  | 'hi'
  | 'th'
  | 'vi';

const VERSION_POLICY_SUPPORTED_LOCALES = new Set<VersionPolicyLocale>([
  'ko',
  'en',
  'ja',
  'zh-CN',
  'zh-TW',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'ar',
  'hi',
  'th',
  'vi',
]);

const IOS_VERSION_POLICY_TIMEOUT_MS = 8000;

type NativeSttStartPayload = {
  conversationId?: string;
  sessionId?: string;
  wsUrl?: string;
  sttModel?: string;
  aecEnabled?: boolean;
  apiNamespace?: string;
  behaviorProfile?: string;
  sonioxManualFinalizeSilenceMs?: number;
  sttSegmentationMode?: string;
  sonioxEndpointMaxDelayMs?: number;
  sonioxEndpointTuningStep?: number;
};

type NativeSttStopPayload = {
  conversationId?: string;
  sessionId?: string;
  pendingText?: string;
  pendingLanguage?: string;
  force?: boolean;
};

type NativeSttStatusRequestPayload = {
  conversationId?: string;
};

type NativeSttCommand =
  | {
      type: 'native_stt_start';
      payload?: NativeSttStartPayload;
    }
  | {
      type: 'native_stt_stop';
      payload?: NativeSttStopPayload;
    }
  | {
      type: 'native_stt_status_request';
      payload?: NativeSttStatusRequestPayload;
    };

type NativeTtsCommand =
  | {
      type: 'native_tts_play';
      payload: {
        utteranceId: string;
        playbackId?: string;
        audioBase64: string;
        contentType?: string;
      };
    }
  | {
      type: 'native_tts_stop';
      payload?: {
        reason?: string;
      };
    };

type NativeSttAecCommand = {
  type: 'native_stt_set_aec';
  payload: { enabled: boolean };
};

type NativeOpenAppSettingsCommand = {
  type: 'native_open_app_settings';
  payload?: {
    reason?: string;
  };
};

type NativeLocationCommand = {
  type: 'native_location_check' | 'native_location_request';
  payload?: {
    requestId?: string;
  };
};

type NativeAuthStartCommand = {
  type: 'native_auth_start';
  payload: {
    provider: NativeAuthProvider;
    callbackUrl?: string;
    startUrl: string;
  };
};

type NativeAuthAckCommand = {
  type: 'native_auth_ack';
  payload?: {
    provider?: NativeAuthProvider;
    outcome?: 'success' | 'error';
    bridgeToken?: string;
  };
};

type NativeAuthResetCommand = {
  type: 'native_auth_reset';
};

type NativeNavigationStateCommand = {
  type: 'native_navigation_state';
  payload?: {
    canGoBack?: boolean;
    canGoForward?: boolean;
    canHandleNativeBack?: boolean;
    canHandleAndroidBack?: boolean;
    url?: string;
    // Full-screen overlays (e.g. the profile screen) that render on top of a
    // conversation room without changing the URL need to temporarily disable
    // iOS's screen-edge swipe-back gesture themselves — otherwise a tap near
    // the left edge (where another member's chat-bubble avatar sits) can be
    // captured by WKWebView's own edge-pan recognizer instead, popping the
    // room's back-forward list and silently dismissing the overlay.
    suppressEdgeSwipe?: boolean;
  };
};

type NativeQrScannerOpenCommand = {
  type: 'native_qr_scanner_open';
  payload?: NativeQrScannerRequest;
};

type NativeQrSaveCommand = {
  type: 'native_qr_save';
  payload?: {
    dataUrl?: string;
    fileName?: string;
  };
};

type NativePushRegisterCommand = {
  type: 'native_push_register';
};

type NativeHistoryDebugCommand = {
  type: 'native_history_debug';
  payload?: Record<string, unknown>;
};

type NativeOpenUpdateStoreCommand = {
  type: 'native_open_update_store';
  payload?: {
    updateUrl?: string;
  };
};

type NativeUiOverlayStateCommand = {
  type: 'native_ui_overlay_state';
  payload?: {
    menuOpen?: boolean;
  };
};

type NativeSetAdBannerPositionCommand = {
  type: 'native_set_ad_banner_position';
  payload?: {
    position?: string;
  };
};

type NativeSetBannerZoneCommand = {
  type: 'native_set_banner_zone';
  payload?: {
    zone?: BannerZone;
  };
};

type NativeSetBottomBarClearanceCommand = {
  type: 'native_set_bottom_bar_clearance';
  payload?: {
    clearancePx?: number;
  };
};

type NativeRemountWebViewCommand = {
  type: 'native_remount_webview';
  payload?: {
    url?: string;
  };
};

type NativeQaSetSttStatusCommand = {
  type: 'native_qa_set_stt_status';
  payload?: {
    status?: string;
  };
};

type NativePictureInPictureCommand = {
  type: 'native_pip_start' | 'native_pip_update' | 'native_pip_stop';
  payload?: Record<string, unknown>;
};

type WebViewCommand =
  | NativeSttCommand
  | NativeTtsCommand
  | NativeSttAecCommand
  | NativeOpenAppSettingsCommand
  | NativeLocationCommand
  | NativeAuthStartCommand
  | NativeAuthAckCommand
  | NativeAuthResetCommand
  | NativeQrScannerOpenCommand
  | NativeQrSaveCommand
  | NativePushRegisterCommand
  | NativeNavigationStateCommand
  | NativeHistoryDebugCommand
  | NativeOpenUpdateStoreCommand
  | NativeUiOverlayStateCommand
  | NativeSetAdBannerPositionCommand
  | NativeSetBannerZoneCommand
  | NativeSetBottomBarClearanceCommand
  | NativeRemountWebViewCommand
  | NativeQaSetSttStatusCommand
  | NativePictureInPictureCommand;

type NativeSttEvent =
  | {
      type: 'status';
      status: string;
      conversationId?: string;
      sessionId?: string;
      replay?: boolean;
      running?: boolean;
      serverReady?: boolean;
      stopping?: boolean;
      eventSequence?: number;
    }
  | { type: 'message'; raw: string; conversationId?: string; sessionId?: string; queueId?: string }
  | { type: 'error'; message: string; code?: string; platform?: string; conversationId?: string; sessionId?: string }
  | { type: 'permission'; permission: string; platform?: string }
  | { type: 'capabilities'; openAppSettings: boolean }
  | { type: 'close'; reason: string; conversationId?: string; sessionId?: string };

type NativeSttSnapshot = {
  status: string;
  conversationId?: string;
  sessionId?: string;
  running?: boolean;
  serverReady?: boolean;
  stopping?: boolean;
  eventSequence?: number;
};

function isTerminalNativeSttStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'idle' || normalized === 'stopped' || normalized === 'closed';
}

function isLiveNativeSttStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'starting'
    || normalized === 'connecting'
    || normalized === 'running'
    || normalized === 'ready'
    || normalized === 'silenced'
    || normalized === 'recovering';
}

function resolveNativeSttStatusFromSnapshot(snapshot: NativeSttSnapshot): string {
  const rawStatus = typeof snapshot.status === 'string'
    ? snapshot.status.trim().toLowerCase()
    : '';
  if (snapshot.stopping === true || rawStatus === 'stopping') {
    return 'stopping';
  }
  if (isTerminalNativeSttStatus(rawStatus)) {
    return rawStatus;
  }
  if (rawStatus === 'error' || rawStatus === 'failed') {
    return rawStatus;
  }
  if (snapshot.running === false) {
    return 'idle';
  }
  if (snapshot.serverReady === true || rawStatus === 'ready') {
    return 'ready';
  }
  return 'connecting';
}

function hasOlderNativeSttStatusSequence(
  nextSequence?: number,
  currentSequence?: number,
): boolean {
  if (typeof nextSequence !== 'number' || !Number.isFinite(nextSequence)) return false;
  if (typeof currentSequence !== 'number' || !Number.isFinite(currentSequence)) return false;
  return nextSequence < currentSequence;
}

function rememberRetiredNativeSttSession(sessionIds: Set<string>, sessionId?: string): void {
  const normalized = sessionId?.trim() || '';
  if (!normalized) return;
  if (sessionIds.size >= 32 && !sessionIds.has(normalized)) {
    const oldest = sessionIds.values().next().value;
    if (typeof oldest === 'string') sessionIds.delete(oldest);
  }
  sessionIds.add(normalized);
}

function isStaleNativeSttSessionEvent(input: {
  eventConversationId?: string;
  eventSessionId?: string;
  activeConversationId?: string | null;
  activeSessionId?: string | null;
  requestedConversationId?: string | null;
  requestedSessionId?: string | null;
  retiredSessionIds: ReadonlySet<string>;
}): boolean {
  const eventConversationId = input.eventConversationId?.trim() || '';
  const eventSessionId = input.eventSessionId?.trim() || '';
  const activeConversationId = input.activeConversationId?.trim() || '';
  const activeSessionId = input.activeSessionId?.trim() || '';
  const requestedConversationId = input.requestedConversationId?.trim() || '';
  const requestedSessionId = input.requestedSessionId?.trim() || '';

  if (eventSessionId) {
    if (input.retiredSessionIds.has(eventSessionId)) return true;
    if (requestedSessionId && eventSessionId !== requestedSessionId) return true;
    if (activeSessionId && eventSessionId !== activeSessionId && eventSessionId !== requestedSessionId) {
      return true;
    }
    return false;
  }

  // Older native shells do not attach a generation ID. Conversation scoping
  // still prevents a delayed event from the previous room from taking over a
  // newly requested room where both identities are known.
  if (!eventConversationId) return false;
  if (requestedConversationId) return eventConversationId !== requestedConversationId;
  return Boolean(activeConversationId && eventConversationId !== activeConversationId);
}

type NativeLocationPermission = 'granted' | 'denied' | 'blocked' | 'not_determined' | 'unavailable' | 'unknown';
type NativeLocationEvent =
  | { type: 'permission'; permission: NativeLocationPermission; requestId?: string; platform?: string }
  | {
      type: 'location';
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      provider?: string;
      receivedAtMs?: number;
      requestId?: string;
    }
  | { type: 'error'; code: string; requestId?: string };

function normalizeNativeLocationPermission(value: unknown): NativeLocationPermission {
  return value === 'granted'
    || value === 'denied'
    || value === 'blocked'
    || value === 'not_determined'
    || value === 'unavailable'
    || value === 'unknown'
    ? value
    : 'unknown';
}

type NativeUiEvent = {
  type: 'scroll_to_top';
  source: string;
} | {
  type: 'banner_layout';
  position: NativeBannerPosition;
  topInsetPx: number;
  bottomInsetPx: number;
};

type NativeAuthEvent =
  | {
      type: 'status';
      provider: NativeAuthProvider;
      status: 'opening';
    }
  | {
      type: 'success';
      provider: NativeAuthProvider;
      callbackUrl: string;
      bridgeToken: string;
    }
  | {
      type: 'error';
      provider: NativeAuthProvider;
      message: string;
    };

type NativeQrScannerEvent =
  | { type: 'result'; value: string }
  | { type: 'cancel' }
  | { type: 'error'; message: string };
type NativeQrSaveEvent =
  | { type: 'success' }
  | { type: 'error'; message: string };
type RecommendUpdatePrompt = {
  title: string;
  message: string;
  updateUrl: string;
  updateLabel: string;
  laterLabel: string;
};

function buildVersionPolicyUrl(baseUrl: string, apiNamespace: string): string {
  const normalizedNamespace = apiNamespace.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedNamespace) {
    return `${baseUrl}/api/client/version-policy`;
  }
  return `${baseUrl}/api/${normalizedNamespace}/client/version-policy`;
}

function resolveVersionPolicyClientPlatform(runtimeOs: string): 'ios' | 'android' {
  if (runtimeOs === 'android') return 'android';
  return 'ios';
}

function resolveNativeSttErrorCode(message: string): string | undefined {
  const normalized = message.trim().toLowerCase();
  if (normalized === 'mic_permission_denied' || normalized === 'mic_permission_denied_after_prompt') {
    return 'mic_permission';
  }
  return undefined;
}

type RuntimeClientInfo = {
  clientVersion: string;
  clientBuild: string;
};

function resolveRuntimeClientInfo(): RuntimeClientInfo {
  const envClientVersion = readRuntimeEnvValue(['RN_CLIENT_VERSION']);
  const envClientBuild = readRuntimeEnvValue(['RN_CLIENT_BUILD']);

  return {
    clientVersion: normalizeClientVersion(
      readPreferredRuntimeValue(NATIVE_RUNTIME_CONFIG.clientVersion, envClientVersion),
    ),
    clientBuild: readPreferredRuntimeValue(
      NATIVE_RUNTIME_CONFIG.clientBuild,
      envClientBuild,
    ),
  };
}

const RUNTIME_CLIENT_INFO = resolveRuntimeClientInfo();

function resolveIosTopTapOverlayHeight(rawStatusBarHeight: unknown): number {
  const numeric = typeof rawStatusBarHeight === 'number'
    ? rawStatusBarHeight
    : Number(rawStatusBarHeight);
  if (!Number.isFinite(numeric) || numeric <= 0) return 24;
  // iOS 상단 탭은 상태바/노치 영역 기준으로만 처리합니다.
  return Math.max(20, Math.min(64, Math.ceil(numeric)));
}

function resolveDeviceLocaleTag(): string {
  if (Platform.OS === 'ios') {
    const runtimeLocaleTag = NATIVE_RUNTIME_CONFIG.deviceLocaleTag;
    if (typeof runtimeLocaleTag === 'string' && runtimeLocaleTag.trim()) {
      return runtimeLocaleTag.trim();
    }

    const runtimePreferredLanguages = NATIVE_RUNTIME_CONFIG.devicePreferredLanguages;
    if (Array.isArray(runtimePreferredLanguages)) {
      for (const language of runtimePreferredLanguages) {
        if (typeof language === 'string' && language.trim()) {
          return language.trim();
        }
      }
    }

    const settingsManager = (NativeModules as {
      SettingsManager?: IOSSettingsManager;
    }).SettingsManager;
    const appleLanguages = settingsManager?.settings?.AppleLanguages;
    if (Array.isArray(appleLanguages)) {
      for (const language of appleLanguages) {
        if (typeof language === 'string' && language.trim()) {
          return language.trim();
        }
      }
    }

    // AppleLocale can reflect regional format settings rather than UI language.
    // Prefer AppleLanguages first so locale follows the device language priority.
    const appleLocale = settingsManager?.settings?.AppleLocale;
    if (typeof appleLocale === 'string' && appleLocale.trim()) {
      return appleLocale.trim();
    }
  }

  if (Platform.OS === 'android') {
    const localeIdentifier = (NativeModules.I18nManager as AndroidI18nManager | undefined)?.localeIdentifier;
    if (typeof localeIdentifier === 'string' && localeIdentifier.trim()) {
      return localeIdentifier.trim();
    }
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'ko';
  } catch {
    return 'ko';
  }
}

function isAuthLikePathname(pathname: string): boolean {
  const segments = pathname
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;

  const first = segments[0].toLowerCase();
  if (segments[0] === 'auth') {
    return true;
  }
  if (segments.length >= 2 && WEB_SUPPORTED_LOCALE_SEGMENTS.has(first) && segments[1] === 'auth') {
    return true;
  }
  return false;
}

export function shouldHideNativeBannersForPathname(pathname: string): boolean {
  return isAuthLikePathname(pathname);
}

function isAllowedNativeAuthStartPath(pathname: string): boolean {
  const normalized = pathname.trim();
  if (!normalized.startsWith('/')) return false;
  if (normalized.startsWith('/api/native-auth/start')) return true;

  const segments = normalized
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (segments.length !== 3) return false;

  const locale = segments[0]?.toLowerCase() || '';
  if (!WEB_SUPPORTED_LOCALE_SEGMENTS.has(locale)) return false;
  return segments[1] === 'auth' && segments[2] === 'native';
}

function isConversationsLikePathname(pathname: string): boolean {
  const normalized = pathname.trim();
  if (!normalized.startsWith('/')) return false;

  const segments = normalized
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) return false;

  const locale = segments[0]?.toLowerCase() || '';
  if (!WEB_SUPPORTED_LOCALE_SEGMENTS.has(locale)) return false;

  return segments[1] === 'conversations' || segments[1] === 'mypage';
}

function isProfileSharePathname(pathname: string): boolean {
  const normalized = pathname.trim();
  if (!normalized.startsWith('/')) return false;

  const segments = normalized
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length !== 3) return false;

  const locale = segments[0]?.toLowerCase() || '';
  if (!WEB_SUPPORTED_LOCALE_SEGMENTS.has(locale)) return false;

  return segments[1] === 'mypage' && segments[2] === 'share';
}

function resolveSafeAreaPaletteForUrl(rawUrl: string): SafeAreaPalette {
  const candidate = rawUrl.trim();
  if (!candidate) return DEFAULT_SAFE_AREA_PALETTE;

  try {
    const parsed = new URL(candidate);
    if (isAuthLikePathname(parsed.pathname)) {
      return AUTH_LOGIN_SAFE_AREA_PALETTE;
    }
    if (isProfileSharePathname(parsed.pathname)) {
      return PROFILE_SHARE_SAFE_AREA_PALETTE;
    }
    if (isConversationsLikePathname(parsed.pathname)) {
      return CONVERSATIONS_SAFE_AREA_PALETTE;
    }
  } catch {
    return DEFAULT_SAFE_AREA_PALETTE;
  }

  return DEFAULT_SAFE_AREA_PALETTE;
}

function resolveTrustedOrigin(rawUrl: string): string {
  const candidate = rawUrl.trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!parsed.host) return '';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function resolveNativeBannerPosition(rawValue: string): NativeBannerPosition {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'top') return 'top';
  if (normalized === 'bottom') return 'bottom';
  return 'bottom';
}

function normalizeNativeBannerPosition(rawValue: string): NativeBannerPosition | null {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'top') return 'top';
  if (normalized === 'bottom') return 'bottom';
  return null;
}

function normalizeServerBannerUnitId(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null;
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveNativeBannerHeightPx(rawValue: string | number | undefined): number {
  const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? '');
  if (!Number.isFinite(numeric)) return NATIVE_AD_BANNER_DEFAULT_HEIGHT_PX;
  return Math.max(
    NATIVE_AD_BANNER_MIN_HEIGHT_PX,
    Math.min(NATIVE_AD_BANNER_MAX_HEIGHT_PX, Math.round(numeric)),
  );
}

function resolveNativeCanvasScale(windowWidthPx: number): number {
  if (!Number.isFinite(windowWidthPx) || windowWidthPx <= 0) return 1;
  return Math.min(1, windowWidthPx / WEB_CANVAS_BASE_WIDTH_PX);
}

export function NativeAdBanner(props: {
  position: NativeBannerPosition;
  unitId: string;
  heightPx: number;
  frameWidthPx: number;
  topOffsetPx: number;
  bottomOffsetPx: number;
  adModule: NativeAdModule | null;
  ready: boolean;
  reloadToken: number;
  hidden?: boolean;
}): React.JSX.Element | null {
  const {
    position,
    unitId,
    heightPx,
    frameWidthPx,
    topOffsetPx,
    bottomOffsetPx,
    adModule,
    ready,
    reloadToken,
    hidden = false,
  } = props;
  const prefersFixedHeightBanner = true;
  const [renderHeightPx, setRenderHeightPx] = useState(heightPx);
  const [adLoadState, setAdLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [lastErrorMessage, setLastErrorMessage] = useState('');
  const BannerAd = adModule?.BannerAd ?? null;
  const BannerAdSize = adModule?.BannerAdSize ?? null;
  const bannerSize = prefersFixedHeightBanner
    ? (BannerAdSize?.BANNER ?? null)
    : (BannerAdSize?.LARGE_ANCHORED_ADAPTIVE_BANNER || BannerAdSize?.ADAPTIVE_BANNER || null);
  const bannerSlotWidthPx = prefersFixedHeightBanner
    ? Math.min(frameWidthPx, 320)
    : frameWidthPx;
  const isDebugBannerUnit = unitId.startsWith('ca-app-pub-3940256099942544/');
  const shouldShowFallbackPlaceholder = adLoadState !== 'loaded'
    && (adLoadState !== 'failed' || isDebugBannerUnit);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Reset banner state when a new slot/unit configuration is mounted.
  useEffect(() => {
    setRenderHeightPx(heightPx);
    setAdLoadState('loading');
    setLastErrorMessage('');
  }, [heightPx, position, reloadToken, unitId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const applyBannerDimensions = useCallback((dimensions?: { width?: number; height?: number }) => {
    if (prefersFixedHeightBanner) return;
    const nextHeight = Number(dimensions?.height ?? '');
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
    setRenderHeightPx(Math.max(heightPx, Math.round(nextHeight)));
  }, [heightPx, prefersFixedHeightBanner]);

  const handleAdLoaded = useCallback((dimensions: { width: number; height: number }) => {
    if (__DEV__) {
      console.log(`[NativeAdBanner] loaded ${dimensions.width}x${dimensions.height}`);
    }
    setAdLoadState('loaded');
    setLastErrorMessage('');
    applyBannerDimensions(dimensions);
  }, [applyBannerDimensions]);

  const handleAdFailedToLoad = useCallback((error: Error) => {
    setAdLoadState('failed');
    setLastErrorMessage(error.message);
    console.warn('[NativeAdBanner] failed_to_load', {
      unitId,
      platform: Platform.OS,
      message: error.message,
    });
  }, [unitId]);

  const containerStyle = position === 'top'
    ? [styles.nativeBannerContainer, { top: topOffsetPx, height: renderHeightPx }]
    : [styles.nativeBannerContainer, { bottom: bottomOffsetPx, height: renderHeightPx }];

  if (hidden || !unitId || !ready || !BannerAd || !bannerSize) return null;

  return (
    <View pointerEvents="box-none" style={containerStyle}>
      <View style={[styles.nativeBannerSlot, { width: bannerSlotWidthPx, height: renderHeightPx }]}>
        <BannerAd
          key={`${unitId}:${reloadToken}`}
          unitId={unitId}
          size={bannerSize}
          width={bannerSlotWidthPx}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          onAdLoaded={handleAdLoaded}
          onSizeChange={applyBannerDimensions}
          onAdFailedToLoad={handleAdFailedToLoad}
        />
        {shouldShowFallbackPlaceholder ? (
          <View
            testID="native-banner-fallback"
            style={[
              styles.nativeBannerFallbackSurface,
              isDebugBannerUnit ? styles.nativeBannerDebugPlaceholder : null,
            ]}
          >
            <View style={styles.nativeBannerFallbackBadge}>
              <Text style={styles.nativeBannerFallbackBadgeText}>AD</Text>
            </View>
            {isDebugBannerUnit ? (
              <>
                <Text style={styles.nativeBannerDebugTitle}>
                  {adLoadState === 'failed' ? 'AdMob failed' : 'AdMob loading'}
                </Text>
                <Text style={styles.nativeBannerDebugBody} numberOfLines={2}>
                  {adLoadState === 'failed'
                    ? (lastErrorMessage || 'Unknown banner load error')
                    : `slot=${position} width=${bannerSlotWidthPx} unit=test-ios-banner`}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AppInner(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const isPageReadyRef = useRef(false);
  const { width: windowWidthPx } = useWindowDimensions();
  const nativeAppUpdateRef = useRef<NativeAppUpdateSnapshot>(
    createCheckingNativeAppUpdateSnapshot(RUNTIME_CLIENT_INFO.clientVersion),
  );
  const safeAreaInsets = useSafeAreaInsets();
  const nativeAvailable = useMemo(() => isNativeSttAvailable(), []);
  const [loadError, setLoadError] = useState<string | null>(REQUIRED_CONFIG_ERROR);
  const [versionGate, setVersionGate] = useState<VersionGateState>(() => (
    (Platform.OS === 'ios' || Platform.OS === 'android') && WEB_APP_BASE_URL && !REQUIRED_CONFIG_ERROR
      ? { status: 'checking' }
      : { status: 'ready' }
  ));
  const [activeWebAppBaseUrl, setActiveWebAppBaseUrl] = useState(WEB_APP_BASE_URL);
  const recommendPromptShownRef = useRef(false);
  const pendingRecommendPromptRef = useRef<RecommendUpdatePrompt | null>(null);
  const nativeStatusRef = useRef('idle');
  const nativeSttConversationIdRef = useRef<string | null>(null);
  // The requested room is the WebView's intent; the active values are only
  // assigned from a native acknowledgement/event. Keeping them separate
  // prevents a new room from inheriting an old singleton session identity.
  const nativeSttRequestedConversationIdRef = useRef<string | null>(null);
  const nativeSttSessionIdRef = useRef<string | null>(null);
  const nativeSttRequestedSessionIdRef = useRef<string | null>(null);
  const nativeSttSnapshotRef = useRef<NativeSttSnapshot>({ status: 'idle' });
  const retiredNativeSttSessionIdsRef = useRef<Set<string>>(new Set());
  const nativeSttCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nativeSttStatusSyncSequenceRef = useRef(0);
  const nativeSttMessageSequenceRef = useRef(0);
  const pendingNativeSttMessagesRef = useRef<Extract<NativeSttEvent, { type: 'message' }>[]>([]);
  const pendingNativeQrScannerEventsRef = useRef<NativeQrScannerEvent[]>([]);
  const pendingNativeLocationEventsRef = useRef<NativeLocationEvent[]>([]);
  const pendingNativePushRegistrationsRef = useRef<NativePushRegistrationInfo[]>([]);
  const pendingProfileLinkUserIdRef = useRef<string | null>(null);
  const lastHandledProfileLinkRef = useRef('');
  const lastHandledProfileLinkAtRef = useRef(0);
  const pendingProfileLinkRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingProfileRouteRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const profileLinkNavigationSequenceRef = useRef(0);
  const currentTtsPlaybackRef = useRef<{ utteranceId: string; playbackId: string } | null>(null);
  const nativeAuthInFlightRef = useRef<NativeAuthProvider | null>(null);
  const pendingAuthEventRef = useRef<NativeAuthEvent | null>(null);
  const lastWebViewUrlRef = useRef('');
  const authDispatchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authDispatchRetryCountRef = useRef(0);
  const [iosTopTapOverlayHeight, setIosTopTapOverlayHeight] = useState(() => {
    if (Platform.OS !== 'ios') return 36;
    const manager = (NativeModules as {
      StatusBarManager?: { HEIGHT?: number };
    }).StatusBarManager;
    return resolveIosTopTapOverlayHeight(manager?.HEIGHT);
  });

  const deviceLocaleTag = useMemo(() => resolveDeviceLocaleTag(), []);
  const webLocale = useMemo(() => resolveWebLocaleSegment(deviceLocaleTag), [deviceLocaleTag]);
  const versionPolicyLocale = useMemo(() => resolveVersionPolicyLocale(deviceLocaleTag), [deviceLocaleTag]);
  const versionPolicyFallback = useMemo(
    () => getVersionPolicyFallbackCopy(versionPolicyLocale),
    [versionPolicyLocale],
  );
  const defaultNativeBannerPosition = useMemo(
    () => resolveNativeBannerPosition(
      readRuntimeEnvValue(['RN_AD_BANNER_POSITION', 'NEXT_PUBLIC_RN_AD_BANNER_POSITION'])
      || (NATIVE_RUNTIME_CONFIG.adBannerPosition || ''),
    ),
    [],
  );
  const [nativeBannerPositionOverride, setNativeBannerPositionOverride] = useState<NativeBannerPosition | null>(null);
  const nativeBannerPosition = nativeBannerPositionOverride ?? defaultNativeBannerPosition;
  const nativeBannerHeightPx = useMemo(
    () => resolveNativeBannerHeightPx(
      readRuntimeEnvValue(['RN_AD_BANNER_HEIGHT_PX', 'NEXT_PUBLIC_RN_AD_BANNER_HEIGHT_PX'])
      || NATIVE_RUNTIME_CONFIG.adBannerHeightPx,
    ),
    [],
  );
  const defaultNativeBannerUnitId = useMemo(() => {
    const platformEnvKeys = Platform.OS === 'ios'
      ? ['RN_ADMOB_BANNER_UNIT_ID_IOS', 'NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_IOS']
      : ['RN_ADMOB_BANNER_UNIT_ID_ANDROID', 'NEXT_PUBLIC_RN_ADMOB_BANNER_UNIT_ID_ANDROID'];
    const runtimeFallback = Platform.OS === 'ios'
      ? NATIVE_RUNTIME_CONFIG.adBannerUnitIdIos || ''
      : NATIVE_RUNTIME_CONFIG.adBannerUnitIdAndroid || '';
    return (readRuntimeEnvValue(platformEnvKeys) || runtimeFallback).trim();
  }, []);
  const [serverBannerUnitIdOverride, setServerBannerUnitIdOverride] = useState<string | null>(null);
  const nativeBannerUnitId = serverBannerUnitIdOverride ?? defaultNativeBannerUnitId;
  const nativeCanvasScale = useMemo(
    () => resolveNativeCanvasScale(windowWidthPx),
    [windowWidthPx],
  );
  const nativeBannerFrameWidthPx = useMemo(() => {
    if (!Number.isFinite(windowWidthPx) || windowWidthPx <= 0) {
      return WEB_CANVAS_BASE_WIDTH_PX;
    }
    return Math.max(1, Math.min(WEB_CANVAS_BASE_WIDTH_PX, Math.round(windowWidthPx)));
  }, [windowWidthPx]);
  const nativeInitialBannerInsetPx = useMemo(
    () => resolveNativeBannerContentHeightPx({
      bannerHeightPx: nativeBannerHeightPx,
      canvasScale: nativeCanvasScale,
    }),
    [nativeBannerHeightPx, nativeCanvasScale],
  );
  const [nativeBannerReloadToken, setNativeBannerReloadToken] = useState(0);
  const [webViewMountToken, setWebViewMountToken] = useState(0);
  const webFallbackActivatedRef = useRef(false);
  const activateWebFallback = useCallback((): boolean => {
    if (
      !FALLBACK_WEB_APP_BASE_URL
      || webFallbackActivatedRef.current
      || isLoopbackUrl(WEB_APP_BASE_URL)
      || isDevelopmentTunnelUrl(WEB_APP_BASE_URL)
    ) {
      return false;
    }

    webFallbackActivatedRef.current = true;
    isPageReadyRef.current = false;
    setLoadError(null);
    setActiveWebAppBaseUrl(FALLBACK_WEB_APP_BASE_URL);
    setWebViewMountToken((current) => current + 1);
    return true;
  }, []);
  const baseWebUrl = useMemo(() => {
    if (!activeWebAppBaseUrl || REQUIRED_CONFIG_ERROR) return '';
    const apiNamespaceQuery = VALIDATED_API_NAMESPACE
      ? `&apiNamespace=${encodeURIComponent(VALIDATED_API_NAMESPACE)}`
      : '';
    const debugParams = (__DEV__ || RUNTIME_QA_BRIDGE_ENABLED) ? '&sttDebug=1&ttsDebug=1' : '';
    const qaParams = RUNTIME_QA_BRIDGE_ENABLED ? '&qa=1&nativeQa=1' : '';
    const nativeSttQuery = nativeAvailable ? '1' : '0';
    // Start directly at the conversation-list route. Loading the locale root
    // first creates a redirect history entry, which would let a tab-root
    // screen swipe back into an older room after a tab switch.
    const rawWebUrl = `${activeWebAppBaseUrl}/${webLocale}/conversations?nativeStt=${nativeSttQuery}&nativeUi=1&nativeAuth=1${apiNamespaceQuery}${debugParams}${qaParams}`;
    return appendNativeRuntimeWebViewParams(rawWebUrl, {
      nativeListTopInsetPx: nativeInitialBannerInsetPx,
      nativeConversationBannerPosition: defaultNativeBannerPosition,
      nativeConversationBannerInsetPx: nativeInitialBannerInsetPx,
      clientVersion: RUNTIME_CLIENT_INFO.clientVersion,
      clientBuild: RUNTIME_CLIENT_INFO.clientBuild,
    });
  }, [activeWebAppBaseUrl, defaultNativeBannerPosition, nativeAvailable, nativeInitialBannerInsetPx, webLocale]);
  const [debugRemountWebUrl, setDebugRemountWebUrl] = useState('');
  const initialConversationRestorePayloadRef = useRef<NativeConversationRestorePayload | null>(
    readNativeConversationRestorePayload(NATIVE_RUNTIME_CONFIG),
  );
  const [conversationRestoreUrlHint, setConversationRestoreUrlHint] = useState(
    () => initialConversationRestorePayloadRef.current?.url || '',
  );
  const lastConversationRestoreUrlRef = useRef(conversationRestoreUrlHint);
  const persistConversationRestoreUrl = useCallback((payload: NativeConversationRestorePayload) => {
    lastConversationRestoreUrlRef.current = payload.url;
    setConversationRestoreUrlHint((current) => (current === payload.url ? current : payload.url));
    try {
      void NATIVE_CONVERSATION_RESTORE_STORAGE.rememberConversationRestoreUrl?.(
        payload.url,
        payload.conversationId,
        payload.createdAtMs,
      );
    } catch {
      // Ignore native persistence failures; the current RN process still keeps the restore hint.
    }
  }, []);
  const clearConversationRestoreUrl = useCallback(() => {
    if (!lastConversationRestoreUrlRef.current && !conversationRestoreUrlHint) return;
    lastConversationRestoreUrlRef.current = '';
    setConversationRestoreUrlHint('');
    // Also clear the initial-restore latch so that subsequent fallback/remount
    // does not reload the old ?conversation=... source URL.  This is a ref-only
    // write: no state change, no re-render, no WebView reload.
    initialRestoreUrlRef.current = '';
    try {
      void NATIVE_CONVERSATION_RESTORE_STORAGE.clearConversationRestoreUrl?.();
    } catch {
      // Ignore native persistence failures.
    }
  }, [conversationRestoreUrlHint]);
  const syncConversationRestoreFromUrl = useCallback((nextUrl?: string) => {
    const normalizedUrl = typeof nextUrl === 'string' ? nextUrl.trim() : '';
    if (!normalizedUrl || normalizedUrl.startsWith('about:') || normalizedUrl.startsWith('data:')) return null;
    const webUrlKind = classifyConversationWebUrl(normalizedUrl);
    if (webUrlKind === 'room') {
      const payload = resolveConversationRestorePayloadFromUrl(normalizedUrl);
      if (payload) {
        persistConversationRestoreUrl(payload);
      }
      return payload;
    }
    if (webUrlKind === 'list' || webUrlKind === null) {
      clearConversationRestoreUrl();
    }
    return null;
  }, [clearConversationRestoreUrl, persistConversationRestoreUrl]);
  const rememberCurrentWebUrl = useCallback((nextUrl?: string) => {
    const normalizedUrl = typeof nextUrl === 'string' ? nextUrl.trim() : '';
    if (!normalizedUrl || normalizedUrl.startsWith('about:') || normalizedUrl.startsWith('data:')) return;
    lastWebViewUrlRef.current = normalizedUrl;
    syncConversationRestoreFromUrl(normalizedUrl);
  }, [syncConversationRestoreFromUrl]);
  const clearPendingProfileRouteRetries = useCallback(() => {
    pendingProfileRouteRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    pendingProfileRouteRetryTimersRef.current = [];
  }, []);
  const dispatchProfileLinkToWebView = useCallback((userId: string, allowWhenPageNotReady = false) => {
    const normalizedUserId = userId.trim();
    const webView = webViewRef.current;
    if (
      !normalizedUserId
      || !webView
      || (!isPageReadyRef.current && !allowWhenPageNotReady)
    ) {
      return false;
    }

    profileLinkNavigationSequenceRef.current += 1;
    const linkNonce = String(Date.now()) + '-' + String(profileLinkNavigationSequenceRef.current);
    const eventScript = buildNativeProfileLinkEventScript({
      userId: normalizedUserId,
      linkNonce,
      navigationSequence: profileLinkNavigationSequenceRef.current,
    });

    recordProfileLinkTrace('native_profile_overlay_event_dispatched', {
      userIdHint: getProfileLinkUserIdHint(normalizedUserId),
      navigationSequence: profileLinkNavigationSequenceRef.current,
      linkNonce,
      pageReady: isPageReadyRef.current,
      forced: allowWhenPageNotReady && !isPageReadyRef.current,
    });
    webView.injectJavaScript(eventScript);
    return true;
  }, []);
  const schedulePendingProfileRouteFlush = useCallback((allowWhenPageNotReady = false) => {
    clearPendingProfileRouteRetries();
    [0, 150, 500, 1_200, 3_000].forEach((delayMs) => {
      const timer = setTimeout(() => {
        const pendingUserId = pendingProfileLinkUserIdRef.current;
        if (!pendingUserId) return;

        // A warm-started WKWebView can leave the ref false without emitting a
        // matching loadEnd event. Retry against the existing WebView as well as
        // waiting for the normal loadEnd flush path.
        if (dispatchProfileLinkToWebView(pendingUserId, allowWhenPageNotReady)) {
          pendingProfileLinkUserIdRef.current = null;
          clearPendingProfileRouteRetries();
        }
      }, delayMs);
      pendingProfileRouteRetryTimersRef.current.push(timer);
    });
  }, [clearPendingProfileRouteRetries, dispatchProfileLinkToWebView]);
  const navigateWebViewToProfile = useCallback((userId: string) => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    if (dispatchProfileLinkToWebView(normalizedUserId)) {
      pendingProfileLinkUserIdRef.current = null;
      clearPendingProfileRouteRetries();
      return;
    }

    pendingProfileLinkUserIdRef.current = normalizedUserId;
    recordProfileLinkTrace('native_profile_route_pending', {
      userIdHint: getProfileLinkUserIdHint(normalizedUserId),
      pageReady: isPageReadyRef.current,
      hasWebView: Boolean(webViewRef.current),
    });
    schedulePendingProfileRouteFlush();
  }, [clearPendingProfileRouteRetries, dispatchProfileLinkToWebView, schedulePendingProfileRouteFlush]);
  const handleIncomingProfileLink = useCallback((rawUrl: string) => {
    const candidateOrigins = [
      activeWebAppBaseUrl,
      WEB_APP_BASE_URL,
      FALLBACK_WEB_APP_BASE_URL,
    ].filter(Boolean);
    const parsed = candidateOrigins
      .map((origin) => parseNativeProfileLink(rawUrl, origin))
      .find((value) => value !== null);
    if (!parsed) {
      recordProfileLinkTrace('native_profile_link_rejected');
      return false;
    }

    recordProfileLinkTrace('native_profile_link_received', {
      source: parsed.source,
      userIdHint: getProfileLinkUserIdHint(parsed.userId),
    });
    navigateWebViewToProfile(parsed.userId);
    return true;
  }, [activeWebAppBaseUrl, navigateWebViewToProfile]);
  const handleIncomingProfileLinkOnce = useCallback((rawUrl: string) => {
    const normalizedUrl = rawUrl.trim();
    if (!normalizedUrl) return false;
    const now = Date.now();
    if (
      lastHandledProfileLinkRef.current === normalizedUrl
      && now - lastHandledProfileLinkAtRef.current < PROFILE_LINK_DUPLICATE_WINDOW_MS
      && !pendingProfileLinkUserIdRef.current
    ) {
      recordProfileLinkTrace('native_profile_link_duplicate_ignored');
      return true;
    }

    const handled = handleIncomingProfileLink(normalizedUrl);
    if (handled) {
      lastHandledProfileLinkRef.current = normalizedUrl;
      lastHandledProfileLinkAtRef.current = now;
    }
    return handled;
  }, [handleIncomingProfileLink]);
  const consumePendingProfileLink = useCallback(async () => {
    const getPendingProfileLink = NATIVE_CONVERSATION_RESTORE_STORAGE.getPendingProfileLink;
    if (!getPendingProfileLink) return;

    try {
      const pending = await getPendingProfileLink();
      if (!pending || typeof pending !== 'object' || typeof pending.url !== 'string') return;

      recordProfileLinkTrace('native_pending_profile_link_found', {
        sequence: typeof pending.sequence === 'number' ? pending.sequence : 0,
      });
      const handled = handleIncomingProfileLinkOnce(pending.url);
      if (!handled) return;

      const sequence = typeof pending.sequence === 'number' && Number.isFinite(pending.sequence)
        ? pending.sequence
        : 0;
      await NATIVE_CONVERSATION_RESTORE_STORAGE.clearPendingProfileLink?.(sequence);
      recordProfileLinkTrace('native_pending_profile_link_consumed', { sequence });
    } catch {
      // The regular React Native Linking event remains the primary path.
      recordProfileLinkTrace('native_pending_profile_link_error');
    }
  }, [handleIncomingProfileLinkOnce]);
  const schedulePendingProfileLinkConsumption = useCallback(() => {
    pendingProfileLinkRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    pendingProfileLinkRetryTimersRef.current = [];

    void consumePendingProfileLink();
    [150, 500, 1_200].forEach((delayMs) => {
      const timer = setTimeout(() => {
        void consumePendingProfileLink();
      }, delayMs);
      pendingProfileLinkRetryTimersRef.current.push(timer);
    });
  }, [consumePendingProfileLink]);
  const handleShouldStartLoadWithRequest = useCallback((request: WebViewNavigation) => {
    const rawUrl = typeof request.url === 'string' ? request.url.trim() : '';
    if (rawUrl && handleIncomingProfileLinkOnce(rawUrl)) {
      recordProfileLinkTrace('webview_profile_link_intercepted');
      return false;
    }
    if (rawUrl && shouldOpenNativeExternalUrl(rawUrl)) {
      openNativeExternalUrl(rawUrl);
      return false;
    }
    return true;
  }, [handleIncomingProfileLinkOnce]);
  const flushPendingProfileLinkToWeb = useCallback(() => {
    const pendingUserId = pendingProfileLinkUserIdRef.current;
    if (!pendingUserId || !isPageReadyRef.current) return;
    recordProfileLinkTrace('native_pending_profile_route_flushed', {
      userIdHint: getProfileLinkUserIdHint(pendingUserId),
    });
    if (dispatchProfileLinkToWebView(pendingUserId)) {
      pendingProfileLinkUserIdRef.current = null;
      clearPendingProfileRouteRetries();
    }
  }, [clearPendingProfileRouteRetries, dispatchProfileLinkToWebView]);
  useEffect(() => {
    setDebugRemountWebUrl('');
  }, [baseWebUrl]);
  useEffect(() => {
    if (
      NATIVE_RUNTIME_CONFIG.conversationRestoreUrl
      && !initialConversationRestorePayloadRef.current
    ) {
      try {
        void NATIVE_CONVERSATION_RESTORE_STORAGE.clearConversationRestoreUrl?.();
      } catch {
        // Ignore native persistence failures.
      }
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    const handleUrl = (rawUrl: string | null | undefined) => {
      if (!mounted || typeof rawUrl !== 'string') return;
      recordProfileLinkTrace('react_native_linking_event');
      handleIncomingProfileLinkOnce(rawUrl);
    };

    void Linking.getInitialURL().then(handleUrl).catch(() => {
      // Ignore malformed or unavailable initial URLs.
    });
    schedulePendingProfileLinkConsumption();
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
      schedulePendingProfileLinkConsumption();
    });

    return () => {
      mounted = false;
      subscription.remove();
      pendingProfileLinkRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingProfileLinkRetryTimersRef.current = [];
      clearPendingProfileRouteRetries();
    };
  }, [clearPendingProfileRouteRetries, handleIncomingProfileLinkOnce, schedulePendingProfileLinkConsumption]);
  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive = previousState !== 'active' && nextState === 'active';
      previousState = nextState;
      if (becameActive) {
        recordProfileLinkTrace('app_state_active_for_profile_link');
        schedulePendingProfileLinkConsumption();
        schedulePendingProfileRouteFlush(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [schedulePendingProfileLinkConsumption, schedulePendingProfileRouteFlush]);
  const trustedNativeAuthOrigin = useMemo(
    () => resolveTrustedOrigin(activeWebAppBaseUrl),
    [activeWebAppBaseUrl],
  );
  const shouldDisableWebViewCache = useMemo(() => shouldBypassWebViewCache(baseWebUrl), [baseWebUrl]);
  const devWebViewRequestScopeRef = useRef(`wv-${Date.now().toString(36)}`);
  // Latch the initial restore URL once at mount time.
  // This ref is only cleared after the WebView reaches the conversation list.
  // It is the only restore input allowed to affect
  // webViewSource.uri for restore purposes.  Post-mount room/list navigation
  // updates native storage/ref only and must NOT reach webViewSource to avoid
  // triggering full WebView reloads.
  const initialRestoreUrlRef = useRef(
    initialConversationRestorePayloadRef.current?.url || '',
  );
  const webUrl = useMemo(() => {
    // Combine the fixed restore conversationId with the current baseWebUrl so that
    // locale/host changes are still reflected while the restore target stays latched.
    const initialRestoreWebUrl = buildConversationRestoreWebUrl(
      baseWebUrl,
      initialRestoreUrlRef.current,
    );
    const requestedWebUrl = debugRemountWebUrl || initialRestoreWebUrl || baseWebUrl;
    if (!requestedWebUrl) return '';
    if (!shouldDisableWebViewCache) return requestedWebUrl;
    return appendNativeWebViewSession(
      requestedWebUrl,
      `${devWebViewRequestScopeRef.current}-${webViewMountToken}`,
    );
  }, [baseWebUrl, debugRemountWebUrl, shouldDisableWebViewCache, webViewMountToken]);

  useEffect(() => {
    if (!webUrl) return;
    lastWebViewUrlRef.current = webUrl;
  }, [webUrl]);
  const nativeQaBridgeBootstrapScript = useMemo(
    () => buildNativeQaBridgeBootstrapScript(RUNTIME_QA_BRIDGE_ENABLED),
    [],
  );
  const webViewSource = useMemo(() => {
    if (!webUrl) {
      return { html: '<html><body style="margin:0;background:#fff;"></body></html>' };
    }

    if (!shouldApplyNgrokBrowserWarningBypass(webUrl)) {
      return { uri: webUrl };
    }

    return {
      uri: webUrl,
      headers: { 'ngrok-skip-browser-warning': '1' },
    };
  }, [webUrl]);
  const shouldUseAggressiveWebViewCacheBypass = shouldDisableWebViewCache && Platform.OS === 'android';
  const [safeAreaPalette, setSafeAreaPalette] = useState<SafeAreaPalette>(() => resolveSafeAreaPaletteForUrl(webUrl));
  const initialLoadSettledRef = useRef(false);
  const [startupSplashVisible, setStartupSplashVisible] = useState(() => Boolean(webUrl));
  const startupSplashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nativeBottomBarClearancePx, setNativeBottomBarClearancePx] = useState<number | null>(null);
  const [currentWebPathname, setCurrentWebPathname] = useState(() => parseWebPathname(webUrl));
  const nativeAdModule = useMemo<NativeAdModule | null>(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-google-mobile-ads') as NativeAdModule;
    } catch {
      return null;
    }
  }, []);

  const updateSafeAreaPalette = useCallback((candidateUrl?: string) => {
    const nextPalette = resolveSafeAreaPaletteForUrl(candidateUrl || webUrl);
    setSafeAreaPalette((current) => {
      if (
        current.topColor === nextPalette.topColor
        && current.topOverlayColor === nextPalette.topOverlayColor
        && current.bottomColor === nextPalette.bottomColor
        && current.webViewColor === nextPalette.webViewColor
        && current.statusBarStyle === nextPalette.statusBarStyle
        && current.topEdgeMode === nextPalette.topEdgeMode
        && current.bottomEdgeMode === nextPalette.bottomEdgeMode
      ) {
        return current;
      }
      return nextPalette;
    });
  }, [webUrl]);

  useEffect(() => {
    if (initialLoadSettledRef.current || !startupSplashVisible) {
      if (startupSplashTimeoutRef.current) {
        clearTimeout(startupSplashTimeoutRef.current);
        startupSplashTimeoutRef.current = null;
      }
      return;
    }

    startupSplashTimeoutRef.current = setTimeout(() => {
      setStartupSplashVisible(false);
      startupSplashTimeoutRef.current = null;
    }, 4000);

    return () => {
      if (startupSplashTimeoutRef.current) {
        clearTimeout(startupSplashTimeoutRef.current);
        startupSplashTimeoutRef.current = null;
      }
    };
  }, [startupSplashVisible]);

  const iosTopSafeAreaHeight = Platform.OS === 'ios'
    ? (safeAreaInsets.top > 0 ? safeAreaInsets.top : iosTopTapOverlayHeight)
    : 0;
  const shouldRenderTopSafeAreaFill = Platform.OS === 'ios' && safeAreaPalette.topEdgeMode === 'fill';
  const shouldRenderTopSafeAreaOverlay = Platform.OS === 'ios' && safeAreaPalette.topEdgeMode === 'overlay';
  const shouldRenderBottomSafeAreaFill = Platform.OS === 'ios' && safeAreaPalette.bottomEdgeMode === 'fill';
  const nativeConversationListBannerTopOffsetPx = useMemo(
    () => safeAreaInsets.top + Math.round(NATIVE_CONVERSATION_LIST_HEADER_HEIGHT_PX * nativeCanvasScale),
    [nativeCanvasScale, safeAreaInsets.top],
  );
  const nativeConversationBannerTopOffsetPx = useMemo(
    () => safeAreaInsets.top + Math.round(NATIVE_CONVERSATION_HEADER_HEIGHT_PX * nativeCanvasScale),
    [nativeCanvasScale, safeAreaInsets.top],
  );
  const nativeBottomBannerClearancePx = useMemo(() => {
    if (nativeBottomBarClearancePx !== null) {
      return normalizeNativeBottomBarClearancePx(nativeBottomBarClearancePx);
    }
    const baseOffsetPx = Math.round(NATIVE_CONVERSATION_BOTTOM_BAR_VISUAL_TOP_OFFSET_PX * nativeCanvasScale);
    if (Platform.OS !== 'ios') {
      return baseOffsetPx;
    }
    return Math.max(0, baseOffsetPx - IOS_NATIVE_CONVERSATION_BOTTOM_BANNER_NUDGE_PX);
  }, [nativeBottomBarClearancePx, nativeCanvasScale]);
  const nativeBannerBottomOffsetPx = useMemo(
    () => safeAreaInsets.bottom + nativeBottomBannerClearancePx,
    [nativeBottomBannerClearancePx, safeAreaInsets.bottom],
  );
  const nativeTranscriptInsetPx = nativeInitialBannerInsetPx;
  const [activeBannerZone, setActiveBannerZone] = useState<BannerZone>('hidden');
  const activeBannerZoneRef = useRef<BannerZone>('hidden');
  const stableBannerZoneRef = useRef<StableNativeBannerZone>('list');
  const pendingNavigationBannerZoneRef = useRef<BannerZone | null>(null);
  const nativeConversationBannerBottomOffsetPx = nativeBannerBottomOffsetPx;
  const nativeBannerBottomInsetPx = useMemo(() => resolveNativeBottomBannerContentInsetPx({
    position: nativeBannerPosition,
    bannerHeightPx: nativeBannerHeightPx,
    canvasScale: nativeCanvasScale,
    bottomBannerClearancePx: nativeBottomBannerClearancePx,
  }), [nativeBannerHeightPx, nativeBannerPosition, nativeBottomBannerClearancePx, nativeCanvasScale]);
  const [nativeAdsReady, setNativeAdsReady] = useState(() => (
    !nativeBannerUnitId
  ));
  const [canWebViewGoBack, setCanWebViewGoBack] = useState(false);
  const [canWebViewGoForward, setCanWebViewGoForward] = useState(false);
  const [canWebViewHandleAndroidBack, setCanWebViewHandleAndroidBack] = useState(false);
  const [isEdgeSwipeSuppressedByWeb, setIsEdgeSwipeSuppressedByWeb] = useState(false);
  const [isNativeMenuOverlayOpen, setIsNativeMenuOverlayOpen] = useState(false);
  const [qrScannerRequest, setQrScannerRequest] = useState<NativeQrScannerRequest | null>(null);
  const canRenderNativeBanner = versionGate.status === 'ready';
  const shouldHideNativeBanners = useMemo(
    () => shouldHideNativeBannersForPathname(currentWebPathname),
    [currentWebPathname],
  );
  const shouldDisableIosScroll = useMemo(() => shouldDisableIosWebViewScrolling({
    isIosPlatform: Platform.OS === 'ios',
    pathname: currentWebPathname,
  }), [currentWebPathname]);
  const shouldHideIosKeyboardAccessory = useMemo(() => shouldHideIosKeyboardAccessoryView({
    isIosPlatform: Platform.OS === 'ios',
    pathname: currentWebPathname,
  }), [currentWebPathname]);

  useEffect(() => {
    setNativeBottomBarClearancePx(null);
  }, [webViewMountToken]);

  useEffect(() => {
    setCurrentWebPathname(parseWebPathname(webUrl));
  }, [webUrl]);

  useEffect(() => {
    if (shouldDisableIosScroll) return;
    setNativeBottomBarClearancePx(null);
  }, [shouldDisableIosScroll]);

  useEffect(() => {
    activeBannerZoneRef.current = activeBannerZone;
  }, [activeBannerZone]);

  useEffect(() => {
    updateSafeAreaPalette(webUrl);
  }, [updateSafeAreaPalette, webUrl]);

  useEffect(() => {
    if (!nativeBannerUnitId) {
      setNativeAdsReady(true);
      return;
    }
    const mobileAdsFactory = nativeAdModule?.default;
    const mobileAdsInstance = typeof mobileAdsFactory === 'function'
      ? mobileAdsFactory()
      : mobileAdsFactory;

    if (!mobileAdsInstance?.initialize) {
      setNativeAdsReady(false);
      return;
    }

    let cancelled = false;
    setNativeAdsReady(false);
    mobileAdsInstance.initialize()
      .then(() => {
        if (!cancelled) {
          setNativeAdsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNativeAdsReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nativeAdModule, nativeBannerUnitId]);

  useEffect(() => {
    if (!nativeBannerUnitId) return;

    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive = previousState !== 'active' && nextState === 'active';
      previousState = nextState;
      if (!becameActive) return;
      setNativeBannerReloadToken((current) => current + 1);
    });

    return () => {
      subscription.remove();
    };
  }, [nativeBannerPosition, nativeBannerUnitId]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const leavingActive = previousState === 'active' && nextState !== 'active';
      previousState = nextState;
      if (!leavingActive) return;
      syncConversationRestoreFromUrl(lastWebViewUrlRef.current);
    });

    return () => {
      subscription.remove();
    };
  }, [syncConversationRestoreFromUrl]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (qrScannerRequest) {
        setQrScannerRequest(null);
        return true;
      }
      if (versionGate.status === 'force_update') {
        return false;
      }
      if (!canWebViewGoBack && !canWebViewHandleAndroidBack && !isNativeMenuOverlayOpen) {
        return false;
      }
      webViewRef.current?.injectJavaScript(`
        (function () {
          try {
            if (typeof window.__MINGLE_HANDLE_NATIVE_BACK__ === 'function' && window.__MINGLE_HANDLE_NATIVE_BACK__()) {
              return true;
            }
          } catch (error) {
            // Fall through to the browser history path.
          }

          if (window.history.length > 1) {
            window[${JSON.stringify(NATIVE_HISTORY_BACK_ANIMATE_FLAG)}] = true;
            window.history.back();
          }
          return true;
        })();
        true;
      `);
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [canWebViewGoBack, canWebViewHandleAndroidBack, isNativeMenuOverlayOpen, qrScannerRequest, versionGate.status]);

  const presentRecommendPrompt = useCallback((prompt: RecommendUpdatePrompt) => {
    if (prompt.updateUrl) {
      Alert.alert(
        prompt.title,
        prompt.message,
        [
          { text: prompt.laterLabel, style: 'cancel' },
          {
            text: prompt.updateLabel,
            onPress: () => {
              void Linking.openURL(prompt.updateUrl);
            },
          },
        ],
      );
      return;
    }
    Alert.alert(prompt.title, prompt.message);
  }, []);

  const flushPendingRecommendPrompt = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pendingPrompt = pendingRecommendPromptRef.current;
    if (!pendingPrompt) return;
    pendingRecommendPromptRef.current = null;
    presentRecommendPrompt(pendingPrompt);
  }, [presentRecommendPrompt]);

  const emitAppUpdateToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const serialized = JSON.stringify(nativeAppUpdateRef.current);
    if (__DEV__) {
      console.log(`[NativeAppUpdate→Web] ${serialized.slice(0, 160)}`);
    }
    const script = `window.__MINGLE_NATIVE_APP_UPDATE_STATUS = ${serialized}; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_APP_UPDATE_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const setNativeAppUpdateSnapshot = useCallback((snapshot: NativeAppUpdateSnapshot) => {
    nativeAppUpdateRef.current = snapshot;
    emitAppUpdateToWeb();
  }, [emitAppUpdateToWeb]);

  useEffect(() => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !WEB_APP_BASE_URL || REQUIRED_CONFIG_ERROR) {
      return;
    }

    let active = true;
    let settled = false;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const clientVersion = RUNTIME_CLIENT_INFO.clientVersion;
    const clientBuild = RUNTIME_CLIENT_INFO.clientBuild;
    setNativeAppUpdateSnapshot(createCheckingNativeAppUpdateSnapshot(clientVersion));

    const fallbackToReady = (reason: string, details?: string) => {
      if (!active || settled) return;
      settled = true;
      if (__DEV__) {
        console.log(`[VersionPolicy] bypass (${reason})${details ? `: ${details}` : ''}`);
      }
      setNativeAppUpdateSnapshot(createUnknownNativeAppUpdateSnapshot(clientVersion));
      setVersionGate({ status: 'ready' });
    };

    const timeoutId = setTimeout(() => {
      abortController?.abort();
      fallbackToReady('timeout');
    }, IOS_VERSION_POLICY_TIMEOUT_MS);

    const fetchPolicy = async (baseUrl: string): Promise<VersionPolicyResponse> => {
      const response = await fetch(buildVersionPolicyUrl(baseUrl, VALIDATED_API_NAMESPACE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController?.signal,
        body: JSON.stringify({
          platform: resolveVersionPolicyClientPlatform(Platform.OS),
          clientVersion,
          clientBuild,
          locale: versionPolicyLocale,
        }),
      });

      if (!response.ok) {
        const error = new Error(`version_policy_status_${response.status}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return response.json() as Promise<VersionPolicyResponse>;
    };

    const shouldTryFallbackPolicy = (error: unknown): boolean => {
      if (!FALLBACK_WEB_APP_BASE_URL) return false;
      const status = (error as { status?: unknown })?.status;
      if (typeof status === 'number') {
        return shouldFallbackHttpStatus(status);
      }
      return true;
    };

    void (async () => {
      try {
        let policy: VersionPolicyResponse;
        try {
          policy = await fetchPolicy(WEB_APP_BASE_URL);
        } catch (error: unknown) {
          if (!shouldTryFallbackPolicy(error)) {
            throw error;
          }
          if (__DEV__) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`[VersionPolicy] retrying fallback host: ${message}`);
          }
          policy = await fetchPolicy(FALLBACK_WEB_APP_BASE_URL);
          if (active && !settled) {
            activateWebFallback();
          }
        }

        if (!active || settled) return;
        setServerBannerUnitIdOverride(normalizeServerBannerUnitId(policy.adMob?.bannerUnitId));
        setNativeAppUpdateSnapshot(resolveNativeAppUpdateSnapshot(policy, clientVersion));

        if (policy.action === 'force_update') {
          settled = true;
          setVersionGate({
            status: 'force_update',
            updateUrl: typeof policy.updateUrl === 'string' ? policy.updateUrl : '',
            message: typeof policy.message === 'string' && policy.message.trim()
              ? policy.message.trim()
              : versionPolicyFallback.forceMessage,
            title: typeof policy.title === 'string' && policy.title.trim()
              ? policy.title.trim()
              : versionPolicyFallback.forceTitle,
            updateButtonLabel: typeof policy.updateButtonLabel === 'string' && policy.updateButtonLabel.trim()
              ? policy.updateButtonLabel.trim()
              : versionPolicyFallback.updateButtonLabel,
            clientVersion: typeof policy.clientVersion === 'string' ? policy.clientVersion : clientVersion,
            latestVersion: typeof policy.latestVersion === 'string' ? policy.latestVersion : '',
          });
          return;
        }

        settled = true;
        setVersionGate({ status: 'ready' });
        if (policy.action === 'recommend_update' && !recommendPromptShownRef.current) {
          recommendPromptShownRef.current = true;
          const updateUrl = typeof policy.updateUrl === 'string' ? policy.updateUrl : '';
          const promptTitle = typeof policy.title === 'string' && policy.title.trim()
            ? policy.title.trim()
            : versionPolicyFallback.recommendTitle;
          const promptMessage = typeof policy.message === 'string' && policy.message.trim()
            ? policy.message.trim()
            : versionPolicyFallback.recommendMessage;
          const updateLabel = typeof policy.updateButtonLabel === 'string' && policy.updateButtonLabel.trim()
            ? policy.updateButtonLabel.trim()
            : versionPolicyFallback.updateButtonLabel;
          const laterLabel = typeof policy.laterButtonLabel === 'string' && policy.laterButtonLabel.trim()
            ? policy.laterButtonLabel.trim()
            : versionPolicyFallback.laterButtonLabel;

          const prompt = {
            title: promptTitle,
            message: promptMessage,
            updateUrl,
            updateLabel,
            laterLabel,
          };

          if (isPageReadyRef.current) {
            presentRecommendPrompt(prompt);
          } else {
            pendingRecommendPromptRef.current = prompt;
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        fallbackToReady('error', message);
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timeoutId);
      abortController?.abort();
      pendingRecommendPromptRef.current = null;
    };
  }, [activateWebFallback, presentRecommendPrompt, setNativeAppUpdateSnapshot, versionPolicyFallback, versionPolicyLocale]);

  const handleForceUpdatePress = useCallback(() => {
    if (versionGate.status !== 'force_update') return;
    const updateUrl = versionGate.updateUrl.trim();
    if (!updateUrl) return;
    void Linking.openURL(updateUrl);
  }, [versionGate]);

  const emitQrScannerToWeb = useCallback((payload: NativeQrScannerEvent) => {
    if (!isPageReadyRef.current || !webViewRef.current) {
      pendingNativeQrScannerEventsRef.current.push(payload);
      if (pendingNativeQrScannerEventsRef.current.length > NATIVE_QR_SCANNER_QUEUE_LIMIT) {
        pendingNativeQrScannerEventsRef.current.splice(
          0,
          pendingNativeQrScannerEventsRef.current.length - NATIVE_QR_SCANNER_QUEUE_LIMIT,
        );
      }
      return;
    }

    const serialized = JSON.stringify(payload);
    const script = `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_QR_SCANNER_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const flushPendingQrScannerEventsToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pendingEvents = pendingNativeQrScannerEventsRef.current.splice(0);
    pendingEvents.forEach((event) => emitQrScannerToWeb(event));
  }, [emitQrScannerToWeb]);

  const handleNativeQrRead = useCallback((value: string) => {
    setQrScannerRequest(null);
    emitQrScannerToWeb({ type: 'result', value });
  }, [emitQrScannerToWeb]);

  const handleNativeQrClose = useCallback(() => {
    setQrScannerRequest(null);
    emitQrScannerToWeb({ type: 'cancel' });
  }, [emitQrScannerToWeb]);

  const emitLocationToWeb = useCallback((payload: NativeLocationEvent) => {
    if (!isPageReadyRef.current || !webViewRef.current) {
      pendingNativeLocationEventsRef.current.push(payload);
      if (pendingNativeLocationEventsRef.current.length > NATIVE_LOCATION_QUEUE_LIMIT) {
        pendingNativeLocationEventsRef.current.splice(
          0,
          pendingNativeLocationEventsRef.current.length - NATIVE_LOCATION_QUEUE_LIMIT,
        );
      }
      return;
    }

    const serialized = JSON.stringify(payload);
    const script = `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_LOCATION_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const flushPendingNativeLocationEventsToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pendingEvents = pendingNativeLocationEventsRef.current.splice(0);
    pendingEvents.forEach((event) => emitLocationToWeb(event));
  }, [emitLocationToWeb]);

  const getNativeLocationModule = useCallback(() => (
    (NativeModules as { NativeRuntimeConfigModule?: NativeLocationModule }).NativeRuntimeConfigModule
  ), []);

  const handleNativeLocationCheck = useCallback(async (requestId?: string) => {
    const nativeLocationModule = getNativeLocationModule();
    if (!nativeLocationModule?.checkLocationPermission) {
      emitLocationToWeb({ type: 'permission', permission: 'unavailable', ...(requestId ? { requestId } : {}) });
      return;
    }

    try {
      const result = await nativeLocationModule.checkLocationPermission();
      emitLocationToWeb({
        type: 'permission',
        permission: normalizeNativeLocationPermission(result?.permission),
        platform: typeof result?.platform === 'string' ? result.platform : Platform.OS,
        ...(requestId ? { requestId } : {}),
      });
      console.info('[NativeLocation] permission', {
        requestId: requestId ?? '',
        permission: normalizeNativeLocationPermission(result?.permission),
        platform: typeof result?.platform === 'string' ? result.platform : Platform.OS,
      });
    } catch (error: unknown) {
      console.warn('[NativeLocation] permission_failed', {
        requestId: requestId ?? '',
        error: error instanceof Error ? error.message : String(error),
      });
      emitLocationToWeb({ type: 'permission', permission: 'unavailable', ...(requestId ? { requestId } : {}) });
    }
  }, [emitLocationToWeb, getNativeLocationModule]);

  const handleNativeLocationRequest = useCallback(async (requestId?: string) => {
    const nativeLocationModule = getNativeLocationModule();
    if (!nativeLocationModule?.requestLocationPermission || !nativeLocationModule.getCurrentLocation) {
      emitLocationToWeb({ type: 'error', code: 'location_unavailable', ...(requestId ? { requestId } : {}) });
      return;
    }

    try {
      const permissionResult = await nativeLocationModule.requestLocationPermission();
      const permission = normalizeNativeLocationPermission(permissionResult?.permission);
      emitLocationToWeb({
        type: 'permission',
        permission,
        platform: typeof permissionResult?.platform === 'string' ? permissionResult.platform : Platform.OS,
        ...(requestId ? { requestId } : {}),
      });
      if (permission !== 'granted') return;

      const location = await nativeLocationModule.getCurrentLocation();
      const latitude = typeof location?.latitude === 'number' ? location.latitude : NaN;
      const longitude = typeof location?.longitude === 'number' ? location.longitude : NaN;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        emitLocationToWeb({ type: 'error', code: 'location_invalid', ...(requestId ? { requestId } : {}) });
        return;
      }
      const accuracy = typeof location?.accuracy === 'number' && Number.isFinite(location.accuracy)
        ? location.accuracy
        : null;
      const provider = typeof location?.provider === 'string' && location.provider.trim().length > 0
        ? location.provider.trim()
        : 'native_unknown';
      const receivedAtMs = typeof location?.receivedAtMs === 'number' && Number.isFinite(location.receivedAtMs)
        ? location.receivedAtMs
        : Date.now();
      console.info('[NativeLocation] location_received', {
        requestId: requestId ?? '',
        provider,
        accuracy,
        receivedAtMs,
      });
      emitLocationToWeb({
        type: 'location',
        latitude,
        longitude,
        accuracy,
        provider,
        receivedAtMs,
        ...(requestId ? { requestId } : {}),
      });
    } catch (error: unknown) {
      console.warn('[NativeLocation] request_failed', {
        requestId: requestId ?? '',
        error: error instanceof Error ? error.message : String(error),
      });
      emitLocationToWeb({ type: 'error', code: 'location_failed', ...(requestId ? { requestId } : {}) });
    }
  }, [emitLocationToWeb, getNativeLocationModule]);

  const emitQrSaveToWeb = useCallback((payload: NativeQrSaveEvent) => {
    if (!isPageReadyRef.current || !webViewRef.current) return;

    const serialized = JSON.stringify(payload);
    const script = `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_QR_SAVE_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const handleNativeQrSave = useCallback(async (payload?: NativeQrSaveCommand['payload']) => {
    const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl.trim() : '';
    const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : '';
    const nativeQrImageModule = (NativeModules as {
      NativeQrImageModule?: NativeQrImageModule;
    }).NativeQrImageModule;

    if (!/^data:image\/png;base64,/i.test(dataUrl) || dataUrl.length > 5_000_000) {
      emitQrSaveToWeb({ type: 'error', message: 'native_qr_invalid_image' });
      return;
    }
    if (!nativeQrImageModule || typeof nativeQrImageModule.savePng !== 'function') {
      emitQrSaveToWeb({ type: 'error', message: 'native_qr_save_unavailable' });
      return;
    }

    try {
      if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('native_qr_photo_permission_denied');
        }
      }

      await nativeQrImageModule.savePng(dataUrl, fileName || 'mingle-profile.png');
      emitQrSaveToWeb({ type: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (__DEV__) {
        console.warn(`[NativeQrImage] save failed: ${message}`);
      }
      emitQrSaveToWeb({ type: 'error', message: message || 'native_qr_save_failed' });
    }
  }, [emitQrSaveToWeb]);

  const emitPushRegistrationToWeb = useCallback((payload: NativePushRegistrationInfo) => {
    const normalizedPayload: NativePushRegistrationInfo = {
      ...payload,
      platform: typeof payload.platform === 'string' && payload.platform.trim()
        ? payload.platform.trim()
        : Platform.OS,
      appVersion: typeof payload.appVersion === 'string' && payload.appVersion.trim()
        ? payload.appVersion.trim()
        : RUNTIME_CLIENT_INFO.clientVersion,
      apiNamespace: typeof payload.apiNamespace === 'string' && payload.apiNamespace.trim()
        ? payload.apiNamespace.trim()
        : VALIDATED_API_NAMESPACE,
    };
    if (!isPageReadyRef.current || !webViewRef.current) {
      pendingNativePushRegistrationsRef.current = [normalizedPayload].slice(
        -NATIVE_PUSH_REGISTRATION_QUEUE_LIMIT,
      );
      return;
    }

    const serialized = JSON.stringify(normalizedPayload);
    const script = `window.__MINGLE_LAST_NATIVE_PUSH_TOKEN = ${serialized}; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_PUSH_TOKEN_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const flushPendingNativePushRegistrationsToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pendingRegistrations = pendingNativePushRegistrationsRef.current.splice(0);
    pendingRegistrations.forEach((registration) => emitPushRegistrationToWeb(registration));
  }, [emitPushRegistrationToWeb]);

  const requestNativePushRegistration = useCallback(async () => {
    const nativePushModule = (NativeModules as {
      NativePushNotificationModule?: NativePushNotificationModule;
    }).NativePushNotificationModule;
    if (!nativePushModule?.registerForPushNotifications) {
      emitPushRegistrationToWeb({
        platform: Platform.OS,
        permission: 'unavailable',
      });
      return;
    }

    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permissions = PermissionsAndroid.PERMISSIONS as typeof PermissionsAndroid.PERMISSIONS & {
          POST_NOTIFICATIONS?: string;
        };
        const permissionName = permissions.POST_NOTIFICATIONS || 'android.permission.POST_NOTIFICATIONS';
        const permissionResult = await PermissionsAndroid.request(permissionName);
        if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
          emitPushRegistrationToWeb({
            platform: 'android',
            environment: 'production',
            permission: permissionResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
              ? 'never_ask_again'
              : 'denied',
          });
          return;
        }
      }

      const registration = await nativePushModule.registerForPushNotifications();
      emitPushRegistrationToWeb(registration);
    } catch (error: unknown) {
      if (__DEV__) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[NativePushNotification] registration failed: ${message}`);
      }
      emitPushRegistrationToWeb({
        platform: Platform.OS,
        permission: 'registration_failed',
      });
    }
  }, [emitPushRegistrationToWeb]);

  const emitToWeb = useCallback((payload: NativeSttEvent) => {
    const queueId = payload.type === 'message' && !payload.queueId
      ? `native-stt-${Date.now()}-${++nativeSttMessageSequenceRef.current}`
      : undefined;
    const isReplayStatus = payload.type === 'status' && payload.replay === true;
    const scopedConversationId = 'conversationId' in payload
      ? payload.conversationId || nativeSttConversationIdRef.current || undefined
      : nativeSttConversationIdRef.current || undefined;
    const scopedSessionId = 'sessionId' in payload
      ? (isReplayStatus
        ? payload.sessionId
        : payload.sessionId || nativeSttSessionIdRef.current || undefined)
      : nativeSttSessionIdRef.current || undefined;
    const nextPayload: NativeSttEvent = payload.type === 'message'
      ? {
          ...payload,
          ...(payload.queueId || queueId ? { queueId: payload.queueId || queueId } : {}),
          ...(scopedConversationId ? { conversationId: scopedConversationId } : {}),
          ...(scopedSessionId ? { sessionId: scopedSessionId } : {}),
        }
      : payload.type === 'status' || payload.type === 'error' || payload.type === 'close'
        ? {
            ...payload,
            ...(scopedConversationId ? { conversationId: scopedConversationId } : {}),
            ...(scopedSessionId ? { sessionId: scopedSessionId } : {}),
          }
        : payload;

    // Keep the native snapshot in the RN process even while the WebView is
    // loading. Status events are intentionally not put behind the message
    // queue, so the next room can receive a correctly scoped replay instead
    // of inheriting a status from the previous room.
    if (nextPayload.type === 'status' && !nextPayload.replay) {
      const currentSnapshot = nativeSttSnapshotRef.current;
      if (!hasOlderNativeSttStatusSequence(nextPayload.eventSequence, currentSnapshot.eventSequence)) {
        nativeSttSnapshotRef.current = {
          status: nextPayload.status,
          ...(nextPayload.conversationId ? { conversationId: nextPayload.conversationId } : {}),
          ...(nextPayload.sessionId ? { sessionId: nextPayload.sessionId } : {}),
          ...(typeof nextPayload.running === 'boolean' ? { running: nextPayload.running } : {}),
          ...(typeof nextPayload.serverReady === 'boolean' ? { serverReady: nextPayload.serverReady } : {}),
          ...(typeof nextPayload.stopping === 'boolean' ? { stopping: nextPayload.stopping } : {}),
          ...(typeof nextPayload.eventSequence === 'number'
            ? { eventSequence: nextPayload.eventSequence }
            : typeof currentSnapshot.eventSequence === 'number'
              ? { eventSequence: currentSnapshot.eventSequence }
              : {}),
        };
      }
    }

    if (!isPageReadyRef.current) {
      if (nextPayload.type === 'message') {
        pendingNativeSttMessagesRef.current.push(nextPayload);
        if (pendingNativeSttMessagesRef.current.length > NATIVE_STT_MESSAGE_QUEUE_LIMIT) {
          pendingNativeSttMessagesRef.current.splice(
            0,
            pendingNativeSttMessagesRef.current.length - NATIVE_STT_MESSAGE_QUEUE_LIMIT,
          );
        }
      }
      return;
    }

    const serialized = JSON.stringify(nextPayload);
    if (__DEV__) {
      const preview = nextPayload.type === 'message'
        ? `message(${nextPayload.raw.slice(0, 80)})`
        : `${nextPayload.type}(${JSON.stringify(nextPayload).slice(0, 80)})`;
      console.log(`[NativeSTT→Web] ${preview}`);
    }
    const cacheStatusScript = nextPayload.type === 'status'
      ? `window.__MINGLE_LAST_NATIVE_STT_STATUS = ${JSON.stringify(nextPayload.status)}; window.__MINGLE_LAST_NATIVE_STT_CONVERSATION_ID = ${JSON.stringify(nextPayload.conversationId || null)}; window.__MINGLE_LAST_NATIVE_STT_SESSION_ID = ${JSON.stringify(nextPayload.sessionId || null)}; window.__MINGLE_LAST_NATIVE_STT_RUNNING = ${JSON.stringify(typeof nextPayload.running === 'boolean' ? nextPayload.running : null)}; window.__MINGLE_LAST_NATIVE_STT_SERVER_READY = ${JSON.stringify(typeof nextPayload.serverReady === 'boolean' ? nextPayload.serverReady : null)}; window.__MINGLE_LAST_NATIVE_STT_STOPPING = ${JSON.stringify(typeof nextPayload.stopping === 'boolean' ? nextPayload.stopping : null)}; window.__MINGLE_LAST_NATIVE_STT_EVENT_SEQUENCE = ${JSON.stringify(typeof nextPayload.eventSequence === 'number' ? nextPayload.eventSequence : null)}; `
      : '';
    const cachePermissionScript = nextPayload.type === 'permission'
      ? `window.__MINGLE_LAST_NATIVE_MIC_PERMISSION = ${JSON.stringify(nextPayload.permission)}; `
      : '';
    const cacheMessageScript = nextPayload.type === 'message'
      ? `(function () {
          var queue = Array.isArray(window[${JSON.stringify(NATIVE_STT_MESSAGE_QUEUE_KEY)}])
            ? window[${JSON.stringify(NATIVE_STT_MESSAGE_QUEUE_KEY)}]
            : [];
          queue.push(${serialized});
          if (queue.length > ${NATIVE_STT_MESSAGE_QUEUE_LIMIT}) {
            queue.splice(0, queue.length - ${NATIVE_STT_MESSAGE_QUEUE_LIMIT});
          }
          window[${JSON.stringify(NATIVE_STT_MESSAGE_QUEUE_KEY)}] = queue;
        })(); `
      : '';
    const script = `${cacheStatusScript}${cachePermissionScript}${cacheMessageScript}window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_STT_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const flushPendingNativeSttMessagesToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pendingMessages = pendingNativeSttMessagesRef.current.splice(0);
    for (const message of pendingMessages) {
      emitToWeb(message);
    }
  }, [emitToWeb]);

  const syncNativeSttStatusAfterStart = useCallback(async (
    requestedConversationId: string,
    requestedSessionId: string,
    syncSequence: number,
  ) => {
    // Android can reach the native WebSocket `ready` state even when the
    // NativeEventEmitter event is lost during a WebView transition. Querying
    // the native singleton after start gives the WebView an authoritative
    // recovery path without putting native events behind another queue.
    if (Platform.OS !== 'android' || !nativeAvailable) return;

    const maxAttempts = 32;
    const retryDelayMs = 250;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (syncSequence !== nativeSttStatusSyncSequenceRef.current) return;

      let snapshot;
      try {
        snapshot = await getNativeSttStatus();
      } catch (error: unknown) {
        if (__DEV__) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[NativeSTT] status sync failed: ${message}`);
        }
        return;
      }

      if (syncSequence !== nativeSttStatusSyncSequenceRef.current) return;

      if (hasOlderNativeSttStatusSequence(
        snapshot.eventSequence,
        nativeSttSnapshotRef.current.eventSequence,
      )) {
        await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      const activeConversationId = typeof snapshot.conversationId === 'string'
        ? snapshot.conversationId.trim()
        : '';
      const activeSessionId = typeof snapshot.sessionId === 'string'
        ? snapshot.sessionId.trim()
        : '';

      // Never let a query for a newly opened room adopt a still-running
      // session from the previous room. Wait for the native recovery path or
      // the next poll instead.
      if (requestedConversationId
        && activeConversationId
        && requestedConversationId !== activeConversationId) {
        await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }
      if (requestedSessionId
        && activeSessionId
        && requestedSessionId !== activeSessionId) {
        await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      const status = resolveNativeSttStatusFromSnapshot(snapshot);
      const scopedConversationId = activeConversationId
        || (isLiveNativeSttStatus(status) ? requestedConversationId : '')
        || undefined;
      const scopedSessionId = activeSessionId
        || (isLiveNativeSttStatus(status) ? requestedSessionId : '')
        || undefined;

      if (scopedConversationId) {
        nativeSttConversationIdRef.current = scopedConversationId;
      }
      if (scopedSessionId) {
        nativeSttSessionIdRef.current = scopedSessionId;
      }
      const currentSnapshot = nativeSttSnapshotRef.current;
      nativeSttSnapshotRef.current = {
        status,
        ...(scopedConversationId ? { conversationId: scopedConversationId } : {}),
        ...(scopedSessionId ? { sessionId: scopedSessionId } : {}),
        ...(typeof snapshot.running === 'boolean' ? { running: snapshot.running } : {}),
        ...(typeof snapshot.serverReady === 'boolean' ? { serverReady: snapshot.serverReady } : {}),
        ...(typeof snapshot.stopping === 'boolean' ? { stopping: snapshot.stopping } : {}),
        ...(typeof snapshot.eventSequence === 'number'
          ? { eventSequence: snapshot.eventSequence }
          : typeof currentSnapshot.eventSequence === 'number'
            ? { eventSequence: currentSnapshot.eventSequence }
            : {}),
      };
      nativeStatusRef.current = status;
      emitToWeb({
        type: 'status',
        status,
        ...(scopedConversationId ? { conversationId: scopedConversationId } : {}),
        ...(scopedSessionId ? { sessionId: scopedSessionId } : {}),
        ...(typeof snapshot.running === 'boolean' ? { running: snapshot.running } : {}),
        ...(typeof snapshot.serverReady === 'boolean' ? { serverReady: snapshot.serverReady } : {}),
        ...(typeof snapshot.stopping === 'boolean' ? { stopping: snapshot.stopping } : {}),
        ...(typeof snapshot.eventSequence === 'number' ? { eventSequence: snapshot.eventSequence } : {}),
      });

      if (status === 'ready' || status === 'stopping' || isTerminalNativeSttStatus(status)) return;
      await new Promise<void>(resolve => setTimeout(resolve, retryDelayMs));
    }
  }, [emitToWeb, nativeAvailable]);

  const handleNativeStatusRequest = useCallback(async (payload?: NativeSttStatusRequestPayload) => {
    const requestedConversationId = typeof payload?.conversationId === 'string'
      ? payload.conversationId.trim()
      : '';
    if (!requestedConversationId) return;

    let snapshot: NativeSttSnapshot = nativeSttSnapshotRef.current;
    if (Platform.OS === 'android' && nativeAvailable) {
      try {
        const nativeSnapshot = await getNativeSttStatus();
        if (!hasOlderNativeSttStatusSequence(
          nativeSnapshot.eventSequence,
          nativeSttSnapshotRef.current.eventSequence,
        )) {
          snapshot = {
            status: nativeSnapshot.status,
            ...(nativeSnapshot.conversationId ? { conversationId: nativeSnapshot.conversationId } : {}),
            ...(nativeSnapshot.sessionId ? { sessionId: nativeSnapshot.sessionId } : {}),
            ...(typeof nativeSnapshot.running === 'boolean' ? { running: nativeSnapshot.running } : {}),
            ...(typeof nativeSnapshot.serverReady === 'boolean' ? { serverReady: nativeSnapshot.serverReady } : {}),
            ...(typeof nativeSnapshot.stopping === 'boolean' ? { stopping: nativeSnapshot.stopping } : {}),
            ...(typeof nativeSnapshot.eventSequence === 'number' ? { eventSequence: nativeSnapshot.eventSequence } : {}),
          };
        }
      } catch (error: unknown) {
        if (__DEV__) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[NativeSTT] status request failed: ${message}`);
        }
      }
    }

    const activeConversationId = typeof snapshot.conversationId === 'string'
      ? snapshot.conversationId.trim()
      : '';
    const activeSessionId = typeof snapshot.sessionId === 'string'
      ? snapshot.sessionId.trim()
      : '';
    const activeStatus = resolveNativeSttStatusFromSnapshot(snapshot);
    nativeSttSnapshotRef.current = snapshot;
    const sameRoomHasLiveSession = activeConversationId === requestedConversationId
      && isLiveNativeSttStatus(activeStatus);
    const sameRoomIsStopping = activeConversationId === requestedConversationId
      && activeStatus === 'stopping';

    if (sameRoomHasLiveSession || sameRoomIsStopping) {
      nativeSttConversationIdRef.current = activeConversationId;
      nativeSttSessionIdRef.current = activeSessionId || null;
      nativeSttRequestedConversationIdRef.current = activeConversationId;
      nativeSttRequestedSessionIdRef.current = activeSessionId || null;
      nativeStatusRef.current = activeStatus;
      nativeSttSnapshotRef.current = snapshot;
      emitToWeb({
        type: 'status',
        status: activeStatus,
        conversationId: requestedConversationId,
        ...(activeSessionId ? { sessionId: activeSessionId } : {}),
        ...(typeof snapshot.running === 'boolean' ? { running: snapshot.running } : {}),
        ...(typeof snapshot.serverReady === 'boolean' ? { serverReady: snapshot.serverReady } : {}),
        ...(typeof snapshot.stopping === 'boolean' ? { stopping: snapshot.stopping } : {}),
        ...(typeof snapshot.eventSequence === 'number' ? { eventSequence: snapshot.eventSequence } : {}),
        replay: true,
      });
      return;
    }

    // A terminal status for this room should clear stale RN identity, while a
    // live session owned by another room must remain untouched. This keeps a
    // visible room from inheriting another room's singleton state.
    if (!isLiveNativeSttStatus(activeStatus)
      && (!activeConversationId || activeConversationId === requestedConversationId)) {
      nativeSttConversationIdRef.current = null;
      nativeSttSessionIdRef.current = null;
      nativeSttRequestedConversationIdRef.current = null;
      nativeSttRequestedSessionIdRef.current = null;
      nativeStatusRef.current = activeStatus;
      nativeSttSnapshotRef.current = snapshot;
    }
    emitToWeb({
      type: 'status',
      status: 'idle',
      conversationId: requestedConversationId,
      running: false,
      serverReady: false,
      stopping: false,
      ...(typeof snapshot.eventSequence === 'number' ? { eventSequence: snapshot.eventSequence } : {}),
      replay: true,
    });
  }, [emitToWeb, nativeAvailable]);

  const emitCurrentMicPermissionToWeb = useCallback(async () => {
    if (Platform.OS !== 'ios' || !nativeAvailable) return;
    try {
      const payload = await getNativeSttMicrophonePermissionStatus();
      emitToWeb({
        type: 'permission',
        permission: payload.permission,
        platform: payload.platform || Platform.OS,
      });
    } catch (error: unknown) {
      if (__DEV__) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[NativeSTT] getMicrophonePermissionStatus failed: ${message}`);
      }
    }
  }, [emitToWeb, nativeAvailable]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !nativeAvailable) return;

    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive = previousState !== 'active' && nextState === 'active';
      previousState = nextState;
      if (!becameActive) return;
      void emitCurrentMicPermissionToWeb();
    });

    return () => {
      subscription.remove();
    };
  }, [emitCurrentMicPermissionToWeb, nativeAvailable]);

  const emitTtsToWeb = useCallback((payload: Record<string, unknown>) => {
    if (!isPageReadyRef.current) return;
    const serialized = JSON.stringify(payload);
    if (__DEV__) {
      console.log(`[NativeTTS→Web] ${JSON.stringify(payload).slice(0, 120)}`);
    }
    const script = `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_TTS_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const emitUiToWeb = useCallback((payload: NativeUiEvent) => {
    if (!isPageReadyRef.current) return;
    const serialized = JSON.stringify(payload);
    if (__DEV__) {
      console.log(`[NativeUI→Web] ${JSON.stringify(payload).slice(0, 120)}`);
    }
    const cacheBannerLayoutScript = payload.type === 'banner_layout'
      ? `window.__MINGLE_LAST_NATIVE_BANNER_LAYOUT = ${serialized}; `
      : '';
    const script = `${cacheBannerLayoutScript}window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_UI_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const emitBannerLayoutToWeb = useCallback(() => {
    if (!nativeBannerUnitId) return;
    const shouldReserveListTopInset = !shouldHideNativeBanners
      && activeBannerZone === 'list'
      && canRenderNativeBanner
      && nativeAdsReady;
    const shouldReserveConversationInset = !shouldHideNativeBanners
      && activeBannerZone === 'conversation'
      && canRenderNativeBanner
      && nativeAdsReady
      && !isNativeMenuOverlayOpen;
    const effectiveBannerPosition: NativeBannerPosition = activeBannerZone === 'conversation'
      ? nativeBannerPosition
      : 'top';
    const shouldReserveTopInset = shouldReserveListTopInset
      || (shouldReserveConversationInset && nativeBannerPosition === 'top');
    const effectiveTopInsetPx = shouldReserveTopInset
      ? nativeTranscriptInsetPx
      : 0;
    const effectiveBottomInsetPx = shouldReserveConversationInset && nativeBannerPosition === 'bottom'
      ? resolveNativeBottomBannerWebInsetPx({
          isIosPlatform: Platform.OS === 'ios',
          bannerContentInsetPx: nativeBannerBottomInsetPx,
          safeAreaInsetBottomPx: safeAreaInsets.bottom,
        })
      : 0;
    emitUiToWeb({
      type: 'banner_layout',
      position: effectiveBannerPosition,
      topInsetPx: effectiveTopInsetPx,
      bottomInsetPx: effectiveBottomInsetPx,
    });
  }, [
    activeBannerZone,
    canRenderNativeBanner,
    emitUiToWeb,
    isNativeMenuOverlayOpen,
    nativeAdsReady,
    nativeBannerBottomInsetPx,
    nativeBannerPosition,
    nativeBannerUnitId,
    nativeTranscriptInsetPx,
    safeAreaInsets.bottom,
    shouldHideNativeBanners,
  ]);

  const prepareBannerZoneTransition = useCallback((nextUrl?: string) => {
    const currentState = {
      activeZone: activeBannerZoneRef.current,
      stableZone: stableBannerZoneRef.current,
      pendingNavigationZone: pendingNavigationBannerZoneRef.current,
    };
    const nextState = resolveNativeBannerNavigationState(
      currentState,
      typeof nextUrl === 'string' ? nextUrl : '',
    );
    if (nextState === currentState) return;

    activeBannerZoneRef.current = nextState.activeZone;
    stableBannerZoneRef.current = nextState.stableZone;
    pendingNavigationBannerZoneRef.current = nextState.pendingNavigationZone;
    setActiveBannerZone(nextState.activeZone);
  }, []);

  const dispatchAuthToWeb = useCallback((payload: NativeAuthEvent) => {
    const serialized = JSON.stringify(payload);
    if (__DEV__) {
      console.log(`[NativeAuth→Web] ${JSON.stringify(payload).slice(0, 160)}`);
    }
    const script = `window.__MINGLE_LAST_NATIVE_AUTH_EVENT = ${serialized}; window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_AUTH_EVENT)}, { detail: ${serialized} })); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const clearAuthDispatchRetryTimer = useCallback(() => {
    if (authDispatchRetryTimerRef.current) {
      clearTimeout(authDispatchRetryTimerRef.current);
      authDispatchRetryTimerRef.current = null;
    }
  }, []);

  const scheduleAuthDispatchRetry = useCallback((payload: NativeAuthEvent) => {
    if (payload.type === 'status') return;
    clearAuthDispatchRetryTimer();

    authDispatchRetryTimerRef.current = setTimeout(() => {
      const pending = pendingAuthEventRef.current;
      if (!pending || pending.type === 'status') return;
      if (pending.provider !== payload.provider) return;
      if (pending.type !== payload.type) return;
      if (pending.type === 'success' && payload.type === 'success' && pending.bridgeToken !== payload.bridgeToken) {
        return;
      }
      if (authDispatchRetryCountRef.current >= 20) return;

      if (!isPageReadyRef.current || !webViewRef.current) {
        scheduleAuthDispatchRetry(payload);
        return;
      }

      authDispatchRetryCountRef.current += 1;
      dispatchAuthToWeb(pending);
      scheduleAuthDispatchRetry(payload);
    }, 500);
  }, [clearAuthDispatchRetryTimer, dispatchAuthToWeb]);

  const emitAuthToWeb = useCallback((payload: NativeAuthEvent) => {
    if (payload.type !== 'status') {
      pendingAuthEventRef.current = payload;
      authDispatchRetryCountRef.current = 0;
    }

    if (!isPageReadyRef.current) {
      if (__DEV__) {
        console.log(`[NativeAuth→Web] queued (page not ready) ${JSON.stringify(payload).slice(0, 160)}`);
      }
      if (payload.type !== 'status') {
        scheduleAuthDispatchRetry(payload);
      }
      return;
    }
    dispatchAuthToWeb(payload);
    if (payload.type !== 'status') {
      scheduleAuthDispatchRetry(payload);
    }
  }, [dispatchAuthToWeb, scheduleAuthDispatchRetry]);

  const flushPendingAuthToWeb = useCallback(() => {
    if (!isPageReadyRef.current) return;
    const pending = pendingAuthEventRef.current;
    if (!pending) return;
    dispatchAuthToWeb(pending);
    if (pending.type !== 'status') {
      scheduleAuthDispatchRetry(pending);
    }
  }, [dispatchAuthToWeb, scheduleAuthDispatchRetry]);

  useEffect(() => {
    return () => {
      clearAuthDispatchRetryTimer();
    };
  }, [clearAuthDispatchRetryTimer]);

  const resolveCurrentTtsIdentity = useCallback((event?: { utteranceId?: string; playbackId?: string }) => {
    const active = currentTtsPlaybackRef.current;
    const eventPlaybackId = typeof event?.playbackId === 'string' ? event.playbackId : '';
    const eventUtteranceId = typeof event?.utteranceId === 'string' ? event.utteranceId : '';
    const playbackId = eventPlaybackId || active?.playbackId || '';
    const utteranceId = eventUtteranceId || active?.utteranceId || '';

    if (active) {
      if (playbackId && playbackId === active.playbackId) {
        currentTtsPlaybackRef.current = null;
      } else if (!playbackId && utteranceId && utteranceId === active.utteranceId) {
        currentTtsPlaybackRef.current = null;
      } else if (!playbackId && !utteranceId) {
        currentTtsPlaybackRef.current = null;
      }
    }

    return { utteranceId, playbackId };
  }, []);

  const handleNativeStart = useCallback(async (payload?: NativeSttStartPayload) => {
    if (!nativeAvailable) {
      emitToWeb({ type: 'error', message: 'native_stt_unavailable' });
      return;
    }

    const payloadWsUrl = typeof payload?.wsUrl === 'string' ? payload.wsUrl.trim() : '';
    if (!payloadWsUrl && !DEFAULT_WS_URL) {
      emitToWeb({ type: 'error', message: 'missing_ws_url_env(NEXT_PUBLIC_WS_URL)' });
      return;
    }

    const wsUrl = payloadWsUrl
      ? payloadWsUrl
      : DEFAULT_WS_URL;
    const fallbackWsUrl = resolveDistinctFallbackTarget(wsUrl, DEFAULT_WS_FALLBACK_URL);
    const sttModel = typeof payload?.sttModel === 'string' && payload.sttModel.trim()
      ? payload.sttModel.trim()
      : 'soniox';
    const aecEnabled = payload?.aecEnabled === true;
    const apiNamespace = typeof payload?.apiNamespace === 'string' ? payload.apiNamespace.trim() : '';
    const behaviorProfile = typeof payload?.behaviorProfile === 'string' ? payload.behaviorProfile.trim() : '';
    const sonioxManualFinalizeSilenceMs = parseOptionalSonioxManualFinalizeSilenceMs(
      payload?.sonioxManualFinalizeSilenceMs,
    );
    const conversationId = typeof payload?.conversationId === 'string'
      ? payload.conversationId.trim()
      : '';
    const sessionId = typeof payload?.sessionId === 'string'
      ? payload.sessionId.trim()
      : '';
    const normalizedSttSegmentationMode = typeof payload?.sttSegmentationMode === 'string'
      ? payload.sttSegmentationMode.trim().toLowerCase()
      : '';
    const sttSegmentationMode = normalizedSttSegmentationMode === 'fin'
      || normalizedSttSegmentationMode === 'end'
      ? normalizedSttSegmentationMode as 'fin' | 'end'
      : undefined;
    const sonioxEndpointMaxDelayMs = parseOptionalSonioxManualFinalizeSilenceMs(
      payload?.sonioxEndpointMaxDelayMs,
    );
    const sonioxEndpointTuningStep = parseOptionalSonioxManualFinalizeSilenceMs(
      payload?.sonioxEndpointTuningStep,
    );
    nativeSttRequestedConversationIdRef.current = conversationId || null;
    nativeSttRequestedSessionIdRef.current = sessionId || null;
    const statusSyncSequence = ++nativeSttStatusSyncSequenceRef.current;
    const statusBeforeStart = nativeStatusRef.current;
    const activeNativeConversationIdBeforeStart = nativeSttConversationIdRef.current;
    const activeNativeSessionIdBeforeStart = nativeSttSessionIdRef.current;

    const startPayload = {
      conversationId,
      ...(sessionId ? { sessionId } : {}),
      sttModel,
      aecEnabled,
      ...(apiNamespace ? { apiNamespace } : {}),
      ...(behaviorProfile ? { behaviorProfile } : {}),
      ...(typeof sonioxManualFinalizeSilenceMs === 'number'
        ? { sonioxManualFinalizeSilenceMs }
        : {}),
      ...(sttSegmentationMode ? { sttSegmentationMode } : {}),
      ...(typeof sonioxEndpointMaxDelayMs === 'number'
        ? { sonioxEndpointMaxDelayMs }
        : {}),
      ...(typeof sonioxEndpointTuningStep === 'number'
        ? { sonioxEndpointTuningStep }
        : {}),
    };

    try {
      nativeStatusRef.current = 'starting';
      // The native module is the source of truth for the active conversation.
      // Do not overwrite its cached owner before start resolves: doing so can
      // make an `already_running` session from another room look like this
      // room's existing session.
      await startNativeStt({
        wsUrl,
        ...startPayload,
      });
      // A resolved start means native accepted this request. Native events
      // usually populate the active identity first; this fallback covers a
      // short WebView/event-listener gap without claiming an old room before
      // the native start has actually succeeded.
      if (!nativeSttConversationIdRef.current) {
        nativeSttConversationIdRef.current = conversationId || null;
      }
      if (!nativeSttSessionIdRef.current && sessionId) {
        nativeSttSessionIdRef.current = sessionId;
      }
      if (sessionId) {
        retiredNativeSttSessionIdsRef.current.delete(sessionId);
      }
      nativeStatusRef.current = resolveNativeSttStatusAfterStart(nativeStatusRef.current);
      void syncNativeSttStatusAfterStart(conversationId, sessionId, statusSyncSequence);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = typeof (error as { code?: unknown })?.code === 'string'
        ? (error as { code: string }).code.trim()
        : resolveNativeSttErrorCode(message);
      const activeSessionMatchesRequest = !sessionId
        || nativeSttSessionIdRef.current === sessionId;
      const isExistingNativeSessionForSameConversation = code === 'already_running'
        && Boolean(conversationId)
        && nativeSttConversationIdRef.current === conversationId
        && activeSessionMatchesRequest;
      if (isExistingNativeSessionForSameConversation) {
        nativeStatusRef.current = ['starting', 'running', 'ready', 'silenced', 'recovering', 'connecting']
          .includes(statusBeforeStart)
          ? statusBeforeStart
          : 'running';
        emitToWeb({
          type: 'status',
          status: nativeStatusRef.current,
          conversationId,
          ...(nativeSttSessionIdRef.current || sessionId
            ? { sessionId: nativeSttSessionIdRef.current || sessionId }
            : {}),
        });
        void syncNativeSttStatusAfterStart(
          conversationId,
          nativeSttSessionIdRef.current || sessionId,
          statusSyncSequence,
        );
        return;
      }
      if (code === 'already_running') {
        // A previous room can outlive its WebView listener. Recover the
        // process-wide native singleton instead of leaving the new room in a
        // false connecting state. An empty conversation ID intentionally asks
        // the native module to stop whichever session actually owns capture.
        try {
          const stoppedConversationId = nativeSttConversationIdRef.current
            || activeNativeConversationIdBeforeStart
            || undefined;
          const stoppedSessionId = nativeSttSessionIdRef.current
            || activeNativeSessionIdBeforeStart
            || undefined;
          await stopNativeStt({
            // Recovery is process-wide. A stale room/session ID would be
            // rejected by Android's stale-stop guard and leave the recorder
            // alive behind the new WebView.
            force: true,
            pendingText: '',
            pendingLanguage: 'unknown',
          });
          nativeStatusRef.current = 'stopped';
          emitToWeb({
            type: 'status',
            status: 'stopped',
            ...(stoppedConversationId ? { conversationId: stoppedConversationId } : {}),
            ...(stoppedSessionId ? { sessionId: stoppedSessionId } : {}),
            running: false,
            serverReady: false,
            stopping: false,
          });
          nativeSttConversationIdRef.current = null;
          rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, stoppedSessionId);
          nativeSttSessionIdRef.current = null;
          nativeStatusRef.current = 'starting';
          await startNativeStt({
            wsUrl,
            ...startPayload,
          });
          if (!nativeSttConversationIdRef.current) {
            nativeSttConversationIdRef.current = conversationId || null;
          }
          if (!nativeSttSessionIdRef.current && sessionId) {
            nativeSttSessionIdRef.current = sessionId;
          }
          if (sessionId) {
            retiredNativeSttSessionIdsRef.current.delete(sessionId);
          }
          nativeStatusRef.current = resolveNativeSttStatusAfterStart(nativeStatusRef.current);
          void syncNativeSttStatusAfterStart(conversationId, sessionId, statusSyncSequence);
          return;
        } catch (recoveryError: unknown) {
          if (__DEV__) {
            const recoveryMessage = recoveryError instanceof Error
              ? recoveryError.message
              : String(recoveryError);
            console.warn(`[NativeSTT] stale-session recovery failed: ${recoveryMessage}`);
          }
        }
      }
      const shouldRetryFallback = Boolean(
        fallbackWsUrl
        && code !== 'mic_permission'
        && !__DEV__
        && !isLoopbackUrl(wsUrl)
        && !isDevelopmentTunnelUrl(wsUrl),
      );
      if (shouldRetryFallback) {
        try {
          await startNativeStt({
            wsUrl: fallbackWsUrl,
            ...startPayload,
          });
          if (!nativeSttConversationIdRef.current) {
            nativeSttConversationIdRef.current = conversationId || null;
          }
          if (!nativeSttSessionIdRef.current && sessionId) {
            nativeSttSessionIdRef.current = sessionId;
          }
          if (sessionId) {
            retiredNativeSttSessionIdsRef.current.delete(sessionId);
          }
          nativeStatusRef.current = resolveNativeSttStatusAfterStart(nativeStatusRef.current);
          void syncNativeSttStatusAfterStart(conversationId, sessionId, statusSyncSequence);
          return;
        } catch (fallbackError: unknown) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const fallbackCode = typeof (fallbackError as { code?: unknown })?.code === 'string'
            ? (fallbackError as { code: string }).code.trim()
            : resolveNativeSttErrorCode(fallbackMessage);
          const failedConversationId = nativeSttConversationIdRef.current || conversationId || undefined;
          const failedSessionId = nativeSttSessionIdRef.current || sessionId || undefined;
          nativeStatusRef.current = fallbackCode === 'mic_permission' ? 'idle' : 'failed';
          emitToWeb({
            type: 'status',
            status: nativeStatusRef.current,
            ...(failedConversationId ? { conversationId: failedConversationId } : {}),
            ...(failedSessionId ? { sessionId: failedSessionId } : {}),
          });
          nativeSttConversationIdRef.current = null;
          nativeSttSessionIdRef.current = null;
          emitToWeb({
            type: 'error',
            message: fallbackMessage,
            ...(fallbackCode ? { code: fallbackCode } : {}),
            platform: Platform.OS,
            ...(failedConversationId ? { conversationId: failedConversationId } : {}),
            ...(failedSessionId ? { sessionId: failedSessionId } : {}),
          });
          nativeSttRequestedConversationIdRef.current = null;
          nativeSttRequestedSessionIdRef.current = null;
          rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, failedSessionId);
          return;
        }
      }
      const failedConversationId = nativeSttConversationIdRef.current || conversationId || undefined;
      const failedSessionId = nativeSttSessionIdRef.current || sessionId || undefined;
      nativeStatusRef.current = code === 'mic_permission' ? 'idle' : 'failed';
      emitToWeb({
        type: 'status',
        status: nativeStatusRef.current,
        ...(failedConversationId ? { conversationId: failedConversationId } : {}),
        ...(failedSessionId ? { sessionId: failedSessionId } : {}),
      });
      if (code === 'mic_permission') {
        emitToWeb({
          type: 'permission',
          permission: 'denied',
          platform: Platform.OS,
        });
      }
      emitToWeb({
        type: 'error',
        message,
        ...(code ? { code } : {}),
        platform: Platform.OS,
        ...(failedConversationId ? { conversationId: failedConversationId } : {}),
        ...(failedSessionId ? { sessionId: failedSessionId } : {}),
      });
      nativeSttConversationIdRef.current = null;
      rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, failedSessionId);
      nativeSttSessionIdRef.current = null;
      nativeSttRequestedConversationIdRef.current = null;
      nativeSttRequestedSessionIdRef.current = null;
    }
  }, [emitToWeb, nativeAvailable, syncNativeSttStatusAfterStart]);

  const handleNativeStop = useCallback(async (payload?: NativeSttStopPayload) => {
    const requestedConversationId = typeof payload?.conversationId === 'string'
      ? payload.conversationId.trim()
      : '';
    const requestedSessionId = typeof payload?.sessionId === 'string'
      ? payload.sessionId.trim()
      : '';
    const force = payload?.force === true;
    const activeConversationId = nativeSttConversationIdRef.current || '';
    const activeSessionId = nativeSttSessionIdRef.current || '';
    if (!force && requestedConversationId && activeConversationId && requestedConversationId !== activeConversationId) {
      if (__DEV__) {
        console.log(`[Web→NativeSTT] ignored stale stop conversation=${requestedConversationId} active=${activeConversationId}`);
      }
      return;
    }
    if (!force && requestedSessionId && activeSessionId && requestedSessionId !== activeSessionId) {
      if (__DEV__) {
        console.log(`[Web→NativeSTT] ignored stale stop session=${requestedSessionId} active=${activeSessionId}`);
      }
      return;
    }
    nativeSttStatusSyncSequenceRef.current += 1;
    const stoppedConversationId = requestedConversationId || activeConversationId || undefined;
    const stoppedSessionId = requestedSessionId || activeSessionId || undefined;
    // If RN has lost the active identity during a WebView reload, omitting the
    // room/session fields lets the native singleton stop itself instead of
    // being rejected as a stale request. Explicit force stops always use this
    // process-wide form as well.
    const nativeStopConversationId = force
      ? undefined
      : activeConversationId || (activeSessionId ? requestedConversationId : undefined);
    const nativeStopSessionId = force ? undefined : activeSessionId || undefined;
    try {
      await stopNativeStt({
        ...(nativeStopConversationId ? { conversationId: nativeStopConversationId } : {}),
        ...(nativeStopSessionId ? { sessionId: nativeStopSessionId } : {}),
        ...(force ? { force: true } : {}),
        pendingText: typeof payload?.pendingText === 'string' ? payload.pendingText : '',
        pendingLanguage: typeof payload?.pendingLanguage === 'string' ? payload.pendingLanguage : 'unknown',
      });
      nativeStatusRef.current = 'stopped';
      emitToWeb({
        type: 'status',
        status: 'stopped',
        ...(stoppedConversationId ? { conversationId: stoppedConversationId } : {}),
        ...(stoppedSessionId ? { sessionId: stoppedSessionId } : {}),
        running: false,
        serverReady: false,
        stopping: false,
      });
      nativeSttConversationIdRef.current = null;
      rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, stoppedSessionId);
      nativeSttSessionIdRef.current = null;
      nativeSttRequestedConversationIdRef.current = null;
      nativeSttRequestedSessionIdRef.current = null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      emitToWeb({
        type: 'error',
        message,
        ...(stoppedConversationId ? { conversationId: stoppedConversationId } : {}),
        ...(stoppedSessionId ? { sessionId: stoppedSessionId } : {}),
      });
    }
  }, [emitToWeb]);

  const enqueueNativeSttCommand = useCallback((task: () => Promise<void>) => {
    const queuedTask = nativeSttCommandQueueRef.current.then(task, task);
    nativeSttCommandQueueRef.current = queuedTask.then(
      () => undefined,
      () => undefined,
    );
  }, []);

  const handleNativeAuthStart = useCallback(async (payload?: {
    provider?: NativeAuthProvider;
    callbackUrl?: string;
    startUrl?: string;
  }) => {
    const provider = payload?.provider === 'google' || payload?.provider === 'apple'
      ? payload.provider
      : null;
    if (!provider) {
      return;
    }

    if (nativeAuthInFlightRef.current) {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_already_in_flight',
      });
      return;
    }

    const startUrl = typeof payload?.startUrl === 'string' ? payload.startUrl.trim() : '';
    if (!startUrl) {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_missing_start_url',
      });
      return;
    }
    if (!trustedNativeAuthOrigin) {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_untrusted_origin_unavailable',
      });
      return;
    }
    let parsedStartUrl: URL;
    try {
      parsedStartUrl = new URL(startUrl);
    } catch {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_invalid_start_url',
      });
      return;
    }
    if (parsedStartUrl.protocol !== 'http:' && parsedStartUrl.protocol !== 'https:') {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_invalid_start_url_protocol',
      });
      return;
    }
    if (parsedStartUrl.origin !== trustedNativeAuthOrigin) {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_invalid_start_url_origin',
      });
      return;
    }
    if (!isAllowedNativeAuthStartPath(parsedStartUrl.pathname)) {
      emitAuthToWeb({
        type: 'error',
        provider,
        message: 'native_auth_invalid_start_url_path',
      });
      return;
    }
    const expectedPathPrefix = parsedStartUrl.pathname.startsWith('/api/native-auth/start')
      ? '/api/native-auth/start'
      : parsedStartUrl.pathname;

    pendingAuthEventRef.current = null;
    authDispatchRetryCountRef.current = 0;
    clearAuthDispatchRetryTimer();
    nativeAuthInFlightRef.current = provider;
    emitAuthToWeb({
      type: 'status',
      provider,
      status: 'opening',
    });
    try {
      const result = await startNativeBrowserAuthSession({
        provider,
        startUrl,
        expectedOrigin: trustedNativeAuthOrigin,
        expectedPathPrefix,
      });
      emitAuthToWeb({
        type: 'success',
        provider: result.provider,
        callbackUrl: result.callbackUrl,
        bridgeToken: result.bridgeToken,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      emitAuthToWeb({
        type: 'error',
        provider,
        message: message || 'native_auth_failed',
      });
    } finally {
      nativeAuthInFlightRef.current = null;
    }
  }, [clearAuthDispatchRetryTimer, emitAuthToWeb, trustedNativeAuthOrigin]);

  const handleDebugWebViewRemount = useCallback((requestedUrl?: string) => {
    const normalizedRequestedUrl = typeof requestedUrl === 'string' ? requestedUrl.trim() : '';
    const preservedUrl = shouldPreserveDebugRemountUrl(normalizedRequestedUrl)
      ? normalizedRequestedUrl
      : '';
    isPageReadyRef.current = false;
    setLoadError(null);
    setIsNativeMenuOverlayOpen(false);
    setDebugRemountWebUrl(preservedUrl || lastWebViewUrlRef.current || webUrl || baseWebUrl);
    setWebViewMountToken((current) => current + 1);
  }, [baseWebUrl, webUrl]);

  const handleWebMessage = useCallback((event: WebViewMessageEvent) => {
    const sourceUrl = typeof (event.nativeEvent as { url?: unknown }).url === 'string'
      ? ((event.nativeEvent as { url: string }).url)
      : '';
    rememberCurrentWebUrl(sourceUrl);

    let parsed: WebViewCommand | null = null;
    try {
      parsed = JSON.parse(event.nativeEvent.data) as WebViewCommand;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    // Receiving a valid command is stronger evidence that the current
    // document is interactive than Android WebView's load callbacks. Some
    // renderer/navigation paths leave onLoadStart unmatched long enough for
    // native STT status and transcript events to be discarded even though
    // the room can already send Start. Restore the outbound bridge as soon as
    // the current document proves that it is ready.
    if (!isPageReadyRef.current) {
      isPageReadyRef.current = true;
      flushPendingNativeSttMessagesToWeb();
    }

    if (parsed.type === 'native_qr_scanner_open') {
      setQrScannerRequest(parsed.payload ?? {});
      return;
    }

    if (parsed.type === 'native_qr_save') {
      void handleNativeQrSave(parsed.payload);
      return;
    }

    if (
      parsed.type === 'native_pip_start'
      || parsed.type === 'native_pip_update'
      || parsed.type === 'native_pip_stop'
    ) {
      if (Platform.OS !== 'ios') return;

      const pictureInPictureModule = (NativeModules as {
        NativePictureInPictureModule?: NativePictureInPictureModule;
      }).NativePictureInPictureModule;
      if (!pictureInPictureModule) return;

      if (parsed.type === 'native_pip_start') {
        if (typeof pictureInPictureModule.start !== 'function') return;
        void pictureInPictureModule.start(parsed.payload ?? {}).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (__DEV__) {
            console.warn(`[NativePiP] start failed: ${message}`);
          }
          Alert.alert('Picture in Picture unavailable', message);
        });
      } else if (parsed.type === 'native_pip_update') {
        pictureInPictureModule.update?.(parsed.payload ?? {});
      } else {
        if (typeof pictureInPictureModule.stop !== 'function') return;
        void pictureInPictureModule.stop(parsed.payload ?? {}).catch((error: unknown) => {
          if (__DEV__) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[NativePiP] stop failed: ${message}`);
          }
        });
      }
      return;
    }

    if (parsed.type === 'native_location_check') {
      void handleNativeLocationCheck(parsed.payload?.requestId);
      return;
    }

    if (parsed.type === 'native_location_request') {
      void handleNativeLocationRequest(parsed.payload?.requestId);
      return;
    }

    if (parsed.type === 'native_push_register') {
      void requestNativePushRegistration();
      return;
    }

    if (parsed.type === 'native_navigation_state') {
      const url = typeof parsed.payload?.url === 'string' ? parsed.payload.url : '';
      rememberCurrentWebUrl(url);
      if (typeof parsed.payload?.canGoBack === 'boolean') {
        setCanWebViewGoBack(parsed.payload.canGoBack);
      }
      if (typeof parsed.payload?.canGoForward === 'boolean') {
        setCanWebViewGoForward(parsed.payload.canGoForward);
      }
      if (typeof parsed.payload?.canHandleNativeBack === 'boolean') {
        setCanWebViewHandleAndroidBack(parsed.payload.canHandleNativeBack);
      }
      if (typeof parsed.payload?.suppressEdgeSwipe === 'boolean') {
        setIsEdgeSwipeSuppressedByWeb(parsed.payload.suppressEdgeSwipe);
      } else if (typeof parsed.payload?.canHandleAndroidBack === 'boolean') {
        setCanWebViewHandleAndroidBack(parsed.payload.canHandleAndroidBack);
      }
      prepareBannerZoneTransition(url);
      updateSafeAreaPalette(url);
      return;
    }

    if (parsed.type === 'native_history_debug') {
      if (!RUNTIME_QA_BRIDGE_ENABLED) return;
      try {
        const serializedPayload = JSON.stringify(parsed.payload ?? {}).slice(0, 4000);
        NATIVE_CONVERSATION_RESTORE_STORAGE.recordHistoryDebug?.(serializedPayload);
        console.warn('[MingleHistoryDebug]', serializedPayload);
      } catch {
        NATIVE_CONVERSATION_RESTORE_STORAGE.recordHistoryDebug?.('{"error":"unable_to_serialize"}');
        console.warn('[MingleHistoryDebug] unable to serialize diagnostic payload');
      }
      return;
    }

    if (parsed.type === 'native_open_update_store') {
      const requestedUrl = typeof parsed.payload?.updateUrl === 'string'
        ? parsed.payload.updateUrl.trim()
        : '';
      const updateUrl = requestedUrl || nativeAppUpdateRef.current.updateUrl.trim();
      if (!updateUrl) return;
      void Linking.openURL(updateUrl);
      return;
    }

    if (parsed.type === 'native_remount_webview') {
      if (!shouldEnableDebugWebViewRemount(WEB_APP_BASE_URL)) return;
      handleDebugWebViewRemount(parsed.payload?.url || sourceUrl);
      return;
    }

    if (parsed.type === 'native_qa_set_stt_status') {
      if (!RUNTIME_QA_BRIDGE_ENABLED) return;
      const requestedStatus = typeof parsed.payload?.status === 'string'
        ? parsed.payload.status.trim()
        : '';
      if (!requestedStatus) return;
      nativeStatusRef.current = requestedStatus;
      if (isPageReadyRef.current) {
        emitToWeb({ type: 'status', status: nativeStatusRef.current });
      }
      return;
    }

    if (parsed.type === 'native_ui_overlay_state') {
      setIsNativeMenuOverlayOpen(Boolean(parsed.payload?.menuOpen));
      return;
    }

    if (parsed.type === 'native_set_ad_banner_position') {
      const rawPosition = typeof parsed.payload?.position === 'string'
        ? parsed.payload.position.trim()
        : '';
      if (!rawPosition) {
        setNativeBannerPositionOverride(null);
        return;
      }
      const nextPosition = normalizeNativeBannerPosition(rawPosition);
      setNativeBannerPositionOverride(nextPosition);
      return;
    }

    if (parsed.type === 'native_set_bottom_bar_clearance') {
      setNativeBottomBarClearancePx(normalizeNativeBottomBarClearancePx(parsed.payload?.clearancePx));
      return;
    }

    if (parsed.type === 'native_set_banner_zone') {
      const zone = parsed.payload?.zone;
      if (zone === 'list' || zone === 'conversation' || zone === 'hidden') {
        if (zone === 'list' || zone === 'conversation') {
          stableBannerZoneRef.current = zone;
          pendingNavigationBannerZoneRef.current = null;
        }
        activeBannerZoneRef.current = zone;
        setActiveBannerZone(zone);
      }
      return;
    }

    if (parsed.type === 'native_auth_ack') {
      const provider = parsed.payload?.provider === 'google' || parsed.payload?.provider === 'apple'
        ? parsed.payload.provider
        : null;
      if (!provider) return;

      const pending = pendingAuthEventRef.current;
      if (!pending || pending.type === 'status' || pending.provider !== provider) return;

      const outcome = parsed.payload?.outcome;
      if (pending.type === 'success') {
        if (outcome !== 'success') return;
        const ackBridgeToken = typeof parsed.payload?.bridgeToken === 'string'
          ? parsed.payload.bridgeToken.trim()
          : '';
        if (ackBridgeToken && ackBridgeToken !== pending.bridgeToken) return;
      } else if (outcome !== 'error') {
        return;
      }

      pendingAuthEventRef.current = null;
      authDispatchRetryCountRef.current = 0;
      clearAuthDispatchRetryTimer();
      if (__DEV__) {
        console.log(`[Web→NativeAuth] ack provider=${provider} outcome=${outcome ?? 'unknown'}`);
      }
      return;
    }

    if (parsed.type === 'native_auth_reset') {
      // 웹이 로그아웃/세션 만료 시 전송하는 리셋 명령.
      // 이전 세션의 auth 결과(pendingAuthEventRef)와 retry 타이머를 클리어해서
      // 이전 로그인의 에러/성공 이벤트가 재전송되지 않도록 함.
      if (nativeAuthInFlightRef.current === null) {
        pendingAuthEventRef.current = null;
        authDispatchRetryCountRef.current = 0;
        clearAuthDispatchRetryTimer();
        if (__DEV__) {
          console.log('[Web→NativeAuth] reset: cleared pending auth state');
        }
      }
      return;
    }

    if (parsed.type === 'native_stt_start') {
      if (__DEV__) {
        console.log(`[Web→NativeSTT] ${parsed.type}`, JSON.stringify(parsed.payload ?? {}).slice(0, 120));
      }
      enqueueNativeSttCommand(() => handleNativeStart(parsed.payload));
      return;
    }

    if (parsed.type === 'native_stt_status_request') {
      if (__DEV__) {
        console.log(`[Web→NativeSTT] ${parsed.type}`, JSON.stringify(parsed.payload ?? {}).slice(0, 120));
      }
      enqueueNativeSttCommand(() => handleNativeStatusRequest(parsed.payload));
      return;
    }

    if (parsed.type === 'native_stt_stop') {
      if (__DEV__) {
        console.log(`[Web→NativeSTT] ${parsed.type}`, JSON.stringify(parsed.payload ?? {}).slice(0, 120));
      }
      enqueueNativeSttCommand(() => handleNativeStop(parsed.payload));
      return;
    }

    if (parsed.type === 'native_tts_play') {
      const { utteranceId, audioBase64 } = parsed.payload;
      const playbackId = typeof parsed.payload.playbackId === 'string' && parsed.payload.playbackId.trim()
        ? parsed.payload.playbackId.trim()
        : utteranceId;
      currentTtsPlaybackRef.current = { utteranceId, playbackId };
      if (__DEV__) {
        console.log(`[Web→NativeTTS] play utteranceId=${utteranceId} playbackId=${playbackId} base64Len=${audioBase64.length}`);
      }
      void playNativeTts({ audioBase64, utteranceId, playbackId }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (__DEV__) {
          console.log(`[NativeTTS] play error playbackId=${playbackId}: ${message}`);
        }
        if (currentTtsPlaybackRef.current?.playbackId === playbackId) {
          currentTtsPlaybackRef.current = null;
        }
        emitTtsToWeb({ type: 'tts_error', utteranceId, playbackId, message });
      });
      return;
    }

    if (parsed.type === 'native_stt_set_aec') {
      const enabled = parsed.payload?.enabled === true;
      if (__DEV__) {
        console.log(`[Web→NativeSTT] setAec enabled=${enabled}`);
      }
      void setNativeSttAec(enabled);
      return;
    }

    if (parsed.type === 'native_open_app_settings') {
      if (__DEV__) {
        console.log(`[Web→Native] open app settings reason=${parsed.payload?.reason ?? 'unspecified'}`);
      }
      void Linking.openSettings();
      return;
    }

    if (parsed.type === 'native_tts_stop') {
      const reason = typeof parsed.payload?.reason === 'string' && parsed.payload.reason.trim()
        ? parsed.payload.reason.trim()
        : 'unspecified';
      if (__DEV__) {
        console.log(`[Web→NativeTTS] stop reason=${reason}`);
      }
      currentTtsPlaybackRef.current = null;
      void stopNativeTts();
      return;
    }

    if (parsed.type === 'native_auth_start') {
      if (__DEV__) {
        console.log(`[Web→NativeAuth] ${parsed.type}`, JSON.stringify(parsed.payload ?? {}).slice(0, 120));
      }
      void handleNativeAuthStart(parsed.payload);
    }
  }, [
    clearAuthDispatchRetryTimer,
    emitTtsToWeb,
    handleDebugWebViewRemount,
    handleNativeAuthStart,
    handleNativeLocationCheck,
    handleNativeLocationRequest,
    handleNativeQrSave,
    handleNativeStart,
    handleNativeStop,
    handleNativeStatusRequest,
    enqueueNativeSttCommand,
    flushPendingNativeSttMessagesToWeb,
    rememberCurrentWebUrl,
    updateSafeAreaPalette,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let isMounted = true;
    const manager = (NativeModules as {
      StatusBarManager?: {
        HEIGHT?: number;
        getHeight?: (callback: (metrics: { height: number }) => void) => void;
      };
    }).StatusBarManager;

    if (!manager || typeof manager.getHeight !== 'function') return;

    manager.getHeight((metrics) => {
      if (!isMounted) return;
      setIosTopTapOverlayHeight(resolveIosTopTapOverlayHeight(metrics?.height));
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const statusSub = addNativeSttListener('status', event => {
      if (__DEV__) console.log(`[NativeSTT] status: ${event.status}`);
      if (hasOlderNativeSttStatusSequence(
        event.eventSequence,
        nativeSttSnapshotRef.current.eventSequence,
      )) {
        if (__DEV__) {
          console.log(
            `[NativeSTT] ignored older status sequence=${event.eventSequence} `
              + `current=${nativeSttSnapshotRef.current.eventSequence}`,
          );
        }
        return;
      }
      const eventConversationId = event.conversationId?.trim() || '';
      const eventSessionId = event.sessionId?.trim() || '';
      const isStale = isStaleNativeSttSessionEvent({
        eventConversationId,
        eventSessionId,
        activeConversationId: nativeSttConversationIdRef.current,
        activeSessionId: nativeSttSessionIdRef.current,
        requestedConversationId: nativeSttRequestedConversationIdRef.current,
        requestedSessionId: nativeSttRequestedSessionIdRef.current,
        retiredSessionIds: retiredNativeSttSessionIdsRef.current,
      });
      if (isStale) {
        if (__DEV__) {
          console.log(
            `[NativeSTT] ignored stale status=${event.status} conversation=${eventConversationId || 'unknown'} `
              + `session=${eventSessionId || 'unknown'}`,
          );
        }
        return;
      }
      if (event.conversationId) {
        nativeSttConversationIdRef.current = event.conversationId;
      }
      if (event.sessionId) {
        nativeSttSessionIdRef.current = event.sessionId;
      }
      nativeStatusRef.current = event.status;
      emitToWeb({
        type: 'status',
        status: event.status,
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(typeof event.running === 'boolean' ? { running: event.running } : {}),
        ...(typeof event.serverReady === 'boolean' ? { serverReady: event.serverReady } : {}),
        ...(typeof event.stopping === 'boolean' ? { stopping: event.stopping } : {}),
        ...(typeof event.eventSequence === 'number' ? { eventSequence: event.eventSequence } : {}),
      });
      if (isTerminalNativeSttStatus(event.status)) {
        nativeSttConversationIdRef.current = null;
        rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, eventSessionId);
        nativeSttSessionIdRef.current = null;
        if (!eventSessionId
          || !nativeSttRequestedSessionIdRef.current
          || eventSessionId === nativeSttRequestedSessionIdRef.current) {
          nativeSttRequestedConversationIdRef.current = null;
          nativeSttRequestedSessionIdRef.current = null;
        }
      }
    });

    const messageSub = addNativeSttListener('message', event => {
      const eventConversationId = event.conversationId?.trim() || '';
      const eventSessionId = event.sessionId?.trim() || '';
      if (isStaleNativeSttSessionEvent({
        eventConversationId,
        eventSessionId,
        activeConversationId: nativeSttConversationIdRef.current,
        activeSessionId: nativeSttSessionIdRef.current,
        requestedConversationId: nativeSttRequestedConversationIdRef.current,
        requestedSessionId: nativeSttRequestedSessionIdRef.current,
        retiredSessionIds: retiredNativeSttSessionIdsRef.current,
      })) {
        return;
      }
      if (event.conversationId) {
        nativeSttConversationIdRef.current = event.conversationId;
      }
      if (event.sessionId) {
        nativeSttSessionIdRef.current = event.sessionId;
      }
      if (isNativeSttServerReadyMessage(event.raw)) {
        nativeStatusRef.current = 'ready';
      }
      if (nativeStatusRef.current) {
        emitToWeb({
          type: 'status',
          status: nativeStatusRef.current,
          ...(event.conversationId ? { conversationId: event.conversationId } : {}),
          ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        });
      }
      emitToWeb({
        type: 'message',
        raw: event.raw,
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      });
    });

    const errorSub = addNativeSttListener('error', event => {
      if (__DEV__) console.log(`[NativeSTT] error: ${event.message}`);
      const eventConversationId = event.conversationId?.trim() || '';
      const eventSessionId = event.sessionId?.trim() || '';
      if (isStaleNativeSttSessionEvent({
        eventConversationId,
        eventSessionId,
        activeConversationId: nativeSttConversationIdRef.current,
        activeSessionId: nativeSttSessionIdRef.current,
        requestedConversationId: nativeSttRequestedConversationIdRef.current,
        requestedSessionId: nativeSttRequestedSessionIdRef.current,
        retiredSessionIds: retiredNativeSttSessionIdsRef.current,
      })) {
        return;
      }
      if (event.conversationId) {
        nativeSttConversationIdRef.current = event.conversationId;
      }
      if (event.sessionId) {
        nativeSttSessionIdRef.current = event.sessionId;
      }
      const code = typeof event.code === 'string' && event.code.trim()
        ? event.code.trim()
        : resolveNativeSttErrorCode(event.message);
      nativeStatusRef.current = code === 'mic_permission' ? 'idle' : 'error';
      emitToWeb({
        type: 'status',
        status: nativeStatusRef.current,
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      });
      if (code === 'mic_permission') {
        emitToWeb({
          type: 'permission',
          permission: 'denied',
          platform: Platform.OS,
        });
      }
      emitToWeb({
        type: 'error',
        message: event.message,
        ...(code ? { code } : {}),
        platform: Platform.OS,
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      });
    });

    const closeSub = addNativeSttListener('close', event => {
      if (__DEV__) console.log(`[NativeSTT] close: ${event.reason}`);
      const eventConversationId = event.conversationId?.trim() || '';
      const eventSessionId = event.sessionId?.trim() || '';
      if (isStaleNativeSttSessionEvent({
        eventConversationId,
        eventSessionId,
        activeConversationId: nativeSttConversationIdRef.current,
        activeSessionId: nativeSttSessionIdRef.current,
        requestedConversationId: nativeSttRequestedConversationIdRef.current,
        requestedSessionId: nativeSttRequestedSessionIdRef.current,
        retiredSessionIds: retiredNativeSttSessionIdsRef.current,
      })) {
        return;
      }
      if (event.conversationId) {
        nativeSttConversationIdRef.current = event.conversationId;
      }
      if (event.sessionId) {
        nativeSttSessionIdRef.current = event.sessionId;
      }
      nativeStatusRef.current = 'closed';
      emitToWeb({
        type: 'status',
        status: 'closed',
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      });
      emitToWeb({
        type: 'close',
        reason: event.reason,
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      });
      nativeSttConversationIdRef.current = null;
      rememberRetiredNativeSttSession(retiredNativeSttSessionIdsRef.current, eventSessionId);
      nativeSttSessionIdRef.current = null;
    });

    return () => {
      statusSub.remove();
      messageSub.remove();
      errorSub.remove();
      closeSub.remove();
    };
  }, [emitToWeb]);

  useEffect(() => {
    const finishedSub = addNativeTtsListener('ttsPlaybackFinished', (event) => {
      const { utteranceId, playbackId } = resolveCurrentTtsIdentity(event);
      if (__DEV__) {
        console.log(`[NativeTTS] finished utteranceId=${utteranceId} playbackId=${playbackId} success=${event.success}`);
      }
      emitTtsToWeb({ type: 'tts_ended', utteranceId: utteranceId || '', playbackId: playbackId || '' });
    });

    const stoppedSub = addNativeTtsListener('ttsPlaybackStopped', (event) => {
      const { utteranceId, playbackId } = resolveCurrentTtsIdentity(event);
      emitTtsToWeb({ type: 'tts_stopped', utteranceId: utteranceId || '', playbackId: playbackId || '' });
    });

    const errorSub = addNativeTtsListener('ttsError', (event) => {
      const { utteranceId, playbackId } = resolveCurrentTtsIdentity(event);
      if (__DEV__) {
        console.log(`[NativeTTS] error playbackId=${playbackId}: ${event.message}`);
      }
      emitTtsToWeb({ type: 'tts_error', utteranceId: utteranceId || '', playbackId: playbackId || '', message: event.message });
    });

    return () => {
      finishedSub.remove();
      stoppedSub.remove();
      errorSub.remove();
    };
  }, [emitTtsToWeb, resolveCurrentTtsIdentity]);

  useEffect(() => {
    emitBannerLayoutToWeb();
  }, [emitBannerLayoutToWeb]);

  const handleLoadStart = useCallback((event?: { nativeEvent?: { url?: string } }) => {
    isPageReadyRef.current = false;
    if (!initialLoadSettledRef.current) {
      setStartupSplashVisible(true);
    }
    const nextUrl = event?.nativeEvent?.url || webUrl;
    rememberCurrentWebUrl(nextUrl);
    setCurrentWebPathname(parseWebPathname(nextUrl));
    updateSafeAreaPalette(nextUrl);
  }, [rememberCurrentWebUrl, updateSafeAreaPalette, webUrl]);

  const replayNativeSttStatusToWeb = useCallback((nextUrl: string) => {
    const roomPayload = resolveConversationRestorePayloadFromUrl(nextUrl);
    if (!roomPayload) {
      // A list page must not receive a live status scoped to whichever room
      // happened to own the process-wide native singleton previously.
      return;
    }

    const roomConversationId = roomPayload.conversationId;
    const snapshot = nativeSttSnapshotRef.current;
    // The snapshot is the latest native acknowledgement. The refs may still
    // describe the WebView's previous room after a reload, so using them first
    // can replay a stale idle/live state into the newly mounted room.
    const activeConversationId = snapshot.conversationId || nativeSttConversationIdRef.current || '';
    const activeSessionId = snapshot.sessionId || nativeSttSessionIdRef.current || '';
    const activeStatus = resolveNativeSttStatusFromSnapshot(snapshot);
    const sameRoomHasLiveSession = activeConversationId === roomConversationId
      && (isLiveNativeSttStatus(activeStatus) || activeStatus === 'stopping');

    if (sameRoomHasLiveSession) {
      emitToWeb({
        type: 'status',
        status: activeStatus,
        conversationId: roomConversationId,
        ...(activeSessionId ? { sessionId: activeSessionId } : {}),
        ...(typeof snapshot.running === 'boolean' ? { running: snapshot.running } : {}),
        ...(typeof snapshot.serverReady === 'boolean' ? { serverReady: snapshot.serverReady } : {}),
        ...(typeof snapshot.stopping === 'boolean' ? { stopping: snapshot.stopping } : {}),
        ...(typeof snapshot.eventSequence === 'number' ? { eventSequence: snapshot.eventSequence } : {}),
        replay: true,
      });
      return;
    }

    // Reset only this WebView room's cached UI state. The RN/native snapshot
    // is deliberately left untouched because another room may still own the
    // native singleton and must be recovered explicitly on the next start.
    emitToWeb({
      type: 'status',
      status: 'idle',
      conversationId: roomConversationId,
      running: false,
      serverReady: false,
      stopping: false,
      ...(typeof snapshot.eventSequence === 'number' ? { eventSequence: snapshot.eventSequence } : {}),
      replay: true,
    });
  }, [emitToWeb]);

  const handleLoadEnd = useCallback((event?: { nativeEvent?: { url?: string } }) => {
    isPageReadyRef.current = true;
    if (!initialLoadSettledRef.current) {
      initialLoadSettledRef.current = true;
      setStartupSplashVisible(false);
    }
    const nextUrl = event?.nativeEvent?.url || webUrl;
    rememberCurrentWebUrl(nextUrl);
    setCurrentWebPathname(parseWebPathname(nextUrl));
    updateSafeAreaPalette(nextUrl);
    replayNativeSttStatusToWeb(nextUrl);
    flushPendingNativeSttMessagesToWeb();
    flushPendingQrScannerEventsToWeb();
    flushPendingNativeLocationEventsToWeb();
    flushPendingNativePushRegistrationsToWeb();
    flushPendingProfileLinkToWeb();
    emitToWeb({ type: 'capabilities', openAppSettings: true });
    void emitCurrentMicPermissionToWeb();
    emitBannerLayoutToWeb();
    emitAppUpdateToWeb();
    flushPendingAuthToWeb();
    flushPendingRecommendPrompt();

    // A restored iOS room can cold-start with no prior WebView history entry,
    // which makes WKWebView ignore the native edge-swipe back gesture. Seed a
    // list entry before the room entry so the gesture has a valid destination.
    if (Platform.OS === 'ios' && classifyConversationWebUrl(nextUrl) === 'room') {
      webViewRef.current?.injectJavaScript(`
        (function () {
          try {
            if (window[${JSON.stringify(IOS_CONVERSATION_ROOM_HISTORY_SEEDED_FLAG)}]) return true;
            if (window.history.length > 1) return true;
            var currentHref = window.location.href;
            var listUrl = currentHref;
            try {
              var parsed = new URL(currentHref);
              parsed.searchParams.delete('conversation');
              listUrl = parsed.toString();
            } catch (urlError) {
              listUrl = currentHref.replace(/[?&]conversation=[^&]*/g, '').replace(/[?&]$/, '');
            }
            var conversationId = '';
            try {
              conversationId = new URL(currentHref).searchParams.get('conversation') || '';
            } catch (urlError) {
              conversationId = '';
            }
            var buildConversationRouteState = function (routeConversationId, sourceState) {
              var nextState = sourceState && typeof sourceState === 'object' && !Array.isArray(sourceState)
                ? Object.assign({}, sourceState)
                : {};
              delete nextState.conversationId;
              nextState[${JSON.stringify(CONVERSATION_HISTORY_ROUTE_STATE_KEY)}] = routeConversationId || null;
              if (routeConversationId) {
                nextState.conversationId = routeConversationId;
              }
              return nextState;
            };
            window.history.replaceState(
              buildConversationRouteState(null, window.history.state),
              '',
              listUrl,
            );
            window.history.pushState(
              buildConversationRouteState(conversationId, window.history.state),
              '',
              currentHref,
            );
            window[${JSON.stringify(IOS_CONVERSATION_ROOM_HISTORY_SEEDED_FLAG)}] = true;
          } catch (e) {
            // Ignore errors in history seed injection.
          }
          return true;
        })();
        true;
      `);
    }

  }, [emitAppUpdateToWeb, emitBannerLayoutToWeb, emitCurrentMicPermissionToWeb, flushPendingAuthToWeb, flushPendingNativeLocationEventsToWeb, flushPendingNativePushRegistrationsToWeb, flushPendingNativeSttMessagesToWeb, flushPendingProfileLinkToWeb, flushPendingQrScannerEventsToWeb, flushPendingRecommendPrompt, rememberCurrentWebUrl, replayNativeSttStatusToWeb, updateSafeAreaPalette, webUrl]);

  const handleLoadError = useCallback((event: WebViewLoadErrorEvent) => {
    if (!initialLoadSettledRef.current && activateWebFallback()) return;

    if (!initialLoadSettledRef.current) {
      initialLoadSettledRef.current = true;
      setStartupSplashVisible(false);
    }
    const description = event.nativeEvent.description || 'webview_load_failed';
    setLoadError(formatWebViewLoadError(description, webUrl));
  }, [activateWebFallback, webUrl]);

  const handleHttpError = useCallback((event: WebViewHttpStatusEvent) => {
    if (
      shouldFallbackHttpStatus(event.nativeEvent.statusCode)
      && !initialLoadSettledRef.current
      && !isPageReadyRef.current
      && activateWebFallback()
    ) {
      return;
    }
  }, [activateWebFallback]);

  const handleNavigationStateChange = useCallback((navigationState: { url: string; canGoBack?: boolean }) => {
    rememberCurrentWebUrl(navigationState.url);
    setCurrentWebPathname(parseWebPathname(navigationState.url));
    prepareBannerZoneTransition(navigationState.url);
    updateSafeAreaPalette(navigationState.url);
  }, [prepareBannerZoneTransition, rememberCurrentWebUrl, updateSafeAreaPalette]);

  useEffect(() => {
    if (versionGate.status === 'force_update' && !initialLoadSettledRef.current) {
      initialLoadSettledRef.current = true;
      setStartupSplashVisible(false);
    }
  }, [versionGate.status]);

  useEffect(() => {
    if (!shouldUseAggressiveWebViewCacheBypass || !webViewRef.current) {
      return;
    }

    webViewRef.current.clearCache(true);
  }, [shouldUseAggressiveWebViewCacheBypass, webViewMountToken]);

  return (
    <View style={[styles.root, { backgroundColor: safeAreaPalette.webViewColor }]}>
      {shouldRenderTopSafeAreaFill ? (
        <View
          pointerEvents="none"
          style={[
            styles.safeAreaTopFill,
            {
              height: iosTopSafeAreaHeight,
              backgroundColor: safeAreaPalette.topColor,
            },
          ]}
        />
      ) : null}
      <StatusBar barStyle={safeAreaPalette.statusBarStyle} />
      {/* iOS top-tap fallback is handled in web UI to avoid native overlay
          intercepting touches on WebView content. */}
      <View style={[styles.webViewContainer, { backgroundColor: safeAreaPalette.webViewColor }]}>
        {versionGate.status !== 'force_update' ? (
          <WebView
            key={`webview:${webViewMountToken}`}
            ref={webViewRef}
            source={webViewSource}
            originWhitelist={['*']}
            userAgent={Platform.OS === 'ios' ? IOS_SAFE_BROWSER_USER_AGENT : undefined}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled={!shouldUseAggressiveWebViewCacheBypass}
            cacheMode={Platform.OS === 'android' && shouldUseAggressiveWebViewCacheBypass ? 'LOAD_NO_CACHE' : 'LOAD_DEFAULT'}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            keyboardDisplayRequiresUserAction={false}
            setSupportMultipleWindows={false}
            scrollEnabled={Platform.OS !== 'ios' || !shouldDisableIosScroll}
            bounces={Platform.OS !== 'ios' || !shouldDisableIosScroll}
            hideKeyboardAccessoryView={shouldHideIosKeyboardAccessory}
            webviewDebuggingEnabled={shouldEnableNativeWebViewDebugging({
              isDebugBuild: __DEV__,
            })}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            injectedJavaScriptBeforeContentLoaded={nativeQaBridgeBootstrapScript}
            allowsBackForwardNavigationGestures={!isEdgeSwipeSuppressedByWeb && shouldEnableIosWebViewBackForwardNavigation({
              isIosPlatform: Platform.OS === 'ios',
              canGoBack: canWebViewGoBack,
              canGoForward: canWebViewGoForward,
              // Use the live WebView URL tracked via onNavigationStateChange/onMessage,
              // not the static source webUrl; after in-page SPA navigation the
              // source URL no longer reflects the current room/list state.
              currentUrl: lastWebViewUrlRef.current || webUrl,
            })}
            injectedJavaScript={WEBVIEW_NAVIGATION_BRIDGE_SCRIPT}
            onMessage={handleWebMessage}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={handleLoadError}
            onHttpError={handleHttpError}
            onNavigationStateChange={handleNavigationStateChange}
            style={[styles.webView, { backgroundColor: safeAreaPalette.webViewColor }]}
          />
        ) : (
          <View style={[styles.webView, { backgroundColor: safeAreaPalette.webViewColor }]} />
        )}
        {versionGate.status === 'force_update' ? (
          <View style={styles.versionOverlay}>
            <Text style={styles.versionTitle}>{versionGate.title}</Text>
            <Text style={styles.versionDescription}>{versionGate.message}</Text>
            {versionGate.latestVersion ? (
              <Text style={styles.versionMeta}>
                {versionGate.clientVersion || versionPolicyFallback.unknownVersionLabel} → {versionGate.latestVersion}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={versionPolicyFallback.updateNowA11y}
              onPress={handleForceUpdatePress}
              style={({ pressed }) => [
                styles.updateButton,
                pressed ? styles.updateButtonPressed : null,
              ]}
            >
              <Text style={styles.updateButtonText}>{versionGate.updateButtonLabel}</Text>
            </Pressable>
          </View>
        ) : null}
        {versionGate.status !== 'force_update' && loadError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>{versionPolicyFallback.webViewLoadFailedTitle}</Text>
            <Text style={styles.errorDescription}>{loadError}</Text>
          </View>
        ) : null}
      </View>
      {shouldRenderTopSafeAreaOverlay ? (
        <View
          pointerEvents="none"
          style={[
            styles.safeAreaTopOverlay,
            {
              height: iosTopSafeAreaHeight,
              backgroundColor: safeAreaPalette.topOverlayColor,
            },
          ]}
        />
      ) : null}
      {shouldRenderBottomSafeAreaFill ? (
        <View
          pointerEvents="none"
          style={[
            styles.safeAreaBottomFill,
            {
              height: safeAreaInsets.bottom,
              backgroundColor: safeAreaPalette.bottomColor,
            },
          ]}
        />
      ) : null}
      {startupSplashVisible ? (
        <View style={styles.startupSplashOverlay}>
          <Image
            alt=""
            source={STARTUP_SPLASH_LOGO}
            resizeMode="contain"
            fadeDuration={0}
            style={styles.startupSplashLogo}
          />
        </View>
      ) : null}
      {canRenderNativeBanner ? (
        <>
          <NativeAdBanner
            adModule={nativeAdModule}
            position="top"
            unitId={nativeBannerUnitId}
            heightPx={nativeBannerHeightPx}
            frameWidthPx={nativeBannerFrameWidthPx}
            topOffsetPx={nativeConversationListBannerTopOffsetPx}
            bottomOffsetPx={nativeConversationBannerBottomOffsetPx}
            ready={nativeAdsReady}
            reloadToken={nativeBannerReloadToken}
            hidden={shouldHideNativeBanners || activeBannerZone !== 'list'}
          />
          <NativeAdBanner
            adModule={nativeAdModule}
            position={nativeBannerPosition}
            unitId={nativeBannerUnitId}
            heightPx={nativeBannerHeightPx}
            frameWidthPx={nativeBannerFrameWidthPx}
            topOffsetPx={nativeConversationBannerTopOffsetPx}
            bottomOffsetPx={nativeConversationBannerBottomOffsetPx}
            ready={nativeAdsReady}
            reloadToken={nativeBannerReloadToken}
            hidden={shouldHideNativeBanners || activeBannerZone !== 'conversation' || isNativeMenuOverlayOpen}
          />
        </>
      ) : null}
      {qrScannerRequest ? (
        <NativeQrScanner
          requestConfig={qrScannerRequest}
          onClose={handleNativeQrClose}
          onRead={handleNativeQrRead}
        />
      ) : null}
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeAreaTopFill: {
    width: '100%',
  },
  safeAreaTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  safeAreaBottomFill: {
    width: '100%',
  },
  webViewContainer: {
    flex: 1,
  },
  iosTopTapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  startupSplashOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STARTUP_SPLASH_BACKGROUND,
    zIndex: 30,
  },
  startupSplashLogo: {
    width: 180,
    height: 180,
  },
  errorOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  errorTitle: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '700',
  },
  errorDescription: {
    color: '#d1d5db',
    fontSize: 12,
    lineHeight: 16,
  },
  versionOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  versionTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '700',
  },
  versionDescription: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 18,
  },
  versionMeta: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 16,
  },
  updateButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  updateButtonPressed: {
    opacity: 0.85,
  },
  updateButtonText: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '700',
  },
  nativeBannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeBannerSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nativeBannerDebugPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.7)',
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 12,
  },
  nativeBannerFallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
  },
  nativeBannerFallbackBadge: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    borderWidth: 1,
  },
  nativeBannerFallbackBadgeText: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  nativeBannerDebugTitle: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  nativeBannerDebugBody: {
    marginTop: 2,
    color: '#374151',
    fontSize: 11,
    textAlign: 'center',
  },
});

export default App;
