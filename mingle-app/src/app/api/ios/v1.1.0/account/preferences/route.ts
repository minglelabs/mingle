import {
  getAccountPreferencesForIosV1_1_0,
  patchAccountPreferencesForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV1_1_0;
export const PATCH = patchAccountPreferencesForIosV1_1_0;
