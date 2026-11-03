// ピン抜きの見た目（描画・タップ・音と演出）。動きと判定は pinpull-sim.js が持つ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.pinpullSim;
  const LEVELS = KG.pinpullLevels;
  const TAU = Math.PI * 2;

  // 角の丸い四角を描く命令が無い古いブラウザ向けの代わり（角は丸めずに四角で描く）
  if (globalThis.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) {
      this.rect(x, y, w, h);
    };
  }

  // 失敗したときの結果画面の文
  const FAIL_TEXT = {
    lava: '溶岩が勇者に届いてしまった',
    monster: '敵が勇者のところへ来てしまった',
    nogold: '宝が足りなかった',
  };

  function lerpColor(a, b, k) {
    const r = Math.round(a[0] + (b[0] - a[0]) * k);
    const g = Math.round(a[1] + (b[1] - a[1]) * k);
    const bl = Math.round(a[2] + (b[2] - a[2]) * k);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  const HOT_RGB = [255, 122, 42];
  const STONE_RGB = [141, 138, 134];

  function circles(ctx, list, rr, dx, dy) {
    ctx.beginPath();
    for (const p of list) {
      const r = rr(p);
      ctx.moveTo(p.x + dx + r, p.y + dy);
      ctx.arc(p.x + dx, p.y + dy, r, 0, TAU);
    }
    ctx.fill();
  }

  function drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // 入れ物のガラス
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.beginPath();
    ctx.roundRect(48, 158, 444, 756, 18);
    ctx.fill();
  }

  function drawWalls(ctx, walls) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const w of walls) {
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
    }
    ctx.strokeStyle = '#2e2116';
    ctx.lineWidth = SIM.WALL_R * 2 + 4;
    ctx.stroke();
    ctx.strokeStyle = '#a57d50';
    ctx.lineWidth = SIM.WALL_R * 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawParticles(ctx, ps) {
    const stone = [];
    const hot = [];
    const water = [];
    const lava = [];
    const gold = [];
    for (const p of ps) {
      if (p.type === 'stone') (p.hot > 0 ? hot : stone).push(p);
      else if (p.type === 'water') water.push(p);
      else if (p.type === 'lava') lava.push(p);
      else if (p.type === 'gold') gold.push(p);
    }
    // 石
    ctx.fillStyle = '#5b5855';
    circles(ctx, stone, (p) => p.r * 1.2, 0, 1);
    ctx.fillStyle = '#8d8a86';
    circles(ctx, stone, (p) => p.r * 1.05, 0, 0);
    for (const p of hot) {
      ctx.fillStyle = lerpColor(STONE_RGB, HOT_RGB, p.hot / SIM.HOT_STEPS);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.15, 0, TAU);
      ctx.fill();
    }
    // 溶岩（光 → 本体 → 明るい芯）
    ctx.fillStyle = 'rgba(255,110,30,0.22)';
    circles(ctx, lava, () => 12, 0, 0);
    ctx.fillStyle = '#f2501a';
    circles(ctx, lava, (p) => p.r * 1.3, 0, 0);
    ctx.fillStyle = '#ffb13b';
    circles(ctx, lava, (p) => p.r * 0.55, 0, 0);
    // 水（大きめに描いて、つながった液体に見せる）
    ctx.fillStyle = '#2f86f0';
    circles(ctx, water, (p) => p.r * 1.35, 0, 0);
    ctx.fillStyle = 'rgba(190,230,255,0.55)';
    circles(ctx, water, () => 2.2, -2, -2.5);
    // 金貨
    ctx.fillStyle = '#9c6c0a';
    circles(ctx, gold, (p) => p.r, 0, 1.2);
    ctx.fillStyle = '#f6c419';
    circles(ctx, gold, (p) => p.r - 1.2, 0, 0);
    ctx.fillStyle = '#ffe680';
    circles(ctx, gold, (p) => p.r * 0.55, -1, -1);
    ctx.fillStyle = '#fffbe0';
    circles(ctx, gold, () => 2, -3.5, -3.5);
  }

  // 勇者（足もとが x, y）。mood: normal / happy / burned / beaten
  function drawHero(ctx, x, y, mood, t) {
    const burned = mood === 'burned';
    const beaten = mood === 'beaten';
    const happy = mood === 'happy';
    ctx.save();
    ctx.translate(x, y);
    if (happy) ctx.translate(0, -Math.abs(Math.sin(t * 0.18)) * 10);
    if (beaten) ctx.rotate(-0.5);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 5, 0, 0, TAU);
    ctx.fill();
    // 足
    ctx.fillStyle = burned ? '#1e1714' : '#4a3020';
    ctx.beginPath();
    ctx.ellipse(-7, -4, 6, 4.5, 0, 0, TAU);
    ctx.ellipse(7, -4, 6, 4.5, 0, 0, TAU);
    ctx.fill();
    // 腕
    ctx.strokeStyle = burned ? '#3a2a24' : '#ffd2a1';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) {
      ctx.moveTo(-12, -32);
      ctx.lineTo(-22, -52);
      ctx.moveTo(12, -32);
      ctx.lineTo(22, -52);
    } else {
      ctx.moveTo(-13, -30);
      ctx.lineTo(-18, -14);
      ctx.moveTo(13, -30);
      ctx.lineTo(18, -14);
    }
    ctx.stroke();
    // 体（青い服と赤い襟巻き）
    ctx.fillStyle = burned ? '#2c2421' : '#2f7de1';
    ctx.beginPath();
    ctx.roundRect(-14, -40, 28, 34, 9);
    ctx.fill();
    ctx.fillStyle = burned ? '#3a2622' : '#e8443a';
    ctx.beginPath();
    ctx.roundRect(-14, -41, 28, 7, 3);
    ctx.fill();
    // 頭
    ctx.fillStyle = burned ? '#4b3a33' : '#ffd9ae';
    ctx.beginPath();
    ctx.arc(0, -55, 15, 0, TAU);
    ctx.fill();
    // 髪
    ctx.fillStyle = burned ? '#1b1411' : '#7a4520';
    ctx.beginPath();
    ctx.arc(0, -57, 15.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(9, -63);
    ctx.lineTo(0, -60);
    ctx.lineTo(-9, -63);
    ctx.closePath();
    ctx.fill();
    // 顔
    ctx.strokeStyle = '#2a1a10';
    ctx.fillStyle = '#2a1a10';
    ctx.lineWidth = 2.2;
    if (burned || beaten) {
      ctx.beginPath();
      for (const ex of [-5.5, 5.5]) {
        ctx.moveTo(ex - 3, -57);
        ctx.lineTo(ex + 3, -51);
        ctx.moveTo(ex + 3, -57);
        ctx.lineTo(ex - 3, -51);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -45.5, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (happy) {
      ctx.beginPath();
      ctx.arc(-5.5, -53, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(8.5, -53);
      ctx.arc(5.5, -53, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -49, 5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-5.5, -54, 2.2, 0, TAU);
      ctx.arc(5.5, -54, 2.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -48, 3, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 敵（中心が x, y）。目は勇者のほうを見る
  function drawMonster(ctx, x, y, r, lookX, t, fade) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    const wob = Math.sin(t * 0.12) * 1.5;
    // 角
    ctx.fillStyle = '#e9e1cf';
    ctx.beginPath();
    ctx.moveTo(-14, -r + 6);
    ctx.lineTo(-20, -r - 10);
    ctx.lineTo(-6, -r + 2);
    ctx.moveTo(14, -r + 6);
    ctx.lineTo(20, -r - 10);
    ctx.lineTo(6, -r + 2);
    ctx.fill();
    // 体
    ctx.fillStyle = '#4b2a7a';
    ctx.beginPath();
    ctx.ellipse(0, 1, r + 1, r + wob * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7b4bd6';
    ctx.beginPath();
    ctx.ellipse(0, 0, r - 1.5, r - 2 + wob * 0.3, 0, 0, TAU);
    ctx.fill();
    // 目
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -5, 10, 0, TAU);
    ctx.fill();
    const look = Math.max(-1, Math.min(1, (lookX - x) / 120));
    ctx.fillStyle = '#d0213a';
    ctx.beginPath();
    ctx.arc(look * 4, -4, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(look * 4.5, -4, 2.4, 0, TAU);
    ctx.fill();
    // 口と牙
    ctx.strokeStyle = '#25103f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, 11);
    ctx.quadraticCurveTo(0, 16, 10, 11);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(-4.5, 18);
    ctx.lineTo(-2.5, 13);
    ctx.moveTo(7, 12);
    ctx.lineTo(4.5, 18);
    ctx.lineTo(2.5, 13);
    ctx.fill();
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ピン。輪のある端（x1, y1）の向きへ抜ける。抜いたあとは少しの間すべり出ながら消える
  function drawPin(ctx, p, t, pulse) {
    let ox = 0;
    let oy = 0;
    let alpha = 1;
    const len = Math.sqrt(p.len2);
    if (!p.active) {
      const age = t - p.pulledAt;
      if (age > 16) return;
      const k = age / 16;
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      ox = (-p.dx / len) * e * (len + 30);
      oy = (-p.dy / len) * e * (len + 30);
      alpha = 1 - k;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#33363d';
    ctx.lineWidth = SIM.PIN_R * 2 + 3;
    line(ctx, p.x1, p.y1, p.x2, p.y2);
    ctx.strokeStyle = '#cfd4db';
    ctx.lineWidth = SIM.PIN_R * 2 - 1;
    line(ctx, p.x1, p.y1, p.x2, p.y2);
    const nx = p.dy / len;
    const ny = -p.dx / len;
    const side = ny < 0 ? 1 : -1; // 光は上側に
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    line(ctx, p.x1 + nx * 2.5 * side, p.y1 + ny * 2.5 * side, p.x2 + nx * 2.5 * side, p.y2 + ny * 2.5 * side);
    const s = pulse ? 1 + 0.1 * Math.sin(t * 0.15) : 1;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#6e4f0e';
    ctx.beginPath();
    ctx.arc(p.x1, p.y1, 13 * s, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(p.x1, p.y1, 13 * s, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawFx(ctx, fx, hero) {
    for (const f of fx) {
      if (f.kind === 'coin') {
        const k = f.t / 18;
        const tx = hero.x;
        const ty = hero.y - 58;
        const cx = (f.x + tx) / 2;
        const cy = Math.min(f.y, ty) - 60;
        const x = (1 - k) * (1 - k) * f.x + 2 * (1 - k) * k * cx + k * k * tx;
        const y = (1 - k) * (1 - k) * f.y + 2 * (1 - k) * k * cy + k * k * ty;
        const r = 9 * (1 - k * 0.5);
        ctx.fillStyle = '#9c6c0a';
        ctx.beginPath();
        ctx.arc(x, y + 1, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#f6c419';
        ctx.beginPath();
        ctx.arc(x, y, r - 1, 0, TAU);
        ctx.fill();
      } else if (f.kind === 'spark') {
        const k = f.t / 14;
        ctx.strokeStyle = 'rgba(255,240,150,' + (1 - k) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + f.a;
          ctx.moveTo(f.x + Math.cos(a) * (6 + k * 10), f.y + Math.sin(a) * (6 + k * 10));
          ctx.lineTo(f.x + Math.cos(a) * (12 + k * 18), f.y + Math.sin(a) * (12 + k * 18));
        }
        ctx.stroke();
      } else if (f.kind === 'smoke') {
        const k = f.t / f.life;
        ctx.fillStyle = 'rgba(' + f.c + ',' + 0.55 * (1 - k) + ')';
        ctx.beginPath();
        ctx.arc(f.x + f.vx * f.t, f.y - f.t * 0.9, f.r + k * 16, 0, TAU);
        ctx.fill();
      }
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const fx = [];
    let heroMood = 'normal';
    let failAt = -1;
    let finished = false;
    let anyPulled = false;
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('宝 ' + sim.collected + ' / ' + sim.target);
    }

    function smoke(x, y, n, c) {
      for (let i = 0; i < n; i++) {
        fx.push({ kind: 'smoke', x: x + (rnd() - 0.5) * 24, y: y + (rnd() - 0.5) * 16, vx: (rnd() - 0.5) * 0.8, r: 6 + rnd() * 6, life: 30 + rnd() * 20, c, t: 0 });
      }
    }

    function handle(e) {
      switch (e.type) {
        case 'pull':
          anyPulled = true;
          api.sound('pin');
          break;
        case 'collect':
          fx.push({ kind: 'coin', x: e.x, y: e.y, t: 0 });
          updateHud();
          break;
        case 'sizzle':
          api.sound('sizzle');
          smoke(e.x, e.y, 5, '220,220,230');
          break;
        case 'monsterDie':
          api.sound('poof');
          smoke(e.x, e.y, 10, '120,90,160');
          break;
        case 'goal':
          heroMood = 'happy';
          break;
        case 'clear':
          heroMood = 'happy';
          finished = true;
          // 文は結果画面を出す瞬間に作る（クリアが決まったあとにも金貨が届くため）
          api.finish({ clear: true, title: 'クリア！', message: () => '宝を ' + sim.collected + ' 個 届けた', delay: 900 });
          break;
        case 'fail':
          failAt = sim.t;
          finished = true;
          api.finish({ clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: e.reason === 'nogold' ? 600 : 1400 });
          break;
      }
    }

    function step() {
      sim.step();
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
      // 失敗の見た目は、溶岩や敵が実際に勇者の近くへ来てから（または少し待ってから）変える
      if (failAt >= 0 && heroMood !== 'burned' && heroMood !== 'beaten') {
        const h = sim.hero;
        const near = (o, d) => Math.abs(o.x - h.x) < d && o.y > h.y - 90;
        let show = sim.t - failAt > 35;
        if (sim.reason === 'lava') show = show || sim.particles.some((p) => p.type === 'lava' && near(p, 40));
        if (sim.reason === 'monster') show = show || sim.monsters.some((m) => m.alive && near(m, 50));
        if (show && sim.reason === 'lava') {
          heroMood = 'burned';
          api.sound('burn');
          smoke(h.x, h.y - 60, 8, '70,60,60');
        } else if (show && sim.reason === 'monster') {
          heroMood = 'beaten';
          api.sound('monster');
        }
      }
      if (heroMood === 'burned' && sim.t % 20 === 0) smoke(sim.hero.x, sim.hero.y - 70, 1, '70,60,60');
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t++;
        if (f.kind === 'coin' && f.t >= 18) {
          fx.splice(i, 1);
          fx.push({ kind: 'spark', x: sim.hero.x, y: sim.hero.y - 58, a: rnd() * TAU, t: 0 });
          api.sound('coin');
        } else if ((f.kind === 'spark' && f.t >= 14) || (f.kind === 'smoke' && f.t >= f.life)) {
          fx.splice(i, 1);
        }
      }
    }

    function render(ctx) {
      drawBackground(ctx);
      // 勇者の足もとをほんのり明るく
      const h = sim.hero;
      const glow = ctx.createRadialGradient(h.x, h.y - 30, 4, h.x, h.y - 30, 90);
      glow.addColorStop(0, 'rgba(255,220,140,0.18)');
      glow.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(h.x - 90, h.y - 120, 180, 180);
      drawWalls(ctx, sim.walls);
      drawParticles(ctx, sim.particles);
      for (const m of sim.monsters) {
        if (m.alive) drawMonster(ctx, m.x, m.y, m.r, h.x, sim.t, 1);
        else if (sim.t - m.diedAt < 20) drawMonster(ctx, m.x, m.y - (sim.t - m.diedAt) * 0.5, m.r, h.x, sim.t, 1 - (sim.t - m.diedAt) / 20);
      }
      drawHero(ctx, h.x, h.y, heroMood, sim.t);
      const pulse = !anyPulled && !finished;
      for (const p of sim.pins) drawPin(ctx, p, sim.t, pulse);
      drawFx(ctx, fx, h);
    }

    function pointerDown(x, y) {
      const id = sim.pinAt(x, y);
      if (id) sim.pull(id);
    }

    return { step, render, pointerDown, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, '#262b57');
    g.addColorStop(1, '#171a33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a57d50';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(18, 12);
    ctx.lineTo(18, 84);
    ctx.lineTo(78, 84);
    ctx.lineTo(78, 12);
    ctx.moveTo(48, 12);
    ctx.lineTo(48, 44);
    ctx.stroke();
    const gold = [];
    for (let i = 0; i < 9; i++) gold.push({ x: 25 + (i % 3) * 8.5 + (Math.floor(i / 3) % 2) * 4, y: 38 - Math.floor(i / 3) * 7.5 });
    ctx.fillStyle = '#9c6c0a';
    circles(ctx, gold, () => 4.2, 0, 0.6);
    ctx.fillStyle = '#f6c419';
    circles(ctx, gold, () => 3.6, 0, 0);
    const lava = [];
    for (let i = 0; i < 12; i++) lava.push({ x: 55 + (i % 4) * 5.5 + (Math.floor(i / 4) % 2) * 2.7, y: 40 - Math.floor(i / 4) * 5 });
    ctx.fillStyle = '#f2501a';
    circles(ctx, lava, () => 3.4, 0, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#cfd4db';
    ctx.beginPath();
    ctx.moveTo(10, 46);
    ctx.lineTo(48, 46);
    ctx.moveTo(86, 46);
    ctx.lineTo(48, 46);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(8, 46, 4.5, 0, TAU);
    ctx.moveTo(92.5, 46);
    ctx.arc(88, 46, 4.5, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(48, 82);
    ctx.scale(0.42, 0.42);
    drawHero(ctx, 0, 0, 'normal', 0);
    ctx.restore();
  }

  KG.registerGame({
    id: 'pinpull',
    title: 'ピン抜き',
    desc: 'ピンを抜く順番を考えて、宝を勇者に届ける',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
