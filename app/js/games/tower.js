// 塔登りの見た目（塔・勇者・敵・薬・罠の描画、部屋のタップ、音と演出）。動きと判定は tower-sim.js が持つ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.towerSim;
  const LEVELS = KG.towerLevels;
  const TAU = Math.PI * 2;

  const HEADER = 150; // 上の帯（ボタンと文字の下地）
  const GROUND = 880; // 地面の高さ（塔のいちばん下）
  const TOP_LIMIT = 250; // 塔のてっぺんの床がこれより上に来ないようにする（屋根を描く場所）
  const TX = 318; // 塔の真ん中
  const TW = 336; // 塔の中の幅（その階の部屋の幅の合計）
  const WALL = 12; // 外壁の厚さ
  const SLAB = 10; // 床の厚さ
  const START_X = 72; // 勇者が最初に立つ地面の位置
  const FIG = 80; // 人の大きさ（頭のてっぺんまで 0.74 倍）
  const BOSS_FIG = 108;
  const HERO = { body: '#1f5fd1', head: '#4b8df8', badge: '#1f5fd1' };
  const FOE = { body: '#c62828', head: '#f0524f', badge: '#c62828' };
  const ITEM_BADGE = { '+': '#2e9d4c', '×': '#c98a00', '−': '#6a1b9a' };
  const FAIL_TEXT = {
    lose: '自分より強い敵に挑んでしまった',
    even: '同じ強さの敵には勝てない',
    zero: '罠で強さが0になった',
    stuck: '鍵が足りず、もう進めない',
  };

  // 人（勇者も敵も同じ形）。(x, y) は足もと。face は向き（1 右・-1 左）
  function drawFigure(ctx, x, y, s, col, o) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, 0.08 * s);
    ctx.strokeStyle = col.body;
    ctx.beginPath();
    ctx.moveTo(x - 0.05 * s, y - 0.22 * s);
    ctx.lineTo(x - 0.07 * s, y);
    ctx.moveTo(x + 0.05 * s, y - 0.22 * s);
    ctx.lineTo(x + 0.07 * s, y);
    ctx.moveTo(x - 0.1 * s, y - 0.46 * s);
    ctx.lineTo(x - 0.2 * s, y - 0.3 * s);
    ctx.moveTo(x + 0.1 * s, y - 0.46 * s);
    ctx.lineTo(x + 0.2 * s, y - 0.3 * s);
    ctx.stroke();
    ctx.fillStyle = col.body;
    ctx.beginPath();
    ctx.ellipse(x, y - 0.36 * s, 0.13 * s, 0.17 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col.head;
    ctx.beginPath();
    ctx.arc(x, y - 0.62 * s, 0.12 * s, 0, TAU);
    ctx.fill();
    // 目
    const f = o.face;
    ctx.fillStyle = '#fff';
    for (const dx of [0.01, 0.07]) {
      ctx.beginPath();
      ctx.arc(x + f * dx * s, y - 0.64 * s, 0.026 * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#111';
    for (const dx of [0.02, 0.08]) {
      ctx.beginPath();
      ctx.arc(x + f * dx * s, y - 0.64 * s, 0.012 * s, 0, TAU);
      ctx.fill();
    }
    if (o.sword) {
      ctx.strokeStyle = '#d7dee2';
      ctx.lineWidth = Math.max(1.5, 0.05 * s);
      ctx.beginPath();
      ctx.moveTo(x + f * 0.2 * s, y - 0.3 * s);
      ctx.lineTo(x + f * 0.36 * s, y - 0.66 * s);
      ctx.stroke();
      ctx.strokeStyle = '#ffcc33';
      ctx.beginPath();
      ctx.moveTo(x + f * 0.17 * s, y - 0.4 * s);
      ctx.lineTo(x + f * 0.29 * s, y - 0.34 * s);
      ctx.stroke();
    }
    if (o.horns) {
      ctx.fillStyle = '#3e2723';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * 0.04 * s, y - 0.72 * s);
        ctx.lineTo(x + side * 0.13 * s, y - 0.86 * s);
        ctx.lineTo(x + side * 0.11 * s, y - 0.68 * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (o.crown) {
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath();
      ctx.moveTo(x - 0.12 * s, y - 0.72 * s);
      ctx.lineTo(x - 0.13 * s, y - 0.88 * s);
      ctx.lineTo(x - 0.06 * s, y - 0.8 * s);
      ctx.lineTo(x, y - 0.92 * s);
      ctx.lineTo(x + 0.06 * s, y - 0.8 * s);
      ctx.lineTo(x + 0.13 * s, y - 0.88 * s);
      ctx.lineTo(x + 0.12 * s, y - 0.72 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 薬（丸いびん）
  function drawPotion(ctx, x, y, s) {
    ctx.fillStyle = '#d7f5e1';
    ctx.fillRect(x - 0.05 * s, y - 0.5 * s, 0.1 * s, 0.14 * s);
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(x - 0.065 * s, y - 0.56 * s, 0.13 * s, 0.07 * s);
    ctx.fillStyle = '#e8f7ee';
    ctx.beginPath();
    ctx.arc(x, y - 0.2 * s, 0.19 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#43c463';
    ctx.beginPath();
    ctx.arc(x, y - 0.2 * s, 0.16 * s, 0, Math.PI);
    ctx.fill();
  }

  // 倍の薬（金色の星）
  function drawStar(ctx, x, y, s) {
    const cy = y - 0.32 * s;
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#b07800';
    ctx.lineWidth = Math.max(1, 0.03 * s);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.1 * s : 0.24 * s;
      const px = x + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 罠（床のとげ）
  function drawSpikes(ctx, x, y, s) {
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x - 0.3 * s, y - 0.05 * s, 0.6 * s, 0.05 * s);
    ctx.fillStyle = '#b0bec5';
    ctx.strokeStyle = '#455a64';
    ctx.lineWidth = Math.max(1, 0.02 * s);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 0.12 * s - 0.06 * s, y - 0.05 * s);
      ctx.lineTo(x + i * 0.12 * s, y - 0.3 * s);
      ctx.lineTo(x + i * 0.12 * s + 0.06 * s, y - 0.05 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // 鍵（金色の輪と軸と歯）。(x, y) は足もと
  function drawKey(ctx, x, y, s) {
    const cy = y - 0.3 * s;
    const left = x - 0.2 * s;
    ctx.save();
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#b07800';
    ctx.lineWidth = Math.max(1, 0.025 * s);
    ctx.beginPath();
    ctx.rect(left + 0.12 * s, cy - 0.035 * s, 0.3 * s, 0.07 * s);
    ctx.rect(left + 0.34 * s, cy + 0.035 * s, 0.05 * s, 0.09 * s);
    ctx.rect(left + 0.24 * s, cy + 0.035 * s, 0.05 * s, 0.06 * s);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(left + 0.06 * s, cy, 0.1 * s, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a3a32';
    ctx.beginPath();
    ctx.arc(left + 0.06 * s, cy, 0.045 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // 錠前つきの部屋の鉄格子と、左上の金色の錠前（鍵で開く印。まだ登れない階の灰色の錠前とは色で分ける）。中身は格子の向こうに見えるまま
  function drawBars(ctx, rr) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,16,14,0.25)';
    ctx.fillRect(rr.x0 + 4, rr.y0 + 4, rr.w - 8, rr.y1 - rr.y0 - 4);
    ctx.strokeStyle = '#78858d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const n = Math.max(3, Math.round(rr.w / 26));
    for (let i = 1; i < n; i++) {
      const x = rr.x0 + (rr.w * i) / n;
      ctx.moveTo(x, rr.y0 + 6);
      ctx.lineTo(x, rr.y1);
    }
    ctx.stroke();
    const x = rr.x0 + 18;
    const y = rr.y0 + 14;
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y - 3, 6.5, Math.PI, 0);
    ctx.lineTo(x + 6.5, y + 2);
    ctx.moveTo(x - 6.5, y + 2);
    ctx.lineTo(x - 6.5, y - 3);
    ctx.stroke();
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#b07800';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 10, y, 20, 15, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.arc(x, y + 6, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - 1, y + 7, 2, 5);
    ctx.restore();
  }

  // 錠前（まだ入れない階の印）。(x, y) は真ん中
  function drawLock(ctx, x, y) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - 4, 8, Math.PI, 0);
    ctx.lineTo(x + 8, y + 2);
    ctx.moveTo(x - 8, y + 2);
    ctx.lineTo(x - 8, y - 4);
    ctx.stroke();
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.roundRect(x - 12, y, 24, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(x - 1.5, y + 5, 3, 7);
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const F = sim.floors;
    const FH = Math.min(128, Math.floor((GROUND - TOP_LIMIT) / F)); // 1階ぶんの高さ
    const fx = [];
    const hasKeys = sim.rooms.some((r) => r.kind === 'key'); // 鍵のある面だけ、上の帯に鍵の数も出す
    let lastHud = '';
    let heroGone = false; // 負けて消えた

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      const text = '強さ ' + sim.power + (hasKeys ? '　鍵 ' + sim.keys : '');
      if (text === lastHud) return;
      lastHud = text;
      api.setHud(text);
    }

    const floorTop = (f) => GROUND - f * FH;
    const floorBottom = (f) => GROUND - (f - 1) * FH; // その階の床の下の端

    function roomRect(r) {
      const w = TW / r.cols;
      const x0 = TX - TW / 2 + r.col * w;
      return { x0, x1: x0 + w, y0: floorTop(r.floor), y1: floorBottom(r.floor) - SLAB, cx: x0 + w / 2, w };
    }

    // 部屋の中では勇者を左寄り、中身（敵・薬・罠）を右寄りに置く
    function spread(r) {
      return Math.min(40, roomRect(r).w * 0.2);
    }
    function heroSpot(r) {
      if (!r) return { x: START_X, y: GROUND };
      const rr = roomRect(r);
      return { x: rr.cx - spread(r), y: rr.y1 };
    }
    function contentSpot(r) {
      const rr = roomRect(r);
      return { x: rr.cx + spread(r), y: rr.y1 };
    }

    function heroPos() {
      if (sim.move) {
        const a = heroSpot(sim.move.from);
        const b = heroSpot(sim.move.to);
        const k = sim.move.t / SIM.MOVE_STEPS;
        const e = k * k * (3 - 2 * k);
        const df = Math.abs(sim.move.to.floor - (sim.move.from ? sim.move.from.floor : 0));
        const h = 26 + 18 * df;
        return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - h * Math.sin(Math.PI * k) };
      }
      const p = heroSpot(sim.at);
      if (sim.fight) p.x += Math.max(0, Math.sin(sim.fight.t * 0.55)) * 8;
      return p;
    }

    function roomAt(x, y) {
      for (const r of sim.rooms) {
        const rr = roomRect(r);
        if (x >= rr.x0 && x < rr.x1 && y >= rr.y0 && y < rr.y1 + SLAB) return r;
      }
      return null;
    }

    function drawBackground(ctx) {
      ctx.fillStyle = '#14162b';
      ctx.fillRect(0, 0, KG.W, HEADER);
      const sky = ctx.createLinearGradient(0, HEADER, 0, GROUND);
      sky.addColorStop(0, '#6fb6f2');
      sky.addColorStop(1, '#d9efff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, HEADER, KG.W, GROUND - HEADER);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [cx, cy, r] of [[70, 230, 26], [104, 222, 20], [440, 300, 22], [470, 292, 16]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#8fcf8a';
      ctx.beginPath();
      ctx.moveTo(0, GROUND);
      ctx.quadraticCurveTo(110, GROUND - 120, 240, GROUND);
      ctx.quadraticCurveTo(400, GROUND - 90, KG.W, GROUND);
      ctx.fill();
      ctx.fillStyle = '#5cb85c';
      ctx.fillRect(0, GROUND, KG.W, KG.H - GROUND);
      ctx.fillStyle = '#4aa64a';
      ctx.fillRect(0, GROUND, KG.W, 8);
    }

    function drawTower(ctx, t) {
      const top = floorTop(F);
      const left = TX - TW / 2;
      // 屋根と旗
      ctx.fillStyle = '#b23b3b';
      ctx.beginPath();
      ctx.moveTo(left - WALL - 20, top);
      ctx.lineTo(TX, top - 66);
      ctx.lineTo(TX + TW / 2 + WALL + 20, top);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(TX - 2, top - 100, 4, 36);
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath();
      ctx.moveTo(TX + 2, top - 100);
      ctx.lineTo(TX + 30, top - 92 + Math.sin(t * 0.08) * 2);
      ctx.lineTo(TX + 2, top - 82);
      ctx.closePath();
      ctx.fill();
      // 外壁
      ctx.fillStyle = '#9c7b5b';
      ctx.fillRect(left - WALL, top, TW + WALL * 2, GROUND - top);
      // 部屋と床
      for (const r of sim.rooms) {
        const rr = roomRect(r);
        const open = r.floor <= sim.maxFloor + 1;
        ctx.fillStyle = open ? '#4a3a32' : '#2f2521';
        ctx.fillRect(rr.x0 + 4, rr.y0 + 4, rr.w - 8, rr.y1 - rr.y0 - 4);
      }
      ctx.fillStyle = '#7a5c45';
      for (let f = 1; f <= F; f++) ctx.fillRect(left - WALL, floorBottom(f) - SLAB, TW + WALL * 2, SLAB);
      // 入口
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(left - WALL, floorBottom(1) - SLAB - 70, WALL, 70);
    }

    function drawContent(ctx, r, t) {
      if (r.done) return;
      const p = contentSpot(r);
      if (sim.fight && sim.fight.room === r) p.x -= Math.max(0, Math.sin(sim.fight.t * 0.55 + 1.6)) * 6;
      if (r.kind === 'enemy') drawFigure(ctx, p.x, p.y, FIG, FOE, { face: -1, horns: true });
      else if (r.kind === 'boss') drawFigure(ctx, p.x, p.y, BOSS_FIG, FOE, { face: -1, horns: true, crown: true });
      else if (r.kind === 'key') drawKey(ctx, p.x, p.y + Math.sin(t * 0.1) * 2, FIG);
      else if (r.op === '+') drawPotion(ctx, p.x, p.y, FIG);
      else if (r.op === '×') drawStar(ctx, p.x, p.y + Math.sin(t * 0.1) * 2, FIG);
      else drawSpikes(ctx, p.x, p.y, FIG);
    }

    function contentBadge(ctx, r) {
      if (r.done) return;
      const p = contentSpot(r);
      if (r.kind === 'enemy' || r.kind === 'boss') {
        const s = r.kind === 'boss' ? BOSS_FIG : FIG;
        KG.drawBadge(ctx, p.x, p.y - s * 0.9 - 4, String(r.v), FOE.badge, r.kind === 'boss' ? 22 : 18);
      } else if (r.kind === 'key') {
        KG.drawBadge(ctx, p.x, p.y - FIG * 0.62, '鍵', '#9a6b00', 18);
      } else {
        KG.drawBadge(ctx, p.x, p.y - FIG * 0.62, r.op + r.v, ITEM_BADGE[r.op], 18);
      }
    }

    function drawSparks(ctx, t) {
      if (!sim.fight) return;
      const a = heroSpot(sim.at);
      const b = contentSpot(sim.fight.room);
      const x = (a.x + b.x) / 2;
      const y = a.y - FIG * 0.4;
      ctx.strokeStyle = 'rgba(255,240,160,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = ((t * 37 + i * 61) % 360) * (Math.PI / 180);
        const r2 = 10 + ((t + i * 7) % 5) * 3;
        ctx.moveTo(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4);
        ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
      }
      ctx.stroke();
    }

    function drawFx(ctx) {
      for (const f of fx) {
        ctx.save();
        if (f.kind === 'poof') {
          const k = f.t / 24;
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#eceff1';
          for (let i = 0; i < 6; i++) {
            const a = (i * TAU) / 6;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * 22 * k, f.y + Math.sin(a) * 14 * k, 9 * (1 - k * 0.5), 0, TAU);
            ctx.fill();
          }
        } else {
          const k = f.t / f.life;
          ctx.globalAlpha = 1 - k * k;
          ctx.font = f.font;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          const y = f.y - f.t * f.rise;
          ctx.strokeText(f.text, f.x, y);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, y);
        }
        ctx.restore();
      }
    }

    function floatText(text, color, x, y) {
      fx.push({ kind: 'text', text, color, x, y, t: 0, life: 45, rise: 1.2, font: '900 32px system-ui, -apple-system, sans-serif' });
    }

    function handle(e) {
      switch (e.type) {
        case 'move':
          api.sound('tap');
          break;
        case 'win': {
          const p = contentSpot(e.room);
          fx.push({ kind: 'poof', x: p.x, y: p.y - 30, t: 0 });
          const h = heroSpot(sim.at);
          floatText('+' + e.room.v, '#7cff8a', h.x, h.y - 110);
          api.sound('poof');
          api.sound('up');
          break;
        }
        case 'item': {
          const h = heroSpot(sim.at);
          const good = e.room.op !== '−';
          floatText(e.room.op + e.room.v, good ? '#7cff8a' : '#ff6b6b', h.x, h.y - 110);
          api.sound(good ? 'up' : 'down');
          break;
        }
        case 'key': {
          const h = heroSpot(sim.at);
          floatText('鍵 +1', '#ffcc33', h.x, h.y - 110);
          api.sound('coin');
          break;
        }
        case 'unlock':
          api.sound('pin');
          break;
        case 'clear':
          api.finish({ clear: true, title: 'クリア！', message: () => 'てっぺんの敵を倒した（強さ ' + sim.power + '）', delay: 900 });
          break;
        case 'fail': {
          // 鍵が足りずに詰んだときは、負けたわけではないので勇者を消さない
          if (e.reason === 'stuck') {
            api.sound('down');
          } else {
            const h = heroPos();
            fx.push({ kind: 'poof', x: h.x, y: h.y - 30, t: 0 });
            heroGone = true;
            api.sound('poof');
          }
          api.finish({ clear: false, title: '失敗', message: FAIL_TEXT[e.reason], delay: 1000 });
          break;
        }
      }
    }

    function step() {
      sim.step();
      if (sim.fight && sim.fight.t % 9 === 1) api.sound('hit');
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
      updateHud();
      for (let i = fx.length - 1; i >= 0; i--) {
        fx[i].t++;
        if (fx[i].t >= (fx[i].life || 24)) fx.splice(i, 1);
      }
    }

    function render(ctx) {
      const t = sim.t;
      drawBackground(ctx);
      drawTower(ctx, t);
      // 入れる部屋をうっすら光らせる
      if (sim.state === 'play') {
        ctx.strokeStyle = 'rgba(255,230,120,' + (0.35 + 0.25 * Math.sin(t * 0.1)).toFixed(3) + ')';
        ctx.lineWidth = 3;
        for (const r of sim.rooms) {
          if (r.done || !sim.canEnter(r)) continue;
          const rr = roomRect(r);
          ctx.strokeRect(rr.x0 + 6, rr.y0 + 6, rr.w - 12, rr.y1 - rr.y0 - 8);
        }
      }
      for (const r of sim.rooms) drawContent(ctx, r, t);
      for (const r of sim.rooms) if (r.locked) drawBars(ctx, roomRect(r));
      // まだ入れない階は暗くし、左の端の下寄りに錠前の印を出す（中身と数字は見えるまま。先の計画を立てられるように）。
      // 下寄りなのは、錠前つきの部屋の左上に出す金色の錠前と重ならないようにするため
      for (let f = sim.maxFloor + 2; f <= F; f++) {
        ctx.fillStyle = 'rgba(10,10,30,0.45)';
        ctx.fillRect(TX - TW / 2, floorTop(f), TW, FH - SLAB);
        drawLock(ctx, TX - TW / 2 + 24, floorTop(f) + (FH - SLAB) - 30);
      }
      if (!heroGone) {
        const h = heroPos();
        drawFigure(ctx, h.x, h.y, FIG, HERO, { face: 1, sword: true });
      }
      drawSparks(ctx, t);
      for (const r of sim.rooms) contentBadge(ctx, r);
      if (!heroGone) {
        const h = heroPos();
        KG.drawBadge(ctx, h.x, h.y - FIG * 0.9 - 4, String(sim.power), HERO.badge, 20);
      }
      drawFx(ctx);
    }

    function pointerDown(x, y) {
      if (sim.state !== 'play') return;
      const r = roomAt(x, y);
      if (!r) return;
      if (sim.canEnter(r)) {
        sim.tap(r.id);
      } else if (r.floor > sim.maxFloor + 1) {
        fx.push({ kind: 'text', text: 'まだ登れない', color: '#fff', x, y, t: 0, life: 50, rise: 0.4, font: '800 24px system-ui, -apple-system, sans-serif' });
      } else if (r.locked && sim.keys === 0) {
        fx.push({ kind: 'text', text: '鍵が要る', color: '#ffcc33', x, y, t: 0, life: 50, rise: 0.4, font: '800 24px system-ui, -apple-system, sans-serif' });
      }
    }

    return { step, render, pointerDown, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 96);
    sky.addColorStop(0, '#6fb6f2');
    sky.addColorStop(1, '#d9efff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#5cb85c';
    ctx.fillRect(0, 84, 96, 12);
    ctx.fillStyle = '#b23b3b';
    ctx.beginPath();
    ctx.moveTo(18, 22);
    ctx.lineTo(48, 4);
    ctx.lineTo(78, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9c7b5b';
    ctx.fillRect(22, 22, 52, 62);
    ctx.fillStyle = '#4a3a32';
    ctx.fillRect(26, 26, 44, 24);
    ctx.fillRect(26, 56, 44, 24);
    drawFigure(ctx, 58, 49, 26, FOE, { face: -1, horns: true });
    drawFigure(ctx, 38, 79, 26, HERO, { face: 1, sword: true });
    KG.drawBadge(ctx, 58, 30, '8', FOE.badge, 9);
    KG.drawBadge(ctx, 38, 60, '12', HERO.badge, 9);
  }

  KG.registerGame({
    id: 'tower',
    title: '強さの数字で塔を登る',
    cardTitle: ['強さの', '数字で', '塔を登る'],
    desc: '自分より弱い敵を倒して強くなり、塔を登る',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
