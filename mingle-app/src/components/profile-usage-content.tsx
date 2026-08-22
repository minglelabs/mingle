"use client";

import { buildClientApiPath } from "@/lib/api-contract";
import LanguageFlag from "@/components/language-flag";
import {
  canonicalizeSttLanguageCode,
  getSttLanguageDisplayName,
} from "@/lib/stt-languages";
import type { AppLocale } from "@/i18n";
import { resolveLegalDocumentLocale } from "@/i18n/config";
import type { ProfileUsageCopy } from "@/i18n/profile-management-copy";
import { BarChart3, Clock3, Loader2, MessageCircle, MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";

type UsageLanguageBreakdown = {
  language: string;
  usageSec: number;
  messageCount: number;
};

type UsageSummary = {
  totalUsageSec: number;
  messageCount: number;
  conversationCount: number;
  speechLanguages: UsageLanguageBreakdown[];
  translationLanguages: UsageLanguageBreakdown[];
};

function formatCount(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(resolveLegalDocumentLocale(locale)).format(Math.max(0, Math.floor(value)));
}

function formatDuration(value: number, locale: AppLocale): string {
  const displayLocale = resolveLegalDocumentLocale(locale);
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const formatUnit = (amount: number, unit: "hour" | "minute" | "second") => (
    new Intl.NumberFormat(displayLocale, { style: "unit", unit, unitDisplay: "short" }).format(amount)
  );
  if (hours > 0) return minutes > 0 ? `${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")}` : formatUnit(hours, "hour");
  if (minutes > 0) return seconds > 0 ? `${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}` : formatUnit(minutes, "minute");
  return formatUnit(seconds, "second");
}

function getLanguageLabel(language: string, locale: AppLocale, unknownLabel: string): string {
  const normalized = canonicalizeSttLanguageCode(language);
  return normalized
    ? getSttLanguageDisplayName(normalized, resolveLegalDocumentLocale(locale)) ?? normalized
    : language === "unknown" ? unknownLabel : language;
}

function UsageMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-gray-500">
        {icon}
        <span className="truncate text-[11px] font-semibold">{label}</span>
      </div>
      <p className="truncate text-[17px] font-bold text-slate-950">{value}</p>
    </div>
  );
}

function LanguageBreakdownSection({
  rows,
  locale,
  copy,
  showUsage,
}: {
  rows: UsageLanguageBreakdown[];
  locale: AppLocale;
  copy: ProfileUsageCopy;
  showUsage: boolean;
}) {
  return rows.length === 0 ? (
    <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500">{copy.noData}</p>
  ) : (
    <ul className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      {rows.map((row, index) => {
        const normalized = canonicalizeSttLanguageCode(row.language);
        return (
          <li
            key={`${row.language}-${index}`}
            className={`flex items-center gap-3 px-4 py-3.5 ${index < rows.length - 1 ? "border-b border-gray-100" : ""}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-[20px]" aria-hidden="true">
              {normalized ? <LanguageFlag language={normalized} className="text-[20px] leading-none" /> : "🌐"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-900">
              {getLanguageLabel(row.language, locale, copy.unknownLanguage)}
            </span>
            <span className="shrink-0 text-right text-[12px] font-medium text-gray-500">
              {showUsage ? `${formatDuration(row.usageSec, locale)} · ` : ""}
              {formatCount(row.messageCount, locale)} {copy.messageCountSuffix}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function ProfileUsageContent({
  uiLocale,
  copy,
}: {
  uiLocale: AppLocale;
  copy: ProfileUsageCopy;
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void fetch(buildClientApiPath("/profile/usage"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("usage_load_failed");
        return response.json() as Promise<UsageSummary>;
      })
      .then((data) => {
        if (cancelled) return;
        setUsage(data);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center pt-8 text-gray-400">
        <Loader2 size={24} className="animate-spin" aria-label={copy.title} />
      </div>
    );
  }

  if (loadState === "error" || !usage) {
    return <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[13px] text-gray-500" role="alert">{copy.loadError}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <UsageMetric
          icon={<Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />}
          label={copy.totalUsage}
          value={formatDuration(usage.totalUsageSec, uiLocale)}
        />
        <UsageMetric
          icon={<MessageCircle size={15} strokeWidth={2.2} aria-hidden="true" />}
          label={copy.messages}
          value={formatCount(usage.messageCount, uiLocale)}
        />
        <UsageMetric
          icon={<MessagesSquare size={15} strokeWidth={2.2} aria-hidden="true" />}
          label={copy.conversations}
          value={formatCount(usage.conversationCount, uiLocale)}
        />
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 size={17} strokeWidth={2.1} className="text-gray-500" aria-hidden="true" />
          <h3 className="text-[14px] font-bold text-slate-900">{copy.speechLanguages}</h3>
        </div>
        <LanguageBreakdownSection
          rows={usage.speechLanguages}
          locale={uiLocale}
          copy={copy}
          showUsage
        />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <MessageCircle size={17} strokeWidth={2.1} className="text-gray-500" aria-hidden="true" />
          <h3 className="text-[14px] font-bold text-slate-900">{copy.translationLanguages}</h3>
        </div>
        <LanguageBreakdownSection
          rows={usage.translationLanguages}
          locale={uiLocale}
          copy={copy}
          showUsage={false}
        />
      </section>
    </div>
  );
}
