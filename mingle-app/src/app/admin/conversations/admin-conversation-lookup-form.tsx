"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { adminButtonClassName, adminInputClassName } from "../_components/ui";

type AdminConversationLookupFormProps = {
  defaultUserId: string;
};

export function AdminConversationLookupForm({ defaultUserId }: AdminConversationLookupFormProps) {
  const router = useRouter();
  const [userId, setUserId] = useState(defaultUserId);

  useEffect(() => {
    setUserId(defaultUserId);
  }, [defaultUserId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    const query = new URLSearchParams({ userId: normalizedUserId });
    router.replace(`/admin/conversations?${query.toString()}`);
  };

  return (
    <form className="mb-4 flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" onSubmit={handleSubmit} role="search">
      <input
        aria-label="외부 사용자 ID"
        autoCapitalize="none"
        autoCorrect="off"
        className={`${adminInputClassName} flex-1`}
        name="userId"
        onChange={(event) => setUserId(event.target.value)}
        placeholder="외부 사용자 ID"
        required
        spellCheck={false}
        value={userId}
      />
      <button className={adminButtonClassName({ variant: "primary", className: "shrink-0" })} type="submit">
        <Search className="h-4 w-4" aria-hidden="true" />
        조회
      </button>
    </form>
  );
}
