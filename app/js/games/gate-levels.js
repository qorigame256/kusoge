// 数字ゲートのレベル。距離はメートル（前へ毎秒 10 m 進む）。道の幅は左右 4 m ずつ（gate-sim.js の ROAD_HALF と同じ）。
// 門の文字は '+10'（足す）'×2'（かける）'−5'（ひく）'÷2'（わって切り捨て）。
// hint は画面上部に1行で出る。右に「兵隊 ◯」が並ぶので、全角20字以内にする。
// 各レベルの選び方ごとの結果は tools/test-gate.js が確かめる（全部の選び方を試して、勝てる割合も出す）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const H = 4;
  const W3 = (2 * H) / 3;

  function two(a, b) {
    return [
      { x1: -H, x2: 0, label: a },
      { x1: 0, x2: H, label: b },
    ];
  }
  function three(a, b, c) {
    return [
      { x1: -H, x2: -H + W3, label: a },
      { x1: -H + W3, x2: H - W3, label: b },
      { x1: H - W3, x2: H, label: c },
    ];
  }
  function left(a) {
    return [{ x1: -H, x2: 0, label: a }];
  }
  // 真ん中が x、幅 w の門1つ（動く門に使う）
  function one(a, x, w) {
    return [{ x1: x - w / 2, x2: x + w / 2, label: a }];
  }
  // 隣り合った幅 w の門2つ（左 a・右 b）。動く列で、得な門と損な門を一緒に動かす
  function pair(a, b, w) {
    return [
      { x1: -w, x2: 0, label: a },
      { x1: 0, x2: w, label: b },
    ];
  }

  KG.gateLevels = [
    {
      name: '門をえらべ',
      hint: '左右になぞって、通る門をえらぼう',
      start: 5,
      length: 130,
      rows: [
        { z: 30, gates: two('+10', '×2') },
        { z: 60, gates: two('×2', '+5') },
        { z: 90, gates: two('−3', '+20') },
      ],
      boss: 25,
    },
    {
      name: 'ひき算に注意',
      hint: 'ひき算とわり算の門に気をつけて',
      start: 10,
      length: 160,
      rows: [
        { z: 30, gates: two('−5', '+15') },
        { z: 60, gates: two('÷2', '×2') },
        { z: 90, gates: left('+30') },
        { z: 120, gates: two('×3', '−20') },
      ],
      boss: 80,
    },
    {
      name: '足すのが先か',
      hint: '足し算とかけ算、どちらを先に？',
      start: 4,
      length: 170,
      rows: [
        { z: 30, gates: two('+6', '×3') },
        { z: 60, gates: two('×3', '+6') },
        { z: 90, gates: two('+8', '×2') },
        { z: 120, gates: two('×2', '+8') },
      ],
      boss: 70,
    },
    {
      name: '赤い群れ',
      hint: '赤い群れとぶつかると、数が減る',
      start: 10,
      length: 170,
      rows: [
        { z: 30, gates: two('+20', '×2') },
        { z: 80, gates: two('×2', '+10') },
        { z: 130, gates: two('+25', '−10') },
      ],
      enemies: [
        { x: -2, z: 55, n: 8 },
        { x: 2, z: 105, n: 25 },
      ],
      boss: 50,
    },
    {
      name: '総仕上げ',
      hint: 'ここまでの知識を全部使おう',
      start: 5,
      length: 220,
      rows: [
        { z: 30, gates: three('+10', '×2', '−2') },
        { z: 75, gates: two('×3', '+30') },
        { z: 100, gates: three('−20', '÷2', '+15') },
        { z: 150, gates: two('×2', '+40') },
        { z: 180, gates: two('−30', '×2') },
      ],
      enemies: [
        { x: 0, z: 52, n: 12 },
        { x: 2, z: 125, n: 40 },
      ],
      boss: 100,
    },
    // ここから難しい面（2026-11-03 本人決定で足した 6〜10面）。門の計算はどれも人数が多いほど結果も多いので、
    // 目先の得が後で損になる形（門のすぐ後ろの赤い群れ・大きいと通れないすき間・取ると大きくなりすぎる門）を入れる。
    // 7面から先は「その場で一番得な門」を選び続けると勝てないことを tools/test-gate.js が確かめる。
    {
      name: '動く門',
      hint: '動く門は、来る時をねらって通ろう',
      start: 10,
      length: 140,
      rows: [
        { z: 30, gates: two('+10', '×2') },
        { z: 65, gates: one('×3', 0, 2.4), move: { amp: 2.4, period: 2.4 } },
        { z: 100, gates: two('+15', '−10') },
      ],
      boss: 55,
    },
    {
      name: '門の向こう',
      hint: '門の向こう側もよく見よう',
      start: 12,
      length: 170,
      rows: [
        { z: 30, gates: two('+30', '×2') },
        { z: 70, gates: two('×2', '+20') },
        { z: 105, gates: one('×2', 0, 2.4), move: { amp: 2.2, period: 3 } },
        { z: 140, gates: two('−20', '+25') },
      ],
      enemies: [{ x: -2, z: 32.5, n: 35 }],
      boss: 100,
    },
    {
      name: 'すき間',
      hint: '大きすぎると、すき間を通れない',
      start: 6,
      length: 180,
      rows: [
        { z: 30, gates: two('+20', '×2') },
        { z: 55, gates: three('+6', '−2', '+4') },
        { z: 110, gates: one('×4', 0, 2.4), move: { amp: 2.2, period: 2.6 } },
        { z: 145, gates: two('+30', '×2') },
      ],
      enemies: [
        { x: -2.6, z: 62, n: 30 },
        { x: 2.6, z: 62, n: 30 },
      ],
      boss: 65,
    },
    {
      name: '見張りと動く門',
      hint: '動く門は、得な方をねらおう',
      start: 10,
      length: 200,
      rows: [
        { z: 30, gates: three('×2', '+15', '−5') },
        { z: 60, gates: pair('×3', '÷3', 2.2), move: { amp: 1.8, period: 2.4 } },
        { z: 95, gates: three('+25', '−10', '×2') },
        { z: 150, gates: two('×2', '+40') },
      ],
      enemies: [
        { x: 0, z: 32.5, n: 22 },
        { x: 2.667, z: 97.5, n: 50 },
      ],
      boss: 150,
    },
    {
      name: '最後の試練',
      hint: 'どの門を捨てるか、先まで読もう',
      start: 8,
      length: 230,
      rows: [
        { z: 30, gates: two('+12', '×2') },
        { z: 60, gates: one('×3', 0, 2.2), move: { amp: 2.5, period: 2 } },
        { z: 90, gates: three('−5', '÷2', '−3') },
        { z: 130, gates: one('×5', 0, 2.2), move: { amp: 2.4, period: 2.4 } },
        { z: 170, gates: two('+40', '×3') },
      ],
      enemies: [
        { x: -2, z: 32.5, n: 15 },
        { x: -2.8, z: 97, n: 40 },
        { x: 2.8, z: 97, n: 40 },
      ],
      boss: 110,
    },
  ];
})();
