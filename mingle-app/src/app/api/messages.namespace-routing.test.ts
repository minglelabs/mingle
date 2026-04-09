import { describe, expect, it } from "vitest";

import { DELETE as deleteMessages } from "@/app/api/messages/route";
import { DELETE as deleteAndroidV100Messages } from "@/app/api/android/v1.0.0/messages/route";
import { DELETE as deleteAndroidV102Messages } from "@/app/api/android/v1.0.2/messages/route";
import { DELETE as deleteAndroidV103Messages } from "@/app/api/android/v1.0.3/messages/route";
import { DELETE as deleteAndroidV104Messages } from "@/app/api/android/v1.0.4/messages/route";
import { DELETE as deleteAndroidV105Messages } from "@/app/api/android/v1.0.5/messages/route";
import { DELETE as deleteAndroidV106Messages } from "@/app/api/android/v1.0.6/messages/route";
import { DELETE as deleteAndroidV107Messages } from "@/app/api/android/v1.0.7/messages/route";
import { DELETE as deleteAndroidV108Messages } from "@/app/api/android/v1.0.8/messages/route";
import { DELETE as deleteAndroidV109Messages } from "@/app/api/android/v1.0.9/messages/route";
import { DELETE as deleteAndroidV1010Messages } from "@/app/api/android/v1.0.10/messages/route";
import { DELETE as deleteAndroidV1011Messages } from "@/app/api/android/v1.0.11/messages/route";
import { DELETE as deleteIosV100Messages } from "@/app/api/ios/v1.0.0/messages/route";
import { DELETE as deleteIosV102Messages } from "@/app/api/ios/v1.0.2/messages/route";
import { DELETE as deleteIosV103Messages } from "@/app/api/ios/v1.0.3/messages/route";
import { DELETE as deleteIosV104Messages } from "@/app/api/ios/v1.0.4/messages/route";
import { DELETE as deleteIosV105Messages } from "@/app/api/ios/v1.0.5/messages/route";
import { DELETE as deleteIosV106Messages } from "@/app/api/ios/v1.0.6/messages/route";
import { DELETE as deleteIosV107Messages } from "@/app/api/ios/v1.0.7/messages/route";
import { DELETE as deleteIosV108Messages } from "@/app/api/ios/v1.0.8/messages/route";
import { DELETE as deleteIosV109Messages } from "@/app/api/ios/v1.0.9/messages/route";
import { DELETE as deleteIosV1010Messages } from "@/app/api/ios/v1.0.10/messages/route";
import { DELETE as deleteIosV1011Messages } from "@/app/api/ios/v1.0.11/messages/route";

describe("messages namespace route wiring", () => {
  it("maps every supported mobile message deletion alias to the shared messages route", () => {
    for (const deleteAlias of [
      deleteAndroidV100Messages,
      deleteAndroidV102Messages,
      deleteAndroidV103Messages,
      deleteAndroidV104Messages,
      deleteAndroidV105Messages,
      deleteAndroidV106Messages,
      deleteAndroidV107Messages,
      deleteAndroidV108Messages,
      deleteAndroidV109Messages,
      deleteAndroidV1010Messages,
      deleteAndroidV1011Messages,
      deleteIosV100Messages,
      deleteIosV102Messages,
      deleteIosV103Messages,
      deleteIosV104Messages,
      deleteIosV105Messages,
      deleteIosV106Messages,
      deleteIosV107Messages,
      deleteIosV108Messages,
      deleteIosV109Messages,
      deleteIosV1010Messages,
      deleteIosV1011Messages,
    ]) {
      expect(deleteAlias).toBe(deleteMessages);
    }
  });
});
