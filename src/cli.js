#!/usr/bin/env node
// yap-transcribe: the same on-device transcription as the MCP server, in the
// terminal. Usage: yap-transcribe <audio-or-video-file>... [--timestamps] [--raw]
import path from 'node:path';
import { modelStatus, prepareModel, transcribe } from './speech.js';
import { polish } from './polish.js';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const timestamps = args.includes('--timestamps');
const raw = args.includes('--raw');
if (!files.length || args.includes('--help')) {
  console.log('Usage: yap-transcribe <file>... [--timestamps] [--raw]\n\nTranscribes audio and video files on this computer with NVIDIA Parakeet (25 European languages, detected automatically). Nothing is uploaded. The first run downloads the speech model once (about 670 MB).\nMore: https://yapapp.cc/mcp');
  process.exit(files.length ? 0 : 1);
}

if (modelStatus().status !== 'ready') {
  process.stderr.write('Downloading the speech model once (about 670 MB)...\n');
  const timer = setInterval(() => process.stderr.write(`\r${modelStatus().percent}%`), 1000);
  try { await prepareModel(); } finally { clearInterval(timer); process.stderr.write('\r100%\n'); }
}
const dir = modelStatus().directory;
let failed = 0;
for (const file of files) {
  try {
    const result = await transcribe(path.resolve(file), dir);
    if (files.length > 1) console.log(`# ${path.basename(file)}`);
    if (timestamps) for (const p of result.parts) console.log(`[${p.start}] ${raw ? p.text : polish(p.text)}`);
    else { const text = result.parts.map(p => p.text).join(' '); console.log(raw ? text : polish(text)); }
    if (files.length > 1) console.log('');
  } catch (error) { failed++; console.error(`${file}: ${error.message}`); }
}
process.exit(failed ? 1 : 0);
