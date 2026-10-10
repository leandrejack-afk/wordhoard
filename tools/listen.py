#!/usr/bin/env python3
"""Listens back to the recorded clips and reports any that sound wrong.

Two local checks:
  1. whisper (whisper-cli with large-v3-turbo) transcribes every clip. A
     headword clip should come back as its word and a passage as its text.
  2. A phoneme recogniser (wav2vec2 trained on espeak IPA) writes down the
     sounds in each headword clip, which are scored against the lexicon's
     IPA. This catches a clip that says the wrong variant, such as the verb
     "-late" for the adjective "articulate", which whisper spells the same.

Run from the repo root with the readout venv, which has torch and transformers:
  ~/.claude/tts/venv/bin/python tools/listen.py [voice ...] [--out report.json]
The first run downloads the recogniser (about 1.2 GB) to the Hugging Face cache.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WHISPER_MODEL = Path.home() / ".cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin"
PHONEME_MODEL = "facebook/wav2vec2-lv-60-espeak-cv-ft"
CHUNK_SECONDS = 28.0  # whisper.cpp drops and loops text across its 30 s windows

UNITS = ["tʃ", "dʒ", "eɪ", "aɪ", "aʊ", "oʊ", "ɔɪ", "əʊ"]
TOKEN_MAP = {
    "ɚ": ["ə", "ɹ"], "ɝ": ["ə", "ɹ"], "ɜ": ["ə"], "r": ["ɹ"], "g": ["ɡ"], "ɐ": ["ə"],
    "ʌ": ["ə"], "ᵻ": ["ɪ"], "ɾ": ["t"], "ʔ": ["t"], "ɫ": ["l"], "ɔ": ["ɑ"], "ɒ": ["ɑ"],
    "a": ["ɑ"], "o": ["oʊ"], "e": ["eɪ"], "əʊ": ["oʊ"],
}
DROP = set("ˈˌː./ ʲʰˑ̩˞-")


def phone_units(ipa):
    """IPA string to comparable units: stress, length and syllable marks gone,
    near-identical sounds merged so the recogniser's accent noise does not count."""
    s = "".join(ch for ch in ipa if ch not in DROP).replace("̃", "n")
    out, i = [], 0
    while i < len(s):
        pair = s[i:i + 2]
        tok = pair if pair in UNITS else s[i]
        i += len(tok)
        out.extend(TOKEN_MAP.get(tok, [tok]))
    return out


def distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def words_of(text):
    return re.findall(r"[a-z0-9']+", text.lower().replace("’", "'"))


def to_wav16(src, dst):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
                    "-ar", "16000", "-ac", "1", str(dst)], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def split_at_pauses(wav, workdir):
    """Cut a long clip at its pauses into pieces under CHUNK_SECONDS."""
    total = duration(wav)
    if total <= CHUNK_SECONDS:
        return [wav]
    det = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af",
                          "silencedetect=noise=-38dB:d=0.18", "-f", "null", "-"],
                         capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", det.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", det.stderr)]
    mids = [(s + e) / 2 for s, e in zip(starts, ends)]
    cuts, last = [], 0.0
    while total - last > CHUNK_SECONDS:
        options = [m for m in mids if last + 3 < m <= last + CHUNK_SECONDS]
        if not options:
            raise RuntimeError(f"split_at_pauses: no pause to cut {wav.name} near {last + CHUNK_SECONDS:.1f}s")
        last = max(options)
        cuts.append(last)
    pieces, bounds = [], [0.0] + cuts + [total]
    for k in range(len(bounds) - 1):
        piece = workdir / f"{wav.stem}.part{k}.wav"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                        "-ss", f"{bounds[k]:.3f}", "-to", f"{bounds[k + 1]:.3f}", str(piece)], check=True)
        pieces.append(piece)
    return pieces


def whisper(paths):
    """Transcribe many files with one model load. Returns {path: text}."""
    texts = {}
    for start in range(0, len(paths), 60):
        batch = paths[start:start + 60]
        subprocess.run(["whisper-cli", "-m", str(WHISPER_MODEL), "-l", "en", "-nt", "-np", "-mc", "0",
                        "-t", "8", "-otxt", *[str(p) for p in batch]], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for p in batch:
            txt = Path(str(p) + ".txt")
            texts[p] = txt.read_text().strip() if txt.exists() else ""
    return texts


def main():
    args = [a for a in sys.argv[1:]]
    out_path = None
    if "--out" in args:
        k = args.index("--out")
        out_path = Path(args[k + 1])
        del args[k:k + 2]
    lexicon = json.loads((ROOT / "lexicon.json").read_text())
    voices = json.loads((ROOT / "audio/voices.json").read_text())["voices"]
    if args:
        voices = [v for v in voices if v["id"] in args]
    words = [w for d in sorted(lexicon["days"], key=lambda d: d["day"]) for w in d["words"]]
    days = sorted(lexicon["days"], key=lambda d: d["day"])

    os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
    import numpy as np
    import soundfile as sf
    import torch
    from transformers import AutoModelForCTC, AutoProcessor
    processor = AutoProcessor.from_pretrained(PHONEME_MODEL)
    model = AutoModelForCTC.from_pretrained(PHONEME_MODEL).eval()

    def phones(wav):
        audio, rate = sf.read(str(wav), dtype="float32")
        inputs = processor(audio, sampling_rate=rate, return_tensors="pt")
        with torch.no_grad():
            logits = model(inputs.input_values).logits
        return processor.batch_decode(torch.argmax(logits, dim=-1))[0]

    report = {"voices": {}}
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for voice in voices:
            vid = voice["id"]
            vdir = tmp / vid
            vdir.mkdir()
            word_wavs, passage_pieces = {}, {}
            for w in words:
                dst = vdir / f"w-{w['id']}.wav"
                to_wav16(ROOT / f"audio/{vid}/w/{w['id']}.mp3", dst)
                word_wavs[w["id"]] = dst
            for d in days:
                dst = vdir / f"p-{d['day']}.wav"
                to_wav16(ROOT / f"audio/{vid}/p/{d['day']}.mp3", dst)
                passage_pieces[d["day"]] = split_at_pauses(dst, vdir)
            sample = vdir / "sample.wav"
            to_wav16(ROOT / f"audio/{vid}/sample.mp3", sample)

            all_paths = list(word_wavs.values()) + [p for ps in passage_pieces.values() for p in ps] + [sample]
            heard = whisper(all_paths)

            word_rows = []
            for w in words:
                wav = word_wavs[w["id"]]
                said = phones(wav)
                expected = phone_units(w["ipa"])
                got = phone_units(said)
                per = distance(expected, got) / max(1, len(expected))
                row = {"word": w["word"], "whisper": heard[wav], "phones": said, "per": round(per, 2)}
                text_ok = words_of(heard[wav]) == [w["word"].lower()]
                flags = [] if text_ok else ["whisper"]
                # -ate words: the adjective/noun says -ət, the verb -eɪt. Score the other ending too.
                if w["word"].endswith("ate"):
                    ipa = w["ipa"].strip("/")
                    foil = re.sub(r"eɪt$", "ət", ipa) if ipa.endswith("eɪt") else re.sub(r"ət$", "eɪt", ipa)
                    foil_per = distance(phone_units(foil), got) / max(1, len(expected))
                    row["foil_per"] = round(foil_per, 2)
                    if foil_per < per:
                        flags.append("ending")
                if per > 0.4:
                    flags.append("phones")
                row["flags"] = flags
                word_rows.append(row)

            passage_rows = []
            for d in days:
                text = " ".join(heard[p] for p in passage_pieces[d["day"]])
                ref = words_of(d["passage"]["text"])
                hyp = words_of(text)
                wer = distance(ref, hyp) / max(1, len(ref))
                missing = [w["word"] for w in d["words"]
                           if not any(h.startswith(w["word"].lower()[:max(4, len(w["word"]) - 3)]) for h in hyp)]
                passage_rows.append({"day": d["day"], "wer": round(wer, 3), "missing": missing,
                                     "heard": text if (wer > 0.05 or missing) else ""})

            ref = words_of(days[0]["epigram"])
            sample_wer = distance(ref, words_of(heard[sample])) / max(1, len(ref))
            flagged = [r for r in word_rows if r["flags"]]
            summary = {
                "words_flagged": len(flagged),
                "mean_word_per": round(float(np.mean([r["per"] for r in word_rows])), 3),
                "mean_passage_wer": round(float(np.mean([r["wer"] for r in passage_rows])), 3),
                "passages_over_5pct": sum(1 for r in passage_rows if r["wer"] > 0.05),
                "headwords_missing_in_passages": sum(len(r["missing"]) for r in passage_rows),
                "sample_wer": round(sample_wer, 3),
            }
            report["voices"][vid] = {"summary": summary, "words": word_rows, "passages": passage_rows}
            print(f"{vid}: {json.dumps(summary)}", flush=True)
            for r in flagged:
                print(f"  word {r['word']}: {r['flags']} whisper={r['whisper']!r} per={r['per']} "
                      f"foil={r.get('foil_per')} phones={r['phones']!r}", flush=True)
            for r in passage_rows:
                if r["heard"]:
                    print(f"  passage {r['day']}: wer={r['wer']} missing={r['missing']}", flush=True)

    if out_path:
        out_path.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
