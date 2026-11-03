// 数字ゲートの各レベルを、決めた門の選び方で走らせ、クリア／どの理由で失敗かを確かめる。
// あわせて全部の選び方を試し、勝てる割合を出す（難しさの目安。勝てる選び方が0か全部なら NG）。最後に門1つずつの計算も確かめる。
// 使い方: node tools/test-gate.js            （このフォルダの app/ を調べる）
//         node tools/test-gate.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-gate.js --all      （全部の選び方の結果を1行ずつ出す）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const dirArg = args.find((a) => !a.startsWith('--'));
const appDir = path.resolve(dirArg || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'gate-levels.js'));
require(path.join(appDir, 'js', 'games', 'gate-sim.js'));
const KG = globalThis.KG;
const { createSim, ROAD_HALF } = KG.gateSim;

const LEAD = 12; // 門の何 m 手前で、選んだ門の真ん中へ動き始めるか（それまでは前の位置のまま）
const MAX_STEPS = 60 * 120;

// [レベル番号(0始まり), 列ごとに選ぶもの（門の文字。門の無い所を通るなら 'なし'）, 期待する結果]
const CASES = [
  [0, ['+10', '+5', '+20'], 'clear'],
  [0, ['×2', '+5', '−3'], 'fail:battle'],
  [1, ['+15', '×2', '+30', '×3'], 'clear'],
  [1, ['+15', '×2', '+30', '−20'], 'fail:battle'],
  [1, ['−5', '÷2', 'なし', '−20'], 'fail:zero'],
  [2, ['+6', '×3', '+8', '×2'], 'clear'],
  [2, ['×3', '+6', '×2', '+8'], 'fail:battle'],
  [3, ['×2', '×2', '+25'], 'clear'],
  [3, ['×2', '+10', '−10'], 'fail:zero'],
  [3, ['+20', '+10', '+25'], 'fail:battle'],
  [4, ['+10', '×3', '−20', '+40', '×2'], 'clear'],
  [4, ['×2', '×3', '+15', '+40', '×2'], 'fail:battle'], // 真ん中の門を選ぶと、真ん中の赤い群れにぶつかる
  [4, ['−2', '×3', '−20', '×2', '×2'], 'fail:zero'],
];

// 1列ぶんの選べる位置: 門の真ん中。門が道の一部にしか無ければ、門の無い所の真ん中も（文字は 'なし'）
function optionsOf(row) {
  const out = row.gates.map((g) => ({ x: (g.x1 + g.x2) / 2, label: g.label }));
  const segs = row.gates.map((g) => [g.x1, g.x2]).sort((a, b) => a[0] - b[0]);
  let cur = -ROAD_HALF;
  for (const [a, b] of segs) {
    if (a > cur + 0.5) out.push({ x: (cur + a) / 2, label: 'なし' });
    cur = Math.max(cur, b);
  }
  if (cur < ROAD_HALF - 0.5) out.push({ x: (cur + ROAD_HALF) / 2, label: 'なし' });
  return out;
}

function run(level, choice) {
  const sim = createSim(level);
  const opts = sim.rows.map(optionsOf);
  sim.start();
  for (let i = 0; i < MAX_STEPS && (sim.state === 'run' || sim.state === 'battle'); i++) {
    const ri = sim.rows.findIndex((r) => !r.passed);
    if (ri >= 0 && sim.rows[ri].z - sim.z < LEAD) sim.setTargetX(opts[ri][choice[ri]].x);
    sim.step();
  }
  const result = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state;
  const fought = sim.enemies.filter((e) => e.n < e.n0).length;
  return { result, count: sim.count, fought, steps: sim.t };
}

function allChoices(level) {
  const opts = level.rows.map((r) => optionsOf({ gates: r.gates.map((g) => Object.assign({}, g)) }));
  let combos = [[]];
  for (const o of opts) {
    const nextCombos = [];
    for (const c of combos) for (let i = 0; i < o.length; i++) nextCombos.push(c.concat(i));
    combos = nextCombos;
  }
  return { opts, combos };
}

let bad = 0;
for (const [lv, labels, expect] of CASES) {
  const level = KG.gateLevels[lv];
  const opts = level.rows.map((r) => optionsOf({ gates: r.gates }));
  const choice = labels.map((l, i) => opts[i].findIndex((o) => o.label === l));
  if (choice.some((c) => c < 0)) throw new Error('レベル' + (lv + 1) + ' に無い選び方: ' + labels.join(' '));
  const r = run(level, choice);
  const ok = r.result === expect;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') +
      ' レベル' + (lv + 1) +
      ' 選び方 ' + labels.join(' ').padEnd(20) +
      ' 期待 ' + expect.padEnd(12) +
      ' 結果 ' + r.result.padEnd(12) +
      ' 残り ' + r.count + '人 戦った群れ ' + r.fought + ' 時間 ' + (r.steps / 60).toFixed(1) + '秒'
  );
}

for (let lv = 0; lv < KG.gateLevels.length; lv++) {
  const level = KG.gateLevels[lv];
  const { opts, combos } = allChoices(level);
  let wins = 0;
  for (const c of combos) {
    const r = run(level, c);
    if (r.result === 'clear') wins++;
    if (showAll) console.log('   レベル' + (lv + 1) + ' ' + c.map((i, k) => opts[k][i].label).join(' ').padEnd(22) + ' ' + r.result + ' 残り' + r.count);
  }
  const ok = wins > 0 && wins < combos.length;
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 全' + combos.length + '通りのうち勝てるのは ' + wins + ' 通り（' + Math.round((wins / combos.length) * 100) + '%）');
}

// 門1つの計算。道いっぱいの門を1つだけ置いた小さなレベルで確かめる（ゴールの敵は0人なので、通ればそのままクリアになる）
// [最初の人数, 門の文字, 通ったあとの人数]
const OPS = [
  [7, '+3', 10],
  [7, '×3', 21],
  [7, '−3', 4],
  [7, '-3', 4], // 半角のひき算も同じ
  [7, '÷2', 3], // わり算は切り捨て（四捨五入なら 4）
  [7, '×99999', 99999], // 人数の上限
];
for (const [start, label, expect] of OPS) {
  const sim = createSim({ start, length: 40, rows: [{ z: 20, gates: [{ x1: -ROAD_HALF, x2: ROAD_HALF, label }] }], enemies: [], boss: 0 });
  sim.start();
  for (let i = 0; i < MAX_STEPS && (sim.state === 'run' || sim.state === 'battle'); i++) sim.step();
  const ok = sim.state === 'clear' && sim.count === expect;
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' 門 ' + start + ' ' + label + ' → ' + sim.count + '（期待 ' + expect + '）' + (sim.state === 'clear' ? '' : ' 状態 ' + sim.state));
}
console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり');
process.exit(bad ? 1 : 0);
