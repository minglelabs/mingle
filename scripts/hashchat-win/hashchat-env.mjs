// Usage: node hashchat-env.mjs <railway-json> <old-app.env> <out-json> <out-env>
// Writes the app's env as JSON (multi-line values kept) and an env-file of single-line values.
import fs from 'node:fs'
const [raw, oldEnv, outJson, outEnv] = process.argv.slice(2)
const vars = JSON.parse(fs.readFileSync(raw, 'utf8'))
for (const k of Object.keys(vars)) if (k.startsWith('RAILWAY_')) delete vars[k]
const old = Object.fromEntries(fs.readFileSync(oldEnv, 'utf8').split('\n')
  .filter((l) => /^(LIVEKIT_API_KEY|LIVEKIT_API_SECRET)=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
Object.assign(vars, {
  PORT: '8080',
  NEXT_PUBLIC_SITE_URL: 'https://hashchat-win.minglelabs.app',
  NEXTAUTH_URL: 'https://hashchat-win.minglelabs.app',
  NEXT_PUBLIC_HASH_RUSH_SERVER: 'wss://hashrush-win.minglelabs.app',
  MINGLE_OPERATOR_POST_WORKER: 'off',
  MINGLE_OPERATOR_AUTO_REPLY_WORKER: 'off',
  MINGLE_OPERATOR_POST_RESERVE_WORKER: 'off',
  MINGLE_OPERATOR_AUTOMATION_WORKER: 'off',
  MINGLE_HAMZZI_WORKER: 'off',
  LIVEKIT_URL: 'wss://voice.minglelabs.app',
  LIVEKIT_API_KEY: old.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: old.LIVEKIT_API_SECRET,
})
if (!vars.LIVEKIT_API_KEY || !vars.LIVEKIT_API_SECRET) throw new Error('livekit key missing')
fs.writeFileSync(outJson, JSON.stringify(vars), { mode: 0o600 })
const single = Object.entries(vars).filter(([, v]) => !String(v).includes('\n'))
fs.writeFileSync(outEnv, single.map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 })
const multi = Object.keys(vars).filter((k) => String(vars[k]).includes('\n'))
console.log(`keys=${Object.keys(vars).length} multiline=${multi.join(',') || 'none'}`)
