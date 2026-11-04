// ネジ外しの見た目（描画・タップ・音と演出）。ネジ・板・穴の決まりと勝ち負けは screw-sim.js が持つ。
// sim はタップした瞬間に板を落とし・ぶら下げ終える。ここでは板の見た目（vis）を振り子のように回し、落ちていく様子を描く。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.screwSim;
  const LEVELS = KG.screwLevels;
  const TAU = Math.PI * 2;
  const DOWN = Math.PI / 2; // 真下の向き（画面は下が +y）
  // 盤を置ける範囲と点の間の上限（tools/test-screw.js の AREA_W・AREA_H・CELL_MAX と揃える）
  const AREA_X = 24;
  const AREA_Y = 150;
  const AREA_W = 492;
  const AREA_H = 770;
  const CELL_MAX = 84;
  // 板の色。赤いネジとまぎれないよう、赤は使わない
  const WOOD = ['#f2a541', '#4fb0e8', '#7cc35a', '#a77de0', '#ef7fb0', '#3cc3b0', '#f0d24a', '#8fa3bf'];
  const SCREW = { '': ['#ffffff', '#c3cad3', '#7d8792'], r: ['#ffb3a8', '#ef4b3f', '#a3241c'] };
  const RING = { r: '#ef4b3f' };
  const FAIL_TEXT = { nohole: '外したネジを差せる穴が無い' };
  const SWING_K = 0.12; // 振り子の戻る強さ（1刻みあたり）
  // 振り子の止まりやすさ。横の板は 19 刻み（0.3 秒）、真上を向いた板は 32 刻み（0.5 秒）で止まる。揺れている間はタップを受け付けないので、長くしない
  const SWING_DAMP = 0.35;
  const FLY = 10; // ネジが穴へ飛んでいく刻み
  const TWIST = 8; // 差したネジが回る刻み

  function layout(level) {
    const S = Math.min(CELL_MAX, Math.floor(AREA_W / level.cols), Math.floor(AREA_H / level.rows));
    const w = S * level.cols;
    const h = S * level.rows;
    const left = Math.round(AREA_X + (AREA_W - w) / 2);
    const top = Math.round(AREA_Y + (AREA_H - h) / 2);
    // 点 (x, y) の画面の位置は (ox + x * S, oy + y * S)
    return { S, w, h, left, top, ox: left + S / 2, oy: top + S / 2 };
  }

  // 板（まっすぐな棒）。(ax, ay) から (bx, by) まで、太さ T。はしの穴は半径 hr で抜く（下のネジや穴が透けて見える）
  function plankPath(ctx, ax, ay, bx, by, T, hr) {
    const a = Math.atan2(by - ay, bx - ax);
    const r = T / 2;
    ctx.beginPath();
    ctx.arc(ax, ay, r, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(bx, by, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
    ctx.moveTo(ax + hr, ay);
    ctx.arc(ax, ay, hr, 0, TAU);
    ctx.moveTo(bx + hr, by);
    ctx.arc(bx, by, hr, 0, TAU);
  }

  function drawPlank(ctx, ax, ay, bx, by, T, hr, color) {
    ctx.save();
    plankPath(ctx, ax + 3, ay + 4, bx + 3, by + 4, T, hr);
    ctx.fillStyle = 'rgba(40,20,0,0.28)';
    ctx.fill('evenodd');
    plankPath(ctx, ax, ay, bx, by, T, hr);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 上側の光の筋
    const a = Math.atan2(by - ay, bx - ax);
    const nx = Math.cos(a - Math.PI / 2) * T * 0.28;
    const ny = Math.sin(a - Math.PI / 2) * T * 0.28;
    const d = Math.hypot(bx - ax, by - ay);
    if (d > hr * 3) {
      const ux = (bx - ax) / d;
      const uy = (by - ay) / d;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax + ux * hr * 1.8 + nx, ay + uy * hr * 1.8 + ny);
      ctx.lineTo(bx - ux * hr * 1.8 + nx, by - uy * hr * 1.8 + ny);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 穴（盤にあいた丸）。色つきの穴はまわりに色の輪
  function drawHole(ctx, x, y, S, color) {
    ctx.fillStyle = '#3b2716';
    ctx.beginPath();
    ctx.arc(x, y, S * 0.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,210,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 1, S * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (RING[color]) {
      ctx.strokeStyle = RING[color];
      ctx.lineWidth = Math.max(3, S * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, S * 0.29, 0, TAU);
      ctx.stroke();
    }
  }

  // ネジの頭。lift は持ち上げた高さ（0〜1）、spin は溝の向き
  function drawScrew(ctx, x, y, S, color, lift, spin) {
    const r = S * 0.2 * (1 + lift * 0.18);
    const up = lift * S * 0.16;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.3 - lift * 0.12).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x + 2 + lift * 4, y + 3 + lift * 6, r, 0, TAU);
    ctx.fill();
    const c = SCREW[color] || SCREW[''];
    const g = ctx.createRadialGradient(x - r * 0.35, y - up - r * 0.4, r * 0.1, x, y - up, r);
    g.addColorStop(0, c[0]);
    g.addColorStop(0.55, c[1]);
    g.addColorStop(1, c[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - up, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 十字の溝
    ctx.strokeStyle = 'rgba(40,45,55,0.75)';
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const a of [spin, spin + Math.PI / 2]) {
      ctx.moveTo(x - Math.cos(a) * r * 0.55, y - up - Math.sin(a) * r * 0.55);
      ctx.lineTo(x + Math.cos(a) * r * 0.55, y - up + Math.sin(a) * r * 0.55);
    }
    ctx.stroke();
  }

  function drawBoard(ctx, L, level) {
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // 木の板の盤
    const pad = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(L.left - pad + 4, L.top - pad + 6, L.w + pad * 2, L.h + pad * 2, 18);
    ctx.fill();
    const wg = ctx.createLinearGradient(0, L.top, 0, L.top + L.h);
    wg.addColorStop(0, '#e6bd84');
    wg.addColorStop(1, '#cf9d5f');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.roundRect(L.left - pad, L.top - pad, L.w + pad * 2, L.h + pad * 2, 18);
    ctx.fill();
    ctx.strokeStyle = '#9c6b35';
    ctx.lineWidth = 4;
    ctx.stroke();
    // 木目
    ctx.strokeStyle = 'rgba(150,95,40,0.18)';
    ctx.lineWidth = 2;
    for (let k = 1; k < level.rows * 2; k++) {
      const y = L.top + (k * L.h) / (level.rows * 2);
      ctx.beginPath();
      ctx.moveTo(L.left + 6, y);
      ctx.bezierCurveTo(L.left + L.w * 0.3, y - 4, L.left + L.w * 0.6, y + 4, L.left + L.w - 6, y);
      ctx.stroke();
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const L = layout(level);
    const S = L.S;
    const T = S * 0.5; // 板の太さ
    const HR = S * 0.17; // 板のはしの穴の半径
    const px = (x) => L.ox + x * S;
    const py = (y) => L.oy + y * S;
    // 板の見た目。still: sim の位置のまま／swing: 留まったはし (sx, sy) のまわりを角度 a で回る／fall: 中心 (cx, cy) が落ちていく
    const vis = sim.planks.map(() => ({ mode: 'still' }));
    const shake = {}; // 'p' + 板の番号 か 'h' + 穴の番号 → 揺れの残り刻み
    let fly = null; // 差しに飛んでいくネジ { screw, fromX, fromY, t }
    const twist = {}; // ネジの番号 → 差したあと回る残り刻み
    let liftT = 0; // 持ち上げたネジの浮き上がり（0〜1）
    let pending = null;
    let t = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('のこり ' + sim.left() + '枚');
    }

    // 板 i の見た目の両はし [ax, ay, bx, by]（画面の位置）
    function ends(i) {
      const k = sim.planks[i];
      const v = vis[i];
      const len = k.len * S;
      if (v.mode === 'swing') return [v.sx, v.sy, v.sx + Math.cos(v.a) * len, v.sy + Math.sin(v.a) * len];
      if (v.mode === 'fall') {
        const hx = (Math.cos(v.a) * len) / 2;
        const hy = (Math.sin(v.a) * len) / 2;
        return [v.cx - hx, v.cy - hy, v.cx + hx, v.cy + hy];
      }
      return [px(k.x0), py(k.y0), px(k.x1), py(k.y1)];
    }

    function busy() {
      return !!fly || vis.some((v) => v.mode === 'swing');
    }

    function handle(e) {
      switch (e.type) {
        case 'lift':
          liftT = 0;
          api.sound('unscrew');
          break;
        case 'swing': {
          // 回る前の形で、留まったはしからもう一方のはしへの角度
          const f = e.from;
          const piv = e.pivot;
          const other = f.x0 === piv.x && f.y0 === piv.y ? [f.x1, f.y1] : [f.x0, f.y0];
          let a = Math.atan2(other[1] - piv.y, other[0] - piv.x);
          // 真上を向いた板は、少し押して右回りに倒す
          const w = Math.abs(Math.sin(a - DOWN)) < 1e-6 ? 0.08 : 0;
          if (a < -DOWN) a += TAU; // 左向き（-π）は π として扱い、近い回り方で真下へ
          vis[e.plank] = { mode: 'swing', sx: px(piv.x), sy: py(piv.y), a, w };
          break;
        }
        case 'fall': {
          const [ax, ay, bx, by] = ends(e.plank);
          vis[e.plank] = { mode: 'fall', cx: (ax + bx) / 2, cy: (ay + by) / 2, a: Math.atan2(by - ay, bx - ax), vy: 0, w: (e.plank % 2 ? 1 : -1) * 0.025 };
          api.sound('plank');
          updateHud();
          break;
        }
        case 'place': {
          const h = sim.holes[e.from];
          fly = { screw: e.screw, fromX: px(h.x), fromY: py(h.y) - S * 0.16, t: 0 };
          break;
        }
        case 'deny':
          if (e.by >= 0) shake['p' + e.by] = 14;
          else if (e.hole >= 0) shake['h' + e.hole] = 14;
          api.sound('deny');
          break;
        case 'fail':
          pending = { clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: 700 };
          break;
        case 'clear':
          pending = { clear: true, title: 'クリア！', message: '全部の板を落とした（' + sim.moves + '手）', delay: 900 };
          break;
      }
    }

    function flush() {
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
    }

    function step() {
      t++;
      if (sim.held >= 0) liftT = Math.min(1, liftT + 0.2);
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i];
        if (v.mode === 'swing') {
          // 振り子: 真下へ戻ろうとし、少しずつ揺れが小さくなる
          v.w += -SWING_K * Math.sin(v.a - DOWN) - SWING_DAMP * v.w;
          v.a += v.w;
          if (Math.abs(v.a - DOWN) < 0.02 && Math.abs(v.w) < 0.01) vis[i] = { mode: 'still' };
        } else if (v.mode === 'fall') {
          v.vy += 0.9;
          v.cy += v.vy;
          v.a += v.w;
          if (v.cy - sim.planks[i].len * S > KG.H + 40) v.mode = 'gone';
        }
      }
      if (fly && ++fly.t >= FLY) {
        twist[fly.screw] = TWIST;
        fly = null;
        api.sound('screw');
      }
      for (const k in twist) if (--twist[k] <= 0) delete twist[k];
      for (const k in shake) if (--shake[k] <= 0) delete shake[k];
      if (pending && !busy() && !vis.some((v) => v.mode === 'fall' && v.cy < KG.H)) {
        api.finish(pending);
        pending = null;
      }
    }

    function shakeX(key) {
      const n = shake[key];
      return n ? Math.sin(n * 1.9) * 4 * (n / 14) : 0;
    }

    // ネジの見た目の位置と浮き上がり
    function screwPose(s) {
      if (fly && fly.screw === s.i) {
        const h = sim.holes[s.hole];
        const k = fly.t / FLY;
        const e = k * k * (3 - 2 * k);
        return { x: fly.fromX + (px(h.x) - fly.fromX) * e, y: fly.fromY + (py(h.y) - fly.fromY) * e - Math.sin(k * Math.PI) * S * 0.4, lift: 1 - k };
      }
      if (s.i === sim.held) {
        const h = sim.holes[sim.heldFrom];
        return { x: px(h.x), y: py(h.y) + Math.sin(t / 9) * 2 * liftT, lift: liftT };
      }
      const h = sim.holes[s.hole];
      return { x: px(h.x), y: py(h.y), lift: 0 };
    }

    function drawScrewOf(ctx, s) {
      const p = screwPose(s);
      const spin = 0.6 + (twist[s.i] ? (twist[s.i] / TWIST) * 1.6 : 0);
      drawScrew(ctx, p.x, p.y, S, s.color, p.lift, spin);
    }

    function render(ctx) {
      drawBoard(ctx, L, level);
      // 持っているネジを差せる穴は、明るい輪で知らせる
      const glow = 0.45 + 0.35 * Math.sin(t / 6);
      sim.holes.forEach((h, i) => {
        drawHole(ctx, px(h.x) + shakeX('h' + i), py(h.y), S, h.color);
        if (sim.state === 'play' && sim.held >= 0 && !fly && sim.canPlace(i)) {
          ctx.strokeStyle = 'rgba(120,255,140,' + glow.toFixed(3) + ')';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(px(h.x), py(h.y), S * 0.24, 0, TAU);
          ctx.stroke();
        }
      });
      // 重なりの順に描く: 何も留めていないネジ → 板 0 とそれを一番上で留めるネジ → 板 1 … （上の板ほどあとで描く）
      const byZ = sim.planks.map(() => []);
      const loose = [];
      for (const s of sim.screws) {
        if (s.i === sim.held || (fly && fly.screw === s.i)) continue;
        const z = sim.screwZ(s.i);
        if (z >= 0 && vis[z].mode !== 'fall' && vis[z].mode !== 'gone') byZ[z].push(s);
        else loose.push(s);
      }
      for (const s of loose) drawScrewOf(ctx, s);
      for (let i = 0; i < sim.planks.length; i++) {
        const v = vis[i];
        if (v.mode === 'fall' || v.mode === 'gone') continue;
        const [ax, ay, bx, by] = ends(i);
        const dx = shakeX('p' + i);
        drawPlank(ctx, ax + dx, ay, bx + dx, by, T, HR, WOOD[i % WOOD.length]);
        for (const s of byZ[i]) drawScrewOf(ctx, s);
      }
      // 落ちていく板は、いちばん手前に描く
      for (let i = 0; i < sim.planks.length; i++) {
        if (vis[i].mode !== 'fall') continue;
        const [ax, ay, bx, by] = ends(i);
        drawPlank(ctx, ax, ay, bx, by, T, HR, WOOD[i % WOOD.length]);
      }
      // 持っているネジと、飛んでいくネジ
      for (const s of sim.screws) if (s.i === sim.held || (fly && fly.screw === s.i)) drawScrewOf(ctx, s);
    }

    // いちばん近い点の番号（穴の一覧から、指の位置から S * 0.45 以内）
    function nearestHole(x, y) {
      let best = -1;
      let bd = S * 0.45;
      sim.holes.forEach((h, i) => {
        const d = Math.hypot(px(h.x) - x, py(h.y) - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    }

    function pointerDown(x, y) {
      if (sim.state !== 'play' || busy()) return;
      const hi = nearestHole(x, y);
      if (hi < 0) return;
      if (sim.held >= 0) sim.place(hi);
      else if (sim.screwAt[hi] >= 0) sim.lift(sim.screwAt[hi]);
      flush();
    }

    return { step, render, pointerDown, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#d9a86a';
    ctx.fillRect(0, 0, 96, 96);
    ctx.strokeStyle = 'rgba(150,95,40,0.25)';
    ctx.lineWidth = 2;
    for (const y of [18, 38, 58, 78]) {
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(92, y + 3);
      ctx.stroke();
    }
    drawHole(ctx, 72, 74, 44, '');
    drawPlank(ctx, 20, 26, 72, 26, 22, 7, WOOD[0]);
    drawPlank(ctx, 32, 34, 32, 80, 22, 7, WOOD[1]);
    drawScrew(ctx, 20, 26, 44, '', 0, 0.6);
    drawScrew(ctx, 32, 80, 44, '', 0, 0.2);
    drawScrew(ctx, 72, 26, 44, '', 1, 0.9); // 外して持ち上げたネジ
  }

  KG.registerGame({
    id: 'screw',
    title: 'ネジ外し',
    desc: 'ネジを外して別の穴へ差し替え、板を全部落とす',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
