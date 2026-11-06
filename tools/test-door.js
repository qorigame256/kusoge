// 人を同じ色の扉へ連れていくの各レベルが解けることと、道・歩く・ぶつかる の決まりを確かめる。
// - レベルの形: 盤の字数・使える文字・1色に人1人と扉1つ・人は2人以上・人から扉まで道がある・ロボットは6面から（6面から先は必ずいる）・
//   ロボットの通る所はまっすぐで床だけ・ロボットどうしが重ならない・ヒントの字数・盤が画面に収まりマスが小さすぎない
// - 解く道具（door-sim.js とは別に書いた決まり）で、いちばん少ない遠回り（全員の道の、近道より長い歩数の合計）の勝ち方を探し、
//   見つけた道を本物の決まり（door-sim.js）で指の操作どおりに描いて歩かせ、クリアになるか
// - 近道だけ（全員が近道を歩く）では解けないこと（NAIVE_FROM 面から）。遠回りが1人2歩だけでは解けないこと（TWO_FROM 面から）
// - 「気をつける人」（全員の近道から始め、ぶつかったら、ぶつかった人の1人の道を、そのぶつかり方をしない道に描き直す。
//   描き直す道は近道ほど選びやすい）がクリアするまでに歩かせる回数（参考。乱数の種は決めてある）。DOWN_FROM 面から先は、前の面より多いこと
// - でたらめな道の組を本物の決まりと解く道具の両方で歩かせ、結果（クリア・失敗の拍・ぶつかった人）が同じになるか
// - 期待の表 CASES（レベルごとに決めた道と結果）を本物の決まりで流す
// - 決まり RULES（道ののび方・縮み方・できあがり・描き始め・歩き出し・ぶつかる・すれ違う・後ろにつく・ロボット・画面のマス など）
// 使い方: node tools/test-door.js            （このフォルダの app/ を調べる）
//         node tools/test-door.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-door.js --cases    （解く道具が見つけた勝ち方と、近道で負ける道を CASES の形で出す）
// 道の書き方: 人ごとに「色の文字:向きの文字の並び」（向きは U 上・R 右・D 下・L 左。人のマスから1マスずつ）とし、空白でつなぐ。
// 例 'R:UURR B:LLU' は、赤の人が上・上・右・右、青の人が左・左・上へ進む道。
// 1つでも期待と違えば終了コード 1。ほかの台本から require すると、解く道具だけを渡す（検査は走らない）。
'use strict';
const path = require('path');

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const DIRS = 'URDL';
const COLORS = 'RBYGP';
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（door-levels.js の冒頭の注記）
const ROBOT_FROM = 6; // 見回りロボットはこの面から
const NAIVE_FROM = 3; // この面から先は、近道だけでは解けないこと
const TWO_FROM = 7; // この面から先は、遠回りが1人2歩だけでは解けないこと
const DOWN_FROM = 5; // この面から先は、気をつける人の歩かせる回数が前の面より多いこと
const CELL_MIN = 60; // 指で描きやすいマスの大きさの下限（論理座標）
const SOLVE_MAX = 12; // 勝ち方を探す遠回りの合計の上限（歩）
const SOLVE_NODES = 3000000; // 勝ち方を探すときに調べるマスの数の上限
const SLACK = 6; // 気をつける人が描く道の、近道より長い歩数の上限
const PATH_CAP = 60000; // 1人ぶんの道を並べる数の上限（超えたら NG）
const PLAYOUTS = 2000; // 気をつける人を試す回数（300 では、種を変えると 7面で 6.0 と 6.8 ほど違った）
const CAP = 60; // 気をつける人がこの回数で解けなければ、この回数として数える
const WEIGHT = { 0: 1, 2: 0.6, 4: 0.35, 6: 0.2 }; // 気をつける人が描き直すとき、遠回り 0・2・4・6 歩の道を選ぶ重み
const CROSS = 300; // 突き合わせるでたらめな道の組の数（レベルごと）

// ---- 解く道具（sim とは別に書いた決まり。マスは 行 × W + 列） ----
function prep(level) {
  const g = level.grid;
  const H = g.length;
  const W = g[0].length;
  const N = W * H;
  const wall = new Uint8Array(N);
  const door = {};
  const start = {};
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = g[r][c];
      if (ch === '#') wall[r * W + c] = 1;
      else if (/^[RBYGP]$/.test(ch)) start[ch] = r * W + c;
      else if (/^[rbygp]$/.test(ch)) door[ch.toUpperCase()] = r * W + c;
    }
  }
  const nbr = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / W);
    const c = i % W;
    const list = [];
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr >= 0 && nc >= 0 && nr < H && nc < W) list.push(nr * W + nc);
    }
    nbr.push(list);
  }
  const doorCells = new Set(Object.values(door));
  const people = [...COLORS].filter((col) => start[col] !== undefined).map((col) => {
    // 歩けるマス: 壁でなく、扉なら自分の扉だけ
    const ok = new Uint8Array(N);
    for (let i = 0; i < N; i++) ok[i] = !wall[i] && (!doorCells.has(i) || i === door[col]) ? 1 : 0;
    // 扉からの近さ（歩数）
    const dist = new Int32Array(N).fill(1 << 20);
    if (door[col] !== undefined) {
      const q = [door[col]];
      dist[door[col]] = 0;
      for (let h = 0; h < q.length; h++) {
        for (const v of nbr[q[h]]) {
          if (ok[v] && dist[v] > dist[q[h]] + 1) {
            dist[v] = dist[q[h]] + 1;
            q.push(v);
          }
        }
      }
    }
    return { color: col, start: start[col], door: door[col], ok, dist, dmin: dist[start[col]] };
  });
  // ロボットの位置（拍ごと）。はしで向きを変えて1マスずつ進むのを、向きを覚えて1拍ずつなぞって作る
  const robots = (level.robots || []).map(([r0, c0, r1, c1]) => {
    const track = [];
    const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let k = 0; k <= n; k++) track.push((r0 + Math.sign(r1 - r0) * k) * W + c0 + Math.sign(c1 - c0) * k);
    const at = [track[0]];
    let i = 0;
    let dir = 1;
    for (let t = 1; t <= 400; t++) {
      if (track.length > 1) {
        if (i + dir < 0 || i + dir >= track.length) dir = -dir;
        i += dir;
      }
      at.push(track[i]);
    }
    return { track, at };
  });
  return { W, H, N, wall, nbr, people, robots, doorCells };
}

// 人 k の道（人のマスから扉まで、同じマスを通らない）のうち、近道より長い歩数が maxExtra までのものを全部並べる。
// 返すのは extra（遠回りの歩数）ごとの並び。cap を超えたら overflow
function enumPaths(P, k, maxExtra, cap) {
  const pe = P.people[k];
  const budget = pe.dmin + maxExtra;
  const vis = new Uint8Array(P.N);
  const stack = [pe.start];
  vis[pe.start] = 1;
  const byExtra = new Map();
  let count = 0;
  let overflow = false;
  (function dfs(u, len) {
    if (overflow) return;
    if (u === pe.door) {
      const e = len - pe.dmin;
      if (!byExtra.has(e)) byExtra.set(e, []);
      byExtra.get(e).push(stack.slice());
      if (++count > cap) overflow = true;
      return;
    }
    for (const v of P.nbr[u]) {
      if (vis[v] || !pe.ok[v] || len + 1 + pe.dist[v] > budget) continue;
      vis[v] = 1;
      stack.push(v);
      dfs(v, len + 1);
      stack.pop();
      vis[v] = 0;
    }
  })(pe.start, 0);
  return { byExtra, count, overflow };
}

// 道の組を歩かせる（sim とは別に書いた決まり）。paths[k] は人 k の道（マスの並び。人のマスから扉まで）。
// 返す: { result: 'clear' | 'fail', t（クリアした拍か、ぶつかった拍）, hits: [{ kind, a, b }] }（a・b は 'P0' のような人か 'R0' のようなロボット）
function play(P, paths) {
  const T = Math.max(...paths.map((p) => p.length - 1));
  for (let t = 1; t <= T; t++) {
    const m = [];
    paths.forEach((p, k) => {
      if (t <= p.length - 1) m.push({ who: 'P' + k, from: p[t - 1], to: p[t] });
    });
    P.robots.forEach((rb, k) => m.push({ who: 'R' + k, from: rb.at[t - 1], to: rb.at[t] }));
    const hits = [];
    for (let i = 0; i < m.length; i++) {
      for (let j = i + 1; j < m.length; j++) {
        if (m[i].who[0] === 'R' && m[j].who[0] === 'R') continue;
        if (m[i].to === m[j].to) hits.push({ kind: 'cell', a: m[i].who, b: m[j].who });
        else if (m[i].to === m[j].from && m[j].to === m[i].from) hits.push({ kind: 'swap', a: m[i].who, b: m[j].who });
      }
    }
    if (hits.length) return { result: 'fail', t, hits };
  }
  return { result: 'clear', t: T, hits: [] };
}

// いちばん少ない遠回りの勝ち方を探す。遠回りの合計を 0・2・4… と増やしながら、人を1人ずつ、それまでに決めた人とロボットに
// ぶつからない道を深さ優先で探す（どの人の道も、遠回りは残りの合計まで）。
// 返す: { extra（遠回りの合計）, paths, nodes } か、見つからなければ { extra: -1, nodes, overflow }
function solve(P, maxTotal, nodeLimit) {
  const n = P.people.length;
  const limit = nodeLimit || SOLVE_NODES;
  let nodes = 0;
  let overflow = false;
  const chosen = [];
  // 決めた人 k が拍 t にいるマス（扉に入ったあとは -1）
  const posOf = (p, t) => (t < p.length ? p[t] : -1);
  function clash(u, v, t) {
    for (const p of chosen) {
      const q = posOf(p, t);
      if (q === v) return true;
      if (q === u && posOf(p, t - 1) === v) return true;
    }
    for (const rb of P.robots) {
      const q = rb.at[t];
      if (q === v) return true;
      if (q === u && rb.at[t - 1] === v) return true;
    }
    return false;
  }
  function place(k, rem) {
    if (k === n) return true;
    const pe = P.people[k];
    const budget = pe.dmin + rem;
    const vis = new Uint8Array(P.N);
    const stack = [pe.start];
    vis[pe.start] = 1;
    function dfs(u, len) {
      if (++nodes > limit) {
        overflow = true;
        return false;
      }
      if (u === pe.door) {
        chosen.push(stack.slice());
        if (place(k + 1, rem - (len - pe.dmin))) return true;
        chosen.pop();
        return overflow ? false : false;
      }
      for (const v of P.nbr[u]) {
        if (vis[v] || !pe.ok[v] || len + 1 + pe.dist[v] > budget) continue;
        if (clash(u, v, len + 1)) continue;
        vis[v] = 1;
        stack.push(v);
        if (dfs(v, len + 1)) return true;
        stack.pop();
        vis[v] = 0;
        if (overflow) return false;
      }
      return false;
    }
    return dfs(pe.start, 0);
  }
  for (let E = 0; E <= maxTotal; E += 2) {
    chosen.length = 0;
    if (place(0, E)) {
      const paths = chosen.slice();
      const extra = paths.reduce((s, p, k) => s + p.length - 1 - P.people[k].dmin, 0);
      return { extra, paths, nodes };
    }
    if (overflow) return { extra: -1, nodes, overflow: true };
  }
  return { extra: -1, nodes, overflow: false };
}

// 気をつける人: 全員の近道（近道が何本もあれば、でたらめに1本）から始めて歩かせる。ぶつかったら、ぶつかった人（ロボットでない側。
// 2人ならでたらめに1人）の道を、そのぶつかり方（同じ相手と同じ拍に）をしない道に描き直して、また歩かせる。
// 描き直す道は、遠回りの歩数ごとの重み WEIGHT で歩数を選び、その歩数の道からでたらめに選ぶ。クリアするまでに歩かせた回数の平均を返す。
// lists[k] は enumPaths の byExtra
function careful(P, lists, rng, playouts, cap) {
  const runs = playouts || PLAYOUTS;
  const limit = cap || CAP;
  const n = P.people.length;
  let sum = 0;
  let solved = 0;
  const pickPath = (k) => {
    const m = lists[k];
    const classes = [...m.keys()].filter((e) => WEIGHT[e] !== undefined && m.get(e).length);
    const total = classes.reduce((s, e) => s + WEIGHT[e], 0);
    let x = rng() * total;
    let e = classes[classes.length - 1];
    for (const c of classes) {
      x -= WEIGHT[c];
      if (x < 0) {
        e = c;
        break;
      }
    }
    const arr = m.get(e);
    return arr[(rng() * arr.length) | 0];
  };
  for (let pl = 0; pl < runs; pl++) {
    const paths = [];
    for (let k = 0; k < n; k++) {
      const arr = lists[k].get(0);
      paths.push(arr[(rng() * arr.length) | 0]);
    }
    let tries = 1;
    for (;;) {
      const r = play(P, paths);
      if (r.result === 'clear') {
        solved++;
        break;
      }
      if (tries >= limit) break;
      const hit = r.hits[0];
      const people = [hit.a, hit.b].filter((w) => w[0] === 'P');
      const who = people[(rng() * people.length) | 0];
      const X = Number(who.slice(1));
      const other = who === hit.a ? hit.b : hit.a;
      const t = r.t;
      const posOther = (tt) => (other[0] === 'R' ? P.robots[Number(other.slice(1))].at[tt] : tt < paths[Number(other.slice(1))].length ? paths[Number(other.slice(1))][tt] : -1);
      for (let n2 = 0; n2 < 300; n2++) {
        const q = pickPath(X);
        if (q === paths[X]) continue;
        const a = t < q.length ? q[t] : -1;
        const a0 = t - 1 < q.length ? q[t - 1] : -1;
        const same = a >= 0 && (a === posOther(t) || (a === posOther(t - 1) && posOther(t) === a0));
        if (!same) {
          paths[X] = q;
          break;
        }
      }
      tries++;
    }
    sum += tries;
  }
  return { avg: sum / runs, rate: solved / runs };
}

// 向きの文字の並びを、マスの並びにする（人のマスから）
function cellsOf(P, k, dirs) {
  const W = P.W;
  const cells = [P.people[k].start];
  for (const ch of dirs) {
    const d = DIRS.indexOf(ch);
    const u = cells[cells.length - 1];
    cells.push((Math.floor(u / W) + DR[d]) * W + (u % W) + DC[d]);
  }
  return cells;
}
// マスの並びを、向きの文字の並びにする
function dirsOf(P, cells) {
  let s = '';
  for (let i = 1; i < cells.length; i++) {
    const d = cells[i] - cells[i - 1];
    s += d === -P.W ? 'U' : d === P.W ? 'D' : d === 1 ? 'R' : 'L';
  }
  return s;
}

module.exports = { prep, enumPaths, play, solve, careful, cellsOf, dirsOf, WEIGHT, SLACK, PATH_CAP, CAP, PLAYOUTS };
if (require.main === module) main();

function main() {
  const args = process.argv.slice(2);
  const PRINT_CASES = args.includes('--cases');
  const appDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'app'));
  globalThis.KG = {};
  require(path.join(appDir, 'js', 'core.js'));
  require(path.join(appDir, 'js', 'games', 'door-levels.js'));
  require(path.join(appDir, 'js', 'games', 'door-sim.js'));
  const KG = globalThis.KG;
  const SIM = KG.doorSim;
  const LEVELS = KG.doorLevels;

  let bad = 0;
  const ng = (msg) => {
    bad++;
    console.log('★NG ' + msg);
  };

  // ---- 本物の決まりで、指の操作どおりに道を描いて歩かせる ----
  // seq は 'R:UURR B:LLU' の形。人のマスをさわって描き始め、1マスずつ指を動かし、扉に着いたら指を離す
  function runSim(level, seq) {
    const sim = SIM.createSim(level);
    for (const w of seq.split(' ').filter(Boolean)) {
      const [col, dirs] = w.split(':');
      const p = sim.people.find((x) => x.color === col);
      if (!p) return { result: 'いない人 ' + col, sim };
      const r0 = Math.floor(p.start / sim.W);
      const c0 = p.start % sim.W;
      const got = sim.pick(r0, c0);
      if (!got || got.id !== p.id || got.from !== 'start' || !sim.beginDraw(got.id, got.from)) return { result: '描き始められない ' + w, sim };
      let r = r0;
      let c = c0;
      for (let n = 0; n < (dirs || '').length; n++) {
        const d = DIRS.indexOf(dirs[n]);
        r += DR[d];
        c += DC[d];
        const k = sim.drawTo(r, c);
        const want = n === dirs.length - 1 && r * sim.W + c === p.door ? 'done' : 'add';
        if (k.join(',') !== want) return { result: '描けない道 ' + w + '（' + (n + 1) + ' マス目 ' + k.join(',') + '）', sim };
      }
      sim.endDraw();
    }
    sim.runAll();
    return { result: sim.state, sim };
  }
  // sim の結果を「clear@拍」「fail@拍:R-B」の形に（ぶつかった最初の組。ロボットは 0 から番号を付けた robot0 のように書く）
  function outcomeOf(sim) {
    if (sim.state === 'clear') return 'clear@' + sim.t;
    if (sim.state !== 'fail') return sim.state;
    const h = sim.crash.hits[0];
    const nm = (m) => (m.kind === 'person' ? sim.people[m.id].color : 'robot' + m.id);
    return 'fail@' + sim.crash.t + ':' + nm(h.a) + '-' + nm(h.b);
  }
  function outcomeOfTool(P, r) {
    if (r.result === 'clear') return 'clear@' + r.t;
    const nm = (w) => (w[0] === 'P' ? P.people[Number(w.slice(1))].color : 'robot' + w.slice(1));
    return 'fail@' + r.t + ':' + nm(r.hits[0].a) + '-' + nm(r.hits[0].b);
  }

  // ---- レベルの形 ----
  function shapeProblems(level, no) {
    const why = [];
    const g = level.grid;
    if (!Array.isArray(g) || g.length < 3) return ['盤の行が足りない'];
    const H = g.length;
    const W = g[0].length;
    g.forEach((line, r) => {
      if (line.length !== W) why.push(r + ' 行目の字数が ' + W + ' でない');
      if (/[^.#RBYGPrbygp]/.test(line)) why.push(r + ' 行目に使えない文字');
    });
    if (why.length) return why;
    const all = g.join('');
    for (const col of COLORS) {
      const a = all.split(col).length - 1;
      const b = all.split(col.toLowerCase()).length - 1;
      if (a > 1 || b > 1 || a !== b) why.push(col + ' の人 ' + a + ' 人・扉 ' + b + ' つ（1色に1人と1つ）');
    }
    const P = prep(level);
    if (P.people.length < 2) why.push('人が2人より少ない');
    P.people.forEach((pe) => {
      if (pe.dmin >= 1 << 20) why.push(pe.color + ' の人から扉までの道が無い');
    });
    const robots = level.robots || [];
    if (no < ROBOT_FROM && robots.length) why.push(ROBOT_FROM + '面より前にロボット');
    if (no >= ROBOT_FROM && !robots.length) why.push('ロボットがいない');
    const used = new Set();
    robots.forEach((spec, k) => {
      const [r0, c0, r1, c1] = spec;
      if (spec.length !== 4 || (r0 !== r1 && c0 !== c1) || (r0 === r1 && c0 === c1)) {
        why.push('ロボット ' + k + ' の通る所がまっすぐでない');
        return;
      }
      for (const cell of P.robots[k].track) {
        const r = Math.floor(cell / W);
        const c = cell % W;
        if (r < 0 || c < 0 || r >= H || c >= W || g[r][c] !== '.') why.push('ロボット ' + k + ' の通る所が床でない（' + r + ',' + c + '）');
        if (used.has(cell)) why.push('ロボットの通る所が重なる（' + r + ',' + c + '）');
        used.add(cell);
      }
    });
    const L = SIM.layout(W, H);
    if (L.left - L.T < 16 || L.left + W * L.C + L.T > 540 - 16 || L.top - L.T < 136 || L.top + H * L.C + L.T > 944 || L.C < CELL_MIN)
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
    const head = name + '  ' + P.W + '×' + P.H + ' 人 ' + P.people.length + (P.robots.length ? ' ロボット ' + P.robots.length : '');
    const sv = solve(P, SOLVE_MAX);
    if (sv.extra < 0) {
      ng(head + (sv.overflow ? ' 勝ち方を探すマスが ' + SOLVE_NODES + ' を超えた' : ' 遠回り ' + SOLVE_MAX + ' 歩までで解けない'));
      return;
    }
    const seq = sv.paths.map((p, k) => P.people[k].color + ':' + dirsOf(P, p)).join(' ');
    const r = runSim(level, seq);
    const out = outcomeOf(r.sim);
    // 近道だけでも解けるか（遠回り 0）、遠回りが1人2歩だけで解けるか
    const naive = sv.extra === 0;
    const lists = P.people.map((pe, k) => enumPaths(P, k, SLACK, PATH_CAP));
    const over = lists.findIndex((x) => x.overflow);
    if (over >= 0) {
      ng(head + ' ' + P.people[over].color + ' の道が ' + PATH_CAP + ' 本を超えた（気をつける人を試せない）');
      return;
    }
    const cf = careful(P, lists.map((x) => x.byExtra), KG.rng(no * 7919));
    carefulOf[no] = cf.avg;
    const line = head + '  近道 ' + P.people.map((pe) => pe.color + pe.dmin).join(' ') + '  いちばん少ない遠回り ' + sv.extra + ' 歩（調べたマス ' + sv.nodes + '）→ ' + out +
      '  気をつける人 平均 ' + cf.avg.toFixed(2) + ' 回（' + CAP + ' 回までに解けた ' + (cf.rate * 100).toFixed(0) + '%）  道の数 ' + lists.map((x) => x.count).join('・');
    const why2 = [];
    if (r.result !== 'clear') why2.push('見つけた勝ち方が本物の決まりでクリアにならない（' + r.result + '）');
    if (no >= NAIVE_FROM && naive) why2.push('近道だけで解ける');
    if (no >= TWO_FROM && sv.extra <= 2) why2.push('遠回りが1人2歩だけで解ける');
    if (why2.length) ng(line + '  ' + why2.join(' / '));
    else console.log('OK  ' + line);
    casesOut.push('    [' + no + ", '" + seq + "', '" + out + "'],");
    // 近道の組（どの人も近道の1本目）で負ける形
    if (!naive) {
      const nseq = P.people.map((pe, k) => pe.color + ':' + dirsOf(P, lists[k].byExtra.get(0)[0])).join(' ');
      const nr = runSim(level, nseq);
      casesOut.push('    [' + no + ", '" + nseq + "', '" + outcomeOf(nr.sim) + "', '近道どうしでぶつかる'],");
    }
    // でたらめな道の組（遠回り SLACK 歩まで）を本物の決まりと解く道具の両方で歩かせ、結果が同じになるか
    const rnd = KG.rng(no * 31337);
    let diff = '';
    for (let n = 0; n < CROSS && !diff; n++) {
      const paths = lists.map((x) => {
        const all = [].concat(...x.byExtra.values());
        return all[(rnd() * all.length) | 0];
      });
      const s2 = paths.map((p, k) => P.people[k].color + ':' + dirsOf(P, p)).join(' ');
      const a = outcomeOf(runSim(level, s2).sim);
      const b = outcomeOfTool(P, play(P, paths));
      if (a !== b) diff = s2 + '  sim ' + a + ' / 道具 ' + b;
    }
    if (diff) ng(name + ' 本物の決まりと解く道具の突き合わせ: ' + diff);
    else console.log('OK  ' + name + '  でたらめな道の組 ' + CROSS + ' 組で、本物の決まりと解く道具の結果が一致');
  });
  for (let no = DOWN_FROM; no <= LEVELS.length; no++) {
    const a = carefulOf[no - 1];
    const b = carefulOf[no];
    if (a == null || b == null) continue; // 形がおかしい・解けない面は、上で NG になっている
    const msg = no - 1 + '面 ' + a.toFixed(2) + ' 回 → ' + no + '面 ' + b.toFixed(2) + ' 回';
    if (b > a) console.log('OK  気をつける人の歩かせる回数が増える ' + msg);
    else ng('気をつける人の歩かせる回数が前の面より増えていない ' + msg);
  }

  if (PRINT_CASES) {
    console.log('const CASES = [');
    for (const l of casesOut) console.log(l);
    console.log('];');
  }

  // ---- 期待の表（レベルごとに決めた道と結果。2026-11-06 に --cases で出したもの） ----
  // 勝ち方は解く道具が見つけた、いちばん少ない遠回りのもの。負ける道は、どの人も近道の1本目（解く道具が先に見つけるもの）を歩く組。
  // [面, 道, 期待（'clear@クリアした拍' か 'fail@ぶつかった拍:ぶつかった2人'）, 説明]
  const CASES = [
    [1, 'R:UUUUUU B:UUUUUU', 'clear@6'],
    [2, 'R:RRRRR B:UUUUUU', 'clear@6'],
    [3, 'R:URRDRRRR B:UUUUUU', 'clear@8'],
    [3, 'R:RRRRRR B:UUUUUU', 'fail@3:R-B', '近道どうしでぶつかる'],
    [4, 'R:URDRR B:LLL', 'clear@5'],
    [4, 'R:RRR B:LLL', 'fail@1:R-B', '近道どうしでぶつかる'],
    [5, 'R:URRRRRDD B:UUUUU Y:RDDDRDD', 'clear@8'],
    [5, 'R:RRRDRR B:UUUUU Y:RDDDRDD', 'fail@3:R-Y', '近道どうしでぶつかる'],
    [6, 'R:UUUURDRRRR B:UUUURUU', 'clear@10'],
    [6, 'R:UUURRRRR B:UUUUUUR', 'fail@4:R-B', '近道どうしでぶつかる'],
    [7, 'R:UUUUUUR B:UURRDRRRDD Y:UUUUUU', 'clear@10'],
    [7, 'R:UUUUUUR B:DRRRRR Y:UUUUUU', 'fail@1:B-Y', '近道どうしでぶつかる'],
    [8, 'R:UURRUURRR B:ULDLLLLL Y:RDDDDDDDL', 'clear@9'],
    [8, 'R:UURRUURRR B:LLLLLL Y:DDDDDDD', 'fail@4:R-B', '近道どうしでぶつかる'],
    [9, 'R:UUULUUURURR B:RRUUURRRR Y:RRRUUULUUUUU G:ULLDLLDDLLD', 'clear@12'],
    [9, 'R:UUURURUUU B:RRUUURRRR Y:URUUUUURUU G:DLDLLLLLD', 'fail@1:B-Y', '近道どうしでぶつかる'],
    [10, 'R:UUULUUUURR B:DDDDDDD Y:UUURRRRRDRD G:UULLUURRUUU', 'clear@11'],
    [10, 'R:UUUUUUUR B:DDDDDDD Y:UURRRRRRD G:UULUUUUUR', 'fail@4:R-robot0', '近道どうしでぶつかる'],
  ];
  for (const [no, seq, want, note] of CASES) {
    const level = LEVELS[no - 1];
    if (!level) {
      ng('表 ' + no + '面が無い');
      continue;
    }
    const r = runSim(level, seq);
    const got = r.result === 'clear' || r.result === 'fail' ? outcomeOf(r.sim) : r.result;
    const line = '表 ' + no + '面 ' + (note ? '（' + note + '）' : '') + seq + '  期待 ' + want + ' 結果 ' + got;
    if (got === want) console.log('OK  ' + line);
    else ng(line);
  }

  // ---- 決まり ----
  const make = (grid, robots) => SIM.createSim({ grid, robots });
  const who = (sim, col) => sim.people.find((p) => p.color === col);
  // 人 col の道を、人のマスから dirs のとおりに描く（指を離す）。drawTo の結果を ',' でつなぐ
  const draw = (sim, col, dirs, keep) => {
    const p = who(sim, col);
    const got = sim.pick(Math.floor(p.start / sim.W), p.start % sim.W);
    sim.beginDraw(got.id, got.from);
    let r = Math.floor(p.start / sim.W);
    let c = p.start % sim.W;
    const out = [];
    for (const ch of dirs) {
      const d = DIRS.indexOf(ch);
      r += DR[d];
      c += DC[d];
      out.push(sim.drawTo(r, c).join('+'));
    }
    if (!keep) sim.endDraw();
    return out.join(',');
  };
  const pathOf = (sim, col) => dirsOf({ W: sim.W }, who(sim, col).path);
  // 人 col の道を、マスの並び targets へ順に指を動かして描く（指は離さない）。drawTo の結果を '/' でつなぐ
  const drawCells = (sim, col, targets) => {
    const p = who(sim, col);
    sim.beginDraw(p.id, 'start');
    return targets.map(([r, c]) => sim.drawTo(r, c).join('+')).join('/');
  };
  const RULES = [
    ['道は上下左右のとなりのマスへのび、壁・ほかの色の扉・盤の外では止まる（ほかの人のいるマスは通れる）', () => {
      const sim = make(['R.#', '.Bb', 'r..']);
      const got = drawCells(sim, 'R', [[0, -1], [0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 0]]);
      sim.endDraw();
      const a = pathOf(sim, 'R');
      return [got === 'stop/add/stop/add/stop/add/done' && a === 'RDDL' && who(sim, 'R').done, got + ' 赤の道 ' + a];
    }],
    ['自分の道へ戻ると縮む（1つ前のマスへ戻れば1マス、もっと前の道のマスへ戻れば、そこまで）', () => {
      const sim = make(['R...', '....', '...r']);
      const p = who(sim, 'R');
      sim.beginDraw(p.id, 'start');
      [[0, 1], [0, 2], [1, 2], [1, 1]].forEach(([r, c]) => sim.drawTo(r, c));
      const a = dirsOf({ W: sim.W }, p.path);
      const k1 = sim.drawTo(1, 2).join(',');
      const b = dirsOf({ W: sim.W }, p.path);
      const k2 = sim.drawTo(0, 2).join(',');
      const c = dirsOf({ W: sim.W }, p.path);
      sim.endDraw();
      return [a === 'RRDL' && k1 === 'back' && b === 'RRD' && k2 === 'back' && c === 'RR', a + ' / ' + k1 + ' ' + b + ' / ' + k2 + ' ' + c];
    }],
    ['自分の道を横切ろうとすると、横切る所まで縮む（同じマスを2回通らない）', () => {
      const sim = make(['R..', '...', '..r']);
      const p = who(sim, 'R');
      sim.beginDraw(p.id, 'start');
      [[1, 0], [1, 1], [0, 1]].forEach(([r, c]) => sim.drawTo(r, c));
      const k = sim.drawTo(0, 0).join(',');
      const a = dirsOf({ W: sim.W }, p.path);
      sim.endDraw();
      return [k === 'back' && a === '', k + ' 道 「' + a + '」'];
    }],
    ['自分の扉に着くと道はできあがり、その先へはのびない。戻れば縮んで、できあがりでなくなる', () => {
      const sim = make(['R.r.', '....']);
      const p = who(sim, 'R');
      sim.beginDraw(p.id, 'start');
      const k1 = sim.drawTo(0, 2).join(',');
      const done1 = p.done;
      const k2 = sim.drawTo(0, 3).join(',');
      const k3 = sim.drawTo(1, 2).join(',');
      const k4 = sim.drawTo(0, 1).join(',');
      sim.endDraw();
      return [k1 === 'add,done' && done1 && k2 === 'stop' && k3 === 'stop' && k4 === 'back' && !p.done && p.path.length === 2, [k1, done1, k2, k3, k4, p.done].join(' / ')];
    }],
    ['指を斜めに大きく動かすと、離れているほうの向きから1マスずつのび、ふさがっていればもう片方の向きへのびる', () => {
      const a = make(['R....', '..#..', '....r']);
      const k1 = drawCells(a, 'R', [[2, 4]]);
      const p1 = pathOf(a, 'R');
      const b = make(['R#...', '.....', '....r']);
      const k2 = drawCells(b, 'R', [[1, 4]]);
      const p2 = pathOf(b, 'R');
      return [k1 === 'add+add+add+add+add+done' && p1 === 'RRRDRD' && k2 === 'add+add+add+add+add' && p2 === 'DRRRR', k1 + ' ' + p1 + ' / ' + k2 + ' ' + p2];
    }],
    ['人のマスをさわると道を描き直し、道の先（できあがった道は扉）をさわると続きを描ける。道の途中や床では描き始めない', () => {
      const sim = make(['R..', '...', '..r', 'B.b']);
      draw(sim, 'R', 'RR');
      const a = sim.pick(0, 2);
      const b = sim.pick(0, 1);
      const c = sim.pick(1, 1);
      const d = sim.pick(0, 0);
      sim.beginDraw(a.id, a.from);
      sim.drawTo(2, 2);
      sim.endDraw();
      const e = sim.pick(2, 2);
      const len1 = who(sim, 'R').path.length;
      sim.beginDraw(d.id, d.from);
      const len2 = who(sim, 'R').path.length;
      sim.endDraw();
      return [a && a.from === 'end' && b === null && c === null && d.from === 'start' && e && e.from === 'end' && len1 === 5 && len2 === 1,
        JSON.stringify([a, b, c, d, e, len1, len2])];
    }],
    ['全員の道ができあがって指を離すと歩き出す。1人でもできあがっていなければ歩き出さない。歩き出したら道は描けない', () => {
      const sim = make(['R.r', '...', 'B.b']);
      draw(sim, 'R', 'RR');
      const s1 = sim.state;
      draw(sim, 'B', 'R');
      const s2 = sim.state;
      const p = who(sim, 'B');
      sim.beginDraw(p.id, 'end');
      sim.drawTo(2, 2);
      const s3 = sim.state;
      sim.endDraw();
      const s4 = sim.state;
      const pk = sim.pick(0, 0);
      return [s1 === 'draw' && s2 === 'draw' && s3 === 'draw' && s4 === 'walk' && pk === null && !sim.beginDraw(0, 'start'), [s1, s2, s3, s4, JSON.stringify(pk)].join(' / ')];
    }],
    ['同じ拍に同じマスへ来るとぶつかって失敗（ぶつかった拍と2人を残し、そこで止まる）', () => {
      const sim = make(['.R..', 'B..r', '.b..']);
      draw(sim, 'R', 'DRR');
      draw(sim, 'B', 'RD');
      const s = sim.state;
      sim.runAll();
      return [s === 'walk' && outcomeOf(sim) === 'fail@1:R-B' && sim.crash.hits[0].kind === 'cell' && sim.t === 1 && sim.beat() === null,
        s + ' → ' + outcomeOf(sim) + ' ' + (sim.crash && sim.crash.hits[0].kind)];
    }],
    ['向かい合ってすれ違う（2人が入れかわる）とぶつかって失敗', () => {
      const sim = make(['b.RB.r']);
      draw(sim, 'R', 'RRR');
      draw(sim, 'B', 'LLL');
      sim.runAll();
      return [outcomeOf(sim) === 'fail@1:R-B' && sim.crash.hits[0].kind === 'swap', outcomeOf(sim) + ' ' + (sim.crash && sim.crash.hits[0].kind)];
    }],
    ['道が交わっても、通る拍がずれればぶつからない。前の人が出たマスへ次の拍に入る（後ろについて歩く）のもぶつからない', () => {
      const a = make(['..b..', 'R...r', '.....', '.....', '..B..']);
      draw(a, 'R', 'RRRR');
      draw(a, 'B', 'UUUU');
      a.runAll();
      const b = make(['RB..r', '....b']);
      draw(b, 'B', 'RRDR');
      draw(b, 'R', 'RRRR');
      b.runAll();
      return [outcomeOf(a) === 'clear@4' && outcomeOf(b) === 'clear@4', outcomeOf(a) + ' / ' + outcomeOf(b)];
    }],
    ['扉に着いた人はその拍に扉へ入り、全員が入ればクリア（クリアの拍は、いちばん長い道の歩数）', () => {
      const sim = make(['R.r', '...', 'B..', '..b']);
      draw(sim, 'R', 'RR');
      draw(sim, 'B', 'DRR');
      const ev = [];
      while (sim.state === 'walk') {
        sim.beat();
        ev.push(sim.t + ':' + sim.left());
      }
      return [ev.join(' ') === '1:2 2:1 3:0' && sim.state === 'clear' && sim.events.some((e) => e.type === 'clear'), ev.join(' ') + ' ' + sim.state];
    }],
    ['ロボットは1つ目のマスから2つ目のマスへ向かって1拍に1マス進み、はしですぐ向きを変えて行ったり来たりする', () => {
      const sim = make(['R...r', '.....', 'B...b'], [[1, 0, 1, 3]]);
      const seen = [];
      for (let t = 0; t <= 8; t++) seen.push(sim.robotCell(0, t) % sim.W);
      return [seen.join('') === '012321012', seen.join('')];
    }],
    ['人とロボットが同じマスに来るか、すれ違うとぶつかって失敗（ロボットが出たマスへ次の拍に入るのはぶつからない）', () => {
      const b = make(['R..r', '....', 'B..b'], [[0, 2, 0, 1]]);
      draw(b, 'R', 'RRR');
      draw(b, 'B', 'RRR');
      b.runAll();
      const c = make(['R..r', '....', 'B..b'], [[0, 1, 0, 2]]);
      draw(c, 'R', 'RRR');
      draw(c, 'B', 'RRR');
      c.runAll();
      return [outcomeOf(b) === 'fail@1:R-robot0' && b.crash.hits[0].kind === 'cell' && outcomeOf(c) === 'fail@2:R-robot0' && c.crash.hits[0].kind === 'swap',
        outcomeOf(b) + ' ' + (b.crash && b.crash.hits[0].kind) + ' / ' + outcomeOf(c) + ' ' + (c.crash && c.crash.hits[0].kind)];
    }],
    ['画面のマス: 盤の左上のマスの真ん中は 0,0、盤の外は無し', () => {
      const sim = make(['R...', '....', '...r']);
      const L = sim.L;
      const got = [sim.cellAt(L.left + L.C / 2, L.top + L.C / 2), sim.cellAt(L.left + L.C * 3.5, L.top + L.C * 1.5), sim.cellAt(L.left - 2, L.top + 5), sim.cellAt(L.left + 5, L.top + L.C * 3 + 1)];
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
