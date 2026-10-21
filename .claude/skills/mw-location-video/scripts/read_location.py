# Read a movingwalls.com/locations page and everything it links to, for free.
#
#   python3 read_location.py <project-dir> <url>
#
# <url> is a country page (…/locations/malaysia) or a city page
# (…/locations/malaysia/kuala-lumpur). A country page is read together with
# every city page it links to; a city page together with its country page,
# whose inventory carousel often holds more sites in that city.
#
# Writes into <project-dir>:
#   sites.json    every site WITH a photo, reach and impressions, grouped by city
#   context.md    each page's own words (stats, key locations, FAQ answers)
#   sites/<id>.png  the site photos, exactly as published (never edited)
#
# Prints a summary. Sites whose numbers contradict themselves on the page are
# listed under "doubtful" and left out of sites.json — the country page's own
# featured cards, for instance, show network totals that do not match the
# description underneath them.

import sys, os, re, json, html, urllib.request, urllib.parse

PD = os.path.abspath(sys.argv[1]); URL = sys.argv[2].strip().rstrip('/')
UA = {'User-Agent': 'Mozilla/5.0 (mw-location-video)'}
os.makedirs(os.path.join(PD, 'sites'), exist_ok=True)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()

def page(url):
    """The page's HTML and its Next.js data, decoded as JSON strings decode."""
    h = get(url).decode('utf-8', 'replace')
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', h)
    data = ''.join(json.loads('"' + c + '"') for c in chunks)
    return h, data

def text_of(h):
    h = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', '', h)
    lines = [html.unescape(l).strip() for l in re.sub(r'<[^>]+>', '\n', h).split('\n')]
    out = []
    for l in lines:
        if l and l not in out[-1:]: out.append(l)
    # the site footer and menus are the same on every page
    if 'Trusted Globally by Marketers' in out: out = out[:out.index('Trusted Globally by Marketers')] + ['…'] + [l for l in out[out.index('Trusted Globally by Marketers'):] if '?' in l or len(l) > 80][:30]
    return '\n'.join(out)

def num(s):
    s = str(s).replace(',', '').strip()
    m = re.match(r'^([\d.]+)\s*([MK]?)$', s, re.I)
    if not m: return None
    v = float(m.group(1)) * {'': 1, 'K': 1e3, 'M': 1e6}[m.group(2).upper()]
    return int(round(v)), bool(m.group(2))   # value, was it rounded ("1.35 M")?

def slug(s): return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', s.lower()))[:60]

def array_after(data, key):
    i = data.find('"%s":[' % key)
    if i < 0: return []
    try: return json.JSONDecoder().raw_decode(data, i + len(key) + 3)[0]
    except Exception: return []

def sanity_base(data):
    m = re.search(r'cdn\.sanity\.io/images/([a-z0-9]+)/([a-z0-9_-]+)/', data)
    return f'https://cdn.sanity.io/images/{m.group(1)}/{m.group(2)}/' if m else None

def read(url):
    h, data = page(url)
    parts = urllib.parse.urlparse(url).path.strip('/').split('/')   # locations, country[, city]
    kind = 'city' if len(parts) >= 3 else 'country'
    title = (re.search(r'<h1[^>]*>([\s\S]*?)</h1>', h) or [None, ''])[1]
    visible = text_of(h)
    # FAQ answers are collapsed on the page, so they are only in its data
    extra = [s for s in dict.fromkeys(json.loads('"' + m + '"') for m in re.findall(r'"text":"((?:[^"\\]|\\.){60,})"', data)) if s not in visible]
    if extra: visible += '\n\nFrom the page data (FAQ answers and other collapsed text):\n' + '\n'.join(extra)
    out = {'url': url, 'kind': kind, 'country': parts[1] if len(parts) > 1 else '', 'city': parts[2] if kind == 'city' else '',
           'title': html.unescape(re.sub(r'<[^>]+>', '', title)).strip(), 'text': visible, 'sites': [], 'doubtful': [], 'links': []}
    base = sanity_base(data)
    # 1. the page's featured cards
    for b in array_after(data, 'highVisibilityBillboards'):
        r, i = num(b.get('reach', '')) or (None, None), num(b.get('impressions', '')) or (None, None)
        site = {'name': b.get('name', '').strip(), 'area': b.get('location', '').strip(), 'reach': r[0], 'impressions': i[0],
                'image': (b.get('image') or '').split('?')[0], 'source': f'{kind} page · featured', 'page': url}
        desc = b.get('description') or ''
        said = [int(x) for x in re.findall(r'\b(\d{5,})\b', desc)]
        if not (site['reach'] and site['impressions'] and site['image']):
            out['doubtful'].append({**site, 'why': 'missing a photo, reach or impressions'})
        elif r[1] or i[1] or (said and site['reach'] not in said):
            out['doubtful'].append({**site, 'why': f'card says {b.get("reach")} / {b.get("impressions")}, description says {", ".join(map(str, said)) or "nothing"}'})
        else:
            out['sites'].append(site)
    # 2. the inventory carousel ("Billboard Name: …, Reach: …, Impressions: …, City.")
    for m in re.finditer(r'"caption":"Billboard Name: (.*?), Reach: (\d+), Impressions: (\d+), (.*?)\.?","image":\{"_type":"image","asset":\{"_ref":"image-([0-9a-f]+)-(\d+x\d+)-(\w+)"', data):
        name, reach, impr, place, h_, size, ext = m.groups()
        if any(s['name'] == name for s in out['sites']): continue
        out['sites'].append({'name': name.strip(), 'area': place.strip(), 'reach': int(reach), 'impressions': int(impr),
                             'image': f'{base}{h_}-{size}.{ext}' if base else '', 'source': f'{kind} page · inventory carousel', 'page': url})
    # 3. city pages a country page links to
    for c in array_after(data, 'cities'):
        if c.get('href'): out['links'].append({'city': c.get('city'), 'url': urllib.parse.urljoin(url, c['href'])})
    return out

pages = [read(URL)]
first = pages[0]
if first['kind'] == 'country':
    for l in first['links']: pages.append(read(l['url']))
else:
    pages.append(read(URL.rsplit('/', 1)[0]))      # the country page, for its carousel

# Group sites by city. A city page's own sites belong to it; a country page's
# carousel site goes to whichever city page's name appears in its place
# ("Petaling, Selangor" → Selangor), else to its own place ("Kuching, Sarawak").
cities = {p['city']: p['title'] for p in pages if p['kind'] == 'city'}
names = {c: re.sub(r'-', ' ', c) for c in cities}
groups, seen, doubtful = {}, set(), []
for p in sorted(pages, key=lambda p: p['kind'] != 'city'):
    doubtful += p['doubtful']
    for s in p['sites']:
        key = s['name'].lower()
        if key in seen: continue
        seen.add(key)
        city = p['city'] if p['kind'] == 'city' else next((c for c, n in names.items() if n.lower() in s['area'].lower()), slug(s['area'].split(',')[0]))
        s['city'] = city
        s['id'] = slug(s['name'])
        groups.setdefault(city, []).append(s)

# Photos, exactly as published.
for city, ss in groups.items():
    for s in ss:
        dest = os.path.join(PD, 'sites', s['id'] + '.png')
        if not os.path.exists(dest):
            try: open(dest, 'wb').write(get(s['image'] + '?fm=png'))
            except Exception as e: s['photoError'] = str(e)[:120]
        s['photo'] = os.path.relpath(dest, PD)

json.dump({'url': URL, 'cities': groups, 'doubtful': doubtful}, open(os.path.join(PD, 'sites.json'), 'w'), indent=1, ensure_ascii=False)
with open(os.path.join(PD, 'context.md'), 'w') as f:
    for p in pages: f.write(f"# {p['title']}\n{p['url']}\n\n{p['text']}\n\n")

for city, ss in groups.items():
    print(f'\n{city}  ({len(ss)} sites)')
    for s in ss: print(f"  {s['name']:<48} reach {s['reach']:>9,}  impr {s['impressions']:>11,}  · {s['area']}  [{s['source']}]")
if doubtful:
    print('\nleft out (numbers do not add up on the page):')
    for s in doubtful: print(f"  {s['name']}: {s['why']}")
print(f'\nsites.json, context.md and {sum(len(v) for v in groups.values())} photos in {PD}')
