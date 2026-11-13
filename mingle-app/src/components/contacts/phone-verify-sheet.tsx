"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { fillPhoneFriendsCopy, type PhoneFriendsCopy } from "@/i18n/phone-friends-copy";
import { buildClientApiPath } from "@/lib/api-contract";
import { useKeyboardInset } from "@/components/compose/compose-chrome";
import { PHONE_COUNTRIES, maskE164, normalizePhoneNumber, resolveDefaultPhoneCountry } from "@/lib/phone-number";

const RESEND_AFTER_MS = 30_000;

type Step = { kind: "phone" } | { kind: "code"; phone: string; sentAt: number };

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
  const [now, setNow] = useState(() => Date.now());
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const keyboardInset = useKeyboardInset();

  const phone = normalizePhoneNumber(number, country.callingCode);

  const errorText = useCallback((value: string | undefined) => (
    value === "invalid_phone" ? copy.errorPhone
      : value === "invalid_code" || value === "wrong_code" ? copy.errorCode
        : value === "too_many_requests" ? copy.errorTooMany
          : value === "unavailable" ? copy.errorUnavailable
            : copy.errorGeneric
  ), [copy]);

  const sendCode = useCallback(async (target: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(buildClientApiPath(sendPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: target, locale }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(errorText(body.error));
        return;
      }
      const sentAt = Date.now();
      setNow(sentAt);
      setStep({ kind: "code", phone: target, sentAt });
      setCode("");
      window.setTimeout(() => codeInputRef.current?.focus(), 50);
      // Lets "send again" appear without a timer running all the time.
      window.setTimeout(() => setNow(Date.now()), RESEND_AFTER_MS + 50);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, copy.errorGeneric, errorText, locale, sendPath]);

  const confirm = useCallback(async () => {
    if (busy || step.kind !== "code" || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmCode) {
        const failure = await confirmCode(step.phone, code);
        if (failure) {
          setError(errorText(failure));
          return;
        }
        onVerified(step.phone);
        return;
      }
      const response = await fetch(buildClientApiPath("/phone/verification/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: step.phone, code }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; phoneE164?: string };
      if (!response.ok || !body.phoneE164) {
        setError(errorText(body.error));
        return;
      }
      onVerified(body.phoneE164);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, code, confirmCode, copy.errorGeneric, errorText, onVerified, step]);

  const canResend = step.kind === "code" && now - step.sentAt >= RESEND_AFTER_MS;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={copy.sheetTitle}>
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={copy.close} onClick={onClose} />
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
            onClick={onClose}
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
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white transition active:bg-blue-700 disabled:opacity-40"
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
                className="flex h-12 min-w-[84px] shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 text-[15px] font-bold text-white transition active:bg-blue-700 disabled:opacity-40"
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
      </div>
    </div>
  );
}
