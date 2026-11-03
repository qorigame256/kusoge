// ピン抜きの各ステージを、決めた順番でピンを抜いたときに「クリア／どの理由で失敗」になるかを確かめる。
// 使い方: node tools/test-pinpull.js            （このフォルダの app/ を調べる）
//         node tools/test-pinpull.js <app のフォルダ>  （壊した写しを調べるとき）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'pinpull-levels.js'));
require(path.join(appDir, 'js', 'games', 'pinpull-sim.js'));
const KG = globalThis.KG;

const SETTLE_STEPS = 60; // 最初に粒を落ち着かせる時間（1秒）
const WAIT_MAX = 360; // ピンを抜いてから次を抜くまで、落ち着くのを最大で待つ刻み数（6秒）
const END_MAX = 1200; // 最後のピンのあと、結果が出るまで最大で待つ刻み数（20秒）

// [ステージ番号(0始まり), 抜く順番, 期待する結果]
const CASES = [
  [0, ['a'], 'clear'],
  [0, ['b'], 'fail:lava'],
  [0, ['b', 'a'], 'fail:lava'],
  [1, ['a', 'c', 'b'], 'clear'],
  [1, ['a', 'b', 'c'], 'clear'],
  [1, ['c'], 'fail:lava'],
  [1, ['b', 'c'], 'fail:lava'],
  [2, ['a'], 'clear'],
  [2, ['c', 'a'], 'fail:nogold'],
  [2, ['b'], 'fail:lava'],
  [2, ['c', 'a', 'b'], 'fail:nogold'],
  [3, ['b', 'a', 'c'], 'clear'],
  [3, ['c'], 'fail:monster'],
  [3, ['b', 'c'], 'fail:lava'],
  [3, ['a', 'b', 'c'], 'fail:monster'],
  [4, ['b', 'a', 'c'], 'clear'],
  [4, ['e'], 'fail:lava'],
  [4, ['c'], 'fail:monster'],
  [4, ['a', 'b', 'c'], 'fail:monster'],
  [4, ['b', 'c'], 'fail:lava'],
  [4, ['d', 'b', 'a', 'c'], 'fail:nogold'],
  // 6面から先は毒ガス。ガスが敵を倒すのを待ってから敵の床を抜く
  [5, ['c', 'a', 'b'], 'clear'],
  [5, ['c', 'b', 'a'], 'clear'],
  [5, ['b'], 'fail:monster'],
  [5, ['d', 'c', 'a', 'b'], 'fail:monster'], // 先に落とした溶岩でガスが燃える
  [5, ['a', 'c', 'b'], 'fail:monster'], // 敵の部屋の天井（金貨の床）が無いと、ガスがたまらず敵に届かない
  [5, ['c', 'e', 'a', 'b'], 'fail:lava'],
  [6, ['c', 'v', 'b', 'a'], 'clear'],
  [6, ['c', 'b', 'v', 'a'], 'clear'],
  [6, ['b'], 'fail:monster'],
  [6, ['v', 'c', 'b'], 'fail:monster'], // 上の敵が下の敵の頭に乗り、ガスは上の敵にしか届かない
  [6, ['d', 'c', 'v', 'b', 'a'], 'fail:monster'],
  [6, ['c', 'v', 'b', 'e', 'a'], 'fail:lava'],
  [7, ['c', 'a', 'b'], 'clear'],
  [7, ['c', 'b', 'a'], 'clear'],
  [7, ['d'], 'fail:gas'],
  [7, ['c', 'd'], 'fail:gas'], // 右の天井 d の下に残ったガスがのぼる
  [7, ['b'], 'fail:monster'],
  [7, ['a', 'c', 'b'], 'fail:monster'],
  [7, ['c', 'e', 'a', 'b'], 'fail:lava'],
  [8, ['w', 'c', 'a', 'b'], 'clear'],
  [8, ['w', 'c', 'b', 'a'], 'clear'],
  [8, ['c', 'a', 'b'], 'fail:monster'], // ふたの上の溶岩でガスが燃えつきる
  [8, ['c', 'w', 'a', 'b'], 'fail:monster'],
  [8, ['w', 'a', 'c', 'b'], 'fail:monster'],
  [8, ['w', 'e', 'c', 'a', 'b'], 'fail:lava'],
  [9, ['w', 'c', 'a', 'b'], 'clear'],
  [9, ['w', 'c', 'b', 'a'], 'clear'],
  [9, ['c', 'w', 'a', 'b'], 'fail:monster'],
  [9, ['d'], 'fail:gas'],
  [9, ['w', 'd'], 'fail:gas'],
  [9, ['w', 'c', 'd'], 'fail:gas'],
  [9, ['b'], 'fail:monster'],
  [9, ['w', 'c', 'e', 'a', 'b'], 'fail:lava'],
];
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（pinpull-levels.js の冒頭の注記）

function run(levelIndex, order) {
  const sim = KG.pinpullSim.createSim(KG.pinpullLevels[levelIndex]);
  for (let i = 0; i < SETTLE_STEPS; i++) sim.step();
  const log = [];
  for (const id of order) {
    if (sim.state !== 'playing' || sim.locked) break;
    if (!sim.pull(id)) throw new Error('ピン ' + id + ' を抜けなかった');
    let waited = 0;
    while (waited < WAIT_MAX && sim.state === 'playing' && !sim.isCalm()) {
      sim.step();
      waited++;
    }
    log.push(id + ':' + waited + (sim.isCalm() ? '' : '(落ち着かず)'));
  }
  let tail = 0;
  while (tail < END_MAX && sim.state === 'playing') {
    sim.step();
    tail++;
  }
  const result = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state;
  return { result, sim, log, tail };
}

let bad = 0;
for (const [lv, order, expect] of CASES) {
  const { result, sim, log, tail } = run(lv, order);
  const ok = result === expect;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') +
      ' ステージ' + (lv + 1) +
      ' 順番 ' + order.join('→').padEnd(8) +
      ' 期待 ' + expect.padEnd(12) +
      ' 結果 ' + result.padEnd(12) +
      ' 宝 ' + sim.collected + '/' + sim.target + '（全' + sim.totalGold + '・届かない' + sim.lost + '）' +
      ' 待ち ' + log.join(' ') + ' 最後' + tail
  );
}
KG.pinpullLevels.forEach((level, lv) => {
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) {
    bad++;
    console.log('★NG ステージ' + (lv + 1) + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  }
});

// 毒ガスと敵の決まりごと。外壁と床だけの入れ物で1つずつ確かめる（勇者は右下の隅で、粒は x 380 より左に置く）
function box(o) {
  return {
    seed: 1,
    walls: [[60, 170, 60, 900], [480, 170, 480, 900], [60, 900, 480, 900]].concat(o.walls || []),
    pins: [],
    fill: o.fill || [],
    monsters: o.monsters || [],
    hero: { x: 446, y: 892 },
    room: o.room || [420, 860, 472, 900],
  };
}
function stepN(sim, n) {
  for (let i = 0; i < n; i++) sim.step();
}
const count = (sim, type) => sim.particles.filter((p) => p.type === type).length;
const meanY = (sim, type) => {
  const ps = sim.particles.filter((p) => p.type === type);
  return ps.reduce((s, p) => s + p.y, 0) / ps.length;
};
const CEILING = [[60, 400, 480, 400]];
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['ガスはのぼって、入れ物の上から抜けて消える', () => {
    const sim = KG.pinpullSim.createSim(box({ fill: [{ type: 'gas', rect: [100, 800, 380, 880], n: 20 }] }));
    stepN(sim, 600);
    return [count(sim, 'gas') === 0, '10秒後に残ったガス ' + count(sim, 'gas')];
  }],
  ['ガスはゆっくりのぼる（1秒で 60〜250）', () => {
    const sim = KG.pinpullSim.createSim(box({ fill: [{ type: 'gas', rect: [100, 800, 380, 880], n: 20 }] }));
    const y0 = meanY(sim, 'gas');
    stepN(sim, 60);
    const rise = y0 - meanY(sim, 'gas');
    return [rise >= 60 && rise <= 250, '1秒でのぼった高さ ' + rise.toFixed(0)];
  }],
  ['ガスは溶岩にふれると燃えて消え、溶岩は残る', () => {
    const sim = KG.pinpullSim.createSim(box({ walls: CEILING, fill: [{ type: 'lava', rect: [100, 420, 300, 470], n: 30 }, { type: 'gas', rect: [100, 800, 300, 880], n: 30 }] }));
    stepN(sim, 300);
    return [count(sim, 'gas') === 0 && count(sim, 'lava') === 30, 'ガス ' + count(sim, 'gas') + ' 溶岩 ' + count(sim, 'lava')];
  }],
  ['ガスは金貨とすれ違う（金貨は床へ、ガスは天井へ）', () => {
    const sim = KG.pinpullSim.createSim(box({ walls: CEILING, fill: [{ type: 'gold', rect: [100, 420, 380, 480], n: 20 }, { type: 'gas', rect: [100, 800, 380, 880], n: 40 }] }));
    stepN(sim, 300);
    const gold = sim.particles.filter((p) => p.type === 'gold');
    const gas = sim.particles.filter((p) => p.type === 'gas');
    const minGold = Math.min(...gold.map((p) => p.y));
    const maxGas = Math.max(...gas.map((p) => p.y));
    return [minGold > 850 && maxGas < 460, 'いちばん高い金貨 ' + minGold.toFixed(0) + ' いちばん低いガス ' + maxGas.toFixed(0)];
  }],
  ['ガスにふれた敵は倒れる', () => {
    const sim = KG.pinpullSim.createSim(box({ fill: [{ type: 'gas', rect: [150, 820, 250, 880], n: 12 }], monsters: [{ x: 200, y: 868 }] }));
    stepN(sim, 5);
    return [!sim.monsters[0].alive, '敵 ' + (sim.monsters[0].alive ? '生きている' : '倒れた')];
  }],
  ['ガスが勇者の部屋に入ったら失敗', () => {
    const sim = KG.pinpullSim.createSim(box({ fill: [{ type: 'gas', rect: [300, 820, 380, 880], n: 8 }], room: [278, 700, 472, 900] }));
    stepN(sim, 2);
    return [sim.state === 'fail' && sim.reason === 'gas', '結果 ' + sim.state + ' ' + sim.reason];
  }],
  ['天井の下にたまって詰まり続けるガスは、止まったとみなす（6面で c を抜いて 300刻み以内）', () => {
    const sim = KG.pinpullSim.createSim(KG.pinpullLevels[5]);
    stepN(sim, SETTLE_STEPS);
    sim.pull('c');
    let n = 0;
    while (n < 600 && !sim.isCalm()) {
      sim.step();
      n++;
    }
    return [n <= 300, '止まるまで ' + n + '刻み'];
  }],
  ['クリアはガスを待たない（6面で c→b→a、宝が届いてから 60刻み以内）', () => {
    const r = run(5, ['c', 'b']);
    const sim = r.sim;
    sim.pull('a');
    while (sim.t < 100000 && sim.state === 'playing') sim.step();
    const wait = sim.t - sim.goalAt;
    return [sim.state === 'clear' && wait <= 60, '結果 ' + sim.state + ' 宝が届いてからクリアまで ' + wait + '刻み'];
  }],
  ['敵どうしは重ならない', () => {
    const sim = KG.pinpullSim.createSim(box({ monsters: [{ x: 200, y: 868 }, { x: 200, y: 700 }] }));
    stepN(sim, 120);
    const [m, o] = sim.monsters;
    const d = Math.hypot(m.x - o.x, m.y - o.y);
    return [d >= 44, '敵どうしの中心の間 ' + d.toFixed(1)];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' 決まり ' + label + ' → ' + seen);
}
console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + CASES.length + ' 件と決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
