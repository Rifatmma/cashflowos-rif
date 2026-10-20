// Tokyo DOOH — VO-led. Times come from Ava's word boundaries (vo.json).
(function () {
  const VO = (typeof require !== 'undefined') ? require('./vo.json') : window.__VO;
  // each line starts on a beat (120 BPM → 0.5s grid)
  const START = [0.5, 3.0, 7.5, 11.0, 16.0, 20.0, 27.5];
  const w = (l, i) => +(START[l] + VO[l].words[i][1]).toFixed(3);

  const SPEC = {
    title: 'Tokyo DOOH',
    dur: 30.5, bpm: 120,
    vo: START.map((t, i) => ({ file: `l${i}.wav`, t })),
    scenes: [
      { kind: 'cover', a: 0, b: 3.0, text: [
        { t: .25, s: 'Tokyo, Japan', st: 'lab' },
        { t: 0 + .35, s: 'TOKYO', st: 'hx' },
        { t: w(0, 1) - .3, s: 'never stands still.', st: 's' } ] },
      { kind: 'panel', a: 3.0, b: 7.5, tr: 'zig', bg: 'white', tex: true, art: 'crossing', ev: { screens: w(1, 2) - 3.0 }, text: [
        { t: 3.1, s: 'Shibuya', st: 'lab' },
        { t: 3.0 + .2, s: 'SHIBUYA', st: 'h' },
        { t: w(1, 6) - .3, s: 'the scramble crossing', st: 's' } ] },
      { kind: 'panel', a: 7.5, b: 11.0, tr: 'chev', bg: 'navy', tex: true, art: 'board', ev: { rows: ['YAMANOTE LINE', 'CHUO RAPID', 'SAIKYO LINE', 'ODAKYU LINE', 'MARUNOUCHI'] }, text: [
        { t: 7.6, s: 'Shinjuku', st: 'lab' },
        { t: 7.5 + .2, s: 'SHINJUKU', st: 'h' },
        { t: w(2, 3) - .3, s: "the world's busiest station", st: 's' },
        { t: 9.9, s: 'Guinness World Records', st: 'b', scale: .62 } ] },
      { kind: 'panel', a: 11.0, b: 16.0, tr: 'zig', bg: 'sky', art: 'rail', artAt: 11.2, ev: { stations: ['SHIBUYA', 'HARAJUKU', 'SHINJUKU', 'IKEBUKURO', 'UENO'], train: .9 }, text: [
        { t: 11.1, s: 'Across the rail network', st: 'lab' },
        { t: 11.0 + .2, s: 'Every journey,', st: 'h' },
        { t: w(3, 9) - .3, s: 'a moment to be seen.', st: 's' } ] },
      { kind: 'panel', a: 16.0, b: 20.0, tr: 'chev', bg: 'navy', tex: true, art: 'network', ev: { labels: ['Shibuya', 'Shinjuku', 'Rail'], at: [.25, .7, 1.15], centre: 0 }, text: [
        { t: 16.0 + .2, s: 'Every place,', st: 'h' },
        { t: w(4, 2) - .3, s: 'a different audience.', st: 's' },
        { t: w(4, 4) - .3, s: 'a different context.', st: 's' } ] },
      { kind: 'logo', a: 20.0, b: w(5, 3), tr: 'zig' },
      { kind: 'burst', a: w(5, 3), b: w(5, 7), bg: 'white', words: [
        { t: w(5, 3), s: 'PLAN.', bg: 'white' },
        { t: w(5, 4), s: 'BUY.', bg: 'cover' },
        { t: w(5, 6), s: 'MEASURE.', bg: 'white' } ] },
      { kind: 'panel', a: w(5, 7), b: 27.5, bg: 'white', tex: true, art: 'formats', ev: { items: [['screen', 'Street'], ['train', 'Rail'], ['road', 'Roadside']], at: [.3, .55, .8] }, text: [
        { t: w(5, 7), s: "Tokyo's digital out-of-home", st: 'lab' },
        { t: w(5, 7) + .2, s: 'By impression,', st: 'h' },
        { t: w(5, 12) - .3, s: 'not by time slot.', st: 's', strike: w(5, 15) } ] },
      { kind: 'end', a: 27.5, b: 30.5, tr: 'zig', text: [
        { t: 27.5 + .2, s: 'Tokyo.', st: 'h' },
        { t: w(6, 1) - .3, s: 'No boundaries.', st: 's' },
        { t: 29.3, s: 'movingwalls.com', st: 'b', scale: .8 } ] },
    ],
  };
  if (typeof module !== 'undefined') module.exports = SPEC; else window.SPEC = SPEC;
})();
