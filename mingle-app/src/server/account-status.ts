export type AccountStatusCode = "active" | "deactivated" | "withdrawal_pending" | "deleted";

export type AccountStatusFields = {
  isActive: boolean;
  isDeleted: boolean | null;
  deactivatedAt: Date | null;
  withdrawnAt: Date | null;
  deletedAt: Date | null;
};

export function resolveAccountStatus(user: AccountStatusFields): AccountStatusCode {
  if (user.isDeleted === true || user.deletedAt !== null) return "deleted";
  if (user.withdrawnAt !== null) return "withdrawal_pending";
  if (!user.isActive) return "deactivated";
  return "active";
}
