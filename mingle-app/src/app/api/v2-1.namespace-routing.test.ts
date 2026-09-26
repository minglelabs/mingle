import { describe, expect, it } from "vitest";

import { GET as getBareFeed } from "@/app/api/feed/route";
import { POST as postBarePosts } from "@/app/api/posts/route";
import { GET as getBareNotifications, PATCH as patchBareNotifications } from "@/app/api/notifications/route";
import { GET as getBareFeedback, POST as postBareFeedback } from "@/app/api/feedback/route";
import { POST as postBareTranslateFinalize } from "@/app/api/translate/finalize/route";
import { POST as postBareTtsInworld } from "@/app/api/tts/inworld/route";
import { POST as postBareLogClientEvent } from "@/app/api/log/client-event/route";
import { POST as postBareClientVersionPolicy } from "@/app/api/client/version-policy/route";
import { GET as getBareAccountPreferences, PATCH as patchBareAccountPreferences } from "@/app/api/account/preferences/route";
import { GET as getBareConversations, POST as postBareConversations } from "@/app/api/conversations/route";
import {
  GET as getBareConversation,
  PATCH as patchBareConversation,
  DELETE as deleteBareConversation,
} from "@/app/api/conversations/[conversationId]/route";

import { GET as getIosV2_1_0Feed } from "@/app/api/ios/v2.1.0/feed/route";
import { POST as postIosV2_1_0Posts } from "@/app/api/ios/v2.1.0/posts/route";
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
import {
  GET as getIosV2_1_0Conversations,
  POST as postIosV2_1_0Conversations,
} from "@/app/api/ios/v2.1.0/conversations/route";
import {
  GET as getIosV2_1_0Conversation,
  PATCH as patchIosV2_1_0Conversation,
  DELETE as deleteIosV2_1_0Conversation,
} from "@/app/api/ios/v2.1.0/conversations/[conversationId]/route";

import { GET as getAndroidV2_1_0Feed } from "@/app/api/android/v2.1.0/feed/route";
import { POST as postAndroidV2_1_0Posts } from "@/app/api/android/v2.1.0/posts/route";
import { GET as getAndroidV2_1_0Notifications, PATCH as patchAndroidV2_1_0Notifications } from "@/app/api/android/v2.1.0/notifications/route";
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

// The 2.1.0 namespace owns the current top-of-tree posting-feed contract, so its
// re-exports point straight at the unversioned handlers (unlike 2.0.x, which
// pinned a prior minor). This suite proves the re-export identity for a
// representative slice of both the posting-feed routes and the inherited routes.
describe("mingle-app v2.1.0 namespace route wiring", () => {
  it("maps iOS v2.1.0 posting-feed routes to the unversioned handlers", () => {
    expect(getIosV2_1_0Feed).toBe(getBareFeed);
    expect(postIosV2_1_0Posts).toBe(postBarePosts);
  });

  it("maps iOS v2.1.0 inherited routes to the unversioned handlers", () => {
    expect(getIosV2_1_0Notifications).toBe(getBareNotifications);
    expect(patchIosV2_1_0Notifications).toBe(patchBareNotifications);
    expect(getIosV2_1_0Feedback).toBe(getBareFeedback);
    expect(postIosV2_1_0Feedback).toBe(postBareFeedback);
    expect(postIosV2_1_0TranslateFinalize).toBe(postBareTranslateFinalize);
    expect(postIosV2_1_0TtsInworld).toBe(postBareTtsInworld);
    expect(postIosV2_1_0LogClientEvent).toBe(postBareLogClientEvent);
    expect(postIosV2_1_0ClientVersionPolicy).toBe(postBareClientVersionPolicy);
    expect(getIosV2_1_0AccountPreferences).toBe(getBareAccountPreferences);
    expect(patchIosV2_1_0AccountPreferences).toBe(patchBareAccountPreferences);
    expect(getIosV2_1_0Conversations).toBe(getBareConversations);
    expect(postIosV2_1_0Conversations).toBe(postBareConversations);
    expect(getIosV2_1_0Conversation).toBe(getBareConversation);
    expect(patchIosV2_1_0Conversation).toBe(patchBareConversation);
    expect(deleteIosV2_1_0Conversation).toBe(deleteBareConversation);
  });

  it("maps Android v2.1.0 posting-feed routes to the unversioned handlers", () => {
    expect(getAndroidV2_1_0Feed).toBe(getBareFeed);
    expect(postAndroidV2_1_0Posts).toBe(postBarePosts);
  });

  it("maps Android v2.1.0 inherited routes to the unversioned handlers", () => {
    expect(getAndroidV2_1_0Notifications).toBe(getBareNotifications);
    expect(patchAndroidV2_1_0Notifications).toBe(patchBareNotifications);
    expect(getAndroidV2_1_0Feedback).toBe(getBareFeedback);
    expect(postAndroidV2_1_0Feedback).toBe(postBareFeedback);
    expect(postAndroidV2_1_0TranslateFinalize).toBe(postBareTranslateFinalize);
    expect(postAndroidV2_1_0TtsInworld).toBe(postBareTtsInworld);
    expect(postAndroidV2_1_0LogClientEvent).toBe(postBareLogClientEvent);
    expect(postAndroidV2_1_0ClientVersionPolicy).toBe(postBareClientVersionPolicy);
    expect(getAndroidV2_1_0AccountPreferences).toBe(getBareAccountPreferences);
    expect(patchAndroidV2_1_0AccountPreferences).toBe(patchBareAccountPreferences);
    expect(getAndroidV2_1_0Conversations).toBe(getBareConversations);
    expect(postAndroidV2_1_0Conversations).toBe(postBareConversations);
    expect(getAndroidV2_1_0Conversation).toBe(getBareConversation);
    expect(patchAndroidV2_1_0Conversation).toBe(patchBareConversation);
    expect(deleteAndroidV2_1_0Conversation).toBe(deleteBareConversation);
  });
});
