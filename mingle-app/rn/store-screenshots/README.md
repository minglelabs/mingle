# Store screenshots

Source for the App Store and Google Play screenshot set: 8 slides in 15 languages. Every language gets its own screens, with the app UI and the post/comment translations in that language.

| # | Screen | Source |
|---|---|---|
| 01 | Full-bleed photo of friends from many countries | `hero/group.jpg` (drawn with the ChatGPT app bridge, `scripts/chatgpt-image-bridge.mjs`; sky extended to the slide height from `group-original.png`) |
| 02 | 1:1 chat with a friend abroad, each in their own language | drawn from `dm.json` (`dm`) with the app's bubble layout |
| 03 | A voice talk (the app's voice call) with the friend, interpreted | drawn from `dm.json` (`voice`): the room with the voice talk panel open, laid out as `VoiceTalkPanel.tsx` on the voice talk branch (`feat/voicetalk-windows-livekit-mvp`) shows it. The panel shows the two people in the call and one open seat, in each language's own words (the app's `src/i18n/voice-talk-copy.ts` there); the room's speech-to-text button reads `Start`/`Stop` in every language, as in the app |
| 04 | A booking call, interpreted | composed by `render.py` (`"scene": "booking"`): `booking/salon.jpg` above `booking/restaurant.jpg` (drawn with the ChatGPT pool, no words or logos in them), a tilted phone on the booking call (`captures/<lang>/booking.png`, the same voice talk layout), and the four `dm.json` `booking` lines floating beside it as the app's bubbles |
| 05 | A post written in another language, read in yours | app (`/{locale}/feed?postId=…`) |
| 06 | Comments, translated | app (comment sheet) |
| 07–08 | Hash Rush (meadow, beach) | live site, `?lang=` (ko/ja/zh get their own text, others English) |

The group chat (`chat.png`) and search (`search.png`) captures are still taken but no slide uses them: Google Play takes at most 8 phone screenshots.

Files:
- `capture.mjs`: loads each screen in headless Chrome at iPhone size (390x797 pt @3x, the area under the status bar) and writes `captures/<lang>/<screen>.png`.
- `dm.json`: the lines of the three 1:1 slides in all languages (chat, voice mode, booking call), the friend's name per partner language and the booking room title. `node capture.mjs --screens dm,voice,booking` draws them with no server.
- `chat.json`: the four chat lines in all languages, partner languages per viewer, room title and the "collapse" label.
- `captions.json`: headline per slide and language, and which language each upload locale folder gets.
- `previews/<nn>-<lang>.jpg`: one sheet per language with its 8 slides, for review (the uploaded PNGs side by side).
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
