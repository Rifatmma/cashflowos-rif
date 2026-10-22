# Ava voiceover: python3 vo.py <project-dir>
# Reads <project>/lines.json {"voice","rate","lines":[...]} and writes, per line, l<i>.wav (44.1k mono)
# plus vo.json / vo.js with each line's duration and word start times (seconds from line start).
import asyncio, json, os, sys, subprocess, shutil, re
import edge_tts

PD = os.path.abspath(sys.argv[1])
cfg = json.load(open(os.path.join(PD, 'lines.json'), encoding='utf-8'))
# Ava is the English-only en-US voice. The Multilingual one guesses the language
# phrase by phrase, so a place or brand name (Diwali, AirAsia, Kuala Lumpur) can
# tip a whole phrase into another accent. A lines.json still naming it is ignored.
VOICE = cfg.get('voice', 'en-US-AvaNeural'); RATE = cfg.get('rate', '+6%')
if 'Multilingual' in VOICE or not VOICE.startswith('en-US-'): VOICE = 'en-US-AvaNeural'
# Acronyms are read letter by letter ("L M X", not "lemex"); the word timings
# are folded back so on-screen text still cues on "LMX".
ACR = re.compile(r"\b([A-Z]{2,5})(s?)\b")
def spoken(t): return ACR.sub(lambda m: ' '.join(m.group(1)) + m.group(2), t)
def refold(text, words):
    # the service times each spoken letter as its own word: L, M, X (a plural rides on the last: C, P, Ms)
    out, i = [], 0
    for m in ACR.finditer(text):
        n = len(m.group(1))
        while i < len(words) and ''.join(w[0] for w in words[i:i + n]) != m.group(0): out.append(words[i]); i += 1
        if i < len(words): out.append([m.group(0), words[i][1]]); i += n
    return out + words[i:]
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')

async def _one(i, text):
    c = edge_tts.Communicate(spoken(text), VOICE, rate=RATE, proxy=PROXY, boundary='WordBoundary')
    words, audio = [], b''
    async for ch in c.stream():
        if ch['type'] == 'audio': audio += ch['data']
        elif ch['type'] == 'WordBoundary': words.append([ch['text'], round(ch['offset'] / 1e7, 3)])
    mp3, wav = os.path.join(PD, f'l{i}.mp3'), os.path.join(PD, f'l{i}.wav')
    open(mp3, 'wb').write(audio)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '44100', '-ac', '1', wav], check=True)
    os.remove(mp3)
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]))
    return {'text': text, 'dur': round(dur, 3), 'words': refold(text, words), 'voice': VOICE}

async def one(i, text):
    # the speech service occasionally returns nothing; retry with backoff
    for attempt in range(6):
        try: return await _one(i, text)
        except edge_tts.exceptions.NoAudioReceived: await asyncio.sleep(2 + attempt * 2)
    raise SystemExit(f'TTS failed for line {i}: {text}')

async def main():
    out = [await one(i, t) for i, t in enumerate(cfg['lines'])]
    json.dump(out, open(os.path.join(PD, 'vo.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    open(os.path.join(PD, 'vo.js'), 'w', encoding='utf-8').write('window.__VO=' + json.dumps(out, ensure_ascii=False) + ';')
    for i, l in enumerate(out):
        print(f"L{i} {l['dur']:.2f}s  " + '  '.join(f"{w[0]}@{w[1]}" for w in l['words']))
    print('total speech', round(sum(l['dur'] for l in out), 2), 's')
asyncio.run(main())
