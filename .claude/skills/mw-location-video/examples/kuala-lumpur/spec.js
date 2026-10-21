// Featured inventory — Kuala Lumpur. Facts and figures from
// movingwalls.com/locations/malaysia/kuala-lumpur (featured sites, 71 sites,
// ~9M Greater KL, footfall measurement) and the /locations/malaysia carousel
// (Giant Cube, Jalan Bukit Bintang, TRX). Reach shown as monthly (user's call).
(function () {
  const VO = (typeof require !== 'undefined') ? require('./vo.json') : window.__VO;
  const START = [0.5, 4.0, 9.5, 16.0, 21.0, 25.5, 30.0, 33.5, 37.5, 41.5, 46.0];
  const w = (l, i) => +(START[l] + VO[l].words[i][1]).toFixed(3);
  const end = l => +(START[l] + VO[l].dur).toFixed(3);

  const SPEC = {
    title: 'Featured sites · Kuala Lumpur v2',
    dur: 52.0, bpm: 120,
    accent: 'crimson', cover: 'mark', burst: 'flip',
    vo: START.map((t, i) => ({ file: `l${i}.wav`, t })),
    photos: { npe: 'sites/lebuhraya-pantai-baru-npe.png', duta: 'sites/duta-park.png', tantan: 'sites/menara-tan-tan.png', cube: 'sites/giant-cube.png', sports: 'sites/sports-direct.png', trx: 'sites/trx.png' },
    scenes: [
      { kind: 'cover', a: 0, b: 4.0, text: [
        { t: .25, s: 'Featured sites · Malaysia', st: 'lab' },
        { t: .35, s: 'Kuala Lumpur', st: 'h' },
        { t: w(0, 2) - .3, s: 'Where Malaysia moves.', st: 's' } ] },
      { kind: 'panel', a: 4.0, b: 9.5, tr: 'zig', bg: 'navy', tex: true, layout: 'center', art: 'number', artAt: w(1, 7) + .2 - 1.1,
        ev: { value: '9M', unit: 'people in Greater KL' }, text: [
        { t: 4.05, s: 'The audience', st: 'lab' },
        { t: 4.0 + .2, s: 'Greater KL', st: 'h' },
        { t: w(1, 11) - .3, s: 'on the move every day.', st: 's' } ] },
      { kind: 'panel', a: 9.5, b: 16.0, tr: 'chev', bg: 'white', tex: true, layout: 'flip', art: 'pins',
        ev: { pins: [[260, 640, 'KL SENTRAL'], [430, 450, 'BUKIT BINTANG'], [720, 560, 'TRX'], [620, 300, 'KLCC'], [480, 130, 'BATU CAVES']],
          at: [w(2, 5), w(2, 6), w(2, 8), w(2, 10), w(2, 12)].map(t => t - 9.5) }, text: [
        { t: 9.55, s: 'Moving Walls', st: 'lab' },
        { t: 9.5 + .2, s: '71 sites', st: 'h' },
        { t: w(2, 4) - .3, s: 'programmatic-ready.', st: 's', color: 'accent' },
        { t: w(2, 9) - .3, s: 'From KLCC to Batu Caves', st: 'b', scale: .8 } ] },
      { kind: 'site', a: 16.0, b: 21.0, tr: 'iris', photo: 'npe', focus: [.03, .06, .24, .56],
        text: [{ t: 16.05, s: '01 / 06 · Highway', st: 'lab' }, { t: 16.2, s: 'New Pantai Expressway', st: 'h', scale: .8 }],
        chip: { t: w(3, 4) - .3, s: 'Portrait LED screen · NPE' },
        stats: [
          { t: w(3, 5) - .2, value: 587921, label: 'Monthly reach', accent: true, roll: w(3, 9) - w(3, 5) },
          { t: w(3, 6), value: 1236240, label: 'Monthly impressions' } ],
        near: { t: w(3, 11) - .2, s: 'Links Sunway & Mid Valley to the city' } },
      { kind: 'site', a: 21.0, b: 25.5, tr: 'slide', photo: 'duta', focus: [.35, .15, .16, .44],
        text: [{ t: 21.05, s: '02 / 06 · City road', st: 'lab' }, { t: 21.2, s: 'Duta Park', st: 'h', scale: .8 }],
        chip: { t: 21.5, s: 'Portrait LED screen · Roadside' },
        stats: [
          { t: w(4, 1) - .2, value: 230556, label: 'Monthly reach' },
          { t: w(4, 2) - .2, value: 1357980, label: 'Monthly impressions', accent: true, roll: w(4, 6) + .2 - w(4, 2) } ],
        near: { t: w(4, 8), s: 'On the Dutamas – Selayang commute' } },
      { kind: 'site', a: 25.5, b: 30.0, tr: 'slide', photo: 'tantan', focus: [.47, .05, .27, .43],
        text: [{ t: 25.55, s: '03 / 06 · City centre', st: 'lab' }, { t: 25.7, s: 'Menara Tan & Tan', st: 'h', scale: .8 }],
        chip: { t: w(5, 3), s: 'Large format · Building façade' },
        stats: [
          { t: w(5, 3) + .3, value: 182669, label: 'Monthly reach', accent: true },
          { t: w(5, 3) + .6, value: 993720, label: 'Monthly impressions' } ],
        near: { t: w(5, 6) - .3, s: 'Jalan Tun Razak · by KLCC' } },
      { kind: 'site', a: 30.0, b: 33.5, tr: 'slide', photo: 'cube', focus: [.17, .27, .47, .59],
        text: [{ t: 30.05, s: '04 / 06 · Bukit Bintang', st: 'lab' }, { t: 30.2, s: 'Giant Cube', st: 'h', scale: .8 }],
        chip: { t: w(6, 2) - .2, s: 'LED cube · Street level' },
        stats: [
          { t: w(6, 2), value: 123027, label: 'Monthly reach' },
          { t: w(6, 3), value: 1180800, label: 'Monthly impressions', accent: true, roll: .9 } ],
        near: { t: w(6, 5) - .3, s: 'In the heart of Bukit Bintang' } },
      { kind: 'site', a: 33.5, b: 37.5, tr: 'slide', photo: 'sports', focus: [.45, .095, .28, .43],
        text: [{ t: 33.55, s: '05 / 06 · Shopping street', st: 'lab' }, { t: 33.7, s: 'Jalan Bukit Bintang', st: 'h', scale: .8 }],
        chip: { t: w(7, 2), s: 'Large format · Building façade' },
        stats: [
          { t: w(7, 2) + .3, value: 112620, label: 'Monthly reach' },
          { t: w(7, 3) - .1, value: 1046880, label: 'Monthly impressions', accent: true, roll: w(7, 6) + .2 - w(7, 3) } ],
        near: { t: w(7, 8), s: 'Above Sports Direct, Bukit Bintang' } },
      { kind: 'site', a: 37.5, b: 41.5, tr: 'slide', photo: 'trx', focus: [.435, .105, .135, .37],
        text: [{ t: 37.55, s: '06 / 06 · Expressway', st: 'lab' }, { t: 37.7, s: 'TRX', st: 'h', scale: .8 }],
        chip: { t: w(8, 1) + .2, s: 'Portrait LED screen · Elevated road' },
        stats: [
          { t: w(8, 1) + .5, value: 137322, label: 'Monthly reach', accent: true },
          { t: w(8, 1) + .8, value: 1021800, label: 'Monthly impressions' } ],
        near: { t: w(8, 4) - .3, s: 'On the drive in from KLCC' } },
      { kind: 'burst', a: 41.5, b: 46.0, bg: 'white', words: [
        { t: w(9, 0) - .12, s: 'PLAN.', bg: 'white' },
        { t: w(9, 3) - .12, s: 'BUY.', bg: 'cover' },
        { t: w(9, 6) - .12, s: 'MEASURE.', bg: 'white' },
        { t: w(9, 8) - .12, s: 'Real footfall.', bg: 'cover', st: 'h' } ] },
      { kind: 'end', a: 46.0, b: 52.0, tr: 'zig', text: [
        { t: 46.0 + .2, s: 'Kuala Lumpur.', st: 'h', scale: .8 },
        { t: w(10, 2) - .3, s: 'Live on Moving Walls.', st: 's' },
        { t: w(10, 7) - .3, s: 'No boundaries.', st: 's', color: 'accent' },
        { t: w(10, 8) + .6, s: 'movingwalls.com/locations/malaysia', st: 'b', scale: .75 } ] },
    ],
  };
  if (typeof module !== 'undefined') module.exports = SPEC; else window.SPEC = SPEC;
})();
