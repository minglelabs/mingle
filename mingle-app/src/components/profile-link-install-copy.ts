export type ProfileLinkInstallLocale = "en" | "ko";

export type ProfileLinkInstallCopy = {
  title: string;
  openInApp: string;
  appStore: string;
  playStore: string;
  invalidTitle: string;
  invalidDescription: string;
};

function readLanguageTagQuality(part: string, index: number): { tag: string; quality: number; index: number } | null {
  const [rawTag, ...parameters] = part.trim().split(";");
  const tag = rawTag?.trim().toLowerCase();
  if (!tag) return null;

  const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
  const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
  const quality = Number.isFinite(parsedQuality) ? Math.max(0, Math.min(1, parsedQuality)) : 0;

  return { tag, quality, index };
}

export function resolveProfileLinkInstallLocale(
  acceptLanguage: string | null | undefined,
): ProfileLinkInstallLocale {
  const candidates = (acceptLanguage || "")
    .split(",")
    .map(readLanguageTagQuality)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const candidate of candidates) {
    if (candidate.tag === "ko" || candidate.tag.startsWith("ko-")) return "ko";
    if (candidate.tag === "en" || candidate.tag.startsWith("en-")) return "en";
  }

  return "en";
}

export function getProfileLinkInstallCopy(locale: ProfileLinkInstallLocale): ProfileLinkInstallCopy {
  if (locale === "ko") {
    return {
      title: "Mingle에서 프로필 열기",
      openInApp: "밍글 앱에서 열기",
      appStore: "App Store에서 설치",
      playStore: "Google Play에서 설치",
      invalidTitle: "잘못된 프로필 링크입니다",
      invalidDescription: "QR 코드가 손상되었거나 더 이상 사용할 수 없는 링크입니다.",
    };
  }

  return {
    title: "Open profile in Mingle",
    openInApp: "Open in Mingle",
    appStore: "App Store",
    playStore: "Google Play",
    invalidTitle: "This profile link is invalid",
    invalidDescription: "The QR code may be damaged or the link is no longer available.",
  };
}
