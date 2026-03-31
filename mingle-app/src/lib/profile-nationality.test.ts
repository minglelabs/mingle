import { describe, expect, it } from "vitest";

import {
  NATIONALITY_OPTIONS,
  resolveNationalityCode,
  resolveNationalityFlag,
  resolveNationalityOption,
} from "@/lib/profile-nationality";

describe("profile-nationality", () => {
  it("exposes 60 nationality options", () => {
    expect(NATIONALITY_OPTIONS).toHaveLength(60);
  });

  it("resolves direct country codes", () => {
    expect(resolveNationalityCode("kr")).toBe("KR");
    expect(resolveNationalityOption("US")?.label).toBe("United States");
  });

  it("resolves legacy locale-based nationality values", () => {
    expect(resolveNationalityCode("ko")).toBe("KR");
    expect(resolveNationalityCode("zh-CN")).toBe("CN");
    expect(resolveNationalityFlag("pt")).toBe("🇧🇷");
  });

  it("resolves stored flag emoji values", () => {
    expect(resolveNationalityCode("🇯🇵")).toBe("JP");
    expect(resolveNationalityOption("🇫🇷")?.label).toBe("France");
  });
});
