# Wordhoard

*wordhord onleac*: Old English, "he unlocked his word-hoard." It is what the Beowulf poet says in the instant before a hero speaks.

A private daily practice for speaking with learned words. Every morning at 06:45 (America/Guyana), just ahead of the Morning Brief, an email arrives with three words: one foundation word, one word of distinction, one flourish. Each comes with pronunciation, nuance, examples in three registers, and a short first-person passage that uses all three, written to be read aloud. Prior words return on a spaced schedule (1, 3, 7, and 21 days later) as recall prompts.

Everything ever delivered lives in the hoard: a permanent site where words unlock day by day.

- Site: https://leandrejack-afk.github.io/wordhoard/ (GitHub Pages, this repo's root)
- Daily sender: `send.mjs` on the GoalEdge VPS at `/home/deploy/wordhoard`, fired by `wordhoard.timer` (systemd, 06:45 America/Guyana, `Persistent=true`)
- Content: `content/days-*.json`, merged by `node build.mjs` into `lexicon.json`
- Checks: `node validate.mjs`

## How a day works

1. The timer fires `run.sh`: `git pull` (a failure is tolerated, never silent), then `node send.mjs`.
2. `send.mjs` computes the day number from `startDate` in America/Guyana, composes the email from `lexicon.json`, sends via Gmail SMTP (port 587; Hetzner blocks 465/25), and records the day in `.state.json` so a re-fire never double-sends.
   The day number follows the calendar: if the VPS misses a day, that lesson is not re-emailed later, but it is always browsable on the site.
3. After Day 30 the volume is complete and the daily email switches to review mode: six recall words drawn deterministically from the whole hoard. It never goes silent.

## Operating notes

- `.env` on the VPS holds `GMAIL_USER` and `GMAIL_APP_PASSWORD` (same keys as morning-brief). Never committed.
- Test render without sending: `DAY_OVERRIDE=8 RENDER_ONLY=1 node send.mjs` writes `out/day-8.html`.
- Volume II: append new days to the content files (or add a part file to `build.mjs`), extend the curriculum table in `specs/`, run build + validate, push. The VPS pulls before every send.
- No paid dependencies. Zero monthly cost.
