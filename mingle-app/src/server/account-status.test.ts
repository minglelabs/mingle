import { describe, expect, it } from "vitest";
import { resolveAccountStatus } from "@/server/account-status";

const activeUser = {
  isActive: true,
  isDeleted: false,
  deactivatedAt: null,
  withdrawnAt: null,
  deletedAt: null,
};

describe("resolveAccountStatus", () => {
  it("returns active for an active account", () => {
    expect(resolveAccountStatus(activeUser)).toBe("active");
  });

  it("distinguishes ordinary deactivation", () => {
    expect(resolveAccountStatus({
      ...activeUser,
      isActive: false,
      deactivatedAt: new Date("2026-08-25T00:00:00.000Z"),
    })).toBe("deactivated");
  });

  it("distinguishes withdrawal during the grace period", () => {
    expect(resolveAccountStatus({
      ...activeUser,
      isActive: false,
      deactivatedAt: new Date("2026-08-25T00:00:00.000Z"),
      withdrawnAt: new Date("2026-08-25T00:00:00.000Z"),
    })).toBe("withdrawal_pending");
  });

  it("prioritizes an anonymized deleted account", () => {
    expect(resolveAccountStatus({
      ...activeUser,
      isActive: false,
      isDeleted: true,
      deletedAt: new Date("2026-08-25T00:00:00.000Z"),
    })).toBe("deleted");
  });
});
