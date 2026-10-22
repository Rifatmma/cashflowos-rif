# Technical audit of a finished MP4: python3 audit_media.py <video.mp4> [format]
#
# Prints one JSON object {"file", "facts", "findings": [...]}, each finding
# {severity, kind, t, detail, rule}. Pairs with the engine's layout audit
# (render.js … audit), which checks what was drawn; this checks the file.
#
#   container   H.264 High/Main, yuv420p, constant 30fps, the format's size,
#               AAC 48 kHz, fast-start (moov first) for web playback
#   duration    audio and video end together (≤ 0.1s apart)
#   loudness    integrated −14 LUFS ±1 for social, true peak ≤ −1 dBTP
#               (ITU-R BS.1770 via ffmpeg ebur128; Spotify/YouTube norms)
#   silence     no more than 1s of silence at the start or end
#   black       no black stretch ≥ 0.5s (blackdetect)
#   flashing    no more than 3 flashes in any 1s over ≥ 25% of the frame
#               (WCAG 2.3.1 / Ofcom / ITU-R BT.1702). A screen, not a
#               certified PSE test (Harding / IRIS are the certified tools).

import sys, json, subprocess, re

path = sys.argv[1]; fmt = sys.argv[2] if len(sys.argv) > 2 else ''
SIZE = {'916': (1080, 1920), '169': (1920, 1080), '11': (1080, 1080), '45': (1080, 1350)}
findings = []
def add(sev, kind, detail, rule, t=None): findings.append({'severity': sev, 'kind': kind, 't': t, 'detail': detail, 'rule': rule})
def run(*a): return subprocess.run(a, capture_output=True, text=True)

probe = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path).stdout)
v = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
a = next((s for s in probe['streams'] if s['codec_type'] == 'audio'), None)
facts = {}
if not v: add('blocker', 'container', 'no video stream', 'H.264 video')
else:
    fr = v.get('avg_frame_rate', '0/1'); n, d = (int(x) for x in fr.split('/')); fps = n / d if d else 0
    facts.update(codec=v.get('codec_name'), profile=v.get('profile'), pix_fmt=v.get('pix_fmt'), size=f"{v.get('width')}x{v.get('height')}", fps=round(fps, 3),
                 vbitrate_kbps=round(int(v.get('bit_rate', 0) or 0) / 1000), vdur=float(v.get('duration', 0) or 0))
    if v.get('codec_name') != 'h264': add('blocker', 'container', f"video codec {v.get('codec_name')}", 'H.264 is accepted by every platform')
    if v.get('profile') not in ('High', 'Main', 'Constrained Baseline'): add('should fix', 'container', f"H.264 profile {v.get('profile')}", 'H.264 High or Main')
    if v.get('pix_fmt') != 'yuv420p': add('blocker', 'container', f"pixel format {v.get('pix_fmt')}", '4:2:0 (yuv420p) plays everywhere')
    if abs(fps - 30) > .01: add('should fix', 'container', f'{fps:.2f} fps', 'constant 30 fps')
    if fmt in SIZE and (v.get('width'), v.get('height')) != SIZE[fmt]: add('blocker', 'container', f"{v.get('width')}x{v.get('height')}, expected {SIZE[fmt][0]}x{SIZE[fmt][1]}", 'format size')
    if facts['vbitrate_kbps'] and facts['vbitrate_kbps'] < 4000: add('nice to have', 'container', f"video bitrate {facts['vbitrate_kbps']} kbps", '≈8 Mbps for 1080p30 (YouTube recommended)')
if not a: add('blocker', 'container', 'no audio stream', 'AAC audio')
else:
    facts.update(acodec=a.get('codec_name'), sample_rate=int(a.get('sample_rate', 0)), adur=float(a.get('duration', 0) or 0))
    if a.get('codec_name') != 'aac': add('should fix', 'container', f"audio codec {a.get('codec_name')}", 'AAC-LC')
    if int(a.get('sample_rate', 0)) != 48000: add('nice to have', 'container', f"audio at {a.get('sample_rate')} Hz", '48 kHz (platform recommendation)')
# fast start: is the moov atom before mdat?
head = open(path, 'rb').read(1 << 20)
mo, md = head.find(b'moov'), head.find(b'mdat')
facts['faststart'] = mo != -1 and (md == -1 or mo < md)
if not facts['faststart']: add('should fix', 'container', 'moov atom after the media (no fast start)', 'web playback starts before the whole file loads (-movflags +faststart)')
if v and a and abs(facts['vdur'] - facts['adur']) > .1: add('should fix', 'duration', f"audio {facts['adur']:.2f}s vs video {facts['vdur']:.2f}s", 'audio and video end together')

# loudness (BS.1770), true peak
r = run('ffmpeg', '-hide_banner', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-')
s = r.stderr[r.stderr.rfind('Summary:'):]
num = lambda k: float(re.search(k + r':\s+(-?[\d.]+)', s).group(1)) if re.search(k + r':\s+(-?[\d.]+)', s) else None
I, LRA, TP = num('I'), num('LRA'), num('Peak')
facts.update(lufs=I, lra=LRA, true_peak=TP)
if I is not None:
    if I > -9 or I < -20: add('blocker', 'loudness', f'{I} LUFS integrated', '−14 LUFS for social/streaming (platforms normalise; far off = squashed or too quiet)')
    elif abs(I + 14) > 1: add('should fix', 'loudness', f'{I} LUFS integrated', '−14 LUFS ±1')
if TP is not None and TP > -1: add('blocker' if TP > 0 else 'should fix', 'loudness', f'true peak {TP} dBTP', 'true peak ≤ −1 dBTP (clipping after platform encoding)')

# silence at head / tail
r = run('ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'silencedetect=noise=-50dB:d=1', '-f', 'null', '-')
dur = facts.get('vdur') or 0
for m in re.finditer(r'silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)', r.stderr):
    s0, s1 = float(m.group(1)), float(m.group(2))
    if s0 <= .05: add('should fix', 'silence', f'{s1:.1f}s of silence at the start', 'sound from the first second', 0)
    elif s1 >= dur - .1: add('nice to have', 'silence', f'{s1 - s0:.1f}s of silence at the end', '≤1s tail', s0)
    else: add('should fix', 'silence', f'{s1 - s0:.1f}s of silence mid-video', 'no dropouts', s0)

# black frames
r = run('ffmpeg', '-hide_banner', '-nostats', '-i', path, '-vf', 'blackdetect=d=0.5:pix_th=0.10', '-an', '-f', 'null', '-')
for m in re.finditer(r'black_start:([\d.]+) black_end:([\d.]+)', r.stderr):
    add('should fix', 'black', f'black from {float(m.group(1)):.1f}s to {float(m.group(2)):.1f}s', 'no black stretches', float(m.group(1)))

# flashing: luminance on a 16×16 grid per frame; a flash is a pair of opposing
# changes of ≥10% relative luminance (darker state < 0.8) over ≥25% of the frame
GW, GH = 16, 16
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={GW}:{GH}:flags=area,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fps = facts.get('fps') or 30
lin = [((c / 255 + .055) / 1.055) ** 2.4 if c / 255 > .04045 else c / 255 / 12.92 for c in range(256)]
frames = [raw[i:i + GW * GH] for i in range(0, len(raw) - GW * GH + 1, GW * GH)]
trans = []      # (frame, +1 brighter / −1 darker) when ≥25% of cells change together
for i in range(1, len(frames)):
    up = dn = 0
    for p, q in zip(frames[i - 1], frames[i]):
        L0, L1 = lin[p], lin[q]
        if abs(L1 - L0) >= .1 and min(L0, L1) < .8: (up := up + 1) if L1 > L0 else (dn := dn + 1)
    cells = GW * GH
    if up / cells >= .25: trans.append((i, 1))
    elif dn / cells >= .25: trans.append((i, -1))
# a flash = two opposing transitions; count flashes in every 1s window
flashes = []
last = None
for f, sgn in trans:
    if last and sgn != last[1]: flashes.append(f); last = None
    else: last = (f, sgn)
worst, at = 0, None
for i, f in enumerate(flashes):
    n_in = sum(1 for g in flashes[i:] if g - f < fps)
    if n_in > worst: worst, at = n_in, f / fps
facts.update(flash_transitions=len(trans), flashes=len(flashes), max_flashes_per_second=worst)
if worst > 3: add('blocker', 'flashing', f'{worst} large flashes within one second', 'WCAG 2.3.1 / Ofcom: ≤3 flashes in any 1s (screen only; certify with Harding/IRIS)', round(at, 2))
elif worst == 3: add('should fix', 'flashing', '3 large flashes within one second (at the limit)', 'WCAG 2.3.1 / Ofcom', round(at, 2))

order = {'blocker': 0, 'should fix': 1, 'nice to have': 2}
findings.sort(key=lambda q: (order[q['severity']], q['t'] or 0))
print(json.dumps({'file': path, 'facts': facts, 'findings': findings}, indent=1))
