import { describe, expect, it } from "vitest";

import { DELETE as deleteMessages } from "@/app/api/messages/route";
import { DELETE as deleteAndroidV110Messages } from "@/app/api/android/v1.0.11/messages/route";
import { DELETE as deleteIosV110Messages } from "@/app/api/ios/v1.0.11/messages/route";

describe("messages namespace route wiring", () => {
  it("maps Android message deletion aliases to the shared messages route", () => {
    expect(deleteAndroidV110Messages).toBe(deleteMessages);
  });

  it("maps iOS message deletion aliases to the shared messages route", () => {
    expect(deleteIosV110Messages).toBe(deleteMessages);
  });
});
