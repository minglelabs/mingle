"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    <form className="mb-4 flex gap-2 rounded-xl border border-[#e5e3dc] bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
      <input
        name="userId"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        placeholder="external user ID"
        className="min-w-0 flex-1 rounded-md border border-[#d9d6ce] px-3 py-2 text-sm"
        required
      />
      <button className="rounded-md bg-[#0b0b0b] px-4 py-2 text-sm font-semibold text-white" type="submit">
        조회
      </button>
    </form>
  );
}
