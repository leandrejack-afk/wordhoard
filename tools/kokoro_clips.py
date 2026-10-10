#!/usr/bin/env python3
"""Records Kokoro clips for audio.mjs.

Reads one JSON job per line on stdin: {"text", "voice", "speed", "out"}, and
writes each as a 24 kHz mono WAV. Headwords arrive in misaki's inline markup,
[word](/phonemes/), so Kokoro says them from the lexicon's IPA. Run with the
readout venv's python (~/.claude/tts/venv), which has kokoro and its voices.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

RATE = 24000

pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
gap = np.zeros(int(0.25 * RATE), dtype=np.float32)  # a beat between sentence groups

for line in sys.stdin:
    if not line.strip():
        continue
    job = json.loads(line)
    parts = []
    for _, _, audio in pipeline(job["text"], voice=job["voice"], speed=job.get("speed", 1)):
        if audio is None:
            continue
        if parts:
            parts.append(gap)
        parts.append(np.asarray(audio, dtype=np.float32))
    if not parts:
        sys.exit(f"kokoro.py: no audio for {job['out']}")
    sf.write(job["out"], np.concatenate(parts), RATE)
