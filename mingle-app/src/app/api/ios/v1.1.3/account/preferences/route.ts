import {
  getAccountPreferencesForIosV1_1_3,
  patchAccountPreferencesForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV1_1_3;
export const PATCH = patchAccountPreferencesForIosV1_1_3;
