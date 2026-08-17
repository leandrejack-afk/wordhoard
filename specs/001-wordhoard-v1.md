# Spec 001: Wordhoard Volume I (rev 2, post-critique)

Rev 2 incorporates all 25 findings from opus-critic (2026-08-17): review-rotation formula replaced (was provably skipping 30 of 90 words), day-number expression pinned verbatim (Date.UTC(string) is NaN), monosyllable respell rule, AC11 dictionary verification added, deploy order reversed to kill the double-send race, timer moved to 06:45, DAY_OVERRIDE isolated from state, RENDER_ONLY stdout contract pinned, curriculum edits (day 24 tier swap, day 25 incisive, day 26 umbrage), palette contrast fix, unit file pins. No findings overruled.

## Outcome (one sentence)

A daily 06:45 America/Guyana email that teaches Leandre three learned words with a short read-aloud passage, backed by a permanent browsable web archive (GitHub Pages) where the collection grows day by day, running unattended on the GoalEdge VPS at zero new monthly cost.

Size: M. Project root: `/Users/leandrejack/projects/wordhoard`.

## Why this shape (context executors need)

Leandre wants to speak more fluently using learned words but has no time for daily book reading. The system therefore: (a) pushes a small daily lesson to the email he already reads first thing (it arrives at 06:45, before the 07:00 Morning Brief, so the lesson gets the freshest minute of attention), (b) makes every lesson speakable out loud, not just readable, and (c) accumulates everything in one place he can revisit and browse in bulk. Retention comes from built-in spaced review (offsets 1, 3, 7, 21 days). Reliability comes from being fully deterministic: all content is pre-written; no AI, no external API runs in the daily loop.

Missed-day semantics (decided): the day number is calendar-derived. If the VPS is down on a day, that lesson is not re-emailed later; it remains browsable on the site forever. `Persistent=true` rescues same-day misses (reboot before 06:45 send). No queue, no shared state between site and sender.

## Hard writing rules (apply to every string in every deliverable)

1. NEVER use an em dash (U+2014) or en dash (U+2013) anywhere: content JSON, HTML, email, README, comments, unit files, package.json descriptions. Use commas, colons, parentheses, or the word "to". For a visual separator use a middle dot `·` or a vertical bar. Also banned: the HTML entities `&mdash;`, `&ndash;`, `&#8212;`, `&#8211;`. In code that must REFERENCE these characters (the validator), use escape sequences only (`—`, `–` in JS), never the literal characters.
2. No AI-tell buzzwords: leverage, streamline, empower, cutting-edge, seamless, robust, delve, elevate (as a verb of quality), unlock (except the literal hoard-unlocking metaphor).
3. Plain, direct, slightly bookish voice. Sentence case everywhere except deliberate small caps.
4. `epigram` fields are ORIGINAL lines written for this project and never attributed to anyone. (The About view's Beowulf note is the single permitted attribution in the product, and it names a text, not a person.) Definition, pos, ipa and etymology fields ARE accuracy risks: they are model-written and are verified against real dictionaries under AC11 before the run goes green.
5. Hyphens (U+002D) are fine and normal.
6. Spelling convention: US spellings throughout (demeanor, candor); `ipa` gives the American pronunciation where UK/US differ.

## Architecture

- Repo `wordhoard`, pushed to GitHub `leandrejack-afk/wordhoard` (public), GitHub Pages serving the repo root of `main`. Site URL: `https://leandrejack-afk.github.io/wordhoard/`.
- `content/days-01-10.json`, `content/days-11-20.json`, `content/days-21-30.json`: source content, one file per content executor.
- `build.mjs` (orchestrator-owned) merges the three parts into `lexicon.json` at repo root. `lexicon.json` is committed (the site fetches it; the sender reads it). All 30 days ship in it from day one; "sealed" days are a rendering convention, not access control, which is fine for a personal tool.
- `index.html`: the entire site. Single file, inline CSS and JS, fetches `lexicon.json` with a RELATIVE path (`fetch('lexicon.json')`, never `/lexicon.json`; the site lives under a `/wordhoard/` subpath).
- `send.mjs` + `email.mjs` + `run.sh` + `wordhoard.service` + `wordhoard.timer`: daily sender, deployed to `/home/deploy/wordhoard` on the GoalEdge VPS (Node v22 at `/usr/bin/node`, ESM). SMTP creds come from `/home/deploy/wordhoard/.env` (same two keys as morning-brief: `GMAIL_USER`, `GMAIL_APP_PASSWORD`). `.env` and `.state.json` are gitignored and exist only on the VPS.
- `validate.mjs` (test-writer owned): the acceptance test suite. Plain Node script, zero dependencies, exits 0 on success.

Daily flow: systemd timer fires 06:45 America/Guyana → `run.sh` does `git pull` (tolerate failure, never go silent) → `send.mjs` computes today's day number, composes the email from `lexicon.json`, sends via Gmail SMTP 587, records the day number in `.state.json` so a re-fire never double-sends.

## Data contract: `lexicon.json`

```json
{
  "version": 1,
  "volume": 1,
  "title": "Wordhoard",
  "startDate": "2026-08-17",
  "siteUrl": "https://leandrejack-afk.github.io/wordhoard/",
  "days": [ Day, ... exactly 30, day numbers 1..30 contiguous ascending ]
}
```

`Day`:

```json
{
  "day": 1,
  "theme": "The art of speaking well",
  "themeLine": "one sentence, max 140 chars, introducing why these three words belong together",
  "words": [ Word, Word, Word ],
  "passage": {
    "title": "short evocative title",
    "setting": "one line naming the imagined speaking situation, e.g. 'A toast at a colleague's send-off'",
    "text": "60 to 100 words target (validator tolerates 55 to 110). FIRST PERSON, written to be spoken aloud. Must use all three of the day's words, verbatim or naturally inflected (e.g. 'articulate' may appear as 'articulately'). Natural cadence, varied sentence length, no bullet feel.",
    "deliveryCue": "one short coaching line about HOW to say it, e.g. 'Slow down on the final clause and let the last word land.'"
  },
  "epigram": "one original aphoristic line, max 120 chars target (validator tolerates 140), using at least one of the day's words. Never attributed to anyone."
}
```

`Word`:

```json
{
  "id": "kebab-case-of-word",
  "word": "perspicacious",
  "pos": "adjective",
  "tier": "foundation" | "distinction" | "flourish",
  "ipa": "/ˌpɜr.spɪˈkeɪ.ʃəs/",
  "respell": "per·spi·KAY·shus",
  "definition": "one plain sentence a smart friend would say, not dictionary-speak; must be dictionary-accurate for the taught sense",
  "nuance": "one or two sentences: what this word carries that its plain synonym does not, and the situation where it is exactly right",
  "etymology": "one or two sentences, a memorable hook, accurate. If uncertain of a detail, write the safe general truth (e.g. 'from Latin perspicere, to see through') rather than a colorful guess.",
  "examples": {
    "conversational": "a sentence he could say to a friend",
    "professional": "a sentence he could say in a meeting or to a client",
    "elevated": "a sentence with real rhetorical polish, still sayable with a straight face"
  },
  "collocations": ["3 to 5 short common pairings, e.g. 'a perspicacious observer'"],
  "nearSynonyms": [
    { "word": "astute", "distinction": "one clause on how it differs" },
    { "word": "shrewd", "distinction": "one clause on how it differs" }
  ],
  "registerNote": "one sentence on when NOT to use it or how it can misfire (pomposity, negative charge, formality level). Every word has one; 'safe in any register' is allowed only if true."
}
```

Respell convention: lowercase syllables separated by middle dots `·`, stressed syllable in CAPS: `per·spi·KAY·shus`, `uh·PLOM`. A one-syllable word's respell is the whole word respelled in CAPS with no separator (e.g. `SWAY`, `RY` for wry). Use intuitive English sound-spellings, not IPA, in `respell`.

Heteronym rule: for words whose pronunciation shifts with part of speech (articulate adj vs verb, consummate adj vs verb), `respell` and `ipa` give the TAUGHT part of speech only, and `registerNote` names the other pronunciation so he is never caught out.

Definitions and pos must be dictionary-accurate for the sense taught. Teach ONE primary sense per word (the one useful in speech); the nuance field may mention a second sense in passing if genuinely useful (e.g. countenance as a verb).

## The pinned curriculum (executors write entries for exactly these words; no substitutions)

Tiers: F = foundation (common-elevated, deploy daily), D = distinction (educated register), FL = flourish (deliberate showpiece). `words[0]` is always the F word, `words[1]` the D word, `words[2]` the FL word. A parenthetical in a cell pins that word's `pos`; the `word` field is the BARE headword without the parenthetical.

| Day | Theme | F | D | FL |
|-----|-------|---|---|----|
| 1 | The art of speaking well | articulate (adjective) | eloquent | mellifluous |
| 2 | Judging wisely | discerning | astute | perspicacious |
| 3 | Disagreeing with grace | contend | demur (verb) | remonstrate |
| 4 | Calm under pressure | composure | equanimity | aplomb |
| 5 | Making a strong case | compelling | cogent | incontrovertible |
| 6 | Precision and clarity | concise | lucid | pellucid |
| 7 | Praise that lands | commend | laudable | exemplary |
| 8 | Reading people | demeanor | disposition | countenance (noun) |
| 9 | Work and mastery | diligent | meticulous | assiduous |
| 10 | Beginnings | initiate (verb) | inception | nascent |
| 11 | Bright expectations | promising | sanguine | propitious |
| 12 | The uses of money | frugal | prudent | munificent |
| 13 | Quiet influence | sway (verb) | galvanize | engender |
| 14 | Saying less | brevity | succinct | laconic |
| 15 | Curiosity and learning | inquisitive | erudite | voracious |
| 16 | Standing firm | steadfast | resolute | intransigent |
| 17 | Uncertainty, honestly | ambiguous | tenuous | equivocal |
| 18 | Time and change | fleeting | transient | ephemeral |
| 19 | Subtlety | nuance (noun) | tacit | oblique |
| 20 | Abundance | ample | copious | plethora |
| 21 | Character worth having | integrity | candor | probity |
| 22 | Difficult people | obstinate | recalcitrant | truculent |
| 23 | Making things easier | alleviate | mitigate | obviate |
| 24 | Wit and humor | wry | droll | irreverent |
| 25 | Getting to the point | salient | incisive | germane |
| 26 | Displeasure with dignity | vexed | indignant | umbrage (noun) |
| 27 | Growth and improvement | refine | hone | burgeon |
| 28 | Judgment calls | pragmatic | judicious | circumspect |
| 29 | Rare and excellent | singular (adjective) | consummate (adjective) | peerless |
| 30 | The finish line | culminate | denouement | apotheosis |

Definition traps that MUST be handled exactly (put the correction in `definition` or `registerNote`): plethora means an overabundance, an excess, not merely "a lot"; obviate means to remove the need for something, not to make it easier; burgeon strictly means to bud or sprout, hence to begin to grow flourishingly; hone means to sharpen (note that "hone in on" is widely considered an error for "home in on"); demur (to voice hesitation) is not demure (modest); umbrage lives almost exclusively in "take umbrage at". Register warnings that MUST appear where listed: intransigent (negative charge: unreasonably immovable), truculent, recalcitrant and obstinate (all negative; never describe a client this way to their face), munificent (praise register).

## Pinned algorithms (site and sender MUST both implement exactly these)

Current day number, computed in America/Guyana regardless of host timezone. BOTH `index.html` and `send.mjs` must contain these two lines VERBATIM (character for character), so the two implementations cannot diverge:

```js
const guyanaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana' }).format(new Date());
const dayNumber = Math.round((Date.parse(guyanaToday + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) + 1;
```

(`en-CA` formats as YYYY-MM-DD. Do NOT use `Date.UTC(string)`: it returns NaN.) Day 1 is startDate itself. `dayNumber < 1`: treat as day 1 (site) / log "before start" and exit 0 without sending (sender). In the sender, `DAY_OVERRIDE` overrides the result AFTER these lines run: `const day = process.env.DAY_OVERRIDE ? Number(process.env.DAY_OVERRIDE) : dayNumber;`

Spaced review for day N (2 <= N <= 30): candidate offsets are `[1, 3, 7, 21]`. For the i-th offset (i = 0..3), prior day p = N - offset[i]; keep only p >= 1. Review word index for that prior day = `(p + i) % 3`. One word per kept prior day, in offset order (yesterday first). This position-indexed rotation covers every word of days 1 to 23 within the volume; days 24 to 30 get their remaining coverage from post-volume review days. (The offsets can never collide, so no dedupe is needed; if you add one defensively it is dead code, which is acceptable.)

Post-volume review day (N > 30): no new words. Pick 6 review words: for k in 0..5, day index = `((N * 7 + k * 11) % 30) + 1`, word index = `(N + k) % 3`, dedupe by word id (11 is coprime with 30 so the 6 days are always distinct; the dedupe is defensive).

## Deliverable A: content (three executors)

Owner A1: `content/days-01-10.json`. Owner A2: `content/days-11-20.json`. Owner A3: `content/days-21-30.json`.
Each file: `{ "days": [ Day, ... exactly 10 ] }` per the data contract, for their day range only, words exactly per the curriculum table (bare headwords, pinned pos where a parenthetical appears). Valid JSON (verify with `node -e` yourself before reporting). No other files.

Quality bar: this content IS the product. Definitions accurate; examples genuinely sayable by a professional man in Georgetown, Guyana (international register, no US-only cultural references); passages are little speeches (a toast, an objection in a meeting, a pitch, a story told at dinner, mentoring a junior, a negotiation, an interview answer) with real cadence; every field filled; no placeholder text. Vary passage settings across your ten days.

## Deliverable B: the site (`index.html`, one executor)

One file, no build step, no external JS libraries, no frameworks. Google Fonts allowed (max 2 families, `<link>` tags). Inline CSS + JS. Fetches `lexicon.json` relatively. Must work in a Gmail in-app webview and iPhone Safari.

Views (simple tab nav, no router):
1. **Today**: hero card for the current day: theme, themeLine, the three words in full detail (all fields), the passage set as a manuscript block with drop cap and the deliveryCue, the epigram. If N > 30: a "Volume I complete" state showing that day's post-volume review set (pinned algorithm) and a lead-in to the Hoard.
2. **Hoard**: every UNLOCKED word (days <= N only) as dictionary-plate cards, A-Z sort toggle vs day order, live search filter (matches word, definition, theme), tier filter chips. Card tap expands full detail.
3. **Days**: journal list of unlocked days (newest first): day number, theme, the three words; tap opens that day's full view (same layout as Today).
4. **Practice**: recall drill over unlocked words, two directions: "Define it" (headword shown, tap to reveal definition + nuance) and "Summon it" (definition shown + first letter, tap to reveal the word: production practice). Buttons: Got it / Again. "Got it" marks mastered in localStorage key `wh.mastered` (object of id: true). Toggle "hide mastered". Math.random is fine here (client only).
5. **About**: the wordhord onleac origin note (Old English: "he unlocked his word-hoard", the phrase the Beowulf poet uses in the moment before a hero speaks; Beowulf is the single permitted attribution and it names a text, not a person), how the system works, the daily 06:45 email, volume progress, the missed-day rule (a missed email is never resent; the day is always here).

Locked days: never rendered (a rendering convention, not security). One quiet teaser line under stats: "N days still sealed in Volume I."

Speech: every headword and every passage gets a speak button using `window.speechSynthesis` (feature-detected; hidden if unavailable). Rate 0.92 for passages. Prefer an en-US voice when available.

Stats strip under masthead: `Day N of 30 · X words unlocked`. Post-volume: `Volume I complete · 90 words unlocked`.

### Design brief (follow exactly; the axes pinned here are not yours to re-decide)

Concept: a night library, a treasury of words. NOT the warm-cream-and-terracotta look; NOT a near-black page with acid green. Dark-first.

Palette (CSS custom properties, exact values):
- `--ink: #14161D` page ground (dark blue-black)
- `--vellum: #E9E4D6` primary text on dark
- `--gilt: #C9A54A` the gold. Gold is reserved for: headwords, the drop cap, the active tab underline, stressed syllables in respellings, the hairline rules at `--rule` alpha, and the `:focus-visible` ring. Nothing else is gold.
- `--slate: #8B93A7` secondary text, annotations, labels
- `--rule: rgba(201,165,74,.28)` hairline rules and the double-rule card frames
- Light mode via `prefers-color-scheme: light`: ground `#F5F4EF` (cool rag paper, not warm cream), text `#1C2130` (navy ink), gold `#866626` (meets 4.5:1 on the ground for small text), slate `#5A6274`, rules `rgba(134,102,38,.35)`.

Type: display face **Fraunces** (Google Fonts, weights 400;600;900) for the masthead, headwords, and drop caps; body face **Newsreader** (400;500 + italics) for definitions, passages, prose. Labels/eyebrows: Fraunces 600 small caps, letterspaced 0.14em. IPA rendered in the body stack with system fallbacks. Masthead: WORDHOARD in Fraunces 900, wide letterspacing, a middle dot ornament each side.

Structure: word cards are dictionary plates: thin double rule top (two 1px rules 3px apart), headword large in Fraunces, respell directly under it with the stressed syllable in gold small caps, pos + tier as a letterspaced eyebrow. The passage block: first letter as a 3-line drop cap in Fraunces 900 gilt; setting line above in slate italics; deliveryCue below as a hanging annotation styled like marginalia.

Signature moment: on load of Today, the three headwords "gild": they render in vellum and transition to gilt with a 250ms stagger. Under `prefers-reduced-motion: reduce`, no transition, rendered gilt immediately. No other animation except gentle hover/focus states.

Quality floor: responsive to 360px, visible keyboard focus (`:focus-visible`), tap targets >= 44px, `<html lang="en">`, semantic headings, `<noscript>` line if JS is disabled.

## Deliverable C: the sender (one executor)

Files: `send.mjs`, `email.mjs` (template module), `run.sh`, `wordhoard.service`, `wordhoard.timer`, `package.json` (nodemailer ^6 the only dependency, `"type": "module"`).

`send.mjs` behavior:
1. Load `lexicon.json` (same dir). Compute the day number per the pinned algorithm (verbatim lines), then apply `DAY_OVERRIDE` as pinned.
2. State guard, ONLY when `DAY_OVERRIDE` is unset: if `.state.json` exists and `lastSentDay >= day`, log "already sent day N" and exit 0. When `DAY_OVERRIDE` is set, `.state.json` is neither read nor written.
3. Compose subject and HTML via `email.mjs`:
   - Day 1..30 subject: `Wordhoard · Day N: <theme>`. Post-volume subject: `Wordhoard · Day N: Review from the hoard`.
   - Sections for a content day: masthead; theme + themeLine; three word cards (headword, respell, pos, definition, nuance, the professional example, registerNote one-liner); the read-aloud passage block (title, setting, text, deliveryCue) introduced with the label "Read this aloud"; spaced review section "From the hoard" (per the pinned position-indexed algorithm: word + respell ONLY, no definitions, plus the line "Recall its meaning, then use it once today. Tap the hoard to check."); the epigram; footer button "Open your Wordhoard" linking siteUrl.
   - Day 1 additionally opens with a 2-sentence welcome explaining wordhord onleac and what arrives daily.
   - Day >= 24: footer line "Volume I ends on Day 30. Ask Claude for Volume II."
   - Post-volume day: welcome-back line, 6 review words (pinned algorithm) with respells, definitions HIDDEN (recall first), link to the site.
   - Email HTML: max-width 560px centered, inline styles only, light rag-paper palette from the design brief (email clients are unreliable in dark mode), Georgia/serif stack (no webfonts), gold `#866626` for headwords, the double-rule plate motif via border styles, middle dots in respells. Plain-text alternative part listing the words and passage.
4. `RENDER_ONLY=1`: print exactly one line `SUBJECT: <subject>` to stdout, write the HTML to `out/day-<N>.html` (creating `out/` if absent), send nothing, never touch `.state.json`, exit 0. RENDER_ONLY must work on a machine with NO node_modules: import nodemailer lazily (`await import('nodemailer')`) inside the send path only.
5. Send via nodemailer exactly like morning-brief (smtp.gmail.com:587, STARTTLS, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, to = `MAIL_TO` default `GMAIL_USER`, from `Wordhoard <user>`). On success write `.state.json` `{ "lastSentDay": N, "sentAt": iso }` (only when DAY_OVERRIDE unset) and exit 0; on failure exit 1 with a clear log line.

`run.sh`: `#!/usr/bin/env bash`, cd to script dir, `git pull --quiet origin main || echo warn and continue`, `exec /usr/bin/node send.mjs`. Committed with the executable bit set (`chmod +x` before `git add`).
`wordhoard.service`: oneshot, `User=deploy`, `WorkingDirectory=/home/deploy/wordhoard`, `EnvironmentFile=/home/deploy/wordhoard/.env`, `ExecStart=/home/deploy/wordhoard/run.sh`, stdout/stderr appended to `/home/deploy/wordhoard/wordhoard.log`, `After=network-online.target` + `Wants=network-online.target`.
`wordhoard.timer`: `OnCalendar=*-*-* 06:45:00 America/Guyana`, `Persistent=true`, `WantedBy=timers.target`. (06:45, deliberately its own slot before the 07:00 Morning Brief.)

## Deliverable D: `validate.mjs` (test-writer, blind: write from THIS SPEC ONLY; do not read other executors' files while writing)

Plain Node ESM script, zero deps, run as `node validate.mjs` from the repo root. Checks print `ok V<n>` / `FAIL V<n>: detail` (V5 word-inclusion misses print as `WARN` and do not fail the run). Exit 0 iff zero FAILs.

- V1 three content part files exist, parse, and contain exactly 10 days each covering 1-10, 11-20, 21-30.
- V2 merged `lexicon.json` exists, parses, has version 1, volume 1, title "Wordhoard", startDate `2026-08-17`, siteUrl exactly `https://leandrejack-afk.github.io/wordhoard/`, and exactly 30 contiguous days 1..30.
- V3 every day has exactly 3 words matching the pinned curriculum table (embed the table of BARE headwords in the validator), in order F, D, FL. For the nine pos-pinned words (articulate adjective, demur verb, countenance noun, initiate verb, sway verb, nuance noun, umbrage noun, singular adjective, consummate adjective) assert the `pos` field equals the pinned value.
- V4 90 unique word ids; every Word field present and non-empty per the data contract: all three example registers, 3 to 5 collocations, at least 2 nearSynonyms each with a non-empty distinction, registerNote, tier order exactly foundation/distinction/flourish within each day, ipa wrapped in slashes, respell contains at least one CAPS run; respell must contain `·` ONLY if the word is polysyllabic, and monosyllabic respells (sway, wry, droll, hone, vexed if respelled as one syllable) are the word in CAPS without a separator. Implement the syllable check leniently: require `·` only when respell length > 6; never fail a respell that lacks `·` but is fully uppercase.
- V5 passage text 55 to 110 words, first person (contains "I " or "my " case-insensitively), setting + deliveryCue + title non-empty; for each of the day's 3 words, the passage contains the word's first 5 letters (first 4 for shorter words) case-insensitively (WARN only).
- V6 epigram non-empty, <= 140 chars.
- V7 dash scan: EVERY tracked text file in the repo (content jsons, lexicon.json, index.html, send.mjs, email.mjs, build.mjs, run.sh, wordhoard.service, wordhoard.timer, package.json, README.md, validate.mjs itself) contains none of: `—`, `–` (the literal characters), `&mdash;`, `&ndash;`, `&#8212;`, `&#8211;`. Skip the `specs/` directory and `.git/`. Reference the banned characters in your own source via escapes only.
- V8 `index.html`: exists; contains `fetch('lexicon.json')` or `fetch("lexicon.json")`; contains `speechSynthesis`; contains no `<script src=` referencing an external host; contains `prefers-reduced-motion`, `prefers-color-scheme`, and `wh.mastered`.
- V9 sender dry-runs (spawn `node send.mjs` with env `RENDER_ONLY=1` + `DAY_OVERRIDE=<n>`; subject asserted against the stdout `SUBJECT:` line, body content asserted against `out/day-<n>.html`): day 1 body contains all three day-1 words and the day-1 passage title and NO review section; day 8 body contains exactly the review words the pinned position-indexed formula selects from days 7, 5, 1 (compute expected from lexicon.json inside the validator); day 22 body includes the formula's day-1 word (offset 21); day 24 body contains `Volume I ends on Day 30`; day 35 renders the post-volume email (subject contains `Review from the hoard`, body has the 6 formula-selected words and NO definitions for them), exit 0 in all cases.
- V10 `wordhoard.timer` contains `06:45:00 America/Guyana` and `Persistent=true`; `wordhoard.service` contains `User=deploy`, `EnvironmentFile=`, and `ExecStart=/home/deploy/wordhoard/run.sh`; `run.sh` starts with a shebang and its file mode has the owner-execute bit; `package.json` has nodemailer as its ONLY dependency.
- V11 secret hygiene: no tracked file other than README.md contains `GMAIL_APP_PASSWORD=` followed by 8+ alphanumeric characters; `.env` and `.state.json` do not exist in the repo listing (check the filesystem for `.env` at root and that `.gitignore` covers both).
- V12 the two pinned algorithm lines (the `guyanaToday` line and the `dayNumber` line) appear VERBATIM in both `index.html` and `send.mjs` (embed the exact strings in the validator).

## File ownership (no executor touches another's files)

| File | Owner |
|------|-------|
| content/days-01-10.json | content executor A1 |
| content/days-11-20.json | content executor A2 |
| content/days-21-30.json | content executor A3 |
| index.html | site executor B |
| send.mjs, email.mjs, run.sh, wordhoard.service, wordhoard.timer, package.json | sender executor C |
| validate.mjs | test-writer D |
| build.mjs, README.md, .gitignore, .nojekyll, specs/ | orchestrator |

`lexicon.json` is generated by `build.mjs` (orchestrator runs it), never hand-edited. Executors B, C, D develop against the data contract in this spec, not against real content (it may not exist yet when they start). Executor C may create a tiny throwaway fixture under `out/` for self-testing; `out/` is gitignored. No executor runs `git commit`.

## NOT in scope (Volume I)

Accounts or login; open/click tracking; audio file generation or server TTS; recording the user's voice; Anki/CSV export; custom domain; Volume II content; private hosting; sending to any address other than Leandre's; changing morning-brief in any way; Mac launchd anything (the Mac sleeps; VPS only); a Playwright script deliverable (the orchestrator drives the browser checks personally at Gate 2).

## Acceptance criteria (binary, Gate 2 walks these one by one)

- AC1 `npm install && node build.mjs && node validate.mjs` exits 0 with zero FAIL lines.
- AC2 The live site `https://leandrejack-afk.github.io/wordhoard/` returns HTTP 200 and renders Day 1 (theme "The art of speaking well") with all three words, verified in a real browser (Playwright), including on a 390px viewport.
- AC3 Unlock logic on the live site shows exactly the days where dayNumber <= today's Guyana day number, and the Hoard shows exactly 3x that many words (on ship day: Day 1, 3 words, teaser "29 days still sealed in Volume I").
- AC4 A real Day 1 email was delivered to leandre.jack@gmail.com with subject `Wordhoard · Day 1: The art of speaking well`, confirmed by finding the message via Gmail (external verification), not by SMTP exit code alone.
- AC5 On the VPS, `systemctl list-timers` shows `wordhoard.timer` active with next elapse at the next 06:45 -04 occurrence, and the service ran green at least once (log shows a sent or already-sent line).
- AC6 Re-running the sender after a successful send exits 0 with "already sent" and does NOT send a second email (log line + Gmail count for the day stays 1).
- AC7 `DAY_OVERRIDE=35 RENDER_ONLY=1 node send.mjs` produces the post-volume review email, exit 0, without touching `.state.json`.
- AC8 `git ls-files` contains no `.env` and no `.state.json`; the GitHub repo page shows no secret.
- AC9 Validator V7 (dash scan over every tracked file) is green.
- AC10 The Practice view functions on the live site: both drill directions reveal answers and "Got it" persists a `wh.mastered` entry across reload (verified in Playwright).
- AC11 Dictionary verification: opus-reviewer checks ALL 90 `pos` values and ALL 90 definitions against Merriam-Webster or Wiktionary (and etymonline for every etymology that makes a specific historical claim), and every mismatch found is corrected before the run is green. The two heteronyms (articulate, consummate) get their respell/ipa hand-checked for the adjective pronunciations (ar·TIK·yuh·lit, KON·suh·mit).

## Verification commands (Gate 1, orchestrator runs personally)

```
cd ~/projects/wordhoard
npm install
node build.mjs
node validate.mjs
DAY_OVERRIDE=1 RENDER_ONLY=1 node send.mjs && open out/day-1.html   # visual check
DAY_OVERRIDE=8 RENDER_ONLY=1 node send.mjs
DAY_OVERRIDE=35 RENDER_ONLY=1 node send.mjs
python3 -m http.server 8123 &   # then Playwright against http://localhost:8123/ incl. 390px viewport
command grep -rn -e "$(printf '\xe2\x80\x94')" -e "$(printf '\xe2\x80\x93')" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=specs --exclude-dir=out ; # expected: no output, exit 1
```

Deploy sequence (orchestrator, in this order to kill the double-send race): create GitHub repo, push, enable Pages, verify live in a browser. Then on the VPS: clone to `/home/deploy/wordhoard` owned by deploy, `npm install --omit=dev`, server-side `cp /home/deploy/morning-brief/.env /home/deploy/wordhoard/.env` + `chown deploy` + `chmod 600` (values never printed), `chmod +x run.sh` if the bit was lost, install both unit files, `systemctl daemon-reload`, then FIRST `systemctl start wordhoard.service` (the manual Day 1 send; always via systemctl, never bare node, so systemd serializes it against any timer job), verify the email landed via Gmail, and ONLY THEN `systemctl enable --now wordhoard.timer`. If the timer's first fire happens the same day, the state file makes it a no-op (which exercises AC6).
