// ブロックを置いて列を消すの各レベルが解けることと、盤・ブロック・列が消える決まりを確かめる。
// - レベルの形: 盤が 8×8・使える文字だけ・最初からそろった行や列が無い・宝石がある・氷のブロックは6面から（6面から先は必ずある）・
//   ブロックの形（# と . だけ・余白の行や列が無い・受け皿に収まる大きさ）・ブロックの数・ヒントの字数・最初にどれかのブロックを置ける
// - 解く道具（block-sim.js とは別に書いた決まり）で勝ち方を探し、見つけた手順を本物の決まり（block-sim.js の place）でなぞってクリアになるか
// - でたらめに置く人と「気をつける人」（その場で宝石が取れる手を選び、すぐ負ける手を避け、ほかはでたらめ）が勝てる確率（参考。乱数の種は決めてある）
// - 素直なやり方（宝石が取れる手 → 列が消える手 → まわりのふさがったすき間にはまる手 の順に選ぶ。同じなら左の置き場・上の行・左の列）。
//   7面から先は勝てたら NG
// - でたらめな手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形・同じ置ける手・同じ結果になるか
// - 期待の表 CASES（レベルごとに決めた手順と、クリア／失敗の理由）を本物の決まりで流す
// - 決まり RULES（行・列が消える・氷・受け皿・負け方・指の位置から置く所を決める計算 など）
// 使い方: node tools/test-block.js            （このフォルダの app/ を調べる）
//         node tools/test-block.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-block.js --cases    （解く道具が見つけた勝ち方を CASES の形で出す）
// 手順の書き方: 「ブロックの番号@行,列」を1手とし、空白でつなぐ。ブロックの番号は level.pieces の並びで 0 から、
// 行・列は盤の左上が 0,0 で、ブロックの左上のマス（形の文字列の左上。そこが . のこともある）を置く所。
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const PRINT_CASES = args.includes('--cases');
const appDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'block-levels.js'));
require(path.join(appDir, 'js', 'games', 'block-sim.js'));
const KG = globalThis.KG;
const SIM = KG.blockSim;
const LEVELS = KG.blockLevels;
const N = 8;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（block-levels.js の冒頭の注記）
const ICE_FROM = 6; // 氷のブロックはこの面から
const NAIVE_FROM = 7; // この面から先は、素直なやり方では勝てないこと
const NEXT_FROM = 5; // この面から先でブロックが4つ以上ある面は、最初に出る3つだけでは勝てないこと（5面で「次の3つ」を覚える）
const PIECE_MAX = 12; // 1面のブロックの数の上限（このあと出るブロックの列が画面に収まるように。block.js の drawUpcoming）
const SHAPE_MAX = 5; // ブロックの縦・横の大きさの上限（受け皿の置き場に収まるように）
const SEARCH_LIMIT = 300000; // 勝ち方を探すときに調べる形の数の上限
const PLAYOUTS = 2000; // 確率を出すときの回数
const CROSS = 200; // 突き合わせるでたらめな手順の数（レベルごと）

// ---- 解く道具（sim とは別に書いた決まり。形 = { b: マスの中身, g: 宝石, tray: 置き場ごとのブロックの番号, next }） ----
function prep(level) {
  const b = new Uint8Array(N * N);
  const g = new Uint8Array(N * N);
  level.board.forEach((line, r) => {
    for (let c = 0; c < N; c++) {
      const ch = line[c];
      b[r * N + c] = ch === '#' || ch === '*' ? 1 : ch === '=' || ch === '@' ? 2 : 0;
      g[r * N + c] = ch === '*' || ch === '@' ? 1 : 0;
    }
  });
  const pieces = level.pieces.map((s) => {
    const rows = s.split('/');
    const offs = [];
    rows.forEach((line, r) => [...line].forEach((ch, c) => ch === '#' && offs.push([r, c])));
    return { shape: s, offs, w: Math.max(...rows.map((l) => l.length)), h: rows.length };
  });
  const s = { b, g, tray: [-1, -1, -1], next: 0 };
  deal(pieces, s);
  return { pieces, s };
}
function deal(pieces, s) {
  for (let k = 0; k < 3; k++) s.tray[k] = s.next < pieces.length ? s.next++ : -1;
}
const cloneS = (s) => ({ b: s.b.slice(), g: s.g.slice(), tray: s.tray.slice(), next: s.next });
const keyOf = (s) => s.b.join('') + '|' + s.g.join('') + '|' + s.tray.filter((x) => x >= 0).sort((a, b) => a - b).join(',') + '|' + s.next;
function fitsAt(P, b, r, c) {
  for (const [dr, dc] of P.offs) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= N || cc >= N || b[rr * N + cc]) return false;
  }
  return true;
}
// 置ける手の一覧 [{ slot, id, r, c }]。same が真なら、受け皿に同じ形が2つあっても両方の手を並べる（突き合わせ用）
function movesOf(pieces, s, same) {
  const out = [];
  const shapes = new Set();
  s.tray.forEach((id, slot) => {
    if (id < 0) return;
    if (!same && shapes.has(pieces[id].shape)) return;
    shapes.add(pieces[id].shape);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fitsAt(pieces[id], s.b, r, c)) out.push({ slot, id, r, c });
  });
  return out;
}
// 手 m を打った形と結果 { s, result: 'play' | 'clear' | 'fail:nospace' | 'fail:nopiece', gems, lines, snug, progress }
function apply(pieces, s, m) {
  const t = cloneS(s);
  const P = pieces[m.id];
  let snug = 0; // ブロックのまわりで、ふさがっているマス（盤の外も）の数
  let progress = 0; // ブロックのマスのうち、宝石のある行か列に入ったものの数
  const gemRow = new Uint8Array(N);
  const gemCol = new Uint8Array(N);
  for (let i = 0; i < N * N; i++) if (s.g[i]) gemRow[Math.floor(i / N)] = gemCol[i % N] = 1;
  for (const [dr, dc] of P.offs) {
    t.b[(m.r + dr) * N + m.c + dc] = 1;
    if (gemRow[m.r + dr] || gemCol[m.c + dc]) progress++;
  }
  for (const [dr, dc] of P.offs) {
    for (const [ar, ac] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = m.r + dr + ar;
      const cc = m.c + dc + ac;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || (s.b[rr * N + cc] && !P.offs.some(([x, y]) => x === dr + ar && y === dc + ac))) snug++;
    }
  }
  const hits = new Uint8Array(N * N);
  let lines = 0;
  for (let k = 0; k < N; k++) {
    let row = true;
    let col = true;
    for (let j = 0; j < N; j++) {
      if (!t.b[k * N + j]) row = false;
      if (!t.b[j * N + k]) col = false;
    }
    if (row) {
      lines++;
      for (let j = 0; j < N; j++) hits[k * N + j]++;
    }
    if (col) {
      lines++;
      for (let j = 0; j < N; j++) hits[j * N + k]++;
    }
  }
  let gems = 0;
  for (let i = 0; i < N * N; i++) {
    if (!hits[i]) continue;
    if (t.b[i] === 2 && hits[i] === 1) t.b[i] = 1;
    else {
      t.b[i] = 0;
      if (t.g[i]) {
        t.g[i] = 0;
        gems++;
      }
    }
  }
  t.tray[m.slot] = -1;
  const res = (result) => ({ s: t, result, gems, lines, snug, progress });
  if (!t.g.some((x) => x)) return res('clear');
  if (t.tray.every((x) => x < 0)) {
    if (t.next >= pieces.length) return res('fail:nopiece');
    deal(pieces, t);
  }
  const ok = t.tray.some((id) => {
    if (id < 0) return false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fitsAt(pieces[id], t.b, r, c)) return true;
    return false;
  });
  return res(ok ? 'play' : 'fail:nospace');
}
// 勝ち方を1つ探す（調べた形は覚えておき、2度は調べない）。宝石が取れる手・列が消える手から先に試す
function solve(level) {
  const { pieces, s } = prep(level);
  const seen = new Set();
  let overflow = false;
  function dfs(st, depth) {
    const k = keyOf(st);
    if (seen.has(k)) return null;
    if (seen.size >= SEARCH_LIMIT) {
      overflow = true;
      return null;
    }
    seen.add(k);
    const tries = movesOf(pieces, st, false).map((m) => ({ m, r: apply(pieces, st, m) }));
    tries.sort((a, b) => b.r.gems - a.r.gems || b.r.lines - a.r.lines || b.r.snug - a.r.snug);
    for (const { m, r } of tries) {
      if (r.result === 'clear') return [m];
      if (r.result !== 'play') continue;
      const w = dfs(r.s, depth + 1);
      if (w) return [m].concat(w);
      if (overflow) return null;
    }
    return null;
  }
  const win = dfs(s, 0);
  return { win, nodes: seen.size, overflow };
}
// 勝てる確率。'random': 置ける手からでたらめ／'careful': すぐ勝てる手 → 宝石が取れる手 → 宝石のある行か列を埋める手 → すぐ負けない手 の順に
// しぼってでたらめ（どれも、すぐ負ける手は選ばない。選べる手が無ければ負ける手から選ぶ）
function winRate(level, mode, seed) {
  const { pieces, s } = prep(level);
  const rnd = KG.rng(seed);
  let wins = 0;
  for (let n = 0; n < PLAYOUTS; n++) {
    let st = s;
    for (;;) {
      let opts = movesOf(pieces, st, true).map((m) => ({ m, r: apply(pieces, st, m) }));
      if (mode === 'careful') {
        const win = opts.filter((o) => o.r.result === 'clear');
        const safe = opts.filter((o) => o.r.result === 'play');
        const gem = safe.filter((o) => o.r.gems > 0);
        const prog = safe.filter((o) => o.r.progress > 0);
        opts = win.length ? win : gem.length ? gem : prog.length ? prog : safe.length ? safe : opts;
      }
      const o = opts[Math.floor(rnd() * opts.length)];
      if (o.r.result === 'clear') wins++;
      if (o.r.result !== 'play') break;
      st = o.r.s;
    }
  }
  return wins / PLAYOUTS;
}
// 素直なやり方（冒頭の注記）
function naive(level) {
  const { pieces, s } = prep(level);
  let st = s;
  const seq = [];
  for (;;) {
    const opts = movesOf(pieces, st, true).map((m) => ({ m, r: apply(pieces, st, m) }));
    let best = null;
    for (const o of opts) {
      const score = (o.r.result === 'clear' ? 1e6 : 0) + o.r.gems * 1e4 + o.r.lines * 100 + o.r.snug;
      if (!best || score > best.score) best = { o, score };
    }
    seq.push(best.o.m);
    if (best.o.r.result !== 'play') return { result: best.o.r.result, seq };
    st = best.o.r.s;
  }
}
const word = (seq) => (seq ? seq.map((m) => m.id + '@' + m.r + ',' + m.c).join(' ') : '-');

// ---- 本物の決まりで流す ----
function runSim(level, taps) {
  const sim = SIM.createSim(level);
  for (const w of taps.split(' ').filter(Boolean)) {
    if (sim.state !== 'play') break;
    const m = /^(\d+)@(\d+),(\d+)$/.exec(w);
    const slot = m ? sim.tray.indexOf(Number(m[1])) : -1;
    if (slot < 0) return { result: '受け皿に無いブロック ' + w, moves: sim.moves, sim };
    if (!sim.place(slot, Number(m[2]), Number(m[3]))) return { result: '置けない手 ' + w, moves: sim.moves, sim };
  }
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, moves: sim.moves, sim };
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

// ---- レベルの形 ----
function shapeProblems(level, no) {
  const why = [];
  if (!Array.isArray(level.board) || level.board.length !== N) why.push('盤が ' + N + ' 行でない');
  else {
    level.board.forEach((line, r) => {
      if (line.length !== N) why.push(r + ' 行目が ' + N + ' 字でない');
      if (/[^.#*=@]/.test(line)) why.push(r + ' 行目に使えない文字');
      if (no < ICE_FROM && /[=@]/.test(line)) why.push(ICE_FROM + '面より前に氷');
    });
    const b = prep(level).s.b;
    for (let k = 0; k < N; k++) {
      let row = true;
      let col = true;
      for (let j = 0; j < N; j++) {
        if (!b[k * N + j]) row = false;
        if (!b[j * N + k]) col = false;
      }
      if (row) why.push('最初からそろった行 ' + k);
      if (col) why.push('最初からそろった列 ' + k);
    }
    if (!level.board.some((l) => /[*@]/.test(l))) why.push('宝石が無い');
    if (no >= ICE_FROM && !level.board.some((l) => /[=@]/.test(l))) why.push('氷が無い');
  }
  if (!level.pieces.length || level.pieces.length > PIECE_MAX) why.push('ブロックの数 ' + level.pieces.length + '（1〜' + PIECE_MAX + '）');
  level.pieces.forEach((s, i) => {
    const rows = s.split('/');
    if (/[^.#/]/.test(s) || !s.includes('#')) why.push(i + ' 番のブロックの形 ' + s);
    if (rows.some((l) => l.length !== rows[0].length)) why.push(i + ' 番のブロックの行の長さがそろっていない ' + s);
    if (!/#/.test(rows[0]) || !/#/.test(rows[rows.length - 1]) || !rows.some((l) => l[0] === '#') || !rows.some((l) => l[l.length - 1] === '#'))
      why.push(i + ' 番のブロックに余白の行か列がある ' + s);
    if (rows.length > SHAPE_MAX || rows[0].length > SHAPE_MAX) why.push(i + ' 番のブロックが大きすぎる ' + s);
  });
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) why.push('ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  return why;
}

const casesOut = [];
LEVELS.forEach((level, li) => {
  const no = li + 1;
  const name = no + '面 ' + level.name;
  const why = shapeProblems(level, no);
  if (why.length) {
    ng(name + ' 形: ' + why.join(' / '));
    return;
  }
  const start = SIM.createSim(level);
  if (!start.tray.some((id) => id >= 0 && start.fits(id))) ng(name + ' 最初に置けるブロックが無い');
  const sv = solve(level);
  const gems = level.board.join('').replace(/[^*@]/g, '').length;
  const ice = level.board.join('').replace(/[^=@]/g, '').length;
  const head = name + '  ブロック ' + level.pieces.length + ' 宝石 ' + gems + (ice ? ' 氷 ' + ice : '');
  if (!sv.win) {
    ng(head + (sv.overflow ? ' 勝ち方を探す形が ' + SEARCH_LIMIT + ' を超えた' : ' 解けない'));
    return;
  }
  const ww = word(sv.win);
  const r = runSim(level, ww);
  const random = winRate(level, 'random', no * 7919);
  const careful = winRate(level, 'careful', no * 104729);
  const nv = naive(level);
  const line = head + '  勝ち方 ' + ww + '（調べた形 ' + sv.nodes + '）→ ' + r.result + '（' + r.moves + ' 手）' +
    '  でたらめ ' + (random * 100).toFixed(1) + '%  気をつける人 ' + (careful * 100).toFixed(1) + '%  素直なやり方 ' +
    (nv.result === 'clear' ? '勝ち' : '負け（' + nv.result + '）') + ' ' + word(nv.seq);
  const why2 = [];
  if (r.result !== 'clear' || r.moves !== sv.win.length) why2.push('見つけた勝ち方が本物の決まりでクリアにならない');
  if (no >= NAIVE_FROM && nv.result === 'clear') why2.push('素直なやり方で勝てる');
  // 5面から先でブロックが4つ以上ある面は、最初に受け皿へ出る3つだけでは勝てない（次の3つ以降も要る）
  if (no >= NEXT_FROM && level.pieces.length > 3 && solve(Object.assign({}, level, { pieces: level.pieces.slice(0, 3) })).win) why2.push('最初の3つだけで勝てる');
  if (why2.length) ng(line + '  ' + why2.join(' / '));
  else console.log('OK  ' + line);
  casesOut.push("  [" + no + ", '" + ww + "', 'clear', " + sv.win.length + '],');
  // でたらめな手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形になるか
  const { pieces, s } = prep(level);
  const rnd = KG.rng(no * 31337);
  let diff = '';
  for (let pl = 0; pl < CROSS && !diff; pl++) {
    const sim = SIM.createSim(level);
    let st = s;
    for (let mv = 0; mv < 40 && !diff; mv++) {
      if (sim.cells.join('') !== st.b.join('') || sim.gem.join('') !== st.g.join('')) diff = 'マスがちがう（' + mv + ' 手目の前）';
      else if (sim.tray.join() !== st.tray.join() || sim.next !== st.next) diff = '受け皿がちがう（' + mv + ' 手目の前）';
      if (diff) break;
      const ms = movesOf(pieces, st, true);
      let simCount = 0;
      for (let slot = 0; slot < 3; slot++) for (let rr = -1; rr <= N; rr++) for (let cc = -1; cc <= N; cc++) if (sim.canPlace(slot, rr, cc)) simCount++;
      if (simCount !== ms.length) {
        diff = '置ける手の数がちがう（' + mv + ' 手目の前）sim ' + simCount + ' / 道具 ' + ms.length;
        break;
      }
      const m = ms[Math.floor(rnd() * ms.length)];
      const res = apply(pieces, st, m);
      sim.place(m.slot, m.r, m.c);
      const simRes = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state;
      if (simRes !== res.result) diff = '結果がちがう（' + mv + ' 手目）sim ' + simRes + ' / 道具 ' + res.result;
      if (res.result !== 'play') break;
      st = res.s;
    }
  }
  if (diff) ng(name + ' 本物の決まりと解く道具の突き合わせ: ' + diff);
  else console.log('OK  ' + name + '  でたらめな手順 ' + CROSS + ' 本で、本物の決まりと解く道具の形が1手ごとに一致');
});

if (PRINT_CASES) {
  console.log('const CASES = [');
  for (const l of casesOut) console.log(l);
  console.log('];');
}

// ---- 期待の表（レベルごとに決めた手順と結果。2026-11-05 に出した） ----
// 勝ち方は解く道具が見つけたもの（--cases で出る）。負け方は、すぐ思いつく置き方で負ける形
// （4〜6面は Claude が選んだ置き方、7〜10面は素直なやり方がそのまま負ける手順）。
// [面, 手順, 期待の結果, 手数, 説明]
const CASES = [
  [1, '0@7,4', 'clear', 1],
  [2, '1@0,3', 'clear', 1],
  [3, '0@7,0', 'clear', 1],
  [4, '2@2,2', 'clear', 1],
  [4, '0@2,2 1@4,4', 'fail:nospace', 2, '小さいブロックを先に大きな穴へ入れる'],
  [5, '2@7,3 1@7,0 0@0,0 3@4,3', 'clear', 4],
  [5, '0@0,0 1@1,0 2@2,0 3@3,3 4@6,3 5@7,3', 'fail:nopiece', 6, '大きなブロックを、下のすき間から1段上にずらして置く'],
  [6, '0@7,6 1@4,3', 'clear', 2],
  [6, '0@7,6 1@0,0 2@0,5', 'fail:nopiece', 3, '氷が割れただけで宝石が取れたと思う'],
  [7, '1@6,4 2@4,3 0@0,1 3@4,6 5@0,2 4@3,2', 'clear', 6],
  [7, '1@6,4 2@4,3 0@0,1 3@4,6 5@4,4 4@2,4', 'fail:nopiece', 6, '列が消える所・すき間にはまる所へ置き続ける'],
  [8, '2@1,2 0@0,0 1@1,2 3@5,2 4@0,3 5@3,3 8@4,1 7@2,2 6@0,3', 'clear', 9],
  [8, '2@1,2 0@0,0 1@3,1 3@0,5 5@0,3 4@0,0 7@0,1 6@5,4 8@0,3', 'fail:nopiece', 9, '列が消える所・すき間にはまる所へ置き続ける'],
  [9, '2@3,3 1@1,3 0@1,5 4@1,0 3@1,0 5@4,3 7@0,3', 'clear', 7],
  [9, '2@3,3 1@0,5', 'fail:nospace', 2, '列が消える所・すき間にはまる所へ置き続ける'],
  [10, '2@3,1 1@7,1 0@0,1 3@2,3 5@2,0 4@1,5 8@2,7 6@0,3 7@1,1', 'clear', 9],
  [10, '2@3,1 1@7,1 0@0,1 3@2,3 4@0,2 5@0,5 8@0,7 7@5,5 6@4,0', 'fail:nopiece', 9, '列が消える所・すき間にはまる所へ置き続ける'],
];
for (const [no, taps, want, n, note] of CASES) {
  const level = LEVELS[no - 1];
  if (!level) {
    ng('表 ' + no + '面が無い');
    continue;
  }
  const r = runSim(level, taps);
  const line = '表 ' + no + '面 ' + (note ? '（' + note + '）' : '') + taps + '  期待 ' + want + '（' + n + ' 手） 結果 ' + r.result + '（' + r.moves + ' 手）';
  if (r.result === want && r.moves === n) console.log('OK  ' + line);
  else ng(line);
}

// ---- 決まり ----
// 小さな面を作る。rows は盤の行（足りない行は空き）
const make = (rows, pieces) => {
  const board = [];
  for (let r = 0; r < N; r++) board.push((rows[r] || '').padEnd(N, '.'));
  return SIM.createSim({ board, pieces });
};
const show = (sim) => {
  const out = [];
  for (let r = 0; r < N; r++) {
    let l = '';
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      l += sim.cells[i] === 0 ? '.' : sim.cells[i] === 2 ? (sim.gem[i] ? '@' : '=') : sim.gem[i] ? '*' : '#';
    }
    out.push(l);
  }
  return out;
};
const result = (sim) => (sim.state === 'fail' ? 'fail:' + sim.reason : sim.state);
const ev = (sim, type) => sim.events.filter((e) => e.type === type);
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['横の1行が全部埋まると、その行が消えて宝石が取れる', () => {
    const sim = make(['', '', '', '', '', '', '', '##*##..#'], ['##', '#', '#']);
    const ok = sim.place(0, 7, 5);
    return [ok && show(sim)[7] === '........' && sim.gemsLeft() === 0 && result(sim) === 'clear' && sim.moves === 1, show(sim)[7] + ' ' + result(sim)];
  }],
  ['縦の1列が全部埋まると、その列が消える', () => {
    const sim = make(['', '', '', '...#', '...#', '...*', '...#', '...#'], ['#/#/#', '#', '#']);
    sim.place(0, 0, 3);
    return [show(sim).every((l) => l[3] === '.') && result(sim) === 'clear', show(sim).map((l) => l[3]).join('')];
  }],
  ['行と列が同時にそろうと両方消える', () => {
    const sim = make(['#', '#', '#', '#', '#', '#', '*', '.######*'], ['#', '#', '#']);
    sim.place(0, 7, 0);
    const e = ev(sim, 'lines')[0];
    return [e && e.rows.join() === '7' && e.cols.join() === '0' && e.gems.length === 2 && result(sim) === 'clear', e ? '行 ' + e.rows + ' 列 ' + e.cols + ' 宝石 ' + e.gems.length : '-'];
  }],
  ['はみ出す所・ふさがった所には置けない（置けない手は手数に数えず、ブロックは受け皿に残る）', () => {
    const sim = make(['#', '', '', '', '*'], ['##', '#', '#']);
    const out = sim.place(0, 0, 7);
    const over = sim.place(0, 0, 0);
    const neg = sim.place(0, -1, 0);
    return [!out && !over && !neg && sim.moves === 0 && sim.tray[0] === 0 && ev(sim, 'deny').length === 3, [out, over, neg].join() + ' 手数 ' + sim.moves];
  }],
  ['ブロックは形のまま置く（回らない）: 縦の3つは縦に3マス埋める', () => {
    const sim = make(['*'], ['#/#/#', '#', '#']);
    sim.place(0, 2, 5);
    return [show(sim)[2][5] === '#' && show(sim)[3][5] === '#' && show(sim)[4][5] === '#' && show(sim)[2][6] === '.', show(sim).slice(2, 5).join(' ')];
  }],
  ['受け皿の3つを全部置くと次の3つが出る（3つ置くまでは出ない。残りが3つより少なければ残り全部）', () => {
    const sim = make(['*'], ['#', '#', '#', '##', '###']);
    sim.place(0, 4, 0);
    sim.place(1, 4, 2);
    const mid = sim.tray.join();
    sim.place(2, 4, 4);
    return [mid === '-1,-1,2' && sim.tray.join() === '3,4,-1' && sim.next === 5 && ev(sim, 'deal').length === 1, mid + ' → ' + sim.tray.join()];
  }],
  ['宝石を全部取ればクリア（ブロックが残っていても）', () => {
    const sim = make(['', '', '', '', '', '', '', '*######.'], ['#', '##', '###', '#']);
    sim.place(0, 7, 7);
    return [result(sim) === 'clear' && sim.piecesLeft() === 3, result(sim) + ' 残り ' + sim.piecesLeft()];
  }],
  ['受け皿のどのブロックも置ける所が無ければ失敗（nospace）', () => {
    // どの行・列にも、離れた空きが2つずつある盤（2×2 のすき間が無い）。1マスを埋めても行も列もそろわず、2×2 のブロックは置けない
    const rows = [];
    for (let r = 0; r < N; r++) {
      let l = '';
      for (let c = 0; c < N; c++) l += c === r || c === (r + 4) % N ? '.' : '#';
      rows.push(l);
    }
    rows[0] = '.*' + rows[0].slice(2);
    const sim = make(rows, ['#', '##/##']);
    sim.place(0, 0, 0);
    return [result(sim) === 'fail:nospace' && sim.moves === 1, result(sim) + ' ' + show(sim)[0]];
  }],
  ['ブロックを全部置いても宝石が残れば失敗（nopiece）', () => {
    const sim = make(['*'], ['#', '#']);
    sim.place(0, 5, 5);
    const mid = result(sim);
    sim.place(1, 6, 6);
    return [mid === 'play' && result(sim) === 'fail:nopiece', mid + ' → ' + result(sim)];
  }],
  ['氷のブロックは1回目で割れてふつうのブロックになり（宝石は残る）、2回目で空きになって宝石が取れる', () => {
    const sim = make(['', '', '', '', '', '', '', '###@###.'], ['#', '###', '####']);
    sim.place(0, 7, 7);
    const first = show(sim)[7] + ' ' + result(sim) + ' 割れた ' + (ev(sim, 'lines')[0] || { cracked: [] }).cracked.length;
    sim.place(1, 7, 0);
    sim.place(2, 7, 4);
    return [first === '...*.... play 割れた 1' && show(sim)[7] === '........' && result(sim) === 'clear', first + ' → ' + show(sim)[7] + ' ' + result(sim)];
  }],
  ['行と列が氷のブロックで交わって同時に消えると、氷のブロックも一度に空きになる', () => {
    // (7,3) が氷の宝石。(6,3)・(6,4)・(7,4) に置くと、7行目と3列目が同時にそろう
    const sim = make(['...#', '...#', '...#', '...#', '...#', '...#', '', '###@.###'], ['##/.#', '#', '#']);
    sim.place(0, 6, 3);
    const e = ev(sim, 'lines')[0];
    return [e && e.rows.join() === '7' && e.cols.join() === '3' && e.cracked.length === 0 && result(sim) === 'clear', e ? '行 ' + e.rows + ' 列 ' + e.cols + ' 割れた ' + e.cracked.length + ' ' + result(sim) : '-'];
  }],
  ['氷のブロックが1本の行で消えるだけなら、割れるだけで宝石は残る（ほかのマスは消える）', () => {
    const sim = make(['', '', '', '', '', '', '*', '@######.'], ['#', '#', '#']);
    sim.place(0, 7, 7);
    return [show(sim)[7] === '*.......' && sim.gemsLeft() === 2 && result(sim) === 'play', show(sim)[7] + ' 宝石 ' + sim.gemsLeft()];
  }],
  ['終わったあと（クリア・失敗）は置けない', () => {
    const a = make(['', '', '', '', '', '', '', '*######.'], ['#', '#', '#']);
    a.place(0, 7, 7);
    const afterClear = a.place(1, 0, 0);
    const b = make(['*'], ['#']);
    b.place(0, 5, 5);
    const afterFail = b.place(0, 6, 6);
    return [!afterClear && result(a) === 'clear' && a.moves === 1 && !afterFail && result(b) === 'fail:nopiece', result(a) + ' ' + afterClear + ' / ' + result(b) + ' ' + afterFail];
  }],
  ['指の位置から置くマスを決める計算: ねらったマスの真ん中から上下左右に 0.45 マスずれても同じマスになる', () => {
    const L = SIM.LAYOUT;
    const bad2 = [];
    for (const shape of ['#', '###', '#/#/#', '###/###/###', '#####']) {
      const p = SIM.parseShape(shape);
      for (const [r, c] of [[0, 0], [3, 4], [8 - p.h, 8 - p.w]]) {
        const fx = L.left + c * L.C + (p.w * L.C) / 2;
        const fy = L.top + r * L.C + p.h * L.C + L.lift;
        for (const dx of [-0.45, 0, 0.45]) for (const dy of [-0.45, 0, 0.45]) {
          const [rr, cc] = SIM.dropCell(p, fx + dx * L.C, fy + dy * L.C);
          if (rr !== r || cc !== c) bad2.push(shape + ' ' + r + ',' + c + ' → ' + rr + ',' + cc);
        }
      }
    }
    return [!bad2.length, bad2.length ? bad2.slice(0, 3).join(' / ') : '15通り × 9 か所で一致'];
  }],
  ['盤と受け皿が画面（540×960）に収まり、受け皿の置き場どうしが重ならない', () => {
    const L = SIM.LAYOUT;
    const right = L.left + N * L.C;
    const bottom = L.top + N * L.C;
    const slots = L.trayX.map((x) => [x - L.trayHalfW, x + L.trayHalfW]);
    const apart = slots.every((s, i) => i === 0 || s[0] >= slots[i - 1][1]);
    const big = SHAPE_MAX * L.trayCell <= L.trayHalfW * 2;
    const ok = L.left >= 0 && right <= KG.W && bottom < L.trayY - L.trayHalfH && L.trayY + L.trayHalfH <= KG.H && apart && big && slots[0][0] >= 0 && slots[2][1] <= KG.W;
    return [ok, '盤 ' + L.left + '〜' + right + ' × ' + L.top + '〜' + bottom + ' / 受け皿 ' + (L.trayY - L.trayHalfH) + '〜' + (L.trayY + L.trayHalfH) + ' 置き場 ' + JSON.stringify(slots)];
  }],
  ['受け皿の置き場をつかむ範囲: 置き場の真ん中はその置き場、置き場の外は -1', () => {
    const L = SIM.LAYOUT;
    const got = [SIM.slotAt(L.trayX[0], L.trayY), SIM.slotAt(L.trayX[1] + 80, L.trayY - 80), SIM.slotAt(L.trayX[2], L.trayY + 90), SIM.slotAt(L.trayX[1], L.top + 100), SIM.slotAt(L.trayX[1], L.trayY + L.trayHalfH + 5)];
    return [got.join() === '0,1,2,-1,-1', got.join()];
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
