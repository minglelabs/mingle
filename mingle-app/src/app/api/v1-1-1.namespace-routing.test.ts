import { describe, expect, it } from "vitest";

import { GET as getFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import {
  GET as getAndroidV1_1_1AccountPreferences,
  PATCH as patchAndroidV1_1_1AccountPreferences,
} from "@/app/api/android/v1.1.1/account/preferences/route";
import { POST as postAndroidV1_1_1ClientVersionPolicy } from "@/app/api/android/v1.1.1/client/version-policy/route";
import {
  DELETE as deleteAndroidV1_1_1Conversation,
  GET as getAndroidV1_1_1Conversation,
  PATCH as patchAndroidV1_1_1Conversation,
} from "@/app/api/android/v1.1.1/conversations/[conversationId]/route";
import {
  GET as getAndroidV1_1_1Conversations,
  POST as postAndroidV1_1_1Conversations,
} from "@/app/api/android/v1.1.1/conversations/route";
import {
  GET as getAndroidV1_1_1Feedback,
  POST as postAndroidV1_1_1Feedback,
} from "@/app/api/android/v1.1.1/feedback/route";
import { POST as postAndroidV1_1_1LogClientEvent } from "@/app/api/android/v1.1.1/log/client-event/route";
import { POST as postAndroidV1_1_1TranslateFinalize } from "@/app/api/android/v1.1.1/translate/finalize/route";
import { POST as postAndroidV1_1_1TtsInworld } from "@/app/api/android/v1.1.1/tts/inworld/route";
import {
  getAccountPreferencesForAndroidV1_1_1,
  patchAccountPreferencesForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_1 } from "@/server/api/controllers/android/v1.1.1/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV1_1_1,
  getConversationRouteForAndroidV1_1_1,
  patchConversationRouteForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/conversation-controller";
import {
  getConversationChannelsForAndroidV1_1_1,
  postCreateConversationForAndroidV1_1_1,
} from "@/server/api/controllers/android/v1.1.1/conversations-controller";
import { postLogClientEventForAndroidV1_1_1 } from "@/server/api/controllers/android/v1.1.1/log-client-event-controller";
import { postTranslateFinalizeForAndroidV1_1_1 } from "@/server/api/controllers/android/v1.1.1/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_1 } from "@/server/api/controllers/android/v1.1.1/tts-inworld-controller";
import {
  getAccountPreferencesForAndroidV1_1_0,
  patchAccountPreferencesForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_0 } from "@/server/api/controllers/android/v1.1.0/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV1_1_0,
  getConversationRouteForAndroidV1_1_0,
  patchConversationRouteForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/conversation-controller";
import {
  getConversationChannelsForAndroidV1_1_0,
  postCreateConversationForAndroidV1_1_0,
} from "@/server/api/controllers/android/v1.1.0/conversations-controller";
import { postLogClientEventForAndroidV1_1_0 } from "@/server/api/controllers/android/v1.1.0/log-client-event-controller";
import { postTranslateFinalizeForAndroidV1_1_0 } from "@/server/api/controllers/android/v1.1.0/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_0 } from "@/server/api/controllers/android/v1.1.0/tts-inworld-controller";
import {
  GET as getIosV1_1_1AccountPreferences,
  PATCH as patchIosV1_1_1AccountPreferences,
} from "@/app/api/ios/v1.1.1/account/preferences/route";
import { POST as postIosV1_1_1ClientVersionPolicy } from "@/app/api/ios/v1.1.1/client/version-policy/route";
import {
  DELETE as deleteIosV1_1_1Conversation,
  GET as getIosV1_1_1Conversation,
  PATCH as patchIosV1_1_1Conversation,
} from "@/app/api/ios/v1.1.1/conversations/[conversationId]/route";
import {
  GET as getIosV1_1_1Conversations,
  POST as postIosV1_1_1Conversations,
} from "@/app/api/ios/v1.1.1/conversations/route";
import {
  GET as getIosV1_1_1Feedback,
  POST as postIosV1_1_1Feedback,
} from "@/app/api/ios/v1.1.1/feedback/route";
import { POST as postIosV1_1_1LogClientEvent } from "@/app/api/ios/v1.1.1/log/client-event/route";
import { POST as postIosV1_1_1TranslateFinalize } from "@/app/api/ios/v1.1.1/translate/finalize/route";
import { POST as postIosV1_1_1TtsInworld } from "@/app/api/ios/v1.1.1/tts/inworld/route";
import {
  getAccountPreferencesForIosV1_1_1,
  patchAccountPreferencesForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/account-preferences-controller";
import { postIosClientVersionPolicyForIosV1_1_1 } from "@/server/api/controllers/ios/v1.1.1/client-version-policy-controller";
import {
  deleteConversationRouteForIosV1_1_1,
  getConversationRouteForIosV1_1_1,
  patchConversationRouteForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/conversation-controller";
import {
  getConversationChannelsForIosV1_1_1,
  postCreateConversationForIosV1_1_1,
} from "@/server/api/controllers/ios/v1.1.1/conversations-controller";
import { postLogClientEventForIosV1_1_1 } from "@/server/api/controllers/ios/v1.1.1/log-client-event-controller";
import { postTranslateFinalizeForIosV1_1_1 } from "@/server/api/controllers/ios/v1.1.1/translate-finalize-controller";
import { postTtsInworldForIosV1_1_1 } from "@/server/api/controllers/ios/v1.1.1/tts-inworld-controller";
import {
  getAccountPreferencesForIosV1_1_0,
  patchAccountPreferencesForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/account-preferences-controller";
import { postIosClientVersionPolicyForIosV1_1_0 } from "@/server/api/controllers/ios/v1.1.0/client-version-policy-controller";
import {
  deleteConversationRouteForIosV1_1_0,
  getConversationRouteForIosV1_1_0,
  patchConversationRouteForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/conversation-controller";
import {
  getConversationChannelsForIosV1_1_0,
  postCreateConversationForIosV1_1_0,
} from "@/server/api/controllers/ios/v1.1.0/conversations-controller";
import { postLogClientEventForIosV1_1_0 } from "@/server/api/controllers/ios/v1.1.0/log-client-event-controller";
import { postTranslateFinalizeForIosV1_1_0 } from "@/server/api/controllers/ios/v1.1.0/translate-finalize-controller";
import { postTtsInworldForIosV1_1_0 } from "@/server/api/controllers/ios/v1.1.0/tts-inworld-controller";

describe("mingle-app v1.1.1 namespace route wiring", () => {
  it("maps Android v1.1.1 routes to Android v1.1.1 controllers", () => {
    expect(getAndroidV1_1_1AccountPreferences).toBe(getAccountPreferencesForAndroidV1_1_1);
    expect(patchAndroidV1_1_1AccountPreferences).toBe(patchAccountPreferencesForAndroidV1_1_1);
    expect(postAndroidV1_1_1ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_1_1);
    expect(getAndroidV1_1_1Conversation).toBe(getConversationRouteForAndroidV1_1_1);
    expect(patchAndroidV1_1_1Conversation).toBe(patchConversationRouteForAndroidV1_1_1);
    expect(deleteAndroidV1_1_1Conversation).toBe(deleteConversationRouteForAndroidV1_1_1);
    expect(getAndroidV1_1_1Conversations).toBe(getConversationChannelsForAndroidV1_1_1);
    expect(postAndroidV1_1_1Conversations).toBe(postCreateConversationForAndroidV1_1_1);
    expect(getAndroidV1_1_1Feedback).toBe(getFeedback);
    expect(postAndroidV1_1_1Feedback).toBe(postFeedback);
    expect(postAndroidV1_1_1LogClientEvent).toBe(postLogClientEventForAndroidV1_1_1);
    expect(postAndroidV1_1_1TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_1_1);
    expect(postAndroidV1_1_1TtsInworld).toBe(postTtsInworldForAndroidV1_1_1);
  });

  it("maps iOS v1.1.1 routes to iOS v1.1.1 controllers", () => {
    expect(getIosV1_1_1AccountPreferences).toBe(getAccountPreferencesForIosV1_1_1);
    expect(patchIosV1_1_1AccountPreferences).toBe(patchAccountPreferencesForIosV1_1_1);
    expect(postIosV1_1_1ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_1_1);
    expect(getIosV1_1_1Conversation).toBe(getConversationRouteForIosV1_1_1);
    expect(patchIosV1_1_1Conversation).toBe(patchConversationRouteForIosV1_1_1);
    expect(deleteIosV1_1_1Conversation).toBe(deleteConversationRouteForIosV1_1_1);
    expect(getIosV1_1_1Conversations).toBe(getConversationChannelsForIosV1_1_1);
    expect(postIosV1_1_1Conversations).toBe(postCreateConversationForIosV1_1_1);
    expect(getIosV1_1_1Feedback).toBe(getFeedback);
    expect(postIosV1_1_1Feedback).toBe(postFeedback);
    expect(postIosV1_1_1LogClientEvent).toBe(postLogClientEventForIosV1_1_1);
    expect(postIosV1_1_1TranslateFinalize).toBe(postTranslateFinalizeForIosV1_1_1);
    expect(postIosV1_1_1TtsInworld).toBe(postTtsInworldForIosV1_1_1);
  });

  it("keeps v1.1.1 API controllers pinned to v1.1.0 behavior", () => {
    expect(getAccountPreferencesForAndroidV1_1_1).toBe(getAccountPreferencesForAndroidV1_1_0);
    expect(patchAccountPreferencesForAndroidV1_1_1).toBe(patchAccountPreferencesForAndroidV1_1_0);
    expect(postAndroidClientVersionPolicyForAndroidV1_1_1).toBe(postAndroidClientVersionPolicyForAndroidV1_1_0);
    expect(getConversationRouteForAndroidV1_1_1).toBe(getConversationRouteForAndroidV1_1_0);
    expect(patchConversationRouteForAndroidV1_1_1).toBe(patchConversationRouteForAndroidV1_1_0);
    expect(deleteConversationRouteForAndroidV1_1_1).toBe(deleteConversationRouteForAndroidV1_1_0);
    expect(getConversationChannelsForAndroidV1_1_1).toBe(getConversationChannelsForAndroidV1_1_0);
    expect(postCreateConversationForAndroidV1_1_1).toBe(postCreateConversationForAndroidV1_1_0);
    expect(postLogClientEventForAndroidV1_1_1).toBe(postLogClientEventForAndroidV1_1_0);
    expect(postTranslateFinalizeForAndroidV1_1_1).toBe(postTranslateFinalizeForAndroidV1_1_0);
    expect(postTtsInworldForAndroidV1_1_1).toBe(postTtsInworldForAndroidV1_1_0);
    expect(getAccountPreferencesForIosV1_1_1).toBe(getAccountPreferencesForIosV1_1_0);
    expect(patchAccountPreferencesForIosV1_1_1).toBe(patchAccountPreferencesForIosV1_1_0);
    expect(postIosClientVersionPolicyForIosV1_1_1).toBe(postIosClientVersionPolicyForIosV1_1_0);
    expect(getConversationRouteForIosV1_1_1).toBe(getConversationRouteForIosV1_1_0);
    expect(patchConversationRouteForIosV1_1_1).toBe(patchConversationRouteForIosV1_1_0);
    expect(deleteConversationRouteForIosV1_1_1).toBe(deleteConversationRouteForIosV1_1_0);
    expect(getConversationChannelsForIosV1_1_1).toBe(getConversationChannelsForIosV1_1_0);
    expect(postCreateConversationForIosV1_1_1).toBe(postCreateConversationForIosV1_1_0);
    expect(postLogClientEventForIosV1_1_1).toBe(postLogClientEventForIosV1_1_0);
    expect(postTranslateFinalizeForIosV1_1_1).toBe(postTranslateFinalizeForIosV1_1_0);
    expect(postTtsInworldForIosV1_1_1).toBe(postTtsInworldForIosV1_1_0);
  });
});
