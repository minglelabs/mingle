import {
  getAccountPreferencesForIosV2_0_0,
  patchAccountPreferencesForIosV2_0_0,
} from "@/server/api/controllers/ios/v2.0.0/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV2_0_0;
export const PATCH = patchAccountPreferencesForIosV2_0_0;
