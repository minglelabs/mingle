import { sanitizeSttLanguageSelection } from "@/lib/stt-languages";

export type ProfileLanguagePreferencesPayload = {
  primaryLanguages?: unknown;
  defaultConversationLanguages?: unknown;
};

export type ResolvedOnboardingLanguagePreferences = {
  primaryLanguages: string[];
  defaultConversationLanguages: string[];
  patch: {
    primaryLanguages?: string[];
    defaultConversationLanguages?: string[];
  };
};

/**
 * Merges what onboarding collected (while signed out) into the signed-in
 * profile. The server profile wins for the comfortable and default
 * conversation languages, except that a language picked as an interest
 * language in this onboarding wins over the same language in the existing
 * comfortable list: it is dropped from `primaryLanguages`, because the profile
 * serializer hides interest languages that are also comfortable ones, and the
 * feed would then ask for interest languages again.
 */
export function resolveOnboardingLanguagePreferences(
  profile: ProfileLanguagePreferencesPayload,
  pendingPrimaryLanguages: readonly string[],
  pendingDefaultConversationLanguages: readonly string[],
  pendingInterestLanguageCodes: readonly string[] = [],
): ResolvedOnboardingLanguagePreferences {
  const serverPrimaryLanguages = sanitizeSttLanguageSelection(profile.primaryLanguages);
  const serverDefaultConversationLanguages = sanitizeSttLanguageSelection(
    profile.defaultConversationLanguages,
  );
  const fallbackPrimaryLanguages = sanitizeSttLanguageSelection(pendingPrimaryLanguages);
  const fallbackDefaultConversationLanguages = sanitizeSttLanguageSelection(
    pendingDefaultConversationLanguages,
  );
  const interestCodes = new Set<string>(sanitizeSttLanguageSelection(pendingInterestLanguageCodes));
  const withoutInterest = (languages: readonly string[]): string[] => (
    languages.filter((language) => !interestCodes.has(language))
  );

  let primaryLanguages: string[] = serverPrimaryLanguages.length > 0
    ? serverPrimaryLanguages
    : fallbackPrimaryLanguages;
  let primaryChangedForInterest = false;
  if (serverPrimaryLanguages.length > 0 && interestCodes.size > 0) {
    const remaining = withoutInterest(serverPrimaryLanguages);
    if (remaining.length !== serverPrimaryLanguages.length) {
      // Keep at least one comfortable language: fall back to this onboarding's pick.
      const next = remaining.length > 0 ? remaining : withoutInterest(fallbackPrimaryLanguages);
      if (next.length > 0) {
        primaryLanguages = next;
        primaryChangedForInterest = true;
      }
    }
  }
  const defaultConversationLanguages = serverDefaultConversationLanguages.length > 0
    ? serverDefaultConversationLanguages
    : fallbackDefaultConversationLanguages;

  return {
    primaryLanguages,
    defaultConversationLanguages,
    patch: {
      ...((serverPrimaryLanguages.length === 0 || primaryChangedForInterest) && primaryLanguages.length > 0
        ? { primaryLanguages }
        : {}),
      ...(serverDefaultConversationLanguages.length === 0 && defaultConversationLanguages.length > 0
        ? { defaultConversationLanguages }
        : {}),
    },
  };
}
