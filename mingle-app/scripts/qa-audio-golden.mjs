#!/usr/bin/env node

// Renders the golden STT/translation utterances listed in
// test-fixtures/audio/golden/manifest.json into 16-bit mono WAV files under
// test-fixtures/audio/local/golden/ (git ignored). The audio is synthesized
// with the macOS `say` voices named in the manifest, trimmed to the speech so
// "end of file" is "end of speech", and indexed with its duration.
//
// Usage:
//   node scripts/qa-audio-golden.mjs [--force] [--ids ko-greeting-01,en-meeting-01]

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  GOLDEN_AUDIO_DIR,
  GOLDEN_MANIFEST_PATH,
  readGoldenManifest,
  trimPcm16WavSilence,
} from './qa-stt-audio-metrics.logic.mjs';

function parseArgs(argv) {
  const options = { force: false, ids: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--force') {
      options.force = true;
    } else if (token === '--ids') {
      options.ids = String(argv[index + 1] || '').split(',').map((id) => id.trim()).filter(Boolean);
      index += 1;
    }
  }
  return options;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function generateGoldenAudio({ force = false, ids = [] } = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('Golden audio is rendered with macOS `say`; run this on a Mac.');
  }
  const manifest = await readGoldenManifest();
  const selected = ids.length > 0
    ? manifest.fixtures.filter((fixture) => ids.includes(fixture.id))
    : manifest.fixtures;
  const missing = ids.filter((id) => !manifest.fixtures.some((fixture) => fixture.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown golden fixture id(s): ${missing.join(', ')}`);
  }

  await fs.mkdir(GOLDEN_AUDIO_DIR, { recursive: true });
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mingle-golden-audio-'));
  const sampleRate = Number(manifest.generator?.sampleRate) || 16_000;
  const indexPath = path.join(GOLDEN_AUDIO_DIR, 'index.json');
  const index = await fs.readFile(indexPath, 'utf8').then(JSON.parse).catch(() => ({ fixtures: {} }));

  try {
    for (const fixture of selected) {
      const outputPath = path.join(GOLDEN_AUDIO_DIR, `${fixture.id}.wav`);
      if (!force && await pathExists(outputPath) && index.fixtures?.[fixture.id]?.transcript === fixture.transcript) {
        console.log(`skip ${fixture.id} (exists)`);
        continue;
      }
      const voice = fixture.voice || manifest.generator?.voices?.[fixture.language];
      if (!voice) {
        throw new Error(`No macOS voice configured for ${fixture.id} (${fixture.language}).`);
      }
      const aiffPath = path.join(workDir, `${fixture.id}.aiff`);
      const rawWavPath = path.join(workDir, `${fixture.id}.wav`);
      await run('say', ['-v', voice, '-o', aiffPath, fixture.transcript]);
      await run('afconvert', ['-f', 'WAVE', '-d', `LEI16@${sampleRate}`, '-c', '1', aiffPath, rawWavPath]);
      const trimmed = trimPcm16WavSilence(await fs.readFile(rawWavPath));
      await fs.writeFile(outputPath, trimmed.wav);
      index.fixtures[fixture.id] = {
        file: `${fixture.id}.wav`,
        language: fixture.language,
        transcript: fixture.transcript,
        voice,
        sampleRate,
        durationMs: trimmed.durationMs,
      };
      console.log(`wrote ${path.relative(process.cwd(), outputPath)} (${trimmed.durationMs} ms, ${voice})`);
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  index.manifest = path.relative(GOLDEN_AUDIO_DIR, GOLDEN_MANIFEST_PATH);
  index.generatedAt = new Date().toISOString();
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await generateGoldenAudio(parseArgs(process.argv.slice(2)));
}
