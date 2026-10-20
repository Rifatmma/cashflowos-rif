// "The Agency Advantage: Turning Chinese Brands' Overseas OOH Into a New Revenue Source"
// Agency-first. EN VO (Ava) + Simplified Chinese supers. Facts and the Calvin Klein numbers are from the article.
(function () {
  const VO = (typeof require !== 'undefined') ? require('./vo.json') : window.__VO;
  const START = [0.5, 3.0, 5.5, 10.0, 15.0, 21.5, 27.0, 33.0];
  const w = (l, i) => +(START[l] + VO[l].words[i][1]).toFixed(3);
  const end = l => +(START[l] + VO[l].dur).toFixed(3);

  const SPEC = {
    title: 'Overseas OOH for Chinese brands',
    dur: 39.5, bpm: 120,
    vo: START.map((t, i) => ({ file: `l${i}.wav`, t })),
    supers: [
      { a: START[0], b: end(0) + .2, zh: '中国品牌，正在走向全球。' },
      { a: START[1], b: end(1) + .2, zh: '而它们首先找的，就是自己的代理商。' },
      { a: START[2], b: end(2) + .2, zh: '每一个出海品牌，都是代理商的一条新业务线。' },
      { a: START[3], b: w(3, 10), zh: '但每进入一个新市场，就意味着新的媒体、新的购买规则，' },
      { a: w(3, 10), b: end(3) + .2, zh: '以及一份不同的报告。' },
      { a: START[4], b: w(4, 10), zh: 'Moving Walls 为您提供一个平台、一张全球网络：' },
      { a: w(4, 10), b: end(4) + .2, zh: '机场、交通与零售媒体。' },
      { a: START[5], b: w(5, 7), zh: '用同一标准，完成策划、执行与衡量。' },
      { a: w(5, 7), b: end(5) + .2, zh: '新加坡、悉尼，或迪拜。' },
      { a: START[6], b: w(6, 5), zh: '就像 Calvin Klein 在越南：' },
      { a: w(6, 5), b: end(6) + .2, zh: '230 块数字屏幕，一份统一的报告。' },
      { a: START[7], b: w(7, 8), zh: '客户关系由您掌握，网络由我们提供。' },
      { a: w(7, 8), b: end(7) + .4, zh: '海外户外广告，无界。' },
    ],
    scenes: [
      { kind: 'cover', a: 0, b: 3.0, text: [
        { t: .25, s: 'Overseas OOH', st: 'lab' },
        { t: w(0, 0), s: 'Chinese brands', st: 'h' },
        { t: w(0, 2), s: 'are going global.', st: 's' } ] },
      { kind: 'panel', a: 3.0, b: 5.5, tr: 'zig', bg: 'navy', tex: true, art: 'routes',
        ev: { origin: [700, 230, 'CHINA'], dests: [[600, 540, 'SINGAPORE'], [840, 700, 'SYDNEY'], [220, 380, 'DUBAI']], at: [.2, .45, .7] }, text: [
        { t: 3.05, s: 'Going global', st: 'lab' },
        { t: w(1, 1), s: 'Their agencies', st: 'h' },
        { t: w(1, 3), s: 'are the first call.', st: 's' } ] },
      { kind: 'panel', a: 5.5, b: 10.0, tr: 'chev', bg: 'white', tex: true, art: 'lines',
        ev: { items: ['Media planning', 'Digital', 'Social', 'Overseas OOH'], freshAt: w(2, 7) - 5.5 }, text: [
        { t: 5.6, s: 'For agencies', st: 'lab' },
        { t: w(2, 0), s: 'Every brand overseas', st: 'h' },
        { t: w(2, 7), s: 'is a new line of work.', st: 's' } ] },
      { kind: 'panel', a: 10.0, b: 15.0, tr: 'zig', bg: 'navy', tex: true, art: 'reports',
        ev: { items: ['SG', 'AU', 'AE', 'VN', 'MY'], at: [1.4, 1.65, 2.3, 2.55, 3.6] }, text: [
        { t: 10.1, s: 'Where agencies get stuck', st: 'lab' },
        { t: w(3, 1), s: 'Every new market,', st: 'h' },
        { t: w(3, 5), s: 'new media, new buying rules,', st: 's' },
        { t: w(3, 11), s: 'a different report.', st: 's', color: '#FEDA24' } ] },
      { kind: 'panel', a: 15.0, b: 21.5, tr: 'chev', bg: 'sky', art: 'formats',
        ev: { items: [['plane', 'Airports'], ['train', 'Transit'], ['bag', 'Retail']], at: [w(4, 10) - 15, w(4, 11) - 15, w(4, 13) - 15] }, text: [
        { t: 15.07, s: 'Moving Walls', st: 'lab' },
        { t: w(4, 4), s: 'One platform.', st: 'h' },
        { t: w(4, 7), s: 'One global network.', st: 's' } ] },
      { kind: 'burst', a: 21.5, b: 27.0, bg: 'white', words: [
        { t: w(5, 0), s: 'PLAN.', bg: 'white' },
        { t: w(5, 1), s: 'RUN.', bg: 'cover' },
        { t: w(5, 3), s: 'MEASURE.', bg: 'white' },
        { t: w(5, 5), s: 'One standard.', bg: 'cover', st: 'h' },
        { t: w(5, 7), s: 'Singapore.', bg: 'white', st: 'h' },
        { t: w(5, 8), s: 'Sydney.', bg: 'sky', st: 'h' },
        { t: w(5, 10), s: 'Dubai.', bg: 'cover', st: 'h' } ] },
      { kind: 'panel', a: 27.0, b: 33.0, tr: 'zig', bg: 'navy', tex: true, art: 'number', artAt: w(6, 8) + .2 - 1.1,
        ev: { value: '230', unit: 'digital screens' }, text: [
        { t: 27.05, s: 'Case study · Vietnam', st: 'lab' },
        { t: w(6, 1), s: 'Calvin Klein', st: 'h' },
        { t: w(6, 10), s: 'one consistent report.', st: 's', color: '#FEDA24' },
        { t: w(6, 10) + .4, s: '39 premium locations · 27 days', st: 'b', scale: .8 },
        { t: w(6, 10) + .6, s: '1.56M billable impressions', st: 'b', scale: .8 } ] },
      { kind: 'logo', a: 33.0, b: w(7, 8) - .1, tr: 'chev', text: [
        { t: w(7, 0), s: 'You keep the client.', st: 'h', scale: .72 },
        { t: w(7, 4), s: 'We bring the network.', st: 's' } ] },
      { kind: 'end', a: w(7, 8) - .1, b: 39.5, tr: 'zig', text: [
        { t: w(7, 8), s: 'Overseas out-of-home.', st: 'h', scale: .8 },
        { t: w(7, 10), s: 'No boundaries.', st: 's' },
        { t: w(7, 11) + .6, s: 'movingwalls.com', st: 'b', scale: .8 } ] },
    ],
  };
  if (typeof module !== 'undefined') module.exports = SPEC; else window.SPEC = SPEC;
})();
