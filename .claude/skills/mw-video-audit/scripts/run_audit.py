# One audit round over a rendered project: python3 run_audit.py <project> <slug> <fmts> [--engine DIR]
#
#   fmts    comma list of 916,45,11,169 (the formats that were rendered)
#   engine  the video engine (render.js + audit.js); default $ENGINE, else ~/.mw-brand-video/engine
#
# Runs the layout audit (engine), the media audit (each MP4) and the voice audit, merges
# them with your Claude review (out/review.json, if written), and writes out/audit.json:
#   {round, findings: [{severity, kind, source, fix, fmts, scene, t, text, detail, rule}]}
# A finding seen in several formats is listed once with all its formats. `fix` is
# auto (design, timing, voice — fix it in the loop) or approve (what the video says —
# ask Rif). Each round's findings that are gone in the next are appended to
# out/audit_history.json as fixed. Exit code: 0 clean, 1 only approve/nice-to-have
# left, 2 blockers or auto-fixable should-fix left, 3 an audit could not run.

import sys, os, json, subprocess, argparse

ap = argparse.ArgumentParser()
ap.add_argument('project'); ap.add_argument('slug'); ap.add_argument('fmts')
ap.add_argument('--engine', default=os.environ.get('ENGINE') or os.path.expanduser('~/.mw-brand-video/engine'))
a = ap.parse_args()
PD, OUT, HERE = os.path.abspath(a.project), os.path.join(os.path.abspath(a.project), 'out'), os.path.dirname(os.path.abspath(__file__))
FMTS = [f for f in a.fmts.split(',') if f]
NAME = {'916': '9:16', '45': '4:5', '11': '1:1', '169': '16:9'}
APPROVE = {'sequence', 'claim', 'copy', 'claim wording', 'art meaning', 'figure'}
broken = []

def fix_class(kind, source):
    if source == 'review': return 'approve' if kind in APPROVE or kind.startswith('claim') or kind.startswith('copy') else 'auto'
    return 'approve' if kind in APPROVE else 'auto'

merged = {}
def take(q, source, fmt):
    key = (source, q['kind'], q.get('scene') or q.get('line'), q.get('text') or '', q['detail'])
    if key in merged:
        if fmt and NAME.get(fmt, fmt) not in merged[key]['fmts']: merged[key]['fmts'].append(NAME.get(fmt, fmt))
        return
    merged[key] = {'severity': q['severity'], 'kind': q['kind'], 'source': source, 'fix': q.get('fix') or fix_class(q['kind'], source),
                   'fmts': [NAME.get(fmt, fmt)] if fmt else ['all'], 'scene': q.get('scene') or (f"line {q['line'] + 1}" if q.get('line') is not None else ''),
                   't': q.get('t'), 'text': q.get('text') or '', 'detail': q['detail'], 'rule': q.get('rule', '')}

# 1 layout — what the engine drew
if not os.path.exists(os.path.join(PD, 'source.txt')):
    take({'severity': 'should fix', 'kind': 'setup', 'detail': 'no source.txt — figures and cut-off words were not checked', 'rule': 'Save the article / page text as source.txt'}, 'layout', None)
r = subprocess.run(['node', os.path.join(a.engine, 'render.js'), PD, ','.join(FMTS), 'audit'], capture_output=True, text=True)
if r.returncode != 0: broken.append(f'layout audit failed: {(r.stderr or r.stdout).strip()[-400:]}')
else:
    for f in FMTS:
        for q in json.load(open(os.path.join(OUT, f'audit_{f}.json'))): take(q, 'layout', f)
# 2 media — the files
for f in FMTS:
    mp4 = os.path.join(OUT, f'{a.slug}_{f}.mp4')
    if not os.path.exists(mp4): broken.append(f'{os.path.basename(mp4)} missing'); continue
    r = subprocess.run([sys.executable, os.path.join(HERE, 'audit_media.py'), mp4, f], capture_output=True, text=True)
    if r.returncode != 0: broken.append(f'media audit failed on {f}: {r.stderr.strip()[-300:]}'); continue
    m = json.loads(r.stdout); json.dump(m, open(os.path.join(OUT, f'media_{f}.json'), 'w'), indent=1)
    for q in m['findings']: take(q, 'media', f)
# 3 voice — what Ava says
r = subprocess.run([sys.executable, os.path.join(HERE, 'audit_voice.py'), PD], capture_output=True, text=True)
if r.returncode != 0: broken.append(f'voice audit failed: {r.stderr.strip()[-300:]}')
else:
    v = json.loads(r.stdout); json.dump(v, open(os.path.join(OUT, 'voice.json'), 'w'), indent=1, ensure_ascii=False)
    for q in v['findings']: take(q, 'voice', None)
# 4 your review — copy against the article, and what the frames look like
rv = os.path.join(OUT, 'review.json')
if os.path.exists(rv):
    for q in json.load(open(rv)): take(q, 'review', None)
for b in broken: take({'severity': 'blocker', 'kind': 'audit', 'detail': b, 'rule': 'Every audit must run — a failed audit is not a clean one'}, 'audit', None)

order = {'blocker': 0, 'should fix': 1, 'nice to have': 2}
findings = sorted(merged.values(), key=lambda q: (order[q['severity']], q['t'] or 0))
path = os.path.join(OUT, 'audit.json')
prev = json.load(open(path)) if os.path.exists(path) else None
rnd = (prev['round'] + 1) if prev else 1
if prev:
    sig = lambda q: (q['source'], q['kind'], q['scene'], q['text'])
    now = {sig(q) for q in findings}
    gone = [dict(q, fixed_in_round=rnd) for q in prev['findings'] if sig(q) not in now and q['kind'] != 'audit']
    hp = os.path.join(OUT, 'audit_history.json')
    hist = json.load(open(hp)) if os.path.exists(hp) else []
    json.dump(hist + gone, open(hp, 'w'), indent=1, ensure_ascii=False)
json.dump({'round': rnd, 'findings': findings}, open(path, 'w'), indent=1, ensure_ascii=False)

for q in findings:
    print(f"{q['severity'].upper():12} {q['fix']:8} [{q['source']}/{q['kind']}] {', '.join(q['fmts'])}  {q['scene']}"
          f"{' @' + str(q['t']) + 's' if q['t'] is not None else ''}  {('“' + q['text'] + '” ') if q['text'] else ''}— {q['detail']}")
todo = [q for q in findings if q['fix'] == 'auto' and q['severity'] != 'nice to have']
print(f"\nround {rnd}: {len(findings)} finding(s); {len(todo)} to fix in the loop; "
      f"{sum(q['fix'] == 'approve' for q in findings)} for Rif to approve")
sys.exit(3 if broken else 2 if todo else 1 if findings else 0)
