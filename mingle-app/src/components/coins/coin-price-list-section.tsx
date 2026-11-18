"use client";

import { Camera, Check, Keyboard, Mic, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import HashSeedIcon from "@/components/coins/hash-seed-icon";
import type { CoinCopy } from "@/i18n/coin-copy";
import { fillCoinCopy } from "@/i18n/coin-copy";
import { formatCoinPrice, type CoinPriceList } from "@/lib/coin-price-list";

function PriceRow(props: { icon: ReactNode; label: string; note?: string; price: ReactNode; unit?: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600" aria-hidden="true">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-slate-900">{props.label}</p>
        {props.note ? <p className="mt-0.5 text-[12px] leading-snug text-gray-500">{props.note}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="flex items-center justify-end gap-1 text-[15px] font-bold tabular-nums text-slate-900">{props.price}</p>
        {props.unit ? <p className="mt-0.5 text-[11px] text-gray-500">{props.unit}</p> : null}
      </div>
    </li>
  );
}

/**
 * The store's price list: what each paid feature costs at today's rates, and
 * what is free. Read top to bottom by someone deciding whether Hash runs out.
 */
export default function CoinPriceListSection(props: { copy: CoinCopy; priceList: CoinPriceList; locale: string }) {
  const { copy, priceList, locale } = props;
  const amount = (value: number) => (
    <>
      <HashSeedIcon size={14} />
      {formatCoinPrice(value, locale)}
    </>
  );
  const free = [copy.freeCall, copy.freeSend, copy.freeSameLanguage, copy.freeReading];

  return (
    <section data-qa="coin-price-list" aria-labelledby="coin-price-list-title" className="rounded-2xl border border-gray-200 px-4 pt-3.5 pb-1">
      <h3 id="coin-price-list-title" className="text-[15px] font-bold text-slate-900">{copy.priceTitle}</h3>
      <ul className="divide-y divide-gray-100">
        <PriceRow
          icon={<Mic size={16} strokeWidth={2.3} />}
          label={copy.priceVoice}
          note={copy.priceVoiceNote}
          price={amount(priceList.voicePerMinute)}
          unit={copy.pricePerMinute}
        />
        <PriceRow
          icon={<Volume2 size={16} strokeWidth={2.3} />}
          label={copy.priceReadAloud}
          note={fillCoinCopy(copy.priceReadAloudNote, { coins: formatCoinPrice(priceList.readAloudPerAudioMinute, locale) })}
          price={<>~{amount(priceList.readAloudPerConversationMinute)}</>}
          unit={copy.pricePerConversationMinute}
        />
        <PriceRow
          icon={<Keyboard size={16} strokeWidth={2.3} />}
          label={copy.priceTyped}
          note={copy.priceTypedNote}
          price={amount(priceList.typedMessage)}
          unit={copy.pricePerMessage}
        />
        <PriceRow
          icon={<Camera size={16} strokeWidth={2.3} />}
          label={copy.pricePhoto}
          price={<span className="text-[12px] font-semibold text-gray-600">{copy.pricePhotoValue}</span>}
        />
      </ul>
      <div className="border-t border-gray-100 py-3">
        <p className="text-[13px] font-bold text-emerald-700">{copy.freeTitle}</p>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {free.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-slate-700">
              <Check size={14} strokeWidth={2.6} className="mt-[1px] shrink-0 text-emerald-600" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-gray-100 py-3 text-[12px] leading-relaxed text-gray-500">{copy.priceWhoPays}</p>
    </section>
  );
}
