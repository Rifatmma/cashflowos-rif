// node render.js <project-dir> <916|169|11|45|all|916,169…> [stills t1 t2 …]
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
  page.on('pageerror', e => console.error('PAGEERR', f, e.message));
  await page.goto(`${pathToFileURL(path.join(__dirname, 'engine.html')).href}?f=${f}&dir=${encodeURIComponent(pathToFileURL(dir).href)}`);
  await page.evaluate(() => window.ready);
  const grab = t => page.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
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
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', vid, '-i', path.join(out, 'mix.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', final]);
  fs.unlinkSync(vid);
  console.log('done', final);
  await page.close();
}
(async () => {
  if (mode !== 'stills') execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'score.py'), dir], { stdio: 'inherit' });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--allow-file-access-from-files'] });
  await Promise.all(fmts.map(f => renderFormat(browser, f)));
  await browser.close();
  if (mode !== 'stills') remember();
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
