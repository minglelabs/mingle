import type { Metadata, Viewport } from "next";
import { getServerSession } from "next-auth";
import { Analytics } from "@vercel/analytics/next";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { preconnect } from "react-dom";
import { Toaster } from "sonner";
import AppLocalePreferenceSync from "@/components/app-locale-preference-sync";
import CoinHost from "@/components/coins/coin-host";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import MobileCanvasShell from "@/components/mobile-canvas-shell";
import NativeBannerRouteGuard from "@/components/native-banner-route-guard";
import UiDiagnosticsProbe from "@/components/ui-diagnostics-probe";
import {
  DeferredNativeConversationShareOverlay,
  DeferredNativeProfileLinkOverlay,
} from "@/components/deferred-native-overlays";
import NativePushTapReceiver from "@/components/native-push-tap-receiver";
import WebViewStateRestore from "@/components/webview-state-restore";
import RouteTransitionCurtain from "@/components/route-transition-curtain";
import PostHogAnalyticsProvider from "@/components/posthog-analytics-provider";
import { DeviceAudioCaptureSwitchProvider } from "@/context/device-audio-capture-switch";
import { TtsSettingsProvider } from "@/context/tts-settings";
import { getAuthOptions } from "@/lib/auth-options";
import { resolveDeviceAudioCaptureSwitch } from "@/lib/device-audio-capture-switch";
import { MOBILE_CANVAS_BOOTSTRAP_SCRIPT } from "@/lib/mobile-canvas-bootstrap";
import { resolvePostHogBrowserConfig } from "@/lib/posthog-browser-config";
import { DEFAULT_LOCALE } from "@/i18n";
import "./globals.css";

function toMetadataBaseUrl(raw?: string): URL | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(normalized);
  } catch {
    return undefined;
  }
}

const metadataBase =
  toMetadataBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  toMetadataBaseUrl(process.env.NEXTAUTH_URL) ??
  toMetadataBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  toMetadataBaseUrl(process.env.VERCEL_URL);

const TOAST_BOTTOM_OFFSET = "calc(env(safe-area-inset-bottom, 0px) + 108px)";

// Vercel Analytics loads /_vercel/insights/script.js, which only Vercel's edge
// serves. Elsewhere (Railway) that request renders a 404 page on the server on
// every launch, competing with the first screen's own requests.
const VERCEL_ANALYTICS_ENABLED = process.env.VERCEL === "1";

/** Origin of the public profile-image bucket (avatars on the first screen). */
function resolveProfileImageOrigin(): string | null {
  const raw = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim() || process.env.R2_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  metadataBase,
  title: "HashChat, Seamless Translator",
  description: "Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "HashChat, Seamless Translator",
    description: "Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HashChat - Seamless Translator",
      },
    ],
    type: "website",
    siteName: "HashChat",
  },
  twitter: {
    card: "summary_large_image",
    title: "HashChat, Seamless Translator",
    description: "Just stay in the conversation. HashChat lets you talk without translating sentence by sentence.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getServerSession(getAuthOptions());
  const postHogConfig = resolvePostHogBrowserConfig();
  // Read per request (this layout is dynamic: the session reads cookies), so a
  // Railway env change turns device-audio capture off without a store release.
  const deviceAudioCaptureSwitch = resolveDeviceAudioCaptureSwitch();
  const profileImageOrigin = resolveProfileImageOrigin();
  // The first cards' avatars come from this origin: open its connection while
  // the page's scripts load instead of after the feed answers.
  if (profileImageOrigin) preconnect(profileImageOrigin);

  return (
    <html lang={DEFAULT_LOCALE} suppressHydrationWarning>
      <body className="antialiased">
        <script
          id="mingle-mobile-canvas-bootstrap"
          dangerouslySetInnerHTML={{ __html: MOBILE_CANVAS_BOOTSTRAP_SCRIPT }}
        />
        <AppLocalePreferenceSync />
        <TtsSettingsProvider>
          <AuthSessionProvider session={session}>
            <PostHogAnalyticsProvider
              projectToken={postHogConfig?.projectToken ?? null}
              host={postHogConfig?.host ?? null}
            >
              <MobileCanvasShell>
                <DeviceAudioCaptureSwitchProvider value={deviceAudioCaptureSwitch}>
                  {children}
                </DeviceAudioCaptureSwitchProvider>
                <DeferredNativeProfileLinkOverlay />
                <DeferredNativeConversationShareOverlay />
                <CoinHost />
                <NativePushTapReceiver />
                <NativeBannerRouteGuard />
                <UiDiagnosticsProbe />
                <WebViewStateRestore />
                <RouteTransitionCurtain />
              </MobileCanvasShell>
              <Toaster
                position="bottom-center"
                closeButton={false}
                offset={{ bottom: TOAST_BOTTOM_OFFSET }}
                mobileOffset={{ bottom: TOAST_BOTTOM_OFFSET }}
                icons={{
                  success: (
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ),
                  error: (
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  ),
                  loading: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
                }}
                toastOptions={{
                  classNames: {
                    toast: "!rounded-full !border !border-gray-200 !bg-white !px-4 !py-2.5 !shadow-[0_4px_16px_rgba(15,23,42,0.14),0_1px_4px_rgba(15,23,42,0.07)] !gap-2 !min-h-0",
                    content: "!flex !items-center !gap-2",
                    title: "!text-[14px] !font-medium !text-gray-800",
                    icon: "!m-0 !h-auto !w-auto",
                    success: "!text-gray-800",
                    error: "!text-gray-800",
                    loading: "!text-gray-800",
                    default: "!text-gray-800",
                  },
                  duration: 2200,
                }}
              />
            </PostHogAnalyticsProvider>
          </AuthSessionProvider>
        </TtsSettingsProvider>
        {VERCEL_ANALYTICS_ENABLED ? <Analytics /> : null}
      </body>
    </html>
  );
}
