// On-device speech recognition for Yap MCP: the same NVIDIA Parakeet TDT v3
// model and sherpa-onnx runtime as the Yap app for Windows. Audio is decoded,
// recognized and discarded on this computer; the only network request is the
// one-time, checksum-verified model download from Hugging Face.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import decodeAudio from 'audio-decode';

const require = createRequire(import.meta.url);
export const MODEL = require('./model.json');
const RATE = MODEL.sampleRate;
const CHUNK_SECONDS = 28; // Parakeet is most accurate on utterance-sized windows.
const SEARCH_SECONDS = 6; // Each window ends at the quietest moment of its last seconds.
const MAX_FILE_BYTES = 2 * 1024 ** 3;
const IDLE_MS = 5 * 60 * 1000;

export function cacheRoot() {
  if (process.env.YAP_MCP_CACHE) return process.env.YAP_MCP_CACHE;
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'yap-mcp');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'yap-mcp');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'yap-mcp');
}

const ownDirectory = () => path.join(cacheRoot(), MODEL.revision, MODEL.cacheDirectory);

// The Yap app for Windows keeps the identical model; reuse it instead of a second download.
function appDirectories() {
  if (process.platform !== 'win32') return [];
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [path.join(appData, 'Yap', 'speech', MODEL.revision, MODEL.cacheDirectory)];
}

const totalBytes = Object.values(MODEL.files).reduce((sum, f) => sum + f.bytes, 0);
const complete = dir => Object.values(MODEL.files).every(f => fs.statSync(path.join(dir, f.filename), { throwIfNoEntry: false })?.size === f.bytes);

const state = { status: 'missing', loaded: 0, error: null, directory: null };
let downloading = null;

export function modelStatus() {
  if (state.status !== 'downloading') {
    const dir = [ownDirectory(), ...appDirectories()].find(complete);
    if (dir) Object.assign(state, { status: 'ready', directory: dir, loaded: totalBytes, error: null });
  }
  return { ...state, total: totalBytes, percent: Math.floor((state.loaded / totalBytes) * 100), model: MODEL.model, license: MODEL.license };
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function fetchFile(dir, file, before) {
  const destination = path.join(dir, file.filename);
  const temporary = `${destination}.${crypto.randomUUID()}.partial`;
  const url = `https://huggingface.co/${MODEL.model}/resolve/${MODEL.revision}/${file.filename}`;
  const response = await fetch(url, { headers: { 'user-agent': 'yap-mcp (+https://yapapp.cc/mcp)' } });
  if (!response.ok || !response.body) throw new Error(`The speech model download failed (${response.status}). Check the connection and try again.`);
  const handle = await fs.promises.open(temporary, 'wx', 0o600);
  const hash = crypto.createHash('sha256');
  let loaded = 0;
  try {
    for await (const chunk of response.body) {
      loaded += chunk.length;
      if (loaded > file.bytes) throw new Error('The speech model download is invalid. Try again.');
      hash.update(chunk);
      await handle.write(chunk);
      state.loaded = before + loaded;
    }
    await handle.close();
    if (loaded !== file.bytes || hash.digest('hex') !== file.sha256) throw new Error('The speech model download is incomplete. Try again.');
    await fs.promises.rename(temporary, destination);
  } finally {
    await handle.close().catch(() => {});
    await fs.promises.rm(temporary, { force: true });
  }
}

/** Starts (or joins) the one-time model download; resolves with the model directory. */
export function prepareModel() {
  const status = modelStatus();
  if (status.status === 'ready') return Promise.resolve(status.directory);
  if (downloading) return downloading;
  Object.assign(state, { status: 'downloading', loaded: 0, error: null });
  const dir = ownDirectory();
  downloading = (async () => {
    await fs.promises.mkdir(dir, { recursive: true });
    let before = 0;
    for (const file of Object.values(MODEL.files)) {
      const existing = path.join(dir, file.filename);
      const size = fs.statSync(existing, { throwIfNoEntry: false })?.size;
      if (size !== file.bytes || await sha256(existing) !== file.sha256) await fetchFile(dir, file, before);
      before += file.bytes;
      state.loaded = before;
    }
    Object.assign(state, { status: 'ready', directory: dir, loaded: totalBytes });
    return dir;
  })().catch(error => {
    Object.assign(state, { status: 'failed', error: error.message });
    throw error;
  }).finally(() => { downloading = null; });
  return downloading;
}

let recognizer = null;
let idleTimer = null;

async function getRecognizer(dir) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { recognizer = null; }, IDLE_MS);
  idleTimer.unref?.();
  if (recognizer) return recognizer;
  const sherpa = require('sherpa-onnx-node');
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const file = key => path.join(dir, MODEL.files[key].filename);
  recognizer = await sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: file('encoder'), decoder: file('decoder'), joiner: file('joiner') },
      tokens: file('tokens'),
      numThreads: cores >= 5 ? 4 : Math.max(1, cores - 1),
      provider: 'cpu',
      modelType: 'nemo_transducer',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
  });
  return recognizer;
}

/** Decodes any common audio or video container to 16 kHz mono samples. */
export async function readAudio(file) {
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat?.isFile()) throw new Error(`No audio file at ${file}.`);
  if (stat.size > MAX_FILE_BYTES) throw new Error('The file is larger than 2 GB. Split it into shorter recordings first.');
  let decoded;
  try { decoded = await decodeAudio(await fs.promises.readFile(file)); }
  catch (error) { throw new Error(`Could not read ${path.basename(file)} as audio (${error.message}). Supported: WAV, MP3, M4A/AAC, MP4, FLAC, OGG, Opus, WebM, AIFF, CAF and more.`); }
  const { channelData, sampleRate } = decoded;
  if (!channelData?.length || !sampleRate) throw new Error(`${path.basename(file)} contains no audio.`);
  const length = channelData[0].length;
  const mono = new Float32Array(length);
  for (const channel of channelData) for (let i = 0; i < length; i++) mono[i] += channel[i] / channelData.length;
  if (sampleRate === RATE) return mono;
  const ratio = sampleRate / RATE;
  const out = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < out.length; i++) {
    const position = i * ratio, index = Math.floor(position), fraction = position - index;
    out[i] = mono[index] * (1 - fraction) + (mono[index + 1] ?? mono[index]) * fraction;
  }
  return out;
}

/** Splits long audio into windows that end in a pause, so no word is cut in half. */
export function windows(samples) {
  const size = CHUNK_SECONDS * RATE, search = SEARCH_SECONDS * RATE, frame = RATE / 10;
  const result = [];
  let start = 0;
  while (samples.length - start > size) {
    let best = start + size, quietest = Infinity;
    for (let at = start + size - search; at + frame <= start + size; at += frame / 2) {
      let energy = 0;
      for (let i = at; i < at + frame; i++) energy += samples[i] * samples[i];
      if (energy < quietest) { quietest = energy; best = at + frame / 2; }
    }
    result.push([start, Math.floor(best)]);
    start = Math.floor(best);
  }
  result.push([start, samples.length]);
  return result;
}

const timestamp = seconds => {
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Transcribes a file; returns the text and, per window, its start time. */
export async function transcribe(file, dir) {
  const started = Date.now();
  const samples = await readAudio(file);
  const engine = await getRecognizer(dir);
  const parts = [];
  for (const [from, to] of windows(samples)) {
    const stream = engine.createStream();
    stream.acceptWaveform({ samples: samples.subarray(from, to), sampleRate: RATE });
    await engine.decodeAsync(stream);
    const text = engine.getResult(stream).text.trim();
    if (text) parts.push({ start: timestamp(from / RATE), text });
  }
  return { parts, seconds: samples.length / RATE, processingSeconds: (Date.now() - started) / 1000 };
}
