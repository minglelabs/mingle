import {
  getAccountPreferencesForAndroidV1_1_4,
  patchAccountPreferencesForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV1_1_4;
export const PATCH = patchAccountPreferencesForAndroidV1_1_4;
