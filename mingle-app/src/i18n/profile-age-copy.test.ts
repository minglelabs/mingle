import { describe, expect, it } from "vitest";
import { formatProfileAge } from "@/i18n/profile-age-copy";

describe("public profile age copy", () => {
  it("formats ages for every primary profile locale", () => {
    expect(formatProfileAge(1, "ko")).toBe("1세");
    expect(formatProfileAge(32, "en")).toBe("32 years old");
    expect(formatProfileAge(1, "en")).toBe("1 year old");
    expect(formatProfileAge(32, "ja")).toBe("32歳");
    expect(formatProfileAge(32, "zh-CN")).toBe("32岁");
    expect(formatProfileAge(32, "zh-TW")).toBe("32歲");
    expect(formatProfileAge(1, "fr")).toBe("1 an");
    expect(formatProfileAge(1, "de")).toBe("1 Jahr alt");
    expect(formatProfileAge(1, "es")).toBe("1 año");
    expect(formatProfileAge(1, "pt")).toBe("1 ano");
    expect(formatProfileAge(1, "it")).toBe("1 anno");
    expect(formatProfileAge(2, "ru")).toBe("2 года");
    expect(formatProfileAge(2, "ar")).toBe("٢ سنتان");
    expect(formatProfileAge(32, "hi")).toBe("32 वर्ष");
    expect(formatProfileAge(32, "th")).toBe("32 ปี");
    expect(formatProfileAge(32, "vi")).toBe("32 tuổi");
  });

  it("omits missing or invalid ages", () => {
    expect(formatProfileAge(undefined, "en")).toBeNull();
    expect(formatProfileAge(null, "en")).toBeNull();
    expect(formatProfileAge(-1, "en")).toBeNull();
    expect(formatProfileAge(2.5, "en")).toBeNull();
    expect(formatProfileAge(Number.NaN, "en")).toBeNull();
  });
});
