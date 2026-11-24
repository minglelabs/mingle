import type { Metadata } from 'next'
import { requireAdmin } from '@/server/admin/guard'
import { canDrawImagesHere } from '@/server/operator-avatars/generate'
import { listReferencePhotoViews } from '@/server/reference-library/view'
import { AdminPage, AdminPageHeader } from '../../_components/ui'
import { ReferenceLibrary } from './reference-library'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '레퍼런스 짤 · HashChat Admin',
  robots: { index: false, follow: false },
}

/** 레퍼런스 짤 저장소: photos new accounts' profile photos (and faceless accounts' first selfies) are drawn from. */
export default async function AdminReferenceLibraryPage() {
  await requireAdmin('/admin/operators/references')
  const items = await listReferencePhotoViews()
  return (
    <AdminPage wide>
      <AdminPageHeader
        title="레퍼런스 짤 저장소"
        back={{ href: '/admin/more', label: '더보기' }}
        description="여기 올린 사진으로 새 운영 계정의 프사를 만듭니다. 구도·포즈·옷·장소·분위기는 그대로, 얼굴은 다른 사람으로 바꿉니다. 프사에 얼굴이 없는 계정은 첫 셀카 글을 이 사진들로 만듭니다. 사진 한 장은 한 번만 씁니다."
      />
      <ReferenceLibrary initialItems={items} canDraw={canDrawImagesHere()} />
    </AdminPage>
  )
}
