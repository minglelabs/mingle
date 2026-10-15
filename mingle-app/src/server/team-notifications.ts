import { prisma } from "@/lib/prisma";
import type { TeamNotificationType } from "@/lib/user-notification-types";
import { sendPushNotificationForUserNotification } from "@/server/push-notifications";

// Tells a user that the Mingle team answered their feedback or handled their
// report: one row in the in-app notification list plus a push. Never throws,
// so the admin action that triggered it is not affected.
export async function notifyUserFromTeam(args: {
  recipientId: string;
  type: TeamNotificationType;
  // Reply text, or the new status for report_status.
  body: string;
  // The feedback or report id.
  targetId: string;
}): Promise<void> {
  let notificationId: string;
  try {
    const notification = await prisma.userNotification.create({
      data: {
        recipientId: args.recipientId,
        type: args.type,
        body: args.body,
        targetId: args.targetId,
      },
      select: { id: true },
    });
    notificationId = notification.id;
  } catch (error) {
    console.error("[team-notification] create failed", args.type, error instanceof Error ? error.name : "unknown");
    return;
  }

  try {
    await sendPushNotificationForUserNotification(notificationId);
  } catch (error) {
    console.error("[team-notification] push failed", args.type, error instanceof Error ? error.name : "unknown");
  }
}
