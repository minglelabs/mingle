import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";

import { GET as getIosV2_0_0Notifications, PATCH as patchIosV2_0_0Notifications } from "@/app/api/ios/v2.0.0/notifications/route";
import { GET as getIosV2_0_0Feedback, POST as postIosV2_0_0Feedback } from "@/app/api/ios/v2.0.0/feedback/route";
import { POST as postIosV2_0_0TranslateFinalize } from "@/app/api/ios/v2.0.0/translate/finalize/route";
import { POST as postIosV2_0_0TtsInworld } from "@/app/api/ios/v2.0.0/tts/inworld/route";
import { POST as postIosV2_0_0LogClientEvent } from "@/app/api/ios/v2.0.0/log/client-event/route";
import { POST as postIosV2_0_0ClientVersionPolicy } from "@/app/api/ios/v2.0.0/client/version-policy/route";
import {
  GET as getIosV2_0_0AccountPreferences,
  PATCH as patchIosV2_0_0AccountPreferences,
} from "@/app/api/ios/v2.0.0/account/preferences/route";
import { GET as getIosV2_0_0Conversations, POST as postIosV2_0_0Conversations } from "@/app/api/ios/v2.0.0/conversations/route";
import {
  GET as getIosV2_0_0Conversation,
  PATCH as patchIosV2_0_0Conversation,
  DELETE as deleteIosV2_0_0Conversation,
} from "@/app/api/ios/v2.0.0/conversations/[conversationId]/route";
import { GET as getIosV1_1_4Conversations } from "@/app/api/ios/v1.1.4/conversations/route";

import {
  GET as getAndroidV2_0_0Notifications,
  PATCH as patchAndroidV2_0_0Notifications,
} from "@/app/api/android/v2.0.0/notifications/route";
import { GET as getAndroidV2_0_0Feedback, POST as postAndroidV2_0_0Feedback } from "@/app/api/android/v2.0.0/feedback/route";
import { POST as postAndroidV2_0_0TranslateFinalize } from "@/app/api/android/v2.0.0/translate/finalize/route";
import { POST as postAndroidV2_0_0TtsInworld } from "@/app/api/android/v2.0.0/tts/inworld/route";
import { POST as postAndroidV2_0_0LogClientEvent } from "@/app/api/android/v2.0.0/log/client-event/route";
import { POST as postAndroidV2_0_0ClientVersionPolicy } from "@/app/api/android/v2.0.0/client/version-policy/route";
import {
  GET as getAndroidV2_0_0AccountPreferences,
  PATCH as patchAndroidV2_0_0AccountPreferences,
} from "@/app/api/android/v2.0.0/account/preferences/route";
import {
  GET as getAndroidV2_0_0Conversations,
  POST as postAndroidV2_0_0Conversations,
} from "@/app/api/android/v2.0.0/conversations/route";
import {
  GET as getAndroidV2_0_0Conversation,
  PATCH as patchAndroidV2_0_0Conversation,
  DELETE as deleteAndroidV2_0_0Conversation,
} from "@/app/api/android/v2.0.0/conversations/[conversationId]/route";
import { GET as getAndroidV1_1_4Conversations } from "@/app/api/android/v1.1.4/conversations/route";

import { GET as getIosV2_1_0Notifications, PATCH as patchIosV2_1_0Notifications } from "@/app/api/ios/v2.1.0/notifications/route";
import { GET as getIosV2_1_0Feedback, POST as postIosV2_1_0Feedback } from "@/app/api/ios/v2.1.0/feedback/route";
import { POST as postIosV2_1_0TranslateFinalize } from "@/app/api/ios/v2.1.0/translate/finalize/route";
import { POST as postIosV2_1_0TtsInworld } from "@/app/api/ios/v2.1.0/tts/inworld/route";
import { POST as postIosV2_1_0LogClientEvent } from "@/app/api/ios/v2.1.0/log/client-event/route";
import { POST as postIosV2_1_0ClientVersionPolicy } from "@/app/api/ios/v2.1.0/client/version-policy/route";
import {
  GET as getIosV2_1_0AccountPreferences,
  PATCH as patchIosV2_1_0AccountPreferences,
} from "@/app/api/ios/v2.1.0/account/preferences/route";
import { GET as getIosV2_1_0Conversations, POST as postIosV2_1_0Conversations } from "@/app/api/ios/v2.1.0/conversations/route";
import {
  GET as getIosV2_1_0Conversation,
  PATCH as patchIosV2_1_0Conversation,
  DELETE as deleteIosV2_1_0Conversation,
} from "@/app/api/ios/v2.1.0/conversations/[conversationId]/route";

import {
  GET as getAndroidV2_1_0Notifications,
  PATCH as patchAndroidV2_1_0Notifications,
} from "@/app/api/android/v2.1.0/notifications/route";
import { GET as getAndroidV2_1_0Feedback, POST as postAndroidV2_1_0Feedback } from "@/app/api/android/v2.1.0/feedback/route";
import { POST as postAndroidV2_1_0TranslateFinalize } from "@/app/api/android/v2.1.0/translate/finalize/route";
import { POST as postAndroidV2_1_0TtsInworld } from "@/app/api/android/v2.1.0/tts/inworld/route";
import { POST as postAndroidV2_1_0LogClientEvent } from "@/app/api/android/v2.1.0/log/client-event/route";
import { POST as postAndroidV2_1_0ClientVersionPolicy } from "@/app/api/android/v2.1.0/client/version-policy/route";
import {
  GET as getAndroidV2_1_0AccountPreferences,
  PATCH as patchAndroidV2_1_0AccountPreferences,
} from "@/app/api/android/v2.1.0/account/preferences/route";
import {
  GET as getAndroidV2_1_0Conversations,
  POST as postAndroidV2_1_0Conversations,
} from "@/app/api/android/v2.1.0/conversations/route";
import {
  GET as getAndroidV2_1_0Conversation,
  PATCH as patchAndroidV2_1_0Conversation,
  DELETE as deleteAndroidV2_1_0Conversation,
} from "@/app/api/android/v2.1.0/conversations/[conversationId]/route";

// 2.1.0 is a PURE mirror of 2.0.x: it serves every route exactly as the same
// platform's v2.0.0 namespace serves it, and adds NOTHING of its own. The
// posting feed ships in 2.2.0, not here, so v2.1.0 must NOT carry the posting
// routes (feed, posts, ...). Several v2.0.0 routes are pinned to platform
// controllers (e.g. conversations -> the v1.1.4 channel controller) that differ
// from the unversioned handlers, so this suite pins that inheritance.
describe("mingle-app v2.1.0 namespace route wiring", () => {
  it("does NOT serve the posting routes (those move to 2.2.0)", () => {
    for (const platform of ["ios", "android"] as const) {
      expect(existsSync(new URL(`./${platform}/v2.1.0/feed/route.ts`, import.meta.url))).toBe(false);
      expect(existsSync(new URL(`./${platform}/v2.1.0/posts/route.ts`, import.meta.url))).toBe(false);
    }
  });

  it("serves every inherited iOS route exactly as iOS v2.0.0 does", () => {
    expect(getIosV2_1_0Notifications).toBe(getIosV2_0_0Notifications);
    expect(patchIosV2_1_0Notifications).toBe(patchIosV2_0_0Notifications);
    expect(getIosV2_1_0Feedback).toBe(getIosV2_0_0Feedback);
    expect(postIosV2_1_0Feedback).toBe(postIosV2_0_0Feedback);
    expect(postIosV2_1_0TranslateFinalize).toBe(postIosV2_0_0TranslateFinalize);
    expect(postIosV2_1_0TtsInworld).toBe(postIosV2_0_0TtsInworld);
    expect(postIosV2_1_0LogClientEvent).toBe(postIosV2_0_0LogClientEvent);
    expect(postIosV2_1_0ClientVersionPolicy).toBe(postIosV2_0_0ClientVersionPolicy);
    expect(getIosV2_1_0AccountPreferences).toBe(getIosV2_0_0AccountPreferences);
    expect(patchIosV2_1_0AccountPreferences).toBe(patchIosV2_0_0AccountPreferences);
    expect(getIosV2_1_0Conversations).toBe(getIosV2_0_0Conversations);
    expect(postIosV2_1_0Conversations).toBe(postIosV2_0_0Conversations);
    expect(getIosV2_1_0Conversation).toBe(getIosV2_0_0Conversation);
    expect(patchIosV2_1_0Conversation).toBe(patchIosV2_0_0Conversation);
    expect(deleteIosV2_1_0Conversation).toBe(deleteIosV2_0_0Conversation);
  });

  it("keeps the iOS conversation list on the v1.1.4 channel controller", () => {
    expect(getIosV2_1_0Conversations).toBe(getIosV1_1_4Conversations);
  });

  it("serves every inherited Android route exactly as Android v2.0.0 does", () => {
    expect(getAndroidV2_1_0Notifications).toBe(getAndroidV2_0_0Notifications);
    expect(patchAndroidV2_1_0Notifications).toBe(patchAndroidV2_0_0Notifications);
    expect(getAndroidV2_1_0Feedback).toBe(getAndroidV2_0_0Feedback);
    expect(postAndroidV2_1_0Feedback).toBe(postAndroidV2_0_0Feedback);
    expect(postAndroidV2_1_0TranslateFinalize).toBe(postAndroidV2_0_0TranslateFinalize);
    expect(postAndroidV2_1_0TtsInworld).toBe(postAndroidV2_0_0TtsInworld);
    expect(postAndroidV2_1_0LogClientEvent).toBe(postAndroidV2_0_0LogClientEvent);
    expect(postAndroidV2_1_0ClientVersionPolicy).toBe(postAndroidV2_0_0ClientVersionPolicy);
    expect(getAndroidV2_1_0AccountPreferences).toBe(getAndroidV2_0_0AccountPreferences);
    expect(patchAndroidV2_1_0AccountPreferences).toBe(patchAndroidV2_0_0AccountPreferences);
    expect(getAndroidV2_1_0Conversations).toBe(getAndroidV2_0_0Conversations);
    expect(postAndroidV2_1_0Conversations).toBe(postAndroidV2_0_0Conversations);
    expect(getAndroidV2_1_0Conversation).toBe(getAndroidV2_0_0Conversation);
    expect(patchAndroidV2_1_0Conversation).toBe(patchAndroidV2_0_0Conversation);
    expect(deleteAndroidV2_1_0Conversation).toBe(deleteAndroidV2_0_0Conversation);
  });

  it("keeps the Android conversation list on the v1.1.4 channel controller", () => {
    expect(getAndroidV2_1_0Conversations).toBe(getAndroidV1_1_4Conversations);
  });
});
