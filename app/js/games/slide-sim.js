// 色のブロックを出すの中身（盤・ブロック・出口の決まりと勝ち負け）。DOM・canvas・window には触らない
// （Node の検査 tools/test-slide.js がそのまま読み込むため）。描画と指の操作は slide.js が持つ。
// 盤は W × H のマス目で、外まわりを壁が囲む。壁の一部が色の付いた出口。
// level.grid は壁を含めた (H + 2) 行 × (W + 2) 字。外まわりの1周: # 壁／大文字 出口（R 赤・B 青・Y 黄・G 緑・P 紫 の5色。角は #）。
// 内側: . 空き／# 動かない石／小文字 ブロック（同じ文字のマスが1つのブロック。上下左右でつながった形）。
// level.colors はブロックの文字 → 色の文字列。1文字ならその色。2文字なら2色のブロック（1文字目が外側、2文字目が内側。6面から）。
// ブロックは上下左右に1マスずつ動き、壁・石・ほかのブロックには入れない。回らない。
// 盤のふちから外へ出ようとしたとき（どれかのマスが盤の外へ出る1歩）、出る向きに見たブロックの幅の全部（縦に出るなら各列、
// 横に出るなら各行）が、いまの色の出口に面していて、各列（各行）のブロックの先から盤のふちまでが空いていれば、外へ出て盤から消える。
// 2色のブロックが外側の色の出口から出ようとすると、外側だけがはがれて内側の色のブロックになり、その場に残る（そこでつかむのが終わる）。
// 全部のブロックが出ればクリア。失敗は無い（ブロックは動かした道を戻せ、出たブロックは道をあけるだけなので、解けなくなる形が無い）。
// 手数は、指でつかんでからはなすまでにブロックが動いた（出た・はがれたを含む）回数。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const DR = [-1, 0, 1, 0]; // 向き 0 上・1 右・2 下・3 左
  const DC = [0, 1, 0, -1];
  const DIRS = 'URDL'; // 検査の手順の書き方で使う向きの文字（DR・DC と同じ並び）

  // 画面の並べ方（論理座標）。盤の大きさで1マスの大きさを決め、上の帯の下（140〜940）の真ん中に置く。
  // 描画（slide.js）と、指の位置からマスを決める計算（cellAt）が使う
  function layout(W, H) {
    const T = 16; // 壁の厚さ
    const C = Math.floor(Math.min(80, (KG.W - 2 * (T + 26)) / W, (800 - 2 * T - 20) / H));
    const left = Math.round((KG.W - W * C) / 2);
    const top = Math.round(140 + T + (800 - 2 * T - H * C) / 2);
    return { C, T, left, top };
  }

  function parseLevel(level) {
    const g = level.grid;
    const H = g.length - 2;
    const W = g[0].length - 2;
    const stone = new Uint8Array(W * H);
    // 出口の色。exits[向き][列か行] = 色の文字（出口でなければ ''）。向き 0 は上の壁の各列、1 は右の壁の各行、2 は下、3 は左
    const exits = [new Array(W).fill(''), new Array(H).fill(''), new Array(W).fill(''), new Array(H).fill('')];
    const up = (ch) => (/^[A-Z]$/.test(ch) ? ch : '');
    for (let c = 0; c < W; c++) {
      exits[0][c] = up(g[0][c + 1]);
      exits[2][c] = up(g[H + 1][c + 1]);
    }
    for (let r = 0; r < H; r++) {
      exits[3][r] = up(g[r + 1][0]);
      exits[1][r] = up(g[r + 1][W + 1]);
    }
    const cellsOf = {};
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = g[r + 1][c + 1];
        if (ch === '#') stone[r * W + c] = 1;
        else if (/^[a-z]$/.test(ch)) (cellsOf[ch] = cellsOf[ch] || []).push([r, c]);
      }
    }
    const blocks = Object.keys(cellsOf)
      .sort()
      .map((key, id) => {
        const cs = cellsOf[key];
        const r0 = Math.min(...cs.map((x) => x[0]));
        const c0 = Math.min(...cs.map((x) => x[1]));
        const cells = cs.map(([r, c]) => [r - r0, c - c0]);
        return {
          id,
          key,
          cells,
          w: Math.max(...cells.map((x) => x[1])) + 1,
          h: Math.max(...cells.map((x) => x[0])) + 1,
          r: r0,
          c: c0,
          colors: [...((level.colors || {})[key] || '')],
        };
      });
    return { W, H, stone, exits, blocks };
  }

  function createSim(level) {
    const { W, H, stone, exits, blocks: parsed } = parseLevel(level);
    const blocks = parsed.map((b) => Object.assign(b, { layer: 0, out: false }));
    const occ = new Int16Array(W * H).fill(-1); // そのマスにいるブロックの番号（いなければ -1）
    for (const b of blocks) for (const [dr, dc] of b.cells) occ[(b.r + dr) * W + b.c + dc] = b.id;

    const sim = {
      W,
      H,
      level,
      stone,
      exits,
      blocks,
      occ,
      L: layout(W, H),
      moves: 0,
      state: 'play', // 'play' | 'clear'（失敗は無い）
      dragging: -1, // つかんでいるブロックの番号（いなければ -1）
      dragMoved: false, // つかんでから動いたか（手数に数えるか）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      color,
      blockAt,
      cellAt,
      tryStep,
      beginDrag,
      step,
      endDrag,
      follow,
      left,
    };

    // ブロック id のいまの色（2色のブロックは、外側がはがれるまで外側の色）
    function color(id) {
      const b = blocks[id];
      return b.colors[Math.min(b.layer, b.colors.length - 1)];
    }

    function blockAt(r, c) {
      if (r < 0 || c < 0 || r >= H || c >= W) return -1;
      return occ[r * W + c];
    }

    // 画面の (x, y) にあるマス [行, 列]（盤の外なら null）
    function cellAt(x, y) {
      const c = Math.floor((x - sim.L.left) / sim.L.C);
      const r = Math.floor((y - sim.L.top) / sim.L.C);
      return r < 0 || c < 0 || r >= H || c >= W ? null : [r, c];
    }

    // マス (r, c) にブロック id 以外の物（石・ほかのブロック）があるか
    const busy = (id, r, c) => stone[r * W + c] === 1 || (occ[r * W + c] >= 0 && occ[r * W + c] !== id);

    // ブロック b を向き d へ盤の外へ出せるか（各列か各行で、ブロックの先から盤のふちまでが空き、ふちがいまの色の出口）
    function canLeave(b, d) {
      const col = color(b.id);
      const lanes = new Map(); // 列（縦に出るとき）か行（横に出るとき）→ 向き d でいちばん先のマス
      for (const [dr, dc] of b.cells) {
        const r = b.r + dr;
        const c = b.c + dc;
        const lane = d === 0 || d === 2 ? c : r;
        const pos = d === 0 || d === 2 ? r : c;
        const best = lanes.get(lane);
        const ahead = d === 0 || d === 3 ? best === undefined || pos < best : best === undefined || pos > best;
        if (ahead) lanes.set(lane, pos);
      }
      for (const [lane, pos] of lanes) {
        if (exits[d][lane] !== col) return false;
        const step = d === 0 || d === 3 ? -1 : 1;
        const end = d === 0 || d === 3 ? -1 : d === 2 ? H : W;
        for (let p = pos + step; p !== end; p += step) {
          const r = d === 0 || d === 2 ? p : lane;
          const c = d === 0 || d === 2 ? lane : p;
          if (busy(b.id, r, c)) return false;
        }
      }
      return true;
    }

    // ブロック id を向き d へ1歩動かしたらどうなるか（動かさない）:
    // 'move' 動ける／'exit' 盤の外へ出る／'peel' 外側がはがれる／'edge' 盤のふちで止まる（出口が無い・色や幅が合わない・先がふさがっている）／
    // 'blocked' 石かほかのブロックで止まる／null 動かせない（出たあと・クリアのあと）
    function tryStep(id, d) {
      const b = blocks[id];
      if (!b || b.out || sim.state !== 'play') return null;
      const nr = b.r + DR[d];
      const nc = b.c + DC[d];
      let leaving = false;
      let blocked = false;
      for (const [dr, dc] of b.cells) {
        const r = nr + dr;
        const c = nc + dc;
        if (r < 0 || c < 0 || r >= H || c >= W) leaving = true;
        else if (busy(id, r, c)) blocked = true;
      }
      if (leaving) {
        if (!canLeave(b, d)) return 'edge';
        return b.colors.length === 2 && b.layer === 0 ? 'peel' : 'exit';
      }
      return blocked ? 'blocked' : 'move';
    }

    function beginDrag(id) {
      if (sim.state !== 'play' || !blocks[id] || blocks[id].out) return false;
      endDrag();
      sim.dragging = id;
      sim.dragMoved = false;
      return true;
    }

    // つかんでいるブロックを向き d へ1歩動かす。結果は tryStep と同じ（'move'・'exit'・'peel' のときだけ動く）。
    // 出たとき・はがれたときは、そこでつかむのが終わる
    function step(d) {
      const id = sim.dragging;
      const k = id < 0 ? null : tryStep(id, d);
      if (k !== 'move' && k !== 'exit' && k !== 'peel') return k;
      const b = blocks[id];
      sim.dragMoved = true;
      if (k === 'move') {
        for (const [dr, dc] of b.cells) occ[(b.r + dr) * W + b.c + dc] = -1;
        b.r += DR[d];
        b.c += DC[d];
        for (const [dr, dc] of b.cells) occ[(b.r + dr) * W + b.c + dc] = id;
        sim.events.push({ type: 'move', id, d });
        return k;
      }
      if (k === 'peel') {
        const from = b.colors[0];
        b.layer = 1;
        sim.events.push({ type: 'peel', id, d, from, to: b.colors[1] });
        endDrag();
        return k;
      }
      for (const [dr, dc] of b.cells) occ[(b.r + dr) * W + b.c + dc] = -1;
      b.out = true;
      sim.events.push({ type: 'exit', id, d, color: color(id) });
      endDrag();
      if (blocks.every((x) => x.out)) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
      }
      return k;
    }

    // 指をはなした（つかんでから動いていれば手数に数える）
    function endDrag() {
      if (sim.dragging >= 0 && sim.dragMoved) sim.moves++;
      sim.dragging = -1;
      sim.dragMoved = false;
    }

    // つかんでいるブロックを、左上が (tr, tc)（マスの単位。小数でよい）に近づくよう1歩ずつ動かす。指の動きに合わせて呼ぶ。
    // 離れているほうの向き（縦か横）を先に試し、ふさがっていればもう片方を試す（角を回りこめるように）。
    // 0.5 マス以上離れている向きにだけ動く。動いた結果を順に並べて返す（最後が 'edge'・'blocked' なら、そこで止まった）
    function follow(tr, tc) {
      const out = [];
      for (let n = 0; n < 60 && sim.dragging >= 0; n++) {
        const b = blocks[sim.dragging];
        const dr = tr - b.r;
        const dc = tc - b.c;
        const h = dc >= 0.5 ? 1 : dc <= -0.5 ? 3 : -1;
        const v = dr >= 0.5 ? 2 : dr <= -0.5 ? 0 : -1;
        const cand = Math.abs(dc) >= Math.abs(dr) ? [h, v] : [v, h];
        let moved = false;
        let last = null;
        for (const d of cand) {
          if (d < 0) continue;
          const k = step(d);
          if (k === 'move') {
            out.push(k);
            moved = true;
            break;
          }
          if (k === 'exit' || k === 'peel') {
            out.push(k);
            return out;
          }
          if (last === null) last = k;
        }
        if (!moved) {
          if (last) out.push(last);
          break;
        }
      }
      return out;
    }

    // 盤に残っているブロックの数
    function left() {
      return blocks.filter((b) => !b.out).length;
    }

    return sim;
  }

  KG.slideSim = { DR, DC, DIRS, layout, parseLevel, createSim };
})();
