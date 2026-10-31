# Hash Rush engine

The Hash Rush game code that the app runs in a chat room: the simulation, the
renderer, the controls, the sounds and the strings. It was copied from the
hash-rush repository so the game runs inside the app itself instead of in an
iframe.

## Source

| | |
| --- | --- |
| Repository | `github.com/minglelabs/hash-rush` |
| Branch | `feat/g2-server-rooms` |
| Commit | `7004a49a77f03cc8bb65f45e5bef929db0c02b78` (2026-11-01) |
| License | hash-rush has no LICENSE file. It is minglelabs' own repository, copied here by its owner. In this repository the copy is part of mingle-app and is under the same terms as the rest of mingle-app. |

The folders keep the source layout, so the relative imports are unchanged:

| Here | From hash-rush |
| --- | --- |
| `sim/` | `src/sim/` (all of it) |
| `ai/bot.js`, `ai/nav.js`, `ai/search.js` | `src/ai/` (`client/input.js` uses `predictSwing` from `bot.js`) |
| `client/render.js`, `deco.js`, `looks.js` | `src/client/` (drawing) |
| `client/input.js`, `assist.js`, `predict.js` | `src/client/` (controls, lane help, playing ahead of the server) |
| `client/audio.js`, `music.js`, `haptics.js` | `src/client/` (sound and buzz) |
| `client/i18n.js` | `src/client/i18n.js` (all strings: the lobby and results of phase 2 need them too) |
| `client/net.js` | `src/client/net.js` |

Not copied: the web page (`main.js`, `index.html`, `style.css`), its other pages
(room list, ranking, board, chat bar), the iframe bridge (`embed.js`) and the
reinforcement-learning computers (`ai/rl-bot.js`, `policy.js`, `observe.js`,
`rl-*.bin`). Computers play on the game server, not in the app.

## Maintained in mingle

This copy is now maintained in mingle. Change it here, and do not paste newer
hash-rush files over it: the mingle changes would be lost.

The game server (hash-rush `server/`) runs its own copy of `sim/`, `ai/bot.js`
and `client/assist.js`. The app plays its own hamster ahead of the server with
this `sim/` (`client/predict.js`), so a change to how the game plays has to go
to both copies, or the prediction and the server disagree and the hamster
jitters.

The files stay plain ES modules (`.js`). TypeScript reads them through
`allowJs` without type-checking them (no `checkJs`), and ESLint skips this
folder.
