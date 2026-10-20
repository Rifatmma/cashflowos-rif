// @ts-nocheck
// 👉 The brand-video engine: one frame of a Moving Walls brand film, drawn
//    from a resolved Film and a time in seconds.
//
// Ported as-is from the mw-brand-video skill's engine.html, where it was
// verified frame by frame across two films and four formats (9:16, 16:9,
// 1:1, 4:5). It is kept as close to that source as possible on purpose —
// the skill and this tab must draw the same pictures, so a fix in one is a
// copy-paste in the other, not a re-derivation. That is also why it is
// untyped: the typed surface is lib/mw-brandfilm.ts, which builds the Film
// this draws and is the only thing that calls it.
//
// Pure function of time, like lib/mw-motion: nothing here reads the clock,
// so the in-browser encoder gets frame N at exactly N/30s.

export function createEngine(x, W, H, SPEC, SHAPES, TEX) {
  // ---------- brand tokens (Visual Identity Guidelines) ----------
  const C = {
    blue: '#2B3C92', type: '#273E8F', navy: '#1B1E2B', black: '#151515',
    sky: '#66C9F3', pale: '#BFE7FB', mist: '#E9F6FD', white: '#FFFFFF', grey: '#8A8A8A',
    sun1: '#FEDA24', sun2: '#F59222',            // Sunburst — the one accent
  };
  const LAND = W / H > 1.2, SQ = !LAND && H / W < 1.4;
  const U = Math.min(W, H * (LAND ? .8 : 1)) / 1080;   // type unit
  const PAD = Math.round((LAND ? 110 : 84) * U);

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const oExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const iExpo = t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10);
  const oCub = t => 1 - Math.pow(1 - t, 3);
  const ioCub = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const oBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // ---------- vector brand shapes ----------
  const SH = {};
  for (const k of ['wave_solid', 'wave_outline', 'chevrons', 'logo_mark']) {
    SH[k] = { w: SHAPES[k].w, h: SHAPES[k].h, p: SHAPES[k].d.map(d => new Path2D(d)) };
  }
  SH.logo = { w: SHAPES.logo_full.w, h: SHAPES.logo_full.h, mark: SHAPES.logo_full.mark.map(d => new Path2D(d)), word: SHAPES.logo_full.word.map(d => new Path2D(d)) };
  function logoGrad(w) {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, C.sky); g.addColorStop(.35, C.blue); g.addColorStop(.7, '#262A45'); g.addColorStop(1, C.black); return g;
  }
  // draw a shape so its width = w, top-left at (px,py)
  function shape(name, px, py, w, fill, o = {}) {
    const s = SH[name], k = w / s.w;
    x.save(); x.translate(px, py); x.scale(k, k);
    if (o.alpha != null) x.globalAlpha *= o.alpha;
    x.fillStyle = fill === 'grad' ? logoGrad(s.w) : fill;
    for (const p of s.p) x.fill(p);
    x.restore();
    return s.h * k;
  }
  function logo(cx, cy, w, mode, alpha = 1, blur = 0) {
    const s = SH.logo, k = w / s.w;
    x.save(); x.globalAlpha *= alpha; if (blur > .3) x.filter = `blur(${blur}px)`;
    x.translate(cx - w / 2, cy - s.h * k / 2); x.scale(k, k);
    x.fillStyle = mode === 'white' ? C.white : logoGrad(s.w); for (const p of s.mark) x.fill(p);
    x.fillStyle = mode === 'white' ? C.white : '#5F6162'; for (const p of s.word) x.fill(p);
    x.restore();
  }
  // guidebook zigzag strip: alternating solid / outline icons
  function zigStrip(px, py, h, n, col, alpha = 1, offset = 0, rot = 0) {
    const w = h * SH.wave_solid.w / SH.wave_solid.h, gap = h * .18;
    x.save(); x.globalAlpha *= alpha; x.translate(px, py); x.rotate(rot);
    for (let i = -1; i < n + 1; i++) {
      const cx = i * (w + gap) + (offset % (2 * (w + gap)));
      const solid = ((i % 2) + 2) % 2 === 0;
      shape(solid ? 'wave_solid' : 'wave_outline', cx, 0, solid ? w : w * SH.wave_outline.w / SH.wave_solid.w, col);
    }
    x.restore();
  }
  // guidebook heading marker: yellow→orange triple chevron
  function chevrons(px, py, h, alpha = 1, prog = 1) {
    const s = SH.chevrons, k = h / s.h;
    x.save(); x.globalAlpha *= alpha; x.translate(px, py); x.scale(k, k);
    const g = x.createLinearGradient(0, 0, s.w, 0); g.addColorStop(0, C.sun1); g.addColorStop(1, C.sun2);
    x.fillStyle = g;
    s.p.forEach((p, i) => { const a = clamp(prog * 3 - i); if (a > 0) { x.save(); x.globalAlpha *= a; x.translate((1 - a) * -20, 0); x.fill(p); x.restore(); } });
    x.restore();
    return s.w * k;
  }

  // ---------- backgrounds ----------
  const BG = {
    cover() { const g = x.createLinearGradient(0, 0, W, H * .4); g.addColorStop(0, C.blue); g.addColorStop(1, C.navy); return g; },
    navy() { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#20264A'); g.addColorStop(1, C.navy); return g; },
    sky() { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, C.mist); g.addColorStop(.6, '#D3EEFB'); g.addColorStop(1, C.sky); return g; },
    white() { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#F1F7FC'); return g; },
  };
  const DARK = { cover: 1, navy: 1 };
  function background(kind, t, tex) {
    x.fillStyle = BG[kind](); x.fillRect(0, 0, W, H);
    if (tex) {
      const i = DARK[kind] ? TEX.dark : TEX.light;
      if (i.complete && i.naturalWidth) {
        const s = Math.max(W, H) * 1.15 / i.naturalWidth;
        x.save(); x.globalAlpha = DARK[kind] ? .55 : .5; x.globalCompositeOperation = DARK[kind] ? 'screen' : 'multiply';
        x.translate(W / 2 + Math.sin(t * .15) * 30 * U, H / 2 + t * 6 * U); x.rotate(.08);
        x.drawImage(i, -i.naturalWidth * s / 2, -i.naturalHeight * s / 2, i.naturalWidth * s, i.naturalHeight * s); x.restore();
      }
    }
  }

  // ---------- layout (responsive per format) ----------
  // text block + art block; scenes never hard-code pixels
  function layout(kind) {
    if (LAND) return {
      text: { x: PAD, y: H * .24, w: W * .44 },
      art: { x: W * .52, y: H * .14, w: W * .44, h: H * .72 },
    };
    if (SQ) return {
      text: { x: PAD, y: H * .17, w: W - PAD * 2 },
      art: { x: PAD, y: H * (H > W * 1.1 ? .48 : .5), w: W - PAD * 2, h: H * (SPEC.supers ? (H > W * 1.1 ? .34 : .3) : (H > W * 1.1 ? .38 : .36)) },
    };
    return {
      text: { x: PAD, y: H * .16, w: W - PAD * 2 },
      art: { x: PAD * .6, y: H * .46, w: W - PAD * 1.2, h: H * (SPEC.supers ? .36 : .4) },
    };
  }

  // ---------- type ----------
  const STY = {
    h: { size: 132, weight: 800, lead: 1.2, track: -3 },        // headline
    hx: { size: 190, weight: 800, lead: 1.15, track: -5 },        // hero word
    s: { size: 74, weight: 600, italic: true, lead: 1.25, track: -1 }, // subtitle
    b: { size: 44, weight: 400, lead: 1.35, track: 0 },          // body
    lab: { size: 38, weight: 600, lead: 1.7, track: .5 },        // chevron label
    zh: { size: 46, weight: 700, lead: 1.4, track: 2, font: "'Noto Sans SC'" },
  };
  function font(st, size) { return `${st.italic ? 'italic ' : ''}${st.weight} ${size}px ${st.font || 'Poppins'}`; }
  function measure(str, st, size) { x.save(); x.font = font(st, size); x.letterSpacing = st.track * size / 100 + 'px'; const w = x.measureText(str).width; x.restore(); return w; }
  // signature entrance: overscaled + blurred, snapping into focus (kept from the reference's rhythm)
  function slam(t, t0, d = .3) { const p = oExpo(P(t, t0, t0 + d)); return { a: P(t, t0, t0 + d * .35), blur: (1 - p) * 26 * U, sc: lerp(1.16, 1, p) }; }
  function text(str, px, py, st, size, color, fx = {}, align = 'left') {
    const a = fx.a == null ? 1 : fx.a; if (a <= 0) return;
    x.save(); x.globalAlpha *= a; if (fx.blur > .3) x.filter = `blur(${fx.blur}px)`;
    x.translate(px, py); if (fx.sc) x.scale(fx.sc, fx.sc);
    x.font = font(st, size); x.letterSpacing = st.track * size / 100 + 'px'; x.textAlign = align;
    x.fillStyle = color; x.fillText(str, 0, 0); x.restore();
  }
  // a text block: [{t, s, st, color?, out?}] flowing down from block.y
  function textBlock(T, items, blk, dark, align = 'left') {
    let y = blk.y;
    for (const it of items) {
      const st = STY[it.st || 'h'];
      let size = st.size * U * (it.scale || 1);
      const fitW = measure(it.s, st, size); if (fitW > blk.w) size *= blk.w / fitW;
      y += size * (it.st === 'lab' ? 1 : .92);
      if (T >= it.t - .001) {
        const fx = slam(T, it.t, it.st === 'b' || it.st === 'lab' ? .4 : .3);
        if (it.out != null) { const o = iExpo(P(T, it.out, it.out + .2)); fx.a *= 1 - o; fx.blur += o * 30 * U; }
        const col = it.color || (it.st === 's' ? (dark ? C.sky : C.navy) : it.st === 'b' ? (dark ? 'rgba(255,255,255,.8)' : 'rgba(27,30,43,.75)') : (dark ? C.white : C.type));
        const ax = align === 'center' ? blk.x + blk.w / 2 : blk.x;
        if (it.st === 'lab') {
          const cw = chevrons(ax, y - size * .78, size * .8, fx.a, P(T, it.t, it.t + .35));
          text(it.s, ax + cw + size * .5, y, st, size, dark ? C.white : C.type, { a: fx.a }, 'left');
        } else text(it.s, ax, y, st, size, col, fx, align);
        if (it.strike != null && T > it.strike) {
          const w = measure(it.s, st, size), p = oCub(P(T, it.strike, it.strike + .3));
          const g = x.createLinearGradient(ax, 0, ax + w, 0); g.addColorStop(0, C.sun1); g.addColorStop(1, C.sun2);
          x.fillStyle = g; x.fillRect(ax - 6 * U, y - size * .36, (w + 12 * U) * p, size * .1);
        }
      }
      y += size * (st.lead - .92) + (it.gap || 0) * U;
    }
    return y;
  }

  // ---------- art library (each draws into a rect; 1000-unit design space) ----------
  function fit(r, aw, ah) { const k = Math.min(r.w / aw, r.h / ah); x.translate(r.x + (r.w - aw * k) / 2, r.y + (r.h - ah * k) / 2); x.scale(k, k); return k; }
  const ART = {
    // scramble crossing seen from above: zebra bands draw in, screens around it light up
    crossing(u, r, dark, ev) {
      x.save(); fit(r, 1000, 1000);
      const band = (cx, cy, rot, n, t0) => {
        x.save(); x.translate(cx, cy); x.rotate(rot);
        for (let i = 0; i < n; i++) { const p = oExpo(P(u, t0 + i * .03, t0 + .35 + i * .03)); x.fillStyle = dark ? 'rgba(255,255,255,.85)' : C.blue; x.fillRect(-170 + i * 52, -60, 30, 120 * p); }
        x.restore();
      };
      band(500, 190, 0, 7, 0); band(500, 810, 0, 7, .08); band(190, 500, Math.PI / 2, 7, .16); band(810, 500, Math.PI / 2, 7, .24);
      x.save(); x.translate(500, 500); x.rotate(Math.PI / 4); for (let i = 0; i < 9; i++) { const p = oExpo(P(u, .35 + i * .03, .7 + i * .03)); x.fillStyle = dark ? 'rgba(102,201,243,.55)' : 'rgba(102,201,243,.7)'; x.fillRect(-230 + i * 54, -300 * p, 26, 600 * p); } x.restore();
      // screens on the corner buildings
      [[60, 40], [780, 30], [40, 790], [800, 800]].forEach(([sx, sy], i) => {
        const on = ev.screens != null ? oBack(P(u, ev.screens + i * .12, ev.screens + .3 + i * .12), 2) : 0;
        x.fillStyle = dark ? '#262C52' : '#DCEAF6'; x.fillRect(sx, sy, 160, 170);
        if (on > 0) { x.save(); x.translate(sx + 80, sy + 80); x.scale(on, on); const g = x.createLinearGradient(-60, 0, 60, 0); g.addColorStop(0, C.sky); g.addColorStop(1, C.blue); x.fillStyle = g; x.fillRect(-62, -58, 124, 100); shape('wave_solid', -40, -28, 80, C.white); x.restore(); }
      });
      // pedestrians crossing (dots)
      const rr = rnd(5);
      for (let k = 0; k < 40; k++) { const a = rr() * Math.PI * 2, sp = .3 + rr() * .5, d = ((u * sp * 200 + rr() * 600) % 600) - 300; x.fillStyle = k % 5 ? (dark ? 'rgba(255,255,255,.7)' : C.navy) : C.sun1; x.beginPath(); x.arc(500 + Math.cos(a) * d, 500 + Math.sin(a) * d, 7, 0, 7); x.fill(); }
      x.restore();
    },
    // departures board (split-flap), rows supplied by spec
    board(u, r, dark, ev) {
      x.save(); const rows = ev.rows; const k = fit(r, 1000, rows.length * 130);
      rows.forEach((row, i) => {
        const y = i * 130;
        x.fillStyle = dark ? 'rgba(10,12,30,.55)' : 'rgba(43,60,146,.92)'; x.beginPath(); x.roundRect(0, y, 1000, 110, 14); x.fill();
        const g = x.createLinearGradient(0, 0, 0, 110); g.addColorStop(0, C.sun1); g.addColorStop(1, C.sun2); x.fillStyle = g; x.fillRect(0, y, 10, 110);
        const rr = rnd(Math.floor(u * 24) * 31 + i * 7); let s = '';
        for (let j = 0; j < row.length; j++) s += (u > .1 + i * .08 + j * .02 || row[j] === ' ') ? row[j] : 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(rr() * 33)];
        x.font = '600 52px Poppins'; x.letterSpacing = '4px'; x.fillStyle = C.white; x.globalAlpha = P(u, i * .06, i * .06 + .1); x.fillText(s, 44, y + 72); x.globalAlpha = 1;
      });
      x.restore();
    },
    // rail line: stations light up as the train passes, a screen pops at each
    rail(u, r, dark, ev) {
      x.save(); fit(r, 1000, 600);
      const ly = 420, x0 = 60, x1 = 940, lp = oCub(P(u, 0, .8));
      x.strokeStyle = dark ? 'rgba(102,201,243,.6)' : C.sky; x.lineWidth = 10; x.lineCap = 'round';
      x.beginPath(); x.moveTo(x0, ly); x.lineTo(lerp(x0, x1, lp), ly); x.stroke();
      const tx = lerp(x0 - 140, x1 + 140, ioCub(P(u, ev.train || .6, (ev.train || .6) + 2.4)));
      ev.stations.forEach((nm, i) => {
        const sx = lerp(x0, x1, i / (ev.stations.length - 1)); if (sx > lerp(x0, x1, lp) + 1) return;
        const lit = tx > sx;
        x.fillStyle = lit ? C.sky : (dark ? C.navy : C.white); x.strokeStyle = C.sky; x.lineWidth = 6; x.beginPath(); x.arc(sx, ly, 20, 0, 7); x.fill(); x.stroke();
        x.font = '600 24px Poppins'; x.textAlign = 'center'; x.letterSpacing = '2px'; x.fillStyle = dark ? 'rgba(255,255,255,.75)' : C.type; x.fillText(nm, sx, ly + 72);
        const sp = oBack(clamp((tx - sx) / 180), 2);
        if (sp > 0) { x.save(); x.translate(sx, ly - 50); x.scale(sp, sp); const g = x.createLinearGradient(0, -230, 0, 0); g.addColorStop(0, C.sky); g.addColorStop(1, C.blue); x.fillStyle = g; x.beginPath(); x.roundRect(-70, -240, 140, 190, 10); x.fill(); shape('wave_solid', -46, -170, 92, C.white); x.fillStyle = C.blue; x.fillRect(-5, -50, 10, 50); x.restore(); }
      });
      x.fillStyle = dark ? C.white : C.navy; x.beginPath(); x.roundRect(tx - 120, ly - 30, 240, 60, 30); x.fill();
      x.fillStyle = C.sky; for (let k = 0; k < 5; k++) x.fillRect(tx - 92 + k * 38, ly - 12, 24, 18);
      x.restore();
    },
    // brand connection network: nodes for each label, links draw in
    network(u, r, dark, ev) {
      x.save(); fit(r, 1000, 1000);
      const rr = rnd(9), nodes = [];
      for (let i = 0; i < 26; i++) nodes.push([80 + rr() * 840, 80 + rr() * 840, rr()]);
      const hubs = ev.labels.map((l, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / ev.labels.length; return [500 + Math.cos(a) * 300, 500 + Math.sin(a) * 300, l, ev.at ? ev.at[i] : i * .4]; });
      x.lineWidth = 2;
      nodes.forEach((n, i) => nodes.slice(i + 1).forEach(m => { const d = Math.hypot(n[0] - m[0], n[1] - m[1]); if (d < 230) { x.strokeStyle = dark ? `rgba(102,201,243,${.25 * P(u, n[2], n[2] + .6)})` : `rgba(43,60,146,${.18 * P(u, n[2], n[2] + .6)})`; x.beginPath(); x.moveTo(n[0], n[1]); x.lineTo(m[0], m[1]); x.stroke(); } }));
      nodes.forEach(n => { x.fillStyle = dark ? 'rgba(191,231,251,.7)' : 'rgba(43,60,146,.45)'; x.beginPath(); x.arc(n[0], n[1], 5 * P(u, n[2] * .8, n[2] * .8 + .2), 0, 7); x.fill(); });
      // centre hub = MW mark
      const cp = oBack(P(u, ev.centre || 0, (ev.centre || 0) + .4), 1.8);
      hubs.forEach(([hx, hy, l, t0]) => {
        const p = oCub(P(u, t0, t0 + .4));
        x.strokeStyle = C.sky; x.lineWidth = 6; x.beginPath(); x.moveTo(500, 500); x.lineTo(lerp(500, hx, p), lerp(500, hy, p)); x.stroke();
        const q = oBack(P(u, t0 + .25, t0 + .6), 2);
        if (q > 0) { x.save(); x.translate(hx, hy); x.scale(q, q); x.fillStyle = dark ? C.white : C.blue; x.beginPath(); x.arc(0, 0, 46, 0, 7); x.fill(); x.fillStyle = C.sun1; x.beginPath(); x.arc(0, 0, 16, 0, 7); x.fill(); x.restore();
          x.font = '700 46px Poppins'; x.textAlign = 'center'; x.fillStyle = dark ? C.white : C.type; x.globalAlpha = q > 1 ? 1 : q; x.fillText(l, hx, hy + (hy > 500 ? 112 : -78)); x.globalAlpha = 1; }
      });
      if (cp > 0) { x.save(); x.translate(500, 500); x.scale(cp, cp); x.fillStyle = dark ? C.white : C.navy; x.beginPath(); x.arc(0, 0, 110, 0, 7); x.fill(); shape('logo_mark', -78, -28, 156, dark ? 'grad' : C.white); x.restore(); }
      x.restore();
    },
    // flight / route map: origin hub with arcs to destinations
    routes(u, r, dark, ev) {
      x.save(); fit(r, 1000, 800);
      const o = ev.origin, ds = ev.dests;
      // faint dotted world grid
      for (let gx = 40; gx < 1000; gx += 40) for (let gy = 40; gy < 800; gy += 40) { x.fillStyle = dark ? 'rgba(191,231,251,.12)' : 'rgba(43,60,146,.1)'; x.fillRect(gx, gy, 3, 3); }
      ds.forEach((d, i) => {
        const t0 = (ev.at ? ev.at[i] : .3 + i * .25), p = ioCub(P(u, t0, t0 + .7));
        const mx = (o[0] + d[0]) / 2, my = Math.min(o[1], d[1]) - 160 - Math.abs(o[0] - d[0]) * .15;
        x.strokeStyle = C.sky; x.lineWidth = 5; x.setLineDash([2, 14]); x.lineCap = 'round';
        x.beginPath(); const N = 40; for (let k = 0; k <= N * p; k++) { const s = k / N, px = (1 - s) ** 2 * o[0] + 2 * (1 - s) * s * mx + s * s * d[0], py = (1 - s) ** 2 * o[1] + 2 * (1 - s) * s * my + s * s * d[1]; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.setLineDash([]);
        if (p > 0 && p < 1) { const s = p, px = (1 - s) ** 2 * o[0] + 2 * (1 - s) * s * mx + s * s * d[0], py = (1 - s) ** 2 * o[1] + 2 * (1 - s) * s * my + s * s * d[1]; x.fillStyle = C.sun1; x.beginPath(); x.arc(px, py, 12, 0, 7); x.fill(); }
        const q = oBack(P(u, t0 + .6, t0 + .9), 2);
        if (q > 0) { x.save(); x.translate(d[0], d[1]); x.scale(q, q); x.fillStyle = dark ? C.white : C.blue; x.beginPath(); x.arc(0, 0, 22, 0, 7); x.fill(); x.strokeStyle = C.sky; x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 40 + 8 * Math.sin(u * 5 + i), 0, 7); x.stroke(); x.restore();
          x.font = '700 38px Poppins'; x.letterSpacing = '2px'; x.textAlign = d[3] || 'center'; x.fillStyle = dark ? C.white : C.type; x.globalAlpha = clamp(q); x.fillText(d[2], d[0], d[1] + 78); x.globalAlpha = 1; }
      });
      const op = oBack(P(u, 0, .4), 2);
      x.save(); x.translate(o[0], o[1]); x.scale(op, op); x.fillStyle = C.sun1; x.beginPath(); x.arc(0, 0, 30, 0, 7); x.fill(); x.restore();
      x.font = '800 44px Poppins'; x.textAlign = 'center'; x.fillStyle = dark ? C.sun1 : C.type; x.globalAlpha = P(u, .2, .4); x.fillText(o[2], o[0], o[1] + 92); x.globalAlpha = 1;
      x.restore();
    },
    // media formats: tiles flip in (airport / transit / retail …)
    formats(u, r, dark, ev) {
      const n = ev.items.length, cols = LAND ? 1 : n, rows = LAND ? n : 1;
      x.save(); const k = fit(r, cols * 320, rows * (LAND ? 210 : 380));
      ev.items.forEach((it, i) => {
        const t0 = ev.at ? ev.at[i] : i * .3, p = oBack(P(u, t0, t0 + .45), 1.6);
        const cx = (LAND ? 0 : i * 320) + 150, cy = (LAND ? i * 210 : 0) + (LAND ? 100 : 180);
        x.save(); x.translate(cx, cy); x.scale(1, clamp(p, 0, 1.2)); x.globalAlpha = clamp(p * 2);
        const g = x.createLinearGradient(-140, -100, 140, 100); g.addColorStop(0, dark ? C.blue : C.white); g.addColorStop(1, dark ? '#1F2554' : C.mist);
        x.fillStyle = g; x.beginPath(); x.roundRect(-140, LAND ? -90 : -170, 280, LAND ? 180 : 340, 22); x.fill();
        x.strokeStyle = dark ? 'rgba(102,201,243,.5)' : 'rgba(43,60,146,.25)'; x.lineWidth = 3; x.stroke();
        ICON[it[0]]?.(LAND ? -70 : 0, LAND ? 0 : -40, LAND ? .7 : 1, dark);
        x.font = `700 ${LAND ? 30 : 32}px Poppins`; x.textAlign = LAND ? 'left' : 'center'; x.fillStyle = dark ? C.white : C.type; x.fillText(it[1], LAND ? 10 : 0, LAND ? 12 : 120);
        x.restore();
      });
      x.restore();
    },
    // big number with rolling digits
    number(u, r, dark, ev) {
      if (u < 0) return;
      x.save(); x.globalAlpha = P(u, 0, .15); fit(r, 1000, 600);
      const s = String(ev.value), size = 360; let cx = 500 - measure(s, STY.hx, size) / 2;
      x.font = font(STY.hx, size);
      for (let i = 0; i < s.length; i++) {
        const ch = s[i], dw = x.measureText(ch).width;
        if (/\d/.test(ch)) {
          const loc = clamp((u - .1 - i * .1) / .8), roll = (1 - oCub(loc)) * 14, cur = (+ch + roll) % 10, fr = cur - Math.floor(cur);
          x.save(); x.beginPath(); x.rect(cx - 4, 70, dw + 8, size); x.clip();
          if (roll > .05) x.filter = `blur(${Math.min(12, roll * 5)}px)`;
          x.fillStyle = dark ? C.white : C.type;
          x.fillText(String(Math.floor(cur) % 10), cx, 380 - fr * size); x.fillText(String((Math.floor(cur) + 1) % 10), cx, 380 - fr * size + size);
          x.restore();
        } else { x.fillStyle = dark ? C.sky : C.blue; x.fillText(ch, cx, 380); }
        cx += dw;
      }
      if (ev.unit) { x.font = font(STY.s, 64); x.textAlign = 'center'; x.fillStyle = dark ? C.sky : C.navy; x.globalAlpha = P(u, .9, 1.2); x.fillText(ev.unit, 500, 500); }
      x.restore();
    },
    // service lines stacking up; the last one (ev.fresh) lands highlighted in Sunburst
    lines(u, r, dark, ev) {
      x.save(); const n = ev.items.length; fit(r, 1000, n * 150);
      ev.items.forEach((lab, i) => {
        const fresh = i === n - 1, t0 = fresh ? ev.freshAt : i * .12, p = (fresh ? oBack : oExpo)(P(u, t0, t0 + .5), 1.4);
        const y = (n - 1 - i) * 150, wd = (fresh ? 1000 : 820 - i * 90) * clamp(p, 0, 1.1);
        if (wd <= 0) return;
        if (fresh) { const g = x.createLinearGradient(0, 0, 1000, 0); g.addColorStop(0, C.sun1); g.addColorStop(1, C.sun2); x.fillStyle = g; }
        else x.fillStyle = dark ? 'rgba(102,201,243,.28)' : (i % 2 ? C.pale : 'rgba(43,60,146,.16)');
        x.beginPath(); x.roundRect(0, y, wd, 116, 58); x.fill();
        x.globalAlpha = P(u, t0 + .2, t0 + .4); x.font = `${fresh ? 700 : 600} 44px Poppins`; x.fillStyle = fresh ? C.navy : (dark ? C.white : C.type);
        x.fillText(lab, 44, y + 74);
        if (fresh) { x.textAlign = 'right'; x.font = '800 54px Poppins'; x.fillText('+', wd - 44, y + 76); x.textAlign = 'left'; }
        x.globalAlpha = 1;
      });
      x.restore();
    },
    // a different report from every market: mismatched cards fan out
    reports(u, r, dark, ev) {
      x.save(); fit(r, 1000, 760);
      const rr = rnd(21);
      ev.items.forEach((code, i) => {
        const n = ev.items.length, t0 = ev.at ? ev.at[i] : i * .18, p = oBack(P(u, t0, t0 + .45), 1.5);
        if (p <= 0) return;
        const ang = (i - (n - 1) / 2) * .16, cx = 500 + (i - (n - 1) / 2) * 150, cy = 420 - Math.abs(i - (n - 1) / 2) * 20;
        x.save(); x.translate(cx, cy + (1 - clamp(p)) * 400); x.rotate(ang * clamp(p));
        x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 30; x.shadowOffsetY = 14;
        x.fillStyle = C.white; x.beginPath(); x.roundRect(-150, -210, 300, 420, 16); x.fill(); x.shadowColor = 'transparent';
        const hue = [C.blue, C.sun2, '#25534A', '#871A1C', C.sky][i % 5];
        x.fillStyle = hue; x.fillRect(-150, -210, 300, 64);
        x.font = '700 34px Poppins'; x.fillStyle = C.white; x.fillText(code, -126, -166);
        // each report has its own layout: bars, pie, table
        const kind = i % 3;
        if (kind === 0) for (let k = 0; k < 6; k++) { const h = 40 + rr() * 140; x.fillStyle = hue; x.globalAlpha = .7; x.fillRect(-120 + k * 42, 150 - h, 28, h); x.globalAlpha = 1; }
        if (kind === 1) { x.fillStyle = hue; x.beginPath(); x.moveTo(0, 30); x.arc(0, 30, 100, -1.2, 2.4); x.fill(); x.globalAlpha = .3; x.beginPath(); x.moveTo(0, 30); x.arc(0, 30, 100, 2.4, 5.1); x.fill(); x.globalAlpha = 1; }
        if (kind === 2) for (let k = 0; k < 7; k++) { x.fillStyle = k % 2 ? '#EEF2F8' : '#DCE4F0'; x.fillRect(-126, -120 + k * 40, 252, 34); x.fillStyle = hue; x.fillRect(-116, -108 + k * 40, 60 + rr() * 140, 10); }
        x.fillStyle = 'rgba(27,30,43,.25)'; for (let k = 0; k < 3; k++) x.fillRect(-126, 168 + k * 14 - (kind === 2 ? 0 : 0), 200 - k * 50, 6);
        x.restore();
      });
      x.restore();
    },
    skyline(u, r, dark, ev) {
      x.save(); fit(r, 1000, 760); const base = 700, col = dark ? C.white : C.type;
      const sp = oCub(P(u, .3, 1.4)); x.save(); x.beginPath(); x.rect(0, 0, 1000, base); x.clip();
      const g = x.createLinearGradient(0, 200, 0, 700); g.addColorStop(0, C.sky); g.addColorStop(1, C.blue); x.fillStyle = g; x.beginPath(); x.arc(560, base - 60 - 240 * sp, 210, 0, 7); x.fill(); x.restore();
      const line = (pts, p) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); x.setLineDash([L * p, L]); x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(...q) : x.moveTo(...q)); x.stroke(); x.setLineDash([]); };
      x.strokeStyle = col; x.lineWidth = 5; x.lineJoin = 'round';
      const rr = rnd(3); let bx = 20; while (bx < 980) { const bw = 40 + rr() * 60, bh = 60 + rr() * 160, d = bx / 1000; line([[bx, base], [bx, base - bh], [bx + bw, base - bh], [bx + bw, base]], P(u, d * .5, d * .5 + .4)); bx += bw + 6; }
      x.strokeStyle = C.sun2; line([[220, base], [282, base - 300], [294, base - 520], [300, base - 600], [306, base - 520], [318, base - 300], [380, base]], P(u, .1, .9));
      x.strokeStyle = col; line([[700, base], [728, base - 420], [732, base - 620], [740, base - 700], [748, base - 620], [752, base - 420], [780, base]], P(u, .25, 1.05));
      x.lineWidth = 3; line([[0, base], [1000, base]], P(u, 0, .4));
      x.restore();
    },
  };
  // simple line icons for format tiles
  const ICON = {
    plane(cx, cy, s, dark) { x.save(); x.translate(cx, cy); x.scale(s, s); x.rotate(-.5); x.fillStyle = dark ? C.sky : C.blue; x.beginPath(); x.moveTo(-70, 8); x.lineTo(60, 8); x.quadraticCurveTo(84, 0, 60, -8); x.lineTo(-70, -8); x.fill(); x.beginPath(); x.moveTo(-5, -6); x.lineTo(-40, -60); x.lineTo(-20, -60); x.lineTo(30, -6); x.moveTo(-5, 6); x.lineTo(-40, 60); x.lineTo(-20, 60); x.lineTo(30, 6); x.fill(); x.fillRect(-72, -26, 12, 52); x.restore(); },
    train(cx, cy, s, dark) { x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = dark ? C.sky : C.blue; x.beginPath(); x.roundRect(-55, -70, 110, 120, 22); x.fill(); x.fillStyle = dark ? C.navy : C.white; x.fillRect(-38, -50, 76, 40); x.beginPath(); x.arc(-28, 25, 9, 0, 7); x.arc(28, 25, 9, 0, 7); x.fill(); x.fillStyle = dark ? C.sky : C.blue; x.fillRect(-50, 58, 20, 18); x.fillRect(30, 58, 20, 18); x.restore(); },
    bag(cx, cy, s, dark) { x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = dark ? C.sky : C.blue; x.beginPath(); x.roundRect(-55, -35, 110, 100, 12); x.fill(); x.strokeStyle = dark ? C.sky : C.blue; x.lineWidth = 10; x.beginPath(); x.arc(0, -35, 30, Math.PI, 0); x.stroke(); x.restore(); },
    screen(cx, cy, s, dark) { x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = dark ? C.sky : C.blue; x.beginPath(); x.roundRect(-75, -60, 150, 100, 10); x.fill(); x.fillRect(-6, 40, 12, 30); shape('wave_solid', -40, -30, 80, C.white); x.restore(); },
    road(cx, cy, s, dark) { x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = dark ? C.sky : C.blue; x.beginPath(); x.roundRect(-80, -70, 160, 80, 8); x.fill(); x.fillRect(-8, 10, 16, 60); shape('wave_solid', -36, -55, 72, C.white); x.restore(); },
  };

  // ---------- transitions (brand-native) ----------
  // zig: giant zigzags sweep diagonally across the cut
  function zigSweep(T, t0, dark) {
    const p = P(T, t0 - .32, t0 + .32); if (p <= 0 || p >= 1) return;
    const e = ioCub(p), big = Math.max(W, H) * .9, h = big * SH.wave_solid.h / SH.wave_solid.w;
    x.save(); x.translate(W / 2, H / 2); x.rotate(-.35);
    const off = lerp(-big * 1.3, big * 1.3, e);
    x.filter = `blur(${Math.sin(p * Math.PI) * 8 * U}px)`;
    const rows = 7, cols = [C.sky, C.blue, C.navy, C.sky, C.blue, C.pale, C.sky];
    for (let r = 0; r < rows; r++) {
      const dy = (r - (rows - 1) / 2) * h * .78, lag = (r % 2 ? 1 : -1) * big * .1;
      shape(r === 5 ? 'wave_outline' : 'wave_solid', off - big / 2 + lag, dy - h / 2, big, cols[r]);
    }
    x.restore();
  }
  // chev: brand chevrons push the new scene in from the left
  function chevPush(T, t0, drawOld, drawNew) {
    const p = ioCub(P(T, t0 - .25, t0 + .25)); const k = H * 1.1 / SH.chevrons.h, cw = SH.chevrons.w * k;
    const xx = lerp(-cw, W + cw * .2, p);
    drawOld();
    x.save(); x.beginPath(); x.moveTo(0, 0); x.lineTo(xx, 0); x.lineTo(xx + H * .25, H / 2); x.lineTo(xx, H); x.lineTo(0, H); x.closePath(); x.clip(); drawNew(); x.restore();
    x.save(); x.translate(xx - cw * .55, -H * .05); x.scale(k, k);
    const g = x.createLinearGradient(0, 0, SH.chevrons.w, 0); g.addColorStop(0, C.sun1); g.addColorStop(1, C.sun2);
    SH.chevrons.p.forEach((pp, i) => { x.fillStyle = i === 0 ? C.blue : i === 1 ? C.sky : g; x.fill(pp); });
    x.restore();
  }

  // ---------- scene kinds ----------
  const KIND = {
    // big statement over the cover zigzag pattern (guidebook cover)
    cover(sc, T) {
      background('cover', T, false);
      const big = Math.max(W, H) * .55, rows = LAND ? 3 : 4, h = big * SH.wave_solid.h / SH.wave_solid.w;
      for (let r = 0; r < rows; r++) {
        const p = oExpo(P(T, sc.a + r * .08, sc.a + .7 + r * .08));
        const dx = (r % 2 ? -1 : 1) * (1 - p) * W * .6 + Math.sin((T + r) * .5) * 20 * U - big * .35 * r;
        for (let i = 0; i < 4; i++) {
          const solid = (i + r) % 2 === 0;
          shape(solid ? 'wave_solid' : 'wave_outline', dx + i * big * 1.04 - big * .3, H * (LAND ? -.08 : .02) + r * h * 1.25, big, solid ? C.sky : C.pale, { alpha: (solid ? .9 : .8) * (r === rows - 1 ? .45 : 1) * clamp(p * 2) });
        }
      }
      const veil = x.createLinearGradient(0, H * .35, 0, H); veil.addColorStop(0, 'rgba(27,30,43,0)'); veil.addColorStop(.6, 'rgba(27,30,43,.85)'); veil.addColorStop(1, 'rgba(27,30,43,.95)');
      x.fillStyle = veil; x.fillRect(0, 0, W, H);
      const blk = { x: PAD, y: LAND ? H * .5 : H * .6, w: W - PAD * 2 };
      textBlock(T, sc.text, blk, true);
    },
    // headline + art panel
    panel(sc, T) {
      const dark = !!DARK[sc.bg];
      background(sc.bg, T, sc.tex);
      const L = layout();
      x.save(); const push = 1 + .03 * P(T, sc.a, sc.b); x.translate(W / 2, H / 2); x.scale(push, push); x.translate(-W / 2, -H / 2);
      if (sc.art) { x.save(); const ap = sc.artAt ?? sc.a; ART[sc.art](T - ap, L.art, dark, sc.ev || {}); x.restore(); }
      x.restore();
      textBlock(T, sc.text, L.text, dark);
    },
    // centred words, one per beat, chevrons drive them
    burst(sc, T) {
      const i = sc.words.findLastIndex(w => T >= w.t); const w = sc.words[Math.max(0, i)];
      const bg = w.bg || sc.bg; background(bg, T, false); const dark = !!DARK[bg];
      zigStrip(-40 * U, H * .5 + 160 * U * (LAND ? .8 : 1), 70 * U, Math.ceil(W / (190 * U)) + 2, dark ? 'rgba(102,201,243,.35)' : 'rgba(43,60,146,.18)', 1, (T - w.t) * 260 * U);
      if (i < 0) return;
      const st = STY[w.st || 'hx']; let size = st.size * U * (LAND ? 1.15 : 1);
      const full = sz => measure(w.s, st, sz) + sz * .62 * SH.chevrons.w / SH.chevrons.h + sz * .22;
      if (full(size) > W - PAD * 2) size *= (W - PAD * 2) / full(size);
      const shift = (size * .62 * SH.chevrons.w / SH.chevrons.h + size * .22) / 2;
      const fx = slam(T, w.t, .18); fx.sc *= 1 + (T - w.t) * .05;
      const chH = size * .62, chW = chH * SH.chevrons.w / SH.chevrons.h;
      chevrons(W / 2 + shift - measure(w.s, st, size) / 2 - chW - size * .22, H * .5 - size * .66, chH, fx.a, P(T, w.t, w.t + .2));
      text(w.s, W / 2 + shift, H * .5, st, size, w.color || (dark ? C.white : C.type), fx, 'center');
      if (sc.sub) textBlock(T, sc.sub, { x: PAD, y: H * .62, w: W - PAD * 2 }, dark, 'center');
    },
    // brand moment: white MW mark slams on the cover gradient
    logo(sc, T) {
      background('cover', T, true); const u = T - sc.a, lp = oExpo(P(u, 0, .35));
      logo(W / 2, H * .47, 560 * U * lerp(1.2, 1, lp), 'white', P(u, 0, .12), (1 - lp) * 26 * U);
      if (sc.text) textBlock(T, sc.text, { x: PAD, y: H * .58, w: W - PAD * 2 }, true, 'center');
    },
    end(sc, T) {
      background('white', T, true);
      const u = T - sc.a, lp = oExpo(P(u, 0, .5));
      const lw = (LAND ? 620 : 640) * U;
      logo(W / 2, H * (LAND ? .36 : .4), lw * lerp(1.12, 1, lp), 'color', P(u, 0, .15), (1 - lp) * 22 * U);
      textBlock(T, sc.text, { x: PAD, y: H * (LAND ? .54 : .53), w: W - PAD * 2 }, false, 'center');
      zigStrip(-60 * U, H - 140 * U, 56 * U, Math.ceil(W / (150 * U)) + 2, C.sky, P(u, .3, .8), u * 60 * U);
      x.fillStyle = `rgba(255,255,255,${P(T, sc.b - .5, sc.b)})`; x.fillRect(0, 0, W, H);
    },
  };

  // ---------- persistent chrome: guidebook footer strip + Chinese supers ----------
  function chrome(T, sc) {
    const dark = !!DARK[sc.bg] || sc.kind === 'cover';
    if (sc.kind !== 'end' && sc.kind !== 'burst') zigStrip(-30 * U, H - 92 * U, 34 * U, Math.ceil(W / (90 * U)) + 2, dark ? 'rgba(102,201,243,.5)' : 'rgba(43,60,146,.28)', 1, T * 30 * U);
    const sub = (SPEC.supers || []).find(s => T >= s.a && T < s.b);
    if (sub) {
      const a = P(T, sub.a, sub.a + .15) * (1 - P(T, sub.b - .15, sub.b));
      let size = 44 * U; x.save(); x.font = `700 ${size}px 'Noto Sans SC'`; let w = x.measureText(sub.zh).width;
      const maxW = LAND && sc.kind === 'panel' ? W * .44 - 56 * U : W - PAD * 2.4;
      if (w > maxW) { size *= maxW / w; x.font = `700 ${size}px 'Noto Sans SC'`; w = x.measureText(sub.zh).width; }
      const y = H - (LAND ? 170 : 210) * U, side = LAND && sc.kind === 'panel';
      const cx = side ? PAD + w / 2 + 28 * U : W / 2;
      x.globalAlpha = a; x.fillStyle = 'rgba(27,30,43,.72)'; x.beginPath(); x.roundRect(cx - w / 2 - 28 * U, y - size * 1.05, w + 56 * U, size * 1.55, 12 * U); x.fill();
      x.fillStyle = C.white; x.textAlign = 'center'; x.fillText(sub.zh, cx, y); x.restore();
    }
  }

  // ---------- dispatcher ----------
  function drawScene(sc, T) { x.save(); KIND[sc.kind](sc, T); x.restore(); }
  function render(T) {
    x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none'; x.globalAlpha = 1;
    const S = SPEC.scenes; let i = S.findIndex(s => T >= s.a && T < s.b); if (i < 0) i = S.length - 1;
    const sc = S[i];
    const nxt = S[i + 1], prv = S[i - 1];
    // chevron push spans the cut, so it needs both scenes
    if (nxt && nxt.tr === 'chev' && T > nxt.a - .25) chevPush(T, nxt.a, () => drawScene(sc, T), () => drawScene(nxt, T));
    else if (sc.tr === 'chev' && prv && T < sc.a + .25) chevPush(T, sc.a, () => drawScene(prv, T), () => drawScene(sc, T));
    else drawScene(sc, T);
    chrome(T, sc);
    for (const s of S) if (s.tr === 'zig') zigSweep(T, s.a, true);
  }
  return render
}
