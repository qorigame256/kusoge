// 色のブロックを出すの各レベルが解けることと、盤・ブロック・出口の決まりを確かめる。
// - レベルの形: 壁の1周（角は #・使える文字）・内側の文字・ブロックがつながった形・色の文字・2色のブロックは6面から（6面から先は必ずある）・
//   どの出口の色にもブロックがある・ヒントの字数・盤が画面に収まる
// - 解く道具（slide-sim.js とは別に書いた決まり）で、いちばん少ない手数の勝ち方を探し、見つけた手順を本物の決まり（slide-sim.js）でなぞって
//   クリアになり、手数が同じになるか。いちばん少ない手数のうち、出す手のほかの手（よける・はがす）の数も出す
// - 素直なやり方（出せるブロックがあれば出す。無ければ、動かすとすぐ出せるブロックができる手を選ぶ。どれも無ければ行き詰まり）。
//   7面から先は解けたら NG
// - 「気をつける人」（出せるブロックがあれば出し、無ければ、動かすとすぐ出せるブロックができる手を選び、それも無ければでたらめに動かす）が
//   解き終えるまでの手数（参考。乱数の種は決めてある）。5面から先は、前の面より多いこと（10面に向けて難しくする）
// - でたらめに動かした手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形・同じ結果になるか
// - 期待の表 CASES（レベルごとに決めた手順と結果）を本物の決まりで流す
// - 決まり RULES（動く・止まる・出口の色と幅・2色のブロック・手数・指を追う動き・画面のマス など）
// 使い方: node tools/test-slide.js            （このフォルダの app/ を調べる）
//         node tools/test-slide.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-slide.js --cases    （解く道具が見つけた勝ち方を CASES の形で出す）
// 手順の書き方: 1回つかんで動かすごとに「ブロックの文字 + 向きの文字の並び」（向きは U 上・R 右・D 下・L 左）とし、空白でつなぐ。
// 例 'aRRU' は、ブロック a を右・右・上へ1マスずつ動かす（出口の前に来たら、そこで出る・はがれるので、それが最後の1歩）。
// 文字だけの 'a' は、さわっただけ（出口の前にあって、さわると出る・はがれる）。
// 1つでも期待と違えば終了コード 1。ほかの台本から require すると、解く道具だけを渡す（検査は走らない）。
'use strict';
const path = require('path');

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const DIRS = 'URDL';
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（slide-levels.js の冒頭の注記）
const TWO_FROM = 6; // 2色のブロックはこの面から
const NAIVE_FROM = 7; // この面から先は、素直なやり方では解けないこと
const DOWN_FROM = 5; // この面から先は、気をつける人の手数が前の面より多いこと
const SEARCH_LIMIT = 400000; // 勝ち方を探すときに調べる形の数の上限
const PLAYOUTS = 300; // 気をつける人の手数を数える回数
const CAP = 400; // 気をつける人がこの手数で解けなければ、この手数として数える
const CROSS = 150; // 突き合わせるでたらめな手順の数（レベルごと）

// ---- 解く道具（sim とは別に書いた決まり。形 s = [位置, 層, 位置, 層, …]。位置は 行 × W + 列（出たら -1）、層は2色のブロックの外側がはがれたら 1） ----
function prep(level) {
  const g = level.grid;
  const H = g.length - 2;
  const W = g[0].length - 2;
  const stone = new Uint8Array(W * H);
  const isExit = (ch) => (/^[A-Z]$/.test(ch) ? ch : '');
  const ex = [[], [], [], []];
  for (let c = 0; c < W; c++) {
    ex[0][c] = isExit(g[0][c + 1]);
    ex[2][c] = isExit(g[H + 1][c + 1]);
  }
  for (let r = 0; r < H; r++) {
    ex[3][r] = isExit(g[r + 1][0]);
    ex[1][r] = isExit(g[r + 1][W + 1]);
  }
  const map = {};
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = g[r + 1][c + 1];
      if (ch === '#') stone[r * W + c] = 1;
      else if (/^[a-z]$/.test(ch)) (map[ch] = map[ch] || []).push([r, c]);
    }
  }
  const keys = Object.keys(map).sort();
  const s = [];
  const blocks = keys.map((k) => {
    const cs = map[k];
    const r0 = Math.min(...cs.map((x) => x[0]));
    const c0 = Math.min(...cs.map((x) => x[1]));
    const cells = cs.map(([r, c]) => [r - r0, c - c0]);
    s.push(r0 * W + c0, 0);
    // 向きごとに、各列（縦に出るとき）か各行（横に出るとき）の、その向きでいちばん先のマス [列か行のずれ, そのマスの行か列のずれ]
    const far = [0, 1, 2, 3].map((d) => {
      const m = new Map();
      for (const [r, c] of cells) {
        const lane = d % 2 === 0 ? c : r;
        const pos = d % 2 === 0 ? r : c;
        const was = m.get(lane);
        if (was === undefined || (d === 0 || d === 3 ? pos < was : pos > was)) m.set(lane, pos);
      }
      return [...m.entries()];
    });
    return {
      key: k,
      cells,
      far,
      w: Math.max(...cells.map((x) => x[1])) + 1,
      h: Math.max(...cells.map((x) => x[0])) + 1,
      colors: [...((level.colors || {})[k] || '')],
    };
  });
  // ブロックごと・色ごとに、その色で外へ出られる位置と向き（盤のふちに触れ、ふちの各列か各行がその色の出口）[[位置, 向き] …]。
  // 出られるかは、ここに並んだ位置だけを、ほかのブロックの置き方を見て確かめればよい
  blocks.forEach((B) => {
    B.exitPos = {};
    for (const col of B.colors) {
      const list = [];
      for (let d = 0; d < 4; d++) {
        for (let r = 0; r + B.h <= H; r++) {
          for (let c = 0; c + B.w <= W; c++) {
            const edge = d === 0 ? r === 0 : d === 2 ? r + B.h === H : d === 3 ? c === 0 : c + B.w === W;
            if (edge && B.far[d].every(([lo]) => ex[d][d % 2 === 0 ? c + lo : r + lo] === col)) list.push([r * W + c, d]);
          }
        }
      }
      B.exitPos[col] = list;
    }
  });
  // 同じ形・同じ色のブロックの組（形を覚えるとき、入れかわっただけの形を同じとみなすため）
  const bySig = new Map();
  blocks.forEach((B, i) => {
    const sig = B.cells.map((x) => x.join('.')).sort().join(' ') + '|' + B.colors.join('');
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(i);
  });
  return { W, H, stone, ex, blocks, s, groups: [...bySig.values()] };
}
// 形の名前（同じ形・同じ色のブロックの位置は並べかえてから並べる）
function keyOf(P, s) {
  let k = '';
  for (const g of P.groups) {
    if (g.length === 1) k += s[2 * g[0]] * 2 + s[2 * g[0] + 1] + ',';
    else k += g.map((i) => s[2 * i] * 2 + s[2 * i + 1]).sort((a, b) => a - b).join(',') + ',';
  }
  return k;
}
const colorOf = (P, s, i) => P.blocks[i].colors[Math.min(s[2 * i + 1], P.blocks[i].colors.length - 1)];
const allOut = (P, s) => P.blocks.every((b, i) => s[2 * i] < 0);
function occOf(P, s) {
  const occ = new Int16Array(P.W * P.H).fill(-1);
  for (let i = 0; i < P.W * P.H; i++) if (P.stone[i]) occ[i] = -2;
  P.blocks.forEach((B, i) => {
    const p = s[2 * i];
    if (p < 0) return;
    const r = Math.floor(p / P.W);
    const c = p % P.W;
    for (const [dr, dc] of B.cells) occ[(r + dr) * P.W + c + dc] = i;
  });
  return occ;
}
// 位置を調べるときの使い回しの入れ物（調べるたびに作らない。reach を次に呼ぶまで中身が有効）
let PREV = new Int32Array(0); // 位置 → 1つ前の位置 × 4 + 向き（出発点は -1）
let DEPTH = new Int32Array(0); // 位置 → 出発点からの歩数
let MARK = new Int32Array(0); // 位置 → 調べた回の番号（今回の番号なら行ける）
let QUEUE = new Int32Array(0); // 行ける位置（近い順）
let markNow = 0;
// ブロック i が、ほかのブロックを止めたまま行ける位置（左上）を近い順に QUEUE へ並べ、その数を返す。
// stop（位置の集まり）があれば、その位置には行けるが、その先へは進まない（そこで出る・はがれるため。出発点でも同じ）
function reach(P, occ, i, start, stop) {
  const B = P.blocks[i];
  if (MARK.length < P.W * P.H) {
    PREV = new Int32Array(P.W * P.H);
    DEPTH = new Int32Array(P.W * P.H);
    MARK = new Int32Array(P.W * P.H);
    QUEUE = new Int32Array(P.W * P.H);
  }
  markNow++;
  MARK[start] = markNow;
  PREV[start] = -1;
  DEPTH[start] = 0;
  QUEUE[0] = start;
  let n = 1;
  for (let h = 0; h < n; h++) {
    const p = QUEUE[h];
    if (stop && stop.has(p)) continue;
    const r = (p / P.W) | 0;
    const c = p - r * P.W;
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nc < 0 || nr + B.h > P.H || nc + B.w > P.W) continue;
      const np = nr * P.W + nc;
      if (MARK[np] === markNow) continue;
      let ok = true;
      for (const [dr, dc] of B.cells) {
        const v = occ[(nr + dr) * P.W + nc + dc];
        if (v !== -1 && v !== i) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      MARK[np] = markNow;
      PREV[np] = p * 4 + d;
      DEPTH[np] = DEPTH[p] + 1;
      QUEUE[n++] = np;
    }
  }
  return n;
}
// 直前の reach の出発点から位置 p までの向きの並び
function pathTo(p) {
  let out = '';
  for (let v = PREV[p]; v >= 0; v = PREV[(v / 4) | 0]) out = DIRS[v % 4] + out;
  return out;
}
// ブロック i が位置 p で、向き d のふちに触れているか
function atEdge(P, i, p, d) {
  const B = P.blocks[i];
  const r = (p / P.W) | 0;
  const c = p - r * P.W;
  return d === 0 ? r === 0 : d === 2 ? r + B.h === P.H : d === 3 ? c === 0 : c + B.w === P.W;
}
// ブロック i を位置 p から向き d へ、色 col の出口で盤の外へ出せるか（各列か各行の先から盤のふちまでが空きで、ふちが col の出口）
function leaveOK(P, occ, i, p, d, col) {
  const B = P.blocks[i];
  const r0 = (p / P.W) | 0;
  const c0 = p - r0 * P.W;
  const ex = P.ex[d];
  const free = (v) => v === -1 || v === i;
  for (const [lo, po] of B.far[d]) {
    const lane = d % 2 === 0 ? c0 + lo : r0 + lo;
    if (ex[lane] !== col) return false;
    const pos = d % 2 === 0 ? r0 + po : c0 + po;
    if (d === 0) {
      for (let q = pos - 1; q >= 0; q--) if (!free(occ[q * P.W + lane])) return false;
    } else if (d === 2) {
      for (let q = pos + 1; q < P.H; q++) if (!free(occ[q * P.W + lane])) return false;
    } else if (d === 3) {
      for (let q = pos - 1; q >= 0; q--) if (!free(occ[lane * P.W + q])) return false;
    } else {
      for (let q = pos + 1; q < P.W; q++) if (!free(occ[lane * P.W + q])) return false;
    }
  }
  return true;
}
// 2色のブロックの外側がまだはがれていないか
const outer = (P, s, i) => P.blocks[i].colors.length === 2 && s[2 * i + 1] === 0;
// ブロック i が、いまの色で出口の前にいることになる位置（そこに来たら出る。2色のブロックの外側の色なら、はがれる）の集まり。
// 出られる位置のうち、そこに置けて先が空いているもの（occ はいまの置き方。ブロック i のいる所は空きとみなす）
function leaveAt(P, occ, s, i) {
  const col = colorOf(P, s, i);
  const at = new Set();
  for (const [p, d] of P.blocks[i].exitPos[col]) if (!at.has(p) && fits(P, occ, i, p) && leaveOK(P, occ, i, p, d, col)) at.add(p);
  return at;
}
// 2色のブロック i が位置 p で外側がはがれたとき、そこが内側の色の出口の前でもあって、続けて出るか
function chainAt(P, occ, i, p) {
  const col = P.blocks[i].colors[1];
  return P.blocks[i].exitPos[col].some(([q, d]) => q === p && leaveOK(P, occ, i, p, d, col));
}
// 出せるブロックを出し尽くす（s を書きかえる）。出した数を返し、rec があれば出した手順を足す。
// 出せるときにすぐ出しても手数は増えない（出たブロックは道をあけるだけ）。2色のブロックは、外側がはがれた所でそのまま出られるとき
// （はがれて続けて出る1手）だけここで出す
function closure(P, s, rec) {
  let count = 0;
  for (let again = true; again; ) {
    again = false;
    const occ = occOf(P, s);
    for (let i = 0; i < P.blocks.length && !again; i++) {
      if (s[2 * i] < 0) continue;
      const stop = leaveAt(P, occ, s, i);
      if (!stop.size) continue;
      // 出口の前の位置のうち、行けるもので近いもの（出口の前に来たらそこで出るので、ほかの出口の前を通らずに行けるもの）
      reach(P, occ, i, s[2 * i], stop);
      const two = outer(P, s, i);
      let best = -1;
      for (const p of stop) {
        if (MARK[p] !== markNow || (two && !chainAt(P, occ, i, p))) continue;
        if (best < 0 || DEPTH[p] < DEPTH[best]) best = p;
      }
      if (best < 0) continue;
      if (rec) rec.push(P.blocks[i].key + pathTo(best));
      s[2 * i] = -1;
      if (two) s[2 * i + 1] = 1;
      count++;
      again = true;
    }
  }
  return count;
}
// ブロック i を位置 p に置けるか（どのマスも盤の中で、空きか自分）
function fits(P, occ, i, p) {
  const r0 = (p / P.W) | 0;
  const c0 = p - r0 * P.W;
  for (const [dr, dc] of P.blocks[i].cells) {
    const v = occ[(r0 + dr) * P.W + c0 + dc];
    if (v !== -1 && v !== i) return false;
  }
  return true;
}
// 出す手のほかの手（動かす・外側をはがす）を全部並べる
// [{ t: 打ったあとの形, i: ブロック, p: 行き先, peel: はがすか, out: はがれて続けて出るか, len: 歩数 }]。
// closure のあとの形で呼ぶ（1色のブロックは、もう出口の前へ行けない。2色のブロックの外側は、はがれる所の先へは行けない）
function expand(P, s) {
  const out = [];
  const occ = occOf(P, s);
  for (let i = 0; i < P.blocks.length; i++) {
    const start = s[2 * i];
    if (start < 0) continue;
    const two = outer(P, s, i);
    const stop = two ? leaveAt(P, occ, s, i) : null;
    const n = reach(P, occ, i, start, stop);
    for (let k = 1; k < n; k++) {
      const p = QUEUE[k];
      if (stop && stop.has(p)) continue;
      const t = s.slice();
      t[2 * i] = p;
      out.push({ t, i, p, peel: false, out: false, len: DEPTH[p] });
    }
    if (!two) continue;
    // 2色のブロックの外側がはがれる手（行けるはがれる所。出発点がそうなら、さわるだけではがれる）
    for (const p of stop) {
      if (MARK[p] !== markNow) continue;
      const chain = chainAt(P, occ, i, p);
      const t = s.slice();
      t[2 * i] = chain ? -1 : p;
      t[2 * i + 1] = 1;
      out.push({ t, i, p, peel: true, out: chain, len: DEPTH[p] });
    }
  }
  return out;
}
// 形 s で打つ手 o（expand が並べたもの）を、手順の1回ぶんの文字にする（はがれる所へは、ほかのはがれる所を通らない道で行く）
function dragOf(P, s, o) {
  const occ = occOf(P, s);
  reach(P, occ, o.i, s[2 * o.i], outer(P, s, o.i) ? leaveAt(P, occ, s, o.i) : null);
  return P.blocks[o.i].key + pathTo(o.p);
}
// 手 o を形 s に打つ（o.t は closure で書きかわっていることがあるので使わない）
const play = (s, o) => {
  s[2 * o.i] = o.out ? -1 : o.p;
  if (o.peel) s[2 * o.i + 1] = 1;
};
// いちばん少ない手数の勝ち方（出す手は手数に入るが、出せるときにすぐ出しても手数は増えないので、ほかの手の数で幅優先に探す）
function solve(level, limit) {
  const P = prep(level);
  const lim = limit || SEARCH_LIMIT;
  // 石だけの盤でも、どれかの色の出口へたどり着けないブロックがあれば解けない（ほかのブロックはどかせるので、石だけを見ればよい）
  const bare = occOf(P, P.s.map((v, j) => (j % 2 === 0 ? -1 : v)));
  for (let i = 0; i < P.blocks.length; i++) {
    reach(P, bare, i, P.s[2 * i]);
    for (const col of P.blocks[i].colors) if (!P.blocks[i].exitPos[col].some(([p]) => MARK[p] === markNow)) return { win: null, nodes: 0, overflow: false };
  }
  const s0 = P.s.slice();
  closure(P, s0, null);
  const seen = new Set([keyOf(P, s0)]);
  const states = [s0];
  const par = [-1];
  const mv = [null];
  let found = allOut(P, s0) ? 0 : -1;
  let overflow = false;
  search: for (let h = 0; h < states.length && found < 0; h++) {
    for (const o of expand(P, states[h])) {
      closure(P, o.t, null);
      const k = keyOf(P, o.t);
      if (seen.has(k)) continue;
      seen.add(k);
      states.push(o.t);
      par.push(h);
      mv.push(o);
      if (allOut(P, o.t)) {
        found = states.length - 1;
        break search;
      }
      if (states.length >= lim) {
        overflow = true;
        break search;
      }
    }
  }
  if (found < 0) return { win: null, nodes: states.length, overflow };
  // 見つけた形までの手を、最初の形からなぞり直して手順の文字にする
  const chain = [];
  for (let v = found; v > 0; v = par[v]) chain.unshift(mv[v]);
  const s = P.s.slice();
  const win = [];
  closure(P, s, win);
  for (const o of chain) {
    win.push(dragOf(P, s, o));
    play(s, o);
    closure(P, s, win);
  }
  return { win, nodes: states.length, extra: win.length - P.blocks.length }; // extra: 出す手のほかの手（よける・はがす）の数
}
// 素直なやり方（冒頭の注記）。{ result: 'clear' | 'stuck' | 'loop', seq }
function naive(level) {
  const P = prep(level);
  const s = P.s.slice();
  const seq = [];
  closure(P, s, seq);
  const met = new Set();
  for (let n = 0; n < 80; n++) {
    if (allOut(P, s)) return { result: 'clear', seq };
    const k = keyOf(P, s);
    if (met.has(k)) return { result: 'loop', seq };
    met.add(k);
    const opts = expand(P, s).sort((a, b) => a.len - b.len || a.i - b.i);
    const pick = opts.find((o) => closure(P, o.t.slice(), null) > 0);
    if (!pick) return { result: 'stuck', seq };
    seq.push(dragOf(P, s, pick));
    play(s, pick);
    closure(P, s, seq);
  }
  return { result: 'loop', seq };
}
// 気をつける人（冒頭の注記）が解き終えるまでの手数の平均（CAP で打ち切ったものは CAP として数える）と、CAP までに解けた割合
function careful(level, seed, rngOf, playouts) {
  const P = prep(level);
  const rnd = rngOf(seed);
  let sum = 0;
  let solved = 0;
  const runs = playouts || PLAYOUTS;
  for (let n = 0; n < runs; n++) {
    let s = P.s.slice();
    let drags = closure(P, s, null);
    while (!allOut(P, s) && drags < CAP) {
      const opts = expand(P, s);
      const good = [];
      for (const o of opts) {
        const c = closure(P, o.t, null); // 出せないときは o.t は変わらない
        if (c) good.push({ t: o.t, n: 1 + c });
      }
      if (good.length) {
        const g = good[(rnd() * good.length) | 0];
        s = g.t;
        drags += g.n;
      } else {
        s = opts[(rnd() * opts.length) | 0].t;
        drags += 1;
      }
    }
    if (allOut(P, s)) solved++;
    sum += Math.min(drags, CAP);
  }
  return { avg: sum / runs, rate: solved / runs };
}

module.exports = { prep, solve, naive, careful, closure, expand, dragOf, keyOf, occOf, reach, leaveOK, atEdge, allOut, DIRS };
if (require.main === module) main();

function main() {
  const args = process.argv.slice(2);
  const PRINT_CASES = args.includes('--cases');
  const appDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'app'));
  globalThis.KG = {};
  require(path.join(appDir, 'js', 'core.js'));
  require(path.join(appDir, 'js', 'games', 'slide-levels.js'));
  require(path.join(appDir, 'js', 'games', 'slide-sim.js'));
  const KG = globalThis.KG;
  const SIM = KG.slideSim;
  const LEVELS = KG.slideLevels;

  let bad = 0;
  const ng = (msg) => {
    bad++;
    console.log('★NG ' + msg);
  };

  // ---- 本物の決まりで流す ----
  function runSim(level, seq) {
    const sim = SIM.createSim(level);
    for (const w of seq.split(' ').filter(Boolean)) {
      const id = sim.blocks.findIndex((b) => b.key === w[0]);
      if (id < 0 || !sim.beginDrag(id)) return { result: 'つかめないブロック ' + w, moves: sim.moves, sim };
      if (sim.dragging < 0 && w.length > 1) return { result: 'さわっただけで出たのに動かす手 ' + w, moves: sim.moves, sim };
      for (let n = 1; n < w.length; n++) {
        const k = sim.step(DIRS.indexOf(w[n]));
        if (!k || !k.startsWith('move')) return { result: '動けない手 ' + w + '（' + n + ' 歩目 ' + k + '）', moves: sim.moves, sim };
        if (sim.dragging < 0 && n !== w.length - 1) return { result: '出たあとにも動かす手 ' + w, moves: sim.moves, sim };
      }
      sim.endDrag();
    }
    return { result: sim.state, moves: sim.moves, sim };
  }

  // ---- レベルの形 ----
  function shapeProblems(level, no) {
    const why = [];
    const g = level.grid;
    if (!Array.isArray(g) || g.length < 4) return ['盤の行が足りない'];
    const H = g.length - 2;
    const W = g[0].length - 2;
    g.forEach((line, r) => {
      if (line.length !== W + 2) why.push(r + ' 行目の字数が ' + (W + 2) + ' でない');
    });
    if (why.length) return why;
    for (const [r, c] of [[0, 0], [0, W + 1], [H + 1, 0], [H + 1, W + 1]]) if (g[r][c] !== '#') why.push('角が # でない');
    const border = [];
    for (let c = 0; c < W + 2; c++) border.push(g[0][c], g[H + 1][c]);
    for (let r = 1; r <= H; r++) border.push(g[r][0], g[r][W + 1]);
    // 色は slide.js が描ける5色だけ（slide-sim.js の冒頭）
    if (border.some((ch) => !/^[#RBYGP]$/.test(ch))) why.push('壁の1周に使えない文字');
    for (let r = 1; r <= H; r++) if (/[^.#a-z]/.test(g[r].slice(1, W + 1))) why.push(r + ' 行目の内側に使えない文字');
    const P = prep(level);
    if (!P.blocks.length) why.push('ブロックが無い');
    const exitColors = new Set([].concat(...P.ex).filter(Boolean));
    const blockColors = new Set();
    P.blocks.forEach((B) => {
      const cs = level.colors[B.key] || '';
      if (!/^[RBYGP]{1,2}$/.test(cs) || cs[0] === cs[1]) why.push('ブロック ' + B.key + ' の色 ' + cs);
      if (cs.length === 2 && no < TWO_FROM) why.push(TWO_FROM + '面より前に2色のブロック ' + B.key);
      for (const ch of cs) blockColors.add(ch);
      // 上下左右でつながっているか
      const set = new Set(B.cells.map(([r, c]) => r + ',' + c));
      const q = [B.cells[0]];
      const got = new Set([q[0].join(',')]);
      for (let h = 0; h < q.length; h++) {
        for (let d = 0; d < 4; d++) {
          const k = q[h][0] + DR[d] + ',' + (q[h][1] + DC[d]);
          if (set.has(k) && !got.has(k)) {
            got.add(k);
            q.push(k.split(',').map(Number));
          }
        }
      }
      if (got.size !== set.size) why.push('ブロック ' + B.key + ' がつながっていない');
    });
    for (const k of Object.keys(level.colors || {})) if (!P.blocks.some((B) => B.key === k)) why.push('盤に無いブロックの色 ' + k);
    for (const ch of exitColors) if (!blockColors.has(ch)) why.push('その色のブロックが無い出口 ' + ch);
    for (const ch of blockColors) if (!exitColors.has(ch)) why.push('その色の出口が無い ' + ch);
    if (no >= TWO_FROM && !P.blocks.some((B) => B.colors.length === 2)) why.push('2色のブロックが無い');
    const L = SIM.layout(W, H);
    if (L.left - L.T < 20 || L.left + W * L.C + L.T > 540 - 20 || L.top - L.T < 136 || L.top + H * L.C + L.T > 944 || L.C < 52)
      why.push('盤が画面に収まらないか、マスが小さい（1マス ' + L.C + '）');
    const hintLen = [...(level.hint || '')].length;
    if (!hintLen || hintLen > HINT_MAX) why.push('ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
    return why;
  }

  const casesOut = [];
  const carefulOf = [];
  LEVELS.forEach((level, li) => {
    const no = li + 1;
    const name = no + '面 ' + level.name;
    const why = shapeProblems(level, no);
    if (why.length) {
      ng(name + ' 形: ' + why.join(' / '));
      return;
    }
    const P = prep(level);
    const sv = solve(level);
    const head = name + '  ' + P.W + '×' + P.H + ' ブロック ' + P.blocks.length + (P.blocks.some((B) => B.colors.length === 2) ? '（2色 ' + P.blocks.filter((B) => B.colors.length === 2).length + '）' : '');
    if (!sv.win) {
      ng(head + (sv.overflow ? ' 勝ち方を探す形が ' + SEARCH_LIMIT + ' を超えた' : ' 解けない'));
      return;
    }
    const ww = sv.win.join(' ');
    const r = runSim(level, ww);
    const cf = careful(level, no * 104729, KG.rng);
    carefulOf[no] = cf.avg;
    const nv = naive(level);
    const line = head + '  勝ち方 ' + sv.win.length + ' 手（出す手のほかの、よける・はがす手 ' + sv.extra + '・調べた形 ' + sv.nodes + '）→ ' + r.result + '（' + r.moves + ' 手）' +
      '  気をつける人 平均 ' + cf.avg.toFixed(1) + ' 手（' + CAP + ' 手までに解けた ' + (cf.rate * 100).toFixed(0) + '%）  素直なやり方 ' +
      (nv.result === 'clear' ? '解ける' : '行き詰まる（' + nv.result + '）');
    const why2 = [];
    if (r.result !== 'clear' || r.moves !== sv.win.length) why2.push('見つけた勝ち方が本物の決まりでクリアにならない');
    if (no >= NAIVE_FROM && nv.result === 'clear') why2.push('素直なやり方で解ける');
    if (why2.length) ng(line + '  ' + why2.join(' / '));
    else console.log('OK  ' + line);
    casesOut.push('  [' + no + ", '" + ww + "', 'clear', " + sv.win.length + '],');
    if (nv.result !== 'clear') casesOut.push('  [' + no + ", '" + nv.seq.join(' ') + "', 'play', " + nv.seq.length + ", '素直なやり方で行き詰まる'],");
    // でたらめな手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形になるか
    const rnd = KG.rng(no * 31337);
    let diff = '';
    for (let pl = 0; pl < CROSS && !diff; pl++) {
      const sim = SIM.createSim(level);
      const s = P.s.slice();
      for (let mv = 0; mv < 30 && !diff; mv++) {
        const occ = occOf(P, s);
        const simOcc = Array.from(sim.occ).map((v, i) => (sim.stone[i] ? -2 : v));
        if (simOcc.join() !== Array.from(occ).join()) diff = 'マスがちがう（' + mv + ' 手目の前）';
        else if (sim.blocks.some((b, i) => b.layer !== s[2 * i + 1] || b.out !== s[2 * i] < 0)) diff = '色か出たかがちがう（' + mv + ' 手目の前）';
        if (diff || allOut(P, s)) break;
        // 1回つかんで1歩: でたらめなブロックとでたらめな向き。道具で決まる結果（さわっただけで出る・はがれる、動く・止まる、
        // 動いた先で出る・はがれる）と sim の結果を比べる
        const live = P.blocks.map((B, i) => i).filter((i) => s[2 * i] >= 0);
        const i = live[Math.floor(rnd() * live.length)];
        const d = Math.floor(rnd() * 4);
        const p = s[2 * i];
        const r0 = Math.floor(p / P.W) + DR[d];
        const c0 = (p % P.W) + DC[d];
        const B = P.blocks[i];
        const two = outer(P, s, i);
        const stop = leaveAt(P, occ, s, i); // 出口の前の位置（ブロック i のいる所は空きとみなすので、1歩動いたあとにもそのまま使える）
        const leaveKind = (q) => (two ? (chainAt(P, occ, i, q) ? 'peel+exit' : 'peel') : 'exit');
        let grab = '';
        let want = null;
        let to = p;
        if (stop.has(p)) {
          grab = leaveKind(p); // さわっただけで出る（はがれる）。つかむのが終わるので、1歩は動かない
        } else if (r0 < 0 || c0 < 0 || r0 + B.h > P.H || c0 + B.w > P.W) {
          want = 'edge'; // 出口の前でないので、押し出しても出ない
        } else if (B.cells.every(([dr, dc]) => {
          const v = occ[(r0 + dr) * P.W + c0 + dc];
          return v === -1 || v === i;
        })) {
          to = r0 * P.W + c0;
          want = stop.has(to) ? 'move+' + leaveKind(to) : 'move';
        } else {
          want = 'blocked';
        }
        sim.beginDrag(i);
        const gotGrab = sim.auto;
        const got = sim.step(d);
        sim.endDrag();
        if (gotGrab !== grab || got !== want) {
          diff = '結果がちがう（' + mv + ' 手目 ' + B.key + DIRS[d] + '）sim ' + (gotGrab || '-') + ' ' + got + ' / 道具 ' + (grab || '-') + ' ' + want;
          break;
        }
        const done = grab || want;
        if (done.includes('peel')) s[2 * i + 1] = 1;
        if (done.endsWith('exit')) s[2 * i] = -1;
        else if (done.startsWith('move')) s[2 * i] = to;
      }
    }
    if (diff) ng(name + ' 本物の決まりと解く道具の突き合わせ: ' + diff);
    else console.log('OK  ' + name + '  でたらめな手順 ' + CROSS + ' 本で、本物の決まりと解く道具の形が1歩ごとに一致');
  });
  // 5面から先は、気をつける人の手数が前の面より多い（10面に向けて難しくする）
  for (let no = DOWN_FROM; no <= LEVELS.length; no++) {
    const a = carefulOf[no - 1];
    const b = carefulOf[no];
    if (a == null || b == null) continue; // 形がおかしい・解けない面は、上で NG になっている
    const msg = no - 1 + '面 ' + a.toFixed(1) + ' 手 → ' + no + '面 ' + b.toFixed(1) + ' 手';
    if (b > a) console.log('OK  気をつける人の手数が増える ' + msg);
    else ng('気をつける人の手数が前の面より増えていない ' + msg);
  }

  if (PRINT_CASES) {
    console.log('const CASES = [');
    for (const l of casesOut) console.log(l);
    console.log('];');
  }

  // ---- 期待の表（レベルごとに決めた手順と結果。2026-11-06 に、出口の前で自動で出る決まりに合わせて出し直し、6〜10面を選び直したときにも出し直した） ----
  // 勝ち方は解く道具が見つけたいちばん少ない手数のもの（--cases で出る）。行き詰まる手順は素直なやり方がそのまま進んだもの
  // （6面から。6面と 8〜10面の素直なやり方は、出口の前にあるブロックを1つ出したあと、動かすとすぐ出せるブロックができる手が無くて止まる）。
  // 文字だけの手（1面の 'b' など）は、出口の前にあるブロックにさわるだけで出る手。
  // [面, 手順, 期待の結果（'clear' か、まだ残っている 'play'）, 手数, 説明]
  const CASES = [
    [1, 'aUR b cR', 'clear', 3],
    [2, 'bD aDDD cUULL', 'clear', 3],
    [3, 'cLL fUU dULLLLD bR eDDDLLLLU aR fUUL', 'clear', 7],
    [4, 'h fDRD cRR gU aUL bURRRD cLLLDL dLDDDRD eDDDLLUULLLU gDDDDL', 'clear', 10],
    [5, 'b cULL hLLU aDLDL iDDDDD gRR dRRR cUURRRR hUUR jUUUULLLDLL aRRDD eURRRRDD fUULL', 'clear', 13],
    [6, 'i gU fU cRRD eDL hDD bLLUU jDDRDRD aLL dLLDLDDL gULLL fUUULLL hUUUUU jULUUU', 'clear', 14],
    [6, 'i', 'play', 1, '素直なやり方で行き詰まる'],
    [7, 'h j fDLDDRDRD aDLLDDD c cLLL eLLLL gLLL dRUUULL bUUUU gRRRDD eDRRRDRDD iUUUULLL bDDDDDLLLL dRRDDDDDDL', 'clear', 15],
    [7, 'h j fDLDDRDRD aDLLDDD c cLLL', 'play', 6, '素直なやり方で行き詰まる'],
    [8, 'f aR mR hLD mULLL lDRD gDDRDD bLLUUULUUL iULLUUULUUL dRRDRR kRRRDRR mRRRR cLLDDDLL aDDLLDDRR eUUUU hUUURURUUUR hDDDDD jDDDD', 'clear', 18],
    [8, 'f', 'play', 1, '素直なやり方で行き詰まる'],
    [9, 'd fD hD eRRU gRRRR bDDDR kULLDDDDD aLULU jUUUUU mULUUULLD eDLLDLDLDL cDDLDLDLDL lDD bRRRUURR bDLLDLLUUUU hUUUUU fUULLLLLLUU iDDRDDLLDLL hDLLLLLD', 'clear', 19],
    [9, 'd', 'play', 1, '素直なやり方で行き詰まる'],
    [10, 'd hR mU gR jR bR cR aDDDD aUUUUU iLU bULUU cUUULUU eLLUUL fLLLL lDDLDDL hDLLLLUUUUU hDDD jDRR gDDLLLLL mDDDLLLLLL kRDDLLLUULUL', 'clear', 21],
    [10, 'd', 'play', 1, '素直なやり方で行き詰まる'],
  ];
  for (const [no, seq, want, n, note] of CASES) {
    const level = LEVELS[no - 1];
    if (!level) {
      ng('表 ' + no + '面が無い');
      continue;
    }
    const r = runSim(level, seq);
    const line = '表 ' + no + '面 ' + (note ? '（' + note + '）' : '') + seq + '  期待 ' + want + '（' + n + ' 手） 結果 ' + r.result + '（' + r.moves + ' 手）';
    if (r.result === want && r.moves === n) console.log('OK  ' + line);
    else ng(line);
  }

  // ---- 決まり ----
  // 小さな面を作る（grid は壁を含めた盤、colors はブロックの色）
  const make = (grid, colors) => SIM.createSim({ grid, colors });
  const at = (sim, key) => sim.blocks.find((b) => b.key === key);
  // つかんで dirs の向きへ1歩ずつ動かす。結果を ',' でつなぐ（さわっただけで出た・はがれたときは '(exit)' のように括弧で先に置く）。
  // 出た・はがれたら、そこで止める
  const go = (sim, key, dirs) => {
    sim.beginDrag(at(sim, key).id);
    const got = sim.auto ? ['(' + sim.auto + ')'] : [];
    for (const ch of dirs) {
      if (sim.dragging < 0) break;
      got.push(sim.step(DIRS.indexOf(ch)));
    }
    sim.endDrag();
    return got.join(',');
  };
  const RULES = [
    ['空いたマスへは動き、石・ほかのブロック・壁（出口でない所）では止まる', () => {
      const sim = make(['#####', '#a..#', '#.#.#', '#b..#', '##R##'], { a: 'R', b: 'R' });
      const got = [go(sim, 'a', 'R'), go(sim, 'a', 'D'), go(sim, 'a', 'U'), go(sim, 'a', 'L'), go(sim, 'b', 'L'), go(sim, 'b', 'UU')].join(' / ');
      return [got === 'move / blocked / edge / move / edge / move,blocked' && at(sim, 'a').c === 0 && at(sim, 'b').r === 1, got];
    }],
    ['動かして同じ色の出口の前に来たら、押し出さなくてもその場で外へ出て盤から消え、出たマスは空く', () => {
      const sim = make(['###R##', '#a...#', '#.b..#', '######'], { a: 'R', b: 'B' });
      const k = go(sim, 'a', 'RRR');
      const k2 = go(sim, 'b', 'UR');
      return [k === 'move,move+exit' && at(sim, 'a').out && sim.moves === 2 && k2 === 'move,move' && sim.blockAt(0, 2) === at(sim, 'b').id, k + ' / ' + k2 + ' 手数 ' + sim.moves];
    }],
    ['出口の前にあるブロックは、さわるだけで出る（動かなくても1手と数える）', () => {
      const sim = make(['##R##', '#.a.#', '#...#', '#####'], { a: 'R' });
      const k = go(sim, 'a', 'D');
      return [k === '(exit)' && at(sim, 'a').out && sim.moves === 1 && sim.state === 'clear', k + ' 手数 ' + sim.moves + ' ' + sim.state];
    }],
    ['色の違う出口からは出られず、前に来ても出ない', () => {
      const sim = make(['##R##', '#.b.#', '#...#', '#####'], { b: 'B' });
      const k = go(sim, 'b', 'U');
      const k2 = go(sim, 'b', 'LR');
      return [k === 'edge' && k2 === 'move,move' && !at(sim, 'b').out, k + ' / ' + k2];
    }],
    ['出口より幅の広いブロック・出口からはみ出すブロックは出られない（出口の幅の中に収まれば出る）', () => {
      const a = make(['##R###', '#.aa.#', '#....#', '######'], { a: 'R' });
      const k1 = go(a, 'a', 'U');
      const b = make(['##RR##', '#aa..#', '#....#', '######'], { a: 'R' });
      const k2 = go(b, 'a', 'U');
      const k3 = go(b, 'a', 'R');
      return [k1 === 'edge' && k2 === 'edge' && k3 === 'move+exit', k1 + ' / ' + k2 + ' / ' + k3];
    }],
    ['L 字のブロックは、出る向きに見て、どの列もブロックの先から盤のふちまで空いていないと出られない（空けば、さわるだけで出る）', () => {
      const sim = make(['##RR##', '#.ca.#', '#.aa.#', '#....#', '######'], { a: 'R', c: 'B' });
      const k1 = go(sim, 'a', 'U');
      const kc = go(sim, 'c', 'L');
      const k2 = go(sim, 'a', '');
      return [k1 === 'edge' && kc === 'move' && k2 === '(exit)', k1 + ' / ' + kc + ' / ' + k2];
    }],
    ['動かしている途中で同じ色の出口の前を通ると、そこで出る（その先へは進まない）', () => {
      const sim = make(['##R###', '#a...#', '#....#', '######'], { a: 'R' });
      sim.beginDrag(0);
      const out = sim.follow(0, 3).join(',');
      sim.endDrag();
      return [out === 'move+exit' && at(sim, 'a').out && sim.moves === 1, out + ' 手数 ' + sim.moves];
    }],
    ['2色のブロックは、外側の色の出口の前で外側がはがれてその場に残り、内側の色の出口の前で出る（はがれる前は内側の色の出口の前に来ても出ない）', () => {
      const sim = make(['##R##', '#...B', '#a..#', '#...#', '#####'], { a: 'RB' });
      const k1 = go(sim, 'a', 'RRUR');
      const k2 = go(sim, 'a', 'L');
      const a = at(sim, 'a');
      const peeled = a.r + ',' + a.c + ' 層 ' + a.layer + ' 色 ' + sim.color(a.id);
      const k3 = go(sim, 'a', 'U');
      const k4 = go(sim, 'a', 'R');
      return [k1 === 'move,move,move,edge' && k2 === 'move+peel' && peeled === '0,1 層 1 色 B' && k3 === 'edge' && k4 === 'move+exit' && sim.state === 'clear',
        [k1, k2, peeled, k3, k4].join(' / ')];
    }],
    ['2色のブロックが、外側の色と内側の色の出口の両方の前（角）に来ると、はがれてそのまま出る（1手）', () => {
      const sim = make(['#R##', 'B..#', '#a.#', '####'], { a: 'RB' });
      const k = go(sim, 'a', 'U');
      return [k === 'move+peel+exit' && sim.state === 'clear' && sim.moves === 1, k + ' 手数 ' + sim.moves + ' ' + sim.state];
    }],
    ['全部のブロックが出たらクリア。手数は、つかんで動いた回数（出口の前で出たのも同じ1手。動かなかったつかみは数えない）', () => {
      const sim = make(['##R##', '#.b.#', '#.a.#', '##B##'], { a: 'R', b: 'B' });
      const k0 = go(sim, 'a', 'U'); // b にふさがれて動かない（数えない）
      go(sim, 'b', 'L');
      const m1 = sim.moves;
      go(sim, 'a', 'U');
      go(sim, 'b', 'RD');
      return [k0 === 'blocked' && m1 === 1 && sim.moves === 3 && sim.state === 'clear' && sim.left() === 0 && sim.events.some((e) => e.type === 'clear'),
        k0 + ' / 途中 ' + m1 + ' 手 → ' + sim.moves + ' 手 ' + sim.state];
    }],
    ['クリアのあとは、つかめず動かない', () => {
      const sim = make(['##R##', '#.a.#', '#####'], { a: 'R' });
      go(sim, 'a', '');
      return [sim.state === 'clear' && !sim.beginDrag(0) && sim.tryStep(0, 2) === null, sim.state];
    }],
    ['指を追う動き: 0.5 マス未満は動かず、大きく動かすと何マスも進み、ふさがった向きは回りこみ、出口の前まで来ると出る', () => {
      const sim = make(['#######', '#a....#', '#.#...#', '#.....R', '#######'], { a: 'R' });
      sim.beginDrag(0);
      const small = sim.follow(0.4, 0.45).join(',');
      const far = sim.follow(0, 3).join(',');
      const pos1 = at(sim, 'a').r + ',' + at(sim, 'a').c;
      const around = sim.follow(2, 3.2).join(',');
      const pos2 = at(sim, 'a').r + ',' + at(sim, 'a').c;
      const out = sim.follow(2, 6).join(',');
      sim.endDrag();
      return [small === '' && far === 'move,move,move' && pos1 === '0,3' && around === 'move,move' && pos2 === '2,3' && out === 'move+exit' && sim.moves === 1,
        [small, far, pos1, around, pos2, out].join(' / ') + ' 手数 ' + sim.moves];
    }],
    ['指を追う動き: 斜めにあるとき、離れているほうの向きがふさがっていれば、もう片方の向きへ回りこむ', () => {
      const sim = make(['######', '#a#..#', '#....#', '######'], { a: 'R' });
      sim.beginDrag(0);
      const got = sim.follow(1, 3).join(',');
      sim.endDrag();
      const b = at(sim, 'a');
      return [got.startsWith('move') && b.r === 1 && b.c === 3, got + ' → ' + b.r + ',' + b.c];
    }],
    ['画面のマス: 盤の左上のマスの真ん中は 0,0、盤の外は無し', () => {
      const sim = make(['######', '#a...#', '#....#', '##R###'], { a: 'R' });
      const L = sim.L;
      const got = [sim.cellAt(L.left + L.C / 2, L.top + L.C / 2), sim.cellAt(L.left + L.C * 3.5, L.top + L.C * 1.5), sim.cellAt(L.left - 2, L.top + 5), sim.cellAt(L.left + 5, L.top + L.C * 2 + 1)];
      return [JSON.stringify(got) === '[[0,0],[1,3],null,null]', JSON.stringify(got)];
    }],
  ];
  for (const [label, check] of RULES) {
    let res;
    try {
      res = check();
    } catch (e) {
      res = [false, '例外 ' + e.message];
    }
    const [ok, seen] = res;
    if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
    else ng('決まり ' + label + ' → ' + seen);
  }

  console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + LEVELS.length + ' 面・表 ' + CASES.length + ' 件・決まり ' + RULES.length + ' 件）');
  process.exitCode = bad ? 1 : 0;
}
