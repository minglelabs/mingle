import {
  getAccountPreferencesForAndroidV1_1_3,
  patchAccountPreferencesForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV1_1_3;
export const PATCH = patchAccountPreferencesForAndroidV1_1_3;
