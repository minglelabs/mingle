import { describe, expect, it } from "vitest";

import { GET as getBareFeed } from "@/app/api/feed/route";
import { POST as postBarePosts } from "@/app/api/posts/route";
import { GET as getBareNotifications, PATCH as patchBareNotifications } from "@/app/api/notifications/route";
import { GET as getBareFeedback, POST as postBareFeedback } from "@/app/api/feedback/route";

import { postTranslateFinalizeForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/translate-finalize-controller";
import { postTtsInworldForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/tts-inworld-controller";
import { postLogClientEventForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/log-client-event-controller";
import { postIosClientVersionPolicyForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/client-version-policy-controller";
import { getAccountPreferencesForIosV1_1_4, patchAccountPreferencesForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/account-preferences-controller";
import { getConversationChannelsForIosV1_1_4, postCreateConversationForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/conversations-controller";
import { getConversationRouteForIosV1_1_4, patchConversationRouteForIosV1_1_4, deleteConversationRouteForIosV1_1_4 } from "@/server/api/controllers/ios/v1.1.4/conversation-controller";
import { GET as getIosFeed } from "@/app/api/ios/v2.2.0/feed/route";
import { POST as postIosPosts } from "@/app/api/ios/v2.2.0/posts/route";
import { GET as getIosNotifications, PATCH as patchIosNotifications } from "@/app/api/ios/v2.2.0/notifications/route";
import { GET as getIosFeedback, POST as postIosFeedback } from "@/app/api/ios/v2.2.0/feedback/route";
import { POST as postIosTranslateFinalize } from "@/app/api/ios/v2.2.0/translate/finalize/route";
import { POST as postIosTtsInworld } from "@/app/api/ios/v2.2.0/tts/inworld/route";
import { POST as postIosLogClientEvent } from "@/app/api/ios/v2.2.0/log/client-event/route";
import { POST as postIosClientVersionPolicy } from "@/app/api/ios/v2.2.0/client/version-policy/route";
import { GET as getIosAccountPreferences, PATCH as patchIosAccountPreferences } from "@/app/api/ios/v2.2.0/account/preferences/route";
import { GET as getIosConversations, POST as postIosConversations } from "@/app/api/ios/v2.2.0/conversations/route";
import { GET as getIosConversationsConversationid, PATCH as patchIosConversationsConversationid, DELETE as deleteIosConversationsConversationid } from "@/app/api/ios/v2.2.0/conversations/[conversationId]/route";

import { postTranslateFinalizeForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/translate-finalize-controller";
import { postTtsInworldForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/tts-inworld-controller";
import { postLogClientEventForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/log-client-event-controller";
import { postAndroidClientVersionPolicyForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/client-version-policy-controller";
import { getAccountPreferencesForAndroidV1_1_4, patchAccountPreferencesForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/account-preferences-controller";
import { getConversationChannelsForAndroidV1_1_4, postCreateConversationForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/conversations-controller";
import { getConversationRouteForAndroidV1_1_4, patchConversationRouteForAndroidV1_1_4, deleteConversationRouteForAndroidV1_1_4 } from "@/server/api/controllers/android/v1.1.4/conversation-controller";
import { GET as getAndroidFeed } from "@/app/api/android/v2.2.0/feed/route";
import { POST as postAndroidPosts } from "@/app/api/android/v2.2.0/posts/route";
import { GET as getAndroidNotifications, PATCH as patchAndroidNotifications } from "@/app/api/android/v2.2.0/notifications/route";
import { GET as getAndroidFeedback, POST as postAndroidFeedback } from "@/app/api/android/v2.2.0/feedback/route";
import { POST as postAndroidTranslateFinalize } from "@/app/api/android/v2.2.0/translate/finalize/route";
import { POST as postAndroidTtsInworld } from "@/app/api/android/v2.2.0/tts/inworld/route";
import { POST as postAndroidLogClientEvent } from "@/app/api/android/v2.2.0/log/client-event/route";
import { POST as postAndroidClientVersionPolicy } from "@/app/api/android/v2.2.0/client/version-policy/route";
import { GET as getAndroidAccountPreferences, PATCH as patchAndroidAccountPreferences } from "@/app/api/android/v2.2.0/account/preferences/route";
import { GET as getAndroidConversations, POST as postAndroidConversations } from "@/app/api/android/v2.2.0/conversations/route";
import { GET as getAndroidConversationsConversationid, PATCH as patchAndroidConversationsConversationid, DELETE as deleteAndroidConversationsConversationid } from "@/app/api/android/v2.2.0/conversations/[conversationId]/route";

// v2.2.0 is the oldest namespace with its own route tree. Routes that the older
// namespaces pinned to platform controllers (e.g. conversations -> the v1.1.4
// channel controller) keep that wiring, now written directly in the v2.2.0
// route file; the rest serve the unversioned handlers. Pointing a pinned route
// at the unversioned handler would silently change what a 2.2.0 client gets.
describe("mingle-app v2.2.0 namespace route wiring", () => {
  it("serves ios v2.2.0 shared routes from the unversioned handlers", () => {
    expect(getIosFeed).toBe(getBareFeed);
    expect(postIosPosts).toBe(postBarePosts);
    expect(getIosNotifications).toBe(getBareNotifications);
    expect(patchIosNotifications).toBe(patchBareNotifications);
    expect(getIosFeedback).toBe(getBareFeedback);
    expect(postIosFeedback).toBe(postBareFeedback);
  });

  it("keeps ios v2.2.0 pinned routes on the ios v1.1.4 platform controllers", () => {
    expect(postIosTranslateFinalize).toBe(postTranslateFinalizeForIosV1_1_4);
    expect(postIosTtsInworld).toBe(postTtsInworldForIosV1_1_4);
    expect(postIosLogClientEvent).toBe(postLogClientEventForIosV1_1_4);
    expect(postIosClientVersionPolicy).toBe(postIosClientVersionPolicyForIosV1_1_4);
    expect(getIosAccountPreferences).toBe(getAccountPreferencesForIosV1_1_4);
    expect(patchIosAccountPreferences).toBe(patchAccountPreferencesForIosV1_1_4);
    expect(getIosConversations).toBe(getConversationChannelsForIosV1_1_4);
    expect(postIosConversations).toBe(postCreateConversationForIosV1_1_4);
    expect(getIosConversationsConversationid).toBe(getConversationRouteForIosV1_1_4);
    expect(patchIosConversationsConversationid).toBe(patchConversationRouteForIosV1_1_4);
    expect(deleteIosConversationsConversationid).toBe(deleteConversationRouteForIosV1_1_4);
  });

  it("serves android v2.2.0 shared routes from the unversioned handlers", () => {
    expect(getAndroidFeed).toBe(getBareFeed);
    expect(postAndroidPosts).toBe(postBarePosts);
    expect(getAndroidNotifications).toBe(getBareNotifications);
    expect(patchAndroidNotifications).toBe(patchBareNotifications);
    expect(getAndroidFeedback).toBe(getBareFeedback);
    expect(postAndroidFeedback).toBe(postBareFeedback);
  });

  it("keeps android v2.2.0 pinned routes on the android v1.1.4 platform controllers", () => {
    expect(postAndroidTranslateFinalize).toBe(postTranslateFinalizeForAndroidV1_1_4);
    expect(postAndroidTtsInworld).toBe(postTtsInworldForAndroidV1_1_4);
    expect(postAndroidLogClientEvent).toBe(postLogClientEventForAndroidV1_1_4);
    expect(postAndroidClientVersionPolicy).toBe(postAndroidClientVersionPolicyForAndroidV1_1_4);
    expect(getAndroidAccountPreferences).toBe(getAccountPreferencesForAndroidV1_1_4);
    expect(patchAndroidAccountPreferences).toBe(patchAccountPreferencesForAndroidV1_1_4);
    expect(getAndroidConversations).toBe(getConversationChannelsForAndroidV1_1_4);
    expect(postAndroidConversations).toBe(postCreateConversationForAndroidV1_1_4);
    expect(getAndroidConversationsConversationid).toBe(getConversationRouteForAndroidV1_1_4);
    expect(patchAndroidConversationsConversationid).toBe(patchConversationRouteForAndroidV1_1_4);
    expect(deleteAndroidConversationsConversationid).toBe(deleteConversationRouteForAndroidV1_1_4);
  });
});
