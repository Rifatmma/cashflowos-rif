# Contact sheets: python3 sheets.py <project> <slug> → sheet_<fmt>.jpg for each rendered format, one settled frame per scene (80% through it)
import sys, json, re, subprocess, os
d, name = sys.argv[1], sys.argv[2]
spec = json.loads(re.search(r'SPEC=(\{.*\});if', open(f'{d}/spec.js').read()).group(1))
st = spec['starts']; dur = spec.get('dur') or st[-1] + 4
ends = st[1:] + [dur]
os.makedirs(f'{d}/sheet', exist_ok=True)
for fmt, w in (('916', 270), ('169', 480), ('45', 300), ('11', 300)):
    if not os.path.exists(f'{d}/out/{name}_{fmt}.mp4'): continue        # only the formats that were rendered
    files = []
    for i, (a, b) in enumerate(zip(st, ends)):
        t = a + (b - a) * .8
        f = f'{d}/sheet/{fmt}_{i:02d}.jpg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', f'{d}/out/{name}_{fmt}.mp4', '-frames:v', '1', '-vf', f'scale={w}:-2', f], check=True)
        files.append(f)
    n = len(files); cols = 4 if fmt == '169' else n
    inputs = sum((['-i', f] for f in files), [])
    pad = [f'[{i}]' for i in range(n)]
    pos = lambda n, unit: '+'.join([unit] * n) or '0'                     # xstack offsets: w0+w0… / h0+h0…
    layout = '|'.join(f'{pos(i % cols, "w0")}_{pos(i // cols, "h0")}' for i in range(n))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', f"{''.join(pad)}xstack=inputs={n}:layout={layout}:fill=white", '-q:v', '4', f'{d}/sheet_{fmt}.jpg'], check=True)
print('ok', d)
