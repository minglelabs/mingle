import {
  getAccountPreferencesForAndroidV2_0_0,
  patchAccountPreferencesForAndroidV2_0_0,
} from "@/server/api/controllers/android/v2.0.0/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForAndroidV2_0_0;
export const PATCH = patchAccountPreferencesForAndroidV2_0_0;
