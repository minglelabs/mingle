import {
  getAccountPreferencesForAndroidV1_1_0,
  patchAccountPreferencesForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV1_1_0;
export const PATCH = patchAccountPreferencesForAndroidV1_1_0;
