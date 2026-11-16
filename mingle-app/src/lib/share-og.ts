import type { Metadata } from "next";

// Link previews (KakaoTalk, LINE, iMessage, Slack, AI assistants) for every page this
// server answers: the app root, shared profiles (/p/), shared conversations (/s/) and
// invite tickets (/i/). Previews are cached by image URL, and /og-image.png showed the
// Mingle card before the rename, so the HashChat card lives at its own URL.
export const HASHCHAT_OG_IMAGE = {
  url: "/og-hashchat.png?v=20261112",
  width: 1200,
  height: 630,
  alt: "HashChat (formerly Mingle): a messenger that interprets as you talk",
};

export const HASHCHAT_OG_TITLE = "HashChat (formerly Mingle): translating messenger";
export const HASHCHAT_OG_DESCRIPTION =
  "Talk with friends abroad, each in your own language. Chats, voice and posts are interpreted as you talk.";

/** openGraph + twitter for one page, always with the HashChat card. */
export function shareLinkPreview(title: string, description: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      images: [HASHCHAT_OG_IMAGE],
      type: "website",
      siteName: "HashChat",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [HASHCHAT_OG_IMAGE.url],
    },
  };
}
