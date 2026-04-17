import {
  getAccountPreferencesForAndroidV1_1_1,
  patchAccountPreferencesForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV1_1_1;
export const PATCH = patchAccountPreferencesForAndroidV1_1_1;
