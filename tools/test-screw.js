// ネジ外しの各レベルが解けることと、ネジ・板・穴の決まりを確かめる。
// - レベルの形: 穴が盤の中にあり重ならない・ネジは穴に差さる・板は横か縦で両はしが穴・最初はどの板も両はしを留めている・
//   板のはしが下の板の中ほどに乗っていない・同じ線の上で重なる板が無い・赤いネジは6面から・点の間の大きさ・ヒントの字数・最初に外せるネジがある
// - 全部の手を調べて最短手数を出し（解けなければ NG）、その手順を本物の決まり（screw-sim.js の lift・place）でなぞってクリアになるか。
//   いちばん短い負け方も、本物の決まりで同じ理由になるか。届く形のどれでも、板が盤からはみ出さないか、外せるネジが1本はあるか
//   （いちばん上の板を留めるネジは外せるので、外せるネジが無い形は起こらない。sim はこれを失敗の理由に入れていない）
// - でたらめに遊んで勝てる確率（参考）と、「差す穴が無くなる外し方を避け、板を留めているネジから選ぶ」気をつける人が勝てる確率。
//   1〜3面は負ける手が無い（でたらめでも必ず勝てる）、4面から先は負ける手がある
// - 素直なやり方（板が落ちる外し方 → 板を留めているネジ → ほかのネジ の順に、差す穴が無くならないものを上の行・左の列から選び、
//   差す穴も上の行・左の列から選ぶ）。7面から先は勝てたら NG
// - でたらめな手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形になるか（解く道具は sim とは別に書いた決まり）
// - 期待の表 CASES（レベルごとに決めた手順と、クリア／失敗の理由）を本物の決まりで流す
// - 決まり RULES（外すと板が落ちる・ぶら下がる・外した穴へは戻せない・板の下の穴やネジ・色・負け方 など）
// 使い方: node tools/test-screw.js            （このフォルダの app/ を調べる）
//         node tools/test-screw.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-screw.js --cases    （各レベルの最短の勝ち方と、いちばん短い負け方を CASES の形で出す）
// 手順の書き方: 穴の名前（上の行・左の列から a, b, c …）を「外す穴・差す穴」の2文字で1手とし、空白でつなぐ。差さずに終わる手は1文字。
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const PRINT_CASES = args.includes('--cases');
const appDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'screw-levels.js'));
require(path.join(appDir, 'js', 'games', 'screw-sim.js'));
const KG = globalThis.KG;
const SIM = KG.screwSim;
const LEVELS = KG.screwLevels;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（screw-levels.js の冒頭の注記）
// screw.js の並べ方: 点の間 = min(CELL_MAX, 置ける幅 ÷ 列, 置ける高さ ÷ 行)。指で押しやすいよう CELL_MIN 以上にする
const AREA_W = 492;
const AREA_H = 770;
const CELL_MAX = 84;
const CELL_MIN = 70;
const NO_LOSE_UPTO = 3; // この面までは負ける手が無いこと
const NAIVE_FROM = 7; // この面から先は、素直なやり方では勝てないこと
const RED_FROM = 6; // 赤いネジはこの面から
const SEARCH_LIMIT = 200000; // 調べる形の数の上限
const PLAYOUTS = 200; // 突き合わせるでたらめな手順の数（レベルごと）

// ---- 解くための道具（sim とは別に書いた決まり。形 = { occ: 差さっている穴の印（ビット）, P: 板ごとの [x0, y0, x1, y1, p0, p1, fallen] }） ----
function prep(level) {
  const holes = level.holes.map(([x, y, c]) => ({ x, y, c: c || '' }));
  const idx = new Map(holes.map((h, i) => [h.x + ',' + h.y, i]));
  let occ = 0;
  for (const [x, y] of level.screws) occ |= 1 << idx.get(x + ',' + y);
  const has = (x, y) => idx.has(x + ',' + y) && !!(occ & (1 << idx.get(x + ',' + y)));
  const P = level.planks.map(([x0, y0, x1, y1]) => [x0, y0, x1, y1, has(x0, y0) ? 1 : 0, has(x1, y1) ? 1 : 0, 0]);
  const g = { level, holes, idx, n: holes.length };
  const s = { occ, P };
  settle(s);
  return { g, s };
}
const plen = (p) => Math.abs(p[2] - p[0]) + Math.abs(p[3] - p[1]);
function inside(p, x, y) {
  if (p[6]) return false;
  if (p[1] === p[3]) return y === p[1] && x > Math.min(p[0], p[2]) && x < Math.max(p[0], p[2]);
  return x === p[0] && y > Math.min(p[1], p[3]) && y < Math.max(p[1], p[3]);
}
function endAt(p, x, y) {
  if (p[0] === x && p[1] === y) return 0;
  if (p[2] === x && p[3] === y) return 1;
  return -1;
}
// 落ちる・ぶら下がる。落ちた板の数を返す
function settle(s) {
  let fell = 0;
  for (const p of s.P) {
    if (p[6]) continue;
    const n = p[4] + p[5];
    if (n === 0) {
      p[6] = 1;
      fell++;
    } else if (n === 1) {
      const L = plen(p);
      const [x, y] = p[4] ? [p[0], p[1]] : [p[2], p[3]];
      p.splice(0, 6, x, y, x, y + L, 1, 0);
    }
  }
  return fell;
}
const cloneS = (s) => ({ occ: s.occ, P: s.P.map((p) => p.slice()) });
const keyOf = (s) => s.occ + '|' + s.P.map((p) => (p[6] ? 'F' : p.join(','))).join(';');
const won = (s) => s.P.every((p) => p[6]);
function zOf(g, s, hi) {
  const h = g.holes[hi];
  let z = -1;
  s.P.forEach((p, i) => {
    const e = p[6] ? -1 : endAt(p, h.x, h.y);
    if (e >= 0 && p[4 + e]) z = i;
  });
  return z;
}
function coveredAbove(s, x, y, above) {
  for (let i = above + 1; i < s.P.length; i++) if (inside(s.P[i], x, y)) return true;
  return false;
}
const liftable = (g, s, hi) => !!(s.occ & (1 << hi)) && !coveredAbove(s, g.holes[hi].x, g.holes[hi].y, zOf(g, s, hi));
function pinsOf(g, s, hi) {
  const h = g.holes[hi];
  return s.P.filter((p) => !p[6] && endAt(p, h.x, h.y) >= 0 && p[4 + endAt(p, h.x, h.y)]).length;
}
// 穴 hi のネジを外した形と、差せる穴（外した穴のほか）
function doLift(g, s, hi) {
  const t = cloneS(s);
  const h = g.holes[hi];
  t.occ &= ~(1 << hi);
  for (const p of t.P) {
    const e = p[6] ? -1 : endAt(p, h.x, h.y);
    if (e >= 0) p[4 + e] = 0;
  }
  const fell = settle(t);
  if (won(t)) return { s: t, fell, win: true, places: [] };
  const places = [];
  for (let i = 0; i < g.n; i++) {
    const q = g.holes[i];
    if (i === hi || t.occ & (1 << i) || q.c !== h.c || coveredAbove(t, q.x, q.y, -1)) continue;
    places.push(i);
  }
  return { s: t, fell, win: false, places };
}
function doPlace(g, t, qi) {
  const u = cloneS(t);
  const q = g.holes[qi];
  u.occ |= 1 << qi;
  for (const p of u.P) {
    const e = p[6] ? -1 : endAt(p, q.x, q.y);
    if (e >= 0) p[4 + e] = 1;
  }
  return u;
}
// 届く形を全部調べる。nodes: key → { lifts: [{ hi, fell, pins, win, nohole, to: [{ qi, k }] }], stuck }。out は盤からはみ出す形があったか
function explore(level) {
  const { g, s } = prep(level);
  const nodes = new Map();
  const states = new Map();
  const k0 = keyOf(s);
  nodes.set(k0, null);
  states.set(k0, s);
  const queue = [k0];
  let out = false;
  for (let qn = 0; qn < queue.length; qn++) {
    const k = queue[qn];
    const st = states.get(k);
    states.delete(k);
    for (const p of st.P) {
      if (p[6]) continue;
      for (const [x, y] of [[p[0], p[1]], [p[2], p[3]]]) if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) out = true;
    }
    const lifts = [];
    for (let hi = 0; hi < g.n; hi++) {
      if (!liftable(g, st, hi)) continue;
      const r = doLift(g, st, hi);
      const L = { hi, fell: r.fell, pins: pinsOf(g, st, hi), win: r.win, nohole: !r.win && !r.places.length, to: [] };
      for (const qi of r.places) {
        const u = doPlace(g, r.s, qi);
        const ku = keyOf(u);
        if (!nodes.has(ku)) {
          if (nodes.size >= SEARCH_LIMIT) return { g, nodes, start: k0, overflow: true, out };
          nodes.set(ku, null);
          states.set(ku, u);
          queue.push(ku);
        }
        L.to.push({ qi, k: ku });
      }
      lifts.push(L);
    }
    nodes.set(k, { lifts, stuck: !lifts.length });
  }
  return { g, nodes, start: k0, overflow: false, out };
}
// 最短の勝ち方と、いちばん短い負け方（どちらも [{ hi, qi }]。差さずに終わる手は qi = -1）
function shortest(ex) {
  const { nodes, start } = ex;
  const dist = new Map([[start, 0]]);
  const back = new Map();
  const queue = [start];
  let win = null;
  let lose = null;
  for (let qn = 0; qn < queue.length; qn++) {
    const k = queue[qn];
    const node = nodes.get(k);
    const d = dist.get(k);
    if (node.stuck && !lose) lose = { k, end: null, reason: 'stuck', d };
    for (const L of node.lifts) {
      if (L.win && !win) win = { k, end: { hi: L.hi, qi: -1 }, d: d + 1 };
      if (L.nohole && !lose) lose = { k, end: { hi: L.hi, qi: -1 }, reason: 'nohole', d: d + 1 };
      for (const t of L.to) {
        if (dist.has(t.k)) continue;
        dist.set(t.k, d + 1);
        back.set(t.k, { k, hi: L.hi, qi: t.qi });
        queue.push(t.k);
      }
    }
  }
  const pathOf = (r) => {
    if (!r) return null;
    const seq = r.end ? [r.end] : [];
    let k = r.k;
    while (back.has(k)) {
      const b = back.get(k);
      seq.unshift({ hi: b.hi, qi: b.qi });
      k = b.k;
    }
    return seq;
  };
  return { win: pathOf(win), lose: pathOf(lose), loseReason: lose ? lose.reason : '' };
}
// 勝てる確率。'random': でたらめ／'careful': 差す穴が無くなる外し方を避け、板を留めているネジ（無ければほかのネジ）からでたらめに選ぶ
function winRate(ex, mode) {
  const { nodes, start } = ex;
  const keys = [...nodes.keys()];
  const id = new Map(keys.map((k, i) => [k, i]));
  // 形ごとの選べる外し方を配列に並べる（形が2万を超える面で、Map を引きながら数えると遅いため）。
  // kind: 1 勝ち／0 差す穴が無い／2 差す穴のどれかへ進む（行き先は to の toFirst[c] から toFirst[c + 1] の手前まで）
  const first = new Int32Array(keys.length + 1);
  const kinds = [];
  const toFirst = [0];
  const tos = [];
  keys.forEach((k, i) => {
    first[i] = kinds.length;
    let ls = nodes.get(k).lifts;
    if (mode === 'careful') {
      const safe = ls.filter((L) => !L.nohole);
      const pinning = safe.filter((L) => L.pins > 0 || L.win);
      ls = pinning.length ? pinning : safe.length ? safe : ls;
    }
    for (const L of ls) {
      kinds.push(L.win ? 1 : L.nohole ? 0 : 2);
      if (!L.win && !L.nohole) for (const t of L.to) tos.push(id.get(t.k));
      toFirst.push(tos.length);
    }
  });
  first[keys.length] = kinds.length;
  const kind = Int8Array.from(kinds);
  const tf = Int32Array.from(toFirst);
  const to = Int32Array.from(tos);
  const val = new Float64Array(keys.length);
  for (let it = 0; it < 5000; it++) {
    let delta = 0;
    // 後ろの形（勝ち負けに近い形）から順に直すと、早く収まる
    for (let i = keys.length - 1; i >= 0; i--) {
      const a = first[i];
      const b = first[i + 1];
      if (a === b) continue;
      let v = 0;
      for (let c = a; c < b; c++) {
        if (kind[c] === 1) v += 1;
        else if (kind[c] === 2) {
          let w = 0;
          for (let j = tf[c]; j < tf[c + 1]; j++) w += val[to[j]];
          v += w / (tf[c + 1] - tf[c]);
        }
      }
      v /= b - a;
      delta = Math.max(delta, Math.abs(v - val[i]));
      val[i] = v;
    }
    if (delta < 1e-12) break;
  }
  return val[id.get(start)];
}
// 素直なやり方（冒頭の注記）。同じ形に戻ったら負け（くり返し）
function naive(ex) {
  const { g, nodes, start } = ex;
  const order = (a, b) => g.holes[a].y - g.holes[b].y || g.holes[a].x - g.holes[b].x;
  let k = start;
  const seen = new Set();
  const seq = [];
  for (;;) {
    if (seen.has(k)) return { result: 'loop', seq };
    seen.add(k);
    const node = nodes.get(k);
    if (node.stuck) return { result: 'stuck', seq };
    const safe = node.lifts.filter((L) => !L.nohole).sort((a, b) => order(a.hi, b.hi));
    const pick = safe.find((L) => L.win || L.fell > 0) || safe.find((L) => L.pins > 0) || safe[0];
    if (!pick) return { result: 'nohole', seq };
    if (pick.win) {
      seq.push({ hi: pick.hi, qi: -1 });
      return { result: 'clear', seq };
    }
    const t = pick.to.slice().sort((a, b) => order(a.qi, b.qi))[0];
    seq.push({ hi: pick.hi, qi: t.qi });
    k = t.k;
  }
}
// 穴の名前（上の行・左の列から a, b, c …）
function names(level) {
  const order = level.holes.map((h, i) => i).sort((a, b) => level.holes[a][1] - level.holes[b][1] || level.holes[a][0] - level.holes[b][0]);
  const name = [];
  order.forEach((hi, r) => (name[hi] = String.fromCharCode(97 + r)));
  return name;
}
const word = (level, seq) => (seq ? seq.map((m) => names(level)[m.hi] + (m.qi >= 0 ? names(level)[m.qi] : '')).join(' ') : '-');

// ---- 本物の決まりで流す ----
function runSim(level, taps) {
  const n = names(level);
  const sim = SIM.createSim(level);
  for (const w of taps.split(' ').filter(Boolean)) {
    if (sim.state !== 'play') break;
    const hi = n.indexOf(w[0]);
    if (hi < 0 || sim.screwAt[hi] < 0 || !sim.lift(sim.screwAt[hi])) return { result: '外せない手 ' + w, moves: sim.moves, sim };
    if (w.length > 1 && sim.state === 'play' && !sim.place(n.indexOf(w[1]))) return { result: '差せない手 ' + w, moves: sim.moves, sim };
  }
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, moves: sim.moves, sim };
}
// sim の形を、解く道具の形の書き方に直す
function simKey(sim) {
  let occ = 0;
  sim.screwAt.forEach((s, i) => {
    if (s >= 0) occ |= 1 << i;
  });
  return occ + '|' + sim.planks.map((k) => (k.fallen ? 'F' : [k.x0, k.y0, k.x1, k.y1, k.pins[0] ? 1 : 0, k.pins[1] ? 1 : 0, 0].join(','))).join(';');
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

// ---- レベルの形 ----
function shapeProblems(level, no) {
  const why = [];
  const { cols, rows } = level;
  const S = Math.min(CELL_MAX, Math.floor(AREA_W / cols), Math.floor(AREA_H / rows));
  if (S < CELL_MIN) why.push('点の間 ' + S + '（' + CELL_MIN + ' 以上）');
  const seen = new Set();
  for (const [x, y, c] of level.holes) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) why.push('盤の外の穴 ' + x + ',' + y);
    if (seen.has(x + ',' + y)) why.push('重なった穴 ' + x + ',' + y);
    seen.add(x + ',' + y);
    if (c !== undefined && c !== 'r') why.push('知らない色 ' + c);
    if (c === 'r' && no < RED_FROM) why.push(RED_FROM + '面より前に赤い穴');
  }
  if (no >= RED_FROM && !level.holes.some((h) => h[2] === 'r')) why.push('赤い穴が無い');
  if (level.holes.length > 31) why.push('穴が多すぎる（31 まで）');
  const screwSet = new Set();
  for (const [x, y] of level.screws) {
    if (!seen.has(x + ',' + y)) why.push('穴に差さっていないネジ ' + x + ',' + y);
    if (screwSet.has(x + ',' + y)) why.push('同じ穴に2本 ' + x + ',' + y);
    screwSet.add(x + ',' + y);
  }
  if (level.screws.length >= level.holes.length) why.push('空いた穴が無い');
  level.planks.forEach((p, i) => {
    const [x0, y0, x1, y1] = p;
    if ((x0 !== x1 && y0 !== y1) || (x0 === x1 && y0 === y1)) why.push(i + ' 番の板が横か縦でない');
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      if (!screwSet.has(x + ',' + y)) why.push(i + ' 番の板のはし ' + x + ',' + y + ' にネジが無い');
      // はしのネジが、下の板の中ほどを突き抜けていないか
      for (let j = 0; j < i; j++) if (inside([...level.planks[j], 0, 0, 0], x, y)) why.push(i + ' 番の板のはしが ' + j + ' 番の板の中ほどに乗っている');
    }
    // 同じ線の上で重なる板は置かない（短い板が長い板の真下に隠れて、何枚あるか見分けられないため。はしで接するだけならよい）
    for (let j = 0; j < i; j++) {
      const q = level.planks[j];
      const row = y0 === y1 && q[1] === q[3] && y0 === q[1];
      const col = x0 === x1 && q[0] === q[2] && x0 === q[0];
      if (!row && !col) continue;
      const a = row ? [x0, x1] : [y0, y1];
      const b = row ? [q[0], q[2]] : [q[1], q[3]];
      if (Math.min(Math.max(...a), Math.max(...b)) > Math.max(Math.min(...a), Math.min(...b))) why.push(i + ' 番の板が ' + j + ' 番の板と同じ線の上で重なる');
    }
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
  if (!start.screws.some((s) => start.canLift(s.i))) ng(name + ' 最初に外せるネジが無い');
  const ex = explore(level);
  if (ex.overflow) {
    ng(name + ' 調べる形が ' + SEARCH_LIMIT + ' を超えた');
    return;
  }
  if (ex.out) ng(name + ' 板が盤からはみ出す形がある');
  const sh = shortest(ex);
  if (!sh.win) {
    ng(name + ' 解けない');
    return;
  }
  const careful = winRate(ex, 'careful');
  const random = winRate(ex, 'random');
  const nv = naive(ex);
  const hasLose = [...ex.nodes.values()].some((n) => n.lifts.some((L) => L.nohole));
  const stuck = [...ex.nodes.values()].filter((n) => n.stuck).length;
  const winWord = word(level, sh.win);
  const r = runSim(level, winWord);
  const reds = level.holes.filter((h) => h[2] === 'r').length;
  const line = name + '  ' + level.cols + '×' + level.rows + ' 板 ' + level.planks.length + ' ネジ ' + level.screws.length + ' 穴 ' + level.holes.length +
    (reds ? '（赤 ' + reds + '）' : '') + '  最短 ' + sh.win.length + ' 手 ' + winWord + '（調べた形 ' + ex.nodes.size + '）→ ' + r.result + '（' + r.moves + ' 手）' +
    '  でたらめ ' + (random * 100).toFixed(1) + '%  気をつける人 ' + (careful * 100).toFixed(1) + '%  素直なやり方 ' + (nv.result === 'clear' ? '勝ち' : '負け（' + nv.result + '）') + ' ' + word(level, nv.seq);
  const why2 = [];
  if (r.result !== 'clear' || r.moves !== sh.win.length) why2.push('最短の手順が本物の決まりでクリアにならない');
  if (stuck) why2.push('外せるネジが無い形が ' + stuck + ' 個ある');
  if (no <= NO_LOSE_UPTO && (hasLose || random < 0.999)) why2.push(NO_LOSE_UPTO + '面までなのに負ける手がある');
  if (no > NO_LOSE_UPTO && !hasLose) why2.push('負ける手が無い');
  if (no >= NAIVE_FROM && nv.result === 'clear') why2.push('素直なやり方で勝てる');
  if (why2.length) ng(line + '  ' + why2.join(' / '));
  else console.log('OK  ' + line);
  if (sh.lose) {
    const lw = word(level, sh.lose);
    const lr = runSim(level, lw);
    const want = 'fail:' + sh.loseReason;
    const ll = name + '  いちばん短い負け方 ' + lw + ' → ' + lr.result;
    if (lr.result === want) console.log('OK  ' + ll);
    else ng(ll + '（期待 ' + want + '）');
    casesOut.push("  [" + no + ", '" + lw + "', '" + want + "', " + sh.lose.length + '],');
  }
  casesOut.push("  [" + no + ", '" + winWord + "', 'clear', " + sh.win.length + '],');
  // でたらめな手順を本物の決まりと解く道具の両方で流し、1手ごとに同じ形になるか
  let seed = no * 7919;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let diff = '';
  for (let pl = 0; pl < PLAYOUTS && !diff; pl++) {
    const sim = SIM.createSim(level);
    let k = ex.start;
    for (let mv = 0; mv < 40 && sim.state === 'play' && !diff; mv++) {
      const node = ex.nodes.get(k);
      if (simKey(sim) !== k) diff = '形がちがう（' + mv + ' 手目の前）sim ' + simKey(sim) + ' / 道具 ' + k;
      else if (sim.screws.filter((s) => sim.canLift(s.i)).map((s) => s.hole).sort((a, b) => a - b).join() !== node.lifts.map((L) => L.hi).join())
        diff = '外せるネジがちがう（' + mv + ' 手目の前）';
      if (diff || node.stuck) break;
      const L = node.lifts[Math.floor(rnd() * node.lifts.length)];
      sim.lift(sim.screwAt[L.hi]);
      if (L.win) {
        if (sim.state !== 'clear') diff = '最後の板を落としてもクリアにならない';
        break;
      }
      if (L.nohole) {
        if (sim.state !== 'fail' || sim.reason !== 'nohole') diff = '差す穴が無いのに失敗にならない';
        break;
      }
      const ok = L.to.filter((t) => sim.canPlace(t.qi)).length === L.to.length && sim.holes.filter((h, i) => sim.canPlace(i)).length === L.to.length;
      if (!ok) {
        diff = '差せる穴の数がちがう';
        break;
      }
      const t = L.to[Math.floor(rnd() * L.to.length)];
      sim.place(t.qi);
      k = t.k;
    }
  }
  if (diff) ng(name + ' 本物の決まりと解く道具の突き合わせ: ' + diff);
  else console.log('OK  ' + name + '  でたらめな手順 ' + PLAYOUTS + ' 本で、本物の決まりと解く道具の形が1手ごとに一致');
});

if (PRINT_CASES) {
  console.log('const CASES = [');
  for (const l of casesOut) console.log(l);
  console.log('];');
}

// ---- 期待の表（レベルごとに決めた手順と結果。2026-11-04 に全部の手を調べて出した。勝ち方は最短、負け方はいちばん短いもの） ----
// [面, 手順, 期待の結果, 手数]
const CASES = [
  [1, 'ba c', 'clear', 2],
  [2, 'ad ba eb f', 'clear', 4],
  [3, 'bh ab ca dc ed f', 'clear', 6],
  [4, 'f', 'fail:nohole', 1],
  [4, 'bc fb gf ag da e', 'clear', 6],
  [5, 'h', 'fail:nohole', 1],
  [5, 'fe hf ah da gd bg c', 'clear', 7],
  [6, 'h', 'fail:nohole', 1],
  [6, 'fc he ih jf ki ak da gd b', 'clear', 9],
  [7, 'd', 'fail:nohole', 1],
  [7, 'fm ij gi lg kl ck bf dc ed ab h', 'clear', 11],
  [8, 'i', 'fail:nohole', 1],
  [8, 'de ad ba ib ci mc fn kf jm lj ol go h', 'clear', 13],
  [9, 'j', 'fail:nohole', 1],
  [9, 'ab ja kj ek ge ch ig di fd lc m', 'clear', 11],
  [10, 'b', 'fail:nohole', 1],
  [10, 'lm hl gh af bg cb ic ki ja nk oj dn e', 'clear', 13],
];
for (const [no, taps, want, n] of CASES) {
  const level = LEVELS[no - 1];
  if (!level) {
    ng('表 ' + no + '面が無い');
    continue;
  }
  const r = runSim(level, taps);
  const line = '表 ' + no + '面 ' + taps.padEnd(30) + ' 期待 ' + (want + '（' + n + ' 手）').padEnd(18) + ' 結果 ' + r.result + '（' + r.moves + ' 手）';
  if (r.result === want && r.moves === n) console.log('OK  ' + line);
  else ng(line);
}

// ---- 決まり ----
// 小さな盤を作る。holes は [x, y, 色]、screws は穴の位置
const make = (cols, rows, holes, planks, screws) => SIM.createSim({ cols, rows, holes, planks, screws });
const poses = (sim) => sim.planks.map((k) => (k.fallen ? '落' : k.x0 + ',' + k.y0 + '-' + k.x1 + ',' + k.y1)).join(' ');
const result = (sim) => (sim.state === 'fail' ? 'fail:' + sim.reason : sim.state);
const at = (sim, x, y) => sim.screwAt[sim.holeAt(x, y)];
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['ネジを外すと手に持ち、ネジが1本になった横の板はそのネジから真下へぶら下がる', () => {
    const sim = make(4, 4, [[0, 0], [2, 0], [3, 3]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    const ok = sim.lift(at(sim, 2, 0));
    return [ok && sim.held >= 0 && poses(sim) === '0,0-0,2' && sim.events.some((e) => e.type === 'swing'), poses(sim) + ' 持っている ' + sim.held];
  }],
  ['留めるネジが無くなった板は落ちる。全部落ちたらクリア（手数は外した回数）', () => {
    const sim = make(4, 4, [[0, 0], [2, 0], [3, 3]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 2, 0));
    sim.place(sim.holeAt(3, 3));
    const mid = result(sim);
    sim.lift(at(sim, 0, 0));
    return [mid === 'play' && poses(sim) === '落' && result(sim) === 'clear' && sim.moves === 2 && sim.held === -1, mid + ' → ' + result(sim) + ' ' + poses(sim) + ' 手数 ' + sim.moves];
  }],
  ['真上へ向いた縦の板は、下のはしのネジだけになると、くるりと回って真下へぶら下がる', () => {
    const sim = make(3, 6, [[1, 1], [1, 3], [2, 0]], [[1, 1, 1, 3]], [[1, 1], [1, 3]]);
    sim.lift(at(sim, 1, 1));
    return [poses(sim) === '1,3-1,5', poses(sim)];
  }],
  ['もともと真下にぶら下がる形の板は、動かない（回った知らせも出さない）', () => {
    const sim = make(3, 6, [[1, 1], [1, 3], [2, 0]], [[1, 1, 1, 3]], [[1, 1], [1, 3]]);
    sim.lift(at(sim, 1, 3));
    return [poses(sim) === '1,1-1,3' && !sim.events.some((e) => e.type === 'swing'), poses(sim)];
  }],
  ['外した穴へは戻せない（ほかの空いた穴へは差せる）', () => {
    const sim = make(4, 4, [[0, 0], [2, 0], [3, 3]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 2, 0));
    const back = sim.place(sim.holeAt(2, 0));
    const other = sim.place(sim.holeAt(3, 3));
    return [!back && other && sim.events.some((e) => e.type === 'deny'), '戻す ' + back + ' ほか ' + other];
  }],
  ['差したネジは、そこにはしがある板を留める（ぶら下がった板の下のはしに差すと両はしで留まり、上を外すと下のはしから真下へぶら下がり直す）', () => {
    const sim = make(4, 5, [[0, 0], [2, 0], [0, 2], [3, 4]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 2, 0)); // 板は (0,0) から (0,2) へぶら下がる
    sim.place(sim.holeAt(0, 2)); // 下のはしを留める
    const both = sim.planks[0].pins.join();
    sim.lift(at(sim, 0, 0)); // 上を外しても落ちず、(0,2) から真下へ回る
    return [both === 'true,true' && poses(sim) === '0,2-0,4' && result(sim) === 'play', '留まり ' + both + ' → ' + poses(sim) + ' ' + result(sim)];
  }],
  ['上の板の中ほどがかぶさったネジは外せない（上の板が落ちれば外せる）', () => {
    // 0 番の板（縦）の上のはし (1,1) に、1 番の板（横、上）の中ほどがかぶさる
    const sim = make(4, 5, [[1, 1], [1, 3], [0, 1], [2, 1], [3, 4]], [[1, 1, 1, 3], [0, 1, 2, 1]], [[1, 1], [1, 3], [0, 1], [2, 1]]);
    const blocked = sim.lift(at(sim, 1, 1));
    const deny = sim.events.find((e) => e.type === 'deny');
    sim.lift(at(sim, 0, 1)); // 上の板がぶら下がり、(1,1) から外れる
    sim.place(sim.holeAt(3, 4));
    const free = sim.canLift(at(sim, 1, 1));
    return [!blocked && deny && deny.by === 1 && free, '外せた ' + blocked + ' かぶさった板 ' + (deny ? deny.by : '-') + ' → 外せる ' + free];
  }],
  ['ぶら下がった板の中ほどがネジにかぶさっても、そのネジがもっと上の板を留めていれば外せる（下の板なら外せない）', () => {
    // a: 0 番の板（横、下）が (2,0) からぶら下がり、中ほど (2,1) が 1 番の板（上）を留めるネジにかぶさる → 外せる
    const holes = [[0, 0], [2, 0], [2, 1], [3, 1], [3, 3]];
    const a = make(4, 4, holes, [[0, 0, 2, 0], [2, 1, 3, 1]], [[0, 0], [2, 0], [2, 1], [3, 1]]);
    a.lift(at(a, 0, 0));
    a.place(a.holeAt(3, 3));
    // b: 板の重なりを逆にする（ぶら下がる板が上）→ 外せない
    const b = make(4, 4, holes, [[2, 1, 3, 1], [0, 0, 2, 0]], [[0, 0], [2, 0], [2, 1], [3, 1]]);
    b.lift(at(b, 0, 0));
    b.place(b.holeAt(3, 3));
    const ca = a.canLift(at(a, 2, 1));
    const cb = b.canLift(at(b, 2, 1));
    return [poses(a).startsWith('2,0-2,2') && ca && !cb, poses(a) + ' 下の板がかぶさる ' + ca + ' / 上の板がかぶさる ' + cb];
  }],
  ['板の中ほどがかぶさった穴には差せない（板が動いてあけば差せる）', () => {
    // 0 番の板（横）の中ほどが空いた穴 (1,1) にかぶさる。1 番の板（縦）のネジを外して持つ
    const sim = make(4, 4, [[0, 1], [2, 1], [1, 1], [3, 0], [3, 1], [3, 3]], [[0, 1, 2, 1], [3, 0, 3, 1]], [[0, 1], [2, 1], [3, 0], [3, 1]]);
    sim.lift(at(sim, 3, 1));
    const covered = sim.canPlace(sim.holeAt(1, 1));
    sim.place(sim.holeAt(3, 3));
    sim.lift(at(sim, 0, 1)); // 0 番の板は (2,1) から真下へ。(1,1) があく
    const open = sim.canPlace(sim.holeAt(1, 1));
    return [!covered && open, 'かぶさっている ' + covered + ' → あいたあと ' + open];
  }],
  ['ネジ1本で、そこにはしがある板をまとめて留める（外すと両方が動く）', () => {
    const sim = make(5, 6, [[0, 0], [2, 0], [4, 0], [4, 5]], [[0, 0, 2, 0], [2, 0, 4, 0]], [[0, 0], [2, 0], [4, 0]]);
    sim.lift(at(sim, 2, 0));
    return [poses(sim) === '0,0-0,2 4,0-4,2', poses(sim)];
  }],
  ['赤いネジは赤い穴にだけ、色の無いネジは色の無い穴にだけ差せる', () => {
    const sim = make(4, 4, [[0, 0, 'r'], [2, 0], [3, 3], [1, 3, 'r']], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 0, 0));
    const red = [sim.canPlace(sim.holeAt(3, 3)), sim.canPlace(sim.holeAt(1, 3))];
    sim.place(sim.holeAt(1, 3));
    const s2 = make(4, 4, [[0, 0, 'r'], [2, 0], [3, 3], [1, 3, 'r']], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    s2.lift(at(s2, 2, 0));
    const plain = [s2.canPlace(s2.holeAt(3, 3)), s2.canPlace(s2.holeAt(1, 3))];
    return [!red[0] && red[1] && plain[0] && !plain[1], '赤いネジ（色なし・赤）' + red + ' / 色なしのネジ ' + plain];
  }],
  ['持ったネジを差せる穴が無ければ失敗（nohole）', () => {
    // 空いた穴 (0,1) は、ぶら下がった板の中ほどでふさがる
    const sim = make(3, 4, [[0, 0], [2, 0], [0, 1]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 2, 0));
    return [result(sim) === 'fail:nohole' && sim.moves === 1, result(sim) + ' 手数 ' + sim.moves];
  }],
  ['終わったあと（失敗・クリア）は外せない', () => {
    const sim = make(3, 4, [[0, 0], [2, 0], [0, 1]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    sim.lift(at(sim, 2, 0));
    const again = sim.lift(at(sim, 0, 0));
    // クリアのあと: 最後の板を落としたネジは外した穴へ戻っていて、手に持っていない。それでも外せない
    const c = make(4, 4, [[0, 0], [2, 0], [3, 3]], [[0, 0, 2, 0]], [[0, 0], [2, 0]]);
    c.lift(at(c, 2, 0));
    c.place(c.holeAt(3, 3));
    c.lift(at(c, 0, 0));
    const after = [result(c), c.held, c.canLift(at(c, 0, 0)), c.lift(at(c, 0, 0)), c.moves];
    return [!again && result(sim) === 'fail:nohole' && after.join() === 'clear,-1,false,false,2', '失敗のあと ' + again + ' / クリアのあと（結果・持っている・外せるか・外せたか・手数）' + after.join(',')];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + LEVELS.length + ' 面・表 ' + CASES.length + ' 件・決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
