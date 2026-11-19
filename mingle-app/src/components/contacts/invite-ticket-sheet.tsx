"use client";

import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import InviteTicketPanel, { useOwnInviteTicket } from "@/components/contacts/invite-ticket-panel";
import { resolveInviteTicketCopy } from "@/i18n/invite-ticket-copy";

type InviteTicketSheetProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
};

/**
 * "Send a friend an invite ticket" as a quick bottom sheet (chat list, friend
 * invite screen). The invite page on My Page shows the same panel.
 */
export default function InviteTicketSheet({ open, onClose, locale }: InviteTicketSheetProps) {
  const { data: session } = useSession();
  const copy = useMemo(() => resolveInviteTicketCopy(locale), [locale]);
  const [ticket] = useOwnInviteTicket(open);
  const senderName = session?.user?.name?.trim() || copy.userFallback;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={copy.sendTicket}>
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={copy.sendTicket} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-[28px] bg-white px-5 pt-5 text-slate-950 shadow-[0_-18px_50px_rgba(15,23,42,0.22)]"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">{copy.sendTicket}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition active:bg-gray-100"
            aria-label={copy.sendTicket}
          >
            <X size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <InviteTicketPanel locale={locale} ticket={ticket} senderName={senderName} />
      </div>
    </div>
  );
}
