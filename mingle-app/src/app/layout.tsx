import type { Metadata, Viewport } from "next";
import { getServerSession } from "next-auth";
import { Analytics } from "@vercel/analytics/next";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import AppLocalePreferenceSync from "@/components/app-locale-preference-sync";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import MobileCanvasShell from "@/components/mobile-canvas-shell";
import NativeProfileLinkOverlay from "@/components/native-profile-link-overlay";
import PostHogAnalyticsProvider from "@/components/posthog-analytics-provider";
import { TtsSettingsProvider } from "@/context/tts-settings";
import { getAuthOptions } from "@/lib/auth-options";
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

export const metadata: Metadata = {
  metadataBase,
  title: "Mingle, Seamless Translator",
  description: "Just stay in the conversation. Mingle lets you talk without translating sentence by sentence.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Mingle, Seamless Translator",
    description: "Just stay in the conversation. Mingle lets you talk without translating sentence by sentence.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mingle - Seamless Translator",
      },
    ],
    type: "website",
    siteName: "Mingle",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mingle, Seamless Translator",
    description: "Just stay in the conversation. Mingle lets you talk without translating sentence by sentence.",
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

  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="antialiased">
        <AppLocalePreferenceSync />
        <TtsSettingsProvider>
          <AuthSessionProvider session={session}>
            <PostHogAnalyticsProvider
              projectToken={postHogConfig?.projectToken ?? null}
              host={postHogConfig?.host ?? null}
            >
              <MobileCanvasShell>
                {children}
                <NativeProfileLinkOverlay />
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
        <Analytics />
      </body>
    </html>
  );
}
