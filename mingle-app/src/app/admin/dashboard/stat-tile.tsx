import { DashboardSpinner } from "./dashboard-spinner";

/** A summary number with its label and an optional note: the tiles of the growth, SNS and operator-post tabs. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="break-words text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {note ? <p className="mt-0.5 break-words text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

/**
 * A StatTile while its number loads, or after loading it failed, with the same lines so
 * nothing shifts when the number arrives. `note` keeps the note line: its text when it is
 * fixed, or "" for a note that comes with the number.
 */
export function StatTilePlaceholder({
  label,
  note,
  status = "loading",
}: {
  label: string;
  note?: string;
  status?: "loading" | "error";
}) {
  const isLoading = status === "loading";
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="break-words text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 flex h-7 items-center text-xl font-semibold text-slate-300">
        {isLoading ? (
          <>
            <DashboardSpinner />
            <span className="sr-only">불러오는 중</span>
          </>
        ) : "-"}
      </dd>
      {isLoading ? (
        note === undefined ? null : <p className="mt-0.5 break-words text-xs text-slate-500">{note || "\u00a0"}</p>
      ) : (
        <p className="mt-0.5 break-words text-xs text-rose-600" role="alert">불러오지 못했습니다</p>
      )}
    </div>
  );
}
