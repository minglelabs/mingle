export default function AdminDashboardLoading() {
  return (
    <div className="flex min-h-[60svh] w-full items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-500" role="status">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
        />
        불러오는 중...
      </div>
    </div>
  );
}
