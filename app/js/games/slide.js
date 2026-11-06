// 色のブロックを出すの見た目（描画・指でつかんで滑らせる操作・音と演出）。盤・ブロック・出口の決まりと勝ち負けは slide-sim.js が持つ。
// ブロックは sim の上ではマス目を1歩ずつ動く。ここでは見た目の位置を毎刻み sim の位置へ寄せて、なめらかに見せる。
// 出口は壁の上の色の帯（矢印つき）。つかんでいる間は、同じ色の出口を明るく、ほかの出口をうすく見せる。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.slideSim;
  const LEVELS = KG.slideLevels;
  const DR = SIM.DR;
  const DC = SIM.DC;
  // 色（fill 本体・dark 縁とかげ・light 光）。赤・青・黄・緑・紫の5色（まぎれやすい橙は使わない）
  const PAL = {
    R: { fill: '#ff5d5d', dark: '#a82828', light: '#ffc2c2' },
    B: { fill: '#4fa3ff', dark: '#1d5aa8', light: '#c4e2ff' },
    Y: { fill: '#ffd23f', dark: '#a87f00', light: '#fff3b8' },
    G: { fill: '#58cf6a', dark: '#23813a', light: '#c6f5cd' },
    P: { fill: '#b47dff', dark: '#6436ad', light: '#e6d6ff' },
  };
  const EXIT_T = 14; // 出たブロックが出口の外へ抜けていく刻み
  const PEEL_T = 18; // はがれた外側が出口へ吸いこまれる刻み
  const EASE = 0.42; // 見た目の位置を sim の位置へ寄せる割合（1刻みごと）
  const GRAB = 0.3; // マスの外側をさわっても、ブロックのマスからこの割合（1マスに対して）までならつかむ

  // ---- 形を描く道具 ----
  // ブロックの形（マスの集まり）を1つの塊として描く道（左上 (x, y)、1マス s）。g はマスの外側のすき間
  function shapePath(ctx, has, cells, x, y, s, g) {
    const b = s * 0.2; // となりのマスとつなぐ帯が、角の丸みを埋めるはみ出し
    ctx.beginPath();
    for (const [r, c] of cells) {
      const cx = x + c * s;
      const cy = y + r * s;
      ctx.roundRect(cx + g, cy + g, s - 2 * g, s - 2 * g, s * 0.15);
      if (has(r, c + 1)) ctx.rect(cx + s - g - b, cy + g, 2 * g + 2 * b, s - 2 * g);
      if (has(r + 1, c)) ctx.rect(cx + g, cy + s - g - b, s - 2 * g, 2 * g + 2 * b);
      if (has(r, c + 1) && has(r + 1, c) && has(r + 1, c + 1)) ctx.rect(cx + s - g - b, cy + s - g - b, 2 * g + 2 * b, 2 * g + 2 * b);
    }
  }
  // 形のふちの線（となりにマスが無い辺）を、内側へ幅 w の帯として塗る（呼ぶ前に形で切り抜いておく）。
  // sides は塗る辺（0 上・1 右・2 下・3 左）。線の両はしを延ばして、へこんだ角も帯がつながるようにする
  function edgeBands(ctx, has, cells, x, y, s, g, sides, w, style) {
    const ext = g + w;
    ctx.strokeStyle = style;
    ctx.lineWidth = w * 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const [r, c] of cells) {
      const x0 = x + c * s;
      const y0 = y + r * s;
      for (const d of sides) {
        if (has(r + DR[d], c + DC[d])) continue;
        if (d === 0) {
          ctx.moveTo(x0 - ext, y0 + g);
          ctx.lineTo(x0 + s + ext, y0 + g);
        } else if (d === 2) {
          ctx.moveTo(x0 - ext, y0 + s - g);
          ctx.lineTo(x0 + s + ext, y0 + s - g);
        } else if (d === 3) {
          ctx.moveTo(x0 + g, y0 - ext);
          ctx.lineTo(x0 + g, y0 + s + ext);
        } else {
          ctx.moveTo(x0 + s - g, y0 - ext);
          ctx.lineTo(x0 + s - g, y0 + s + ext);
        }
      }
    }
    ctx.stroke();
  }
  const hasOf = (cells) => {
    const set = new Set(cells.map(([r, c]) => r * 64 + c));
    return (r, c) => set.has(r * 64 + c);
  };

  // ブロック1つ。outer は外側（1色のブロックはその色）、inner は内側の色（1色なら null）。lift はつかんで持ち上げた量（0〜1）
  function drawBlock(ctx, cells, x, y, s, outer, inner, alpha, lift) {
    const has = hasOf(cells);
    const g = Math.max(1.5, s * 0.045);
    const P = PAL[outer] || PAL.R;
    ctx.save();
    ctx.globalAlpha = alpha;
    // かげ
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 + lift * 0.12).toFixed(3) + ')';
    shapePath(ctx, has, cells, x + lift * 2, y + s * 0.06 + lift * 6, s, g);
    ctx.fill();
    const by = y - lift * 4;
    shapePath(ctx, has, cells, x, by, s, g);
    ctx.fillStyle = inner ? PAL[inner].fill : P.fill;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (inner) {
      // 外側の色の太い縁（その内側が内側の色）。縁の内側に細い暗い線を入れて、2色の境目を見せる
      edgeBands(ctx, has, cells, x, by, s, g, [0, 1, 2, 3], s * 0.2, 'rgba(0,0,0,0.38)');
      edgeBands(ctx, has, cells, x, by, s, g, [0, 1, 2, 3], s * 0.175, P.fill);
    }
    // 上の光と、下のかげ
    edgeBands(ctx, has, cells, x, by, s, g, [0], s * 0.07, 'rgba(255,255,255,0.38)');
    edgeBands(ctx, has, cells, x, by, s, g, [2], s * 0.08, 'rgba(0,0,0,0.2)');
    edgeBands(ctx, has, cells, x, by, s, g, [1, 3], s * 0.025, 'rgba(0,0,0,0.12)');
    ctx.restore();
    // 持ち上げているときの白いふち
    if (lift > 0.01) {
      ctx.globalAlpha = alpha * lift;
      shapePath(ctx, has, cells, x, by, s, g);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 動かない石（灰色）
  function drawStone(ctx, x, y, s) {
    const g = s * 0.05;
    ctx.fillStyle = '#2b2f52';
    ctx.beginPath();
    ctx.roundRect(x + g, y + g + 3, s - 2 * g, s - 2 * g, s * 0.12);
    ctx.fill();
    const grad = ctx.createLinearGradient(0, y, 0, y + s);
    grad.addColorStop(0, '#9aa0c4');
    grad.addColorStop(1, '#6b7199');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + g, y + g, s - 2 * g, s - 2 * g, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,80,0.55)';
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y + s * 0.22);
    ctx.lineTo(x + s * 0.42, y + s * 0.45);
    ctx.lineTo(x + s * 0.36, y + s * 0.62);
    ctx.moveTo(x + s * 0.42, y + s * 0.45);
    ctx.lineTo(x + s * 0.62, y + s * 0.52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(x + s * 0.16, y + s * 0.12, s * 0.5, s * 0.08, s * 0.04);
    ctx.fill();
  }

  // 出口の帯の並び [{ d: 向き, at: 始まりの列か行, len, col }]
  function exitRuns(sim) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const line = sim.exits[d];
      for (let k = 0; k < line.length; ) {
        if (!line[k]) {
          k++;
          continue;
        }
        let e = k;
        while (e < line.length && line[e] === line[k]) e++;
        out.push({ d, at: k, len: e - k, col: line[k] });
        k = e;
      }
    }
    return out;
  }

  // 出口の帯（壁の上に、外向きの矢印つき）。glow は明るさ（0 うすい 〜 1 明るい）
  function drawExit(ctx, L, W, H, run, glow) {
    const { C, T, left, top } = L;
    const P = PAL[run.col] || PAL.R;
    const out = 5; // 壁の外へのはみ出し
    let x;
    let y;
    let w;
    let h;
    if (run.d === 0 || run.d === 2) {
      x = left + run.at * C + 3;
      w = run.len * C - 6;
      y = run.d === 0 ? top - T - out : top + H * C;
      h = T + out;
    } else {
      y = top + run.at * C + 3;
      h = run.len * C - 6;
      x = run.d === 3 ? left - T - out : left + W * C;
      w = T + out;
    }
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * glow;
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 7);
    ctx.fill();
    ctx.fillStyle = P.fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    // 外向きの矢印（マスごとに1つ）
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k < run.len; k++) {
      const a = 5;
      if (run.d === 0 || run.d === 2) {
        const cx = left + (run.at + k + 0.5) * C;
        const cy = y + h / 2;
        const sgn = run.d === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(cx - a * 1.4, cy - sgn * a * 0.6);
        ctx.lineTo(cx, cy + sgn * a * 0.6);
        ctx.lineTo(cx + a * 1.4, cy - sgn * a * 0.6);
        ctx.stroke();
      } else {
        const cy = top + (run.at + k + 0.5) * C;
        const cx = x + w / 2;
        const sgn = run.d === 3 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(cx - sgn * a * 0.6, cy - a * 1.4);
        ctx.lineTo(cx + sgn * a * 0.6, cy);
        ctx.lineTo(cx - sgn * a * 0.6, cy + a * 1.4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBoard(ctx, sim, runs, dragColor, t) {
    const { C, T, left, top } = sim.L;
    const W = sim.W;
    const H = sim.H;
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // 壁
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(left - T + 3, top - T + 7, W * C + T * 2, H * C + T * 2, 16);
    ctx.fill();
    ctx.fillStyle = '#3a4280';
    ctx.beginPath();
    ctx.roundRect(left - T, top - T, W * C + T * 2, H * C + T * 2, 16);
    ctx.fill();
    ctx.strokeStyle = '#555fa8';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 床とマス
    ctx.fillStyle = '#10132c';
    ctx.fillRect(left, top, W * C, H * C);
    ctx.fillStyle = '#1b2049';
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (sim.stone[r * W + c]) continue;
        ctx.beginPath();
        ctx.roundRect(left + c * C + 4, top + r * C + 4, C - 8, C - 8, 8);
        ctx.fill();
      }
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (sim.stone[r * W + c]) drawStone(ctx, left + c * C, top + r * C, C);
    // 出口（つかんでいる間は、同じ色を明るく・ほかをうすく）
    const pulse = 0.5 + 0.5 * Math.sin(t / 6);
    for (const run of runs) {
      const glow = !dragColor ? 1 : run.col === dragColor ? 0.75 + 0.25 * pulse : 0.15;
      drawExit(ctx, sim.L, W, H, run, glow);
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const L = sim.L;
    const runs = exitRuns(sim);
    const view = sim.blocks.map((b) => ({ x: b.c, y: b.r, lift: 0 })); // 見た目の位置（マスの単位）と持ち上げの量
    let drag = null; // { id, ox, oy（ブロックの左上から指までのずれ）, denied（ふちで止まって音を出したか） }
    const fx = []; // 演出 { kind: 'exit' | 'peel' | 'spark', … , t }
    let pending = null;
    let t = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('のこり ' + sim.left() + '個');
    }

    // 出口の帯の、ブロックが通る所の真ん中（演出の位置。見た目の位置は遅れて追いつくので、sim の位置で決める）
    function exitPoint(b, d) {
      const cx = L.left + (b.c + b.w / 2) * L.C;
      const cy = L.top + (b.r + b.h / 2) * L.C;
      if (d === 0) return [cx, L.top - L.T / 2];
      if (d === 2) return [cx, L.top + sim.H * L.C + L.T / 2];
      if (d === 3) return [L.left - L.T / 2, cy];
      return [L.left + sim.W * L.C + L.T / 2, cy];
    }

    function handle(e) {
      const b = sim.blocks[e.id];
      switch (e.type) {
        case 'move':
          api.sound('slide');
          break;
        case 'exit': {
          // 見た目の位置から、出口の外まで滑らせる（見た目が sim の位置より遅れていれば、そのぶん長く動かす）
          const v = view[e.id];
          const lag = Math.max(0, (b.c - v.x) * DC[e.d] + (b.r - v.y) * DR[e.d]);
          const dist = lag + (e.d % 2 === 0 ? b.h : b.w) + 0.6;
          fx.push({ kind: 'exit', id: e.id, d: e.d, x: v.x, y: v.y, dist, col: e.color, t: 0 });
          const [px, py] = exitPoint(b, e.d);
          fx.push({ kind: 'spark', x: px, y: py, col: e.color, t: 0 });
          api.sound('out');
          drag = null;
          updateHud();
          break;
        }
        case 'peel': {
          // はがれた縁は出口の前（sim の位置）から出口へ吸いこまれる。ブロックの見た目もそこへ寄せる
          view[e.id].x = b.c;
          view[e.id].y = b.r;
          fx.push({ kind: 'peel', id: e.id, d: e.d, x: b.c, y: b.r, col: e.from, t: 0 });
          const [px, py] = exitPoint(b, e.d);
          fx.push({ kind: 'spark', x: px, y: py, col: e.from, t: 0 });
          api.sound('peel');
          drag = null;
          break;
        }
        case 'clear':
          pending = { clear: true, title: 'クリア！', message: '全部のブロックを出した（' + sim.moves + '手）', delay: 600 };
          break;
      }
    }

    function flush() {
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
    }

    function step() {
      t++;
      sim.blocks.forEach((b, i) => {
        const v = view[i];
        v.x += (b.c - v.x) * EASE;
        v.y += (b.r - v.y) * EASE;
        if (Math.abs(b.c - v.x) < 0.002) v.x = b.c;
        if (Math.abs(b.r - v.y) < 0.002) v.y = b.r;
        const want = drag && drag.id === i ? 1 : 0;
        v.lift += (want - v.lift) * 0.35;
      });
      for (let n = fx.length - 1; n >= 0; n--) {
        const f = fx[n];
        f.t++;
        const life = f.kind === 'exit' ? EXIT_T : f.kind === 'peel' ? PEEL_T : 22;
        if (f.t >= life) fx.splice(n, 1);
      }
      if (pending && !fx.length) {
        api.finish(pending);
        pending = null;
      }
    }

    function render(ctx) {
      const dragColor = drag ? sim.color(drag.id) : null;
      drawBoard(ctx, sim, runs, dragColor, t);
      const { C, left, top } = L;
      // ブロック（つかんでいるものは、いちばん手前）
      const order = sim.blocks.filter((b) => !b.out).sort((a, b) => (drag && a.id === drag.id ? 1 : 0) - (drag && b.id === drag.id ? 1 : 0));
      for (const b of order) {
        const v = view[b.id];
        const inner = b.colors.length === 2 && b.layer === 0 ? b.colors[1] : null;
        drawBlock(ctx, b.cells, left + v.x * C, top + v.y * C, C, sim.color(b.id), inner, 1, v.lift);
      }
      // 出ていくブロックと、はがれた外側
      for (const f of fx) {
        const b = sim.blocks[f.id];
        if (f.kind === 'exit') {
          const k = f.t / EXIT_T;
          const x = left + (f.x + DC[f.d] * f.dist * k * k) * C;
          const y = top + (f.y + DR[f.d] * f.dist * k * k) * C;
          drawBlock(ctx, b.cells, x, y, C, f.col, null, 1 - k * k, 0);
        } else if (f.kind === 'peel') {
          const k = f.t / PEEL_T;
          const x = left + (f.x + DC[f.d] * 0.9 * k) * C;
          const y = top + (f.y + DR[f.d] * 0.9 * k) * C;
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.9;
          const has = hasOf(b.cells);
          const g = Math.max(1.5, C * 0.045);
          shapePath(ctx, has, b.cells, x, y, C, g);
          ctx.strokeStyle = PAL[f.col].fill;
          ctx.lineWidth = C * 0.17;
          ctx.stroke();
          ctx.restore();
        } else if (f.kind === 'spark') {
          const k = f.t / 22;
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = PAL[f.col].light;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (let n = 0; n < 8; n++) {
            const a = (n / 8) * Math.PI * 2 + 0.3;
            const d0 = 8 + k * 26;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0);
            ctx.lineTo(f.x + Math.cos(a) * (d0 + 9), f.y + Math.sin(a) * (d0 + 9));
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // 指の位置でつかむブロック（マスの上か、マスのすぐそば）
    function pickAt(x, y) {
      const cell = sim.cellAt(x, y);
      if (cell && sim.blockAt(cell[0], cell[1]) >= 0) return sim.blockAt(cell[0], cell[1]);
      let best = -1;
      let bestD = GRAB * L.C;
      for (const b of sim.blocks) {
        if (b.out) continue;
        for (const [dr, dc] of b.cells) {
          const x0 = L.left + (b.c + dc) * L.C;
          const y0 = L.top + (b.r + dr) * L.C;
          const dx = Math.max(x0 - x, 0, x - (x0 + L.C));
          const dy = Math.max(y0 - y, 0, y - (y0 + L.C));
          const dd = Math.hypot(dx, dy);
          if (dd < bestD) {
            bestD = dd;
            best = b.id;
          }
        }
      }
      return best;
    }

    function pointerDown(x, y) {
      if (sim.state !== 'play' || drag) return;
      const id = pickAt(x, y);
      if (id < 0 || !sim.beginDrag(id)) return;
      const b = sim.blocks[id];
      drag = { id, ox: x - (L.left + b.c * L.C), oy: y - (L.top + b.r * L.C), denied: false };
      api.sound('tap');
    }

    function pointerMove(x, y) {
      if (!drag) return;
      const res = sim.follow((y - drag.oy - L.top) / L.C, (x - drag.ox - L.left) / L.C);
      const moved = res.some((k) => k !== 'edge' && k !== 'blocked');
      flush();
      if (!drag) return; // 出た・はがれた
      // ふちで止まった（出口が無い・色や幅が合わない）ときは、ふちに当たるたびに1回だけ音を出す
      if (moved) drag.denied = false;
      if (res[res.length - 1] === 'edge' && !drag.denied) {
        drag.denied = true;
        api.sound('deny');
      }
    }

    function pointerUp() {
      sim.endDrag();
      drag = null;
      flush();
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#171a33';
    ctx.fillRect(0, 0, 96, 96);
    const s = 18;
    const left = 12;
    const top = 22;
    ctx.fillStyle = '#3a4280';
    ctx.beginPath();
    ctx.roundRect(left - 6, top - 6, 4 * s + 12, 3 * s + 12, 8);
    ctx.fill();
    ctx.fillStyle = '#10132c';
    ctx.fillRect(left, top, 4 * s, 3 * s);
    // 上の赤い出口
    ctx.fillStyle = PAL.R.fill;
    ctx.beginPath();
    ctx.roundRect(left + s + 2, top - 9, 2 * s - 4, 9, 3);
    ctx.fill();
    // 右の青い出口
    ctx.fillStyle = PAL.B.fill;
    ctx.beginPath();
    ctx.roundRect(left + 4 * s, top + s + 2, 9, s - 4, 3);
    ctx.fill();
    drawBlock(ctx, [[0, 0], [1, 0]], left, top + s, s, 'Y', null, 1, 0);
    drawBlock(ctx, [[0, 0], [0, 1]], left + 2 * s, top + s, s, 'B', null, 1, 0);
    drawBlock(ctx, [[0, 0]], left + 3 * s, top + 2 * s, s, 'G', null, 1, 0);
    // 出口から出ていく赤いブロック
    drawBlock(ctx, [[0, 0], [0, 1], [1, 0]], left + s, top - 2 * s + 6, s, 'R', null, 0.9, 0);
  }

  KG.registerGame({
    id: 'slide',
    title: '色のブロックを出す',
    cardTitle: ['色のブロックを', '出す'],
    desc: 'ブロックを滑らせて、同じ色の出口から全部出す',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
