import {
  getAccountPreferencesForIosV1_1_2,
  patchAccountPreferencesForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/account-preferences-controller";

export const runtime = "nodejs";
export const GET = getAccountPreferencesForIosV1_1_2;
export const PATCH = patchAccountPreferencesForIosV1_1_2;
