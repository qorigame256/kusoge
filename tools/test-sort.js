// 水の色分けの各レベルが解けることと、注ぐ決まりを確かめる。
// - レベルの形: どの色もちょうど4段・試験管は4段まで／大きな入れ物は8段まで・空きの決まり（大きな入れ物の数 × 4 + 1 以上）・
//   画面に並ぶ本数・ヒントの字数
// - 全部の手を調べて最短手数を出し（解けなければ NG）、その手順を本物の決まり（sort-sim.js の tap）でなぞってクリアになるか
// - でたらめに注いで勝てる割合（参考）と、でたらめに注いでいる途中に注げる手が無くなったことが無いか（失敗が無い決まりの確かめ）
// - 「同じ色の上か空の入れ物にだけ注ぐ」素直なやり方の結果。7面から先は素直なやり方で勝てたら NG
// - 注ぐ決まり（まとめて注ぐ・入るだけ注ぐ・違う色の上にも注げる・大きな入れ物・栓・？は上をどかすと見える など）
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
const BIG_CAP = 8;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（sort-levels.js の冒頭の注記）
const ROW_UNITS = 6; // sort.js の並べ方: 1段に6こま（試験管は1こま、大きな入れ物は2こま）、2段まで
const NAIVE_FROM = 7; // この面から先は、素直なやり方では勝てないこと
const PLAYOUTS = 300; // でたらめに注ぐ回数
const SEARCH_LIMIT = 500000; // 最短を探すときに調べる形の数の上限

// ---- 解くための道具（入れ物は下から上への文字列。caps は入れ物ごとに入る段の数） ----
const top = (s) => s[s.length - 1];
function run(s) {
  let n = 1;
  while (n < s.length && s[s.length - 1 - n] === top(s)) n++;
  return n;
}
const doneTube = (s) => s.length === CAP && run(s) === CAP;
const isWin = (tubes) => tubes.every((s) => s === '' || doneTube(s));
// 同じ大きさの入れ物どうしは入れ替えても同じ形とみなす
function key(tubes, caps) {
  const small = [];
  const big = [];
  tubes.forEach((s, i) => (caps[i] === CAP ? small : big).push(s));
  return small.sort().join('|') + '#' + big.sort().join('|');
}
// 注ぎ方 [from, to, 移る段の数]。1色だけの入れ物を、同じ大きさの空の入れ物へ丸ごと移す手は除く（入れ替わるだけ）
function moves(tubes, caps) {
  const out = [];
  for (let a = 0; a < tubes.length; a++) {
    const s = tubes[a];
    if (!s || doneTube(s)) continue;
    const n = run(s);
    for (let b = 0; b < tubes.length; b++) {
      const d = tubes[b];
      if (a === b || doneTube(d) || d.length >= caps[b]) continue;
      if (!d && n === s.length && caps[a] === caps[b]) continue;
      out.push([a, b, Math.min(n, caps[b] - d.length)]);
    }
  }
  return out;
}
// 素直なやり方が使う手: 同じ色の上か、空の入れ物へだけ
const plainMoves = (tubes, caps) => moves(tubes, caps).filter(([a, b]) => !tubes[b] || top(tubes[b]) === top(tubes[a]));
function apply(tubes, [a, b, k]) {
  const t = tubes.slice();
  const c = top(t[a]);
  t[a] = t[a].slice(0, t[a].length - k);
  t[b] = t[b] + c.repeat(k);
  return t;
}
// あと何手は要るかの下の見積もり: 色のかたまりの数 − 色の数（1回注ぐと、かたまりは多くても1つしか減らない）
function lowerBound(tubes) {
  let runs = 0;
  const colors = new Set();
  for (const s of tubes) {
    for (let i = 0; i < s.length; i++) {
      colors.add(s[i]);
      if (i === 0 || s[i] !== s[i - 1]) runs++;
    }
  }
  return runs - colors.size;
}
// A*（見積もりが小さい順に調べる）で最短の手順を探す。見つからなければ null。
// 返すのは、たどる形の鍵の並び（はじめの形を除く）。同じ鍵の形は入れ物の番号が入れ替わっていることがあるので、手は indexedPath で番号つきに直す
function solve(start, caps) {
  const k0 = key(start, caps);
  const g = new Map([[k0, 0]]);
  const prev = new Map([[k0, null]]);
  const heap = [];
  const push = (f, item) => {
    heap.push([f, item]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const r = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (l + 1 < heap.length && heap[l + 1][0] < heap[m][0]) m = l + 1;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return r[1];
  };
  push(lowerBound(start), [start, k0, 0]);
  let expanded = 0;
  while (heap.length) {
    const [t, k, gt] = pop();
    if (gt > g.get(k)) continue; // もっと短い道で、あとから同じ形に着いていた
    if (isWin(t)) {
      const keys = [];
      for (let kk = k; prev.get(kk) !== null; kk = prev.get(kk)) keys.unshift(kk);
      return { keys, states: expanded };
    }
    if (++expanded > SEARCH_LIMIT) return null;
    for (const m of moves(t, caps)) {
      const u = apply(t, m);
      const ku = key(u, caps);
      if (g.has(ku) && g.get(ku) <= gt + 1) continue;
      g.set(ku, gt + 1);
      prev.set(ku, k);
      push(gt + 1 + lowerBound(u), [u, ku, gt + 1]);
    }
  }
  return null;
}
// 鍵の並びを、はじめの形の番号のままの手 [from, to, 段の数] に直す
function indexedPath(start, caps, keys) {
  const out = [];
  let s = start;
  for (const want of keys) {
    const m = moves(s, caps).find((mv) => key(apply(s, mv), caps) === want);
    if (!m) return null;
    out.push(m);
    s = apply(s, m);
  }
  return out;
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
// でたらめに注ぐ。勝てた割合と、注げる手が無くなった回数（失敗が無い決まりなので 0 のはず）
function playouts(start, caps) {
  const r = rng(12345);
  let wins = 0;
  let stuck = 0;
  for (let g = 0; g < PLAYOUTS; g++) {
    let s = start;
    for (let i = 0; i < 300 && !isWin(s); i++) {
      const ms = moves(s, caps);
      if (!ms.length) {
        stuck++;
        break;
      }
      s = apply(s, ms[Math.floor(r() * ms.length)]);
    }
    if (isWin(s)) wins++;
  }
  return { rate: wins / PLAYOUTS, stuck };
}
// 素直なやり方: 同じ色の上へ注げるなら注ぐ（注いだあと同じ色の重なりが長くなる順）。無ければ空の入れ物へ（移る段の多い順）。
// 違う色の上には注がない。一度なった形には戻さない。注げる所が無くなったら負け
function naive(start, caps) {
  let s = start;
  const seen = new Set([key(s, caps)]);
  for (let i = 0; i < 300; i++) {
    if (isWin(s)) return true;
    const ms = plainMoves(s, caps);
    const onto = ms.filter((m) => s[m[1]] !== '').sort((m1, m2) => run(s[m2[1]]) + m2[2] - (run(s[m1[1]]) + m1[2]));
    const empty = ms.filter((m) => s[m[1]] === '').sort((m1, m2) => m2[2] - m1[2]);
    let moved = false;
    for (const m of onto.concat(empty)) {
      const t = apply(s, m);
      if (seen.has(key(t, caps))) continue;
      seen.add(key(t, caps));
      s = t;
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return isWin(s);
}
// sort.js の並べ方で、どちらの段も ROW_UNITS こまに収まる分け方があるか
function fitsScreen(caps) {
  const units = caps.map((c) => (c === BIG_CAP ? 2 : 1));
  const total = units.reduce((a, b) => a + b, 0);
  if (total <= ROW_UNITS) return true;
  let left = 0;
  for (let k = 1; k < units.length; k++) {
    left += units[k - 1];
    if (left <= ROW_UNITS && total - left <= ROW_UNITS) return true;
  }
  return false;
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

LEVELS.forEach((level, lv) => {
  const name = (lv + 1) + '面 ' + level.name;
  const tubes = level.tubes;
  const big = level.big || [];
  const caps = tubes.map((t, i) => (big.includes(i) ? BIG_CAP : CAP));
  // 形
  const count = {};
  let shapeOk = big.every((i) => Number.isInteger(i) && i >= 0 && i < tubes.length);
  tubes.forEach((t, i) => {
    if (t.length > caps[i] || !/^[A-I]*$/.test(t)) shapeOk = false;
    for (const c of t) count[c] = (count[c] || 0) + 1;
  });
  const wrong = Object.keys(count).filter((c) => count[c] !== CAP);
  const free = caps.reduce((a, b) => a + b, 0) - tubes.join('').length;
  const needFree = big.length * CAP + 1;
  if (!shapeOk || wrong.length || free < needFree || !fitsScreen(caps)) {
    ng(name + ' 形がおかしい（入りきらない・使えない文字・色の段の数が4でない ' + wrong.join('') + '・空き ' + free + '（' + needFree + ' 以上）・画面に並ばない）');
    return;
  }
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng(name + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  // 解けるか
  const sol = solve(tubes, caps);
  if (!sol) {
    ng(name + ' 解けない（調べた形が ' + SEARCH_LIMIT + ' を超えた）');
    return;
  }
  const steps = indexedPath(tubes, caps, sol.keys);
  // 最短の手順を、本物の決まりでタップしてなぞる
  const sim = SIM.createSim(level);
  for (const [a, b] of steps || []) {
    sim.tap(a);
    sim.tap(b);
  }
  const p = playouts(tubes, caps);
  const nv = naive(tubes, caps);
  const line = name + '  色 ' + Object.keys(count).length + ' 入れ物 ' + tubes.length + (big.length ? '（大きな入れ物 ' + big.length + '）' : '') + ' 空き ' + free +
    (level.hidden ? ' ？あり' : '') + '  最短 ' + sol.keys.length + ' 手（調べた形 ' + sol.states + '）' +
    '  最短の手順をなぞると ' + sim.state + '（' + sim.moves + ' 手）  でたらめに勝てる割合 ' + (p.rate * 100).toFixed(1) + '%（注げる手が無くなった ' + p.stuck + ' 回）' +
    '  素直なやり方 ' + (nv ? '勝ち' : '負け');
  let ok = !!steps && sim.state === 'clear' && sim.moves === sol.keys.length && p.stuck === 0;
  if (lv + 1 >= NAIVE_FROM && nv) ok = false;
  if (ok) console.log('OK  ' + line);
  else ng(line + (lv + 1 >= NAIVE_FROM && nv ? '（' + NAIVE_FROM + '面から先は素直なやり方で勝てたら NG）' : ''));
});

// ---- 注ぐ決まり ----
const make = (tubes, o) => SIM.createSim(Object.assign({ tubes }, o));
const show = (sim) => sim.tubes.map((t) => t.join('') || '-').join(' ');
const hid = (sim) => sim.hidden.map((t) => t.map((x) => (x ? '?' : 'o')).join('')).join(' ');
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
  ['違う色の上にも注げる', () => {
    const sim = make(['AB', 'BA', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'A BAB -' && sim.moves === 1 && sim.selected === -1, show(sim) + ' 手数 ' + sim.moves];
  }],
  ['満杯の試験管には注げない（タップした試験管を選び直す）', () => {
    const sim = make(['AB', 'ABBB', '']);
    sim.tap(0);
    sim.tap(1);
    return [show(sim) === 'AB ABBB -' && sim.moves === 0 && sim.selected === 1, show(sim) + ' 手数 ' + sim.moves + ' 選んでいる ' + sim.selected];
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
  ['大きな入れ物には8段まで入り、入りきらない分は元に残る', () => {
    const sim = make(['ABABAB', 'CBBB', ''], { big: [0] });
    sim.tap(1);
    sim.tap(0);
    return [show(sim) === 'ABABABBB CB -' && sim.caps.join(',') === '8,4,4', show(sim) + ' 入る段 ' + sim.caps.join(',')];
  }],
  ['大きな入れ物は、1色4段だけになったら栓をする（選べず、注げない）', () => {
    const sim = make(['AAA', 'BA', 'B'], { big: [0] });
    sim.tap(1);
    sim.tap(0);
    const doneAfter = sim.isDone(0);
    sim.tap(0);
    const sel = sim.selected;
    sim.tap(2);
    sim.tap(0);
    return [show(sim) === 'AAAA B B' && doneAfter && sel === -1 && sim.moves === 1, show(sim) + ' 栓 ' + doneAfter + ' 栓をした入れ物を選ぶと ' + sel + ' 手数 ' + sim.moves];
  }],
  ['大きな入れ物は、上をどかして1色4段が残っても栓をする', () => {
    const sim = make(['AAAAB', '', 'C'], { big: [0] });
    sim.tap(0);
    sim.tap(1);
    const ev = sim.events.filter((e) => e.type === 'done').map((e) => e.tube).join(',');
    return [show(sim) === 'AAAA B C' && sim.isDone(0) && ev === '0', show(sim) + ' 栓 ' + sim.isDone(0) + ' 知らせ ' + ev];
  }],
  ['大きな入れ物に2色が4段ずつ入っていても、そろったことにはならない', () => {
    const sim = make(['AAAABBBB', '', ''], { big: [0] });
    return [!sim.isDone(0) && sim.state === 'play', '栓 ' + sim.isDone(0) + ' 状態 ' + sim.state];
  }],
  ['？の面は、いちばん上の段だけ見えている（大きな入れ物も）', () => {
    const sim = make(['ABCD', 'A', '', 'ABCDEF'], { hidden: true, big: [3] });
    return [hid(sim) === '???o o  ?????o', hid(sim)];
  }],
  ['上をどかすと、下の段が見える（移した段は見えたまま）', () => {
    const sim = make(['ABCD', 'BCDD', ''], { hidden: true });
    sim.tap(0);
    sim.tap(2);
    return [show(sim) === 'ABC BCDD D' && hid(sim) === '??o ???o o', show(sim) + ' 隠れ ' + hid(sim)];
  }],
  ['隠れていても、同じ色ならまとめて流れ出る', () => {
    const sim = make(['ACC', 'C', ''], { hidden: true });
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
  ['失敗は無い（面の空きの決まりを破った形で、注げる所が無くなっても play のまま）', () => {
    // 大きな入れ物の B を試験管へ注ぐと、どちらも栓をして、残りは満杯の ABAB だけになる（注げる手が無い）。それでも失敗にはしない
    const sim = make(['AAAAB', 'BBB', 'ABAB'], { big: [0] });
    sim.tap(0);
    sim.tap(1);
    const fail = sim.events.some((e) => e.type === 'fail');
    return [show(sim) === 'AAAA BBBB ABAB' && sim.isDone(0) && sim.isDone(1) && sim.state === 'play' && !fail, show(sim) + ' 状態 ' + sim.state + ' 失敗の知らせ ' + fail];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + LEVELS.length + ' 面と決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
