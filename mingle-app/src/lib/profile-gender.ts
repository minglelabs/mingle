export const PROFILE_GENDERS = ["female", "male"] as const;

/** Public profile gender, shown next to the age (DB check app_users_gender_chk). */
export type ProfileGender = (typeof PROFILE_GENDERS)[number];

export function isProfileGender(value: unknown): value is ProfileGender {
  return value === "female" || value === "male";
}

export function normalizeProfileGender(value: unknown): ProfileGender | null {
  return isProfileGender(value) ? value : null;
}
