// End-to-end check through a real MCP client over stdio: tool list, the
// one-time model download, transcription of the desktop app's own speech
// fixture (WAV, AAC in M4A, and a long file split into windows), and the
// read-only history search. Run: npm test (downloads the model once).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { windows } from '../src/speech.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(root, 'test', 'fixtures', 'sandbox-dictation.wav');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yap-mcp-test-'));

// Windows end inside the last seconds, at the quietest frame, and cover every sample.
const rate = 16000, long = new Float32Array(rate * 70).map((_, i) => Math.sin(i / 7) * ((i % (rate * 10)) < rate * 9 ? 0.5 : 0.001));
const spans = windows(long);
assert.ok(spans.length >= 3, 'a 70 s signal splits into windows');
assert.equal(spans[0][0], 0); assert.equal(spans.at(-1)[1], long.length);
for (let i = 1; i < spans.length; i++) assert.equal(spans[i][0], spans[i - 1][1], 'windows are contiguous');
for (const [a, b] of spans.slice(0, -1)) assert.ok(b - a <= 28 * rate && b - a >= 22 * rate, 'window length');

// A Yap history database with the app's own schema, read through the env override.
const { DatabaseSync } = await import('node:sqlite');
const historyFile = path.join(work, 'history.sqlite');
const db = new DatabaseSync(historyFile);
db.exec(`CREATE TABLE dictations (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, word_count INTEGER NOT NULL DEFAULT 0, recording_ms INTEGER, processing_ms INTEGER, raw_text TEXT, audio TEXT)`);
const insert = db.prepare('INSERT INTO dictations (id,text,created_at,status,word_count) VALUES (?,?,?,?,?)');
insert.run('a', 'Remind me to send the quarterly budget to Dana.', Date.now() - 3600000, 'inserted', 9);
insert.run('b', 'A recording that was discarded.', Date.now() - 1800000, 'discarded', 5);
insert.run('c', 'Old note about the budget.', Date.now() - 40 * 86400000, 'copied', 5);
db.close();

const client = new Client({ name: 'yap-mcp-smoke', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src', 'index.js')], env: { ...process.env, YAP_HISTORY_FILE: historyFile }, stderr: 'inherit' }));
const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })).content[0].text;

const { tools } = await client.listTools();
assert.deepEqual(tools.map(t => t.name).sort(), ['prepare_speech_model', 'search_dictations', 'transcribe_audio']);

const found = await call('search_dictations', { query: 'budget' });
assert.match(found, /quarterly budget to Dana/); assert.doesNotMatch(found, /Old note|discarded/);
assert.match(await call('search_dictations', { query: 'budget', days: 60 }), /Old note about the budget/);

let ready = '';
for (let i = 0; i < 60 && !/ready/.test(ready); i++) { ready = await call('prepare_speech_model'); console.log(ready.split('\n')[0]); }
assert.match(ready, /ready/);

const expected = /this is a voice dictation test\. my spoken words? stay on this device/i;
const wav = await call('transcribe_audio', { path: fixture });
console.log('WAV:', wav);
assert.match(wav, expected);

if (process.platform === 'darwin') {
  const m4a = path.join(work, 'memo.m4a');
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', fixture, m4a]);
  const aac = await call('transcribe_audio', { path: m4a });
  console.log('M4A:', aac);
  assert.match(aac, expected);
}

// Three copies of the sentence with long pauses: one window per sentence, with start times.
const pcm = fs.readFileSync(fixture);
let at = 12; while (pcm.toString('ascii', at, at + 4) !== 'data') at += 8 + pcm.readUInt32LE(at + 4);
const body = pcm.subarray(at + 8, at + 8 + pcm.readUInt32LE(at + 4));
const silence = Buffer.alloc(16000 * 2 * 14);
const joined = Buffer.concat([body, silence, body, silence, body]);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + joined.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(joined.length, 40);
const longFile = path.join(work, 'long.wav');
fs.writeFileSync(longFile, Buffer.concat([header, joined]));
const timed = await call('transcribe_audio', { path: longFile, timestamps: true });
console.log('LONG:', timed);
assert.equal((timed.match(/voice dictation test/gi) || []).length, 3);
assert.match(timed, /^\[0:00\] /m);

assert.match(await call('transcribe_audio', { path: path.join(work, 'missing.wav') }), /No audio file/);
await client.close();
fs.rmSync(work, { recursive: true, force: true });
console.log('yap-mcp smoke test passed');
