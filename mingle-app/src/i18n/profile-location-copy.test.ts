import { describe, expect, it } from "vitest";
import { getProfileLocationCopy } from "@/i18n/profile-location-copy";
import { PRIMARY_UI_LOCALES } from "@/i18n/mingle-locales";

describe("profile location copy", () => {
  it("provides complete location copy for all primary UI locales", () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = getProfileLocationCopy(locale);
      expect(copy.label).toBeTruthy();
      expect(copy.addAction).toBeTruthy();
      expect(copy.viewAction).toBeTruthy();
      expect(copy.updateAction).toBeTruthy();
      expect(copy.emptyOwn).toBeTruthy();
      expect(copy.emptyOther).toBeTruthy();
      expect(copy.mapTitle).toBeTruthy();
      expect(copy.permissionDenied).toBeTruthy();
      expect(copy.attribution).toBeTruthy();
    }
  });
});
