# Wordhoard

*wordhord onleac*: Old English, "he unlocked his word-hoard." It is what the Beowulf poet says in the instant before a hero speaks.

A private daily practice for speaking with learned words. Every morning at 06:45 (America/Guyana), just ahead of the Morning Brief, an email arrives with three words: one foundation word, one word of distinction, one flourish. Each comes with pronunciation, nuance, examples in three registers, and a short first-person passage that uses all three, written to be read aloud. Prior words return on a spaced schedule (1, 3, 7, and 21 days later) as recall prompts.

Everything ever delivered lives in the hoard: a permanent site where words unlock day by day.

- Site: https://leandrejack-afk.github.io/wordhoard/ (GitHub Pages, this repo's root)
- Daily sender: `send.mjs` on the GoalEdge VPS at `/home/deploy/wordhoard`, fired by `wordhoard.timer` (systemd, 06:45 America/Guyana, `Persistent=true`)
- Content: `content/days-*.json`, merged by `node build.mjs` into `lexicon.json`
- Audio: `audio/<voice>/w/<word>.mp3` and `audio/<voice>/p/<day>.mp3`, recorded by `node audio.mjs`
- Checks: `node validate.mjs`

## The voice

Every speak button plays a recorded clip; the device's own speech engine is only a fallback for a clip that will not load. The voice is Kokoro's Heart (`af_heart`), the same voice as the Claude readouts. `audio/voices.json` can list more: with two or more, the About page shows a picker and keeps the choice on the device under `wh.voice`. Any new voice must pass `tools/listen.py` first. Bella (`af_bella`) and Fenrir (`am_fenrir`) were recorded and dropped on 2026-10-10 because they mispronounced headwords in every spelling tried (Bella: "commend" as "command", "demur" as "de-MAR"; Fenrir: "assiduous" heard as "I said to us").

Each headword is spoken from its IPA in the lexicon rather than the voice's own guess, so the clip says what the page prints: the adjective "articulate" ends in -lit, never the verb's -late. Passages carry the same pronunciation for the day's three words. `audio-plan.mjs` turns the IPA into Kokoro's phonemes and is shared by the recorder and the validator; its `KOKORO_PHONEMES` holds the rare word that needs a nudge (denouement). Words ending -ate, -ize and -ite need the secondary stress on the last syllable in the IPA, as the dictionary gives it, or Kokoro reduces the ending.

- Record: `node audio.mjs` on the Mac (uses the Kokoro venv at `~/.claude/tts/venv`; free, local). It records only what is missing or changed, tracked by hash in `audio/manifest.json`.
- Check: `node validate.mjs` fails while any clip is missing or was recorded from older text or IPA.
- Listen back (optional): `~/.claude/tts/venv/bin/python tools/listen.py` transcribes every clip with whisper and compares each headword's sounds with its IPA through a phoneme recogniser, then lists anything doubtful.
- Deepgram's Flux and Aura-2 voices were tried on 2026-10-10 and dropped: they read whole passages well but garbled single words.

## How a day works

1. The timer fires `run.sh`: `git pull` (a failure is tolerated, never silent), then `node send.mjs`.
2. `send.mjs` computes the day number from `startDate` in America/Guyana, composes the email from `lexicon.json`, sends via Gmail SMTP (port 587; Hetzner blocks 465/25), and records the day in `.state.json` so a re-fire never double-sends.
   The day number follows the calendar: if the VPS misses a day, that lesson is not re-emailed later, but it is always browsable on the site.
3. After Day 30 the volume is complete and the daily email switches to review mode: six recall words drawn deterministically from the whole hoard. It never goes silent.

## Operating notes

- `.env` on the VPS holds `GMAIL_USER` and `GMAIL_APP_PASSWORD` (same keys as morning-brief). Never committed.
- Test render without sending: `DAY_OVERRIDE=8 RENDER_ONLY=1 node send.mjs` writes `out/day-8.html`.
- On the VPS, always fire a real send with `systemctl start wordhoard.service`, never bare `node send.mjs`. There is no file lock; systemd's oneshot serialization is the lock.
- `npm audit` flags nodemailer 6. The advisories sit in surfaces this sender never calls (reviewed 2026-08-17); do not force-upgrade past ^6, the validator pins the range.
- Volume II: append new days to the content files (or add a part file to `build.mjs`), extend the curriculum table in `specs/` AND the embedded curriculum in `validate.mjs` (it hard-asserts 30 days), run build, then `node audio.mjs`, then validate, push. The VPS pulls before every send.
- No paid dependencies. Zero monthly cost.
