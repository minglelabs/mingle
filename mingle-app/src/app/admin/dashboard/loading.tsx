export default function AdminDashboardLoading() {
  return (
    <main className="flex h-svh w-full items-center justify-center bg-[#f8fafc] text-slate-950">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950"
        />
        불러오는 중...
      </div>
    </main>
  );
}
