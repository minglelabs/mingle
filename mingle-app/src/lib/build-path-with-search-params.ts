export function buildPathWithSearchParams(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        nextSearchParams.append(key, entry);
      }
      continue;
    }

    if (typeof value === "string") {
      nextSearchParams.set(key, value);
    }
  }

  const nextSearch = nextSearchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function readSearchParamsRecord(
  search: string,
): Record<string, string | string[] | undefined> {
  const params = new URLSearchParams(search);
  const output: Record<string, string | string[] | undefined> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (values.length === 0) continue;
    output[key] = values.length === 1 ? values[0] : values;
  }

  return output;
}

export function buildPathWithCurrentSearchParams(pathname: string): string {
  if (typeof window === "undefined") {
    return pathname;
  }

  return buildPathWithSearchParams(
    pathname,
    readSearchParamsRecord(window.location.search || ""),
  );
}
