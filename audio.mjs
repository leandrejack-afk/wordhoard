// Records the clips the site plays: every headword and every day's passage in
// each voice listed in audio/voices.json, plus a short sample per voice for
// the picker on the About page. Run on the Mac after any content change:
//   node audio.mjs              record whatever is missing or out of date
//   node audio.mjs --dry        list what would be recorded, record nothing
//   node audio.mjs --only TEXT  record only clips whose path contains TEXT
// then node validate.mjs, which fails while any clip is missing or stale, and
// optionally tools/listen.py, which listens back and flags doubtful clips.
//
// The voices are Kokoro's, run in the local readout venv (~/.claude/tts/venv),
// because Kokoro speaks exactly the phonemes it is given. Deepgram's Flux and
// Aura-2 voices were tried on 2026-10-10: they read the passages well but
// garbled single words ("galvanize" came back as "Galabagos").
// ffmpeg trims, levels and encodes. audio/manifest.json records the plan hash
// each clip was made from.
import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clipPlan, PIPELINE } from "./audio-plan.mjs";

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const here = (name) => path.join(__dirname, name);
const KOKORO_PY = process.env.KOKORO_PYTHON || path.join(os.homedir(), ".claude/tts/venv/bin/python");
const RATE = 24000; // Kokoro's native rate
const TARGET_LUFS = -17;
const dry = process.argv.includes("--dry");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > -1 ? process.argv[onlyAt + 1] : null;

function log(msg) {
  console.error(`[audio] ${msg}`);
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

// One Python process records every clip: loading the model is the slow part.
async function kokoroWavs(jobs) {
  await new Promise((resolve, reject) => {
    const child = spawn(KOKORO_PY, [here("tools/kokoro_clips.py")], {
      env: { ...process.env, HF_HUB_OFFLINE: "1" },
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", (err) => reject(new Error(`kokoroWavs: could not start ${KOKORO_PY}: ${err.message}`)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`kokoroWavs: tools/kokoro_clips.py exited ${code}`))));
    for (const job of jobs) child.stdin.write(JSON.stringify(job) + "\n");
    child.stdin.end();
  });
}

// Integrated loudness needs 400 ms blocks; a one-word clip can be shorter, so
// measure it with silence after it (the loudness gate ignores the silence).
async function loudness(wavPath) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", wavPath, "-af", "apad=pad_dur=1,ebur128=framelog=quiet", "-f", "null", "-"]);
  const m = stderr.match(/I:\s+(-?[\d.]+) LUFS/);
  if (!m) throw new Error(`loudness: no integrated loudness for ${wavPath}`);
  const lufs = Number(m[1]);
  if (lufs < -50) throw new Error(`loudness: ${wavPath} measures ${lufs} LUFS, too quiet to be speech`);
  return lufs;
}

// Trim the silence at the ends, keep a short lead-in so phones do not clip
// the first syllable, level every clip to the same loudness, encode MP3 (the
// one format every browser plays).
async function finish(rawWav, mp3Path, kind) {
  const trimmed = rawWav.replace(/\.wav$/, ".trim.wav");
  const leveled = rawWav.replace(/\.wav$/, ".level.wav");
  const trim = "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.03,areverse," +
    "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.03,areverse";
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", rawWav, "-af", trim, "-ar", String(RATE), "-ac", "1", trimmed]);
  const gain = TARGET_LUFS - (await loudness(trimmed));
  const lead = kind === "word" ? 120 : 200;
  const tail = kind === "word" ? 0.25 : 0.6;
  const chain = `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false,adelay=${lead},apad=pad_dur=${tail}`;
  // Encoding straight out of apad fails in libmp3lame ("inadequate AVFrame
  // plane padding"), so level into a WAV first and encode from that.
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", trimmed, "-af", chain, "-ar", String(RATE), "-ac", "1", leveled]);
  await mkdir(path.dirname(mp3Path), { recursive: true });
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", leveled,
    "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", mp3Path]);
  await rm(trimmed, { force: true });
  await rm(leveled, { force: true });
}

const lexicon = JSON.parse(await readFile(here("lexicon.json"), "utf8"));
const voiceFile = JSON.parse(await readFile(here("audio/voices.json"), "utf8"));
const manifestPath = here("audio/manifest.json");
const manifest = (await exists(manifestPath))
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : { pipeline: PIPELINE, clips: {} };

const plan = clipPlan(lexicon, voiceFile);
const todo = [];
for (const clip of plan) {
  if (only && !clip.path.includes(only)) continue;
  if (manifest.clips[clip.path] === clip.hash && (await exists(here(clip.path)))) continue;
  todo.push(clip);
}
log(`${plan.length} clips in the plan, ${todo.length} to record`);
if (dry) {
  for (const clip of todo) console.log(clip.path);
  process.exit(0);
}

async function saveManifest() {
  const sorted = Object.fromEntries(Object.entries(manifest.clips).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify({ pipeline: PIPELINE, clips: sorted }, null, 2) + "\n");
}

if (todo.length) {
  // Clips are overwritten in place, so unvouch them first: a run that dies
  // half way must leave them failing validation, not passing on old hashes.
  for (const clip of todo) delete manifest.clips[clip.path];
  await saveManifest();
  const tmp = path.join(os.tmpdir(), `wordhoard-audio-${process.pid}`);
  await mkdir(tmp, { recursive: true });
  try {
    const jobs = todo.map((clip, i) => ({
      text: clip.input,
      voice: clip.voice.model,
      speed: clip.voice.speed ?? 1,
      out: path.join(tmp, `k${i}.wav`),
    }));
    log(`kokoro: recording ${jobs.length} clips`);
    await kokoroWavs(jobs);
    for (let i = 0; i < todo.length; i++) {
      await finish(jobs[i].out, here(todo[i].path), todo[i].kind);
      manifest.clips[todo[i].path] = todo[i].hash;
      if ((i + 1) % 25 === 0) { await saveManifest(); log(`finished ${i + 1}/${todo.length}`); }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Drop entries for clips no longer in the plan, so the manifest never vouches for a stray file.
const planned = new Set(plan.map((c) => c.path));
for (const p of Object.keys(manifest.clips)) if (!planned.has(p)) delete manifest.clips[p];
await saveManifest();
log(`done: ${todo.length} clips recorded`);
