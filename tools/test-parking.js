// 駐車場から車を出すの各レベルが解けることと、車の動きの決まりを確かめる。
// - レベルの形: 車が盤の中にあり重ならない・向きと長さ・金色の車は2マス・向かい合った車が同じ列にいない（どちらも出られなくなる）・
//   画面に収まるマスの大きさ・ヒントの字数
// - 全部の手を調べて最短手数を出し（解けなければ NG）、その手順を本物の決まり（parking-sim.js の tap）でなぞってクリアになるか
// - でたらめにタップして勝てる確率（参考）と、「出られる車を先に全部出し、出られる車が無いときは金色の車にぶつからない車から
//   でたらめに選ぶ」気をつける人が勝てる確率。1・2面は止まる手が一度も出てこない、3面は止まる手が要るが気をつける人が必ず勝つ、
//   4面から先は気をつける人でも負けることがある（詰む手がある）
// - 素直なやり方（出られる車を先に出し、無ければ金色の車にぶつからない車を上の行・左の列から順に動かす）。7面から先は勝てたら NG
// - 期待の表 CASES（レベルごとに決めたタップの順と、クリア／失敗の理由）を本物の決まりで流す
// - 車の動きの決まり RULES（外へ出る・手前で止まる・すぐ前がふさがった車は動かない・トラック・クリア・動けなくなったら失敗・金色の車 など）
// 使い方: node tools/test-parking.js            （このフォルダの app/ を調べる）
//         node tools/test-parking.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-parking.js --draw      （各レベルの盤を文字で描く。車の文字は CASES の文字と同じ）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const DRAW = args.includes('--draw');
const appDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'parking-levels.js'));
require(path.join(appDir, 'js', 'games', 'parking-sim.js'));
const KG = globalThis.KG;
const SIM = KG.parkingSim;
const LEVELS = KG.parkingLevels;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（parking-levels.js の冒頭の注記）
// parking.js の並べ方: マスの大きさ = min(CELL_MAX, 置ける幅 ÷ 列, 置ける高さ ÷ 行)。指で押しやすいよう CELL_MIN 以上にする
const AREA_W = 492;
const AREA_H = 770;
const CELL_MAX = 80;
const CELL_MIN = 60;
const NAIVE_FROM = 7; // この面から先は、素直なやり方では勝てないこと
const GOLD_FROM = 6; // 金色の車はこの面から
const OUT = -99;
const DV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

// ---- 解くための道具（sim とは別に書いた決まり。状態は車ごとの位置: 横向きは x、縦向きは y、出た車は OUT） ----
function parse(level) {
  return level.cars.map(([x, y, d, len, kind]) => ({ x, y, d, len: len || 2, gold: kind === 'gold', h: d === 'L' || d === 'R', sign: d === 'R' || d === 'D' ? 1 : -1 }));
}
const initState = (cars) => cars.map((c) => (c.h ? c.x : c.y));
function cellsAt(c, v) {
  const out = [];
  for (let k = 0; k < c.len; k++) out.push(c.h ? [v + k, c.y] : [c.x, v + k]);
  return out;
}
function occupancy(cars, s, cols, rows) {
  const g = new Int16Array(cols * rows).fill(-1);
  for (let i = 0; i < cars.length; i++) {
    if (s[i] === OUT) continue;
    for (const [x, y] of cellsAt(cars[i], s[i])) g[y * cols + x] = i;
  }
  return g;
}
// 動かせる手 { i, to, hit, gold }（すぐ前がふさがった車は入らない）
function moves(cars, s, cols, rows) {
  const g = occupancy(cars, s, cols, rows);
  const out = [];
  for (let i = 0; i < cars.length; i++) {
    if (s[i] === OUT) continue;
    const c = cars[i];
    const [dx, dy] = DV[c.d];
    let x = c.h ? (dx > 0 ? s[i] + c.len - 1 : s[i]) : c.x;
    let y = c.h ? c.y : dy > 0 ? s[i] + c.len - 1 : s[i];
    let free = 0;
    let hit = -1;
    for (;;) {
      x += dx;
      y += dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) break;
      if (g[y * cols + x] >= 0) {
        hit = g[y * cols + x];
        break;
      }
      free++;
    }
    if (hit >= 0 && free === 0) continue;
    out.push({ i, to: hit < 0 ? OUT : s[i] + c.sign * free, hit, gold: hit >= 0 && (c.gold || cars[hit].gold) });
  }
  return out;
}
const allOut = (s) => s.every((v) => v === OUT);
function play(s, m) {
  const t = s.slice();
  t[m.i] = m.to;
  return t;
}

// 全部の形を調べる: 最短手数と最短の手順、でたらめにタップして勝てる確率、止まる手が出てくる形があるか、いちばん短い負け方（理由つき）
function analyze(level) {
  const cars = parse(level);
  const { cols, rows } = level;
  const memo = new Map();
  let partialSeen = false;
  function rec(s) {
    const k = s.join(',');
    let r = memo.get(k);
    if (r) return r;
    if (allOut(s)) {
      r = { p: 1, dist: 0, next: null, lose: null };
      memo.set(k, r);
      return r;
    }
    const ms = moves(cars, s, cols, rows);
    // 動ける車が無い（stuck）か、どれを動かしても金色の車にぶつかる（nosafe）なら、その形で負け
    if (!ms.length || ms.every((m) => m.gold)) {
      if (ms.some((m) => m.to !== OUT)) partialSeen = true;
      r = { p: 0, dist: Infinity, next: null, lose: { seq: [], reason: ms.length ? 'nosafe' : 'stuck' } };
      memo.set(k, r);
      return r;
    }
    let p = 0;
    let dist = Infinity;
    let next = null;
    let lose = null;
    for (const m of ms) {
      if (m.to !== OUT) partialSeen = true;
      if (m.gold) {
        if (!lose || lose.seq.length > 1) lose = { seq: [m.i], reason: 'gold' };
        continue;
      }
      const t = play(s, m);
      const rr = rec(t);
      p += rr.p;
      if (rr.dist + 1 < dist) {
        dist = rr.dist + 1;
        next = { i: m.i, t };
      }
      if (rr.lose && (!lose || lose.seq.length > rr.lose.seq.length + 1)) lose = { seq: [m.i].concat(rr.lose.seq), reason: rr.lose.reason };
    }
    r = { p: p / ms.length, dist, next, lose };
    memo.set(k, r);
    return r;
  }
  const s0 = initState(cars);
  const r0 = rec(s0);
  const best = [];
  for (let s = s0; memo.get(s.join(',')).next; ) {
    const n = memo.get(s.join(',')).next;
    best.push(n.i);
    s = n.t;
  }
  return { states: memo.size, dist: r0.dist, p: r0.p, best, lose: r0.lose, partialSeen };
}

// 出られる車を全部出し切った形（出す順はどれでも同じ形になる）
function exitClosure(cars, s, cols, rows) {
  for (;;) {
    const ex = moves(cars, s, cols, rows).filter((m) => m.to === OUT);
    if (!ex.length) return s;
    s = s.slice();
    for (const m of ex) s[m.i] = OUT;
  }
}
// 気をつける人が勝てる確率: 出られる車を先に全部出し、出られる車が無いときは金色の車にぶつからない車からでたらめに選ぶ
function careful(level) {
  const cars = parse(level);
  const { cols, rows } = level;
  const memo = new Map();
  function rec(s0) {
    const s = exitClosure(cars, s0, cols, rows);
    const k = s.join(',');
    if (memo.has(k)) return memo.get(k);
    let p;
    if (allOut(s)) p = 1;
    else {
      const safe = moves(cars, s, cols, rows).filter((m) => !m.gold);
      p = safe.length ? safe.reduce((a, m) => a + rec(play(s, m)), 0) / safe.length : 0;
    }
    memo.set(k, p);
    return p;
  }
  return rec(initState(cars));
}
// 素直なやり方の手順と結果
function naive(level) {
  const cars = parse(level);
  const { cols, rows } = level;
  let s = initState(cars);
  const seq = [];
  for (let n = 0; n < 500; n++) {
    if (allOut(s)) return { win: true, seq };
    const ms = moves(cars, s, cols, rows).filter((m) => !m.gold);
    if (!ms.length) return { win: false, seq };
    const pos = (i) => (cars[i].h ? [cars[i].y, s[i]] : [s[i], cars[i].x]);
    ms.sort((a, b) => {
      const pa = pos(a.i);
      const pb = pos(b.i);
      return pa[0] - pb[0] || pa[1] - pb[1];
    });
    const m = ms.find((mm) => mm.to === OUT) || ms[0];
    seq.push(m.i);
    s = play(s, m);
  }
  return { win: false, seq };
}

// 車の文字（盤の上から順に a, b, c …。金色の車は大文字）
const letter = (level, i) => {
  const ch = String.fromCharCode(97 + i);
  return level.cars[i][4] === 'gold' ? ch.toUpperCase() : ch;
};
const word = (level, seq) => seq.map((i) => letter(level, i)).join('');
function draw(level) {
  const cars = parse(level);
  const g = occupancy(cars, initState(cars), level.cols, level.rows);
  const AR = { U: '^', D: 'v', L: '<', R: '>' };
  const lines = [];
  for (let y = 0; y < level.rows; y++) {
    let a = '    ';
    for (let x = 0; x < level.cols; x++) {
      const i = g[y * level.cols + x];
      a += i < 0 ? ' . ' : ' ' + letter(level, i) + AR[cars[i].d];
    }
    lines.push(a);
  }
  return lines.join('\n');
}
// 本物の決まりで、車の文字の順にタップする。結果は 'clear' | 'fail:stuck' | 'fail:gold' | 'play'（と手数）
function runSim(level, taps) {
  const sim = SIM.createSim(level);
  for (const ch of taps) {
    const i = ch.toLowerCase().charCodeAt(0) - 97;
    sim.tap(i);
  }
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, moves: sim.moves, sim };
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

// ---- レベル ----
LEVELS.forEach((level, lv) => {
  const no = lv + 1;
  const name = no + '面 ' + level.name;
  if (DRAW) console.log(name + '\n' + draw(level));
  // 形
  const cars = level.cars;
  const occ = new Set();
  let shapeOk = Number.isInteger(level.cols) && Number.isInteger(level.rows) && cars.length > 0;
  const why = [];
  cars.forEach((c, i) => {
    const [x, y, d, len, kind] = c;
    const L = len || 2;
    if (!DV[d] || (L !== 2 && L !== 3) || (kind !== undefined && kind !== 'gold') || (kind === 'gold' && L !== 2)) {
      shapeOk = false;
      why.push(letter(level, i) + ' の向き・長さ・種類');
      return;
    }
    const h = d === 'L' || d === 'R';
    for (let k = 0; k < L; k++) {
      const cx = h ? x + k : x;
      const cy = h ? y : y + k;
      if (cx < 0 || cy < 0 || cx >= level.cols || cy >= level.rows) {
        shapeOk = false;
        why.push(letter(level, i) + ' が盤の外');
      }
      if (occ.has(cx + ',' + cy)) {
        shapeOk = false;
        why.push(letter(level, i) + ' が重なる');
      }
      occ.add(cx + ',' + cy);
    }
  });
  if (shapeOk) {
    const P = parse(level);
    P.forEach((A, a) =>
      P.forEach((B, b) => {
        if ((A.d === 'R' && B.d === 'L' && A.y === B.y && A.x < B.x) || (A.d === 'D' && B.d === 'U' && A.x === B.x && A.y < B.y)) {
          shapeOk = false;
          why.push(letter(level, a) + ' と ' + letter(level, b) + ' が向かい合っている');
        }
      }),
    );
  }
  const cell = Math.min(CELL_MAX, Math.floor(AREA_W / level.cols), Math.floor(AREA_H / level.rows));
  if (cell < CELL_MIN) why.push('マスが小さい ' + cell);
  const golds = cars.filter((c) => c[4] === 'gold').length;
  if (no < GOLD_FROM && golds) why.push(GOLD_FROM + '面より前に金色の車');
  if (no >= GOLD_FROM && !golds) why.push('金色の車が無い');
  if (!shapeOk || why.length) {
    ng(name + ' 形がおかしい（' + why.join('・') + '）');
    return;
  }
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng(name + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);

  const a = analyze(level);
  if (a.dist === Infinity) {
    ng(name + ' 解けない');
    return;
  }
  const best = runSim(level, word(level, a.best));
  const pc = careful(level);
  const nv = naive(level);
  const line = name + '  ' + level.cols + '×' + level.rows + ' 車 ' + cars.length + (golds ? '（金色 ' + golds + '）' : '') + '  最短 ' + a.dist + ' 手 ' + word(level, a.best) +
    '（調べた形 ' + a.states + '）→ ' + best.result + '（' + best.moves + ' 手）  でたらめ ' + (a.p * 100).toFixed(1) + '%  気をつける人 ' + (pc * 100).toFixed(1) + '%  素直なやり方 ' +
    (nv.win ? '勝ち' : '負け') + ' ' + word(level, nv.seq);
  const fails = [];
  if (best.result !== 'clear' || best.moves !== a.dist) fails.push('最短の手順をなぞってもクリアにならない');
  if (no <= 2 && (a.partialSeen || a.p !== 1)) fails.push('1・2面は止まる手が出てこず、どの順でも勝てること');
  // 止まる手が要る ＝ 最短手数が車の数より多い（どの車も出るのに1手は要るため）
  if (no === 3 && !(pc === 1 && a.dist > cars.length)) fails.push('3面は止まる手が要り、気をつける人は必ず勝つこと');
  if (no >= 4 && !(pc < 1)) fails.push('4面から先は詰む手があること');
  if (no >= NAIVE_FROM && nv.win) fails.push(NAIVE_FROM + '面から先は素直なやり方で勝てたら NG');
  if (fails.length) ng(line + '（' + fails.join('・') + '）');
  else console.log('OK  ' + line);
  // 素直なやり方の手順を、本物の決まりでなぞっても同じ結果になるか
  const nr = runSim(level, word(level, nv.seq));
  if ((nr.result === 'clear') !== nv.win) ng(name + '  素直なやり方 ' + word(level, nv.seq) + ' を本物の決まりでなぞると ' + nr.result);
  // いちばん短い負け方を、本物の決まりでも同じ理由で負けるか
  if (a.lose) {
    const r = runSim(level, word(level, a.lose.seq));
    const want = 'fail:' + a.lose.reason;
    if (r.result === want) console.log('OK  ' + name + '  いちばん短い負け方 ' + word(level, a.lose.seq) + ' → ' + r.result);
    else ng(name + '  いちばん短い負け方 ' + word(level, a.lose.seq) + ' 期待 ' + want + ' 結果 ' + r.result);
  } else if (no >= 4) ng(name + ' 負け方が無い');
});

// ---- 期待の表（レベル番号・車の文字の順・期待する結果・手数） ----
// 車の文字は --draw で描く盤の文字（上の行から順に a, b, c …。金色は大文字。タップの指定は小文字でも同じ）。
// 勝ち方は最短の手順、負け方は「金色の車にぶつける」と「ぶつけずに詰む」のいちばん短い手順（2026-11-04 に全部の手を調べて出した）
const CASES = [
  [1, 'abdc', 'clear', 4],
  [1, 'bc', 'play', 0], // すぐ前がふさがった車は動かない
  [2, 'abcdef', 'clear', 6],
  [2, 'cdf', 'play', 0],
  [3, 'abcdefbg', 'clear', 8],
  [3, 'ab', 'play', 2], // b は f の手前で止まる
  [4, 'acbefcdghic', 'clear', 11],
  [4, 'acbdeghi', 'fail:stuck', 8],
  [5, 'fghjabcdegfi', 'clear', 12],
  [5, 'cghija', 'fail:stuck', 6],
  [6, 'bdefijdgChab', 'clear', 12],
  [6, 'C', 'fail:gold', 1],
  [6, 'habi', 'fail:nosafe', 4],
  [7, 'agiJfbhkcdegih', 'clear', 14],
  [7, 'f', 'fail:gold', 1],
  [7, 'aghijkc', 'fail:stuck', 7],
  [8, 'baGjklehbdfijc', 'clear', 14],
  [8, 'G', 'fail:gold', 1],
  [8, 'dkl', 'fail:nosafe', 3],
  [9, 'cfhbegkmDhIjklaf', 'clear', 16],
  [9, 'D', 'fail:gold', 1],
  [9, 'cegkmdjlaf', 'fail:stuck', 10],
  [10, 'fhgdcbhemafijkLnOd', 'clear', 18],
  [10, 'L', 'fail:gold', 1],
  [10, 'dcbefhgimafno', 'fail:nosafe', 13],
];
for (const [no, taps, want, n] of CASES) {
  const level = LEVELS[no - 1];
  if (!level) {
    ng('表 ' + no + '面が無い');
    continue;
  }
  const r = runSim(level, taps);
  const line = '表 ' + no + '面 ' + taps.padEnd(20) + ' 期待 ' + (want + '（' + n + ' 手）').padEnd(18) + ' 結果 ' + r.result + '（' + r.moves + ' 手）';
  if (r.result === want && r.moves === n) console.log('OK  ' + line);
  else ng(line);
}

// ---- 車の動きの決まり ----
const make = (cols, rows, cars) => SIM.createSim({ cols, rows, cars });
const where = (sim) => sim.cars.map((c) => (c.out ? '出' : c.x + ',' + c.y)).join(' ');
const result = (sim) => (sim.state === 'fail' ? 'fail:' + sim.reason : sim.state);
// 4台が互いのすぐ前をふさいで回る形（どれも動けない）。左上 3×3 に置く
const PINWHEEL = [[0, 0, 'R'], [2, 0, 'D'], [1, 2, 'L'], [0, 1, 'U']];
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['前が端まで空いていれば外へ出る（手数 1）', () => {
    const sim = make(4, 3, [[0, 1, 'R']]);
    const moved = sim.tap(0);
    return [moved && sim.cars[0].out && sim.moves === 1 && sim.events.some((e) => e.type === 'exit' && e.car === 0 && e.dist === 2), where(sim) + ' 手数 ' + sim.moves];
  }],
  ['4つの向きどれでも、向いた方へ出る', () => {
    const seen = [];
    for (const d of ['U', 'D', 'L', 'R']) {
      const sim = make(5, 5, [[2, 2, d]]);
      sim.tap(0);
      const e = sim.events.find((ev) => ev.type === 'exit');
      seen.push(d + ':' + (e ? e.dist : '-'));
    }
    // 左上が (2,2) の2マスの車: 上へは2マス・下へは1マス（(2,3) まで占めるため）・左へは2マス・右へは1マス空いている
    return [seen.join(' ') === 'U:2 D:1 L:2 R:1', seen.join(' ')];
  }],
  ['前に車がいれば、そのすぐ手前で止まる（手数に数える）', () => {
    const sim = make(6, 3, [[0, 1, 'R'], [4, 0, 'D']]);
    sim.tap(0);
    return [where(sim) === '2,1 4,0' && sim.moves === 1 && sim.state === 'play' && sim.events.some((e) => e.type === 'move' && e.hit === 1 && e.dist === 2), where(sim) + ' 手数 ' + sim.moves];
  }],
  ['すぐ前に車がいる車は動かない（手数に数えない）', () => {
    const sim = make(4, 3, [[0, 1, 'R'], [2, 0, 'D']]);
    const moved = sim.tap(0);
    return [!moved && where(sim) === '0,1 2,0' && sim.moves === 0 && sim.events.some((e) => e.type === 'deny' && e.hit === 1), where(sim) + ' 手数 ' + sim.moves];
  }],
  ['止まった車は、前があいたら続きを進める', () => {
    const sim = make(6, 3, [[0, 1, 'R'], [4, 1, 'D']]);
    sim.tap(0);
    const mid = where(sim);
    sim.tap(1);
    sim.tap(0);
    return [mid === '2,1 4,1' && where(sim) === '出 出' && sim.state === 'clear', mid + ' → ' + where(sim)];
  }],
  ['トラック（3マス）も手前で止まり、出られる', () => {
    const sim = make(3, 7, [[1, 0, 'D', 3], [0, 5, 'R', 3]]);
    sim.tap(0);
    const mid = where(sim);
    sim.tap(1);
    sim.tap(0);
    return [mid === '1,2 0,5' && where(sim) === '出 出' && sim.cars[0].len === 3, mid + ' → ' + where(sim)];
  }],
  ['出た車のマスは空き、後ろの車が続けて出られる', () => {
    const sim = make(5, 1, [[0, 0, 'R'], [2, 0, 'R']]);
    const first = sim.tap(0);
    sim.tap(1);
    const second = sim.tap(0);
    return [!first && second && where(sim) === '出 出', where(sim)];
  }],
  ['全部出したらクリア（出し切る前は play）', () => {
    const sim = make(4, 4, [[0, 0, 'R'], [0, 2, 'L']]);
    sim.tap(0);
    const mid = sim.state;
    sim.tap(1);
    return [mid === 'play' && sim.state === 'clear' && sim.left() === 0, mid + ' → ' + sim.state];
  }],
  ['どの車も動けなくなったら失敗（stuck）。動ける車が1台でも残っていれば失敗にしない', () => {
    // 回る4台は動けない。右の1台が出ると、動ける車が無くなる
    const sim = make(4, 3, PINWHEEL.concat([[3, 0, 'D']]));
    sim.tap(0);
    const mid = result(sim) + '（' + sim.moves + ' 手）';
    sim.tap(4);
    return [mid === 'play（0 手）' && result(sim) === 'fail:stuck' && sim.moves === 1, mid + ' → ' + result(sim)];
  }],
  ['金色の車にぶつかったら失敗（gold）', () => {
    const sim = make(5, 3, [[0, 1, 'R'], [3, 0, 'U', 2, 'gold']]);
    sim.tap(0);
    return [result(sim) === 'fail:gold' && where(sim) === '1,1 3,0', result(sim) + ' ' + where(sim)];
  }],
  ['金色の車がぶつかりにいっても失敗（gold）', () => {
    const sim = make(5, 3, [[0, 1, 'R', 2, 'gold'], [3, 0, 'U']]);
    sim.tap(0);
    return [result(sim) === 'fail:gold' && where(sim) === '1,1 3,0', result(sim) + ' ' + where(sim)];
  }],
  ['金色の車のすぐ前・すぐ後ろにいて動けないだけなら失敗にしない', () => {
    const s1 = make(4, 3, [[0, 1, 'R'], [2, 0, 'U', 2, 'gold']]);
    s1.tap(0);
    const s2 = make(4, 3, [[0, 1, 'R', 2, 'gold'], [2, 0, 'D']]);
    s2.tap(0);
    return [result(s1) === 'play' && s1.moves === 0 && result(s2) === 'play' && s2.moves === 0, 'ふつうの車 ' + result(s1) + ' 金色の車 ' + result(s2)];
  }],
  ['金色の車も、前が空いていれば出られる', () => {
    const sim = make(4, 3, [[0, 1, 'R', 2, 'gold']]);
    sim.tap(0);
    return [result(sim) === 'clear', result(sim)];
  }],
  ['どれを動かしても金色の車にぶつかる形になったら失敗（nosafe）。ぶつからない手が残っていれば失敗にしない', () => {
    // 回る4台は動けず、金色の車は進むと回る4台にぶつかる。右下の1台が出ると、ぶつからない手が無くなる
    const sim = make(6, 3, PINWHEEL.concat([[4, 1, 'L', 2, 'gold'], [4, 2, 'R']]));
    sim.tap(0);
    const mid = result(sim) + '（' + sim.moves + ' 手）';
    sim.tap(5);
    return [mid === 'play（0 手）' && result(sim) === 'fail:nosafe' && sim.moves === 1, mid + ' → ' + result(sim)];
  }],
  ['終わったあと（失敗・クリア）のタップは何もしない', () => {
    const sim = make(5, 3, [[0, 1, 'R'], [3, 0, 'U', 2, 'gold']]);
    sim.tap(0);
    const moved = sim.tap(1);
    const sim2 = make(4, 3, [[0, 1, 'R']]);
    sim2.tap(0);
    const moved2 = sim2.tap(0);
    return [!moved && where(sim) === '1,1 3,0' && sim.moves === 1 && !moved2 && sim2.moves === 1, '失敗のあと ' + where(sim) + ' 手数 ' + sim.moves + ' ／ クリアのあと 手数 ' + sim2.moves];
  }],
  ['出た車をタップしても何もしない', () => {
    const sim = make(4, 4, [[0, 0, 'R'], [0, 2, 'L']]);
    sim.tap(0);
    const moved = sim.tap(0);
    return [!moved && sim.moves === 1 && sim.state === 'play', '手数 ' + sim.moves + ' ' + sim.state];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + LEVELS.length + ' 面・表 ' + CASES.length + ' 件・決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
