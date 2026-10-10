// What the site plays aloud, worked out from lexicon.json and audio/voices.json.
// audio.mjs records from this plan and validate.mjs checks the recordings
// against it, so the two can never disagree about what a clip should say.
//
// Every headword is spoken from its IPA in the lexicon, never left to the
// voice's own guess: the clip must say what the page prints (the adjective
// "articulate" ends in -lit, where a voice reading the bare word says the
// verb's -late). Passages carry the same pronunciation for the day's three
// words, including simple inflections such as "remonstrated".
import { createHash } from "node:crypto";

// Bump when the recording chain changes (trim, level, encoding), so every
// clip is recorded again on the next run.
export const PIPELINE = 2;

export const SAMPLE_ID = "sample";

const VOWELS = new Set([
  "i", "ɪ", "e", "eɪ", "ɛ", "æ", "a", "aɪ", "aʊ", "ɑ", "ɑ̃", "ɒ", "ɔ", "ɔɪ",
  "o", "oʊ", "ʊ", "u", "ʌ", "ə", "ɚ", "ɝ", "ɜ",
]);
const TWO_CHAR = new Set(["eɪ", "aɪ", "aʊ", "oʊ", "ɔɪ", "tʃ", "dʒ"]);
const STRESS = new Set(["ˈ", "ˌ"]);

// The lexicon writes IPA the dictionary way: slashes, syllable dots, and the
// stress mark at the start of its syllable. Returns syllables, each a list of
// phoneme tokens and the stress it carries.
export function syllables(ipa) {
  const body = String(ipa).trim().replace(/^\/|\/$/g, "");
  const out = [];
  let current = { stress: "", tokens: [] };
  const flush = () => {
    if (current.tokens.length) out.push(current);
    current = { stress: "", tokens: [] };
  };
  const chars = Array.from(body);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "." || ch === " ") { flush(); continue; }
    if (STRESS.has(ch)) { flush(); current.stress = ch; continue; }
    if (ch === "̃") { // combining tilde: nasal vowel, belongs to the token before it
      const last = current.tokens.length - 1;
      if (last >= 0) current.tokens[last] += ch;
      continue;
    }
    const pair = ch + (chars[i + 1] || "");
    if (TWO_CHAR.has(pair)) { current.tokens.push(pair); i++; continue; }
    current.tokens.push(ch === "g" ? "ɡ" : ch);
  }
  flush();
  // An r closing the same syllable as ə or ɜ colours the vowel (kəm.ˈpoʊ.ʒər).
  // Across a syllable dot it stays a consonant (ɪ.ˈfɛ.mə.rəl). A stressed
  // r-coloured vowel is the full ɝ of "bird", whichever way the lexicon spells it.
  for (const syl of out) {
    for (let i = 0; i < syl.tokens.length - 1; i++) {
      if (syl.tokens[i + 1] !== "r") continue;
      if (syl.tokens[i] === "ə") syl.tokens.splice(i, 2, "ɚ");
      else if (syl.tokens[i] === "ɜ") syl.tokens.splice(i, 2, "ɝ");
    }
    if (syl.stress) syl.tokens = syl.tokens.map((t) => (t === "ɚ" ? "ɝ" : t));
  }
  // A one-syllable word carries no mark in the lexicon but is stressed when said alone.
  if (out.length === 1 && !out[0].stress) out[0].stress = "ˈ";
  return out;
}

// Kokoro wants the stress mark directly before the stressed vowel.
function render(syls, map) {
  let s = "";
  for (const syl of syls) {
    let marked = !syl.stress;
    for (const token of syl.tokens) {
      if (!marked && VOWELS.has(token)) { s += syl.stress; marked = true; }
      s += map(token);
    }
  }
  return s;
}

// Kokoro's misaki phonemes: one letter per diphthong and affricate.
const MISAKI = {
  "eɪ": "A", "aɪ": "I", "aʊ": "W", "oʊ": "O", "ɔɪ": "Y", "tʃ": "ʧ", "dʒ": "ʤ",
  r: "ɹ", "ɚ": "əɹ", "ɝ": "ɜɹ", "ɑ̃": "ɑn",
};
export function misakiPhonemes(ipa) {
  return render(syllables(ipa), (t) => MISAKI[t] ?? t);
}

// Where Kokoro needs a nudge to say what the lexicon prints, by headword id.
// denouement: without a beat on "nu" Kokoro reduces it to "nuh", heard as "Dynamon".
const KOKORO_PHONEMES = { denouement: "dˌAnˌumˈɑn" };

const VOICELESS = new Set(["p", "k", "f", "θ", "s", "ʃ", "tʃ", "h"]);
const SIBILANT = new Set(["s", "z", "ʃ", "ʒ", "tʃ", "dʒ"]);

// IPA for the headword plus a regular ending, as the passages use them.
export function inflectIpa(ipa, ending) {
  const syls = syllables(ipa);
  const last = syls[syls.length - 1];
  const final = last.tokens[last.tokens.length - 1];
  const add = (tokens) => {
    const copy = syls.map((s) => ({ stress: s.stress, tokens: [...s.tokens] }));
    copy[copy.length - 1].tokens.push(...tokens);
    return copy;
  };
  const addSyllable = (tokens) => [...syls.map((s) => ({ stress: s.stress, tokens: [...s.tokens] })), { stress: "", tokens }];
  switch (ending) {
    case "": return syls;
    case "d":
    case "ed":
      if (final === "t" || final === "d") return addSyllable(["ɪ", "d"]);
      return add([VOICELESS.has(final) ? "t" : "d"]);
    case "s":
    case "es":
      if (SIBILANT.has(final)) return addSyllable(["ɪ", "z"]);
      return add([VOICELESS.has(final) || final === "t" ? "s" : "z"]);
    case "ly": return addSyllable(["l", "i"]);
    case "ing": return addSyllable(["ɪ", "ŋ"]);
    default: return null;
  }
}

// The endings a passage may add to a headword, by part of speech. A form
// outside its word class ("articulated" from the adjective) is left to the
// voice: the adjective's IPA would give it the wrong ending.
const ENDINGS = {
  verb: ["d", "ed", "s", "es", "ing"],
  adjective: ["ly"],
  noun: ["s", "es"],
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Each place a passage uses one of the day's words, with the IPA for the form
// it uses. Forms with an ending this file cannot derive are left to the voice.
export function headwordUses(text, words) {
  const uses = [];
  for (const w of words) {
    const endings = ENDINGS[w.pos] || [];
    const tail = endings.length ? `(${endings.join("|")})?` : "()";
    // Letter-aware edges rather than \b, which only knows ASCII ("élan").
    const re = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(w.word)}${tail}(?![\\p{L}\\p{M}])`, "giu");
    for (const m of text.matchAll(re)) {
      const ending = (m[1] || "").toLowerCase();
      const syls = inflectIpa(w.ipa, ending);
      if (!syls) continue;
      uses.push({ start: m.index, end: m.index + m[0].length, surface: m[0], syls, id: w.id, ending });
    }
  }
  return uses.sort((a, b) => a.start - b.start);
}

function withMarkup(text, uses, mark) {
  let out = "";
  let at = 0;
  for (const u of uses) {
    if (u.start < at) continue; // overlapping matches: the first one wins
    out += text.slice(at, u.start) + mark(u);
    at = u.end;
  }
  return out + text.slice(at);
}

// The exact string Kokoro is given. A bare word gets a full stop: without one
// Kokoro swallows the last sound ("umbrage" comes out as "umbra").
export function engineInput(voice, text, words) {
  if (voice.engine !== "kokoro") {
    throw new Error(`audio-plan: unknown engine "${voice.engine}" for voice ${voice.id}`);
  }
  const uses = headwordUses(text, words);
  const marked = withMarkup(text, uses, (u) => {
    const phonemes = (u.ending === "" && KOKORO_PHONEMES[u.id]) || render(u.syls, (t) => MISAKI[t] ?? t);
    return `[${u.surface}](/${phonemes}/)`;
  });
  return /[.!?]["”]?$/.test(marked.trim()) ? marked : `${marked}.`;
}

export function clipPath(voiceId, kind, id) {
  if (kind === "word") return `audio/${voiceId}/w/${id}.mp3`;
  if (kind === "passage") return `audio/${voiceId}/p/${id}.mp3`;
  return `audio/${voiceId}/${SAMPLE_ID}.mp3`;
}

// One entry per clip: where it lives, what the engine is told to say, and a
// hash of everything that shapes the recording.
export function clipPlan(lexicon, voiceFile) {
  const plan = [];
  const days = [...lexicon.days].sort((a, b) => a.day - b.day);
  const first = days[0];
  for (const voice of voiceFile.voices) {
    const items = [];
    for (const day of days) {
      for (const w of day.words) items.push({ kind: "word", id: w.id, text: w.word, words: [w] });
      if (day.passage && day.passage.text) {
        items.push({ kind: "passage", id: String(day.day), text: day.passage.text, words: day.words });
      }
    }
    // The picker's sample: Day 1's epigram, which happens to be about voices.
    items.push({ kind: SAMPLE_ID, id: SAMPLE_ID, text: first.epigram, words: first.words });
    for (const item of items) {
      const input = engineInput(voice, item.text, item.words);
      const hash = createHash("sha256")
        .update(JSON.stringify({ PIPELINE, engine: voice.engine, model: voice.model, speed: voice.speed ?? 1, input }))
        .digest("hex")
        .slice(0, 16);
      plan.push({ voice, kind: item.kind, id: item.id, path: clipPath(voice.id, item.kind, item.id), input, hash });
    }
  }
  return plan;
}
