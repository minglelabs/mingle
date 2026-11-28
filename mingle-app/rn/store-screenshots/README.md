# Store screenshots

Source for the App Store and Google Play screenshot set: 8 slides in 15 languages. Every language gets its own screens, with the app UI and the post/comment translations in that language.

| # | Screen | Source |
|---|---|---|
| 01 | Full-bleed photo of friends from many countries. Caption: make Korean friends and explore Korea together (ko: meet foreign friends who love Korea) | `hero/group.jpg` |
| 02 | 1:1 chat, each in their own language | `dm.json` `dm` (+ `viewerOverrides.ko.dm`), photo slide over `scenes/backdrop-02.jpg` |
| 03 | A group voice talk with all 8 seats filled (K-pop chat room), every line interpreted. The seats use operator accounts' profile photos (`people/*.jpg`, face crops); the viewer's own seat is `people/me.jpg` | `dm.json` `group` → `captures/<lang>/group.png`, over `scenes/backdrop-03.jpg` |
| 04 | Safety statement: creeps, rude users and scammers banned for good; one tap to report | `render.py` `STATEMENT_PAGE` |
| 05 | Planning a Korea trip with a friend: a photo of friends around a phone (`trip/friends.jpg`, drawn with ChatGPT), the trip chat on a tilted phone, and the route Incheon Airport → Gwanghwamun → Gangnam → Han River as connected stops | `render.py` `TRIP_PAGE`, `dm.json` `trip` and `tripStops` |
| 06 | An interpreted booking call to a hair salon | `render.py` scene (`booking` lines) over the `booking/` salon photos (`salon.jpg` above, `salon-desk.jpg` below, drawn with ChatGPT) |
| 07 | Women-only mode (not built yet: ships with the matching feature, and this PR waits for it): the friend finder with the "Women only" chip on and women's profile cards | `capture.mjs` `womenHtml`, `dm.json` `women` → `captures/<lang>/women.png` |
| 08 | A friend's post read in your language. App Store only (`"iosOnly": true`): Google Play takes at most 8 phone screenshots | app (`/{locale}/feed?postId=…`) |
| 09 | Hash Rush (meadow) | live site, `?lang=` |

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
