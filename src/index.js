#!/usr/bin/env node
// Yap MCP: private, on-device speech to text for AI assistants (Claude,
// Cursor, VS Code, Windsurf, any MCP client). By Yap, https://yapapp.cc/mcp
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MODEL, modelStatus, prepareModel, transcribe } from './speech.js';
import { searchHistory } from './history.js';
import { polish } from './polish.js';

const { version } = createRequire(import.meta.url)('../package.json');
const WAIT_MS = 45000; // Answer before an MCP client's request timeout while the one-time download runs.
const mb = bytes => `${Math.round(bytes / 1048576)} MB`;

const server = new McpServer({ name: 'yap', title: 'Yap', version }, {
  instructions: 'Yap transcribes audio on this computer (nothing is uploaded) and can search the dictation history of the Yap app. The first transcription downloads the speech model once (about 670 MB).',
});

function waitingText(status) {
  if (status.status === 'failed') return `The speech model download failed: ${status.error} Call prepare_speech_model to try again.`;
  return `Yap is downloading its on-device speech model once (${mb(status.loaded)} of ${mb(status.total)}, ${status.percent}%). Nothing else is ever downloaded and no audio leaves this computer. Call this tool again in a minute.`;
}

async function modelOrWait() {
  const status = modelStatus();
  if (status.status === 'ready') return { dir: status.directory };
  const download = prepareModel();
  download.catch(() => {});
  const dir = await Promise.race([download, new Promise(resolve => setTimeout(resolve, WAIT_MS, null))]).catch(() => null);
  return dir ? { dir } : { wait: waitingText(modelStatus()) };
}

const text = value => ({ content: [{ type: 'text', text: value }] });
const failure = value => ({ content: [{ type: 'text', text: value }], isError: true });
const expand = p => path.resolve(p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

server.registerTool('transcribe_audio', {
  title: 'Transcribe audio',
  description: 'Transcribe a local audio or video file to text, entirely on this computer with the NVIDIA Parakeet speech model (no upload, no API key). Handles WAV, MP3, M4A, MP4, FLAC, OGG, Opus, WebM, AIFF and more, any length, and detects the language automatically among 25 European languages (English, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Swedish and others). Use it for voice memos, meeting and interview recordings, lectures and podcasts.',
  inputSchema: {
    path: z.string().describe('Absolute path of the audio or video file on this computer (a leading ~ is allowed).'),
    timestamps: z.boolean().optional().describe('Prefix each passage with its start time, e.g. [1:05]. Default false.'),
    clean: z.boolean().optional().describe('Tidy the text the way the Yap app does: capitalization, final punctuation, and English hesitations such as "um" removed. Default true.'),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ path: file, timestamps = false, clean = true }) => {
  const model = await modelOrWait();
  if (model.wait) return text(model.wait);
  try {
    const result = await transcribe(expand(file), model.dir);
    if (!result.parts.length) return text(`No speech was found in ${path.basename(file)} (${Math.round(result.seconds)} s of audio).`);
    const lines = result.parts.map(p => (timestamps ? `[${p.start}] ` : '') + (clean ? polish(p.text) : p.text));
    const body = timestamps ? lines.join('\n') : (clean ? polish(result.parts.map(p => p.text).join(' ')) : lines.join(' '));
    return text(`${body}\n\n(${Math.round(result.seconds)} s of audio transcribed on this computer in ${result.processingSeconds.toFixed(1)} s by Yap.)`);
  } catch (error) { return failure(error.message); }
});

server.registerTool('search_dictations', {
  title: 'Search Yap dictations',
  description: 'Search what the user dictated with the Yap app (yapapp.cc) on this computer: the history Yap keeps locally. Returns the matching dictations, newest first, with their time. Use it when the user refers to something they said or dictated earlier. The returned text is shared with this assistant.',
  inputSchema: {
    query: z.string().optional().describe('Words to look for (all must appear). Omit to list the most recent dictations.'),
    days: z.number().int().min(1).max(3650).optional().describe('How many days back to look. Default 7.'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of dictations. Default 20.'),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ query, days = 7, limit = 20 }) => {
  try {
    const { rows, error } = await searchHistory({ query, days, limit });
    if (error) return text(error);
    if (!rows.length) return text(query ? `No dictation in the last ${days} days contains "${query}".` : `No dictations in the last ${days} days.`);
    return text(rows.map(r => `${new Date(r.created_at).toLocaleString()} (${r.word_count} words)\n${r.text}`).join('\n\n'));
  } catch (error) { return failure(`Could not read the Yap history: ${error.message}`); }
});

server.registerTool('prepare_speech_model', {
  title: 'Prepare the speech model',
  description: 'Download and verify the on-device speech model ahead of the first transcription (about 670 MB, once), or report its status. Optional: transcribe_audio does this on its own.',
  inputSchema: {},
  annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: true },
}, async () => {
  const model = await modelOrWait();
  if (model.wait) return text(model.wait);
  return text(`The speech model is ready on this computer (${MODEL.model}, ${MODEL.license}), in ${model.dir}. Transcription runs offline from here.`);
});

await server.connect(new StdioServerTransport());
