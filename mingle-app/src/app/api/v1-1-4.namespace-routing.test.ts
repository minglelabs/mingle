import { describe, expect, it } from "vitest";

import { GET as getFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import {
  GET as getAndroidV1_1_4AccountPreferences,
  PATCH as patchAndroidV1_1_4AccountPreferences,
} from "@/app/api/android/v1.1.4/account/preferences/route";
import { POST as postAndroidV1_1_4ClientVersionPolicy } from "@/app/api/android/v1.1.4/client/version-policy/route";
import {
  DELETE as deleteAndroidV1_1_4Conversation,
  GET as getAndroidV1_1_4Conversation,
  PATCH as patchAndroidV1_1_4Conversation,
} from "@/app/api/android/v1.1.4/conversations/[conversationId]/route";
import {
  GET as getAndroidV1_1_4Conversations,
  POST as postAndroidV1_1_4Conversations,
} from "@/app/api/android/v1.1.4/conversations/route";
import {
  GET as getAndroidV1_1_4Feedback,
  POST as postAndroidV1_1_4Feedback,
} from "@/app/api/android/v1.1.4/feedback/route";
import { POST as postAndroidV1_1_4LogClientEvent } from "@/app/api/android/v1.1.4/log/client-event/route";
import { POST as postAndroidV1_1_4TranslateFinalize } from "@/app/api/android/v1.1.4/translate/finalize/route";
import { POST as postAndroidV1_1_4TtsInworld } from "@/app/api/android/v1.1.4/tts/inworld/route";
import {
  getAccountPreferencesForAndroidV1_1_4,
  patchAccountPreferencesForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV1_1_4,
  getConversationRouteForAndroidV1_1_4,
  patchConversationRouteForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/conversation-controller";
import {
  getConversationChannelsForAndroidV1_1_4,
  postCreateConversationForAndroidV1_1_4,
} from "@/server/api/controllers/android/v1.1.4/conversations-controller";
import { postLogClientEventForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/log-client-event-controller";
import { postTranslateFinalizeForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/tts-inworld-controller";
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
  GET as getIosV1_1_4AccountPreferences,
  PATCH as patchIosV1_1_4AccountPreferences,
} from "@/app/api/ios/v1.1.4/account/preferences/route";
import { POST as postIosV1_1_4ClientVersionPolicy } from "@/app/api/ios/v1.1.4/client/version-policy/route";
import {
  DELETE as deleteIosV1_1_4Conversation,
  GET as getIosV1_1_4Conversation,
  PATCH as patchIosV1_1_4Conversation,
} from "@/app/api/ios/v1.1.4/conversations/[conversationId]/route";
import {
  GET as getIosV1_1_4Conversations,
  POST as postIosV1_1_4Conversations,
} from "@/app/api/ios/v1.1.4/conversations/route";
import {
  GET as getIosV1_1_4Feedback,
  POST as postIosV1_1_4Feedback,
} from "@/app/api/ios/v1.1.4/feedback/route";
import { POST as postIosV1_1_4LogClientEvent } from "@/app/api/ios/v1.1.4/log/client-event/route";
import { POST as postIosV1_1_4TranslateFinalize } from "@/app/api/ios/v1.1.4/translate/finalize/route";
import { POST as postIosV1_1_4TtsInworld } from "@/app/api/ios/v1.1.4/tts/inworld/route";
import {
  getAccountPreferencesForIosV1_1_4,
  patchAccountPreferencesForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/account-preferences-controller";
import { postIosClientVersionPolicyForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/client-version-policy-controller";
import {
  deleteConversationRouteForIosV1_1_4,
  getConversationRouteForIosV1_1_4,
  patchConversationRouteForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/conversation-controller";
import {
  getConversationChannelsForIosV1_1_4,
  postCreateConversationForIosV1_1_4,
} from "@/server/api/controllers/ios/v1.1.4/conversations-controller";
import { postLogClientEventForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/log-client-event-controller";
import { postTranslateFinalizeForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/translate-finalize-controller";
import { postTtsInworldForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/tts-inworld-controller";
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

describe("mingle-app v1.1.4 namespace route wiring", () => {
  it("maps Android v1.1.4 routes to Android v1.1.4 controllers", () => {
    expect(getAndroidV1_1_4AccountPreferences).toBe(getAccountPreferencesForAndroidV1_1_4);
    expect(patchAndroidV1_1_4AccountPreferences).toBe(patchAccountPreferencesForAndroidV1_1_4);
    expect(postAndroidV1_1_4ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_1_4);
    expect(getAndroidV1_1_4Conversation).toBe(getConversationRouteForAndroidV1_1_4);
    expect(patchAndroidV1_1_4Conversation).toBe(patchConversationRouteForAndroidV1_1_4);
    expect(deleteAndroidV1_1_4Conversation).toBe(deleteConversationRouteForAndroidV1_1_4);
    expect(getAndroidV1_1_4Conversations).toBe(getConversationChannelsForAndroidV1_1_4);
    expect(postAndroidV1_1_4Conversations).toBe(postCreateConversationForAndroidV1_1_4);
    expect(getAndroidV1_1_4Feedback).toBe(getFeedback);
    expect(postAndroidV1_1_4Feedback).toBe(postFeedback);
    expect(postAndroidV1_1_4LogClientEvent).toBe(postLogClientEventForAndroidV1_1_4);
    expect(postAndroidV1_1_4TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_1_4);
    expect(postAndroidV1_1_4TtsInworld).toBe(postTtsInworldForAndroidV1_1_4);
  });

  it("maps iOS v1.1.4 routes to iOS v1.1.4 controllers", () => {
    expect(getIosV1_1_4AccountPreferences).toBe(getAccountPreferencesForIosV1_1_4);
    expect(patchIosV1_1_4AccountPreferences).toBe(patchAccountPreferencesForIosV1_1_4);
    expect(postIosV1_1_4ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_1_4);
    expect(getIosV1_1_4Conversation).toBe(getConversationRouteForIosV1_1_4);
    expect(patchIosV1_1_4Conversation).toBe(patchConversationRouteForIosV1_1_4);
    expect(deleteIosV1_1_4Conversation).toBe(deleteConversationRouteForIosV1_1_4);
    expect(getIosV1_1_4Conversations).toBe(getConversationChannelsForIosV1_1_4);
    expect(postIosV1_1_4Conversations).toBe(postCreateConversationForIosV1_1_4);
    expect(getIosV1_1_4Feedback).toBe(getFeedback);
    expect(postIosV1_1_4Feedback).toBe(postFeedback);
    expect(postIosV1_1_4LogClientEvent).toBe(postLogClientEventForIosV1_1_4);
    expect(postIosV1_1_4TranslateFinalize).toBe(postTranslateFinalizeForIosV1_1_4);
    expect(postIosV1_1_4TtsInworld).toBe(postTtsInworldForIosV1_1_4);
  });

  it("keeps v1.1.4 API controllers pinned to v1.1.0 behavior", () => {
    expect(getAccountPreferencesForAndroidV1_1_4).toBe(getAccountPreferencesForAndroidV1_1_0);
    expect(patchAccountPreferencesForAndroidV1_1_4).toBe(patchAccountPreferencesForAndroidV1_1_0);
    expect(postAndroidClientVersionPolicyForAndroidV1_1_4).toBe(postAndroidClientVersionPolicyForAndroidV1_1_0);
    expect(getConversationRouteForAndroidV1_1_4).toBe(getConversationRouteForAndroidV1_1_0);
    expect(patchConversationRouteForAndroidV1_1_4).toBe(patchConversationRouteForAndroidV1_1_0);
    expect(deleteConversationRouteForAndroidV1_1_4).toBe(deleteConversationRouteForAndroidV1_1_0);
    expect(getConversationChannelsForAndroidV1_1_4).toBe(getConversationChannelsForAndroidV1_1_0);
    expect(postCreateConversationForAndroidV1_1_4).toBe(postCreateConversationForAndroidV1_1_0);
    expect(postLogClientEventForAndroidV1_1_4).toBe(postLogClientEventForAndroidV1_1_0);
    expect(postTranslateFinalizeForAndroidV1_1_4).toBe(postTranslateFinalizeForAndroidV1_1_0);
    expect(postTtsInworldForAndroidV1_1_4).toBe(postTtsInworldForAndroidV1_1_0);
    expect(getAccountPreferencesForIosV1_1_4).toBe(getAccountPreferencesForIosV1_1_0);
    expect(patchAccountPreferencesForIosV1_1_4).toBe(patchAccountPreferencesForIosV1_1_0);
    expect(postIosClientVersionPolicyForIosV1_1_4).toBe(postIosClientVersionPolicyForIosV1_1_0);
    expect(getConversationRouteForIosV1_1_4).toBe(getConversationRouteForIosV1_1_0);
    expect(patchConversationRouteForIosV1_1_4).toBe(patchConversationRouteForIosV1_1_0);
    expect(deleteConversationRouteForIosV1_1_4).toBe(deleteConversationRouteForIosV1_1_0);
    expect(getConversationChannelsForIosV1_1_4).toBe(getConversationChannelsForIosV1_1_0);
    expect(postCreateConversationForIosV1_1_4).toBe(postCreateConversationForIosV1_1_0);
    expect(postLogClientEventForIosV1_1_4).toBe(postLogClientEventForIosV1_1_0);
    expect(postTranslateFinalizeForIosV1_1_4).toBe(postTranslateFinalizeForIosV1_1_0);
    expect(postTtsInworldForIosV1_1_4).toBe(postTtsInworldForIosV1_1_0);
  });
});
