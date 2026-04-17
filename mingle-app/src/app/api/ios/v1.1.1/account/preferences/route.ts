import {
  getAccountPreferencesForIosV1_1_1,
  patchAccountPreferencesForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV1_1_1;
export const PATCH = patchAccountPreferencesForIosV1_1_1;
