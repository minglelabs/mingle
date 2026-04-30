import { describe, expect, it } from "vitest";

import { GET as getFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import {
  GET as getAndroidV2_0_0AccountPreferences,
  PATCH as patchAndroidV2_0_0AccountPreferences,
} from "@/app/api/android/v2.0.0/account/preferences/route";
import { POST as postAndroidV2_0_0ClientVersionPolicy } from "@/app/api/android/v2.0.0/client/version-policy/route";
import {
  DELETE as deleteAndroidV2_0_0Conversation,
  GET as getAndroidV2_0_0Conversation,
  PATCH as patchAndroidV2_0_0Conversation,
} from "@/app/api/android/v2.0.0/conversations/[conversationId]/route";
import {
  GET as getAndroidV2_0_0Conversations,
  POST as postAndroidV2_0_0Conversations,
} from "@/app/api/android/v2.0.0/conversations/route";
import {
  GET as getAndroidV2_0_0Feedback,
  POST as postAndroidV2_0_0Feedback,
} from "@/app/api/android/v2.0.0/feedback/route";
import { POST as postAndroidV2_0_0LogClientEvent } from "@/app/api/android/v2.0.0/log/client-event/route";
import { POST as postAndroidV2_0_0TranslateFinalize } from "@/app/api/android/v2.0.0/translate/finalize/route";
import { POST as postAndroidV2_0_0TtsInworld } from "@/app/api/android/v2.0.0/tts/inworld/route";
import {
  getAccountPreferencesForAndroidV2_0_0,
  patchAccountPreferencesForAndroidV2_0_0,
} from "@/server/api/controllers/android/v2.0.0/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV2_0_0 } from "@/server/api/controllers/android/v2.0.0/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV2_0_0,
  getConversationRouteForAndroidV2_0_0,
  patchConversationRouteForAndroidV2_0_0,
} from "@/server/api/controllers/android/v2.0.0/conversation-controller";
import {
  getConversationChannelsForAndroidV2_0_0,
  postCreateConversationForAndroidV2_0_0,
} from "@/server/api/controllers/android/v2.0.0/conversations-controller";
import { postLogClientEventForAndroidV2_0_0 } from "@/server/api/controllers/android/v2.0.0/log-client-event-controller";
import { postTranslateFinalizeForAndroidV2_0_0 } from "@/server/api/controllers/android/v2.0.0/translate-finalize-controller";
import { postTtsInworldForAndroidV2_0_0 } from "@/server/api/controllers/android/v2.0.0/tts-inworld-controller";
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
  GET as getIosV2_0_0AccountPreferences,
  PATCH as patchIosV2_0_0AccountPreferences,
} from "@/app/api/ios/v2.0.0/account/preferences/route";
import { POST as postIosV2_0_0ClientVersionPolicy } from "@/app/api/ios/v2.0.0/client/version-policy/route";
import {
  DELETE as deleteIosV2_0_0Conversation,
  GET as getIosV2_0_0Conversation,
  PATCH as patchIosV2_0_0Conversation,
} from "@/app/api/ios/v2.0.0/conversations/[conversationId]/route";
import {
  GET as getIosV2_0_0Conversations,
  POST as postIosV2_0_0Conversations,
} from "@/app/api/ios/v2.0.0/conversations/route";
import {
  GET as getIosV2_0_0Feedback,
  POST as postIosV2_0_0Feedback,
} from "@/app/api/ios/v2.0.0/feedback/route";
import { POST as postIosV2_0_0LogClientEvent } from "@/app/api/ios/v2.0.0/log/client-event/route";
import { POST as postIosV2_0_0TranslateFinalize } from "@/app/api/ios/v2.0.0/translate/finalize/route";
import { POST as postIosV2_0_0TtsInworld } from "@/app/api/ios/v2.0.0/tts/inworld/route";
import {
  getAccountPreferencesForIosV2_0_0,
  patchAccountPreferencesForIosV2_0_0,
} from "@/server/api/controllers/ios/v2.0.0/account-preferences-controller";
import { postIosClientVersionPolicyForIosV2_0_0 } from "@/server/api/controllers/ios/v2.0.0/client-version-policy-controller";
import {
  deleteConversationRouteForIosV2_0_0,
  getConversationRouteForIosV2_0_0,
  patchConversationRouteForIosV2_0_0,
} from "@/server/api/controllers/ios/v2.0.0/conversation-controller";
import {
  getConversationChannelsForIosV2_0_0,
  postCreateConversationForIosV2_0_0,
} from "@/server/api/controllers/ios/v2.0.0/conversations-controller";
import { postLogClientEventForIosV2_0_0 } from "@/server/api/controllers/ios/v2.0.0/log-client-event-controller";
import { postTranslateFinalizeForIosV2_0_0 } from "@/server/api/controllers/ios/v2.0.0/translate-finalize-controller";
import { postTtsInworldForIosV2_0_0 } from "@/server/api/controllers/ios/v2.0.0/tts-inworld-controller";
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

describe("mingle-app v2.0.0 namespace route wiring", () => {
  it("maps Android v2.0.0 routes to Android v2.0.0 controllers", () => {
    expect(getAndroidV2_0_0AccountPreferences).toBe(getAccountPreferencesForAndroidV2_0_0);
    expect(patchAndroidV2_0_0AccountPreferences).toBe(patchAccountPreferencesForAndroidV2_0_0);
    expect(postAndroidV2_0_0ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV2_0_0);
    expect(getAndroidV2_0_0Conversation).toBe(getConversationRouteForAndroidV2_0_0);
    expect(patchAndroidV2_0_0Conversation).toBe(patchConversationRouteForAndroidV2_0_0);
    expect(deleteAndroidV2_0_0Conversation).toBe(deleteConversationRouteForAndroidV2_0_0);
    expect(getAndroidV2_0_0Conversations).toBe(getConversationChannelsForAndroidV2_0_0);
    expect(postAndroidV2_0_0Conversations).toBe(postCreateConversationForAndroidV2_0_0);
    expect(getAndroidV2_0_0Feedback).toBe(getFeedback);
    expect(postAndroidV2_0_0Feedback).toBe(postFeedback);
    expect(postAndroidV2_0_0LogClientEvent).toBe(postLogClientEventForAndroidV2_0_0);
    expect(postAndroidV2_0_0TranslateFinalize).toBe(postTranslateFinalizeForAndroidV2_0_0);
    expect(postAndroidV2_0_0TtsInworld).toBe(postTtsInworldForAndroidV2_0_0);
  });

  it("maps iOS v2.0.0 routes to iOS v2.0.0 controllers", () => {
    expect(getIosV2_0_0AccountPreferences).toBe(getAccountPreferencesForIosV2_0_0);
    expect(patchIosV2_0_0AccountPreferences).toBe(patchAccountPreferencesForIosV2_0_0);
    expect(postIosV2_0_0ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV2_0_0);
    expect(getIosV2_0_0Conversation).toBe(getConversationRouteForIosV2_0_0);
    expect(patchIosV2_0_0Conversation).toBe(patchConversationRouteForIosV2_0_0);
    expect(deleteIosV2_0_0Conversation).toBe(deleteConversationRouteForIosV2_0_0);
    expect(getIosV2_0_0Conversations).toBe(getConversationChannelsForIosV2_0_0);
    expect(postIosV2_0_0Conversations).toBe(postCreateConversationForIosV2_0_0);
    expect(getIosV2_0_0Feedback).toBe(getFeedback);
    expect(postIosV2_0_0Feedback).toBe(postFeedback);
    expect(postIosV2_0_0LogClientEvent).toBe(postLogClientEventForIosV2_0_0);
    expect(postIosV2_0_0TranslateFinalize).toBe(postTranslateFinalizeForIosV2_0_0);
    expect(postIosV2_0_0TtsInworld).toBe(postTtsInworldForIosV2_0_0);
  });

  it("keeps v2.0.0 API controllers pinned to v1.1.0 behavior", () => {
    expect(getAccountPreferencesForAndroidV2_0_0).toBe(getAccountPreferencesForAndroidV1_1_0);
    expect(patchAccountPreferencesForAndroidV2_0_0).toBe(patchAccountPreferencesForAndroidV1_1_0);
    expect(postAndroidClientVersionPolicyForAndroidV2_0_0).toBe(postAndroidClientVersionPolicyForAndroidV1_1_0);
    expect(getConversationRouteForAndroidV2_0_0).toBe(getConversationRouteForAndroidV1_1_0);
    expect(patchConversationRouteForAndroidV2_0_0).toBe(patchConversationRouteForAndroidV1_1_0);
    expect(deleteConversationRouteForAndroidV2_0_0).toBe(deleteConversationRouteForAndroidV1_1_0);
    expect(getConversationChannelsForAndroidV2_0_0).toBe(getConversationChannelsForAndroidV1_1_0);
    expect(postCreateConversationForAndroidV2_0_0).toBe(postCreateConversationForAndroidV1_1_0);
    expect(postLogClientEventForAndroidV2_0_0).toBe(postLogClientEventForAndroidV1_1_0);
    expect(postTranslateFinalizeForAndroidV2_0_0).toBe(postTranslateFinalizeForAndroidV1_1_0);
    expect(postTtsInworldForAndroidV2_0_0).toBe(postTtsInworldForAndroidV1_1_0);
    expect(getAccountPreferencesForIosV2_0_0).toBe(getAccountPreferencesForIosV1_1_0);
    expect(patchAccountPreferencesForIosV2_0_0).toBe(patchAccountPreferencesForIosV1_1_0);
    expect(postIosClientVersionPolicyForIosV2_0_0).toBe(postIosClientVersionPolicyForIosV1_1_0);
    expect(getConversationRouteForIosV2_0_0).toBe(getConversationRouteForIosV1_1_0);
    expect(patchConversationRouteForIosV2_0_0).toBe(patchConversationRouteForIosV1_1_0);
    expect(deleteConversationRouteForIosV2_0_0).toBe(deleteConversationRouteForIosV1_1_0);
    expect(getConversationChannelsForIosV2_0_0).toBe(getConversationChannelsForIosV1_1_0);
    expect(postCreateConversationForIosV2_0_0).toBe(postCreateConversationForIosV1_1_0);
    expect(postLogClientEventForIosV2_0_0).toBe(postLogClientEventForIosV1_1_0);
    expect(postTranslateFinalizeForIosV2_0_0).toBe(postTranslateFinalizeForIosV1_1_0);
    expect(postTtsInworldForIosV2_0_0).toBe(postTtsInworldForIosV1_1_0);
  });
});
