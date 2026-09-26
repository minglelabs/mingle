// The one place the PUBLIC conversation-share payload is shaped. Both the
// unauthenticated GET /api/conversations/shared/[shareToken] handler and the
// /s/[shareToken] page's own server render go through here, so the two can
// never drift into exposing different fields for the same link.
//
// The hard rule: nothing in here may carry an internal identifier. A share
// link is handed to strangers, so database message ids, the room id, the
// session key and — the reason this module exists — real account ids all stay
// server-side. Speakers are distinguished by an opaque per-response alias
// ('s1', 's2', … in order of first appearance) that is meaningless outside
// the one response it was generated in and cannot be correlated back to an
// account or across two snapshots of the same room.
//
// Deliberately typed structurally rather than against app-conversations'
// types: client code imports these types, and pulling a Prisma-backed module
// into the browser bundle for a type alias is not worth it.

export type PublicSpectateInviter = {
  name: string | null;
  image: string | null;
  imageCropScale: number | null;
  imageCropX: number | null;
  imageCropY: number | null;
};

export type PublicSpectateUtterance = {
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
  speakerName: string | null;
  // Opaque stand-in for the sender's account: non-null exactly when the
  // message came from an identified room member, which is all the bubble
  // needs to tell a shared-room member apart from a solo-session diarized
  // speaker. Never derived from the real id.
  speakerAlias: string | null;
  speakerImage: string | null;
};

export type PublicSpectateSnapshot = {
  conversation: { title: string };
  // The sharer's already-public profile card (what the /s/ page renders in
  // its invite banner), resolved server-side so the payload never has to
  // carry their account id for a client to look them up with.
  sharedBy: PublicSpectateInviter | null;
  utterances: PublicSpectateUtterance[];
};

type ShareSnapshotUtteranceInput = {
  originalText: string;
  originalLang: string;
  targetLanguages: string[];
  translations: Record<string, string>;
  translationFinalized: Record<string, boolean>;
  createdAtMs: number;
  speaker: string | null;
  speakerAvatarSeed: string | null;
  speakerAvatarIndex: number | null;
  speakerName: string | null;
  speakerUserId: string | null;
  speakerImage: string | null;
};

type ShareSnapshotInput = {
  conversation: { title: string };
  utterances: ShareSnapshotUtteranceInput[];
};

export function toPublicSpectateUtterances(
  utterances: readonly ShareSnapshotUtteranceInput[],
): PublicSpectateUtterance[] {
  // Aliases are assigned per call, in first-appearance order, so the same
  // account gets a different alias in the next response — there is nothing
  // stable here to join on.
  const aliasByUserId = new Map<string, string>();

  return utterances.map((utterance, index) => {
    let speakerAlias: string | null = null;
    if (utterance.speakerUserId) {
      const existingAlias = aliasByUserId.get(utterance.speakerUserId);
      if (existingAlias) {
        speakerAlias = existingAlias;
      } else {
        speakerAlias = `s${aliasByUserId.size + 1}`;
        aliasByUserId.set(utterance.speakerUserId, speakerAlias);
      }
    }

    return {
      // The viewer only needs a React key; do not expose database message IDs.
      id: `snapshot-message-${index}`,
      originalText: utterance.originalText,
      originalLang: utterance.originalLang,
      targetLanguages: utterance.targetLanguages,
      translations: utterance.translations,
      translationFinalized: utterance.translationFinalized,
      createdAtMs: utterance.createdAtMs,
      speaker: utterance.speaker,
      speakerAvatarSeed: utterance.speakerAvatarSeed,
      speakerAvatarIndex: utterance.speakerAvatarIndex,
      speakerName: utterance.speakerName,
      speakerAlias,
      speakerImage: utterance.speakerImage,
    };
  });
}

export function toPublicSpectateSnapshot(
  state: ShareSnapshotInput,
  sharedBy: PublicSpectateInviter | null,
): PublicSpectateSnapshot {
  return {
    conversation: { title: state.conversation.title },
    sharedBy,
    utterances: toPublicSpectateUtterances(state.utterances),
  };
}
