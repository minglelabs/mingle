import {
  getAccountPreferencesForAndroidV1_1_2,
  patchAccountPreferencesForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV1_1_2;
export const PATCH = patchAccountPreferencesForAndroidV1_1_2;
