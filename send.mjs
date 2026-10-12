/**
 * Wordhoard daily sender.
 *
 * Reads lexicon.json beside this file, works out today's day number in
 * America/Guyana, composes the lesson with email.mjs and sends it over Gmail
 * SMTP. Runs on the GoalEdge VPS under systemd at 06:45 America/Guyana.
 *
 * Env (from .env):
 *   GMAIL_USER          gmail address, also the SMTP login
 *   GMAIL_APP_PASSWORD  16 character Google App Password
 *   MAIL_TO             recipient (defaults to GMAIL_USER)
 *   DAY_OVERRIDE        render a specific day; .state.json is left untouched
 *   RENDER_ONLY         write out/day-N.html and print the subject, send nothing
 *
 * stdout carries one contract only: the "SUBJECT: ..." line under RENDER_ONLY.
 * Every operator log goes to stderr, which systemd folds into the same log file.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmail } from "./email.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const here = (name) => path.join(__dirname, name);

function log(msg) {
  console.error(`[wordhoard] ${new Date().toISOString()} ${msg}`);
}

function fail(msg) {
  console.error(`[wordhoard] ${new Date().toISOString()} ERROR: ${msg}`);
  process.exit(1);
}

// A value that is present but not "1" still counts as on: the safe direction of
// a typo here is rendering, never an unintended send.
const renderOnly = Boolean(process.env.RENDER_ONLY);
const overridden = Boolean(process.env.DAY_OVERRIDE);

let lexicon;
try {
  lexicon = JSON.parse(await readFile(here("lexicon.json"), "utf8"));
} catch (err) {
  fail(`Could not read lexicon.json: ${err.message}`);
}

const startDate = lexicon.startDate;
if (!startDate) fail("lexicon.json has no startDate.");

// The next two lines are pinned by spec 001 character for character and are
// duplicated in index.html so the site and the email can never disagree.
// Do not reformat them.
const guyanaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana' }).format(new Date());
const dayNumber = Math.round((Date.parse(guyanaToday + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) + 1;
const day = process.env.DAY_OVERRIDE ? Number(process.env.DAY_OVERRIDE) : dayNumber;

if (!Number.isInteger(day)) {
  fail(`DAY_OVERRIDE must be a whole number, got "${process.env.DAY_OVERRIDE}".`);
}
if (day < 1) {
  log(`before start (${guyanaToday} is earlier than ${startDate}), nothing to send`);
  process.exit(0);
}

// The state guard belongs to real sends only. Under DAY_OVERRIDE or
// RENDER_ONLY the state file is neither read nor written.
if (!overridden && !renderOnly) {
  try {
    const state = JSON.parse(await readFile(here(".state.json"), "utf8"));
    if (Number(state.lastSentDay) >= day) {
      log(`already sent day ${day}, exiting without sending`);
      process.exit(0);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      log(`WARN: .state.json unreadable (${err.message}), treating today as unsent`);
    }
  }
}

let subject;
let html;
let text;
// The email's listen links point at the default recorded voice.
let voice = "heart";
try {
  const voices = JSON.parse(await readFile(here("audio/voices.json"), "utf8"));
  if (voices && voices.default) voice = voices.default;
} catch (err) {
  log(`WARN: audio/voices.json unreadable (${err.message}), listen links use the ${voice} voice`);
}

try {
  ({ subject, html, text } = buildEmail(lexicon, day, { voice }));
} catch (err) {
  fail(`Could not compose day ${day}: ${err.message}`);
}

if (renderOnly) {
  const outPath = here(path.join("out", `day-${day}.html`));
  try {
    await mkdir(here("out"), { recursive: true });
    await writeFile(outPath, html);
  } catch (err) {
    fail(`Could not write ${outPath}: ${err.message}`);
  }
  console.log(`SUBJECT: ${subject}`);
  process.exit(0);
}

const { GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  fail("Missing GMAIL_USER or GMAIL_APP_PASSWORD (set them in .env).");
}
const to = MAIL_TO || GMAIL_USER;
const from = `Wordhoard <${GMAIL_USER}>`;

// nodemailer is imported here and nowhere else so that RENDER_ONLY runs on a
// machine with no node_modules.
const { default: nodemailer } = await import("nodemailer");

const transporter = nodemailer.createTransport({
  // Hetzner blocks outbound 465 and 25; 587 (STARTTLS) is open.
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  connectionTimeout: 20000,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

try {
  await transporter.verify();
  const info = await transporter.sendMail({ from, to, subject, html, text });
  log(`sent day ${day} ${info.messageId} -> ${to} | ${subject}`);
} catch (err) {
  fail(`SMTP send failed on day ${day}: ${err.message}`);
}

if (!overridden) {
  try {
    await writeFile(
      here(".state.json"),
      JSON.stringify({ lastSentDay: day, sentAt: new Date().toISOString() }, null, 2) + "\n",
    );
  } catch (err) {
    log(`WARN: sent day ${day} but could not write .state.json (${err.message})`);
  }
}

process.exit(0);
