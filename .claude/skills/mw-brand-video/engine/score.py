# → <project-dir>/out/mix.wav
# 120 BPM bed + brand sound design driven by the spec's scene list, ducked under the VO.
import sys, os, json, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt

# python3 score.py <project-dir>
ROOT = os.path.dirname(os.path.abspath(__file__))
PD = os.path.abspath(sys.argv[1])
spec = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'dumpspec.js'), os.path.join(PD, 'spec.js')]))
SR = 44100; DUR = spec['dur']; N = int(SR * DUR); BEAT = 60 / spec.get('bpm', 120)
rng = np.random.default_rng(3)
L = np.zeros(N); R = np.zeros(N)

def add(sig, t, g=1.0, pan=0.0, buf=None):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[:N - i] * g
    (buf or (L, R))[0][i:i + len(sig)] += sig * (1 - max(pan, 0))
    (buf or (L, R))[1][i:i + len(sig)] += sig * (1 + min(pan, 0))
def env(n, a=.002, d=.2): t = np.arange(n) / SR; return np.minimum(t / a, 1) * np.exp(-t / d)
bp = lambda s, lo, hi: sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), s)
lp = lambda s, f: sosfilt(butter(2, f, 'low', fs=SR, output='sos'), s)
hp = lambda s, f: sosfilt(butter(2, f, 'high', fs=SR, output='sos'), s)
note = lambda m: 440 * 2 ** ((m - 69) / 12)

def kick():
    n = int(.4 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(48 + 100 * np.exp(-t / .03)) / SR) * env(n, .001, .15)
def clap():
    n = int(.25 * SR); s = bp(rng.standard_normal(n), 1000, 3000); e = np.zeros(n)
    for o in (0, .01, .02): k = int(o * SR); e[k:] += env(n - k, .0005, .012 if o < .02 else .1)
    return s * e
def hat(d=.018): n = int(.08 * SR); return hp(rng.standard_normal(n), 8000) * env(n, .0005, d)
def saw(f, n, det=.005):
    t = np.arange(n) / SR; return sum(2 * ((t * f * (1 + d)) % 1) - 1 for d in (-det, 0, det)) / 3
def pad(ms, n, cut): a = np.minimum(np.arange(n) / (.3 * SR), 1) * np.minimum((n - np.arange(n)) / (.3 * SR), 1); return lp(sum(saw(note(m), n) for m in ms) / len(ms), cut) * a
def bass(m, n): return lp(saw(note(m), n, 0) * .6 + np.sin(2 * np.pi * note(m - 12) * np.arange(n) / SR) * .7, 300) * env(n, .003, .2)
def pluck(m, n=int(.25 * SR)): t = np.arange(n) / SR; return (np.sin(2 * np.pi * note(m) * t) + .3 * np.sin(4 * np.pi * note(m) * t)) * env(n, .001, .09)
def whoosh(length=.4, rev=True):
    n = int(length * SR); s = rng.standard_normal(n + 512); out = np.zeros(n)
    for i in range(0, n, 512):
        p = i / n; c = 300 + 5000 * (p if rev else 1 - p) ** 2
        out[i:i + 512] = bp(s[i:i + 768], c * .6, min(c * 1.7, 18000))[:len(out[i:i + 512])]
    return out * ((np.linspace(0, 1, n) ** 2) if rev else (np.linspace(1, 0, n) ** 1.5)) * 1.5
def impact():
    n = int(1.0 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (40 + 55 * np.exp(-t / .05)) * t) * env(n, .001, .4) + lp(rng.standard_normal(n), 4000) * env(n, .0005, .04) * .3
def tick(): n = int(.03 * SR); return bp(rng.standard_normal(n), 2500, 6500) * env(n, .0003, .004)
def riser(length):
    n = int(length * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(220 * 6 ** (t / length)) / SR) * .2 + hp(rng.standard_normal(n), 3000) * .35) * (t / length) ** 2.5

# ---------- music bed (A minor: Am F C G), drums thin out under VO ----------
prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; roots = [45, 41, 48, 43]
MUS = (np.zeros(N), np.zeros(N))
bar = 4 * BEAT
for b in range(int(DUR / bar) + 1):
    t0 = b * bar
    if t0 >= DUR - .5: break
    add(pad(prog[b % 4] + [prog[b % 4][0] + 12], int(bar * SR), 1500), t0, .2, buf=MUS)
    for k in range(8):
        if t0 + k * BEAT / 2 < BEAT * 2: continue
        add(bass(roots[b % 4] + (12 if k in (3, 7) else 0), int(BEAT / 2 * SR)), t0 + k * BEAT / 2, .3, buf=MUS)
end = spec['scenes'][-1]['a']
for k in range(int(DUR / BEAT)):
    t = k * BEAT
    if t >= end: break
    add(kick(), t, .8 if t >= BEAT * 2 else .5, buf=MUS)
    if k % 2: add(clap(), t, .3, .1, buf=MUS)
    add(hat(), t + BEAT / 2, .18, .3, buf=MUS)
    if k % 4 == 3: add(hat(.08), t + BEAT / 2, .1, -.3, buf=MUS)
# arpeggio sparkle under the middle third
for k in range(int(DUR / (BEAT / 4))):
    t = k * BEAT / 4
    if DUR * .35 < t < DUR * .62: add(pluck(prog[int(t // bar) % 4][0] + 12 + [0, 7, 12, 7, 3, 7, 12, 15][k % 8]), t, .06, .3 if k % 2 else -.3, buf=MUS)

# ---------- VO + ducking ----------
VO = np.zeros(N)
for v in spec['vo']:
    with wave.open(os.path.join(PD, v['file'])) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
        if w.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
        if w.getframerate() != SR: a = np.interp(np.arange(int(len(a) * SR / w.getframerate())) / SR, np.arange(len(a)) / w.getframerate(), a)
    i = int(v['t'] * SR); a = a[:N - i]; VO[i:i + len(a)] += a
vo_env = lp(np.abs(VO), 6); vo_env /= vo_env.max() + 1e-9
duck = 1 - .55 * np.clip(vo_env * 3, 0, 1)
duck = lp(duck, 4)
L += MUS[0] * duck; R += MUS[1] * duck

# ---------- sound design on scene events ----------
for i, sc in enumerate(spec['scenes']):
    a = sc['a']
    if i: add(whoosh(.35), a - .35, .3, rng.uniform(-.4, .4))
    if sc.get('tr') == 'zig': add(whoosh(.5, False), a, .25, .3); add(impact(), a, .35)
    if sc.get('tr') == 'chev': add(whoosh(.25), a - .25, .3, -.3); add(impact(), a, .3)
    if sc['kind'] == 'burst':
        for w in sc['words']: add(impact(), w['t'], .45); add(kick(), w['t'], .7)
        add(riser(1.2), a - 1.2, .25)
    if sc.get('art') == 'board':
        for k in range(40): add(tick(), a + .1 + k * .016 + rng.uniform(0, .006), .25, rng.uniform(-.6, .6))
    if sc.get('art') == 'number':
        for k in range(30): add(tick(), sc.get('artAt', a) + .1 + 1.0 * (k / 30) ** .7, .3)
    for it in sc.get('text', []):
        if it.get('st') in ('h', 'hx'): add(whoosh(.18), it['t'] - .18, .12, rng.uniform(-.3, .3))
        if it.get('strike') is not None: add(whoosh(.25, False), it['strike'], .3, .4)
    if sc['kind'] == 'end':
        n = int(2.6 * SR); add(pad([57, 64, 69, 72, 76], n, 3000) * np.exp(-np.arange(n) / SR / .9), a, .7)
        add(pluck(81), a, .18); add(pluck(88), a + BEAT, .1)

L += VO * 1.0; R += VO * 1.0
def verb(s):
    y = s.copy()
    for d, g in ((.029, .25), (.051, .2), (.083, .16), (.131, .12)): k = int(d * SR); y[k:] += s[:-k] * g
    return lp(y, 7000)
L, R = .85 * L + .15 * verb(L), .85 * R + .15 * verb(R)
mix = np.stack([L, R], 1); mix = np.tanh(mix * 1.2) / np.tanh(1.2)
f = int((DUR - .6) * SR); mix[f:] *= np.linspace(1, 0, N - f)[:, None]
mix /= np.abs(mix).max() / .9
os.makedirs(os.path.join(PD, 'out'), exist_ok=True)
with wave.open(os.path.join(PD, 'out', 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('mix ok', round(DUR, 2), 's')
