"use client";

import type { PostForegroundTone } from "@/lib/post-backgrounds";
import { createContext } from "react";

/**
 * The ink that reads on the post currently on screen (`postForegroundTone`):
 * `light` = white over photos / dark backgrounds, `dark` = dark ink over light
 * ones. Chrome laid over the post (the glass tab bar) follows it. Null outside
 * a feed.
 */
export const FeedGlyphToneContext = createContext<PostForegroundTone | null>(null);
