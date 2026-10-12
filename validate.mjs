#!/usr/bin/env node
/**
 * Wordhoard Volume I acceptance suite (spec 001 rev 2, deliverable D).
 *
 * Zero dependencies, plain Node 22 ESM. Run from the repo root:
 *   node validate.mjs
 *
 * Output contract:
 *   ok V<n>              the check passed
 *   FAIL V<n>: <detail>  the check found a problem (one line per problem)
 *   WARN: <detail>       advisory only, never affects the exit code
 * Exit code is 0 if and only if no FAIL line was printed.
 *
 * Written blind from the spec. Every expectation here comes from
 * specs/001-wordhoard-v1.md, not from any implementation file.
 *
 * Banned characters (em dash, en dash and their HTML entities) are referenced
 * in this file through escape sequences only, never as literals, so that V7
 * can scan this file too.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipPlan, PIPELINE } from './audio-plan.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECK_COUNT = 14;
const MAX_DETAIL_LINES = 15;

const MIDDOT = '·';

/* ------------------------------------------------------------------ */
/* Pinned constants from the spec                                      */
/* ------------------------------------------------------------------ */

const EXPECTED_VERSION = 1;
const EXPECTED_VOLUME = 1;
const EXPECTED_TITLE = 'Wordhoard';
const EXPECTED_START_DATE = '2026-08-17';
const EXPECTED_SITE_URL = 'https://leandrejack-afk.github.io/wordhoard/';

// The pinned curriculum table. F, D, FL in that order, bare headwords.
const CURRICULUM = [
  { day: 1, theme: 'The art of speaking well', words: ['articulate', 'eloquent', 'mellifluous'] },
  { day: 2, theme: 'Judging wisely', words: ['discerning', 'astute', 'perspicacious'] },
  { day: 3, theme: 'Disagreeing with grace', words: ['contend', 'demur', 'remonstrate'] },
  { day: 4, theme: 'Calm under pressure', words: ['composure', 'equanimity', 'aplomb'] },
  { day: 5, theme: 'Making a strong case', words: ['compelling', 'cogent', 'incontrovertible'] },
  { day: 6, theme: 'Precision and clarity', words: ['concise', 'lucid', 'pellucid'] },
  { day: 7, theme: 'Praise that lands', words: ['commend', 'laudable', 'exemplary'] },
  { day: 8, theme: 'Reading people', words: ['demeanor', 'disposition', 'countenance'] },
  { day: 9, theme: 'Work and mastery', words: ['diligent', 'meticulous', 'assiduous'] },
  { day: 10, theme: 'Beginnings', words: ['initiate', 'inception', 'nascent'] },
  { day: 11, theme: 'Bright expectations', words: ['promising', 'sanguine', 'propitious'] },
  { day: 12, theme: 'The uses of money', words: ['frugal', 'prudent', 'munificent'] },
  { day: 13, theme: 'Quiet influence', words: ['sway', 'galvanize', 'engender'] },
  { day: 14, theme: 'Saying less', words: ['brevity', 'succinct', 'laconic'] },
  { day: 15, theme: 'Curiosity and learning', words: ['inquisitive', 'erudite', 'voracious'] },
  { day: 16, theme: 'Standing firm', words: ['steadfast', 'resolute', 'intransigent'] },
  { day: 17, theme: 'Uncertainty, honestly', words: ['ambiguous', 'tenuous', 'equivocal'] },
  { day: 18, theme: 'Time and change', words: ['fleeting', 'transient', 'ephemeral'] },
  { day: 19, theme: 'Subtlety', words: ['nuance', 'tacit', 'oblique'] },
  { day: 20, theme: 'Abundance', words: ['ample', 'copious', 'plethora'] },
  { day: 21, theme: 'Character worth having', words: ['integrity', 'candor', 'probity'] },
  { day: 22, theme: 'Difficult people', words: ['obstinate', 'recalcitrant', 'truculent'] },
  { day: 23, theme: 'Making things easier', words: ['alleviate', 'mitigate', 'obviate'] },
  { day: 24, theme: 'Wit and humor', words: ['wry', 'droll', 'irreverent'] },
  { day: 25, theme: 'Getting to the point', words: ['salient', 'incisive', 'germane'] },
  { day: 26, theme: 'Displeasure with dignity', words: ['vexed', 'indignant', 'umbrage'] },
  { day: 27, theme: 'Growth and improvement', words: ['refine', 'hone', 'burgeon'] },
  { day: 28, theme: 'Judgment calls', words: ['pragmatic', 'judicious', 'circumspect'] },
  { day: 29, theme: 'Rare and excellent', words: ['singular', 'consummate', 'peerless'] },
  { day: 30, theme: 'The finish line', words: ['culminate', 'denouement', 'apotheosis'] },
];

// The nine words whose part of speech the curriculum table pins.
const POS_PINS = [
  { day: 1, index: 0, word: 'articulate', pos: 'adjective' },
  { day: 3, index: 1, word: 'demur', pos: 'verb' },
  { day: 8, index: 2, word: 'countenance', pos: 'noun' },
  { day: 10, index: 0, word: 'initiate', pos: 'verb' },
  { day: 13, index: 0, word: 'sway', pos: 'verb' },
  { day: 19, index: 0, word: 'nuance', pos: 'noun' },
  { day: 26, index: 2, word: 'umbrage', pos: 'noun' },
  { day: 29, index: 0, word: 'singular', pos: 'adjective' },
  { day: 29, index: 1, word: 'consummate', pos: 'adjective' },
];

const TIER_ORDER = ['foundation', 'distinction', 'flourish'];

const PART_FILES = [
  { rel: 'content/days-01-10.json', from: 1, to: 10 },
  { rel: 'content/days-11-20.json', from: 11, to: 20 },
  { rel: 'content/days-21-30.json', from: 21, to: 30 },
];

// Pinned email copy (spec, deliverable C).
const REVIEW_LABEL = 'From the hoard';
const REVIEW_LINE = 'Recall its meaning, then use it once today. Tap the hoard to check.';
const PASSAGE_LABEL = 'Read this aloud';
const VOLUME_END_LINE = 'Volume I ends on Day 30';
const POST_VOLUME_SUBJECT_TAIL = 'Review from the hoard';

// The two pinned algorithm lines, copied byte for byte out of the spec.
const ALGO_LINE_TODAY =
  `const guyanaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana' }).format(new Date());`;
const ALGO_LINE_DAYNUMBER =
  `const dayNumber = Math.round((Date.parse(guyanaToday + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) + 1;`;

// Banned dash forms. Escapes only, never literals, so this file passes V7.
const BANNED_TOKENS = [
  { token: '\u2014', label: 'an em dash (U+2014)' },
  { token: '\u2013', label: 'an en dash (U+2013)' },
  { token: '\x26mdash;', label: 'the banned mdash HTML entity' },
  { token: '\x26ndash;', label: 'the banned ndash HTML entity' },
  { token: '\x26#8212;', label: 'the banned decimal entity for U+2014' },
  { token: '\x26#8211;', label: 'the banned decimal entity for U+2013' },
];

// EXTRA: hex entity spellings of the same two characters, reported as WARN
// because the spec's V7 list names only the decimal and named forms.
const BANNED_TOKENS_HEX = [
  { token: '\x26#x2014;', label: 'the hex entity for U+2014' },
  { token: '\x26#x2013;', label: 'the hex entity for U+2013' },
  { token: '\x26#X2014;', label: 'the hex entity for U+2014' },
  { token: '\x26#X2013;', label: 'the hex entity for U+2013' },
];

// EXTRA: hard writing rule 2. "elevate" and "unlock" are omitted on purpose:
// "elevated" is a required example register and unlocking is the hoard metaphor.
const BUZZWORDS = ['leverage', 'streamline', 'empower', 'cutting-edge', 'seamless', 'robust', 'delve'];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'specs', 'out']);
const SKIP_FILES = new Set(['.env', '.state.json', '.DS_Store']);
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svgz', '.pdf', '.zip',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.wav', '.m4a',
]);

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

let okCount = 0;
let failCount = 0;
let warnCount = 0;

function warn(detail) {
  warnCount += 1;
  console.log(`WARN: ${detail}`);
}

function check(n, fn) {
  let problems;
  try {
    const returned = fn();
    problems = Array.isArray(returned) ? returned.filter(Boolean) : [];
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    problems = [`check threw an unexpected error: ${message}`];
  }
  if (problems.length === 0) {
    okCount += 1;
    console.log(`ok V${n}`);
    return;
  }
  const shown = problems.slice(0, MAX_DETAIL_LINES);
  for (const problem of shown) {
    failCount += 1;
    console.log(`FAIL V${n}: ${problem}`);
  }
  if (problems.length > shown.length) {
    failCount += 1;
    console.log(`FAIL V${n}: and ${problems.length - shown.length} more problems in this check`);
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function readTextFile(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function readJsonFile(rel) {
  const text = readTextFile(rel);
  if (text === null) return { missing: true };
  try {
    return { value: JSON.parse(text) };
  } catch (err) {
    return { parseError: err && err.message ? err.message : String(err) };
  }
}

function isFilledString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeWord(haystack, word) {
  return new RegExp(`(^|[^A-Za-z])${escapeRegExp(word)}([^A-Za-z]|$)`, 'i').test(haystack);
}

function extension(name) {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

function keepPath(rel) {
  const segments = rel.split('/');
  const base = segments[segments.length - 1];
  if (segments.slice(0, -1).some((segment) => SKIP_DIRS.has(segment))) return false;
  if (SKIP_FILES.has(base)) return false;
  if (BINARY_EXT.has(extension(base))) return false;
  return existsSync(join(ROOT, rel));
}

function walkFiles(dir, prefix, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(join(dir, entry.name), rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

// Files that git already ignores are not going to be committed, so drop them.
// Tracked files are never reported by check-ignore, and if this is not a git
// repo yet the walk stands on its own.
function ignoredFiles(files) {
  const ignored = new Set();
  for (let start = 0; start < files.length; start += 200) {
    const batch = files.slice(start, start + 200);
    const git = spawnSync('git', ['check-ignore', ...batch], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    if (!git || git.error || (git.status !== 0 && git.status !== 1)) continue;
    for (const line of (git.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0) ignored.add(trimmed);
    }
  }
  return ignored;
}

// "Every tracked text file": walk the working tree the same way the Gate 1 grep
// does (skipping .git, node_modules, specs and out), then drop anything git
// ignores. A walk rather than git ls-files, so a file that is present but not
// yet added, validate.mjs included, is still scanned.
let scannedFilesCache = null;
function scannedFiles() {
  if (scannedFilesCache) return scannedFilesCache;
  const walked = walkFiles(ROOT, '', []).filter(keepPath);
  const ignored = ignoredFiles(walked);
  scannedFilesCache = walked.filter((rel) => !ignored.has(rel)).sort();
  return scannedFilesCache;
}

function lineNumberOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/* ------------------------------------------------------------------ */
/* Lexicon access                                                      */
/* ------------------------------------------------------------------ */

const lexiconRaw = readJsonFile('lexicon.json');
const lexicon =
  lexiconRaw.value && typeof lexiconRaw.value === 'object' && Array.isArray(lexiconRaw.value.days)
    ? lexiconRaw.value
    : null;

function dayOf(n) {
  if (!lexicon) return undefined;
  return lexicon.days.find((entry) => entry && entry.day === n);
}

function wordsOf(n) {
  const day = dayOf(n);
  return day && Array.isArray(day.words) ? day.words : [];
}

const NO_LEXICON = ['lexicon.json is missing or unreadable, so this check cannot run'];

/* ------------------------------------------------------------------ */
/* V1: the three content part files                                    */
/* ------------------------------------------------------------------ */

check(1, () => {
  const problems = [];
  for (const part of PART_FILES) {
    const result = readJsonFile(part.rel);
    if (result.missing) {
      problems.push(`${part.rel} does not exist`);
      continue;
    }
    if (result.parseError) {
      problems.push(`${part.rel} is not valid JSON: ${result.parseError}`);
      continue;
    }
    const data = result.value;
    if (!data || typeof data !== 'object' || !Array.isArray(data.days)) {
      problems.push(`${part.rel} has no days array`);
      continue;
    }
    if (data.days.length !== 10) {
      problems.push(`${part.rel} has ${data.days.length} day entries, expected exactly 10`);
    }
    const numbers = data.days.map((entry) => (entry && typeof entry.day === 'number' ? entry.day : null));
    if (numbers.some((value) => value === null)) {
      problems.push(`${part.rel} has at least one day entry with no numeric day field`);
    }
    const expected = [];
    for (let n = part.from; n <= part.to; n += 1) expected.push(n);
    const actual = numbers.filter((value) => value !== null).slice().sort((a, b) => a - b);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${part.rel} covers days [${actual.join(', ')}], expected days ${part.from} to ${part.to}`,
      );
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V2: merged lexicon.json envelope                                    */
/* ------------------------------------------------------------------ */

check(2, () => {
  if (lexiconRaw.missing) return ['lexicon.json does not exist (run node build.mjs first)'];
  if (lexiconRaw.parseError) return [`lexicon.json is not valid JSON: ${lexiconRaw.parseError}`];
  const problems = [];
  const data = lexiconRaw.value;
  if (data.version !== EXPECTED_VERSION) {
    problems.push(`version is ${JSON.stringify(data.version)}, expected ${EXPECTED_VERSION}`);
  }
  if (data.volume !== EXPECTED_VOLUME) {
    problems.push(`volume is ${JSON.stringify(data.volume)}, expected ${EXPECTED_VOLUME}`);
  }
  if (data.title !== EXPECTED_TITLE) {
    problems.push(`title is ${JSON.stringify(data.title)}, expected ${JSON.stringify(EXPECTED_TITLE)}`);
  }
  if (data.startDate !== EXPECTED_START_DATE) {
    problems.push(
      `startDate is ${JSON.stringify(data.startDate)}, expected ${JSON.stringify(EXPECTED_START_DATE)}`,
    );
  }
  if (data.siteUrl !== EXPECTED_SITE_URL) {
    problems.push(`siteUrl is ${JSON.stringify(data.siteUrl)}, expected ${JSON.stringify(EXPECTED_SITE_URL)}`);
  }
  if (!Array.isArray(data.days)) {
    problems.push('days is not an array');
    return problems;
  }
  if (data.days.length !== 30) {
    problems.push(`days has ${data.days.length} entries, expected exactly 30`);
  }
  for (let i = 0; i < data.days.length; i += 1) {
    const entry = data.days[i];
    const actual = entry && typeof entry === 'object' ? entry.day : undefined;
    if (actual !== i + 1) {
      problems.push(
        `days[${i}].day is ${JSON.stringify(actual)}, expected ${i + 1} (days must be 1 to 30 contiguous ascending)`,
      );
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V3: curriculum words in F, D, FL order plus the nine pos pins        */
/* ------------------------------------------------------------------ */

check(3, () => {
  if (!lexicon) return NO_LEXICON;
  const problems = [];
  for (const row of CURRICULUM) {
    const day = dayOf(row.day);
    if (!day) {
      problems.push(`day ${row.day} is missing from lexicon.json`);
      continue;
    }
    // EXTRA: the theme column is pinned by the same table, but the spec scopes
    // V3 to words and pos, so a theme divergence is reported as a warning.
    if (day.theme !== row.theme) {
      warn(`V3 day ${row.day} theme is ${JSON.stringify(day.theme)}, the curriculum table pins ${JSON.stringify(row.theme)}`);
    }
    if (!Array.isArray(day.words) || day.words.length !== 3) {
      const count = Array.isArray(day.words) ? day.words.length : 'no';
      problems.push(`day ${row.day} has ${count} words, expected exactly 3`);
      continue;
    }
    for (let i = 0; i < 3; i += 1) {
      const actual = day.words[i] ? day.words[i].word : undefined;
      if (actual !== row.words[i]) {
        problems.push(
          `day ${row.day} words[${i}] is ${JSON.stringify(actual)}, the curriculum pins ${JSON.stringify(row.words[i])}`,
        );
      }
    }
  }
  for (const pin of POS_PINS) {
    const words = wordsOf(pin.day);
    const word = words[pin.index];
    if (!word) {
      problems.push(`day ${pin.day} words[${pin.index}] (${pin.word}) is missing, cannot check its pinned pos`);
      continue;
    }
    if (word.pos !== pin.pos) {
      problems.push(
        `day ${pin.day} ${pin.word} pos is ${JSON.stringify(word.pos)}, the curriculum pins ${JSON.stringify(pin.pos)}`,
      );
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V4: word ids, required fields, tier order, ipa, respell             */
/* ------------------------------------------------------------------ */

const WORD_STRING_FIELDS = [
  'id', 'word', 'pos', 'tier', 'ipa', 'respell', 'definition', 'nuance', 'etymology', 'registerNote',
];
const EXAMPLE_REGISTERS = ['conversational', 'professional', 'elevated'];

check(4, () => {
  if (!lexicon) return NO_LEXICON;
  const problems = [];
  const seenIds = new Map();
  let wordTotal = 0;

  for (const row of CURRICULUM) {
    const words = wordsOf(row.day);
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      const where = `day ${row.day} words[${i}]`;
      if (!word || typeof word !== 'object') {
        problems.push(`${where} is not an object`);
        continue;
      }
      wordTotal += 1;
      const label = isFilledString(word.word) ? `${where} (${word.word})` : where;

      for (const field of WORD_STRING_FIELDS) {
        if (!isFilledString(word[field])) {
          problems.push(`${label} field ${field} is missing or empty`);
        }
      }

      if (isFilledString(word.id)) {
        const previous = seenIds.get(word.id);
        if (previous) problems.push(`${label} id ${JSON.stringify(word.id)} is a duplicate of ${previous}`);
        else seenIds.set(word.id, label);
        // EXTRA: the data contract says id is the kebab case of the word.
        if (isFilledString(word.word) && word.id !== word.word.toLowerCase().replace(/\s+/g, '-')) {
          warn(`V4 ${label} id ${JSON.stringify(word.id)} is not the kebab case of ${JSON.stringify(word.word)}`);
        }
      }

      const examples = word.examples;
      if (!examples || typeof examples !== 'object') {
        problems.push(`${label} has no examples object`);
      } else {
        for (const register of EXAMPLE_REGISTERS) {
          if (!isFilledString(examples[register])) {
            problems.push(`${label} examples.${register} is missing or empty`);
          }
        }
      }

      if (!Array.isArray(word.collocations)) {
        problems.push(`${label} collocations is not an array`);
      } else {
        if (word.collocations.length < 3 || word.collocations.length > 5) {
          problems.push(`${label} has ${word.collocations.length} collocations, expected 3 to 5`);
        }
        if (word.collocations.some((item) => !isFilledString(item))) {
          problems.push(`${label} has an empty collocation`);
        }
      }

      if (!Array.isArray(word.nearSynonyms)) {
        problems.push(`${label} nearSynonyms is not an array`);
      } else {
        if (word.nearSynonyms.length < 2) {
          problems.push(`${label} has ${word.nearSynonyms.length} nearSynonyms, expected at least 2`);
        }
        for (let s = 0; s < word.nearSynonyms.length; s += 1) {
          const near = word.nearSynonyms[s];
          if (!near || typeof near !== 'object' || !isFilledString(near.word)) {
            problems.push(`${label} nearSynonyms[${s}] has no word`);
          }
          if (!near || typeof near !== 'object' || !isFilledString(near.distinction)) {
            problems.push(`${label} nearSynonyms[${s}] has no distinction`);
          }
        }
      }

      if (isFilledString(word.tier) && word.tier !== TIER_ORDER[i]) {
        problems.push(
          `${label} tier is ${JSON.stringify(word.tier)}, expected ${JSON.stringify(TIER_ORDER[i])} at position ${i}`,
        );
      }

      if (isFilledString(word.ipa)) {
        const ipa = word.ipa.trim();
        if (!ipa.startsWith('/') || !ipa.endsWith('/') || ipa.length < 3) {
          problems.push(`${label} ipa ${JSON.stringify(word.ipa)} is not wrapped in slashes`);
        }
      }

      if (isFilledString(word.respell)) {
        const respell = word.respell.trim();
        if (!/[A-Z]{2,}/.test(respell)) {
          problems.push(`${label} respell ${JSON.stringify(respell)} has no run of capitals for the stressed syllable`);
        }
        // Lenient syllable rule from the spec: require the middle dot only when
        // the respell is longer than 6 characters, and never fail an all caps
        // respell (that is the monosyllable form, for example SWAY or RY).
        const fullyUpper = !/[a-z]/.test(respell) && /[A-Z]/.test(respell);
        if (!respell.includes(MIDDOT) && respell.length > 6 && !fullyUpper) {
          problems.push(
            `${label} respell ${JSON.stringify(respell)} is longer than 6 characters, is not all capitals, and has no middle dot separator`,
          );
        }
      }
    }
  }

  if (wordTotal !== 90) {
    problems.push(`found ${wordTotal} words in total, expected 90`);
  }
  if (seenIds.size !== 90) {
    problems.push(`found ${seenIds.size} unique non-empty word ids, expected 90`);
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V5: passages                                                        */
/* ------------------------------------------------------------------ */

check(5, () => {
  if (!lexicon) return NO_LEXICON;
  const problems = [];
  for (const row of CURRICULUM) {
    const day = dayOf(row.day);
    if (!day) continue;
    const passage = day.passage;
    if (!passage || typeof passage !== 'object') {
      problems.push(`day ${row.day} has no passage object`);
      continue;
    }
    for (const field of ['title', 'setting', 'deliveryCue']) {
      if (!isFilledString(passage[field])) {
        problems.push(`day ${row.day} passage.${field} is missing or empty`);
      }
    }
    if (!isFilledString(passage.text)) {
      problems.push(`day ${row.day} passage.text is missing or empty`);
      continue;
    }
    const text = passage.text.trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 55 || wordCount > 110) {
      problems.push(`day ${row.day} passage is ${wordCount} words, expected 55 to 110`);
    }
    const lower = text.toLowerCase();
    if (!lower.includes('i ') && !lower.includes('my ')) {
      problems.push(`day ${row.day} passage does not read as first person (no "I " and no "my ")`);
    } else if (!/(^|[^A-Za-z])I([^A-Za-z]|$)/.test(text) && !hasWholeWord(text, 'my')) {
      // EXTRA: the spec's substring rule passes on stray letters, so flag the
      // cases where no standalone "I" or "my" is actually present.
      warn(`V5 day ${row.day} passage has no standalone "I" or "my", check that it really is first person`);
    }
    // Word inclusion is advisory: WARN only, never a FAIL.
    for (const word of wordsOf(row.day)) {
      if (!word || !isFilledString(word.word)) continue;
      const stem = word.word.slice(0, word.word.length >= 5 ? 5 : 4).toLowerCase();
      if (!lower.includes(stem)) {
        warn(`V5 day ${row.day} passage does not contain ${JSON.stringify(stem)} for the word ${JSON.stringify(word.word)}`);
      }
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V6: epigrams                                                        */
/* ------------------------------------------------------------------ */

check(6, () => {
  if (!lexicon) return NO_LEXICON;
  const problems = [];
  for (const row of CURRICULUM) {
    const day = dayOf(row.day);
    if (!day) continue;
    if (!isFilledString(day.epigram)) {
      problems.push(`day ${row.day} epigram is missing or empty`);
      continue;
    }
    if (day.epigram.length > 140) {
      problems.push(`day ${row.day} epigram is ${day.epigram.length} characters, the limit is 140`);
    }
    // EXTRA: the data contract says the epigram uses at least one of the day's words.
    const lower = day.epigram.toLowerCase();
    const uses = wordsOf(row.day).some((word) => {
      if (!word || !isFilledString(word.word)) return false;
      const stem = word.word.slice(0, word.word.length >= 5 ? 5 : 4).toLowerCase();
      return lower.includes(stem);
    });
    if (!uses) {
      warn(`V6 day ${row.day} epigram does not visibly use any of the day's three words`);
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V7: dash scan over every tracked text file                          */
/* ------------------------------------------------------------------ */

check(7, () => {
  const problems = [];
  const files = scannedFiles();
  if (files.length === 0) {
    return ['no text files found to scan, the repository looks empty'];
  }
  for (const rel of files) {
    const text = readTextFile(rel);
    if (text === null) continue;
    for (const banned of BANNED_TOKENS) {
      const index = text.indexOf(banned.token);
      if (index >= 0) {
        problems.push(`${rel} line ${lineNumberOf(text, index)} contains ${banned.label}`);
      }
    }
    // A JSON file can hide the same character behind a \u escape, which renders
    // identically once parsed, so scan the decoded form of JSON files too.
    if (extension(rel) === '.json') {
      let decoded = null;
      try {
        decoded = JSON.stringify(JSON.parse(text));
      } catch {
        decoded = null;
      }
      if (decoded !== null) {
        for (const banned of BANNED_TOKENS.slice(0, 2)) {
          if (decoded.includes(banned.token) && !text.includes(banned.token)) {
            problems.push(`${rel} contains ${banned.label} written as a JSON escape`);
          }
        }
      }
    }
    for (const banned of BANNED_TOKENS_HEX) {
      if (text.includes(banned.token)) {
        warn(`V7 ${rel} contains ${banned.label}, which is the same banned character in hex entity form`);
      }
    }
    // This file declares the buzzword list, so scanning it for those words is
    // pure self reference. The dash scan above still covers it.
    if (rel !== 'validate.mjs') {
      for (const buzzword of BUZZWORDS) {
        if (hasWholeWord(text, buzzword)) {
          warn(`V7 ${rel} contains the banned buzzword ${JSON.stringify(buzzword)}`);
        }
      }
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V8: index.html contract                                             */
/* ------------------------------------------------------------------ */

check(8, () => {
  const html = readTextFile('index.html');
  if (html === null) return ['index.html does not exist'];
  const problems = [];
  if (!html.includes("fetch('lexicon.json')") && !html.includes('fetch("lexicon.json")')) {
    problems.push('does not contain a relative fetch of lexicon.json');
  }
  if (!html.includes('speechSynthesis')) problems.push('does not contain speechSynthesis');
  if (!html.includes('prefers-reduced-motion')) problems.push('does not contain prefers-reduced-motion');
  if (!html.includes('prefers-color-scheme')) problems.push('does not contain prefers-color-scheme');
  if (!html.includes('wh.mastered')) problems.push('does not contain the wh.mastered localStorage key');

  const scriptTag = /<script\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match = scriptTag.exec(html);
  while (match) {
    const src = (match[2] || match[3] || match[4] || '').trim();
    if (/^https?:/i.test(src) || src.startsWith('//')) {
      problems.push(`loads an external script: ${JSON.stringify(src)}`);
    }
    match = scriptTag.exec(html);
  }
  // EXTRA: an absolute fetch breaks the /wordhoard/ subpath on GitHub Pages.
  if (html.includes("fetch('/lexicon.json')") || html.includes('fetch("/lexicon.json")')) {
    problems.push('fetches /lexicon.json with an absolute path, which breaks the /wordhoard/ subpath');
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V9: sender dry runs                                                 */
/* ------------------------------------------------------------------ */

// Spaced review for a content day, exactly per the pinned algorithm.
function reviewPicks(n) {
  const offsets = [1, 3, 7, 21];
  const picks = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const p = n - offsets[i];
    if (p < 1) continue;
    const index = (p + i) % 3;
    const words = wordsOf(p);
    picks.push({ priorDay: p, index, word: words[index] });
  }
  return picks;
}

// Post-volume review set, exactly per the pinned algorithm.
function postVolumePicks(n) {
  const picks = [];
  const seen = new Set();
  for (let k = 0; k < 6; k += 1) {
    const dayIndex = ((n * 7 + k * 11) % 30) + 1;
    const wordIndex = (n + k) % 3;
    const word = wordsOf(dayIndex)[wordIndex];
    const id = word && word.id ? word.id : `${dayIndex}:${wordIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    picks.push({ priorDay: dayIndex, index: wordIndex, word });
  }
  return picks;
}

function normalizeText(value) {
  return String(value)
    .replace(/’|‘|\x26#8217;|\x26#39;|\x26rsquo;|\x26lsquo;|\x26apos;/g, "'")
    .replace(/“|”|\x26quot;|\x26ldquo;|\x26rdquo;/g, '"')
    .replace(/\x26nbsp;/g, ' ')
    .replace(/\x26amp;/g, '\x26')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two views of the body, one joining across tags and one spacing across them,
// so a needle split by markup is still found either way.
function textViews(html) {
  return {
    joined: normalizeText(html.replace(/<[^>]*>/g, '')),
    spaced: normalizeText(html.replace(/<[^>]*>/g, ' ')),
  };
}

function viewsContain(views, needle) {
  const wanted = normalizeText(needle).toLowerCase();
  return views.joined.toLowerCase().includes(wanted) || views.spaced.toLowerCase().includes(wanted);
}

function viewsContainWord(views, word) {
  return hasWholeWord(views.joined, word) || hasWholeWord(views.spaced, word);
}

function tailViews(views, marker) {
  const cut = (value) => {
    const at = value.toLowerCase().indexOf(marker.toLowerCase());
    return at < 0 ? '' : value.slice(at);
  };
  return { joined: cut(views.joined), spaced: cut(views.spaced) };
}

// A short slice of a definition that survives HTML escaping unchanged, used to
// prove definitions are hidden in review sections. Returns null when unsafe.
function definitionProbe(definition) {
  if (!isFilledString(definition)) return null;
  const probe = definition.trim().slice(0, 30);
  return /^[A-Za-z0-9 ,.-]+$/.test(probe) && probe.length >= 12 ? probe : null;
}

function runSender(day) {
  const result = spawnSync(process.execPath, ['send.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, RENDER_ONLY: '1', DAY_OVERRIDE: String(day) },
  });
  return result;
}

function stateSnapshot() {
  const abs = join(ROOT, '.state.json');
  if (!existsSync(abs)) return 'absent';
  try {
    const info = statSync(abs);
    return `present:${info.size}:${info.mtimeMs}`;
  } catch {
    return 'unreadable';
  }
}

check(9, () => {
  if (!existsSync(join(ROOT, 'send.mjs'))) return ['send.mjs does not exist'];
  if (!lexicon) return NO_LEXICON;
  const problems = [];

  // RENDER_ONLY has to work with no node_modules, so nodemailer must be imported
  // lazily inside the send path only. Checked first so it is never crowded out
  // of the printed detail lines by a cascade of run failures.
  for (const rel of ['send.mjs', 'email.mjs']) {
    const source = readTextFile(rel);
    if (source === null) continue;
    if (/^\s*import\s[^\n]*['"]nodemailer['"]/m.test(source)) {
      problems.push(`${rel} imports nodemailer at the top level, RENDER_ONLY must run with no node_modules`);
    }
  }

  const stateBefore = stateSnapshot();

  const runs = new Map();
  for (const day of [1, 8, 22, 24, 35]) {
    runs.set(day, runSender(day));
  }

  const bodies = new Map();
  const raws = new Map();
  for (const [day, result] of runs) {
    if (result.error) {
      problems.push(`day ${day} run failed to start: ${result.error.message}`);
      continue;
    }
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim().split('\n').slice(-1)[0] || '';
      problems.push(`day ${day} run exited ${result.status}, expected 0 (${stderr})`);
    }
    const stdout = result.stdout || '';
    const subjectLines = stdout.split('\n').filter((line) => line.startsWith('SUBJECT:'));
    if (subjectLines.length !== 1) {
      problems.push(`day ${day} printed ${subjectLines.length} SUBJECT: lines to stdout, expected exactly 1`);
    }
    const subject = subjectLines.length > 0 ? subjectLines[0].replace(/^SUBJECT:\s*/, '').trim() : null;
    const other = stdout.split('\n').filter((line) => line.trim().length > 0 && !line.startsWith('SUBJECT:'));
    if (other.length > 0) {
      warn(`V9 day ${day} printed ${other.length} extra stdout line(s) besides SUBJECT:, the spec pins exactly one line`);
    }

    let expectedSubject;
    if (day === 1) {
      // AC4 pins this subject character for character.
      expectedSubject = `Wordhoard ${MIDDOT} Day 1: The art of speaking well`;
    } else if (day === 35) {
      expectedSubject = `Wordhoard ${MIDDOT} Day 35: ${POST_VOLUME_SUBJECT_TAIL}`;
    } else {
      const theme = dayOf(day) ? dayOf(day).theme : '';
      expectedSubject = `Wordhoard ${MIDDOT} Day ${day}: ${theme}`;
    }
    if (subject !== null && subject !== expectedSubject) {
      problems.push(`day ${day} subject is ${JSON.stringify(subject)}, expected ${JSON.stringify(expectedSubject)}`);
    }

    const bodyPath = `out/day-${day}.html`;
    const body = readTextFile(bodyPath);
    if (body === null) {
      problems.push(`${bodyPath} was not written`);
      continue;
    }
    bodies.set(day, textViews(body));
    raws.set(day, body);
  }

  // The site link lives in an href, which the text views strip, so assert it
  // against the raw HTML. Every email links the pinned siteUrl.
  for (const [day, raw] of raws) {
    if (!raw.includes(EXPECTED_SITE_URL)) {
      problems.push(`day ${day} body does not contain the site URL ${EXPECTED_SITE_URL}`);
    }
  }

  const stateAfter = stateSnapshot();
  if (stateAfter !== stateBefore) {
    // EXTRA, and this is AC7: RENDER_ONLY with DAY_OVERRIDE never touches state.
    problems.push(`.state.json changed during the dry runs (${stateBefore} then ${stateAfter}), it must never be touched`);
  }

  // Day 1: three words, the passage title, no review section.
  const day1 = bodies.get(1);
  if (day1) {
    for (const word of wordsOf(1)) {
      if (word && isFilledString(word.word) && !viewsContainWord(day1, word.word)) {
        problems.push(`day 1 body does not contain the word ${JSON.stringify(word.word)}`);
      }
    }
    const title = dayOf(1) && dayOf(1).passage ? dayOf(1).passage.title : null;
    if (isFilledString(title) && !viewsContain(day1, title)) {
      problems.push(`day 1 body does not contain the passage title ${JSON.stringify(title)}`);
    }
    // No review section: keyed off the recall line, which is review copy and
    // nothing else. The section label alone is only a warning, since the day 1
    // welcome could legitimately mention the hoard in prose.
    if (viewsContain(day1, 'Recall its meaning')) {
      problems.push('day 1 body contains the review recall line, day 1 has no prior days to review');
    }
    if (day1.joined.includes(REVIEW_LABEL) || day1.spaced.includes(REVIEW_LABEL)) {
      warn(`V9 day 1 body contains the heading ${JSON.stringify(REVIEW_LABEL)}, day 1 has no prior days to review`);
    }
    if (!viewsContain(day1, PASSAGE_LABEL)) {
      problems.push(`day 1 body does not contain the pinned passage label ${JSON.stringify(PASSAGE_LABEL)}`);
    }
    if (viewsContain(day1, VOLUME_END_LINE)) {
      problems.push(`day 1 body contains ${JSON.stringify(VOLUME_END_LINE)}, that footer line is for day 24 and later`);
    }
  }

  // Days 8, 22 and 24: the position-indexed review set, computed here.
  for (const day of [8, 22, 24]) {
    const views = bodies.get(day);
    if (!views) continue;
    if (!viewsContain(views, PASSAGE_LABEL)) {
      problems.push(`day ${day} body does not contain the pinned passage label ${JSON.stringify(PASSAGE_LABEL)}`);
    }
    if (!viewsContain(views, REVIEW_LABEL)) {
      problems.push(`day ${day} body has no ${JSON.stringify(REVIEW_LABEL)} review section`);
      continue;
    }
    if (!viewsContain(views, REVIEW_LINE)) {
      problems.push(`day ${day} body does not contain the pinned review line ${JSON.stringify(REVIEW_LINE)}`);
    }
    const tail = tailViews(views, REVIEW_LABEL);
    const picks = reviewPicks(day);
    const chosenIds = new Set();
    for (const pick of picks) {
      if (!pick.word || !isFilledString(pick.word.word)) {
        problems.push(`day ${day} expected review word from day ${pick.priorDay} index ${pick.index} is missing from lexicon.json`);
        continue;
      }
      chosenIds.add(pick.word.id);
      if (!viewsContainWord(tail, pick.word.word)) {
        problems.push(
          `day ${day} review section does not contain ${JSON.stringify(pick.word.word)} (day ${pick.priorDay} word index ${pick.index})`,
        );
      }
      const probe = definitionProbe(pick.word.definition);
      if (probe && viewsContain(tail, probe)) {
        problems.push(`day ${day} review section shows the definition of ${JSON.stringify(pick.word.word)}, definitions must be hidden`);
      }
    }
    // "Exactly the review words the formula selects": the other words from the
    // same prior days must not appear in the review section.
    for (const pick of picks) {
      for (const word of wordsOf(pick.priorDay)) {
        if (!word || !isFilledString(word.word) || chosenIds.has(word.id)) continue;
        if (viewsContainWord(tail, word.word)) {
          problems.push(
            `day ${day} review section contains ${JSON.stringify(word.word)} from day ${pick.priorDay}, which the formula does not select`,
          );
        }
      }
    }
    if (day === 22) {
      const offset21 = picks.find((pick) => pick.priorDay === day - 21);
      if (!offset21 || !offset21.word) {
        problems.push('day 22 review set has no day 1 pick, the offset 21 arm of the formula is missing');
      } else if (!viewsContainWord(tail, offset21.word.word)) {
        problems.push(`day 22 review section does not contain the offset 21 word ${JSON.stringify(offset21.word.word)} from day 1`);
      }
    }
    if (day === 24) {
      if (!viewsContain(views, VOLUME_END_LINE)) {
        problems.push(`day 24 body does not contain ${JSON.stringify(VOLUME_END_LINE)}`);
      }
    } else if (viewsContain(views, VOLUME_END_LINE)) {
      problems.push(`day ${day} body contains ${JSON.stringify(VOLUME_END_LINE)}, that footer line is for day 24 and later`);
    }
  }

  // Day 35: post-volume review, six formula words, no definitions, no passage.
  const day35 = bodies.get(35);
  if (day35) {
    const picks = postVolumePicks(35);
    if (picks.length !== 6) {
      problems.push(`the post-volume formula for day 35 produced ${picks.length} words, expected 6`);
    }
    for (const pick of picks) {
      if (!pick.word || !isFilledString(pick.word.word)) {
        problems.push(`day 35 expected review word from day ${pick.priorDay} index ${pick.index} is missing from lexicon.json`);
        continue;
      }
      if (!viewsContainWord(day35, pick.word.word)) {
        problems.push(
          `day 35 body does not contain ${JSON.stringify(pick.word.word)} (day ${pick.priorDay} word index ${pick.index})`,
        );
      }
      const probe = definitionProbe(pick.word.definition);
      if (probe && viewsContain(day35, probe)) {
        problems.push(`day 35 body shows the definition of ${JSON.stringify(pick.word.word)}, post-volume definitions must be hidden`);
      }
    }
    if (viewsContain(day35, PASSAGE_LABEL)) {
      problems.push(`day 35 body contains ${JSON.stringify(PASSAGE_LABEL)}, a post-volume day teaches no new words and has no passage`);
    }
  }

  // Pinned footer copy on the content days.
  for (const day of [1, 8, 22, 24]) {
    const views = bodies.get(day);
    if (views && !viewsContain(views, 'Open your Wordhoard')) {
      problems.push(`day ${day} body does not contain the pinned footer button copy "Open your Wordhoard"`);
    }
  }

  return problems;
});

/* ------------------------------------------------------------------ */
/* V10: unit files, run.sh and package.json                            */
/* ------------------------------------------------------------------ */

check(10, () => {
  const problems = [];

  const timer = readTextFile('wordhoard.timer');
  if (timer === null) {
    problems.push('wordhoard.timer does not exist');
  } else {
    if (!timer.includes('06:45:00 America/Guyana')) {
      problems.push('wordhoard.timer does not contain 06:45:00 America/Guyana');
    }
    if (!timer.includes('Persistent=true')) {
      problems.push('wordhoard.timer does not contain Persistent=true');
    }
    if (!timer.includes('WantedBy=timers.target')) {
      warn('V10 wordhoard.timer does not contain WantedBy=timers.target, which the spec pins');
    }
  }

  const service = readTextFile('wordhoard.service');
  if (service === null) {
    problems.push('wordhoard.service does not exist');
  } else {
    if (!service.includes('User=deploy')) problems.push('wordhoard.service does not contain User=deploy');
    if (!service.includes('EnvironmentFile=')) problems.push('wordhoard.service does not contain EnvironmentFile=');
    if (!service.includes('ExecStart=/home/deploy/wordhoard/run.sh')) {
      problems.push('wordhoard.service does not contain ExecStart=/home/deploy/wordhoard/run.sh');
    }
    for (const pinned of [
      'WorkingDirectory=/home/deploy/wordhoard',
      'Type=oneshot',
      'After=network-online.target',
      'Wants=network-online.target',
      '/home/deploy/wordhoard/wordhoard.log',
    ]) {
      if (!service.includes(pinned)) {
        warn(`V10 wordhoard.service does not contain ${JSON.stringify(pinned)}, which the spec pins`);
      }
    }
  }

  const runSh = readTextFile('run.sh');
  if (runSh === null) {
    problems.push('run.sh does not exist');
  } else {
    if (!runSh.startsWith('#!')) problems.push('run.sh does not start with a shebang');
    try {
      const mode = statSync(join(ROOT, 'run.sh')).mode;
      if ((mode & 0o100) === 0) {
        problems.push(`run.sh mode is ${(mode & 0o777).toString(8)}, the owner execute bit is not set`);
      }
    } catch (err) {
      problems.push(`run.sh mode could not be read: ${err.message}`);
    }
  }

  const pkg = readJsonFile('package.json');
  if (pkg.missing) {
    problems.push('package.json does not exist');
  } else if (pkg.parseError) {
    problems.push(`package.json is not valid JSON: ${pkg.parseError}`);
  } else {
    const deps = pkg.value.dependencies;
    if (!deps || typeof deps !== 'object') {
      problems.push('package.json has no dependencies object');
    } else {
      const names = Object.keys(deps).sort();
      if (names.length !== 1 || names[0] !== 'nodemailer') {
        problems.push(`package.json dependencies are [${names.join(', ')}], expected nodemailer only`);
      } else if (!String(deps.nodemailer).startsWith('^6')) {
        problems.push(`package.json depends on nodemailer ${JSON.stringify(deps.nodemailer)}, expected a ^6 range`);
      }
    }
    if (pkg.value.type !== 'module') {
      problems.push(`package.json type is ${JSON.stringify(pkg.value.type)}, expected "module"`);
    }
    const devDeps = pkg.value.devDependencies;
    if (devDeps && typeof devDeps === 'object' && Object.keys(devDeps).length > 0) {
      warn(`V10 package.json declares devDependencies [${Object.keys(devDeps).join(', ')}], the spec names nodemailer as the only dependency`);
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V11: secret hygiene                                                 */
/* ------------------------------------------------------------------ */

check(11, () => {
  const problems = [];
  const secretPattern = /GMAIL_APP_PASSWORD=[A-Za-z0-9]{8,}/;
  for (const rel of scannedFiles()) {
    if (rel === 'README.md') continue;
    const text = readTextFile(rel);
    if (text === null) continue;
    const match = secretPattern.exec(text);
    if (match) {
      problems.push(`${rel} line ${lineNumberOf(text, match.index)} looks like it contains a real app password`);
    }
  }

  if (existsSync(join(ROOT, '.env'))) {
    problems.push('.env exists at the repo root, it must only exist on the VPS');
  }

  const gitignore = readTextFile('.gitignore');
  if (gitignore === null) {
    problems.push('.gitignore does not exist, so .env and .state.json are not ignored');
  } else {
    const lines = gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    const covers = (name) =>
      lines.some((line) => line === name || line === `/${name}` || line === `${name}*` || line === `**/${name}`);
    for (const name of ['.env', '.state.json']) {
      if (!covers(name)) problems.push(`.gitignore does not cover ${name}`);
    }
    for (const name of ['node_modules', 'out']) {
      const ignored = lines.some((line) => line.replace(/\/$/, '') === name || line === `/${name}` || line === `/${name}/`);
      if (!ignored) warn(`V11 .gitignore does not appear to cover ${name}, which the spec says is not committed`);
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V12: the two pinned algorithm lines, verbatim in both places        */
/* ------------------------------------------------------------------ */

check(12, () => {
  const problems = [];
  const targets = [
    { rel: 'index.html', text: readTextFile('index.html') },
    { rel: 'send.mjs', text: readTextFile('send.mjs') },
  ];
  for (const target of targets) {
    if (target.text === null) {
      problems.push(`${target.rel} does not exist, so the pinned algorithm lines cannot be verified`);
      continue;
    }
    if (!target.text.includes(ALGO_LINE_TODAY)) {
      problems.push(`${target.rel} does not contain the pinned guyanaToday line verbatim`);
    }
    if (!target.text.includes(ALGO_LINE_DAYNUMBER)) {
      problems.push(`${target.rel} does not contain the pinned dayNumber line verbatim`);
    }
    // EXTRA: the spec bans Date.UTC on a string, it returns NaN.
    if (/Date\.UTC\s*\(\s*(guyanaToday|startDate)/.test(target.text)) {
      problems.push(`${target.rel} calls Date.UTC on a date string, which returns NaN`);
    }
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V13: recorded audio (added 2026-10-10, beyond spec 001)             */
/* ------------------------------------------------------------------ */

// Every speak button plays a recorded clip. A clip that is missing, or was
// recorded from words or IPA that have since changed, fails here: run
// node audio.mjs on the Mac to record it again.
check(13, () => {
  const problems = [];
  const voiceFile = readJsonFile('audio/voices.json');
  if (voiceFile.missing) return ['audio/voices.json does not exist'];
  if (voiceFile.parseError) return [`audio/voices.json is not valid JSON: ${voiceFile.parseError}`];
  const voices = voiceFile.value && Array.isArray(voiceFile.value.voices) ? voiceFile.value.voices : [];
  if (voices.length === 0) return ['audio/voices.json lists no voices'];
  const ids = new Set();
  for (const voice of voices) {
    if (!/^[a-z0-9-]+$/.test(String(voice.id))) problems.push(`voice id ${JSON.stringify(voice.id)} is not a plain lowercase slug`);
    if (ids.has(voice.id)) problems.push(`voice id ${voice.id} appears twice`);
    ids.add(voice.id);
    if (voice.engine !== 'kokoro') problems.push(`voice ${voice.id} has unknown engine ${JSON.stringify(voice.engine)}`);
    for (const field of ['name', 'note', 'model']) {
      if (!isFilledString(voice[field])) problems.push(`voice ${voice.id} has no ${field}`);
    }
  }
  if (!ids.has(voiceFile.value.default)) problems.push(`default voice ${JSON.stringify(voiceFile.value.default)} is not in the list`);

  const lexicon = readJsonFile('lexicon.json');
  if (lexicon.missing || lexicon.parseError) return problems.concat(['lexicon.json cannot be read, so the clips cannot be checked']);
  const manifestFile = readJsonFile('audio/manifest.json');
  if (manifestFile.missing) return problems.concat(['audio/manifest.json does not exist: run node audio.mjs']);
  const manifest = manifestFile.value || {};
  if (manifest.pipeline !== PIPELINE) problems.push(`audio/manifest.json is from pipeline ${manifest.pipeline}, expected ${PIPELINE}: run node audio.mjs`);
  const clips = manifest.clips || {};
  let missing = 0;
  let stale = 0;
  for (const clip of clipPlan(lexicon.value, voiceFile.value)) {
    // A headword clip must be spoken from the lexicon's IPA, never the voice's guess.
    if (clip.kind === 'word' && !clip.input.includes('](/')) {
      problems.push(`${clip.path} is not spoken from the lexicon's IPA (the plan found no headword in it)`);
    }
    const full = join(ROOT, clip.path);
    if (!existsSync(full) || statSync(full).size < 2000) {
      missing += 1;
      problems.push(`${clip.path} is missing or empty`);
    } else if (clips[clip.path] !== clip.hash) {
      stale += 1;
      problems.push(`${clip.path} was recorded from different text or IPA than the lexicon now holds`);
    }
  }
  if (missing + stale > 0) problems.unshift(`${missing} clips missing and ${stale} stale: run node audio.mjs`);

  const html = readTextFile('index.html');
  if (html !== null) {
    if (!html.includes("fetch('audio/voices.json')")) problems.push('index.html does not fetch audio/voices.json');
    if (!html.includes("'wh.voice'")) problems.push('index.html does not keep the voice choice under wh.voice');
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* V14: lines to borrow and their listen links (added 2026-10-12)      */
/* ------------------------------------------------------------------ */

// Every word carries one line to borrow (content/lines.json, merged by
// build.mjs): a sentence written to be heard and lifted whole, with the
// reusable phrase marked in it. The email links each review word to its
// recorded word and line, and the site plays them.
const LINE_ENDINGS = { verb: ['', 's', 'es', 'd', 'ed', 'ing'], adjective: ['', 'ly'], noun: ['', 's', 'es'] };

function headwordCount(text, word) {
  const endings = LINE_ENDINGS[word.pos] || [''];
  const alternatives = endings.map((e) => escapeRegExp(word.word + e)).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(?:${alternatives})(?![\\p{L}\\p{M}])`, 'giu');
  return (text.match(re) || []).length;
}

check(14, () => {
  if (!lexicon) return NO_LEXICON;
  const problems = [];
  const seen = new Map();
  let withLine = 0;
  for (const row of CURRICULUM) {
    for (const word of wordsOf(row.day)) {
      if (!word || typeof word !== 'object') continue;
      const label = `day ${row.day} ${word.word}`;
      const line = word.line;
      if (!line || typeof line !== 'object') {
        problems.push(`${label} has no line to borrow: add it to content/lines.json and run node build.mjs`);
        continue;
      }
      withLine += 1;
      for (const field of ['setting', 'text', 'borrow']) {
        if (!isFilledString(line[field])) problems.push(`${label} line.${field} is missing or empty`);
      }
      if (!isFilledString(line.text) || !isFilledString(line.borrow)) continue;
      const text = line.text.trim();
      const words = text.split(/\s+/).length;
      if (words < 12 || words > 40) problems.push(`${label} line has ${words} words, expected 12 to 40`);
      if (!/[.?]$/.test(text)) problems.push(`${label} line does not end with a full stop or a question mark`);
      if (/[0-9]/.test(text)) problems.push(`${label} line contains a digit, which the voice may misread`);
      const uses = headwordCount(text, word);
      if (uses !== 1) problems.push(`${label} line uses the headword ${uses} times, expected exactly once`);
      if (!text.includes(line.borrow)) problems.push(`${label} line.borrow is not an exact part of the line`);
      else if (headwordCount(line.borrow, word) !== 1) problems.push(`${label} line.borrow does not contain the headword`);
      const settingWords = String(line.setting || '').trim().split(/\s+/).length;
      if (settingWords < 2 || settingWords > 10) problems.push(`${label} line.setting has ${settingWords} words, expected 2 to 10`);
      const previous = seen.get(text.toLowerCase());
      if (previous) problems.push(`${label} line repeats the line of ${previous}`);
      else seen.set(text.toLowerCase(), label);
    }
  }
  if (withLine !== 90) problems.unshift(`${withLine} of 90 words have a line to borrow`);

  // The review email links every word to its recorded word and line.
  const day = 57;
  const run = runSender(day);
  const html = run.status === 0 ? readTextFile(join('out', `day-${day}.html`)) : null;
  if (html === null) {
    problems.push(`send.mjs could not render day ${day} for the link check (exit ${run.status})`);
  } else {
    const base = `${EXPECTED_SITE_URL}audio/heart/`;
    for (const pick of postVolumePicks(day)) {
      const id = pick.word && pick.word.id;
      if (!id) continue;
      if (!html.includes(`${base}w/${id}.mp3`)) problems.push(`day ${day} email has no link to the word clip for ${id}`);
      if (!html.includes(`${base}l/${id}.mp3`)) problems.push(`day ${day} email has no link to the line clip for ${id}`);
    }
    if (!html.includes(`${EXPECTED_SITE_URL}#listen`)) problems.push(`day ${day} email has no link to listen to all six on the site`);
  }

  const page = readTextFile('index.html');
  if (page !== null) {
    if (!page.includes("'l/'")) problems.push('index.html does not play line clips from audio/<voice>/l/');
    if (!page.includes("'e/'")) problems.push('index.html does not play example clips from audio/<voice>/e/');
    if (!page.includes('data-action="listen"')) problems.push('index.html has no Listen to all control');
  }
  return problems;
});

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(
  `summary: ${CHECK_COUNT} checks, ${okCount} ok, ${failCount} FAIL line${failCount === 1 ? '' : 's'}, ${warnCount} WARN line${warnCount === 1 ? '' : 's'}`,
);
process.exit(failCount === 0 ? 0 : 1);
