# Store screenshots

Source for the App Store and Google Play screenshot set: 7 slides in 15 languages. Every language gets its own screens, with the app UI and the post/comment translations in that language.

| # | Screen | Source |
|---|---|---|
| 01 | Full-bleed photo of friends from many countries | `hero/group.jpg` (drawn with the ChatGPT app bridge, `scripts/chatgpt-image-bridge.mjs`; sky extended to the slide height from `group-original.png`) |
| 02 | A post written in another language, read in yours | app (`/{locale}/feed?postId=…`) |
| 03 | Comments, translated | app (comment sheet) |
| 04 | Group chat in three languages | drawn from `chat.json` with the app's bubble layout (a real room needs real members) |
| 05 | Search: people and posts | app (`/{locale}/connect`, query "ki") |
| 06–07 | Hash Rush (meadow, beach) | live site, `?lang=` (ko/ja/zh get their own text, others English) |

Files:
- `capture.mjs`: loads each screen in headless Chrome at iPhone size (390x797 pt @3x, the area under the status bar) and writes `captures/<lang>/<screen>.png`.
- `chat.json`: the four chat lines in all languages, partner languages per viewer, room title and the "collapse" label.
- `captions.json`: headline per slide and language, and which language each upload locale folder gets.
- `previews/<nn>-<lang>.jpg`: one sheet per language with its 7 slides, for review.
- `render.py`: draws each slide (headline, phone frame, iOS status bar, capture) with headless Chrome at 1290x2796, compresses it with pngquant and replaces the PNGs in `../appstore-connect-info/upload/<locale>/` and `../google-play-console-info/upload/<locale>/`.

## Run

Needs a running devbox web server with the local DB (posts, comments and users from local QA), Google Chrome and pngquant.

```bash
cd mingle-app/rn/store-screenshots
npm install
node capture.mjs                 # all languages; --only ko,en for some; --base for another server
python3 render.py                # all languages; --only ko for one
```

`capture.mjs` signs in as a local-only test account (`store-shots@hashchat.test`, handle `alex.travels`) so on-demand translations and people search work. Its password lives in `.env.local` (gitignored). The account exists only in the devbox DB; to recreate it, insert a user with that email and a `pbkdf2_sha256` hash from `src/lib/email-password-auth.ts`.

The post ids in `capture.mjs` are rows in the local DB. With a different DB, pick other posts (a photo post, a post in a language other than the viewer's, a post with 3 comments).

After uploading to Play with `scripts/google-play-console-sync.mjs`, the media snapshots in `google-play-console-info.i18n.json` are refreshed. Until then `src/integration/google-play-console-media-snapshots.test.ts` fails on purpose.
