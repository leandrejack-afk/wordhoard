/**
 * Wordhoard email composition: subject line, HTML plate, plain text part.
 *
 * Pure and dependency free. send.mjs owns transport, state and the day number.
 * The plate is light in every client: email clients handle dark mode badly, so
 * the light rag paper half of the design brief is the only one used here, and
 * every style is inline. Gold is reserved for headwords.
 */

const P = {
  page: "#E7E5DC",
  ground: "#F5F4EF",
  ink: "#1C2130",
  gold: "#866626",
  slate: "#5A6274",
  rule: "#C9B784",
};

const FONT = "Georgia,'Times New Roman',Times,serif";
const RECALL_LINE = "Recall its meaning, then use it once today. Tap the hoard to check.";
const VOLUME_END_LINE = "Volume I ends on Day 30. Ask Claude for Volume II.";
const VOLUME_WARNING_FROM = 24;
const REVIEW_OFFSETS = [1, 3, 7, 21];

/**
 * Spaced review for a content day (2 to 30). One word per surviving prior day,
 * in offset order, position indexed so the rotation covers every word.
 */
export function reviewForDay(days, n) {
  const picks = [];
  REVIEW_OFFSETS.forEach((offset, i) => {
    const p = n - offset;
    if (p < 1) return;
    const prior = days.find((d) => d.day === p);
    if (!prior || !prior.words || !prior.words.length) return;
    picks.push({ day: p, word: prior.words[(p + i) % 3] });
  });
  return picks;
}

/** Six words drawn from the whole volume for a post volume day (n > 30). */
export function postVolumeReview(days, n) {
  const picks = [];
  const seen = new Set();
  for (let k = 0; k < 6; k++) {
    const dayIndex = ((n * 7 + k * 11) % 30) + 1;
    const source = days.find((d) => d.day === dayIndex);
    if (!source || !source.words || !source.words.length) continue;
    const word = source.words[(n + k) % 3];
    if (seen.has(word.id)) continue;
    seen.add(word.id);
    picks.push({ day: dayIndex, word });
  }
  return picks;
}

export function subjectFor(days, n) {
  const entry = days.find((d) => d.day === n);
  return entry
    ? `Wordhoard · Day ${n}: ${entry.theme}`
    : `Wordhoard · Day ${n}: Review from the hoard`;
}

/**
 * Where the recorded clips live on the site, for the email's listen links.
 * Each word has w/<id>.mp3 (the word) and l/<id>.mp3 (its line to borrow).
 */
export function audioBase(lexicon, voice) {
  return new URL(`audio/${voice || "heart"}/`, lexicon.siteUrl).href;
}

export function buildEmail(lexicon, n, options = {}) {
  const audio = audioBase(lexicon, options.voice);
  const days = lexicon.days || [];
  const lastDay = days.reduce((max, d) => Math.max(max, d.day), 0);
  if (lastDay < 1) {
    throw new Error("lexicon.json has no days; refusing to compose an empty email");
  }
  const entry = days.find((d) => d.day === n);
  if (!entry && n <= lastDay) {
    throw new Error(`lexicon.json has no day ${n}`);
  }
  return entry ? contentEmail(lexicon, entry, n, audio) : reviewEmail(lexicon, n, audio);
}

/* ---------- HTML pieces ---------- */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gap(px) {
  return `<div style="height:${px}px;line-height:${px}px;font-size:1px;">&nbsp;</div>`;
}

function rule(color) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="height:1px;line-height:1px;font-size:1px;background:${color || P.rule};">&nbsp;</td></tr></table>`;
}

/** The dictionary plate motif: two hairlines 3px apart. */
function doubleRule() {
  return `${rule()}<div style="height:3px;line-height:3px;font-size:1px;">&nbsp;</div>${rule()}`;
}

function eyebrow(text, color) {
  return `<div style="font-family:${FONT};font-size:10px;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;color:${color || P.slate};">${esc(text)}</div>`;
}

function para(text, size, color, extra) {
  return `<p style="font-family:${FONT};font-size:${size}px;line-height:1.62;color:${color};margin:0;${extra || ""}">${esc(text)}</p>`;
}

/** Respell with the stressed syllable (the CAPS run) carried in bold ink. */
function respellHtml(respell) {
  const dot = `<span style="color:${P.rule};">&nbsp;·&nbsp;</span>`;
  return String(respell || "")
    .split("·")
    .map((part) => {
      const trimmed = part.trim();
      const stressed = /[A-Z]/.test(trimmed) && trimmed === trimmed.toUpperCase();
      return stressed
        ? `<span style="color:${P.ink};font-weight:bold;letter-spacing:.04em;">${esc(trimmed)}</span>`
        : `<span style="color:${P.slate};">${esc(trimmed)}</span>`;
    })
    .join(dot);
}

function respellLine(respell) {
  return `<div style="font-family:${FONT};font-size:14px;line-height:1.4;">${respellHtml(respell)}</div>`;
}

function clipLinks(audio, word) {
  const links = [{ label: "Hear it", href: `${audio}w/${encodeURIComponent(word.id)}.mp3` }];
  if (word.line && word.line.text) {
    links.push({ label: "Hear it in a sentence", href: `${audio}l/${encodeURIComponent(word.id)}.mp3` });
  }
  return links;
}

/** One tap plays the recorded clip in the phone's browser. */
function listenLinks(audio, word) {
  const sep = `<span style="color:${P.rule};">&nbsp; · &nbsp;</span>`;
  const html = clipLinks(audio, word)
    .map((l) => `<a href="${esc(l.href)}" style="color:${P.ink};text-decoration:underline;text-decoration-color:${P.rule};">${esc(l.label)}</a>`)
    .join(sep);
  return `<div style="font-family:${FONT};font-size:13px;line-height:1.5;letter-spacing:.02em;">${html}</div>`;
}

/** The line to borrow, with its reusable phrase underlined. */
function lineHtml(line) {
  const text = String(line.text || "");
  const at = line.borrow ? text.indexOf(line.borrow) : -1;
  const body = at < 0
    ? esc(text)
    : `${esc(text.slice(0, at))}<span style="text-decoration:underline;text-decoration-color:${P.gold};">${esc(line.borrow)}</span>${esc(text.slice(at + line.borrow.length))}`;
  return body;
}

function marginalia(label, text, italic) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="width:2px;background:${P.rule};font-size:1px;line-height:1px;">&nbsp;</td><td style="padding-left:12px;">${eyebrow(label)}${gap(3)}<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${P.ink};${italic ? "font-style:italic;" : ""}">${esc(text)}</div></td></tr></table>`;
}

function wordCard(word, audio) {
  const blocks = [
    doubleRule(),
    gap(15),
    eyebrow(`${word.tier || ""} · ${word.pos || ""}`),
    gap(7),
    `<div style="font-family:${FONT};font-size:27px;line-height:1.15;color:${P.gold};">${esc(word.word)}</div>`,
    gap(6),
    respellLine(word.respell),
    gap(6),
    listenLinks(audio, word),
    gap(13),
    para(word.definition, 16, P.ink),
  ];
  if (word.nuance) {
    blocks.push(gap(9), para(word.nuance, 14, P.slate));
  }
  if (word.line && word.line.text) {
    blocks.push(
      gap(14),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="width:2px;background:${P.rule};font-size:1px;line-height:1px;">&nbsp;</td><td style="padding-left:12px;">${eyebrow("A line to borrow")}${gap(3)}<div style="font-family:${FONT};font-size:13px;line-height:1.5;font-style:italic;color:${P.slate};">${esc(word.line.setting)}</div>${gap(3)}<div style="font-family:${FONT};font-size:16px;line-height:1.6;font-style:italic;color:${P.ink};">${lineHtml(word.line)}</div></td></tr></table>`,
    );
  }
  const example = word.examples && word.examples.professional;
  if (example) {
    blocks.push(gap(14), marginalia("Say it", example, true));
  }
  if (word.registerNote) {
    blocks.push(
      gap(12),
      `<div style="font-family:${FONT};font-size:13px;line-height:1.55;color:${P.slate};"><span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;">Register</span>&nbsp; ${esc(word.registerNote)}</div>`,
    );
  }
  blocks.push(gap(26));
  return blocks.join("");
}

function passageBlock(passage) {
  const text = String(passage.text || "");
  const initial = text.slice(0, 1);
  const rest = text.slice(1);
  return [
    doubleRule(),
    gap(15),
    eyebrow("Read this aloud"),
    gap(8),
    `<div style="font-family:${FONT};font-size:19px;line-height:1.3;color:${P.ink};">${esc(passage.title)}</div>`,
    gap(4),
    `<div style="font-family:${FONT};font-size:13.5px;line-height:1.5;font-style:italic;color:${P.slate};">${esc(passage.setting)}</div>`,
    gap(13),
    `<p style="font-family:${FONT};font-size:17px;line-height:1.75;color:${P.ink};margin:0;"><span style="font-size:28px;line-height:1;">${esc(initial)}</span>${esc(rest)}</p>`,
    gap(15),
    marginalia("Delivery", passage.deliveryCue, true),
    gap(26),
  ].join("");
}

function reviewEntry(pick, audio) {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="padding:0;">`,
    `<div style="font-family:${FONT};font-size:19px;line-height:1.25;color:${P.gold};">${esc(pick.word.word)}</div>`,
    gap(4),
    respellLine(pick.word.respell),
    gap(4),
    listenLinks(audio, pick.word),
    `</td><td align="right" valign="top" style="padding:0;font-family:${FONT};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${P.slate};white-space:nowrap;">Day ${pick.day}</td></tr></table>`,
    gap(18),
  ].join("");
}

function reviewSection(label, picks, audio, listenHref) {
  if (!picks.length) return "";
  return [
    doubleRule(),
    gap(15),
    eyebrow(label),
    gap(14),
    listenHref
      ? `<div style="font-family:${FONT};font-size:14px;line-height:1.5;"><a href="${esc(listenHref)}" style="color:${P.ink};text-decoration:underline;text-decoration-color:${P.gold};">Listen to all ${picks.length === 6 ? "six" : picks.length}, each word and then its line</a></div>${gap(16)}`
      : "",
    picks.map((pick) => reviewEntry(pick, audio)).join(""),
    para(RECALL_LINE, 13.5, P.slate, "font-style:italic;"),
    gap(26),
  ].join("");
}

function epigramBlock(epigram) {
  if (!epigram) return "";
  return [
    doubleRule(),
    gap(20),
    `<div align="center" style="font-family:${FONT};font-size:17px;line-height:1.6;font-style:italic;color:${P.ink};text-align:center;">${esc(epigram)}</div>`,
    gap(22),
  ].join("");
}

function footer(siteUrl, n) {
  const url = esc(siteUrl);
  const blocks = [
    doubleRule(),
    gap(24),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;"><tr><td align="center" style="background:${P.ink};border-radius:2px;"><a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;letter-spacing:.06em;color:${P.ground};text-decoration:none;">Open your Wordhoard</a></td></tr></table>`,
    gap(18),
  ];
  if (n >= VOLUME_WARNING_FROM) {
    blocks.push(
      `<div align="center" style="font-family:${FONT};font-size:13px;line-height:1.55;color:${P.slate};text-align:center;">${esc(VOLUME_END_LINE)}</div>`,
      gap(10),
    );
  }
  blocks.push(
    `<div align="center" style="font-family:${FONT};font-size:11px;line-height:1.6;letter-spacing:.1em;text-transform:uppercase;color:${P.slate};text-align:center;">Wordhoard · Volume I · 06:45 each morning</div>`,
    gap(6),
  );
  return blocks.join("");
}

function masthead(eyebrowText) {
  return [
    gap(4),
    `<div align="center" style="font-family:${FONT};font-size:23px;line-height:1.1;letter-spacing:.22em;color:${P.ink};text-align:center;"><span style="color:${P.rule};">·</span>&nbsp; WORDHOARD &nbsp;<span style="color:${P.rule};">·</span></div>`,
    gap(10),
    `<div align="center" style="font-family:${FONT};font-size:10px;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;color:${P.slate};text-align:center;">${esc(eyebrowText)}</div>`,
    gap(22),
  ].join("");
}

function page(subject, preheader, inner) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${P.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${P.page};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${P.page};border-collapse:collapse;">
<tr><td align="center" style="padding:26px 10px 34px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${P.ground};border:1px solid ${P.rule};border-collapse:collapse;">
<tr><td style="padding:26px 28px 22px 28px;">
${inner}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/* ---------- whole emails ---------- */

function contentEmail(lexicon, entry, n, audio) {
  const days = lexicon.days || [];
  const subject = subjectFor(days, n);
  const inner = [
    masthead(`Day ${n} of 30`),
    n === 1 ? welcomeBlock() : "",
    eyebrow("Today"),
    gap(7),
    `<div style="font-family:${FONT};font-size:21px;line-height:1.3;color:${P.ink};">${esc(entry.theme)}</div>`,
    gap(7),
    para(entry.themeLine, 15, P.slate, "font-style:italic;"),
    gap(26),
    (entry.words || []).map((word) => wordCard(word, audio)).join(""),
    entry.passage ? passageBlock(entry.passage) : "",
    reviewSection("From the hoard", reviewForDay(days, n), audio),
    epigramBlock(entry.epigram),
    footer(lexicon.siteUrl, n),
  ].join("");

  return {
    subject,
    html: page(subject, entry.themeLine || entry.theme, inner),
    text: contentText(lexicon, entry, n, audio),
  };
}

const WELCOME_TEXT =
  "Wordhord onleac is Old English for “he unlocked his word-hoard”, the line the Beowulf poet uses in the moment before a hero speaks. Every morning at 06:45 you get three words with their pronunciations, a short passage written to be read aloud, and a quiet review of what came before.";

function welcomeBlock() {
  const html = esc(WELCOME_TEXT).replace(
    "Wordhord onleac",
    "<em>Wordhord onleac</em>",
  );
  return [
    doubleRule(),
    gap(15),
    eyebrow("Welcome"),
    gap(8),
    `<p style="font-family:${FONT};font-size:15.5px;line-height:1.62;color:${P.ink};margin:0;">${html}</p>`,
    gap(26),
  ].join("");
}

function reviewEmail(lexicon, n, audio) {
  const days = lexicon.days || [];
  const subject = subjectFor(days, n);
  const picks = postVolumeReview(days, n);
  const welcome =
    "Volume I is complete and all 90 words are yours. Here are six from the hoard to summon back this morning, definitions withheld on purpose.";
  const inner = [
    masthead(`Day ${n} · Volume I complete`),
    doubleRule(),
    gap(15),
    eyebrow("Welcome back"),
    gap(8),
    para(welcome, 15.5, P.ink),
    gap(26),
    reviewSection("From the hoard", picks, audio, `${lexicon.siteUrl}#listen`),
    footer(lexicon.siteUrl, n),
  ].join("");

  return {
    subject,
    html: page(subject, "Six from the hoard to summon back.", inner),
    text: reviewText(lexicon, picks, n, audio),
  };
}

/* ---------- plain text part ---------- */

function wrapText(text, width) {
  const out = [];
  let line = "";
  for (const wordPart of String(text || "").split(/\s+/)) {
    if (!wordPart) continue;
    if (line && line.length + wordPart.length + 1 > width) {
      out.push(line);
      line = wordPart;
    } else {
      line = line ? `${line} ${wordPart}` : wordPart;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}

function clipLinesText(audio, word) {
  return clipLinks(audio, word).map((l) => `  ${l.label}: ${l.href}`);
}

function contentText(lexicon, entry, n, audio) {
  const days = lexicon.days || [];
  const lines = [`WORDHOARD · Day ${n} of 30`, entry.theme, ""];
  if (n === 1) {
    lines.push(wrapText(WELCOME_TEXT, 72), "");
  }
  if (entry.themeLine) lines.push(wrapText(entry.themeLine, 72), "");

  (entry.words || []).forEach((word, i) => {
    lines.push(`${i + 1}. ${String(word.word).toUpperCase()}  (${word.respell})  · ${word.tier}, ${word.pos}`);
    lines.push(...clipLinesText(audio, word));
    lines.push(wrapText(word.definition, 72));
    if (word.nuance) lines.push(wrapText(word.nuance, 72));
    if (word.line && word.line.text) lines.push(`A line to borrow: ${wrapText(word.line.text, 72)}`);
    const example = word.examples && word.examples.professional;
    if (example) lines.push(`Say it: ${wrapText(example, 72)}`);
    if (word.registerNote) lines.push(`Register: ${wrapText(word.registerNote, 72)}`);
    lines.push("");
  });

  if (entry.passage) {
    lines.push(`READ THIS ALOUD · ${entry.passage.title}`);
    if (entry.passage.setting) lines.push(entry.passage.setting);
    lines.push("", wrapText(entry.passage.text, 72), "");
    if (entry.passage.deliveryCue) lines.push(`Delivery: ${wrapText(entry.passage.deliveryCue, 72)}`, "");
  }

  const picks = reviewForDay(days, n);
  if (picks.length) {
    lines.push("FROM THE HOARD");
    picks.forEach((pick) => {
      lines.push(`- ${pick.word.word}  (${pick.word.respell})  · Day ${pick.day}`);
      lines.push(...clipLinesText(audio, pick.word));
    });
    lines.push(wrapText(RECALL_LINE, 72), "");
  }

  if (entry.epigram) lines.push(wrapText(entry.epigram, 72), "");
  lines.push(...footerText(lexicon.siteUrl, n));
  return lines.join("\n");
}

function reviewText(lexicon, picks, n, audio) {
  const lines = [
    `WORDHOARD · Day ${n} · Volume I complete`,
    "",
    wrapText(
      "Volume I is complete and all 90 words are yours. Here are six from the hoard to summon back this morning, definitions withheld on purpose.",
      72,
    ),
    "",
    "FROM THE HOARD",
    `Listen to all six: ${lexicon.siteUrl}#listen`,
  ];
  picks.forEach((pick) => {
    lines.push(`- ${pick.word.word}  (${pick.word.respell})  · Day ${pick.day}`);
    lines.push(...clipLinesText(audio, pick.word));
  });
  lines.push(wrapText(RECALL_LINE, 72), "");
  lines.push(...footerText(lexicon.siteUrl, n));
  return lines.join("\n");
}

function footerText(siteUrl, n) {
  const lines = [`Open your Wordhoard: ${siteUrl}`];
  if (n >= VOLUME_WARNING_FROM) lines.push(VOLUME_END_LINE);
  return lines;
}
