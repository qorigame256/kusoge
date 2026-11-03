// 数字ゲートの見た目（奥行きのある道・兵隊・門の描画、なぞる操作、音と演出）。動きと判定は gate-sim.js が持つ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.gateSim;
  const LEVELS = KG.gateLevels;
  const TAU = Math.PI * 2;

  // 奥行きの見せ方: 地面の上の点（x, z, 高さ h）は、カメラからの距離 d = z − camZ を使って
  //   画面の x = 270 + KX·x / d、画面の y = HORIZON + (KY − KX·h) / d に描く（高さ KY/KX ≈ 9.3 m から水平に見るカメラ）。
  const HEADER = 150; // 上の帯（ボタンと文字の下地。明るい空の上では文字が読みにくいため）
  const HORIZON = 250;
  const KX = 440;
  const KY = 4080;
  const CAM_BACK = 8; // カメラは群れの 8 m 後ろ（群れは画面の y ≈ 760 に来る）
  const NEAR = 5.2; // これより手前は画面の下にはみ出すので描かない
  const FAR = 140;
  const ROAD_W = 4.4; // 描く道の半分の幅（群れが動ける範囲より少し広く）
  const PX_PER_M = 55; // なぞった長さの換算（群れのいる距離での 1 m の画面上の長さ）
  const SOLDIER_MAX = 150; // 1つの群れで描く兵隊の数の上限（数字はそのまま）
  const BLUE = { body: '#1f5fd1', head: '#4b8df8', badge: '#1f5fd1' };
  const RED = { body: '#c62828', head: '#f0524f', badge: '#c62828' };

  // 群れの中の並び（ひまわりの種の並び方）。人数ごとに1回だけ計算し、奥から描く順に並べておく
  const formationCache = new Map();
  function formation(m) {
    let f = formationCache.get(m);
    if (f) return f;
    f = [];
    for (let i = 0; i < m; i++) {
      const r = Math.sqrt((i + 0.5) / m);
      const a = i * 2.39996;
      f.push({ u: r * Math.cos(a), w: r * Math.sin(a) * 0.5, ph: (i * 1.7) % TAU });
    }
    f.sort((p, q) => q.w - p.w);
    formationCache.set(m, f);
    return f;
  }

  function badge(ctx, x, y, text, bg, size) {
    ctx.font = '900 ' + size.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    const w = ctx.measureText(text).width + size * 0.9;
    const h = size * 1.3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h + 2, w, h, h * 0.4);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, h * 0.4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + size * 0.06);
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const fx = [];
    let camZ = sim.z - CAM_BACK;
    let lastCount = -1;
    let dragging = false;
    let px0 = 0;
    let tx0 = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      if (sim.count === lastCount) return;
      lastCount = sim.count;
      api.setHud('兵隊 ' + sim.count);
    }

    function proj(x, z, h) {
      const d = z - camZ;
      if (d < NEAR) return null;
      return { x: 270 + (KX * x) / d, y: HORIZON + (KY - KX * h) / d, s: KX / d, d };
    }

    // 道の上の、x が xa〜xb・z が za〜zc の四角
    function quad(ctx, xa, xb, za, zc, color) {
      const p1 = proj(xa, za, 0);
      const p2 = proj(xb, za, 0);
      const p3 = proj(xb, zc, 0);
      const p4 = proj(xa, zc, 0);
      if (!p1 || !p4) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }

    function drawGround(ctx) {
      ctx.fillStyle = '#14162b';
      ctx.fillRect(0, 0, KG.W, HEADER);
      const sky = ctx.createLinearGradient(0, HEADER, 0, HORIZON);
      sky.addColorStop(0, '#79c2ff');
      sky.addColorStop(1, '#dcf1ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, HEADER, KG.W, HORIZON - HEADER);
      ctx.fillStyle = '#5cb85c';
      ctx.fillRect(0, HORIZON, KG.W, KG.H - HORIZON);
      const BAND = 5;
      const z0 = camZ + NEAR + 0.001; // ちょうど NEAR だと、計算の端数で proj が「手前すぎ」と判断し、いちばん手前の帯が抜ける
      const z1 = camZ + FAR;
      for (let zb = Math.floor(z0 / BAND) * BAND; zb < z1; zb += BAND) {
        const za = Math.max(zb, z0);
        const zc = Math.min(zb + BAND, z1);
        const odd = Math.floor(zb / BAND) & 1;
        const n = proj(0, za, 0);
        const f = proj(0, zc, 0);
        if (odd && n && f) {
          ctx.fillStyle = '#53ad53';
          ctx.fillRect(0, f.y, KG.W, n.y - f.y + 0.5);
        }
        quad(ctx, -ROAD_W, ROAD_W, za, zc, odd ? '#9ba4ae' : '#a9b2bc');
        quad(ctx, -ROAD_W - 0.4, -ROAD_W, za, zc, odd ? '#e53935' : '#f5f5f5');
        quad(ctx, ROAD_W, ROAD_W + 0.4, za, zc, odd ? '#e53935' : '#f5f5f5');
      }
      // 進み具合
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(40, 136, 460, 6);
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(40, 136, 460 * Math.min(1, sim.z / level.length), 6);
    }

    function drawFinish(ctx) {
      const L = level.length;
      const cols = 8;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2; j++) {
          const xa = -ROAD_W + (i * 2 * ROAD_W) / cols;
          const xb = xa + (2 * ROAD_W) / cols;
          quad(ctx, xa, xb, L - 0.6 + j * 0.6, L + j * 0.6, (i + j) & 1 ? '#222' : '#fafafa');
        }
      }
    }

    function drawCastle(ctx) {
      const p = proj(0, level.length + 26, 0);
      if (!p || p.d > FAR) return;
      const s = p.s;
      const rect = (x, h, w, hh, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(p.x + (x - w / 2) * s, p.y - (h + hh) * s, w * s, hh * s);
      };
      rect(0, 0, 12, 3.6, '#9e9e9e');
      for (let i = -5; i <= 5; i += 2) rect(i, 3.6, 1, 0.8, '#9e9e9e');
      rect(-6.5, 0, 2.4, 6, '#8a8a8a');
      rect(6.5, 0, 2.4, 6, '#8a8a8a');
      rect(0, 0, 2.6, 2.4, '#5d4037');
      for (const x of [-6.5, 6.5]) {
        ctx.fillStyle = '#6d6d6d';
        ctx.beginPath();
        ctx.moveTo(p.x + (x - 1.5) * s, p.y - 6 * s);
        ctx.lineTo(p.x + x * s, p.y - 8.4 * s);
        ctx.lineTo(p.x + (x + 1.5) * s, p.y - 6 * s);
        ctx.fill();
        ctx.fillStyle = '#e53935';
        ctx.fillRect(p.x + x * s, p.y - 10 * s, 1.2 * s, 0.7 * s);
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(p.x + x * s - 0.05 * s, p.y - 10 * s, 0.1 * s, 1.8 * s);
      }
    }

    function drawSoldier(ctx, q, ph, t, running, col) {
      const s = q.s;
      const swing = running ? Math.sin(t * 0.45 + ph) * 0.1 * s : 0;
      const bob = running ? Math.abs(Math.sin(t * 0.45 + ph)) * 0.04 * s : 0;
      const y = q.y - bob;
      ctx.lineWidth = Math.max(1, 0.08 * s);
      ctx.strokeStyle = col.body;
      ctx.beginPath();
      ctx.moveTo(q.x - 0.05 * s, y - 0.22 * s);
      ctx.lineTo(q.x - 0.05 * s + swing, y);
      ctx.moveTo(q.x + 0.05 * s, y - 0.22 * s);
      ctx.lineTo(q.x + 0.05 * s - swing, y);
      ctx.stroke();
      ctx.fillStyle = col.body;
      ctx.beginPath();
      ctx.ellipse(q.x, y - 0.36 * s, 0.13 * s, 0.17 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col.head;
      ctx.beginPath();
      ctx.arc(q.x, y - 0.62 * s, 0.12 * s, 0, TAU);
      ctx.fill();
    }

    function drawCrowd(ctx, cx, cz, n, col, t, running) {
      if (n <= 0) return;
      const m = Math.min(n, SOLDIER_MAX);
      const R = SIM.crowdRadius(n);
      ctx.lineCap = 'round';
      for (const p of formation(m)) {
        const q = proj(cx + p.u * R, cz + p.w * R, 0);
        if (q && q.d < FAR) drawSoldier(ctx, q, p.ph, t, running, col);
      }
    }

    function crowdBadge(ctx, cx, cz, n, col, big) {
      const R = SIM.crowdRadius(n);
      const q = proj(cx, cz, 1.0 + R * 0.25);
      if (!q || q.d > 90) return;
      badge(ctx, q.x, q.y, String(n), col.badge, Math.max(13, Math.min(big ? 44 : 34, 0.55 * q.s * (big ? 1.3 : 1))));
    }

    // 通り過ぎた列は描かない（残すと群れより手前に来て、群れの上に重なるため。通った合図は浮かぶ文字と音）
    function drawGateRow(ctx, row) {
      if (row.passed) return;
      for (const g of row.gates) {
        const a = proj(g.x1 + 0.12, row.z, 2.3);
        const b = proj(g.x2 - 0.12, row.z, 0.1);
        if (!a || !b || a.d > FAR) continue;
        ctx.save();
        ctx.fillStyle = g.good ? 'rgba(56,160,255,0.45)' : 'rgba(255,72,72,0.45)';
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        const pw = Math.max(2, 0.14 * a.s);
        ctx.fillStyle = g.good ? '#1d6fd6' : '#c62828';
        ctx.fillRect(a.x - pw / 2, a.y, pw, b.y - a.y);
        ctx.fillRect(b.x - pw / 2, a.y, pw, b.y - a.y);
        ctx.fillRect(a.x - pw / 2, a.y - pw / 2, b.x - a.x + pw, pw);
        const size = 0.95 * a.s;
        if (size >= 7) {
          ctx.font = '900 ' + size.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2, size * 0.16);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.strokeText(g.label, (a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.fillStyle = '#fff';
          ctx.fillText(g.label, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        ctx.restore();
      }
    }

    function drawSparks(ctx, t) {
      const e = sim.battle;
      if (!e) return;
      const ez = e.boss ? e.z + 3 : e.z;
      const q = proj((sim.x + e.x) / 2, (sim.z + ez) / 2, 0.4);
      if (!q) return;
      ctx.strokeStyle = 'rgba(255,240,160,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = ((t * 37 + i * 61) % 360) * (Math.PI / 180);
        const r1 = 0.2 * q.s;
        const r2 = (0.5 + ((t + i * 7) % 5) * 0.12) * q.s;
        ctx.moveTo(q.x + Math.cos(a) * r1, q.y + Math.sin(a) * r1 * 0.6);
        ctx.lineTo(q.x + Math.cos(a) * r2, q.y + Math.sin(a) * r2 * 0.6);
      }
      ctx.stroke();
    }

    function drawFx(ctx) {
      const me = proj(sim.x, sim.z, 0);
      for (const f of fx) {
        if (f.kind !== 'text' || !me) continue;
        const k = f.t / 45;
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        ctx.font = '900 46px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        const y = me.y - 150 - f.t * 1.4;
        ctx.strokeText(f.text, me.x, y);
        ctx.fillStyle = f.good ? '#7cff8a' : '#ff6b6b';
        ctx.fillText(f.text, me.x, y);
        ctx.restore();
      }
    }

    function handle(e) {
      switch (e.type) {
        case 'start':
          api.sound('tap');
          break;
        case 'gate':
          fx.push({ kind: 'text', text: e.gate.label, good: e.gate.good, t: 0 });
          api.sound(e.gate.good ? 'up' : 'down');
          break;
        case 'hit':
          api.sound('hit');
          break;
        case 'battleEnd':
          if (e.win && !e.boss) api.sound('poof');
          break;
        case 'clear':
          api.finish({ clear: true, title: 'クリア！', message: () => '残った兵隊 ' + sim.count + ' 人', delay: 900 });
          break;
        case 'fail': {
          const msg = e.reason === 'zero' ? '兵隊が0人になった' : e.boss ? 'ゴールの敵より兵隊が少なかった' : '途中の赤い群れに負けた';
          api.finish({ clear: false, title: '失敗', message: msg, delay: 1000 });
          break;
        }
      }
    }

    function step() {
      sim.step();
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
      updateHud();
      for (let i = fx.length - 1; i >= 0; i--) {
        fx[i].t++;
        if (fx[i].t >= 45) fx.splice(i, 1);
      }
    }

    function render(ctx) {
      const t = sim.t;
      camZ = sim.z - CAM_BACK;
      drawGround(ctx);
      drawCastle(ctx);
      const running = sim.state === 'run';
      // 奥のものから順に描く
      const items = [];
      for (const row of sim.rows) items.push({ z: row.z, draw: () => drawGateRow(ctx, row) });
      for (const e of sim.enemies) {
        if (e.n > 0) items.push({ z: e.z, draw: () => drawCrowd(ctx, e.x, e.z, e.n, RED, t, false) });
      }
      items.push({ z: level.length + 3, draw: () => drawCrowd(ctx, 0, level.length + 3, sim.boss.n, RED, t, false) });
      items.push({ z: level.length, draw: () => drawFinish(ctx) });
      items.push({ z: sim.z, draw: () => drawCrowd(ctx, sim.x, sim.z, sim.count, BLUE, t, running) });
      items.sort((a, b) => b.z - a.z);
      for (const it of items) it.draw();
      drawSparks(ctx, t);
      // 数字の札はいちばん上に
      for (const e of sim.enemies) if (e.n > 0 && !e.done) crowdBadge(ctx, e.x, e.z, e.n, RED, false);
      if (sim.boss.n > 0) crowdBadge(ctx, 0, level.length + 3, sim.boss.n, RED, true);
      if (sim.count > 0) crowdBadge(ctx, sim.x, sim.z, sim.count, BLUE, false);
      drawFx(ctx);
      if (sim.state === 'ready') {
        ctx.save();
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 0.12);
        ctx.font = '800 30px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeText('さわるとスタート', 270, 880);
        ctx.fillStyle = '#fff';
        ctx.fillText('さわるとスタート', 270, 880);
        ctx.restore();
      }
    }

    function pointerDown(x) {
      if (sim.state === 'ready') sim.start();
      dragging = true;
      px0 = x;
      tx0 = sim.targetX;
    }

    function pointerMove(x) {
      if (dragging) sim.setTargetX(tx0 + (x - px0) / PX_PER_M);
    }

    function pointerUp() {
      dragging = false;
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 34);
    sky.addColorStop(0, '#79c2ff');
    sky.addColorStop(1, '#dcf1ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 96, 34);
    ctx.fillStyle = '#5cb85c';
    ctx.fillRect(0, 34, 96, 62);
    ctx.fillStyle = '#a9b2bc';
    ctx.beginPath();
    ctx.moveTo(40, 34);
    ctx.lineTo(56, 34);
    ctx.lineTo(96, 96);
    ctx.lineTo(0, 96);
    ctx.closePath();
    ctx.fill();
    const gate = (x, w, c, label) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, 40, w, 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, 50.5);
    };
    gate(25, 23, '#3aa0ff', '×2');
    gate(48, 23, '#ff4848', '−5');
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const r = 9 * Math.sqrt((i + 0.5) / 14);
      const x = 48 + r * Math.cos(a);
      const y = 84 + r * Math.sin(a) * 0.5;
      ctx.fillStyle = '#1f5fd1';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 2.2, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4b8df8';
      ctx.beginPath();
      ctx.arc(x, y - 7.5, 2, 0, TAU);
      ctx.fill();
    }
  }

  KG.registerGame({
    id: 'gate',
    title: '数字ゲート',
    desc: '門をくぐって兵隊を増やし、ゴールの敵の群れより多くする',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
