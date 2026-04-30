import { describe, expect, it } from "vitest";

import { GET as getFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import {
  GET as getAndroidV1_1_3AccountPreferences,
  PATCH as patchAndroidV1_1_3AccountPreferences,
} from "@/app/api/android/v1.1.3/account/preferences/route";
import { POST as postAndroidV1_1_3ClientVersionPolicy } from "@/app/api/android/v1.1.3/client/version-policy/route";
import {
  DELETE as deleteAndroidV1_1_3Conversation,
  GET as getAndroidV1_1_3Conversation,
  PATCH as patchAndroidV1_1_3Conversation,
} from "@/app/api/android/v1.1.3/conversations/[conversationId]/route";
import {
  GET as getAndroidV1_1_3Conversations,
  POST as postAndroidV1_1_3Conversations,
} from "@/app/api/android/v1.1.3/conversations/route";
import {
  GET as getAndroidV1_1_3Feedback,
  POST as postAndroidV1_1_3Feedback,
} from "@/app/api/android/v1.1.3/feedback/route";
import { POST as postAndroidV1_1_3LogClientEvent } from "@/app/api/android/v1.1.3/log/client-event/route";
import { POST as postAndroidV1_1_3TranslateFinalize } from "@/app/api/android/v1.1.3/translate/finalize/route";
import { POST as postAndroidV1_1_3TtsInworld } from "@/app/api/android/v1.1.3/tts/inworld/route";
import {
  getAccountPreferencesForAndroidV1_1_3,
  patchAccountPreferencesForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/account-preferences-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_3 } from "@/server/api/controllers/android/v1.1.3/client-version-policy-controller";
import {
  deleteConversationRouteForAndroidV1_1_3,
  getConversationRouteForAndroidV1_1_3,
  patchConversationRouteForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/conversation-controller";
import {
  getConversationChannelsForAndroidV1_1_3,
  postCreateConversationForAndroidV1_1_3,
} from "@/server/api/controllers/android/v1.1.3/conversations-controller";
import { postLogClientEventForAndroidV1_1_3 } from "@/server/api/controllers/android/v1.1.3/log-client-event-controller";
import { postTranslateFinalizeForAndroidV1_1_3 } from "@/server/api/controllers/android/v1.1.3/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_3 } from "@/server/api/controllers/android/v1.1.3/tts-inworld-controller";
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
  GET as getIosV1_1_3AccountPreferences,
  PATCH as patchIosV1_1_3AccountPreferences,
} from "@/app/api/ios/v1.1.3/account/preferences/route";
import { POST as postIosV1_1_3ClientVersionPolicy } from "@/app/api/ios/v1.1.3/client/version-policy/route";
import {
  DELETE as deleteIosV1_1_3Conversation,
  GET as getIosV1_1_3Conversation,
  PATCH as patchIosV1_1_3Conversation,
} from "@/app/api/ios/v1.1.3/conversations/[conversationId]/route";
import {
  GET as getIosV1_1_3Conversations,
  POST as postIosV1_1_3Conversations,
} from "@/app/api/ios/v1.1.3/conversations/route";
import {
  GET as getIosV1_1_3Feedback,
  POST as postIosV1_1_3Feedback,
} from "@/app/api/ios/v1.1.3/feedback/route";
import { POST as postIosV1_1_3LogClientEvent } from "@/app/api/ios/v1.1.3/log/client-event/route";
import { POST as postIosV1_1_3TranslateFinalize } from "@/app/api/ios/v1.1.3/translate/finalize/route";
import { POST as postIosV1_1_3TtsInworld } from "@/app/api/ios/v1.1.3/tts/inworld/route";
import {
  getAccountPreferencesForIosV1_1_3,
  patchAccountPreferencesForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/account-preferences-controller";
import { postIosClientVersionPolicyForIosV1_1_3 } from "@/server/api/controllers/ios/v1.1.3/client-version-policy-controller";
import {
  deleteConversationRouteForIosV1_1_3,
  getConversationRouteForIosV1_1_3,
  patchConversationRouteForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/conversation-controller";
import {
  getConversationChannelsForIosV1_1_3,
  postCreateConversationForIosV1_1_3,
} from "@/server/api/controllers/ios/v1.1.3/conversations-controller";
import { postLogClientEventForIosV1_1_3 } from "@/server/api/controllers/ios/v1.1.3/log-client-event-controller";
import { postTranslateFinalizeForIosV1_1_3 } from "@/server/api/controllers/ios/v1.1.3/translate-finalize-controller";
import { postTtsInworldForIosV1_1_3 } from "@/server/api/controllers/ios/v1.1.3/tts-inworld-controller";
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

describe("mingle-app v1.1.3 namespace route wiring", () => {
  it("maps Android v1.1.3 routes to Android v1.1.3 controllers", () => {
    expect(getAndroidV1_1_3AccountPreferences).toBe(getAccountPreferencesForAndroidV1_1_3);
    expect(patchAndroidV1_1_3AccountPreferences).toBe(patchAccountPreferencesForAndroidV1_1_3);
    expect(postAndroidV1_1_3ClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_1_3);
    expect(getAndroidV1_1_3Conversation).toBe(getConversationRouteForAndroidV1_1_3);
    expect(patchAndroidV1_1_3Conversation).toBe(patchConversationRouteForAndroidV1_1_3);
    expect(deleteAndroidV1_1_3Conversation).toBe(deleteConversationRouteForAndroidV1_1_3);
    expect(getAndroidV1_1_3Conversations).toBe(getConversationChannelsForAndroidV1_1_3);
    expect(postAndroidV1_1_3Conversations).toBe(postCreateConversationForAndroidV1_1_3);
    expect(getAndroidV1_1_3Feedback).toBe(getFeedback);
    expect(postAndroidV1_1_3Feedback).toBe(postFeedback);
    expect(postAndroidV1_1_3LogClientEvent).toBe(postLogClientEventForAndroidV1_1_3);
    expect(postAndroidV1_1_3TranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_1_3);
    expect(postAndroidV1_1_3TtsInworld).toBe(postTtsInworldForAndroidV1_1_3);
  });

  it("maps iOS v1.1.3 routes to iOS v1.1.3 controllers", () => {
    expect(getIosV1_1_3AccountPreferences).toBe(getAccountPreferencesForIosV1_1_3);
    expect(patchIosV1_1_3AccountPreferences).toBe(patchAccountPreferencesForIosV1_1_3);
    expect(postIosV1_1_3ClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_1_3);
    expect(getIosV1_1_3Conversation).toBe(getConversationRouteForIosV1_1_3);
    expect(patchIosV1_1_3Conversation).toBe(patchConversationRouteForIosV1_1_3);
    expect(deleteIosV1_1_3Conversation).toBe(deleteConversationRouteForIosV1_1_3);
    expect(getIosV1_1_3Conversations).toBe(getConversationChannelsForIosV1_1_3);
    expect(postIosV1_1_3Conversations).toBe(postCreateConversationForIosV1_1_3);
    expect(getIosV1_1_3Feedback).toBe(getFeedback);
    expect(postIosV1_1_3Feedback).toBe(postFeedback);
    expect(postIosV1_1_3LogClientEvent).toBe(postLogClientEventForIosV1_1_3);
    expect(postIosV1_1_3TranslateFinalize).toBe(postTranslateFinalizeForIosV1_1_3);
    expect(postIosV1_1_3TtsInworld).toBe(postTtsInworldForIosV1_1_3);
  });

  it("keeps v1.1.3 API controllers pinned to v1.1.0 behavior", () => {
    expect(getAccountPreferencesForAndroidV1_1_3).toBe(getAccountPreferencesForAndroidV1_1_0);
    expect(patchAccountPreferencesForAndroidV1_1_3).toBe(patchAccountPreferencesForAndroidV1_1_0);
    expect(postAndroidClientVersionPolicyForAndroidV1_1_3).toBe(postAndroidClientVersionPolicyForAndroidV1_1_0);
    expect(getConversationRouteForAndroidV1_1_3).toBe(getConversationRouteForAndroidV1_1_0);
    expect(patchConversationRouteForAndroidV1_1_3).toBe(patchConversationRouteForAndroidV1_1_0);
    expect(deleteConversationRouteForAndroidV1_1_3).toBe(deleteConversationRouteForAndroidV1_1_0);
    expect(getConversationChannelsForAndroidV1_1_3).toBe(getConversationChannelsForAndroidV1_1_0);
    expect(postCreateConversationForAndroidV1_1_3).toBe(postCreateConversationForAndroidV1_1_0);
    expect(postLogClientEventForAndroidV1_1_3).toBe(postLogClientEventForAndroidV1_1_0);
    expect(postTranslateFinalizeForAndroidV1_1_3).toBe(postTranslateFinalizeForAndroidV1_1_0);
    expect(postTtsInworldForAndroidV1_1_3).toBe(postTtsInworldForAndroidV1_1_0);
    expect(getAccountPreferencesForIosV1_1_3).toBe(getAccountPreferencesForIosV1_1_0);
    expect(patchAccountPreferencesForIosV1_1_3).toBe(patchAccountPreferencesForIosV1_1_0);
    expect(postIosClientVersionPolicyForIosV1_1_3).toBe(postIosClientVersionPolicyForIosV1_1_0);
    expect(getConversationRouteForIosV1_1_3).toBe(getConversationRouteForIosV1_1_0);
    expect(patchConversationRouteForIosV1_1_3).toBe(patchConversationRouteForIosV1_1_0);
    expect(deleteConversationRouteForIosV1_1_3).toBe(deleteConversationRouteForIosV1_1_0);
    expect(getConversationChannelsForIosV1_1_3).toBe(getConversationChannelsForIosV1_1_0);
    expect(postCreateConversationForIosV1_1_3).toBe(postCreateConversationForIosV1_1_0);
    expect(postLogClientEventForIosV1_1_3).toBe(postLogClientEventForIosV1_1_0);
    expect(postTranslateFinalizeForIosV1_1_3).toBe(postTranslateFinalizeForIosV1_1_0);
    expect(postTtsInworldForIosV1_1_3).toBe(postTtsInworldForIosV1_1_0);
  });
});
