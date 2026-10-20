# Cut-out photos for a project, from the shared library (the Studio's), for free.
#
#   python3 photos.py <project-dir> "<query>" [WORD]
#
# Prints one JSON line: {"key","path","credit","source"} on success, or {"error"}.
# The PNG lands in <project>/cutouts/<key>.png; put it in SPEC.photos and use
# photo: { key, word } on the scene (references/spec.md → Cut-out photos).
#
# Keys never live here. The skill asks the Moving Walls app (MW_STUDIO_URL,
# default https://cashflowos-rif.vercel.app) with one shared secret,
# MW_STUDIO_TOKEN; the app holds the Pexels/Anthropic/Supabase keys, checks
# relevance with Claude, and keeps the library both tools share.
#
# Order: library hit → reuse. Otherwise the app returns Pexels candidates
# Claude judged to show the subject, plain-background first; those on white
# or green are keyed out here (numpy/scipy, no model) and saved back to the
# library. Busy-background photos need the AI cut-out that runs in the
# Studio's browser — this script says so rather than producing a bad edge.

import sys, os, io, json, re, base64, urllib.request, urllib.parse
import numpy as np
from PIL import Image
from scipy import ndimage

PD = os.path.abspath(sys.argv[1]); QUERY = sys.argv[2].strip(); WORD = sys.argv[3] if len(sys.argv) > 3 else ''
BASE = os.environ.get('MW_STUDIO_URL', 'https://cashflowos-rif.vercel.app').rstrip('/')
TOKEN = os.environ.get('MW_STUDIO_TOKEN', '').strip()
key = re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', QUERY.lower()))[:60]

def out(**kw):
    print(json.dumps(kw)); sys.exit(0 if 'error' not in kw else 1)

if not TOKEN:
    out(error='MW_STUDIO_TOKEN is not set. Add it to this environment (same value as on Vercel).')

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'mw-brand-video'},
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MovingWallsStudio/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def key_out(img, kind):
    """Same method as the Studio's colour key: flood the backdrop in from the edges."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    band = max(2, round(min(w, h) * .02))
    border = np.concatenate([a[:band].reshape(-1, 3), a[-band:].reshape(-1, 3), a[:, :band].reshape(-1, 3), a[:, -band:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    bd = np.sqrt(((border - bg) ** 2).sum(-1))
    if (bd < 40).mean() < .7: return None                                   # edges are not one plain colour
    if kind == 'white' and bg.sum() < 560: return None
    if kind == 'green' and not (bg[1] > bg[0] + 40 and bg[1] > bg[2] + 40): return None
    T1, T2 = (14, 40) if kind == 'white' else (55, 110)
    near = dist < T2
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    flooded = np.isin(lab, list(edge))
    alpha = np.where(flooded, np.clip((dist - T1) / (T2 - T1), 0, 1), 1.0)
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    if kind == 'green':
        m = np.maximum(rgba[..., 0], rgba[..., 2]); rgba[..., 1] = np.minimum(rgba[..., 1], m)
    solid = alpha > .16
    share = solid.mean()
    if share < .04 or share > .9: return None
    # Haze gate (same as the Studio): broad half-transparent patches away from
    # the outline mean the key ate a white subject or kept a shadow. Clean ≈0.1%.
    vis = alpha > .08
    near = ndimage.binary_dilation(alpha < .08, iterations=3)
    if ((vis & (alpha < .92) & ~near).sum() / max(1, vis.sum())) > .03: return None
    ys, xs = np.where(solid)
    pad = round(max(w, h) * .01)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1), max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
    return Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')

os.makedirs(os.path.join(PD, 'cutouts'), exist_ok=True)
dest = os.path.join(PD, 'cutouts', key + '.png')

try:
    found = api('GET', '/api/mw-cutouts?' + urllib.parse.urlencode({'q': QUERY, 'word': WORD}))
except Exception as e:
    out(error=f'Could not reach the Moving Walls app at {BASE}: {e}. If the app moved, set MW_STUDIO_URL.')

if found.get('cutouts'):
    c = found['cutouts'][0]
    open(dest, 'wb').write(fetch(c['url']))
    try: api('GET', f"/api/mw-cutouts?used={c['id']}")
    except Exception: pass
    out(key=key, path=os.path.relpath(dest, PD), credit=c.get('credit'), subject=c.get('subject'), source='library')

skipped = 0
for c in found.get('candidates', []):
    if c['background'] == 'other': skipped += 1; continue
    try:
        img = Image.open(io.BytesIO(fetch(c['original'])))
        img.thumbnail((1600, 1600))
        cut = key_out(img, c['background'])
    except Exception:
        cut = None
    if cut is None: continue
    cut.save(dest)
    buf = io.BytesIO(); cut.save(buf, 'PNG')
    try:
        api('POST', '/api/mw-cutouts', {'meta': {'query': QUERY, 'subject': c['subject'], 'method': 'key', 'sourceId': c['id'], 'credit': c['credit'],
                                                  'creditUrl': c['creditUrl'], 'width': cut.width, 'height': cut.height}, 'png': base64.b64encode(buf.getvalue()).decode()})
    except Exception:
        pass   # the video can still use it; only the library misses out
    out(key=key, path=os.path.relpath(dest, PD), credit=c['credit'], subject=c['subject'], source='pexels')

why = found.get('error') or ('Only busy-background photos matched — those need the AI cut-out in /mw/studio.' if skipped else 'No candidate keyed out cleanly.')
out(error=f'No cut-out for “{QUERY}”: {why} Keep the illustration for this scene, or try other words (an object or person "isolated on white background").')
