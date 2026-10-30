import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getAdminContext } from '@/server/admin/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /admin/api/app-viewer?postId= — what the app's post "⋯" menu may offer
 * staff. `admin`: this browser holds an admin session (the app's web view
 * shares the operator tool's cookie). `staff`: the signed-in app account is a
 * staff notification target, so the menu can offer the admin login.
 * `operatorPost` is only reported to an admin.
 */
export async function GET(request: Request) {
  const postId = new URL(request.url).searchParams.get('postId')?.trim() ?? ''
  const [admin, session] = await Promise.all([getAdminContext(), getServerSession(getAuthOptions())])
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  const staff = userId
    ? Boolean(await prisma.adminNotifyTarget.findUnique({ where: { userId }, select: { userId: true } }))
    : false
  let operatorPost = false
  if (admin && postId) {
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { author: { select: { isOperator: true } } } })
    operatorPost = post?.author.isOperator === true
  }
  return NextResponse.json({ admin: Boolean(admin), staff, operatorPost }, { headers: { 'cache-control': 'no-store' } })
}
