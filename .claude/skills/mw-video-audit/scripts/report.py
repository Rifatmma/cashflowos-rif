# The audit email for one video: python3 report.py <project> <slug> <fmts> --title T [--videos URL] [--article URL]
#
#   --videos   where the MP4s are (a folder link; each file is <videos>/<slug>_<fmt>.mp4)
#   --article  the source article or page
#
# Reads out/audit.json (the final round), out/audit_history.json (what the loop fixed)
# and out/lessons_added.json (["rule — what happened", …], what this audit taught the
# video skills). Writes out/report.html (the email body) and out/report.txt (plain text).
# Sections: verdict per format · still open, by severity · needs Rif's OK · caught and
# fixed before Rif saw it · lessons added · the files.

import sys, os, json, html, argparse
ap = argparse.ArgumentParser()
ap.add_argument('project'); ap.add_argument('slug'); ap.add_argument('fmts')
ap.add_argument('--title', required=True); ap.add_argument('--videos', default=''); ap.add_argument('--article', default='')
a = ap.parse_args()
OUT = os.path.join(os.path.abspath(a.project), 'out')
load = lambda n, d: json.load(open(os.path.join(OUT, n))) if os.path.exists(os.path.join(OUT, n)) else d
final, fixed, lessons = load('audit.json', {'round': 0, 'findings': []}), load('audit_history.json', []), load('lessons_added.json', [])
NAME = {'916': '9:16', '45': '4:5', '11': '1:1', '169': '16:9'}
FMTS = [f for f in a.fmts.split(',') if f]
COL = {'blocker': '#B32322', 'should fix': '#C77700', 'nice to have': '#2B3C92'}
e = html.escape
td = 'style="padding:6px 8px;border-bottom:1px solid #e3e6ef;vertical-align:top;font-size:13px"'
th = 'style="padding:6px 8px;text-align:left;font-size:12px;color:#556;border-bottom:2px solid #2B3C92"'
fs = final['findings']
open_ = [q for q in fs if q['fix'] == 'auto']
ask = [q for q in fs if q['fix'] == 'approve']

def verdict(fl):
    rs = [q for q in fs if fl in q['fmts'] or 'all' in q['fmts']]
    if any(q['severity'] == 'blocker' for q in rs): return 'Blocked', COL['blocker']
    if any(q['severity'] == 'should fix' for q in rs): return 'Should fix', COL['should fix']
    return 'Pass', '#1E7B3A'

def table(rows, status=None):
    out = [f'<table style="border-collapse:collapse;width:100%"><tr>' + ''.join(f'<th {th}>{h}</th>' for h in
           ['Severity', 'Format', 'When · scene', 'What', 'Rule', 'Found by'] + ([status] if status else [])) + '</tr>']
    for q in rows:
        when = (f"{q['t']:.1f}s · " if isinstance(q.get('t'), (int, float)) else '') + e(q.get('scene') or '—')
        what = (f"“{e(q['text'])}” " if q.get('text') else '') + e(q['detail'])
        out.append(f'<tr><td {td}><span style="color:{COL[q["severity"]]};font-weight:600">{q["severity"]}</span></td><td {td}>{", ".join(q["fmts"])}</td>'
                   f'<td {td}>{when}</td><td {td}>{what}</td><td {td}><span style="font-size:12px;color:#556">{e(q.get("rule", ""))}</span></td>'
                   f'<td {td}>{e(q["source"])} · {e(q["kind"])}</td>' + (f'<td {td}>round {q.get("fixed_in_round", "")}</td>' if status else '') + '</tr>')
    return ''.join(out) + '</table>'

H = [f'<div style="font-family:Poppins,Arial,sans-serif;color:#1b2340;max-width:900px">',
     f'<h2 style="color:#2B3C92;margin:0 0 4px">Video audit — {e(a.title)}</h2>',
     f'<p style="margin:0 0 12px;color:#556">Audited before hand-over: layout and timing (what the engine drew), the files, Ava\'s voice, and a Claude review against the article. '
     f'{final["round"]} round{"s" if final["round"] != 1 else ""}; design and timing problems were fixed in the loop.'
     + (f' Source: <a href="{e(a.article)}">{e(a.article)}</a>.' if a.article else '') + '</p>']
H.append(f'<table style="border-collapse:collapse;margin:6px 0 16px"><tr>' + ''.join(f'<th {th}>{NAME[f]}</th>' for f in FMTS) + '</tr><tr>')
for f in FMTS:
    v, c = verdict(NAME[f])
    link = f'<br><a style="font-size:11px" href="{e(a.videos.rstrip("/"))}/{a.slug}_{f}.mp4">{a.slug}_{f}.mp4</a>' if a.videos else ''
    H.append(f'<td {td}><span style="color:{c};font-weight:600">{v}</span>{link}</td>')
H.append('</tr></table>')
if ask:
    H.append(f'<h3 style="color:#B32322;margin:18px 0 6px">Needs your OK ({len(ask)}) — changes to what the video says</h3>' + table(ask))
H.append(f'<h3 style="color:#2B3C92;margin:18px 0 6px">Still open ({len(open_)})</h3>' + (table(open_) if open_ else '<p style="font-size:13px">Nothing — every design, timing and voice finding was fixed.</p>'))
if fixed:
    H.append(f'<h3 style="color:#1E7B3A;margin:18px 0 6px">Caught and fixed before you saw it ({len(fixed)})</h3>' + table(fixed, 'Fixed in'))
if lessons:
    H.append('<h3 style="color:#2B3C92;margin:18px 0 6px">Added to the video skills\' lessons</h3><ul style="font-size:13px">' + ''.join(f'<li>{e(l)}</li>' for l in lessons) + '</ul>')
if a.videos: H.append(f'<p style="font-size:13px"><b>Files:</b> <a href="{e(a.videos)}">{e(a.videos)}</a></p>')
H.append('</div>')
open(os.path.join(OUT, 'report.html'), 'w').write(''.join(H))

T = [f'Video audit — {a.title}', '']
for f in FMTS: T.append(f'{NAME[f]}: {verdict(NAME[f])[0]}' + (f'  {a.videos.rstrip("/")}/{a.slug}_{f}.mp4' if a.videos else ''))
for name, rows in (('NEEDS YOUR OK', ask), ('STILL OPEN', open_), ('FIXED BEFORE YOU SAW IT', fixed)):
    if rows: T += ['', f'{name} ({len(rows)})'] + [f"- [{q['severity']}] {q.get('scene') or ''}: {(q.get('text') or '') + ' — ' if q.get('text') else ''}{q['detail']}" for q in rows]
if lessons: T += ['', 'LESSONS ADDED'] + [f'- {l}' for l in lessons]
open(os.path.join(OUT, 'report.txt'), 'w').write('\n'.join(T))
print(f"report: {len(ask)} to approve, {len(open_)} open, {len(fixed)} fixed in the loop → {os.path.join(OUT, 'report.html')}")
