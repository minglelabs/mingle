# Store screenshots

Source for the App Store and Google Play screenshot set: 8 slides in 15 languages. Every language gets its own screens, with the app UI and the post/comment translations in that language.

| # | Screen | Source |
|---|---|---|
| 01 | Full-bleed photo of friends from many countries. Caption: make Korean friends (ko: foreign friends) | `hero/group.jpg` (drawn with the ChatGPT app bridge, `scripts/chatgpt-image-bridge.mjs`; sky extended from `group-original.png`) |
| 02 | 1:1 chat, each in their own language: a foreign viewer with a Korean friend (민지) talking about a trip to Seoul and practising Korean; the Korean viewer with Emma, who is coming to Seoul | drawn from `dm.json` (`dm`, and `viewerOverrides.ko.dm` for the Korean viewer) with the app's bubble layout, on `render.py`'s photo slide over `scenes/backdrop-02.jpg` |
| 03 | A voice talk with the friend, interpreted live (airport pick-up) | `dm.json` (`voice`), laid out as the app's voice talk panel, over `scenes/backdrop-03.jpg` |
| 04 | Tips from a local friend and an interpreted booking call to a hair salon | `render.py` scene (`booking` lines) over the two `booking/` photos, with the tilted phone on the booking call |
| 05 | A friend's post read in your language | app (`/{locale}/feed?postId=…`) |
| 06 | Comments, translated. Caption: comment on posts in your language | app (comment sheet) |
| 07 | Hash Rush. Caption: play games with friends | live site, `?lang=` |
| 08 | Safety statement, no phone: creeps, rude users and scammers are banned for good; one tap to report, the team reviews every report | `render.py` `STATEMENT_PAGE` from `captions.json` `statement` (points and note per language) |

The positioning behind the captions is in `docs/positioning-korean-friends.md`. A viewer can have its own lines under `dm.json` `viewerOverrides.<lang>` (used for Korean, who talks with a foreign friend); `capture.mjs` and `render.py` read them before the shared lines. `chat.json` `partners` puts Korean first for every non-Korean viewer.

The group chat (`chat.png`) and search (`search.png`) captures are still taken but no slide uses them: Google Play takes at most 8 phone screenshots.

Files:
- `capture.mjs`: loads each screen in headless Chrome at iPhone size (390x797 pt @3x, the area under the status bar) and writes `captures/<lang>/<screen>.png`.
- `dm.json`: the lines of the three 1:1 slides in all languages (chat, voice mode, booking call), the friend's name per partner language and the booking room title. `node capture.mjs --screens dm,voice,booking` draws them with no server.
- `chat.json`: the four chat lines in all languages, partner languages per viewer, room title and the "collapse" label.
- `captions.json`: headline per slide and language, and which language each upload locale folder gets.
- `previews/<nn>-<lang>.jpg`: one sheet per language with its 8 slides, for review. `python3 make-previews.py` builds them from the uploaded PNGs after `render.py`.
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
