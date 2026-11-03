// 水の色分けの各レベルが解けることと、注ぐ決まりを確かめる。
// - レベルの形: どの色もちょうど4段・1本に4段まで・空の試験管がある・ヒントの字数
// - 全部の手を調べて最短手数を出し（解けなければ NG）、その手順を本物の決まり（sort-sim.js の tap）でなぞってクリアになるか
// - でたらめに注いで勝てる割合（参考）と、「同じ色の上へ注げるなら注ぐ」素直なやり方の結果。7面から先は素直なやり方で勝てたら NG
// - 注ぐ決まり（まとめて注ぐ・入るだけ注ぐ・違う色には注げない・？は上をどかすと見える・行き詰まったら失敗 など）
// 使い方: node tools/test-sort.js            （このフォルダの app/ を調べる）
//         node tools/test-sort.js <app のフォルダ>  （壊した写しを調べるとき）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'sort-levels.js'));
require(path.join(appDir, 'js', 'games', 'sort-sim.js'));
const KG = globalThis.KG;
const SIM = KG.sortSim;
const LEVELS = KG.sortLevels;
const CAP = 4;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（sort-levels.js の冒頭の注記）
const MAX_TUBES = 12; // sort.js の並べ方（1段6本 × 2段）に収まる本数
const NAIVE_FROM = 7; // この面から先は、素直なやり方では勝てないこと
const PLAYOUTS = 400; // でたらめに注ぐ回数

// ---- 解くための道具（試験管は下から上への文字列） ----
const top = (s) => s[s.length - 1];
function run(s) {
  let n = 1;
  while (n < s.length && s[s.length - 1 - n] === top(s)) n++;
  return n;
}
const doneTube = (s) => s === '' || (s.length === CAP && run(s) === CAP);
const isWin = (tubes) => tubes.every(doneTube);
const key = (tubes) => tubes.slice().sort().join('|');
// 形が変わる注ぎ方 [from, to, 移る段の数]。1色だけの試験管を空の試験管へ丸ごと移す手は除く
function moves(tubes) {
  const out = [];
  for (let a = 0; a < tubes.length; a++) {
    const s = tubes[a];
    if (!s || doneTube(s)) continue;
    const n = run(s);
    for (let b = 0; b < tubes.length; b++) {
      const d = tubes[b];
      if (a === b || d.length >= CAP || (d && top(d) !== top(s)) || (!d && n === s.length)) continue;
      out.push([a, b, Math.min(n, CAP - d.length)]);
    }
  }
  return out;
}
function apply(tubes, [a, b, k]) {
  const t = tubes.slice();
  const c = top(t[a]);
  t[a] = t[a].slice(0, t[a].length - k);
  t[b] = t[b] + c.repeat(k);
  return t;
}
// 幅優先で最短の手順を探す
function solve(start) {
  const prev = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (isWin(s)) {
        const path = [];
        let k = key(s);
        while (prev.get(k)) {
          const p = prev.get(k);
          path.unshift(p.move);
          k = p.from;
        }
        return { path, states: prev.size, end: s };
      }
      for (const m of moves(s)) {
        const t = apply(s, m);
        const k = key(t);
        if (prev.has(k)) continue;
        prev.set(k, { from: key(s), move: m, fromTubes: s });
        next.push(t);
      }
    }
    frontier = next;
  }
  return null;
}
// 並べ替えた形の鍵から手順を戻すと、試験管の番号が並べ替え後のものになる。そこで解くときは番号つきで持ち直す
function solveIndexed(start) {
  const r = solve(start);
  if (!r) return null;
  // 番号つきでたどり直す: 幅優先で見つけた最短手数と同じ手数の手順を、番号のまま深さ優先で探す
  const goal = r.path.length;
  const seen = new Map();
  const out = [];
  function dfs(s, depth) {
    if (isWin(s)) return true;
    if (depth === goal) return false;
    const k = key(s);
    if (seen.has(k) && seen.get(k) <= depth) return false;
    seen.set(k, depth);
    for (const m of moves(s)) {
      out.push(m);
      if (dfs(apply(s, m), depth + 1)) return true;
      out.pop();
    }
    return false;
  }
  if (!dfs(start, 0)) return null;
  return { path: out, states: r.states };
}
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomWinRate(start) {
  const r = rng(12345);
  let wins = 0;
  for (let g = 0; g < PLAYOUTS; g++) {
    let s = start;
    for (let i = 0; i < 300 && !isWin(s); i++) {
      const ms = moves(s);
      if (!ms.length) break;
      s = apply(s, ms[Math.floor(r() * ms.length)]);
    }
    if (isWin(s)) wins++;
  }
  return wins / PLAYOUTS;
}
// 素直なやり方: 同じ色の上へ注げるなら注ぐ（注いだあと同じ色の重なりが長くなる順）。無ければ空の試験管へ（移る段の多い順）。
// 一度なった形には戻さない。注げる所が無くなったら負け
function naive(start) {
  let s = start;
  const seen = new Set([key(s)]);
  for (let i = 0; i < 300; i++) {
    if (isWin(s)) return true;
    const ms = moves(s);
    const onto = ms.filter((m) => s[m[1]] !== '').sort((m1, m2) => run(s[m2[1]]) + m2[2] - (run(s[m1[1]]) + m1[2]));
    const empty = ms.filter((m) => s[m[1]] === '').sort((m1, m2) => m2[2] - m1[2]);
    let moved = false;
    for (const m of onto.concat(empty)) {
      const t = apply(s, m);
      if (seen.has(key(t))) continue;
      seen.add(key(t));
      s = t;
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return isWin(s);
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

LEVELS.forEach((level, lv) => {
  const name = (lv + 1) + '面 ' + level.name;
  const tubes = level.tubes;
  // 形
  const count = {};
  let shapeOk = true;
  for (const t of tubes) {
    if (t.length > CAP || !/^[A-I]*$/.test(t)) shapeOk = false;
    for (const c of t) count[c] = (count[c] || 0) + 1;
  }
  const wrong = Object.keys(count).filter((c) => count[c] !== CAP);
  if (!shapeOk || wrong.length || !tubes.includes('') || tubes.length > MAX_TUBES) {
    ng(name + ' 形がおかしい（4段を超える・使えない文字・色の数が4でない ' + wrong.join('') + '・空の試験管が無い・本数 ' + tubes.length + '）');
    return;
  }
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng(name + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  // 解けるか
  const sol = solveIndexed(tubes);
  if (!sol) {
    ng(name + ' 解けない');
    return;
  }
  // 最短の手順を、本物の決まりでタップしてなぞる
  const sim = SIM.createSim(level);
  for (const [a, b] of sol.path) {
    sim.tap(a);
    sim.tap(b);
  }
  const rate = randomWinRate(tubes);
  const nv = naive(tubes);
  const line = name + '  色 ' + Object.keys(count).length + ' 本数 ' + tubes.length + (level.hidden ? ' ？あり' : '') + '  最短 ' + sol.path.length + ' 手（調べた形 ' + sol.states + '）' +
    '  最短の手順をなぞると ' + sim.state + '（' + sim.moves + ' 手）  でたらめに勝てる割合 ' + (rate * 100).toFixed(1) + '%  素直なやり方 ' + (nv ? '勝ち' : '負け');
  let ok = sim.state === 'clear' && sim.moves === sol.path.length;
  if (lv + 1 >= NAIVE_FROM && nv) ok = false;
  if (ok) console.log('OK  ' + line);
  else ng(line + (lv + 1 >= NAIVE_FROM && nv ? '（' + NAIVE_FROM + '面から先は素直なやり方で勝てたら NG）' : ''));
});

// ---- 注ぐ決まり ----
const make = (tubes, hidden) => SIM.createSim({ tubes, hidden: !!hidden });
const show = (sim) => sim.tubes.map((t) => t.join('') || '-').join(' ');
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['上で続いている同じ色は、まとめて注ぐ', () => {
    const sim = make(['ABB', 'B', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'A BBB -' && sim.moves === 1, show(sim) + ' 手数 ' + sim.moves];
  }],
  ['入りきらない分は元の試験管に残る', () => {
    const sim = make(['ABBB', 'AB', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'AB ABBB -', show(sim)];
  }],
  ['違う色の上には注げない（タップした試験管を選び直す）', () => {
    const sim = make(['AB', 'BA', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'AB BA -' && sim.selected === 1 && sim.moves === 0, show(sim) + ' 選んでいる ' + sim.selected];
  }],
  ['満杯の試験管には注げない', () => {
    const sim = make(['AB', 'ABBB', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'AB ABBB -' && sim.moves === 0, show(sim) + ' 手数 ' + sim.moves];
  }],
  ['空の試験管とそろった試験管は選べない', () => {
    const sim = make(['AAAA', '', 'AB']);
    sim.tap(1);
    const a = sim.selected;
    sim.tap(0);
    return [a === -1 && sim.selected === -1, '空 ' + a + ' そろった ' + sim.selected];
  }],
  ['選んだ試験管をもう一度タップすると、選ぶのをやめる', () => {
    const sim = make(['AB', '', '']);
    sim.tap(0);
    sim.tap(0);
    return [sim.selected === -1 && sim.moves === 0, '選んでいる ' + sim.selected];
  }],
  ['？の面は、いちばん上の段だけ見えている', () => {
    const sim = make(['ABCD', 'A', ''], true);
    const h = sim.hidden.map((t) => t.map((x) => (x ? '?' : 'o')).join('')).join(' ');
    return [h === '???o o ', h];
  }],
  ['上をどかすと、下の段が見える（移した段は見えたまま）', () => {
    const sim = make(['ABCD', 'BCDD', ''], true);
    sim.tap(0);
    sim.tap(2);
    const h = sim.hidden.map((t) => t.map((x) => (x ? '?' : 'o')).join('')).join(' ');
    return [show(sim) === 'ABC BCDD D' && h === '??o ???o o', show(sim) + ' 隠れ ' + h];
  }],
  ['隠れていても、同じ色ならまとめて流れ出る', () => {
    const sim = make(['ACC', 'C', ''], true);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'A CCC -' && !sim.hidden[0][0], show(sim) + ' 下の段 ' + (sim.hidden[0][0] ? '隠れたまま' : '見えた')];
  }],
  ['全部そろったらクリア（そろう前はクリアにならない）', () => {
    const sim = make(['AAAB', 'ABBB', '']);
    const seen = [];
    for (const [a, b] of [[0, 2], [1, 2], [1, 0]]) {
      sim.tap(a);
      sim.tap(b);
      seen.push(sim.state);
    }
    return [seen.join(',') === 'play,play,clear', show(sim) + ' 1手ごとの状態 ' + seen.join(',')];
  }],
  ['そろえられる注ぎ方が無くなったら失敗', () => {
    const sim = make(['A', 'B', 'BB']);
    sim.tap(1);
    sim.tap(2);
    return [sim.state === 'fail' && sim.reason === 'stuck', show(sim) + ' ' + sim.state + ' ' + sim.reason];
  }],
  ['1色だけの試験管を空へ丸ごと移す手しか無くても、行き詰まりとみなす', () => {
    const sim = make(['AA', 'BB', 'B', '']);
    sim.tap(2);
    sim.tap(1);
    // 残る手は AA → 空 と BBB → 空 だけ（入れ替わるだけ）
    return [sim.state === 'fail', show(sim) + ' ' + sim.state];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + LEVELS.length + ' 面と決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
