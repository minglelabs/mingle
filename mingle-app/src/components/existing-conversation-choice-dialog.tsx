"use client";

import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type ExistingConversationChoiceDialogProps = {
  title?: string;
  message?: string;
  createNewLabel?: string;
  continueLabel?: string;
  isPending: boolean;
  onCreateNew: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onDismiss: () => void;
};

export default function ExistingConversationChoiceDialog({
  title,
  message,
  createNewLabel,
  continueLabel,
  isPending,
  onCreateNew,
  onContinue,
  onDismiss,
}: ExistingConversationChoiceDialogProps) {
  const resolvedTitle = title ?? "You already have a conversation";
  const resolvedMessage = message ?? "You already have a room with these people.";
  const resolvedCreateNewLabel = createNewLabel ?? "Create new";
  const resolvedContinueLabel = continueLabel ?? "Continue";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="absolute inset-0 z-[110] flex items-center justify-center bg-black/40 px-5"
      onClick={() => {
        if (!isPending) onDismiss();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[19rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
      >
        <p className="text-sm font-semibold text-gray-900">{resolvedTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{resolvedMessage}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void onCreateNew()}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resolvedCreateNewLabel}
          </button>
          <button
            type="button"
            onClick={() => void onContinue()}
            disabled={isPending}
            autoFocus
            className="inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundImage: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)" }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : resolvedContinueLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
