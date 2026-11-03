// 数字ゲートの各レベルを、決めた門の選び方で走らせ、クリア／どの理由で失敗かを確かめる。
// あわせて全部の選び方を試し、勝てる割合を出す（難しさの目安。勝てる選び方が0か全部なら NG）。
// 「その場で一番得な門」を選び続ける素直な選び方でも走らせ、7面から先はそれでは勝てないことを確かめる
// （門の計算はどれも人数が多いほど結果も多いので、目先の得が後で損になる形＝門の後ろの赤い群れ・すき間・動く門 が無いと、素直に選ぶだけで勝ててしまう）。
// 最後に門1つずつの計算と、動く門の位置を小さなレベルで確かめる。
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
const { createSim, applyOp, rowOffset, ROAD_HALF, X_LIMIT, SPEED } = KG.gateSim;

const LEAD = 12; // 門の何 m 手前で、選んだものへ向かって動き始めるか（それまでは前の位置のまま）
const MAX_STEPS = 60 * 120;
const GREEDY_MUST_FAIL_FROM = 6; // 0始まりの番号。7面から先は、素直な選び方では勝てないこと

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
  [5, ['+10', '×3', '+15'], 'clear'],
  [5, ['+10', 'なし', '+15'], 'fail:battle'], // 動く門を取りそこねる
  [6, ['×2', '×2', '×2', '+25'], 'clear'],
  [6, ['+30', '×2', '×2', '+25'], 'fail:battle'], // +30 のすぐ後ろの赤い群れにぶつかる
  [6, ['+30', '×2', 'なし', '−20'], 'fail:zero'],
  [7, ['×2', '−2', '×4', '×2'], 'clear'],
  [7, ['+20', '−2', '×4', '×2'], 'fail:battle'], // 大きすぎて、赤い群れのすき間を通れない
  [7, ['×2', '+6', '×4', '×2'], 'fail:battle'],
  [8, ['×2', '×3', '+25', '×2'], 'clear'],
  [8, ['+15', '×3', '+25', '×2'], 'fail:battle'], // 真ん中の門のすぐ後ろの赤い群れ
  [8, ['×2', '÷3', '+25', '×2'], 'fail:battle'], // 一緒に動く損な門のほうを通る
  [8, ['×2', '×3', '×2', '×2'], 'fail:battle'], // 右の ×2 のすぐ後ろの赤い群れ
  [8, ['−5', '÷3', '−10', '×2'], 'fail:zero'],
  [9, ['×2', 'なし', '÷2', '×5', '×3'], 'clear'],
  [9, ['×2', '×3', '÷2', '×5', '×3'], 'fail:battle'], // 動く ×3 を取ると、すき間を通れない
  [9, ['×2', '×3', '−3', '×5', '×3'], 'fail:battle'], // 片方の群れと戦って抜けても足りない
  [9, ['+12', '×3', '÷2', '×5', '×3'], 'fail:battle'], // 最初の +12 の後ろの赤い群れで減り、ゴールで足りない
  [9, ['×2', 'なし', '÷2', 'なし', '×3'], 'fail:battle'],
];
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（gate-levels.js の冒頭の注記）

// 門の無い区間（横の範囲 lo〜hi のうち、どの門にも入らない所）。幅 0.5 m 以下の切れ目は数えない
function gapsOf(row, off, lo, hi) {
  const segs = row.gates.map((g) => [g.x1 + off, g.x2 + off]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = lo;
  for (const [a, b] of segs) {
    if (a > cur + 0.5) out.push([cur, Math.min(a, hi)]);
    cur = Math.max(cur, b);
  }
  if (cur < hi - 0.5) out.push([cur, hi]);
  return out;
}

// 1列ぶんの選べるもの: 門と、門の無い所（'なし'）。動かない列は門が道の一部にしか無いときだけ「なし」を選べる。動く列はいつでも試す
function optionsOf(row) {
  const out = row.gates.map((g, i) => ({ gate: i, label: g.label }));
  if (row.move || gapsOf(row, 0, -ROAD_HALF, ROAD_HALF).length) out.push({ gate: -1, label: 'なし' });
  return out;
}

// 選んだものを通るために、いま目指す横の位置。動く列は、着くころの位置を先読みする
function targetFor(sim, row, opt) {
  const steps = Math.max(0, Math.ceil((row.z - sim.z) / (SPEED / 60)));
  const off = rowOffset(row, sim.runT + steps);
  if (opt.gate >= 0) {
    const g = row.gates[opt.gate];
    return (g.x1 + g.x2) / 2 + off;
  }
  const gaps = row.move ? gapsOf(row, off, -X_LIMIT, X_LIMIT) : gapsOf(row, 0, -ROAD_HALF, ROAD_HALF);
  if (!gaps.length) return 0;
  gaps.sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
  return (gaps[0][0] + gaps[0][1]) / 2;
}

// その場で一番得なもの（通ったあとの人数がいちばん多くなるもの。同じなら先に並んでいるほう）
function greedyPick(sim, row, opts) {
  let best = 0;
  let bestN = -Infinity;
  opts.forEach((o, i) => {
    const n = o.gate >= 0 ? Math.max(0, applyOp(sim.count, row.gates[o.gate])) : sim.count;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  });
  return best;
}

// choice は列ごとの選ぶものの番号。greedy なら、その列に近づいた時点の人数で一番得なものを選ぶ
function run(level, choice, greedy) {
  const sim = createSim(level);
  const opts = sim.rows.map(optionsOf);
  const picked = [];
  sim.start();
  for (let i = 0; i < MAX_STEPS && (sim.state === 'run' || sim.state === 'battle'); i++) {
    const ri = sim.rows.findIndex((r) => !r.passed);
    if (ri >= 0 && sim.rows[ri].z - sim.z < LEAD) {
      if (picked[ri] === undefined) picked[ri] = greedy ? greedyPick(sim, sim.rows[ri], opts[ri]) : choice[ri];
      sim.setTargetX(targetFor(sim, sim.rows[ri], opts[ri][picked[ri]]));
    }
    sim.step();
  }
  const result = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state;
  const fought = sim.enemies.filter((e) => e.n < e.n0).length;
  const labels = picked.map((p, k) => (opts[k][p] ? opts[k][p].label : '?'));
  return { result, count: sim.count, fought, steps: sim.t, labels };
}

function allChoices(level) {
  const opts = createSim(level).rows.map(optionsOf);
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
  const opts = createSim(level).rows.map(optionsOf);
  const choice = labels.map((l, i) => opts[i].findIndex((o) => o.label === l));
  if (choice.some((c) => c < 0)) throw new Error('レベル' + (lv + 1) + ' に無い選び方: ' + labels.join(' '));
  const r = run(level, choice, false);
  const ok = r.result === expect;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') +
      ' レベル' + (lv + 1) +
      ' 選び方 ' + labels.join(' ').padEnd(26) +
      ' 期待 ' + expect.padEnd(12) +
      ' 結果 ' + r.result.padEnd(12) +
      ' 残り ' + r.count + '人 戦った群れ ' + r.fought + ' 時間 ' + (r.steps / 60).toFixed(1) + '秒'
  );
}

for (let lv = 0; lv < KG.gateLevels.length; lv++) {
  const level = KG.gateLevels[lv];
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) {
    bad++;
    console.log('★NG レベル' + (lv + 1) + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  }
  const { opts, combos } = allChoices(level);
  let wins = 0;
  for (const c of combos) {
    const r = run(level, c, false);
    if (r.result === 'clear') wins++;
    if (showAll) console.log('   レベル' + (lv + 1) + ' ' + c.map((i, k) => opts[k][i].label).join(' ').padEnd(26) + ' ' + r.result + ' 残り' + r.count);
  }
  const ok = wins > 0 && wins < combos.length;
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 全' + combos.length + '通りのうち勝てるのは ' + wins + ' 通り（' + Math.round((wins / combos.length) * 100) + '%）');
  const g = run(level, null, true);
  const must = lv >= GREEDY_MUST_FAIL_FROM;
  const gok = !must || g.result !== 'clear';
  if (!gok) bad++;
  console.log((gok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 素直な選び方 ' + g.labels.join(' ').padEnd(26) + ' → ' + g.result + ' 残り' + g.count + (must ? '（勝てないこと）' : ''));
}

// 門1つずつの計算。道いっぱいの門を1つだけ置いた小さなレベルで確かめる（ゴールの敵は0人なので、通ればそのままクリアになる）
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

// 動く門。幅 2.4 m の ×2 の門が左右に 3 m 動く（1往復 2 秒）。群れは真ん中のまま、z m 先で通る（20 m 先なら走り出して 120 刻め＝2秒後）
// [説明, phase, 走り出す前に待つ刻み数, 門の z, 通ったあとの人数（最初は 7）]
const MOVES = [
  ['門が真ん中に来たときに通る', 0, 0, 20, 14],
  ['門が右へずれているときに通る', Math.PI / 2, 0, 20, 7],
  ['走り出す前に待っても、門の位置はずれない', 0, 45, 20, 14],
  ['4分の3往復のときは、門が左へよけている', 0, 0, 15, 7], // 1往復の秒数を見ないと、ちょうど真ん中に戻って通れてしまう
];
for (const [label, phase, wait, z, expect] of MOVES) {
  const row = { z, gates: [{ x1: -1.2, x2: 1.2, label: '×2' }], move: { amp: 3, period: 2, phase } };
  const sim = createSim({ start: 7, length: 40, rows: [row], enemies: [], boss: 0 });
  for (let i = 0; i < wait; i++) sim.step();
  sim.start();
  for (let i = 0; i < MAX_STEPS && (sim.state === 'run' || sim.state === 'battle'); i++) sim.step();
  const ok = sim.state === 'clear' && sim.count === expect;
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' 動く門 ' + label + ' → ' + sim.count + '（期待 ' + expect + '）');
}
console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり');
process.exit(bad ? 1 : 0);
