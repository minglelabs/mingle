import { ensureInterpreter } from './interpreter';
import { env, missingProviderKeys } from './env';

// Standalone interpreter for one room: `pnpm agent -- <room>`. The POC server
// already starts one per room on demand; this is for running it apart.
const roomName = process.argv.slice(2).find((arg) => !arg.startsWith('-')) || 'poc';
const missing = missingProviderKeys();
if (missing.length) {
    console.error(`missing keys: ${missing.join(', ')}`);
    process.exit(1);
}
console.log(`interpreter for room "${roomName}" on ${env.livekitUrl}`);
ensureInterpreter(roomName).catch(() => process.exit(1));
