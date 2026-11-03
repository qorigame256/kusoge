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
  ];
})();
