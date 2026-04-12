import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import { redirect } from "next/navigation";

type LegacyConversationsEntryProps = {
  locale: string;
  searchParams: Record<string, string | string[] | undefined>;
};

export default function LegacyConversationsEntry({
  locale,
  searchParams,
}: LegacyConversationsEntryProps): never {
  redirect(buildPathWithSearchParams(`/${locale}`, searchParams));
}
