import {
  getAccountPreferencesForIosV1_1_4,
  patchAccountPreferencesForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV1_1_4;
export const PATCH = patchAccountPreferencesForIosV1_1_4;
