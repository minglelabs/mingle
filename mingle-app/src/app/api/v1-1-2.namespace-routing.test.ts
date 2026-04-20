import { describe, expect, it } from "vitest";

import { GET as getFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import {
  GET as getAndroidV1_1_2AccountPreferences,
  PATCH as patchAndroidV1_1_2AccountPreferences,
} from "@/app/api/android/v1.1.2/account/preferences/route";
import { POST as postAndroidV1_1_2ClientVersionPolicy } from "@/app/api/android/v1.1.2/client/version-policy/route";
import {
  DELETE as deleteAndroidV1_1_2Conversation,
  GET as getAndroidV1_1_2Conversation,
  PATCH as patchAndroidV1_1_2Conversation,
} from "@/app/api/android/v1.1.2/conversations/[conversationId]/route";
import {
  GET as getAndroidV1_1_2Conversations,
  POST as postAndroidV1_1_2Conversations,
} from "@/app/api/android/v1.1.2/conversations/route";
import {
  GET as getAndroidV1_1_2Feedback,
  POST as postAndroidV1_1_2Feedback,
} from "@/app/api/android/v1.1.2/feedback/route";
import { POST as postAndroidV1_1_2LogClientEvent } from "@/app/api/android/v1.1.2/log/client-event/route";
import { POST as postAndroidV1_1_2TranslateFinalize } from "@/app/api/android/v1.1.2/translate/finalize/route";
import { POST as postAndroidV1_1_2TtsInworld } from "@/app/api/android/v1.1.2/tts/inworld/route";
import {
  getAccountPreferencesForAndroidV1_1_2,
  patchAccountPreferencesForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_2 } from "@/server/api/controllers/android/v1.1.2/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV1_1_2,
  getConversationRouteForAndroidV1_1_2,
  patchConversationRouteForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/conversation-controller";
import {
  getConversationChannelsForAndroidV1_1_2,
  postCreateConversationForAndroidV1_1_2,
} from "@/server/api/controllers/android/v1.1.2/conversations-controller";
import { postLogClientEventForAndroidV1_1_2 } from "@/server/api/controllers/android/v1.1.2/log-client-event-controller";
import { postTranslateFinalizeForAndroidV1_1_2 } from "@/server/api/controllers/android/v1.1.2/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_2 } from "@/server/api/controllers/android/v1.1.2/tts-inworld-controller";
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
  GET as getIosV1_1_2AccountPreferences,
  PATCH as patchIosV1_1_2AccountPreferences,
} from "@/app/api/ios/v1.1.2/account/preferences/route";
import { POST as postIosV1_1_2ClientVersionPolicy } from "@/app/api/ios/v1.1.2/client/version-policy/route";
import {
  DELETE as deleteIosV1_1_2Conversation,
  GET as getIosV1_1_2Conversation,
  PATCH as patchIosV1_1_2Conversation,
} from "@/app/api/ios/v1.1.2/conversations/[conversationId]/route";
import {
  GET as getIosV1_1_2Conversations,
  POST as postIosV1_1_2Conversations,
} from "@/app/api/ios/v1.1.2/conversations/route";
import {
  GET as getIosV1_1_2Feedback,
  POST as postIosV1_1_2Feedback,
} from "@/app/api/ios/v1.1.2/feedback/route";
import { POST as postIosV1_1_2LogClientEvent } from "@/app/api/ios/v1.1.2/log/client-event/route";
import { POST as postIosV1_1_2TranslateFinalize } from "@/app/api/ios/v1.1.2/translate/finalize/route";
import { POST as postIosV1_1_2TtsInworld } from "@/app/api/ios/v1.1.2/tts/inworld/route";
import {
  getAccountPreferencesForIosV1_1_2,
  patchAccountPreferencesForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/account-preferences-controller";
import { postIosClientVersionPolicyForIosV1_1_2 } from "@/server/api/controllers/ios/v1.1.2/client-version-policy-controller";
import {
  deleteConversationRouteForIosV1_1_2,
  getConversationRouteForIosV1_1_2,
  patchConversationRouteForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/conversation-controller";
import {
  getConversationChannelsForIosV1_1_2,
  postCreateConversationForIosV1_1_2,
} from "@/server/api/controllers/ios/v1.1.2/conversations-controller";
import { postLogClientEventForIosV1_1_2 } from "@/server/api/controllers/ios/v1.1.2/log-client-event-controller";
import { postTranslateFinalizeForIosV1_1_2 } from "@/server/api/controllers/ios/v1.1.2/translate-finalize-controller";
import { postTtsInworldForIosV1_1_2 } from "@/server/api/controllers/ios/v1.1.2/tts-inworld-controller";
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

describe("mingle-app v1.1.2 namespace route wiring", () => {
  it("maps Android v1.1.2 routes to Android v1.1.2 controllers", () => {
    expect(getAndroidV1_1_2AccountPreferences).toBe(getAccountPreferencesForAndroidV1_1_2);
    expect(patchAndroidV1_1_2AccountPreferences).toBe(patchAccountPreferencesForAndroidV1_1_2);
    expect(postAndroidV1_1_2ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_1_2);
    expect(getAndroidV1_1_2Conversation).toBe(getConversationRouteForAndroidV1_1_2);
    expect(patchAndroidV1_1_2Conversation).toBe(patchConversationRouteForAndroidV1_1_2);
    expect(deleteAndroidV1_1_2Conversation).toBe(deleteConversationRouteForAndroidV1_1_2);
    expect(getAndroidV1_1_2Conversations).toBe(getConversationChannelsForAndroidV1_1_2);
    expect(postAndroidV1_1_2Conversations).toBe(postCreateConversationForAndroidV1_1_2);
    expect(getAndroidV1_1_2Feedback).toBe(getFeedback);
    expect(postAndroidV1_1_2Feedback).toBe(postFeedback);
    expect(postAndroidV1_1_2LogClientEvent).toBe(postLogClientEventForAndroidV1_1_2);
    expect(postAndroidV1_1_2TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_1_2);
    expect(postAndroidV1_1_2TtsInworld).toBe(postTtsInworldForAndroidV1_1_2);
  });

  it("maps iOS v1.1.2 routes to iOS v1.1.2 controllers", () => {
    expect(getIosV1_1_2AccountPreferences).toBe(getAccountPreferencesForIosV1_1_2);
    expect(patchIosV1_1_2AccountPreferences).toBe(patchAccountPreferencesForIosV1_1_2);
    expect(postIosV1_1_2ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_1_2);
    expect(getIosV1_1_2Conversation).toBe(getConversationRouteForIosV1_1_2);
    expect(patchIosV1_1_2Conversation).toBe(patchConversationRouteForIosV1_1_2);
    expect(deleteIosV1_1_2Conversation).toBe(deleteConversationRouteForIosV1_1_2);
    expect(getIosV1_1_2Conversations).toBe(getConversationChannelsForIosV1_1_2);
    expect(postIosV1_1_2Conversations).toBe(postCreateConversationForIosV1_1_2);
    expect(getIosV1_1_2Feedback).toBe(getFeedback);
    expect(postIosV1_1_2Feedback).toBe(postFeedback);
    expect(postIosV1_1_2LogClientEvent).toBe(postLogClientEventForIosV1_1_2);
    expect(postIosV1_1_2TranslateFinalize).toBe(postTranslateFinalizeForIosV1_1_2);
    expect(postIosV1_1_2TtsInworld).toBe(postTtsInworldForIosV1_1_2);
  });

  it("keeps v1.1.2 API controllers pinned to v1.1.0 behavior", () => {
    expect(getAccountPreferencesForAndroidV1_1_2).toBe(getAccountPreferencesForAndroidV1_1_0);
    expect(patchAccountPreferencesForAndroidV1_1_2).toBe(patchAccountPreferencesForAndroidV1_1_0);
    expect(postAndroidClientVersionPolicyForAndroidV1_1_2).toBe(postAndroidClientVersionPolicyForAndroidV1_1_0);
    expect(getConversationRouteForAndroidV1_1_2).toBe(getConversationRouteForAndroidV1_1_0);
    expect(patchConversationRouteForAndroidV1_1_2).toBe(patchConversationRouteForAndroidV1_1_0);
    expect(deleteConversationRouteForAndroidV1_1_2).toBe(deleteConversationRouteForAndroidV1_1_0);
    expect(getConversationChannelsForAndroidV1_1_2).toBe(getConversationChannelsForAndroidV1_1_0);
    expect(postCreateConversationForAndroidV1_1_2).toBe(postCreateConversationForAndroidV1_1_0);
    expect(postLogClientEventForAndroidV1_1_2).toBe(postLogClientEventForAndroidV1_1_0);
    expect(postTranslateFinalizeForAndroidV1_1_2).toBe(postTranslateFinalizeForAndroidV1_1_0);
    expect(postTtsInworldForAndroidV1_1_2).toBe(postTtsInworldForAndroidV1_1_0);
    expect(getAccountPreferencesForIosV1_1_2).toBe(getAccountPreferencesForIosV1_1_0);
    expect(patchAccountPreferencesForIosV1_1_2).toBe(patchAccountPreferencesForIosV1_1_0);
    expect(postIosClientVersionPolicyForIosV1_1_2).toBe(postIosClientVersionPolicyForIosV1_1_0);
    expect(getConversationRouteForIosV1_1_2).toBe(getConversationRouteForIosV1_1_0);
    expect(patchConversationRouteForIosV1_1_2).toBe(patchConversationRouteForIosV1_1_0);
    expect(deleteConversationRouteForIosV1_1_2).toBe(deleteConversationRouteForIosV1_1_0);
    expect(getConversationChannelsForIosV1_1_2).toBe(getConversationChannelsForIosV1_1_0);
    expect(postCreateConversationForIosV1_1_2).toBe(postCreateConversationForIosV1_1_0);
    expect(postLogClientEventForIosV1_1_2).toBe(postLogClientEventForIosV1_1_0);
    expect(postTranslateFinalizeForIosV1_1_2).toBe(postTranslateFinalizeForIosV1_1_0);
    expect(postTtsInworldForIosV1_1_2).toBe(postTtsInworldForIosV1_1_0);
  });
});
