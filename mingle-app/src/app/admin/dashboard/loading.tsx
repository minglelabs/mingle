export default function AdminDashboardLoading() {
  return (
    <main className="flex h-svh w-full items-center justify-center bg-[#f9f9f7] text-[#0b0b0b]">
      <div className="flex items-center gap-3 text-sm font-medium text-[#52514e]">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#e5e3dc] border-t-[#f59e0b]"
        />
        불러오는 중...
      </div>
    </main>
  );
}
