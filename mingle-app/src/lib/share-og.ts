import type { Metadata } from "next";

// Link previews (KakaoTalk, LINE, iMessage, Slack, AI assistants) for every page this
// server answers: the app root, shared profiles (/p/), shared conversations (/s/) and
// invite tickets (/i/). Previews are cached by image URL, and /og-image.png showed the
// Mingle card before the rename, so the HashChat card lives at its own URL.
export const HASHCHAT_OG_IMAGE = {
  // v=20261121: the card's line is now the brand line (it was the old "translated for you" feed line).
  url: "/og-hashchat.png?v=20261121",
  width: 1200,
  height: 630,
  alt: "HashChat: make Korean friends, even before your Korean is good",
};

export const HASHCHAT_OG_TITLE = "HashChat: make Korean friends";
export const HASHCHAT_OG_DESCRIPTION =
  "Make Korean friends, even before your Korean is good. Chats show in your own language and voice talks are interpreted live.";

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
