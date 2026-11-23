"use client";

import { Loader2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureMingleClientEvent } from "@/lib/posthog-client";
import { fillPhoneFriendsCopy, type PhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { resolveSignInMethodsCopy } from "@/i18n/sign-in-methods-copy";
import { resolveDeviceIdentityHeaders } from "@/lib/native-device-identity";
import { useKeyboardInset } from "@/components/compose/compose-chrome";
import { PHONE_COUNTRIES, maskE164, normalizePhoneNumber, resolveDefaultPhoneCountry } from "@/lib/phone-number";

const RESEND_AFTER_MS = 30_000;

type Step = { kind: "phone" } | { kind: "code"; phone: string; sentAt: number };

/** Fired on `window` when this account's number was just verified (detail: the E.164 number). */
export const PHONE_VERIFIED_EVENT = "mingle:phone-verified";

function announcePhoneVerified(phoneE164: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHONE_VERIFIED_EVENT, { detail: phoneE164 }));
}

/**
 * Proves the user's own phone number with a 6-digit SMS code: pick the
 * country, type the number, get the code, type it. Resolves the verified
 * E.164 number through `onVerified`.
 *
 * Sign-in uses the same sheet: `sendPath` "/phone/sign-in" texts a code with
 * no account, and `confirmCode` checks it (signing in) instead of saving the
 * number to the current account; it resolves an error code, or null.
 */
export default function PhoneVerifySheet({
  copy,
  locale,
  onClose,
  onVerified,
  sendPath = "/phone/verification",
  confirmCode,
}: {
  copy: PhoneFriendsCopy;
  locale: string;
  onClose: () => void;
  onVerified: (phoneE164: string) => void;
  sendPath?: "/phone/verification" | "/phone/sign-in";
  confirmCode?: (phoneE164: string, code: string) => Promise<string | null>;
}) {
  const defaultCountry = useMemo(() => resolveDefaultPhoneCountry(locale), [locale]);
  const [countryIso, setCountryIso] = useState(defaultCountry.iso);
  const country = PHONE_COUNTRIES.find((entry) => entry.iso === countryIso) ?? defaultCountry;
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchedNotice, setSwitchedNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const keyboardInset = useKeyboardInset();
  const { update: renewSession } = useSession();

  const phone = normalizePhoneNumber(number, country.callingCode);

  // Each step goes to PostHog as `mingle_phone_auth` (owner, 2026-11-23: new
  // users drop off at the code step). Never the number, only its country.
  const flow = sendPath === "/phone/sign-in" ? "sign_in" : "verify";
  const lastFailureRef = useRef<string | null>(null);
  const track = useCallback((stepName: string, extra?: Record<string, string | number | null>) => {
    captureMingleClientEvent("mingle_phone_auth", { flow, step: stepName, country: countryIso, ...extra });
  }, [countryIso, flow]);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);
  useEffect(() => {
    trackRef.current("opened");
  }, []);

  const errorText = useCallback((value: string | undefined) => (
    value === "invalid_phone" ? copy.errorPhone
      : value === "invalid_code" || value === "wrong_code" ? copy.errorCode
        : value === "too_many_requests" ? copy.errorTooMany
          : value === "unavailable" ? copy.errorUnavailable
            : value === "phone_in_use" ? copy.errorInUse
              : value === "blocked" ? copy.errorBlocked
                : copy.errorGeneric
  ), [copy]);

  const sendCode = useCallback(async (target: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    track("code_requested", { resend: step.kind === "code" ? 1 : 0 });
    try {
      const response = await fetch(buildClientApiPath(sendPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: target, locale }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        lastFailureRef.current = body.error ?? `http_${response.status}`;
        track("code_send_failed", { reason: lastFailureRef.current, http_status: response.status });
        setError(errorText(body.error));
        return;
      }
      lastFailureRef.current = null;
      track("code_sent");
      const sentAt = Date.now();
      setNow(sentAt);
      setStep({ kind: "code", phone: target, sentAt });
      setCode("");
      window.setTimeout(() => codeInputRef.current?.focus(), 50);
      // Lets "send again" appear without a timer running all the time.
      window.setTimeout(() => setNow(Date.now()), RESEND_AFTER_MS + 50);
    } catch {
      lastFailureRef.current = "network";
      track("code_send_failed", { reason: "network", http_status: null });
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, copy.errorGeneric, errorText, locale, sendPath, step.kind, track]);

  const confirm = useCallback(async () => {
    if (busy || step.kind !== "code" || code.length !== 6) return;
    setBusy(true);
    setError(null);
    track("code_submitted");
    try {
      if (confirmCode) {
        const failure = await confirmCode(step.phone, code);
        if (failure) {
          lastFailureRef.current = failure;
          track("code_rejected", { reason: failure });
          setError(errorText(failure));
          return;
        }
        lastFailureRef.current = null;
        track("verified");
        announcePhoneVerified(step.phone);
        onVerified(step.phone);
        return;
      }
      const response = await fetch(buildClientApiPath("/phone/verification/confirm"), {
        method: "POST",
        // The device headers let the server apply the one-account rules for this phone.
        headers: { "Content-Type": "application/json", ...(await resolveDeviceIdentityHeaders()) },
        body: JSON.stringify({ phone: step.phone, code }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; phoneE164?: string; switched?: boolean };
      if (!response.ok || !body.phoneE164) {
        lastFailureRef.current = body.error ?? `http_${response.status}`;
        track("code_rejected", { reason: lastFailureRef.current });
        setError(errorText(body.error));
        return;
      }
      lastFailureRef.current = null;
      track("verified", { switched: body.switched ? 1 : 0 });
      if (body.switched) {
        // The number (or this device) already had an account: this sign-in was
        // folded into it. Renew the session so it becomes that account's, then
        // start the app over as that account.
        setSwitchedNotice(resolveSignInMethodsCopy(locale).switched);
        await renewSession({}).catch(() => null);
        // Long enough to read the one line before the app starts over.
        await new Promise((resolve) => setTimeout(resolve, 1600));
        window.location.reload();
        return;
      }
      announcePhoneVerified(body.phoneE164);
      onVerified(body.phoneE164);
    } catch {
      lastFailureRef.current = "network";
      track("code_rejected", { reason: "network" });
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, code, confirmCode, copy.errorGeneric, errorText, locale, onVerified, renewSession, step, track]);

  // Closing the sheet without finishing: where it was left, and the last failure seen.
  const close = useCallback(() => {
    track("closed", { at: step.kind, last_failure: lastFailureRef.current });
    onClose();
  }, [onClose, step.kind, track]);

  const canResend = step.kind === "code" && now - step.sentAt >= RESEND_AFTER_MS;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={copy.sheetTitle}>
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={copy.close} onClick={close} />
      <div
        className="relative w-full max-w-[520px] rounded-t-[1.6rem] bg-white px-5 pt-4 text-slate-950"
        style={{
          // Above the keyboard while typing; the safe area only when it is closed.
          marginBottom: keyboardInset,
          paddingBottom: keyboardInset > 0 ? 16 : "calc(20px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold">{copy.sheetTitle}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{copy.sheetBody}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={copy.close}
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
          >
            <X size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (phone) void sendCode(phone);
          }}
        >
          <select
            value={countryIso}
            onChange={(event) => {
              setCountryIso(event.target.value);
              setStep({ kind: "phone" });
              setError(null);
            }}
            aria-label={copy.countryLabel}
            disabled={busy}
            className="h-12 w-[92px] shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-2 text-[15px] outline-none focus:border-slate-400"
          >
            {PHONE_COUNTRIES.map((entry) => (
              <option key={entry.iso} value={entry.iso}>{`${entry.iso} +${entry.callingCode}`}</option>
            ))}
          </select>
          <input
            value={number}
            onChange={(event) => {
              setNumber(event.target.value.replace(/[^\d\s()+-]/g, "").slice(0, 24));
              if (step.kind === "code") setStep({ kind: "phone" });
              setError(null);
            }}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={country.example}
            aria-label={copy.phoneLabel}
            dir="ltr"
            className="h-12 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-[16px] outline-none placeholder:text-gray-400 focus:border-slate-400"
          />
        </form>

        {step.kind === "phone" ? (
          <button
            type="button"
            disabled={!phone || busy}
            onClick={() => { if (phone) void sendCode(phone); }}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FBBC32] text-[15px] font-bold text-slate-950 transition active:bg-[#F5A623] disabled:opacity-40"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
            {copy.sendCode}
          </button>
        ) : (
          <>
            <p className="mt-3 text-[13px] text-gray-500" dir="auto">
              {fillPhoneFriendsCopy(copy.codeSent, { phone: maskE164(step.phone) })}
            </p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              <input
                ref={codeInputRef}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={copy.codeLabel}
                aria-label={copy.codeLabel}
                maxLength={6}
                className="h-12 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 font-mono text-[18px] tracking-[0.3em] outline-none placeholder:font-sans placeholder:text-[15px] placeholder:tracking-normal placeholder:text-gray-400 focus:border-slate-400"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="flex h-12 min-w-[84px] shrink-0 items-center justify-center rounded-xl bg-[#FBBC32] px-4 text-[15px] font-bold text-slate-950 transition active:bg-[#F5A623] disabled:opacity-40"
              >
                {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : copy.confirm}
              </button>
            </form>
            {canResend ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendCode(step.phone)}
                className="mt-2 h-10 text-[13.5px] font-semibold text-blue-600 disabled:opacity-40"
              >
                {copy.resendCode}
              </button>
            ) : null}
          </>
        )}
        {error ? <p className="mt-2 text-[13px] text-rose-600" role="alert">{error}</p> : null}
        {switchedNotice ? <p className="mt-2 text-[13px] font-semibold text-slate-800" role="status" data-qa="phone-switched-notice">{switchedNotice}</p> : null}
      </div>
    </div>
  );
}
