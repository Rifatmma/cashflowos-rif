// node render.js <project-dir> <916|169|11|45|all|916,169…> [stills t1 t2 … | audit]
// Renders frames from engine.html, mixes VO + score (score.py), muxes <project>/out/<name>_<fmt>.mp4
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));
const [projArg, fmtArg = '916', mode, ...times] = process.argv.slice(2);
if (!projArg) { console.error('usage: node render.js <project-dir> <formats|all> [stills t…]'); process.exit(1); }
const dir = path.resolve(projArg), name = path.basename(dir), out = path.join(dir, 'out');
const FORMATS = ['916', '169', '11', '45'];
const fmts = fmtArg === 'all' ? FORMATS : fmtArg.split(',');
fs.mkdirSync(out, { recursive: true });
const spec = require(path.join(dir, 'spec.js'));

// Chromium: $CHROMIUM_PATH, else a pre-installed Playwright browser, else Playwright's own download
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const exe of ['chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(r, d, exe); if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

async function renderFormat(browser, f) {
  const page = await browser.newPage();
  // a page error means the engine did not run: never let that pass as a clean audit or a render
  page.on('pageerror', e => { console.error('PAGEERR', f, e.message); process.exitCode = 1; if (mode === 'audit') { console.error('AUDIT FAILED: the engine did not load'); process.exit(2); } });
  await page.goto(`${pathToFileURL(path.join(__dirname, 'engine.html')).href}?f=${f}&dir=${encodeURIComponent(pathToFileURL(dir).href)}`);
  await page.evaluate(() => window.ready);
  const grab = t => page.evaluate(async t => { if (window.prepare) await window.prepare(t); render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
  if (mode === 'audit') {
    // source.txt (the article or page text, saved when it was read) lets the audit check figures and cut-off words
    const src = path.join(dir, 'source.txt'), source = fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : '';
    const issues = await page.evaluate(s => window.runAudit(s), source);
    fs.writeFileSync(path.join(out, `audit_${f}.json`), JSON.stringify(issues, null, 1));
    console.log(`\n${f}: ${issues.length ? issues.length + ' issue(s)' : 'no layout issues'}`);
    for (const q of issues) console.log(`  ${q.severity.toUpperCase().padEnd(10)} [${q.kind}] scene ${q.scene} @${q.t}s  "${q.text}" — ${q.detail}`);
    await page.close(); return;
  }
  if (mode === 'stills') {
    for (const t of times) fs.writeFileSync(path.join(out, `still_${f}_${t}.png`), Buffer.from((await grab(+t)).split(',')[1], 'base64'));
    await page.close(); return;
  }
  const vid = path.join(out, `video_${f}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', vid], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(spec.dur * 30);
  for (let i = 0; i < N; i++) {
    const buf = Buffer.from((await grab(i / 30)).split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(f, 'frame', i, '/', N);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  const final = path.join(out, `${name}_${f}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', vid, '-i', path.join(out, 'mix.wav'), '-c:v', 'copy', '-af', loudnessFilter(), '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', final]);
  fs.unlinkSync(vid);
  console.log('done', final);
  await page.close();
}
// Social loudness: −14 LUFS integrated, true peak ≤ −1.5 dBTP (audit target
// −14 ±1, ≤ −1 dBTP). Two-pass loudnorm, linear, so the VO/music balance
// and the ducking are kept — the whole mix just moves by one gain.
let LOUD = null;
function loudnessFilter() {
  if (LOUD) return LOUD;
  const r = require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(out, 'mix.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  try {
    const m = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{')));
    LOUD = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  } catch { LOUD = 'loudnorm=I=-14:TP=-1.5:LRA=11'; }
  return LOUD;
}

// The user's own video clips (SPEC.media entries that are video files) become
// numbered JPEG frames at 30fps, once; engine.html loads the one each frame needs.
function extractClips() {
  const frames = {}, root = path.join(out, '.frames');
  for (const [k, p] of Object.entries(spec.media || {})) {
    if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(p)) continue;
    const src = path.join(dir, p), d = path.join(root, k);
    const fresh = fs.existsSync(path.join(d, '00001.jpg')) && fs.statSync(path.join(d, '00001.jpg')).mtimeMs > fs.statSync(src).mtimeMs;
    if (!fresh) {
      fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', "fps=30,scale='min(1920,iw)':-2", '-q:v', '3', path.join(d, '%05d.jpg')]);
    }
    frames[k] = { n: fs.readdirSync(d).filter(f => f.endsWith('.jpg')).length, fps: 30 };
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'frames.js'), 'window.__FRAMES=' + JSON.stringify(frames) + ';');
}

(async () => {
  extractClips();
  if (mode !== 'stills' && mode !== 'audit') execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'score.py'), dir], { stdio: 'inherit' });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--allow-file-access-from-files'] });
  await Promise.all(fmts.map(f => renderFormat(browser, f)));
  await browser.close();
  if (mode !== 'stills' && mode !== 'audit') remember();
})();

// The look of every finished video, newest first, so the next one can be
// different (SKILL.md: read it before choosing accent / cover / burst / art).
function remember() {
  const home = process.env.MW_VIDEO_HOME || path.join(require('os').homedir(), '.mw-location-video');
  const file = path.join(home, 'history.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first video */ }
  list.unshift({
    title: spec.title, at: new Date().toISOString(),
    accent: spec.accent || 'sun', cover: spec.cover || 'zigzag', burst: spec.burst || 'flip',
    arts: spec.scenes.map(s => s.art).filter(Boolean),
    layouts: spec.scenes.map(s => s.layout).filter(Boolean),
    transitions: spec.scenes.map(s => s.tr).filter(Boolean),
  });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list.slice(0, 20), null, 1));
}
