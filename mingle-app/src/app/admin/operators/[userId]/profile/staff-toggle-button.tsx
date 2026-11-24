'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

const TARGETS_API = '/admin/settings/api/notify-targets'

const ERROR_COPY: Record<string, string> = {
  operator_account: '운영 계정은 운영진이 될 수 없어요.',
  inactive_account: '탈퇴·정지된 계정이에요.',
  guest_account: '가입하지 않은 게스트 계정이에요.',
  not_found: '계정을 찾지 못했어요.',
}

/**
 * 운영진 지정 for a real user: adds them to the staff accounts (알림 설정's list), so
 * their app account gets inbox alerts, the staff menu and staff-only stats. Again to undo.
 */
export function StaffToggleButton({ userId, handle, initialStaff }: { userId: string; handle: string; initialStaff: boolean }) {
  const [staff, setStaff] = useState(initialStaff)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (staff && !window.confirm(`@${handle} 운영진 지정을 해제할까요?`)) return
    if (!staff && !window.confirm(`@${handle}을(를) 운영진으로 지정할까요? 인박스 알림과 운영진 메뉴가 이 계정에 열립니다.`)) return
    setPending(true)
    setError(null)
    try {
      const response = staff
        ? await fetch(`${TARGETS_API}/${encodeURIComponent(userId)}`, { method: 'DELETE', cache: 'no-store' })
        : await fetch(TARGETS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }), cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'failed')
      setStaff(!staff)
    } catch (caught) {
      setError(ERROR_COPY[(caught as Error).message] ?? '바꾸지 못했어요. 다시 눌러 주세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-60 ${staff ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        {staff ? '운영진 · 해제' : '운영진으로 지정'}
      </button>
      {error ? <span role="status" className="text-xs text-rose-600">{error}</span> : null}
    </span>
  )
}
