// Notifications sent by the Mingle team: no actor user, text in `body`.
export const TEAM_NOTIFICATION_TYPES = ["feedback_reply", "report_reply", "report_status"] as const;
export type TeamNotificationType = (typeof TEAM_NOTIFICATION_TYPES)[number];

// Everything the in-app notification list shows.
export const IN_APP_NOTIFICATION_TYPES = ["follow", ...TEAM_NOTIFICATION_TYPES] as const;

// The statuses a report_status notification is sent for (its `body`).
export const NOTIFIED_REPORT_STATUSES = ["resolved", "rejected"] as const;
export type NotifiedReportStatus = (typeof NOTIFIED_REPORT_STATUSES)[number];

export function isTeamNotificationType(value: unknown): value is TeamNotificationType {
  return TEAM_NOTIFICATION_TYPES.includes(value as TeamNotificationType);
}

export function isNotifiedReportStatus(value: unknown): value is NotifiedReportStatus {
  return NOTIFIED_REPORT_STATUSES.includes(value as NotifiedReportStatus);
}
