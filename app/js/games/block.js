// ブロックを置いて列を消すの見た目（描画・指で運ぶ操作・音と演出）。盤・ブロック・列が消える決まりと勝ち負けは block-sim.js が持つ。
// sim は置いた瞬間に列を消し終える。ここでは消えたマスが縮んで消える様子・氷のかけら・取れた宝石が浮いていく様子を描く。
// 受け皿の下には、このあと出るブロックを出る順に3つずつ区切って並べる（何がいくつ残っているかが見えるように）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.blockSim;
  const LEVELS = KG.blockLevels;
  const L = SIM.LAYOUT;
  const N = SIM.N;
  const C = L.C;
  const TAU = Math.PI * 2;
  // 置くブロックの色（ブロックの番号で決まるので、やり直しても同じ色）。宝石の桃色・土の茶色・氷の水色とまぎれない色にする
  const COLORS = ['#ffcc33', '#4fa8ff', '#6fd16f', '#ff8a3d', '#b07cff', '#36cfc0'];
  const FAIL_TEXT = { nospace: 'ブロックを置ける所が無い', nopiece: 'ブロックを全部置いても宝石が残った' };
  const PICK = 5; // つかんだブロックが、受け皿の大きさから盤の大きさになるまでの刻み
  const BACK = 8; // 置けなかったブロックが受け皿へ戻る刻み
  const VANISH = 16; // 消えたマスが縮んで消える刻み
  const UPCOMING_Y = 862; // このあと出るブロックの列の真ん中の高さ（その 46 上に見出しを書く）
  const UPCOMING_W = 500; // このあと出るブロックの列の幅の上限
  const UPCOMING_U = 11; // このあと出るブロックの1マスの上限（縦5マスのブロックが見出しにかからない大きさ）

  const cellX = (c) => L.left + c * C;
  const cellY = (r) => L.top + r * C;

  // 置いたブロックのマス
  function drawTile(ctx, x, y, s, color) {
    const k = s / C;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(x + 2 * k, y + 4 * k, s - 4 * k, s - 4 * k, 9 * k);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 2 * k, y + 2 * k, s - 4 * k, s - 4 * k, 9 * k);
    ctx.fill();
    // 上の光と、下のかげ
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.roundRect(x + 8 * k, y + 6 * k, s - 16 * k, 8 * k, 4 * k);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.roundRect(x + 6 * k, y + s - 15 * k, s - 12 * k, 8 * k, 4 * k);
    ctx.fill();
  }

  // 最初からある土のブロック。i（マスの番号）で決まる小石の模様を入れる
  function drawDirt(ctx, x, y, s, i) {
    const k = s / C;
    ctx.fillStyle = '#5e3b1d';
    ctx.beginPath();
    ctx.roundRect(x + 2 * k, y + 2 * k, s - 4 * k, s - 4 * k, 7 * k);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, '#c48c55');
    g.addColorStop(1, '#9a6535');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x + 4 * k, y + 4 * k, s - 8 * k, s - 9 * k, 6 * k);
    ctx.fill();
    ctx.fillStyle = 'rgba(94,59,29,0.55)';
    for (let n = 0; n < 3; n++) {
      const h = (i * 37 + n * 101) % 97;
      const px = x + (10 + ((h * 7) % 30)) * k;
      const py = y + (11 + ((h * 13) % 28)) * k;
      ctx.beginPath();
      ctx.arc(px, py, (2 + (h % 3)) * k, 0, TAU);
      ctx.fill();
    }
  }

  // 宝石（桃色のカットした石）。(cx, cy) が真ん中
  function drawGem(ctx, cx, cy, s, alpha) {
    const w = s * 0.62;
    const h = s * 0.56;
    const top = cy - h * 0.42;
    const mid = cy - h * 0.12;
    const bot = cy + h * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, top);
    ctx.lineTo(cx + w * 0.3, top);
    ctx.lineTo(cx + w / 2, mid);
    ctx.lineTo(cx, bot);
    ctx.lineTo(cx - w / 2, mid);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx, top, cx, bot);
    g.addColorStop(0, '#ffb3d6');
    g.addColorStop(0.45, '#ff4f9a');
    g.addColorStop(1, '#b0145a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,0,40,0.55)';
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.stroke();
    // 面の筋
    ctx.strokeStyle = 'rgba(255,230,242,0.7)';
    ctx.lineWidth = Math.max(1, s * 0.022);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, mid);
    ctx.lineTo(cx + w / 2, mid);
    ctx.moveTo(cx - w * 0.12, top);
    ctx.lineTo(cx - w * 0.2, mid);
    ctx.lineTo(cx, bot);
    ctx.moveTo(cx + w * 0.12, top);
    ctx.lineTo(cx + w * 0.2, mid);
    ctx.lineTo(cx, bot);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.24, top + h * 0.05);
    ctx.lineTo(cx - w * 0.08, top + h * 0.05);
    ctx.lineTo(cx - w * 0.28, mid - h * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 氷（ブロックの上にかぶさった、水色の透けた板）。下の宝石が見えるよう、うすく塗って縁と光の筋で氷と分かるようにする
  function drawIce(ctx, x, y, s) {
    const k = s / C;
    ctx.fillStyle = 'rgba(170,225,255,0.38)';
    ctx.beginPath();
    ctx.roundRect(x + 1 * k, y + 1 * k, s - 2 * k, s - 2 * k, 8 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,246,255,0.95)';
    ctx.lineWidth = 3 * k;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 7 * k, y + 17 * k);
    ctx.lineTo(x + 17 * k, y + 7 * k);
    ctx.moveTo(x + 37 * k, y + 47 * k);
    ctx.lineTo(x + 47 * k, y + 37 * k);
    ctx.stroke();
  }

  // ブロック1つ（形の左上を (x, y) に、1マス s で）
  function drawPiece(ctx, piece, x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [dr, dc] of piece.cells) drawTile(ctx, x + dc * s, y + dr * s, s, color);
    ctx.restore();
  }

  function drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // 盤
    const pad = 9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(L.left - pad + 3, L.top - pad + 6, N * C + pad * 2, N * C + pad * 2, 18);
    ctx.fill();
    ctx.fillStyle = '#10132c';
    ctx.beginPath();
    ctx.roundRect(L.left - pad, L.top - pad, N * C + pad * 2, N * C + pad * 2, 18);
    ctx.fill();
    ctx.strokeStyle = '#3a4280';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#1f2550';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        ctx.beginPath();
        ctx.roundRect(cellX(c) + 3, cellY(r) + 3, C - 6, C - 6, 7);
        ctx.fill();
      }
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    let drag = null; // つかんでいるブロック { slot, id, x, y（指の位置）, k（0〜1。受け皿の大きさ → 盤の大きさ） }
    let back = null; // 受け皿へ戻っていくブロック { slot, id, x, y（形の真ん中）, s（1マス）, t }
    const fx = []; // 演出 { kind: 'vanish' | 'shard' | 'gem', … , t }
    let pending = null;
    let t = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('宝石 のこり ' + sim.gemsLeft());
    }

    function handle(e) {
      switch (e.type) {
        case 'place':
          api.sound('put');
          break;
        case 'lines':
          for (const m of e.removed) {
            const r = Math.floor(m.i / N);
            const c = m.i % N;
            fx.push({ kind: 'vanish', x: cellX(c), y: cellY(r), i: m.i, owner: m.owner, t: 0 });
          }
          for (const i of e.cracked.concat(e.removed.filter((m) => m.ice).map((m) => m.i))) {
            const cx = cellX(i % N) + C / 2;
            const cy = cellY(Math.floor(i / N)) + C / 2;
            for (let n = 0; n < 5; n++) {
              const a = (n / 5) * TAU + 0.4;
              fx.push({ kind: 'shard', x: cx, y: cy, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2 - 2, a, t: 0 });
            }
          }
          for (const i of e.gems) fx.push({ kind: 'gem', x: cellX(i % N) + C / 2, y: cellY(Math.floor(i / N)) + C / 2, t: 0 });
          api.sound('line');
          if (e.cracked.length || e.removed.some((m) => m.ice)) api.sound('crack');
          if (e.gems.length) api.sound('coin');
          updateHud();
          break;
        case 'deny':
          api.sound('deny');
          break;
        case 'fail':
          pending = { clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: 700 };
          break;
        case 'clear':
          pending = { clear: true, title: 'クリア！', message: '宝石を全部取った（' + sim.moves + '手）', delay: 900 };
          break;
      }
    }

    function flush() {
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
    }

    function step() {
      t++;
      if (drag) drag.k = Math.min(1, drag.k + 1 / PICK);
      if (back && ++back.t >= BACK) back = null;
      for (let n = fx.length - 1; n >= 0; n--) {
        const f = fx[n];
        f.t++;
        if (f.kind === 'shard') {
          f.x += f.vx;
          f.y += f.vy;
          f.vy += 0.35;
        } else if (f.kind === 'gem') {
          f.y -= 2.2;
        }
        const life = f.kind === 'vanish' ? VANISH : f.kind === 'shard' ? 24 : 42;
        if (f.t >= life) fx.splice(n, 1);
      }
      if (pending && !fx.length && !back) {
        api.finish(pending);
        pending = null;
      }
    }

    // 運んでいるブロックの左上の画面の位置（盤の大きさのとき）
    function dragOrigin(piece) {
      return [drag.x - (piece.w * C) / 2, drag.y - L.lift - piece.h * C];
    }

    // 運んでいるブロックを置く所 { r, c, ok, lines }（盤から大きく外れていれば null）
    function target() {
      if (!drag) return null;
      const piece = sim.pieces[drag.id];
      const [r, c] = SIM.dropCell(piece, drag.x, drag.y);
      if (r < -1 || c < -1 || r + piece.h > N + 1 || c + piece.w > N + 1) return null;
      const ok = sim.canPlace(drag.slot, r, c);
      return { r, c, ok, lines: ok ? sim.linesIf(drag.slot, r, c) : null };
    }

    function render(ctx) {
      drawBackground(ctx);
      const tg = target();
      // 置くと消える行と列を明るくする
      const lit = new Uint8Array(N * N);
      if (tg && tg.ok) {
        for (const k of tg.lines.rows) for (let j = 0; j < N; j++) lit[k * N + j] = 1;
        for (const k of tg.lines.cols) for (let j = 0; j < N; j++) lit[j * N + k] = 1;
      }
      const glow = 0.5 + 0.5 * Math.sin(t / 5);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const i = r * N + c;
          const x = cellX(c);
          const y = cellY(r);
          if (sim.cells[i]) {
            if (sim.owner[i] >= 0) drawTile(ctx, x, y, C, COLORS[sim.owner[i] % COLORS.length]);
            else drawDirt(ctx, x, y, C, i);
            if (sim.gem[i]) drawGem(ctx, x + C / 2, y + C / 2, C);
            if (sim.cells[i] === 2) drawIce(ctx, x, y, C);
          }
          if (lit[i]) {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.16 + glow * 0.14).toFixed(3) + ')';
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 2, C - 4, C - 4, 8);
            ctx.fill();
          }
        }
      }
      // 置く所の下見
      if (tg && tg.ok) {
        const piece = sim.pieces[drag.id];
        drawPiece(ctx, piece, cellX(tg.c), cellY(tg.r), C, COLORS[drag.id % COLORS.length], 0.4);
      }
      // 消えたマス・氷のかけら・取れた宝石
      for (const f of fx) {
        if (f.kind === 'vanish') {
          const k = f.t / VANISH;
          const s = C * (1 - k * 0.7);
          const x = f.x + (C - s) / 2;
          const y = f.y + (C - s) / 2;
          ctx.save();
          ctx.globalAlpha = 1 - k;
          if (f.owner >= 0) drawTile(ctx, x, y, s, COLORS[f.owner % COLORS.length]);
          else drawDirt(ctx, x, y, s, f.i);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)).toFixed(3) + ')';
          ctx.beginPath();
          ctx.roundRect(x + 2, y + 2, s - 4, s - 4, 8 * (s / C));
          ctx.fill();
          ctx.restore();
        }
      }
      for (const f of fx) {
        if (f.kind === 'shard') {
          ctx.save();
          ctx.globalAlpha = 1 - f.t / 24;
          ctx.translate(f.x, f.y);
          ctx.rotate(f.a + f.t * 0.2);
          ctx.fillStyle = '#dff6ff';
          ctx.beginPath();
          ctx.moveTo(-6, -4);
          ctx.lineTo(7, 0);
          ctx.lineTo(-4, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (f.kind === 'gem') {
          const k = f.t / 42;
          drawGem(ctx, f.x, f.y, C * (1 + k * 0.3), 1 - k * k);
          // きらめき
          ctx.strokeStyle = 'rgba(255,240,250,' + (1 - k).toFixed(3) + ')';
          ctx.lineWidth = 2;
          for (let n = 0; n < 4; n++) {
            const a = (n / 4) * TAU + f.t * 0.08;
            const d = 18 + f.t * 0.6;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
            ctx.lineTo(f.x + Math.cos(a) * (d + 6), f.y + Math.sin(a) * (d + 6));
            ctx.stroke();
          }
        }
      }
      drawTray(ctx);
      drawUpcoming(ctx);
      // つかんでいるブロックと、戻っていくブロック（いちばん手前）
      if (drag) {
        const piece = sim.pieces[drag.id];
        const k = drag.k * drag.k * (3 - 2 * drag.k);
        const s = L.trayCell + (C - L.trayCell) * k;
        const [ox, oy] = dragOrigin(piece);
        const cx = L.trayX[drag.slot] + (ox + (piece.w * C) / 2 - L.trayX[drag.slot]) * k;
        const cy = L.trayY + (oy + (piece.h * C) / 2 - L.trayY) * k;
        drawPiece(ctx, piece, cx - (piece.w * s) / 2, cy - (piece.h * s) / 2, s, COLORS[drag.id % COLORS.length], tg && !tg.ok ? 0.75 : 0.95);
      }
      if (back) {
        const piece = sim.pieces[back.id];
        const k = back.t / BACK;
        const e = k * k * (3 - 2 * k);
        const s = back.s + (L.trayCell - back.s) * e;
        const cx = back.x + (L.trayX[back.slot] - back.x) * e;
        const cy = back.y + (L.trayY - back.y) * e;
        drawPiece(ctx, piece, cx - (piece.w * s) / 2, cy - (piece.h * s) / 2, s, COLORS[back.id % COLORS.length], 0.95);
      }
    }

    // 受け皿（3つの置き場）。置ける所が盤に無いブロックはうすく描く
    function drawTray(ctx) {
      for (let k = 0; k < SIM.TRAY; k++) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(L.trayX[k] - L.trayHalfW + 8, L.trayY - L.trayHalfH + 10, L.trayHalfW * 2 - 16, L.trayHalfH * 2 - 20, 16);
        ctx.fill();
        const id = sim.tray[k];
        if (id < 0 || (drag && drag.slot === k) || (back && back.slot === k)) continue;
        const piece = sim.pieces[id];
        const s = L.trayCell;
        const alpha = sim.state === 'play' && !sim.fits(id) ? 0.3 : 1;
        drawPiece(ctx, piece, L.trayX[k] - (piece.w * s) / 2, L.trayY - (piece.h * s) / 2, s, COLORS[id % COLORS.length], alpha);
      }
    }

    // このあと出るブロック（出る順に、受け皿へ出る3つずつ区切る）
    function drawUpcoming(ctx) {
      const ids = [];
      for (let id = sim.next; id < sim.pieces.length; id++) ids.push(id);
      ctx.fillStyle = '#a3a8cf';
      ctx.font = '700 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!ids.length) {
        ctx.fillText('このあと出るブロックは無い', KG.W / 2, UPCOMING_Y);
        return;
      }
      ctx.fillText('このあと出るブロック（あと ' + ids.length + ' 個）', KG.W / 2, UPCOMING_Y - 46);
      const GAP = 10;
      const SEP = 26;
      const widthAt = (u) => ids.reduce((w, id, n) => w + sim.pieces[id].w * u + (n ? (n % 3 === 0 ? SEP : GAP) : 0), 0);
      const u = Math.min(UPCOMING_U, (UPCOMING_U * UPCOMING_W) / widthAt(UPCOMING_U));
      let x = KG.W / 2 - widthAt(u) / 2;
      ids.forEach((id, n) => {
        if (n) {
          if (n % 3 === 0) {
            ctx.strokeStyle = 'rgba(163,168,207,0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + SEP / 2, UPCOMING_Y - 18);
            ctx.lineTo(x + SEP / 2, UPCOMING_Y + 18);
            ctx.stroke();
            x += SEP;
          } else x += GAP;
        }
        const piece = sim.pieces[id];
        drawPiece(ctx, piece, x, UPCOMING_Y - (piece.h * u) / 2, u, COLORS[id % COLORS.length], 0.85);
        x += piece.w * u;
      });
    }

    function pointerDown(x, y) {
      if (sim.state !== 'play' || drag) return;
      const slot = SIM.slotAt(x, y);
      if (slot < 0 || sim.tray[slot] < 0 || (back && back.slot === slot)) return;
      drag = { slot, id: sim.tray[slot], x, y, k: 0 };
      api.sound('tap');
    }

    function pointerMove(x, y) {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
    }

    function pointerUp(x, y) {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      const tg = target();
      const piece = sim.pieces[drag.id];
      if (tg && sim.place(drag.slot, tg.r, tg.c)) {
        drag = null;
        flush();
        return;
      }
      // 置けなかったブロックは受け皿へ戻す（盤の上で放したときだけ、置けない音を出す）
      if (tg) api.sound('deny');
      const k = drag.k;
      const [ox, oy] = dragOrigin(piece);
      back = {
        slot: drag.slot,
        id: drag.id,
        x: L.trayX[drag.slot] + (ox + (piece.w * C) / 2 - L.trayX[drag.slot]) * k,
        y: L.trayY + (oy + (piece.h * C) / 2 - L.trayY) * k,
        s: L.trayCell + (C - L.trayCell) * k,
        t: 0,
      };
      drag = null;
      sim.events.length = 0;
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#10132c';
    ctx.fillRect(0, 0, 96, 96);
    const s = 20;
    const ox = 8;
    const oy = 16;
    const map = ['##..', '#*.#', '####', '#.*#'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = ox + c * s;
        const y = oy + r * s;
        ctx.fillStyle = '#1f2550';
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, s - 2, s - 2, 3);
        ctx.fill();
        const ch = map[r][c];
        if (ch === '.') continue;
        if (r === 2) drawTile(ctx, x, y, s, COLORS[1]);
        else drawDirt(ctx, x, y, s, r * 8 + c);
        if (ch === '*') drawGem(ctx, x + s / 2, y + s / 2, s);
      }
    }
    // そろって光る行
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(ox, oy + 2 * s, 4 * s, s);
    // 運んでいる L 字のブロック
    ctx.save();
    ctx.translate(48, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(4, 6, 2 * s, s);
    drawTile(ctx, 0, 0, s, COLORS[0]);
    drawTile(ctx, s, 0, s, COLORS[0]);
    drawTile(ctx, s, s, s, COLORS[0]);
    ctx.restore();
  }

  KG.registerGame({
    id: 'block',
    title: 'ブロックを置いて列を消す',
    cardTitle: ['ブロックを', '置いて', '列を消す'],
    desc: 'ブロックを運んで列をそろえ、宝石を全部取り出す',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
