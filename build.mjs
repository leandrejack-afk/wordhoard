// Merges the three content part files into lexicon.json (the single file the
// site fetches and the sender reads). Run: node build.mjs
import { readFile, writeFile } from "node:fs/promises";

const PARTS = [
  "content/days-01-10.json",
  "content/days-11-20.json",
  "content/days-21-30.json",
];

const days = [];
for (const p of PARTS) {
  const parsed = JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
  days.push(...parsed.days);
}
days.sort((a, b) => a.day - b.day);

const lexicon = {
  version: 1,
  volume: 1,
  title: "Wordhoard",
  startDate: "2026-08-17",
  siteUrl: "https://leandrejack-afk.github.io/wordhoard/",
  days,
};

await writeFile(new URL("lexicon.json", import.meta.url), JSON.stringify(lexicon, null, 2) + "\n");
console.log(`[build] lexicon.json written: ${days.length} days, ${days.reduce((n, d) => n + d.words.length, 0)} words`);
