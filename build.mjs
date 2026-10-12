// Merges the three content part files into lexicon.json (the single file the
// site fetches and the sender reads), and gives every word its line to borrow
// from content/lines.json. Run: node build.mjs
import { readFile, writeFile } from "node:fs/promises";

const PARTS = [
  "content/days-01-10.json",
  "content/days-11-20.json",
  "content/days-21-30.json",
];
const LINES = "content/lines.json";

const days = [];
for (const p of PARTS) {
  const parsed = JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
  days.push(...parsed.days);
}
days.sort((a, b) => a.day - b.day);

// One line per word, keyed by word id: { setting, text, borrow }. A word with
// no line is left without one and validate.mjs reports it.
let lines = {};
try {
  lines = JSON.parse(await readFile(new URL(LINES, import.meta.url), "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") throw new Error(`build: ${LINES} could not be read: ${err.message}`);
  console.warn(`[build] ${LINES} not found, words get no line to borrow`);
}
const ids = new Set();
let attached = 0;
for (const day of days) {
  for (const word of day.words) {
    ids.add(word.id);
    delete word.line;
    const line = lines[word.id];
    if (!line) continue;
    word.line = { setting: line.setting, text: line.text, borrow: line.borrow };
    attached += 1;
  }
}
const strays = Object.keys(lines).filter((id) => !ids.has(id));
if (strays.length) throw new Error(`build: ${LINES} has lines for unknown word ids: ${strays.join(", ")}`);

const lexicon = {
  version: 1,
  volume: 1,
  title: "Wordhoard",
  startDate: "2026-08-17",
  siteUrl: "https://leandrejack-afk.github.io/wordhoard/",
  days,
};

await writeFile(new URL("lexicon.json", import.meta.url), JSON.stringify(lexicon, null, 2) + "\n");
console.log(`[build] lexicon.json written: ${days.length} days, ${days.reduce((n, d) => n + d.words.length, 0)} words, ${attached} lines to borrow`);
