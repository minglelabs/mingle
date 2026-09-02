import { Prisma } from "@prisma/client/index";
import { prisma } from "@/lib/prisma";
import { deriveDefaultSttLanguagesForLocale, sanitizeSttLanguageSelection } from "@/lib/stt-languages";
import { formatLocalizedConversationTitle } from "@/i18n/conversations";

export const APP_CONVERSATION_STATUS_ACTIVE = "active";
export const APP_CONVERSATION_STATUS_PAUSED = "paused";
export const CONVERSATION_HYDRATION_MESSAGE_LIMIT = 100;
// Total people in a room, including the creator — matches the invite
// picker's selection cap.
export const MAX_CONVERSATION_MEMBERS = 10;

export type AppConversationChannelStatus =
  | typeof APP_CONVERSATION_STATUS_ACTIVE
  | typeof APP_CONVERSATION_STATUS_PAUSED;

export type ConversationChannelOtherMember = {
  userId: string;
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

export type ConversationChannelSummary = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: AppConversationChannelStatus;
  sessionKey: string;
  // True once the room effectively contains 2+ accounts, including an
  // invitee waiting for first-message materialization. Solo rooms use the
  // generated per-speaker-turn diarization avatar system instead of real
  // account identity, so the client needs this to decide which avatar
  // system a bubble belongs to.
  isMultiMember: boolean;
  // True when this is a 2-real-member room and a block exists between the
  // viewer and the other member (either direction). The room stays in the
  // list (never deleted), but the client should render the counterpart as a
  // generic placeholder, refuse to open their profile, and hide the
  // composer/mic in favor of a "blocked" message — see
  // resolveBlockedCounterpartUserIdByChannelId.
  isBlockedCounterpart: boolean;
  messageCount?: number;
  // Number of visible messages sent by another room member after the viewer
  // last opened this room. Kept optional for conversation-shell responses.
  unreadMessageCount?: number;
  selectedLanguages?: string[];
  // language code -> ids of the members who picked it. Only populated for
  // multi-member rooms; empty for solo rooms (nothing to attribute).
  selectedLanguagesAttribution?: Record<string, string[]>;
  // The caller's OWN selected languages, distinct from `selectedLanguages`
  // (the room union) above once a room has 2+ members — this is what a tap
  // on the language picker should add/remove from, and what gets PATCHed
  // back. Solo rooms: identical to `selectedLanguages`.
  viewerSelectedLanguages?: string[];
  speechLanguages?: string[];
  translationLanguagesLinked?: boolean;
  defaultDisplayLanguage?: string | null;
  latestMessagePreview?: string;
  latestMessageAt?: string | null;
  latestSpeaker?: string | null;
  latestSpeakerAvatarSeed?: string | null;
  latestSpeakerAvatarIndex?: number | null;
  // Every OTHER real or pending member's profile photo, for the conversation
  // list's room avatar: a 2-person room shows the counterpart's real photo
  // instead of the generated per-speaker-turn avatar; a 3+ person room stacks
  // up to 4 of these KakaoTalk-style. Empty for solo rooms and anonymous
  // callers.
  otherMembers: ConversationChannelOtherMember[];
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
};

export type ConversationHydrationUtterance = {
  id: string;
  originalText: string;
  originalLang: string;
  targetLanguages: string[];
  translations: Record<string, string>;
  translationFinalized: Record<string, boolean>;
  createdAtMs: number;
  speaker: string | null;
  speakerAvatarSeed: string | null;
  speakerAvatarIndex: number | null;
  // The sender's real profile name for shared-room bubbles. This stays null
  // for solo-room diarization turns, where `speaker` is not an account name.
  speakerName: string | null;
  // The real account that sent this message, if any — lets the client tell
  // "mine" from "theirs" for bubble alignment. Distinct from `speaker`, which
  // is a free-text diarization label used inside a single solo session.
  speakerUserId: string | null;
  // The sender's real uploaded profile photo, populated only once the room
  // has 2+ real members. Null in a solo room, where bubbles keep using the
  // generated animal avatar instead.
  speakerImage: string | null;
};

export type ConversationHydrationCursor = {
  createdAtMs: number;
  messageId: string;
};

// One member's departure (see leaveConversationChannel), for the client to
// render as an in-timeline "{name} left" notice positioned by leftAtMs
// against the surrounding utterances' createdAtMs. This is UI chrome, not a
// translated message — no AppMessage row is created for it, and the client
// is expected to render the notice text itself from its own locale copy
// (same approach as the delete confirmation dialog's copy file).
export type ConversationHydrationLeaveNotice = {
  userId: string;
  name: string | null;
  handle: string | null;
  leftAtMs: number;
};

// One AppConversationChannelInvite row (see its doc comment), for the client
// to render as an in-timeline "{inviter} invited {invitee}" notice, written
// the moment the invite happens rather than deferred to materialization —
// same "UI chrome, not a translated message" treatment as leave notices.
export type ConversationHydrationInviteNotice = {
  inviteeUserId: string;
  inviteeName: string | null;
  inviteeHandle: string | null;
  invitedByUserId: string;
  invitedByName: string | null;
  invitedByHandle: string | null;
  invitedAtMs: number;
};

export type ConversationHydrationState = {
  conversation: ConversationChannelSummary;
  usageSec: number;
  messageCount: number;
  utterances: ConversationHydrationUtterance[];
  hasMoreUtterances: boolean;
  oldestMessageCursor: ConversationHydrationCursor | null;
  leaveNotices: ConversationHydrationLeaveNotice[];
  inviteNotices: ConversationHydrationInviteNotice[];
};

type ConversationChannelRecord = {
  id: string;
  sequenceNumber: number;
  title: string;
  status: string;
  sessionKey: string;
  selectedLanguages: string[];
  speechLanguages: string[];
  translationLanguagesLinked: boolean;
  defaultDisplayLanguage: string | null;
  pendingInviteeUserIds: string[];
  createdAt: Date;
  updatedAt: Date;
  pausedAt: Date | null;
  userEditedTitleAt: Date | null;
};

type ListConversationChannelsForUserOptions = {
  includeMessageSummaries?: boolean;
};

const conversationChannelSelect = {
  id: true,
  sequenceNumber: true,
  title: true,
  status: true,
  sessionKey: true,
  selectedLanguages: true,
  speechLanguages: true,
  translationLanguagesLinked: true,
  defaultDisplayLanguage: true,
  pendingInviteeUserIds: true,
  createdAt: true,
  updatedAt: true,
  pausedAt: true,
  userEditedTitleAt: true,
} satisfies Prisma.AppConversationChannelSelect;

// A pending invitee (see AppConversationChannel.pendingInviteeUserIds) has no
// membership row yet, but the room is unambiguously going to be multi-member
// from the inviter's perspective the moment they invited a specific person —
// treating it as solo until the invitee's first-message materialization would
// make the title, language union/attribution, and bubble self/other alignment
// all flicker from solo-room behavior to shared-room behavior mid-session
// (confirmed: this exact flicker was reported after adding deferred
// materialization — everything renders correctly again after a leave/re-enter
// forces a fresh fetch, because by then materialization has already run).
function resolveEffectiveMemberCount(
  members: ChannelMemberProfile[] | undefined,
  pendingInviteeUserIds: string[] | undefined,
): number {
  return (members?.length ?? 0) + (pendingInviteeUserIds?.length ?? 0);
}

function buildVisibleConversationWhere(): Prisma.AppConversationChannelWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function buildVisibleMessageWhere(): Prisma.AppMessageWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

function buildVisibleMessageContentWhere(): Prisma.AppMessageContentWhereInput {
  return {
    OR: [
      { isDeleted: false },
      { isDeleted: null },
    ],
  };
}

// Every read/update on a channel is gated on membership, not ownership, so a
// non-owner member (someone invited into a multi-member room) can use it too.
// ownerUserId stays on the channel purely as creator/admin metadata (it drives
// sequenceNumber numbering and delete permission) — it is not an auth check.
// leftAt: null excludes a member who has left (see leaveConversationChannel)
// — their membership row is kept for history, but the room must behave as if
// it doesn't exist for them: no more reads, writes, or dedup matches.
function buildVisibleMembershipWhere(userId: string): Prisma.AppConversationChannelWhereInput {
  return {
    members: { some: { userId, leftAt: null } },
  };
}

type ChannelMemberProfile = {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  displayLanguage: string | null;
  defaultDisplayLanguage: string | null;
  selectedLanguages: string[];
  nationality: string | null;
  primaryLanguages: string[];
  status: string;
  pausedAt: Date | null;
  lastReadAt: Date | null;
  joinedAt: Date;
  // Set once this member leaves the room (see leaveConversationChannel). Most
  // resolvers below should filter to active (leftAt: null) members — see
  // filterActiveMembers — except the ones that intentionally preserve a
  // departed member's presence: title, avatar, and isMultiMember.
  leftAt: Date | null;
};

// Active-membership filter shared by every resolver that represents a
// member's OWN ongoing state (status, pause, language, dedup matching,
// message permission) — a departed member has none of that anymore. Callers
// that instead need the room's full identity/history (title, avatars,
// isMultiMember) intentionally pass the unfiltered member list.
function filterActiveMembers(members: ChannelMemberProfile[] | undefined): ChannelMemberProfile[] {
  return (members ?? []).filter((member) => !member.leftAt);
}

// Point-in-time membership count, for per-message bubble attribution (see
// its use in getConversationHydrationStateForUser): a message's
// speakerUserId/speakerImage should reflect whether the room WAS
// multi-member (2+ real members) at the moment THAT message was sent, not
// the room's current membership. This is what keeps a room's bubble
// history stable across membership changes — a message sent while the room
// had 2 real members keeps its right-aligned/real-photo attribution
// forever, even after that second member later leaves and the room reverts
// to solo-style rendering for NEW messages. Confirmed with the user.
function countActiveRealMembersAt(members: ChannelMemberProfile[], atMs: number): number {
  return members.filter((member) => {
    // joinedAt is NOT NULL in the schema — the instanceof guard only covers
    // test doubles that omit it, defaulting a member with no known join
    // time to "has always been here" rather than throwing.
    const joinedAtMs = member.joinedAt instanceof Date ? member.joinedAt.getTime() : 0;
    const leftAtMs = member.leftAt instanceof Date ? member.leftAt.getTime() : null;
    return joinedAtMs <= atMs && (leftAtMs === null || leftAtMs > atMs);
  }).length;
}

type PendingInviteeProfile = {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  defaultConversationLanguages: string[];
  defaultDisplayLanguage: string | null;
  nationality: string | null;
  primaryLanguages: string[];
};

function resolveDefaultConversationLanguages(
  rawValue: unknown,
  locale?: string | null,
): string[] {
  const fallbackLanguages = deriveDefaultSttLanguagesForLocale(locale);
  const normalizedLanguages = sanitizeSttLanguageSelection(
    rawValue,
    fallbackLanguages,
  );
  // Keep this defensive fallback for older test doubles and any future
  // sanitizer implementation that declines to apply its fallback argument.
  return normalizedLanguages.length > 0 ? normalizedLanguages : fallbackLanguages;
}

async function listUserDefaultConversationLanguagesById(
  userIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueUserIds = [...new Set(userIds.filter((userId) => userId.trim()))];
  if (uniqueUserIds.length === 0) return new Map();

  const rows = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, defaultConversationLanguages: true },
  });

  return new Map(rows.map((row) => [
    row.id,
    resolveDefaultConversationLanguages(row.defaultConversationLanguages),
  ]));
}

function resolvePersistedDisplayLanguage(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") return null;
  return sanitizeSttLanguageSelection([rawValue])[0] ?? null;
}

async function listUserDefaultDisplayLanguagesById(
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueUserIds = [...new Set(userIds.filter((userId) => userId.trim()))];
  if (uniqueUserIds.length === 0) return new Map();

  const rows = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, defaultDisplayLanguage: true },
  });

  return new Map(
    rows.flatMap((row) => {
      const language = resolvePersistedDisplayLanguage(row.defaultDisplayLanguage);
      return language ? [[row.id, language] as const] : [];
    }),
  );
}

// A pending invitee has no membership row to resolve a name/handle from (see
// resolveEffectiveMemberCount), so the 2-person title override needs a
// separate lookup just for display/language attribution — batched across every
// record being serialized, same pattern as listChannelMembersByChannelId.
async function listPendingInviteeProfilesByUserIds(
  userIds: string[],
): Promise<Map<string, PendingInviteeProfile>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
      imageCropScale: true,
      imageCropX: true,
      imageCropY: true,
      defaultConversationLanguages: true,
      defaultDisplayLanguage: true,
      nationality: true,
      primaryLanguages: true,
    },
  });
  return new Map(rows.map((row) => {
    const normalizedNationality = row.nationality
      ? sanitizeSttLanguageSelection([row.nationality])[0] ?? null
      : null;
    const primaryLanguages = sanitizeSttLanguageSelection(
      row.primaryLanguages,
      normalizedNationality ? [normalizedNationality] : [],
    );
    return [row.id, {
      userId: row.id,
      name: row.name,
      handle: row.handle,
      image: row.image,
      imageCropScale: row.imageCropScale,
      imageCropX: row.imageCropX,
      imageCropY: row.imageCropY,
      defaultConversationLanguages: resolveDefaultConversationLanguages(row.defaultConversationLanguages),
      defaultDisplayLanguage: resolvePersistedDisplayLanguage(row.defaultDisplayLanguage),
      nationality: primaryLanguages[0] ?? normalizedNationality,
      primaryLanguages,
    }];
  }));
}

async function listChannelMembersByChannelId(
  channelIds: string[],
): Promise<Map<string, ChannelMemberProfile[]>> {
  if (channelIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.appConversationChannelMember.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { joinedAt: "asc" },
    select: {
      channelId: true,
      userId: true,
      displayLanguage: true,
      selectedLanguages: true,
      status: true,
      pausedAt: true,
      lastReadAt: true,
      joinedAt: true,
      leftAt: true,
      user: {
        select: {
          name: true,
          handle: true,
          image: true,
          imageCropScale: true,
          imageCropX: true,
          imageCropY: true,
          defaultConversationLanguages: true,
          defaultDisplayLanguage: true,
          nationality: true,
          primaryLanguages: true,
        },
      },
    },
  });

  const membersByChannelId = new Map<string, ChannelMemberProfile[]>();
  for (const row of rows) {
    const members = membersByChannelId.get(row.channelId) ?? [];
    const persistedSelectedLanguages = sanitizeSttLanguageSelection(row.selectedLanguages);
    const selectedLanguages = persistedSelectedLanguages.length > 0
      ? persistedSelectedLanguages
      : resolveDefaultConversationLanguages(row.user.defaultConversationLanguages);
    const normalizedNationality = row.user.nationality
      ? sanitizeSttLanguageSelection([row.user.nationality])[0] ?? null
      : null;
    const primaryLanguages = sanitizeSttLanguageSelection(
      row.user.primaryLanguages,
      normalizedNationality ? [normalizedNationality] : [],
    );
    members.push({
      userId: row.userId,
      name: row.user.name,
      handle: row.user.handle,
      image: row.user.image,
      imageCropScale: row.user.imageCropScale,
      imageCropX: row.user.imageCropX,
      imageCropY: row.user.imageCropY,
      displayLanguage: row.displayLanguage,
      defaultDisplayLanguage: resolvePersistedDisplayLanguage(row.user.defaultDisplayLanguage),
      // Existing shared-room rows can predate per-member language
      // initialization. Treat an empty row as "use this user's persisted
      // conversation defaults" so the first shared-room response contains
      // both members' real preferences instead of making the counterpart
      // disappear from the union.
      selectedLanguages,
      // Account-level "주 사용 언어" profile badge — public the same way
      // name/handle are (see GET /api/users/[userId], which already exposes
      // this to other users), not the per-room STT selection above.
      nationality: primaryLanguages[0] ?? normalizedNationality,
      primaryLanguages,
      status: row.status,
      pausedAt: row.pausedAt,
      lastReadAt: row.lastReadAt,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
    });
    membersByChannelId.set(row.channelId, members);
  }
  return membersByChannelId;
}

// A block between the viewer and their only other real member turns the
// room into a dead end, KakaoTalk-style: the room stays in the list, but
// the counterpart's identity is hidden and no further messages can flow in
// either direction. Scoped to rooms with EXACTLY 2 real members — a block
// against one member of a 3+ person room doesn't kill the whole room.
// Directional doesn't matter here: a block from either side hides the
// other, matching how materializePendingConversationInvitees already
// treats a block in either direction as blocking.
async function resolveBlockedCounterpartUserIdByChannelId(
  viewerUserId: string,
  membersByChannelId: Map<string, ChannelMemberProfile[]>,
): Promise<Map<string, string>> {
  const otherUserIdByChannelId = new Map<string, string>();
  const candidateOtherUserIds = new Set<string>();
  for (const [channelId, members] of membersByChannelId.entries()) {
    if (members.length !== 2) continue;
    const other = members.find((member) => member.userId !== viewerUserId);
    if (!other) continue;
    otherUserIdByChannelId.set(channelId, other.userId);
    candidateOtherUserIds.add(other.userId);
  }
  if (candidateOtherUserIds.size === 0) return new Map();

  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [...candidateOtherUserIds].flatMap((otherUserId) => [
        { blockerId: viewerUserId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: viewerUserId },
      ]),
    },
    select: { blockerId: true, blockedId: true },
  });
  if (blocks.length === 0) return new Map();
  const blockedOtherUserIds = new Set(
    blocks.map((block) => (block.blockerId === viewerUserId ? block.blockedId : block.blockerId)),
  );

  const result = new Map<string, string>();
  for (const [channelId, otherUserId] of otherUserIdByChannelId.entries()) {
    if (blockedOtherUserIds.has(otherUserId)) {
      result.set(channelId, otherUserId);
    }
  }
  return result;
}

// A shared room's title should read as "who else is in it," not a generic
// auto-generated label — and that label is different depending on who's
// looking, so it's computed at read time from membership, never stored.
// 2 members: the other person's name. 3+: every other member's name,
// comma-joined (e.g. "a, b, c"). Solo (0-1 members) keeps the stored title.
// Once someone has left (see leaveConversationChannel), they immediately
// drop out of this list — the title reflects who's CURRENTLY in the room,
// not room history, so a 2-person room whose only other member left falls
// back to the stored/generic title (nobody left to name). A room the
// members have manually renamed (userEditedTitleAt set) always keeps that
// title instead — auto-naming only applies to the untouched default.
function resolveViewerFacingTitle(
  storedTitle: string,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  pendingInviteeProfiles: Array<{ userId: string; name: string | null; handle: string | null }> = [],
  userEditedTitleAt?: Date | null,
): string {
  if (userEditedTitleAt) return storedTitle;
  if (!viewerUserId || !members) return storedTitle;
  if (resolveEffectiveMemberCount(members, pendingInviteeProfiles.map((p) => p.userId)) < 2) return storedTitle;
  const others = [
    ...filterActiveMembers(members).filter((member) => member.userId !== viewerUserId),
    ...pendingInviteeProfiles,
  ];
  if (others.length === 0) return storedTitle;
  const names = others.map((member) => member.name?.trim() || member.handle?.trim() || "").filter(Boolean);
  if (names.length === 0) return storedTitle;
  return names.join(", ");
}

// Once a room has 2+ real or pending members, one shared "display language" can't
// represent everyone's own reading preference — each member reads translated
// bubbles in their own language, sourced from their own membership row.
// Solo rooms (0-1 members) keep using the channel-wide value untouched.
function resolveViewerFacingDisplayLanguage(
  channelWideValue: string | null,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  pendingInviteeUserIds: string[] = [],
  pendingInviteeProfiles: PendingInviteeProfile[] = [],
): string | null {
  if (!viewerUserId || !members) return channelWideValue;
  if (resolveEffectiveMemberCount(members, pendingInviteeUserIds) < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  const pendingViewer = pendingInviteeProfiles.find((profile) => profile.userId === viewerUserId);
  return viewerMember?.displayLanguage?.trim()
    || viewerMember?.defaultDisplayLanguage?.trim()
    || pendingViewer?.defaultDisplayLanguage?.trim()
    || channelWideValue;
}

// Once a room has 2+ real or pending members, one person's language
// selection shouldn't hide another member's still-wanted language from the
// shared picker — the picker shows the UNION of everyone's own
// selectedLanguages, each row attributed to whoever picked it. An empty
// membership row is resolved to that user's persisted conversation defaults
// by listChannelMembersByChannelId, and pending invitees are resolved from
// their user profile below. Solo rooms (0-1 total members) keep the
// channel-wide list as-is, with no attribution.
function resolveRoomLanguageUnion(
  channelWideSelectedLanguages: string[],
  members: ChannelMemberProfile[] | undefined,
  pendingInviteeUserIds: string[] = [],
  viewerUserId?: string | null,
  pendingInviteeProfiles: PendingInviteeProfile[] = [],
): { languages: string[]; attribution: Record<string, string[]> } {
  if (!members || resolveEffectiveMemberCount(members, pendingInviteeUserIds) < 2) {
    return { languages: [...channelWideSelectedLanguages], attribution: {} };
  }

  const attribution: Record<string, string[]> = {};
  const languageOrder: string[] = [];
  const addMemberLanguages = (userId: string, selectedLanguages: readonly string[]) => {
    for (const language of selectedLanguages) {
      if (!attribution[language]) {
        attribution[language] = [];
        languageOrder.push(language);
      }
      if (!attribution[language].includes(userId)) {
        attribution[language].push(userId);
      }
    }
  };

  // A departed member (leftAt set) no longer contributes a "still wanted"
  // language to the room's shared translation target list — see
  // filterActiveMembers.
  for (const member of filterActiveMembers(members)) {
    addMemberLanguages(member.userId, member.selectedLanguages);
  }

  const pendingInviteeProfileById = new Map(
    pendingInviteeProfiles.map((profile) => [profile.userId, profile]),
  );
  for (const userId of pendingInviteeUserIds) {
    const profile = pendingInviteeProfileById.get(userId);
    if (!profile) continue;
    addMemberLanguages(userId, profile.defaultConversationLanguages);
  }

  // Order the display list around the viewer's own picks, in their own pick
  // order, rather than a single room-wide join-order sequence every viewer
  // would otherwise see identically — a Korean speaker sees "KO, EN, JA"
  // while a Japanese speaker in the same room sees "JA, EN, KO", each led by
  // what's actually theirs. Falls back to the discovery order above when the
  // viewer isn't a real member yet (e.g. a still-pending invitee resolving
  // their own future view) or has picked nothing of their own yet.
  const viewerMember = viewerUserId ? members.find((member) => member.userId === viewerUserId) : undefined;
  if (viewerMember) {
    const ownOrder = viewerMember.selectedLanguages.filter((language) => attribution[language]);
    const ownOrderSet = new Set(ownOrder);
    const rest = languageOrder.filter((language) => !ownOrderSet.has(language));
    return { languages: [...ownOrder, ...rest], attribution };
  }

  return { languages: languageOrder, attribution };
}

// The picker's checked state and translation targets read the room UNION
// (resolveRoomLanguageUnion above), but deciding what a tap on a language row
// should DO — add or remove — has to read the caller's OWN picks, not the
// union: tapping a language that's only checked because another member
// picked it should add the caller as a co-picker, never remove it from the
// room. Solo rooms (0-1 members) have no distinction — own is the same list
// as the channel-wide value.
function resolveViewerOwnSelectedLanguages(
  channelWideValue: string[],
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  pendingInviteeUserIds: string[] = [],
): string[] {
  if (!viewerUserId || !members) return [...channelWideValue];
  if (resolveEffectiveMemberCount(members, pendingInviteeUserIds) < 2) return [...channelWideValue];
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  // No fallback to the channel-wide value here: an empty own list means the
  // viewer hasn't picked anything themselves (see resolveRoomLanguageUnion's
  // comment for why inheriting channel-wide is wrong once a room has 2+
  // members). A missing membership row shouldn't happen, but falls back
  // defensively rather than throwing.
  return viewerMember ? [...viewerMember.selectedLanguages] : [...channelWideValue];
}

// "One active room per account" is a per-person invariant, so once a room
// has 2+ real or pending members, the channel-wide status/pausedAt can't represent it —
// Alice pausing her other rooms shouldn't pause the shared room for Bob, and
// vice versa. Solo rooms (0-1 members) keep using the channel-wide fields.
function resolveViewerFacingStatus(
  channelWideValue: string,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  pendingInviteeUserIds: string[] = [],
): string {
  if (!viewerUserId || !members) return channelWideValue;
  if (resolveEffectiveMemberCount(members, pendingInviteeUserIds) < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  return viewerMember?.status || channelWideValue;
}

function resolveViewerFacingPausedAt(
  channelWideValue: Date | null,
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  pendingInviteeUserIds: string[] = [],
): Date | null {
  if (!viewerUserId || !members) return channelWideValue;
  if (resolveEffectiveMemberCount(members, pendingInviteeUserIds) < 2) return channelWideValue;
  const viewerMember = members.find((member) => member.userId === viewerUserId);
  return viewerMember ? viewerMember.pausedAt : channelWideValue;
}

// membersByChannelId already carries every field the list avatar needs (see
// listChannelMembersByChannelId) — this just drops the viewer's own row and
// the language/status fields the avatar has no use for. Same "currently in
// the room" rule as resolveViewerFacingTitle: a departed member drops out of
// the avatar stack immediately, not just on next room-composition change.
function resolveOtherMemberAvatars(
  members: ChannelMemberProfile[] | undefined,
  viewerUserId: string | null | undefined,
  blockedCounterpartUserId: string | null | undefined = null,
  pendingInviteeProfiles: PendingInviteeProfile[] = [],
): ConversationChannelOtherMember[] {
  if (!viewerUserId) return [];
  const realMembers = filterActiveMembers(members);
  return [
    ...realMembers,
    ...pendingInviteeProfiles,
  ]
    .filter((member) => member.userId !== viewerUserId)
    .map((member) => {
      const isBlockedCounterpart = member.userId === blockedCounterpartUserId;
      return {
        userId: member.userId,
        name: member.name,
        image: isBlockedCounterpart ? null : member.image,
        imageCropScale: isBlockedCounterpart ? null : member.imageCropScale,
        imageCropX: isBlockedCounterpart ? null : member.imageCropX,
        imageCropY: isBlockedCounterpart ? null : member.imageCropY,
      };
    });
}

// Shared by both the 1:1 "message this person" entry point and the
// invite-friends group-creation flow — without it, knowing someone's user id
// is enough to bypass a block and reach (or create) shared room membership
// with them.
async function assertNoBlockAmong(userId: string, otherUserIds: string[]): Promise<void> {
  if (otherUserIds.length === 0) return;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: otherUserIds.flatMap((otherUserId) => [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ]),
    },
    select: { blockerId: true },
  });
  if (block) {
    throw new Error("target_user_blocked");
  }
}

function createConversationSessionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `conv_${crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function formatConversationChannelTitle(
  sequenceNumber: number,
  locale = "en",
): string {
  return formatLocalizedConversationTitle(locale, sequenceNumber);
}

export function normalizeConversationChannelStatus(
  rawStatus: string,
): AppConversationChannelStatus {
  return rawStatus === APP_CONVERSATION_STATUS_PAUSED
    ? APP_CONVERSATION_STATUS_PAUSED
    : APP_CONVERSATION_STATUS_ACTIVE;
}

function normalizeConversationMessageCount(value: number | null | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 0) : 0;
}

function serializeConversationChannel(
  record: ConversationChannelRecord,
  latestMessagePreview?: string,
  latestMessageAt?: string | null,
  latestSpeaker?: string | null,
  latestSpeakerAvatarSeed?: string | null,
  latestSpeakerAvatarIndex?: number | null,
  messageCount?: number,
  unreadMessageCount?: number,
  viewerFacingTitle?: string,
  viewerFacingDisplayLanguage?: string | null,
  viewerFacingStatus?: string,
  viewerFacingPausedAt?: Date | null,
  isMultiMember?: boolean,
  viewerFacingSelectedLanguages?: { languages: string[]; attribution: Record<string, string[]> },
  viewerOwnSelectedLanguages?: string[],
  isBlockedCounterpart?: boolean,
  otherMembers?: ConversationChannelOtherMember[],
): ConversationChannelSummary {
  const selectedLanguages = viewerFacingSelectedLanguages
    ? [...viewerFacingSelectedLanguages.languages]
    : [...record.selectedLanguages];
  const speechLanguages = record.speechLanguages.length > 0
    ? [...record.speechLanguages]
    : [...selectedLanguages];
  const translationLanguagesLinked = record.translationLanguagesLinked !== false;

  return {
    id: record.id,
    sequenceNumber: record.sequenceNumber,
    title: viewerFacingTitle ?? record.title,
    status: normalizeConversationChannelStatus(viewerFacingStatus ?? record.status),
    sessionKey: record.sessionKey,
    isMultiMember: isMultiMember === true,
    isBlockedCounterpart: isBlockedCounterpart === true,
    otherMembers: otherMembers ?? [],
    ...(typeof messageCount === "number"
      ? { messageCount: normalizeConversationMessageCount(messageCount) }
      : {}),
    ...(typeof unreadMessageCount === "number"
      ? { unreadMessageCount: normalizeConversationMessageCount(unreadMessageCount) }
      : {}),
    selectedLanguages,
    selectedLanguagesAttribution: viewerFacingSelectedLanguages?.attribution ?? {},
    viewerSelectedLanguages: viewerOwnSelectedLanguages ? [...viewerOwnSelectedLanguages] : selectedLanguages,
    speechLanguages,
    translationLanguagesLinked,
    defaultDisplayLanguage: viewerFacingDisplayLanguage !== undefined
      ? (viewerFacingDisplayLanguage?.trim() || null)
      : (record.defaultDisplayLanguage?.trim() || null),
    latestMessagePreview,
    latestMessageAt: latestMessageAt || null,
    latestSpeaker: latestSpeaker || null,
    latestSpeakerAvatarSeed: latestSpeakerAvatarSeed || null,
    latestSpeakerAvatarIndex:
      typeof latestSpeakerAvatarIndex === "number" && Number.isInteger(latestSpeakerAvatarIndex)
        ? latestSpeakerAvatarIndex
        : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pausedAt: (viewerFacingPausedAt !== undefined ? viewerFacingPausedAt : record.pausedAt)?.toISOString() ?? null,
  };
}

function normalizeConversationPreview(rawValue: string | null | undefined): string {
  return (rawValue || "").replace(/\s+/g, " ").trim();
}

type LatestMessageSummary = {
  preview: string;
  createdAt: string | null;
  speaker: string | null;
  speakerAvatarSeed: string | null;
  speakerAvatarIndex: number | null;
};

function readStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readIntegerValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function listLatestMessageSummaryBySessionKey(
  sessionKeys: string[],
): Promise<Map<string, LatestMessageSummary>> {
  if (sessionKeys.length === 0) {
    return new Map();
  }

  const latestMessages = await prisma.appMessage.findMany({
    where: {
      sessionKey: {
        in: sessionKeys,
      },
      ...buildVisibleMessageWhere(),
    },
    orderBy: [
      { sessionKey: "asc" },
      { createdAt: "desc" },
    ],
    distinct: ["sessionKey"],
    select: {
      sessionKey: true,
      createdAt: true,
      sourceLanguage: true,
      metadata: true,
      contents: {
        where: {
          contentType: "SOURCE",
          ...buildVisibleMessageContentWhere(),
        },
        orderBy: { createdAt: "asc" },
        select: {
          language: true,
          text: true,
        },
      },
    },
  });

  const summaryBySessionKey = new Map<string, LatestMessageSummary>();
  for (const message of latestMessages) {
    const sourceContent = message.contents.find((content) => content.language === message.sourceLanguage)
      || message.contents[0]
      || null;
    const preview = normalizeConversationPreview(sourceContent?.text);
    const metadata = readJsonObject(message.metadata);
    const clientMetadata = readJsonObject((metadata?.clientMetadata as Prisma.JsonValue | undefined) ?? null);
    if (!message.sessionKey) continue;
    summaryBySessionKey.set(message.sessionKey, {
      preview,
      createdAt: message.createdAt.toISOString(),
      speaker: readStringValue(clientMetadata?.speaker) ?? readStringValue(metadata?.speaker),
      speakerAvatarSeed:
        readStringValue(clientMetadata?.speakerAvatarSeed) ?? readStringValue(metadata?.speakerAvatarSeed),
      speakerAvatarIndex:
        readIntegerValue(clientMetadata?.speakerAvatarIndex) ?? readIntegerValue(metadata?.speakerAvatarIndex),
    });
  }

  return summaryBySessionKey;
}

async function listLatestMessageCreatedAtBySessionKey(
  sessionKeys: string[],
): Promise<Map<string, Date>> {
  const uniqueSessionKeys = [...new Set(sessionKeys.filter((sessionKey) => sessionKey.trim()))];
  if (uniqueSessionKeys.length === 0) {
    return new Map();
  }

  const latestMessages = await prisma.appMessage.findMany({
    where: {
      sessionKey: {
        in: uniqueSessionKeys,
      },
      ...buildVisibleMessageWhere(),
    },
    orderBy: [
      { sessionKey: "asc" },
      { createdAt: "desc" },
    ],
    distinct: ["sessionKey"],
    select: {
      sessionKey: true,
      createdAt: true,
    },
  });

  const latestCreatedAtBySessionKey = new Map<string, Date>();
  for (const message of latestMessages) {
    if (message.sessionKey) {
      latestCreatedAtBySessionKey.set(message.sessionKey, message.createdAt);
    }
  }
  return latestCreatedAtBySessionKey;
}

async function selectMostRecentlyMessagedConversation(
  records: ConversationChannelRecord[],
): Promise<ConversationChannelRecord | null> {
  if (records.length === 0) return null;

  // app_messages.created_at is the source of truth for room recency. A room
  // with no messages yet falls back to its creation time so pending invite
  // rooms still resolve deterministically.
  const latestCreatedAtBySessionKey = await listLatestMessageCreatedAtBySessionKey(
    records.map((record) => record.sessionKey),
  );
  return [...records].sort((left, right) => {
    const leftLatestAt = latestCreatedAtBySessionKey.get(left.sessionKey)?.getTime() ?? left.createdAt.getTime();
    const rightLatestAt = latestCreatedAtBySessionKey.get(right.sessionKey)?.getTime() ?? right.createdAt.getTime();
    if (leftLatestAt !== rightLatestAt) return rightLatestAt - leftLatestAt;

    const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDifference !== 0) return createdAtDifference;
    return right.id.localeCompare(left.id);
  })[0] ?? null;
}

async function listVisibleMessageCountsBySessionKey(
  sessionKeys: string[],
): Promise<Map<string, number>> {
  if (sessionKeys.length === 0) {
    return new Map();
  }

  const counts = await prisma.appMessage.groupBy({
    by: ["sessionKey"],
    where: {
      sessionKey: {
        in: sessionKeys,
      },
      ...buildVisibleMessageWhere(),
    },
    _count: {
      _all: true,
    },
  });

  const countBySessionKey = new Map<string, number>();
  for (const row of counts) {
    if (!row.sessionKey) continue;
    countBySessionKey.set(row.sessionKey, normalizeConversationMessageCount(row._count._all));
  }

  return countBySessionKey;
}

async function listUnreadMessageCountsByChannelId(
  channelIds: string[],
  viewerUserId?: string | null,
): Promise<Map<string, number>> {
  if (channelIds.length === 0 || !viewerUserId) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<Array<{
    channelId: string;
    unreadCount: number | bigint;
  }>>(Prisma.sql`
    SELECT
      channel.id AS "channelId",
      COUNT(message.id)::int AS "unreadCount"
    FROM app.app_conversation_channels AS channel
    JOIN app.app_conversation_channel_members AS member
      ON member.channel_id = channel.id
      AND member.user_id = ${viewerUserId}
    LEFT JOIN app.app_messages AS message
      ON message.session_key = channel.session_key
      AND (message.is_deleted = false OR message.is_deleted IS NULL)
      AND message.user_id IS NOT NULL
      AND message.user_id <> member.user_id
      AND (member.last_read_at IS NULL OR message.created_at > member.last_read_at)
    WHERE channel.id IN (${Prisma.join(channelIds)})
      AND (channel.is_deleted = false OR channel.is_deleted IS NULL)
    GROUP BY channel.id
  `);

  const unreadCountByChannelId = new Map<string, number>();
  for (const row of rows) {
    const count = Number(row.unreadCount);
    if (!row.channelId || !Number.isFinite(count)) continue;
    unreadCountByChannelId.set(row.channelId, normalizeConversationMessageCount(count));
  }
  return unreadCountByChannelId;
}

async function serializeConversationChannelWithPreview(
  record: ConversationChannelRecord,
  viewerUserId?: string | null,
): Promise<ConversationChannelSummary> {
  const [summaryBySessionKey, membersByChannelId, pendingInviteeProfileById] = await Promise.all([
    listLatestMessageSummaryBySessionKey([record.sessionKey]),
    viewerUserId ? listChannelMembersByChannelId([record.id]) : Promise.resolve(new Map<string, ChannelMemberProfile[]>()),
    listPendingInviteeProfilesByUserIds(record.pendingInviteeUserIds),
  ]);
  const latestMessage = summaryBySessionKey.get(record.sessionKey);
  const pendingInviteeProfiles = record.pendingInviteeUserIds
    .map((userId) => pendingInviteeProfileById.get(userId))
    .filter((profile): profile is PendingInviteeProfile => Boolean(profile));
  const blockedCounterpartByChannelId = viewerUserId
    ? await resolveBlockedCounterpartUserIdByChannelId(viewerUserId, membersByChannelId)
    : new Map<string, string>();
  return serializeConversationChannel(
    record,
    latestMessage?.preview,
    latestMessage?.createdAt,
    latestMessage?.speaker,
    latestMessage?.speakerAvatarSeed,
    latestMessage?.speakerAvatarIndex,
    undefined,
    undefined,
    resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId, pendingInviteeProfiles, record.userEditedTitleAt),
    resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds, pendingInviteeProfiles),
    resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
    resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
    resolveEffectiveMemberCount(membersByChannelId.get(record.id), record.pendingInviteeUserIds) >= 2,
    resolveRoomLanguageUnion(
      record.selectedLanguages,
      membersByChannelId.get(record.id),
      record.pendingInviteeUserIds,
      viewerUserId,
      pendingInviteeProfiles,
    ),
    resolveViewerOwnSelectedLanguages(record.selectedLanguages, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
    blockedCounterpartByChannelId.has(record.id),
    resolveOtherMemberAvatars(
      membersByChannelId.get(record.id),
      viewerUserId,
      blockedCounterpartByChannelId.get(record.id),
      pendingInviteeProfiles,
    ),
  );
}

async function listConversationChannelsForMember(
  memberWhere: Prisma.AppConversationChannelWhereInput,
  options: ListConversationChannelsForUserOptions = {},
  viewerUserId?: string | null,
): Promise<ConversationChannelSummary[]> {
  const records = await prisma.appConversationChannel.findMany({
    where: {
      ...memberWhere,
      ...buildVisibleConversationWhere(),
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    select: conversationChannelSelect,
  });

  if (records.length === 0) {
    return [];
  }

  const allPendingInviteeUserIds = [...new Set(records.flatMap((record) => record.pendingInviteeUserIds))];
  const [membersByChannelId, pendingInviteeProfileById] = await Promise.all([
    viewerUserId
      ? listChannelMembersByChannelId(records.map((record) => record.id))
      : Promise.resolve(new Map<string, ChannelMemberProfile[]>()),
    listPendingInviteeProfilesByUserIds(allPendingInviteeUserIds),
  ]);
  const resolvePendingInviteeProfiles = (record: ConversationChannelRecord) => record.pendingInviteeUserIds
    .map((userId) => pendingInviteeProfileById.get(userId))
    .filter((profile): profile is PendingInviteeProfile => Boolean(profile));
  const blockedCounterpartByChannelId = viewerUserId
    ? await resolveBlockedCounterpartUserIdByChannelId(viewerUserId, membersByChannelId)
    : new Map<string, string>();

  if (options.includeMessageSummaries === false) {
    return records.map((record) => serializeConversationChannel(
      record,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId, resolvePendingInviteeProfiles(record), record.userEditedTitleAt),
      resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds, resolvePendingInviteeProfiles(record)),
      resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
      resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
      resolveEffectiveMemberCount(membersByChannelId.get(record.id), record.pendingInviteeUserIds) >= 2,
      resolveRoomLanguageUnion(
        record.selectedLanguages,
        membersByChannelId.get(record.id),
        record.pendingInviteeUserIds,
        viewerUserId,
        resolvePendingInviteeProfiles(record),
      ),
      resolveViewerOwnSelectedLanguages(record.selectedLanguages, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
      blockedCounterpartByChannelId.has(record.id),
      resolveOtherMemberAvatars(
        membersByChannelId.get(record.id),
        viewerUserId,
        blockedCounterpartByChannelId.get(record.id),
        resolvePendingInviteeProfiles(record),
      ),
    ));
  }

  const sessionKeys = [...new Set(records.map((record) => record.sessionKey))];
  const [latestMessageSummaryBySessionKey, messageCountBySessionKey, unreadMessageCountByChannelId] = await Promise.all([
    listLatestMessageSummaryBySessionKey(sessionKeys),
    listVisibleMessageCountsBySessionKey(sessionKeys),
    listUnreadMessageCountsByChannelId(records.map((record) => record.id), viewerUserId),
  ]);

  return records
    .map((record) => {
      const latestMessage = latestMessageSummaryBySessionKey.get(record.sessionKey);
      return serializeConversationChannel(
        record,
        latestMessage?.preview,
        latestMessage?.createdAt,
        latestMessage?.speaker,
        latestMessage?.speakerAvatarSeed,
        latestMessage?.speakerAvatarIndex,
        messageCountBySessionKey.get(record.sessionKey) ?? 0,
        unreadMessageCountByChannelId.get(record.id) ?? 0,
        resolveViewerFacingTitle(record.title, membersByChannelId.get(record.id), viewerUserId, resolvePendingInviteeProfiles(record), record.userEditedTitleAt),
        resolveViewerFacingDisplayLanguage(record.defaultDisplayLanguage, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds, resolvePendingInviteeProfiles(record)),
        resolveViewerFacingStatus(record.status, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
        resolveViewerFacingPausedAt(record.pausedAt, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
        resolveEffectiveMemberCount(membersByChannelId.get(record.id), record.pendingInviteeUserIds) >= 2,
        resolveRoomLanguageUnion(
          record.selectedLanguages,
          membersByChannelId.get(record.id),
          record.pendingInviteeUserIds,
          viewerUserId,
          resolvePendingInviteeProfiles(record),
        ),
        resolveViewerOwnSelectedLanguages(record.selectedLanguages, membersByChannelId.get(record.id), viewerUserId, record.pendingInviteeUserIds),
        blockedCounterpartByChannelId.has(record.id),
        resolveOtherMemberAvatars(
          membersByChannelId.get(record.id),
          viewerUserId,
          blockedCounterpartByChannelId.get(record.id),
          resolvePendingInviteeProfiles(record),
        ),
      );
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.latestMessageAt || left.createdAt) || 0;
      const rightTimestamp = Date.parse(right.latestMessageAt || right.createdAt) || 0;
      return rightTimestamp - leftTimestamp;
    });
}

export async function listConversationChannelsForUser(
  userId: string,
  options: ListConversationChannelsForUserOptions = {},
): Promise<ConversationChannelSummary[]> {
  return listConversationChannelsForMember(buildVisibleMembershipWhere(userId), options, userId);
}

export async function listConversationChannelsForExternalUserId(
  externalUserId: string,
  options: ListConversationChannelsForUserOptions = {},
): Promise<ConversationChannelSummary[]> {
  const normalizedExternalUserId = externalUserId.trim();
  if (!normalizedExternalUserId) return [];

  // Resolve the real internal user id so per-viewer title/display-language
  // overrides (which key off userId, not externalUserId) still apply on this
  // native-tracking-identity path.
  const user = await prisma.user.findUnique({
    where: { externalUserId: normalizedExternalUserId },
    select: { id: true },
  });

  return listConversationChannelsForMember({
    members: {
      some: { user: { is: { externalUserId: normalizedExternalUserId } } },
    },
  }, options, user?.id);
}

type CreateConversationChannelOptions = {
  locale?: string;
  preferredSessionKey?: string;
  selectedLanguages?: string[];
  speechLanguages?: string[];
  translationLanguagesLinked?: boolean;
  inviteeUserIds?: string[];
};

async function createConversationChannelRecordForUser(
  userId: string,
  options?: CreateConversationChannelOptions,
): Promise<ConversationChannelRecord> {
  const normalizedLocale = (options?.locale || "en").trim() || "en";
  const normalizedPreferredSessionKey = (options?.preferredSessionKey || "").trim();
  const normalizedSelectedLanguages = sanitizeSttLanguageSelection(options?.selectedLanguages);
  const normalizedSpeechLanguages = sanitizeSttLanguageSelection(options?.speechLanguages);
  const translationLanguagesLinked = options?.translationLanguagesLinked !== false;
  const inviteeUserIds = [...new Set((options?.inviteeUserIds || []).filter((id) => id && id !== userId))];
  if (inviteeUserIds.length > MAX_CONVERSATION_MEMBERS - 1) {
    throw new Error("too_many_invitees");
  }
  await assertNoBlockAmong(userId, inviteeUserIds);

  // A new shared room starts from each participant's persisted conversation
  // defaults. The owner is written immediately; pending invitees are read
  // from their user profile until first-message materialization creates their
  // membership row.
  const defaultUserIds = [userId, ...inviteeUserIds];
  const [defaultLanguagesByUserId, defaultDisplayLanguagesByUserId] = await Promise.all([
    listUserDefaultConversationLanguagesById(defaultUserIds),
    listUserDefaultDisplayLanguagesById(defaultUserIds),
  ]);
  const ownerDefaultConversationLanguages = defaultLanguagesByUserId.get(userId)
    ?? deriveDefaultSttLanguagesForLocale(normalizedLocale);
  // A caller that omits both (e.g. "message this person," which has no
  // language-selection step of its own) still needs a REAL persisted
  // default, not just an empty array: an empty selectedLanguages means empty
  // attribution too, so a client rendering its own locale-based fallback as
  // "selected" would show a language nobody has actually picked according to
  // the server — checked, but with no "who picked this" badge possible,
  // since nothing was ever written. Match what the regular new-conversation
  // client flow already sends explicitly (deriveDefaultSttLanguagesForLocale).
  const resolvedSpeechLanguages = normalizedSpeechLanguages.length > 0
    ? normalizedSpeechLanguages
    : normalizedSelectedLanguages.length > 0
      ? [...normalizedSelectedLanguages]
      : [...ownerDefaultConversationLanguages];
  const resolvedSelectedLanguages = normalizedSelectedLanguages.length > 0
    ? normalizedSelectedLanguages
    : [...resolvedSpeechLanguages];
  const ownerDefaultDisplayLanguage = defaultDisplayLanguagesByUserId.get(userId) ?? null;
  const ownerDisplayLanguage = ownerDefaultDisplayLanguage
    && resolvedSelectedLanguages.includes(ownerDefaultDisplayLanguage)
    ? ownerDefaultDisplayLanguage
    : null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const lastChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: userId, ...buildVisibleConversationWhere() },
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true },
        });
        const sequenceNumber = (lastChannel?.sequenceNumber ?? 0) + 1;

        const lowestChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: userId },
          orderBy: { sequenceNumber: "asc" },
          select: { sequenceNumber: true },
        });
        const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, sequenceNumber) - 1;

        await tx.appConversationChannel.updateMany({
          where: { ownerUserId: userId, sequenceNumber, isDeleted: true },
          data: { sequenceNumber: vacatedSequenceNumber },
        });

        const created = await tx.appConversationChannel.create({
          data: {
            ownerUserId: userId,
            sequenceNumber,
            title: formatConversationChannelTitle(sequenceNumber, normalizedLocale),
            status: APP_CONVERSATION_STATUS_PAUSED,
            sessionKey: normalizedPreferredSessionKey || createConversationSessionKey(),
            selectedLanguages: resolvedSelectedLanguages,
            speechLanguages: resolvedSpeechLanguages,
            translationLanguagesLinked,
            ...(inviteeUserIds.length === 0 && ownerDisplayLanguage
              ? { defaultDisplayLanguage: ownerDisplayLanguage }
              : {}),
            pausedAt: new Date(),
            // Invitees get no membership row yet — see the field's doc
            // comment. materializePendingConversationInvitees turns these
            // into real members the moment the owner sends a first message.
            pendingInviteeUserIds: inviteeUserIds,
          },
          select: conversationChannelSelect,
        });

        // Only the creator becomes a real member at creation time. Mirroring
        // the channel's just-created status/pausedAt here (rather than
        // relying on the column's schema default) matters once a second
        // member is materialized later — a shared room's members must start
        // out paused exactly like a solo room does, until someone explicitly
        // activates it. This row also mirrors the channel's starting
        // selectedLanguages so the room's union isn't empty the moment it
        // becomes multi-member; see resolveRoomLanguageUnion.
        await tx.appConversationChannelMember.createMany({
          data: [
            {
              channelId: created.id,
              userId,
              role: "owner",
              status: created.status,
              pausedAt: created.pausedAt,
              selectedLanguages: resolvedSelectedLanguages,
              ...(ownerDisplayLanguage ? { displayLanguage: ownerDisplayLanguage } : {}),
            },
          ],
          skipDuplicates: true,
        });

        if (inviteeUserIds.length > 0) {
          // Same event-log row a later inviteMembersToConversationChannel
          // call writes — drives the "{owner} invited {invitee}" notice from
          // the very start of a fresh group room, not just for invites added
          // afterward.
          await tx.appConversationChannelInvite.createMany({
            data: inviteeUserIds.map((inviteeUserId) => ({
              channelId: created.id,
              inviteeUserId,
              invitedByUserId: userId,
            })),
            skipDuplicates: true,
          });
        }

        return created;
      });

      return record;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("conversation_channel_create_conflict");
}

export async function createConversationChannelForUser(
  userId: string,
  options?: CreateConversationChannelOptions,
): Promise<ConversationChannelSummary> {
  const record = await createConversationChannelRecordForUser(userId, options);
  return serializeConversationChannelWithPreview(record, userId);
}

type DirectConversationArgs = {
  userId: string;
  targetUserId: string;
  locale?: string;
  force?: boolean;
  preferredSessionKey?: string;
};

async function validateDirectConversationTarget(userId: string, rawTargetUserId: string): Promise<string> {
  const targetUserId = rawTargetUserId.trim();
  if (!targetUserId || targetUserId === userId) {
    throw new Error("invalid_target_user");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    throw new Error("target_user_not_found");
  }

  await assertNoBlockAmong(userId, [targetUserId]);
  return targetUserId;
}

async function findExistingDirectConversationRecord(
  userId: string,
  targetUserId: string,
): Promise<ConversationChannelRecord | null> {
  // Every membership condition below is scoped to leftAt: null (active
  // members only) — see findExistingConversationWithExactMembers's doc
  // comment for why: once either side has left, the room must stop being
  // offered as "the" 1:1 room, for both of them.
  const existingCandidates = await prisma.appConversationChannel.findMany({
    where: {
      members: { some: { userId, leftAt: null } },
      AND: [
        buildVisibleConversationWhere(),
        {
          OR: [
            {
              AND: [
                { members: { some: { userId: targetUserId, leftAt: null } } },
                // Exactly these two — a channel where either has picked up extra
                // members (a future group chat) is not "the" 1:1 room anymore.
                { members: { none: { userId: { notIn: [userId, targetUserId] }, leftAt: null } } },
              ],
            },
            // The target hasn't received a first message yet (no membership row
            // — see pendingInviteeUserIds), so it wouldn't match the branch
            // above. Reuse this same pending room on a repeat tap instead of
            // spawning a new one each time.
            {
              AND: [
                { ownerUserId: userId },
                { pendingInviteeUserIds: { has: targetUserId } },
                { members: { none: { userId: { not: userId } } } },
              ],
            },
          ],
        },
      ],
    },
    select: conversationChannelSelect,
  });
  // The pending branch above is intentionally broad enough for the database
  // query to use an indexed array-membership predicate. Narrow it here so a
  // pending group [B, C] can never be reused as A's direct room with B.
  const exactDirectCandidates = existingCandidates.filter((candidate) => (
    candidate.pendingInviteeUserIds.length === 0
    || (
      candidate.pendingInviteeUserIds.length === 1
      && candidate.pendingInviteeUserIds[0] === targetUserId
    )
  ));
  return selectMostRecentlyMessagedConversation(exactDirectCandidates);
}

async function findOrCreateDirectConversationRecord(
  args: DirectConversationArgs,
): Promise<{ record: ConversationChannelRecord; reused: boolean }> {
  const targetUserId = await validateDirectConversationTarget(args.userId, args.targetUserId);

  if (!args.force) {
    const existing = await findExistingDirectConversationRecord(args.userId, targetUserId);
    if (existing) {
      return { record: existing, reused: true };
    }
  }

  return {
    record: await createConversationChannelRecordForUser(args.userId, {
      locale: args.locale,
      preferredSessionKey: args.preferredSessionKey,
      inviteeUserIds: [targetUserId],
    }),
    reused: false,
  };
}

// Signup onboarding only needs a durable session key. It deliberately avoids
// serializing the full room preview, because a preview/profile lookup failure
// must not prevent the welcome message transaction from being written.
export async function findOrCreateDirectConversationSession(args: DirectConversationArgs): Promise<{
  sessionKey: string;
  reused: boolean;
}> {
  const result = await findOrCreateDirectConversationRecord(args);
  return {
    sessionKey: result.record.sessionKey,
    reused: result.reused,
  };
}

// The entry point for "message this person": reuses whatever 1:1 room
// already exists between the two accounts instead of spawning a duplicate
// every time someone taps the button on a profile they've messaged before.
export async function findOrCreateDirectConversation(args: DirectConversationArgs): Promise<{
  conversation: ConversationChannelSummary;
  reused: boolean;
}> {
  const result = await findOrCreateDirectConversationRecord(args);
  return {
    conversation: await serializeConversationChannelWithPreview(result.record, args.userId),
    reused: result.reused,
  };
}

// Generalizes findOrCreateDirectConversation's exact-membership match to any
// number of invitees, for the "invite friends" group-start flow — lets the
// caller offer "continue in the previous room" instead of silently
// spawning a duplicate when the exact same set of people already has a
// room together. A superset or subset doesn't count as "the same" room.
export async function findExistingConversationWithExactMembers(args: {
  userId: string;
  otherUserIds: string[];
}): Promise<ConversationChannelSummary | null> {
  const otherUserIds = [...new Set(args.otherUserIds.map((id) => id.trim()).filter((id) => id && id !== args.userId))];
  if (otherUserIds.length === 0) return null;
  const allUserIds = [args.userId, ...otherUserIds];

  // Duplicates of the exact same member set can exist (rooms created before
  // this check existed, or via the "create new anyway" force path). Resolve
  // them by the latest persisted app message, not channel.updatedAt, so
  // "continue in previous room" lands on the room that was actually used last.
  //
  // Every membership condition below is scoped to leftAt: null (active
  // members only): once anyone in a room has left (see
  // leaveConversationChannel), that room's active member set no longer
  // matches the original group, so it must stop being offered as a "use the
  // existing room" candidate — both to the person who left (starting a new
  // conversation with the same people should never resurface a room they've
  // left) and to the remaining members (inviting the same group again should
  // create a fresh room, not silently reuse the now-short-handed one). A
  // departed member's still-present-but-left row must NOT disqualify an
  // otherwise-exact match, which is why the "no extra member" guard also
  // filters to leftAt: null rather than matching on userId alone.
  const materializedCandidates = await prisma.appConversationChannel.findMany({
    where: {
      ...buildVisibleConversationWhere(),
      members: { some: { userId: args.userId, leftAt: null } },
      AND: [
        ...otherUserIds.map((otherUserId) => ({ members: { some: { userId: otherUserId, leftAt: null } } })),
        { members: { none: { userId: { notIn: allUserIds }, leftAt: null } } },
      ],
    },
    select: conversationChannelSelect,
  });
  const materializedMatch = await selectMostRecentlyMessagedConversation(materializedCandidates);
  if (materializedMatch) {
    return serializeConversationChannelWithPreview(materializedMatch, args.userId);
  }

  // Nobody's sent a first message yet — the owner is the only real member
  // and everyone else is still in pendingInviteeUserIds (see that field's
  // doc comment). Set membership on that array can't be expressed exactly
  // in a Prisma where clause (order can differ between two invite
  // attempts), so prefilter with hasEvery and confirm an exact-size match
  // in application code.
  const pendingCandidates = await prisma.appConversationChannel.findMany({
    where: {
      ...buildVisibleConversationWhere(),
      ownerUserId: args.userId,
      members: { none: { userId: { not: args.userId } } },
      pendingInviteeUserIds: { hasEvery: otherUserIds },
    },
    select: conversationChannelSelect,
  });
  const exactPendingCandidates = pendingCandidates.filter(
    (candidate) => candidate.pendingInviteeUserIds.length === otherUserIds.length,
  );
  const pendingMatch = await selectMostRecentlyMessagedConversation(exactPendingCandidates);

  return pendingMatch ? serializeConversationChannelWithPreview(pendingMatch, args.userId) : null;
}

// Turns any still-pending invitees on a channel into real members the moment
// the owner's first message actually lands — see AppConversationChannel's
// pendingInviteeUserIds doc comment for why this doesn't happen at invite
// time. Keyed by sessionKey since that's what the message-write path
// (log-client-event-handler.ts) already has on hand. No-op for solo rooms
// and rooms that have already been materialized. When materialization occurs,
// return the member IDs read inside the same committed transaction so the
// message fan-out cannot race a second, stale membership query.
export async function materializePendingConversationInvitees(
  sessionKey: string,
  // The triggering message's own createdAt, when known (see the caller in
  // log-client-event-handler.ts). Without this, the new member row's
  // joinedAt defaults to now() — written a moment AFTER the message that
  // triggered materialization was already inserted, which made
  // countActiveRealMembersAt's point-in-time check treat that very message
  // as still solo (invitee "joined" after it). Passing the message's own
  // timestamp here keeps the triggering message itself already attributed.
  joinedAt?: Date,
): Promise<string[] | null> {
  const channel = await prisma.appConversationChannel.findUnique({
    where: { sessionKey },
    select: {
      id: true,
      ownerUserId: true,
      status: true,
      pausedAt: true,
      pendingInviteeUserIds: true,
    },
  });
  if (!channel || channel.pendingInviteeUserIds.length === 0) return null;

  // Older rows may contain ids that were accepted before invite validation
  // existed. Filter those rows before the foreign-key write so a bad pending
  // id cannot make the first message's membership materialization fail.
  const existingInvitees = await prisma.user.findMany({
    where: { id: { in: channel.pendingInviteeUserIds } },
    select: { id: true, defaultConversationLanguages: true, defaultDisplayLanguage: true },
  });
  const existingInviteeUserIds = new Set(existingInvitees.map((user) => user.id));
  const defaultLanguagesByUserId = new Map(existingInvitees.map((user) => [
    user.id,
    resolveDefaultConversationLanguages(user.defaultConversationLanguages),
  ]));
  const defaultDisplayLanguagesByUserId = new Map(
    existingInvitees.flatMap((user) => {
      const language = resolvePersistedDisplayLanguage(user.defaultDisplayLanguage);
      return language ? [[user.id, language] as const] : [];
    }),
  );
  const validPendingInviteeUserIds = channel.pendingInviteeUserIds.filter(
    (inviteeUserId) => existingInviteeUserIds.has(inviteeUserId),
  );

  // Re-check blocks at send time too, in case one formed between the invite
  // and this first message — drop the blocked invitee rather than fail the
  // send outright.
  const blocks = validPendingInviteeUserIds.length > 0
    ? await prisma.userBlock.findMany({
        where: {
          OR: validPendingInviteeUserIds.flatMap((inviteeUserId) => [
            { blockerId: channel.ownerUserId, blockedId: inviteeUserId },
            { blockerId: inviteeUserId, blockedId: channel.ownerUserId },
          ]),
        },
        select: { blockerId: true, blockedId: true },
      })
    : [];
  const blockedInviteeUserIds = new Set(
    blocks.flatMap((block) => [block.blockerId, block.blockedId])
      .filter((id) => id !== channel.ownerUserId),
  );
  const inviteeUserIdsToMaterialize = validPendingInviteeUserIds.filter(
    (inviteeUserId) => !blockedInviteeUserIds.has(inviteeUserId),
  );

  return prisma.$transaction(async (tx) => {
    if (inviteeUserIdsToMaterialize.length > 0) {
      await tx.appConversationChannelMember.createMany({
        data: inviteeUserIdsToMaterialize.map((inviteeUserId) => {
          const selectedLanguages = defaultLanguagesByUserId.get(inviteeUserId)
            ?? deriveDefaultSttLanguagesForLocale(undefined);
          const defaultDisplayLanguage = defaultDisplayLanguagesByUserId.get(inviteeUserId);
          return {
            channelId: channel.id,
            userId: inviteeUserId,
            role: "member",
            status: channel.status,
            pausedAt: channel.pausedAt,
            selectedLanguages,
            ...(joinedAt ? { joinedAt } : {}),
            ...(defaultDisplayLanguage && selectedLanguages.includes(defaultDisplayLanguage)
              ? { displayLanguage: defaultDisplayLanguage }
              : {}),
          };
        }),
        skipDuplicates: true,
      });
    }

    await tx.appConversationChannel.update({
      where: { id: channel.id },
      data: { pendingInviteeUserIds: [] },
    });

    const members = await tx.appConversationChannelMember.findMany({
      where: { channelId: channel.id },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  });
}

// Who to fan a realtime "a message landed" push out to for the conversation
// LIST (as opposed to the single open room) — every real member, so their
// list screen updates without a manual refresh even while the room itself
// is closed. Called right after materializePendingConversationInvitees so a
// freshly-materialized invitee is already included.
export async function listChannelMemberUserIdsBySessionKey(sessionKey: string): Promise<string[]> {
  const channel = await prisma.appConversationChannel.findUnique({
    where: { sessionKey },
    select: { members: { select: { userId: true } } },
  });
  return channel?.members.map((member) => member.userId) ?? [];
}

// Defense in depth behind the client's own composer/mic gating (see
// isBlockedCounterpart) — even a stale client that still posts a
// stt_turn_finalized event for a now-blocked room must not have it persist.
// A caller must also be a real, still-active member of the channel — a
// caller who has left (see leaveConversationChannel) is fails-closed the
// same as a non-member, since their own membership row's leftAt marks them
// as no longer allowed to post here. Returning true for an unknown channel,
// non-member, or departed member deliberately fails closed at the message
// persistence call site, without revealing which part of the check failed.
// Only meaningful for a 2-real-member room; a block against one member of a
// 3+ person room doesn't stop the whole room from messaging.
export async function isMessageSenderBlockedInConversation(args: {
  sessionKey: string;
  userId: string;
}): Promise<boolean> {
  const channel = await prisma.appConversationChannel.findUnique({
    where: { sessionKey: args.sessionKey },
    select: { id: true },
  });
  if (!channel) return true;

  const membersByChannelId = await listChannelMembersByChannelId([channel.id]);
  const members = membersByChannelId.get(channel.id) ?? [];
  if (!members.some((member) => member.userId === args.userId && !member.leftAt)) return true;
  if (members.length !== 2) return false;
  const other = members.find((member) => member.userId !== args.userId);
  if (!other) return false;

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: args.userId, blockedId: other.userId },
        { blockerId: other.userId, blockedId: args.userId },
      ],
    },
    select: { blockerId: true },
  });
  return Boolean(block);
}

export async function updateConversationChannelStatus(args: {
  conversationId: string;
  userId: string;
  status: AppConversationChannelStatus;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, pendingInviteeUserIds: true },
  });

  if (!existing) {
    return null;
  }

  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const isTargetMultiMember = resolveEffectiveMemberCount(
    membersByChannelId.get(args.conversationId),
    existing.pendingInviteeUserIds,
  ) >= 2;
  const pausedAt = args.status === APP_CONVERSATION_STATUS_PAUSED ? new Date() : null;

  const record = await prisma.$transaction(async (tx) => {
    if (args.status === APP_CONVERSATION_STATUS_ACTIVE) {
      // Pause every OTHER room this caller is in, not just the ones they
      // own. "One active room per account" is a per-person invariant, so
      // for a shared (2+-member) room this must check and pause the
      // caller's OWN membership status, never the channel-wide status —
      // that field reflects some other member's state, not this caller's.
      const otherMemberships = await tx.appConversationChannelMember.findMany({
        where: {
          userId: args.userId,
          channelId: { not: args.conversationId },
          channel: { ...buildVisibleConversationWhere() },
        },
        select: {
          channelId: true,
          status: true,
          channel: {
            select: {
              status: true,
              pendingInviteeUserIds: true,
              _count: { select: { members: true } },
            },
          },
        },
      });

      const soloChannelIdsToPause: string[] = [];
      const memberRowChannelIdsToPause: string[] = [];
      for (const membership of otherMemberships) {
        const isMultiMember = (
          membership.channel._count.members
          + (membership.channel.pendingInviteeUserIds?.length ?? 0)
        ) >= 2;
        const effectiveStatus = isMultiMember ? membership.status : membership.channel.status;
        if (effectiveStatus !== APP_CONVERSATION_STATUS_ACTIVE) continue;
        (isMultiMember ? memberRowChannelIdsToPause : soloChannelIdsToPause).push(membership.channelId);
      }

      const nowPausedAt = new Date();
      if (soloChannelIdsToPause.length > 0) {
        await tx.appConversationChannel.updateMany({
          where: { id: { in: soloChannelIdsToPause } },
          data: { status: APP_CONVERSATION_STATUS_PAUSED, pausedAt: nowPausedAt },
        });
      }
      if (memberRowChannelIdsToPause.length > 0) {
        await tx.appConversationChannelMember.updateMany({
          where: { userId: args.userId, channelId: { in: memberRowChannelIdsToPause } },
          data: { status: APP_CONVERSATION_STATUS_PAUSED, pausedAt: nowPausedAt },
        });
      }
    }

    if (isTargetMultiMember) {
      await tx.appConversationChannelMember.update({
        where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
        data: { status: args.status, pausedAt },
      });
      return tx.appConversationChannel.findUniqueOrThrow({
        where: { id: args.conversationId },
        select: conversationChannelSelect,
      });
    }

    return tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: { status: args.status, pausedAt },
      select: conversationChannelSelect,
    });
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelSelectedLanguages(args: {
  conversationId: string;
  userId: string;
  selectedLanguages: string[];
}): Promise<ConversationChannelSummary | null> {
  const normalizedSelectedLanguages = sanitizeSttLanguageSelection(args.selectedLanguages);
  if (normalizedSelectedLanguages.length === 0) {
    throw new Error("invalid_selected_languages");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, pendingInviteeUserIds: true },
  });

  if (!existing) {
    return null;
  }

  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const isMultiMember = resolveEffectiveMemberCount(
    membersByChannelId.get(args.conversationId),
    existing.pendingInviteeUserIds,
  ) >= 2;

  // Once there's more than one real or pending member, the picker shows the union of
  // everyone's own selection (see resolveRoomLanguageUnion) — a single
  // channel-wide write would blow away whatever the other members picked, so
  // this becomes the caller's own membership preference instead. Solo rooms
  // keep writing the channel-wide field as before.
  let record: ConversationChannelRecord;
  if (isMultiMember) {
    await prisma.appConversationChannelMember.update({
      where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
      data: { selectedLanguages: normalizedSelectedLanguages },
    });
    record = await prisma.appConversationChannel.update({
      where: { id: args.conversationId },
      data: { translationLanguagesLinked: false },
      select: conversationChannelSelect,
    });
  } else {
    record = await prisma.appConversationChannel.update({
      where: { id: args.conversationId },
      data: {
        selectedLanguages: normalizedSelectedLanguages,
        translationLanguagesLinked: false,
      },
      select: conversationChannelSelect,
    });
  }

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelSpeechLanguages(args: {
  conversationId: string;
  userId: string;
  speechLanguages: string[];
}): Promise<ConversationChannelSummary | null> {
  const normalizedSpeechLanguages = sanitizeSttLanguageSelection(args.speechLanguages);
  if (normalizedSpeechLanguages.length === 0) {
    throw new Error("invalid_speech_languages");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      speechLanguages: normalizedSpeechLanguages,
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelTranslationLanguagesLinked(args: {
  conversationId: string;
  userId: string;
  translationLanguagesLinked: boolean;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      translationLanguagesLinked: args.translationLanguagesLinked,
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelDefaultDisplayLanguage(args: {
  conversationId: string;
  userId: string;
  defaultDisplayLanguage: string | null;
}): Promise<ConversationChannelSummary | null> {
  const normalizedDefaultDisplayLanguage = args.defaultDisplayLanguage
    ? sanitizeSttLanguageSelection([args.defaultDisplayLanguage])[0] ?? null
    : null;

  if (args.defaultDisplayLanguage && !normalizedDefaultDisplayLanguage) {
    throw new Error("invalid_default_display_language");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: {
      id: true,
      selectedLanguages: true,
      pendingInviteeUserIds: true,
    },
  });

  if (!existing) {
    return null;
  }

  const pendingInviteeUserIds = existing.pendingInviteeUserIds ?? [];
  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const members = membersByChannelId.get(args.conversationId);
  const pendingInviteeProfileById = await listPendingInviteeProfilesByUserIds(pendingInviteeUserIds);
  const pendingInviteeProfiles = pendingInviteeUserIds
    .map((userId) => pendingInviteeProfileById.get(userId))
    .filter((profile): profile is PendingInviteeProfile => Boolean(profile));
  const isMultiMember = resolveEffectiveMemberCount(
    members,
    pendingInviteeUserIds,
  ) >= 2;

  if (normalizedDefaultDisplayLanguage) {
    const availableLanguages = isMultiMember
      ? resolveRoomLanguageUnion(
          existing.selectedLanguages,
          members,
          pendingInviteeUserIds,
          args.userId,
          pendingInviteeProfiles,
        ).languages
      : sanitizeSttLanguageSelection(
          existing.selectedLanguages,
          existing.selectedLanguages,
        );
    if (!availableLanguages.includes(normalizedDefaultDisplayLanguage)) {
      throw new Error("invalid_default_display_language");
    }
  }

  // Once there's more than one real or pending member, each person reads translations in
  // their own language — a single channel-wide value can't represent that, so
  // this becomes the caller's own membership preference instead of a shared
  // setting. Solo rooms keep writing the channel-wide field as before.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: args.userId },
      data: { defaultDisplayLanguage: normalizedDefaultDisplayLanguage },
    });

    if (isMultiMember) {
      await tx.appConversationChannelMember.update({
        where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
        data: { displayLanguage: normalizedDefaultDisplayLanguage },
      });
      return;
    }

    await tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: {
        defaultDisplayLanguage: normalizedDefaultDisplayLanguage,
      },
    });
  });

  const record = await prisma.appConversationChannel.findUniqueOrThrow({
    where: { id: args.conversationId },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function updateConversationChannelTitle(args: {
  conversationId: string;
  userId: string;
  title: string;
}): Promise<ConversationChannelSummary | null> {
  const normalizedTitle = args.title.trim();
  if (!normalizedTitle) {
    throw new Error("invalid_title");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  const record = await prisma.appConversationChannel.update({
    where: { id: args.conversationId },
    data: {
      title: normalizedTitle,
      userEditedTitleAt: new Date(),
    },
    select: conversationChannelSelect,
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

// Lightweight membership check + sessionKey lookup for callers (like minting
// a realtime-push token) that don't need the full hydration payload.
export async function getConversationSessionKeyForMember(args: {
  conversationId: string;
  userId: string;
}): Promise<string | null> {
  const record = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { sessionKey: true },
  });
  return record?.sessionKey ?? null;
}

// Marks only the caller's membership row as read. The message list remains
// the source of truth; this timestamp is just the per-user cursor used by the
// conversation-list unread aggregate.
export async function markConversationChannelRead(args: {
  conversationId: string;
  userId: string;
}): Promise<boolean> {
  const result = await prisma.appConversationChannelMember.updateMany({
    where: {
      channelId: args.conversationId,
      userId: args.userId,
      channel: buildVisibleConversationWhere(),
    },
    data: { lastReadAt: new Date() },
  });
  return result.count > 0;
}

export type ConversationMemberSummary = {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
  // This member's own selected languages for this room (not the union) — the
  // client derives the union + per-language attribution shown in the picker
  // from these per-member lists, avoiding a second endpoint for the same data.
  selectedLanguages: string[];
  // Account-level "주 사용 언어" profile badge, distinct from selectedLanguages
  // above (that's this room's STT config). Public the same way name/handle are.
  nationality: string | null;
  primaryLanguages: string[];
  // True when a block exists between the caller and this member (either
  // direction). name/handle/image are nulled out for a blocked member so
  // the client never has real identity to accidentally render — it should
  // substitute its own generic placeholder and refuse to open the profile.
  blocked: boolean;
};

// Membership-gated: returns null (not an empty list) when the caller isn't a
// member of the channel, so the controller can 404 the same way the other
// per-conversation reads do instead of leaking who's in a room the caller
// can't see.
export async function listConversationMembersForUser(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationMemberSummary[] | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, pendingInviteeUserIds: true },
  });

  if (!conversationRecord) {
    return null;
  }

  const pendingInviteeUserIds = conversationRecord.pendingInviteeUserIds ?? [];
  const membersByChannelId = await listChannelMembersByChannelId([conversationRecord.id]);
  const members = membersByChannelId.get(conversationRecord.id) ?? [];
  const pendingInviteeProfileById = await listPendingInviteeProfilesByUserIds(
    pendingInviteeUserIds,
  );
  const pendingInviteeProfiles = pendingInviteeUserIds
    .map((userId) => pendingInviteeProfileById.get(userId))
    .filter((profile): profile is PendingInviteeProfile => Boolean(profile));
  const blockedCounterpartByChannelId = await resolveBlockedCounterpartUserIdByChannelId(
    args.userId,
    membersByChannelId,
  );
  const blockedCounterpartUserId = blockedCounterpartByChannelId.get(conversationRecord.id) ?? null;

  // A departed member drops off this list entirely — see filterActiveMembers.
  // Unlike blocking, there's no "left" flag to show instead: the room's
  // title/avatar/message history still reference them (those intentionally
  // read the full membership history), but the CURRENT participant list is
  // about who's in the room right now.
  const realMemberSummaries = filterActiveMembers(members).map((member) => {
    const blocked = member.userId === blockedCounterpartUserId;
    return {
      userId: member.userId,
      // Name/handle stay real even when blocked — the point is hiding their
      // profile PHOTO and preventing new contact, not making them
      // unrecognizable. Only the photo falls back to a default.
      name: member.name,
      handle: member.handle,
      image: blocked ? null : member.image,
      imageCropScale: blocked ? null : member.imageCropScale,
      imageCropX: blocked ? null : member.imageCropX,
      imageCropY: blocked ? null : member.imageCropY,
      selectedLanguages: member.selectedLanguages,
      nationality: member.nationality,
      primaryLanguages: member.primaryLanguages,
      blocked,
    };
  });

  const pendingMemberSummaries = pendingInviteeProfiles.map((profile) => ({
    userId: profile.userId,
    name: profile.name,
    handle: profile.handle,
    image: profile.image,
    imageCropScale: profile.imageCropScale,
    imageCropX: profile.imageCropX,
    imageCropY: profile.imageCropY,
    selectedLanguages: profile.defaultConversationLanguages,
    nationality: profile.nationality,
    primaryLanguages: profile.primaryLanguages,
    blocked: false,
  }));

  return [...realMemberSummaries, ...pendingMemberSummaries];
}

// Adds people to an ALREADY-CREATED room — the missing counterpart to
// createConversationChannelForUser's invitee list, which only ever runs at
// creation time. Any active member (not just the owner) may invite: a solo
// room going multi-member this way needs no other change anywhere else,
// since every viewer-facing resolver above already branches on
// resolveEffectiveMemberCount/pendingInviteeUserIds, and AppMessage rows are
// keyed by sessionKey (not by member list), so the room's pre-invite history
// stays exactly as it was.
export async function inviteMembersToConversationChannel(args: {
  conversationId: string;
  userId: string;
  inviteeUserIds: string[];
}): Promise<ConversationChannelSummary | null> {
  const requestedInviteeUserIds = [
    ...new Set(args.inviteeUserIds.filter((id) => id && id !== args.userId)),
  ];
  if (requestedInviteeUserIds.length === 0) {
    throw new Error("invalid_invitees");
  }

  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, pendingInviteeUserIds: true },
  });

  if (!existing) {
    return null;
  }

  const membersByChannelId = await listChannelMembersByChannelId([args.conversationId]);
  const activeMembers = filterActiveMembers(membersByChannelId.get(args.conversationId));
  const existingUserIds = new Set([
    ...activeMembers.map((member) => member.userId),
    ...existing.pendingInviteeUserIds,
  ]);
  const newInviteeUserIds = requestedInviteeUserIds.filter((id) => !existingUserIds.has(id));
  if (newInviteeUserIds.length === 0) {
    throw new Error("already_members");
  }
  if (existingUserIds.size + newInviteeUserIds.length > MAX_CONVERSATION_MEMBERS) {
    throw new Error("too_many_invitees");
  }

  await assertNoBlockAmong(args.userId, newInviteeUserIds);

  const targetUsers = await prisma.user.findMany({
    where: { id: { in: newInviteeUserIds } },
    select: { id: true },
  });
  if (targetUsers.length !== newInviteeUserIds.length) {
    throw new Error("target_user_not_found");
  }

  const record = await prisma.$transaction(async (tx) => {
    const updated = await tx.appConversationChannel.update({
      where: { id: args.conversationId },
      data: {
        // Same "no membership row until they send/receive via materialization"
        // treatment as a fresh room's invitees — see the field's doc comment
        // and materializePendingConversationInvitees.
        pendingInviteeUserIds: [...existing.pendingInviteeUserIds, ...newInviteeUserIds],
      },
      select: conversationChannelSelect,
    });

    // Written now, independent of materialization, so the "{inviter} invited
    // {invitee}" notice (see getConversationHydrationStateForUser) shows up
    // immediately instead of waiting for the invitee's first message.
    await tx.appConversationChannelInvite.createMany({
      data: newInviteeUserIds.map((inviteeUserId) => ({
        channelId: args.conversationId,
        inviteeUserId,
        invitedByUserId: args.userId,
      })),
      skipDuplicates: true,
    });

    return updated;
  });

  return serializeConversationChannelWithPreview(record, args.userId);
}

export async function getConversationHydrationStateForUser(args: {
  conversationId: string;
  userId: string;
  before?: ConversationHydrationCursor | null;
}): Promise<ConversationHydrationState | null> {
  const conversationRecord = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: conversationChannelSelect,
  });

  if (!conversationRecord) {
    return null;
  }

  const beforeDate = typeof args.before?.createdAtMs === "number"
    && Number.isFinite(args.before.createdAtMs)
    && args.before.createdAtMs > 0
    ? new Date(args.before.createdAtMs)
    : null;
  const beforeMessageId = (args.before?.messageId || "").trim();
  const messageWhere: Prisma.AppMessageWhereInput = {
    sessionKey: conversationRecord.sessionKey,
    ...buildVisibleMessageWhere(),
    ...(beforeDate && beforeMessageId
      ? {
          AND: [
            {
              OR: [
                { createdAt: { lt: beforeDate } },
                {
                  createdAt: beforeDate,
                  id: { lt: beforeMessageId },
                },
              ],
            },
          ],
        }
      : {}),
  };

  const [latestUsageEvent, totalMessageCount, messagesWithLookahead, inviteRecords] = await prisma.$transaction([
    prisma.appEventLog.findFirst({
      where: {
        sessionKey: conversationRecord.sessionKey,
        usageSec: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { usageSec: true },
    }),
    prisma.appMessage.count({
      where: {
        sessionKey: conversationRecord.sessionKey,
        ...buildVisibleMessageWhere(),
      },
    }),
    prisma.appMessage.findMany({
      where: messageWhere,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: CONVERSATION_HYDRATION_MESSAGE_LIMIT + 1,
      select: {
        id: true,
        clientMessageId: true,
        sourceLanguage: true,
        createdAt: true,
        metadata: true,
        userId: true,
        contents: {
          where: buildVisibleMessageContentWhere(),
          orderBy: { createdAt: "asc" },
          select: {
            contentType: true,
            language: true,
            text: true,
          },
        },
      },
    }),
    prisma.appConversationChannelInvite.findMany({
      where: { channelId: conversationRecord.id },
      select: { inviteeUserId: true, invitedByUserId: true, createdAt: true },
    }),
  ]);

  const hasMoreUtterances = messagesWithLookahead.length > CONVERSATION_HYDRATION_MESSAGE_LIMIT;
  const messages = messagesWithLookahead.slice(0, CONVERSATION_HYDRATION_MESSAGE_LIMIT);
  const oldestMessage = messages.at(-1) ?? null;
  const orderedMessages = [...messages].reverse();

  const [membersByChannelId, pendingInviteeProfileById] = await Promise.all([
    listChannelMembersByChannelId([conversationRecord.id]),
    listPendingInviteeProfilesByUserIds(conversationRecord.pendingInviteeUserIds),
  ]);
  const members = membersByChannelId.get(conversationRecord.id);
  const pendingInviteeProfiles = conversationRecord.pendingInviteeUserIds
    .map((userId) => pendingInviteeProfileById.get(userId))
    .filter((profile): profile is PendingInviteeProfile => Boolean(profile));
  // ACTIVE members only (unlike resolveViewerFacingTitle/resolveOtherMemberAvatars
  // below, which intentionally read the full membership history so the room
  // keeps showing a departed member's name/photo) — the conversation's own
  // isMultiMember flag is about the room's CURRENT state: once the only
  // other member leaves, the leave/delete menu action should revert to
  // delete, exactly like a room that never had a second member. Still
  // counts pending invitees, so the room already shows as multi-member
  // (title, participant list, avatar cluster) the moment someone is
  // invited, without waiting for their first-message materialization.
  const isMultiMember = resolveEffectiveMemberCount(
    filterActiveMembers(members),
    conversationRecord.pendingInviteeUserIds,
  ) >= 2;
  const realMembers = members ?? [];
  const imageByUserId = new Map((members ?? []).map((member) => [member.userId, member.image]));
  const nameByUserId = new Map((members ?? []).map((member) => [member.userId, member.name]));
  const handleByUserId = new Map((members ?? []).map((member) => [member.userId, member.handle]));
  const blockedCounterpartByChannelId = await resolveBlockedCounterpartUserIdByChannelId(
    args.userId,
    membersByChannelId,
  );
  const blockedCounterpartUserId = blockedCounterpartByChannelId.get(conversationRecord.id) ?? null;

  const utterances: ConversationHydrationUtterance[] = orderedMessages.map((message) => {
    const sourceContents = message.contents.filter((content) => content.contentType === "SOURCE");
    const sourceContent = sourceContents.find((content) => content.language === message.sourceLanguage)
      || sourceContents[0]
      || null;
    const translations: Record<string, string> = {};
    const translationFinalized: Record<string, boolean> = {};

    for (const content of message.contents) {
      if (content.contentType !== "TRANSLATION_FINAL") continue;
      const language = content.language.trim();
      const text = content.text.trim();
      if (!language || !text) continue;
      translations[language] = text;
      translationFinalized[language] = true;
    }

    const targetLanguages = Object.keys(translations);
    const metadata = readJsonObject(message.metadata);
    const clientMetadata = readJsonObject((metadata?.clientMetadata as Prisma.JsonValue | undefined) ?? null);
    // Point-in-time, not the room's current membership — see
    // countActiveRealMembersAt's doc comment. Also intentionally excludes
    // pending invitees (real members only): inviting someone shouldn't, by
    // itself, flip the inviter's own messages away from the
    // animal-avatar/diarized-speaker rendering solo sessions rely on to
    // distinguish detected voices — that switch happens only once the
    // invitee actually materializes into a real member.
    const isMultiMemberAtMessage = countActiveRealMembersAt(realMembers, message.createdAt.getTime()) >= 2;

    return {
      id: (message.clientMessageId || "").trim() || `db-${message.id}`,
      originalText: sourceContent?.text?.trim() || "",
      originalLang: (message.sourceLanguage || "").trim() || "unknown",
      targetLanguages,
      translations,
      translationFinalized,
      createdAtMs: message.createdAt.getTime(),
      speaker: readStringValue(clientMetadata?.speaker) ?? readStringValue(metadata?.speaker),
      speakerAvatarSeed:
        readStringValue(clientMetadata?.speakerAvatarSeed) ?? readStringValue(metadata?.speakerAvatarSeed),
      speakerAvatarIndex:
        readIntegerValue(clientMetadata?.speakerAvatarIndex) ?? readIntegerValue(metadata?.speakerAvatarIndex),
      speakerName: isMultiMemberAtMessage && message.userId
        ? (nameByUserId.get(message.userId) ?? null)
        : null,
      // Gated the same way as speakerImage: a solo session's diarized
      // "speaker" turns all resolve to the SAME single real account (the
      // one signed-in device), so leaving this populated there would make
      // every bubble compare equal to the viewer and force a right-aligned
      // "own message" layout onto what is actually a left/right speaker
      // distinction unrelated to account identity.
      speakerUserId: isMultiMemberAtMessage ? message.userId : null,
      // Also nulled for the blocked counterpart's own messages (past and
      // future) — keeps speakerUserId intact so bubble left/right alignment
      // stays correct, but ChatBubble's existing "shared-room member with no
      // photo" fallback renders a neutral placeholder avatar instead of
      // their real one.
      speakerImage: isMultiMemberAtMessage && message.userId && message.userId !== blockedCounterpartUserId
        ? (imageByUserId.get(message.userId) ?? null)
        : null,
    };
  }).filter((utterance) => utterance.originalText.length > 0);

  // Every inviter is (or was) a real member — only active members can invite
  // (see inviteMembersToConversationChannel) — so their name/handle always
  // resolve via the member map. An invitee resolves the same way once
  // materialized, or via pendingInviteeProfileById before that.
  const inviteNotices: ConversationHydrationInviteNotice[] = inviteRecords.map((invite) => ({
    inviteeUserId: invite.inviteeUserId,
    inviteeName: nameByUserId.get(invite.inviteeUserId)
      ?? pendingInviteeProfileById.get(invite.inviteeUserId)?.name
      ?? null,
    inviteeHandle: handleByUserId.get(invite.inviteeUserId)
      ?? pendingInviteeProfileById.get(invite.inviteeUserId)?.handle
      ?? null,
    invitedByUserId: invite.invitedByUserId,
    invitedByName: nameByUserId.get(invite.invitedByUserId) ?? null,
    invitedByHandle: handleByUserId.get(invite.invitedByUserId) ?? null,
    invitedAtMs: invite.createdAt.getTime(),
  }));

  return {
    conversation: serializeConversationChannel(
      conversationRecord,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      resolveViewerFacingTitle(
        conversationRecord.title,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        pendingInviteeProfiles,
        conversationRecord.userEditedTitleAt,
      ),
      resolveViewerFacingDisplayLanguage(
        conversationRecord.defaultDisplayLanguage,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        conversationRecord.pendingInviteeUserIds,
        pendingInviteeProfiles,
      ),
      resolveViewerFacingStatus(
        conversationRecord.status,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        conversationRecord.pendingInviteeUserIds,
      ),
      resolveViewerFacingPausedAt(
        conversationRecord.pausedAt,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        conversationRecord.pendingInviteeUserIds,
      ),
      isMultiMember,
      resolveRoomLanguageUnion(
        conversationRecord.selectedLanguages,
        membersByChannelId.get(conversationRecord.id),
        conversationRecord.pendingInviteeUserIds,
        args.userId,
        pendingInviteeProfiles,
      ),
      resolveViewerOwnSelectedLanguages(
        conversationRecord.selectedLanguages,
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        conversationRecord.pendingInviteeUserIds,
      ),
      Boolean(blockedCounterpartUserId),
      resolveOtherMemberAvatars(
        membersByChannelId.get(conversationRecord.id),
        args.userId,
        blockedCounterpartUserId,
        pendingInviteeProfiles,
      ),
    ),
    usageSec: Math.max(0, latestUsageEvent?.usageSec ?? 0),
    messageCount: Number.isFinite(totalMessageCount) ? Math.max(0, totalMessageCount) : 0,
    utterances,
    hasMoreUtterances,
    oldestMessageCursor: oldestMessage
      ? {
          createdAtMs: oldestMessage.createdAt.getTime(),
          messageId: oldestMessage.id,
        }
      : null,
    leaveNotices: (members ?? [])
      .filter((member) => Boolean(member.leftAt))
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        handle: member.handle,
        leftAtMs: (member.leftAt as Date).getTime(),
      })),
    inviteNotices,
  };
}

export async function deleteConversationChannel(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationChannelSummary | null> {
  // Delete-for-everyone stays owner-only, unlike every other operation above —
  // an arbitrary invited member shouldn't be able to remove the room for the
  // rest of the group. It also requires the owner to still be an ACTIVE
  // member (leftAt: null): once the owner leaves their own shared room via
  // leaveConversationChannel below, nobody inherits delete-for-everyone —
  // ownership is not reassigned, so the room can only be dissolved one
  // individual leave at a time from then on.
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ownerUserId: args.userId,
      members: { some: { userId: args.userId, leftAt: null } },
      ...buildVisibleConversationWhere(),
    },
    select: { id: true },
  });

  if (!existing) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        const lowestChannel = await tx.appConversationChannel.findFirst({
          where: { ownerUserId: args.userId },
          orderBy: { sequenceNumber: "asc" },
          select: { sequenceNumber: true },
        });
        const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, 0) - 1;

        return tx.appConversationChannel.update({
          where: { id: args.conversationId },
          data: {
            isDeleted: true,
            status: APP_CONVERSATION_STATUS_PAUSED,
            pausedAt: new Date(),
            sequenceNumber: vacatedSequenceNumber,
          },
          select: conversationChannelSelect,
        });
      });

      return serializeConversationChannel(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("conversation_channel_delete_conflict");
}

// Member-level equivalent of deleteConversationChannel above, for a shared
// (2+-member) room: removes only the caller's own presence, never the whole
// room. The membership row is kept with leftAt set (not deleted) — see the
// leftAt doc comment on AppConversationChannelMember — so the remaining
// members' room title/avatar/message history stay intact
// (resolveViewerFacingTitle and friends deliberately read the FULL member
// list, not just active ones) while buildVisibleMembershipWhere makes the
// room behave as if it doesn't exist for the caller from now on.
export async function leaveConversationChannel(args: {
  conversationId: string;
  userId: string;
}): Promise<ConversationChannelSummary | null> {
  const existing = await prisma.appConversationChannel.findFirst({
    where: {
      id: args.conversationId,
      ...buildVisibleMembershipWhere(args.userId),
      ...buildVisibleConversationWhere(),
    },
    select: { id: true, ownerUserId: true },
  });

  if (!existing) {
    return null;
  }

  const activeMemberCount = await prisma.appConversationChannelMember.count({
    where: { channelId: args.conversationId, leftAt: null },
  });
  // The caller is guaranteed active (buildVisibleMembershipWhere above), so
  // a count of 1 means they're the last one left.
  const isLastActiveMember = activeMemberCount <= 1;
  const isOwner = existing.ownerUserId === args.userId;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await prisma.$transaction(async (tx) => {
        await tx.appConversationChannelMember.update({
          where: { channelId_userId: { channelId: args.conversationId, userId: args.userId } },
          data: { leftAt: new Date() },
        });

        if (isLastActiveMember) {
          // Nobody's left to see the room — same end state as
          // deleteConversationChannel's owner-only full delete, including
          // freeing the channel's own owner's room-count slot (which may or
          // may not be the person leaving right now, if the owner already
          // left earlier).
          const lowestChannel = await tx.appConversationChannel.findFirst({
            where: { ownerUserId: existing.ownerUserId },
            orderBy: { sequenceNumber: "asc" },
            select: { sequenceNumber: true },
          });
          const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, 0) - 1;

          return tx.appConversationChannel.update({
            where: { id: args.conversationId },
            data: {
              isDeleted: true,
              status: APP_CONVERSATION_STATUS_PAUSED,
              pausedAt: new Date(),
              sequenceNumber: vacatedSequenceNumber,
            },
            select: conversationChannelSelect,
          });
        }

        if (isOwner) {
          // The room stays alive for the remaining members (nobody inherits
          // delete-for-everyone — see deleteConversationChannel), but the
          // owner relinquishing their own room fully frees their room-count
          // slot just like a full delete would.
          const lowestChannel = await tx.appConversationChannel.findFirst({
            where: { ownerUserId: args.userId },
            orderBy: { sequenceNumber: "asc" },
            select: { sequenceNumber: true },
          });
          const vacatedSequenceNumber = Math.min(lowestChannel?.sequenceNumber ?? 0, 0) - 1;
          await tx.appConversationChannel.update({
            where: { id: args.conversationId },
            data: { sequenceNumber: vacatedSequenceNumber },
          });
        }

        return tx.appConversationChannel.findUniqueOrThrow({
          where: { id: args.conversationId },
          select: conversationChannelSelect,
        });
      });

      return serializeConversationChannel(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("conversation_channel_leave_conflict");
}
