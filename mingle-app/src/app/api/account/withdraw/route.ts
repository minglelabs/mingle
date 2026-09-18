import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const WITHDRAWAL_GRACE_PERIOD_DAYS = 30;

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const normalizedUserId = typeof session.user.id === "string"
    ? session.user.id.trim()
    : "";
  const normalizedEmail = typeof session.user.email === "string"
    ? session.user.email.trim().toLowerCase()
    : "";

  let updatedUsers = 0;
  const now = new Date();
  const scheduledDeleteAt = new Date(now.getTime() + WITHDRAWAL_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  if (normalizedUserId) {
    try {
      await prisma.user.update({
        where: { id: normalizedUserId },
        data: {
          isActive: false,
          deactivatedAt: now,
          withdrawnAt: now,
          scheduledDeleteAt,
        },
      });
      updatedUsers = 1;
    } catch {
      // User might be resolved by email fallback if ID lookup fails
    }
  }

  if (updatedUsers === 0 && normalizedEmail) {
    const result = await prisma.user.updateMany({
      where: { email: normalizedEmail },
      data: {
        isActive: false,
        deactivatedAt: now,
        withdrawnAt: now,
        scheduledDeleteAt,
      },
    });
    updatedUsers = result.count;
  }

  if (updatedUsers === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, updatedUsers });
}
