import { buildPathWithSearchParams } from "@/lib/build-path-with-search-params";
import { redirect } from "next/navigation";

type V110HomeEntryProps = {
  locale: string;
  searchParams: Record<string, string | string[] | undefined>;
};

export default function V110HomeEntry({ locale, searchParams }: V110HomeEntryProps): never {
  redirect(buildPathWithSearchParams(`/${locale}/conversations`, searchParams));
}
