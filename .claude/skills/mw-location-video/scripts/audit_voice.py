# Voice audit of a project's voiceover: python3 audit_voice.py <project-dir>
#
# Prints one JSON object {"voice", "lines": [...], "findings": [...]}, each finding
# {severity, kind, t, line, detail, rule}. Pairs with audit_media.py (the file) and
# the layout audit (what was drawn); this checks what Ava says and how.
#
#   voice          the voice that spoke must be English-only en-US Ava. The
#                  Multilingual voice guesses the language phrase by phrase and
#                  can slip into another accent on a foreign name     blocker
#   accent         Whisper's language guess for the line is under 90% English
#                  (a whole phrase spoken in another language's sound) blocker
#   pronunciation  a word of the script that Whisper hears as something else —
#                  a slipped accent or a misread name/acronym   should fix
#
# Whisper hearing a word differently is a proxy, not proof: names it has never
# seen can fail on perfect speech, so each finding quotes what was heard. Numbers,
# UK/US spellings and compound spacing (touch points / touchpoints) are not
# counted. Needs `pip install faster-whisper` (the small model, ~460 MB, is
# downloaded on first run); without it the voice setting is still checked.

import sys, json, os, re, subprocess, difflib

PD = os.path.abspath(sys.argv[1])
cfg = json.load(open(os.path.join(PD, 'lines.json'), encoding='utf-8'))
vo = json.load(open(os.path.join(PD, 'vo.json'), encoding='utf-8'))
findings = []
def add(sev, kind, detail, rule, line=None, t=None): findings.append({'severity': sev, 'kind': kind, 't': t, 'line': line, 'detail': detail, 'rule': rule})

voice = (vo[0].get('voice') if vo and isinstance(vo[0], dict) else None) or cfg.get('voice') or 'unknown'
if 'Multilingual' in voice or not voice.startswith('en-US-'):
    add('blocker', 'voice', f'spoken by {voice}', 'English-only en-US Ava (en-US-AvaNeural): one consistent American accent')

NUMW = set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen '
           'nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion and percent point dollar dollars'.split())
SMALL = set('a an the in on at of to by for or as is it'.split())
def norm(s):
    s = s.lower().replace("'", '').replace('’', '')
    s = re.sub(r'(?<=[a-z]{3})our', 'or', s); s = re.sub(r'is(e|ed|ing|ation)\b', r'iz\1', s)        # UK → US spelling
    return [w for w in re.sub(r'[^a-z0-9 ]', ' ', s).split() if w not in NUMW and not w.isdigit()]

lines = []
try:
    import numpy as np
    from faster_whisper import WhisperModel
    model = WhisperModel('small', device='cpu', compute_type='int8')
except ImportError:
    model = None
    add('nice to have', 'voice', 'pronunciation and accent not checked — faster-whisper is not installed', 'pip install faster-whisper')

if model:
    for i, line in enumerate(vo):
        wav = os.path.join(PD, f'l{i}.wav')
        pcm = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', wav, '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'],
                                           capture_output=True).stdout, np.float32)
        _, info = model.transcribe(pcm, beam_size=1)                       # language guess, unforced
        p_en = dict(info.all_language_probs or []).get('en', 0)
        segs, _ = model.transcribe(pcm, beam_size=5, language='en')
        heard = ' '.join(s.text for s in segs).strip()
        lines.append({'line': i, 'text': line['text'], 'heard': heard, 'p_en': round(p_en, 3)})
        if p_en < .9:
            other = max((q for q in info.all_language_probs if q[0] != 'en'), key=lambda q: q[1])
            add('blocker', 'accent', f'line {i + 1} sounds {other[0]} ({other[1]:.0%}), English only {p_en:.0%}: “{line["text"]}”',
                'One consistent American accent throughout', i)
        a, b = norm(line['text']), norm(heard)
        # compound spacing and spelled acronyms: compare with the spaces taken out too
        if ''.join(a) == ''.join(b): continue
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b).get_opcodes():
            said, got = ' '.join(a[i1:i2]), ' '.join(b[j1:j2])
            if op == 'equal' or said.replace(' ', '') == got.replace(' ', ''): continue
            if not said: continue                                           # an extra word heard, not a word lost
            words = line.get('words') or []
            t = next((w[1] for w in words if norm(w[0])[:1] == a[i1:i1 + 1]), None)
            # a swallowed small word or the same stem ("plan" → "planned") is diction, not a wrong word
            near = said in SMALL or (got and (got.startswith(said) or said.startswith(got)))
            add('nice to have' if near else 'should fix', 'pronunciation', f'line {i + 1}: “{said}” was heard as “{got or "(nothing)"}” — “{line["text"]}”',
                'Every word clear in an American accent; respell or reword names Ava misreads (acronyms are spoken as letters)', i, t)

order = {'blocker': 0, 'should fix': 1, 'nice to have': 2}
findings.sort(key=lambda q: (order[q['severity']], q['line'] if q['line'] is not None else -1))
print(json.dumps({'project': PD, 'voice': voice, 'lines': lines, 'findings': findings}, indent=1, ensure_ascii=False))
