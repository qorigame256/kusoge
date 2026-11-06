// 人を同じ色の扉へ連れていくの見た目（描画・指で道を描く操作・歩く動き・音と演出）。道・歩く・ぶつかる の決まりと勝ち負けは door-sim.js が持つ。
// sim は拍ごとに1マスずつ進む。ここでは1拍を BEAT 刻みに分けて、マスの間をなめらかに動かす。
// ぶつかったときは、ぶつかった2つが触れる所まで動かして止め、小さな星と赤い輪を出す（大げさな演出は入れない決まり）。
// やり直したときは、前に歩かせた道をうすく描く（同じ面の、この画面を開いている間だけ覚える。保存はしない）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.doorSim;
  const LEVELS = KG.doorLevels;
  // 色（fill 本体・dark 縁とかげ・light 光）。⑩ 色のブロックを出すと同じ5色
  const PAL = {
    R: { fill: '#ff5d5d', dark: '#a82828', light: '#ffc2c2', name: '赤' },
    B: { fill: '#4fa3ff', dark: '#1d5aa8', light: '#c4e2ff', name: '青' },
    Y: { fill: '#ffd23f', dark: '#a87f00', light: '#fff3b8', name: '黄' },
    G: { fill: '#58cf6a', dark: '#23813a', light: '#c6f5cd', name: '緑' },
    P: { fill: '#b47dff', dark: '#6436ad', light: '#e6d6ff', name: '紫' },
  };
  const BEAT = 11; // 1拍（1マス進む）の刻み
  const START_WAIT = 16; // 全員の道ができてから歩き出すまでの刻み
  const BODY = 0.3; // 人の体の半径（1マスに対して。ぶつかって触れる所を決めるのに使う）
  const ROBOT = 0.32; // ロボットの半径
  const LINE_OFF = [[-0.07, -0.07], [0.07, 0.07], [0.07, -0.07], [-0.07, 0.07], [0, 0]]; // 道の線を人ごとにずらす量（重なっても見えるように）
  const lastPaths = {}; // 面の番号 → 前に歩かせた道 [{ color, path }]（やり直したときにうすく描く）

  // ---- 形を描く道具 ----

  // 人（(x, y) は足もとの真ん中ではなく、マスの真ん中。s は1マス）。k は大きさ（扉に入るときに縮む）
  function drawPerson(ctx, x, y, s, col, k, ring) {
    const P = PAL[col] || PAL.R;
    const u = s * k * 1.15;
    ctx.save();
    // かげ
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + u * 0.33, u * 0.27, u * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, u * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 体
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ctx.roundRect(x - u * 0.2, y - u * 0.06, u * 0.4, u * 0.4, [u * 0.18, u * 0.18, u * 0.08, u * 0.08]);
    ctx.fill();
    ctx.fillStyle = P.fill;
    ctx.beginPath();
    ctx.roundRect(x - u * 0.17, y - u * 0.04, u * 0.34, u * 0.34, [u * 0.16, u * 0.16, u * 0.07, u * 0.07]);
    ctx.fill();
    // 頭
    ctx.fillStyle = '#5a3b2a';
    ctx.beginPath();
    ctx.arc(x, y - u * 0.2, u * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(x, y - u * 0.18, u * 0.145, 0, Math.PI * 2);
    ctx.fill();
    // 髪（頭の上に、体と同じ色の帽子）
    ctx.fillStyle = P.fill;
    ctx.beginPath();
    ctx.arc(x, y - u * 0.22, u * 0.15, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    // 目
    ctx.fillStyle = '#2a1d16';
    ctx.beginPath();
    ctx.arc(x - u * 0.05, y - u * 0.16, u * 0.022, 0, Math.PI * 2);
    ctx.arc(x + u * 0.05, y - u * 0.16, u * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 扉（マスの左上 (x, y)、1マス s）。lit は人が入ったあとの明かり（0〜1）
  function drawDoor(ctx, x, y, s, col, lit) {
    const P = PAL[col] || PAL.R;
    const l = x + s * 0.17;
    const t = y + s * 0.08;
    const w = s * 0.66;
    const h = s * 0.84;
    ctx.save();
    // 枠
    ctx.fillStyle = '#0b0d1f';
    ctx.beginPath();
    ctx.roundRect(l - 4, t - 4, w + 8, h + 6, [w * 0.5 + 4, w * 0.5 + 4, 4, 4]);
    ctx.fill();
    ctx.fillStyle = P.dark;
    ctx.beginPath();
    ctx.roundRect(l - 2, t - 2, w + 4, h + 2, [w * 0.5 + 2, w * 0.5 + 2, 3, 3]);
    ctx.fill();
    // 扉の板
    ctx.fillStyle = P.fill;
    ctx.beginPath();
    ctx.roundRect(l + 2, t + 2, w - 4, h - 4, [w * 0.5 - 2, w * 0.5 - 2, 2, 2]);
    ctx.fill();
    // 板の模様と取っ手
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(l + w * 0.2, t + h * 0.3, w * 0.6, h * 0.24, 3);
    ctx.roundRect(l + w * 0.2, t + h * 0.62, w * 0.6, h * 0.22, 3);
    ctx.stroke();
    ctx.fillStyle = P.light;
    ctx.beginPath();
    ctx.arc(l + w * 0.78, t + h * 0.58, Math.max(2, s * 0.04), 0, Math.PI * 2);
    ctx.fill();
    if (lit > 0) {
      // 入ったしるし: 扉の上の明かりと、白いまる
      ctx.globalAlpha = lit;
      ctx.fillStyle = 'rgba(255,255,220,0.35)';
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s * 0.45, s * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(3, s * 0.06);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.36, y + s * 0.5);
      ctx.lineTo(x + s * 0.47, y + s * 0.61);
      ctx.lineTo(x + s * 0.66, y + s * 0.38);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 見回りロボット（(x, y) はマスの真ん中）。dir は向いている向き（0 上・1 右・2 下・3 左）
  function drawRobot(ctx, x, y, s, dir) {
    const r = s * ROBOT;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.85, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b5170';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#dfe3f5');
    g.addColorStop(1, '#9aa0c4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
    ctx.fill();
    // 進む向きに光る目
    const dx = [0, 1, 0, -1][dir] || 0;
    const dy = [-1, 0, 1, 0][dir] || 0;
    ctx.fillStyle = '#20243f';
    ctx.beginPath();
    ctx.ellipse(x + dx * r * 0.32, y + dy * r * 0.32 - r * 0.05, r * 0.5, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a4d';
    ctx.beginPath();
    ctx.arc(x + dx * r * 0.45 - r * 0.15, y + dy * r * 0.45 - r * 0.05, r * 0.08, 0, Math.PI * 2);
    ctx.arc(x + dx * r * 0.45 + r * 0.15, y + dy * r * 0.45 - r * 0.05, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 壁のかたまり（⑩ の動かない石と同じ描き方）
  function drawWall(ctx, x, y, s) {
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
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(x + s * 0.16, y + s * 0.12, s * 0.5, s * 0.08, s * 0.04);
    ctx.fill();
  }

  // 道の線（マスの真ん中を結ぶ）。off はずらす量（ピクセル）、dots は1歩ごとの点を描くか
  function drawPath(ctx, L, W, path, col, off, alpha, dashed, dots, width) {
    if (path.length < 2) return;
    const P = PAL[col] || PAL.R;
    const pt = (cell) => [L.left + ((cell % W) + 0.5) * L.C + off[0], L.top + (Math.floor(cell / W) + 0.5) * L.C + off[1]];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashed ? [L.C * 0.12, L.C * 0.12] : []);
    ctx.beginPath();
    path.forEach((cell, i) => {
      const [x, y] = pt(cell);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.strokeStyle = P.fill;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
    if (dots) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 1; i < path.length; i++) {
        const [x, y] = pt(path[i]);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, width * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBoard(ctx, sim) {
    const { C, T, left, top } = sim.L;
    const W = sim.W;
    const H = sim.H;
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
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
    ctx.fillStyle = '#10132c';
    ctx.fillRect(left, top, W * C, H * C);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (sim.wall[r * W + c]) continue;
        ctx.fillStyle = (r + c) % 2 ? '#1b2049' : '#1e2350';
        ctx.beginPath();
        ctx.roundRect(left + c * C + 3, top + r * C + 3, C - 6, C - 6, 8);
        ctx.fill();
      }
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (sim.wall[r * W + c]) drawWall(ctx, left + c * C, top + r * C, C);
    // ロボットの通る所（点線と、はしの丸）
    for (const rb of sim.robots) {
      const a = rb.track[0];
      const b = rb.track[rb.track.length - 1];
      const pa = [left + ((a % W) + 0.5) * C, top + (Math.floor(a / W) + 0.5) * C];
      const pb = [left + ((b % W) + 0.5) * C, top + (Math.floor(b / W) + 0.5) * C];
      ctx.save();
      ctx.strokeStyle = 'rgba(200,205,235,0.45)';
      ctx.lineWidth = C * 0.1;
      ctx.lineCap = 'round';
      ctx.setLineDash([C * 0.04, C * 0.16]);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,205,235,0.35)';
      for (const p of [pa, pb]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], C * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const L = sim.L;
    const W = sim.W;
    const ghost = lastPaths[levelIndex] || null;
    let phase = 'draw'; // 'draw' 道を描く | 'wait' 歩き出す前 | 'walk' 歩いている | 'crash' ぶつかった | 'end' クリア
    let wait = 0;
    let frame = 0; // いまの拍の中の刻み（0〜BEAT）
    let outcome = null; // いまの拍の結果（sim.beat の返り値）
    let crashF = 1; // ぶつかった拍で、ぶつかった2つが触れる割合（0〜1）
    let crashAt = null; // ぶつかった所（画面の座標）
    let denied = false; // 描いていて止まったときに音を出したか
    const lit = sim.people.map(() => 0); // 扉の明かり
    const fx = []; // 演出 { kind: 'enter' | 'bump', x, y, col, t }
    let t = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('のこり ' + sim.left() + '人');
    }

    const center = (cell) => [L.left + ((cell % W) + 0.5) * L.C, L.top + (Math.floor(cell / W) + 0.5) * L.C];
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

    // 拍 sim.t-1 → sim.t の割合 f のときの、動く物の位置（m は sim.crash の a・b と同じ形）
    function moverAt(m, f) {
      return lerp(center(m.from), center(m.to), f);
    }

    // ぶつかった拍で、ぶつかった2つが触れる割合（いちばん早く触れる組）
    function touchF(crash) {
      let best = 1;
      for (const h of crash.hits) {
        const ra = h.a.kind === 'robot' ? ROBOT : BODY;
        const rb = h.b.kind === 'robot' ? ROBOT : BODY;
        const lim = (ra + rb) * L.C * 0.92;
        for (let f = 0; f <= 1.0001; f += 0.02) {
          const p = moverAt(h.a, f);
          const q = moverAt(h.b, f);
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= lim) {
            best = Math.min(best, f);
            break;
          }
        }
      }
      return best;
    }

    function nameOf(m) {
      return m.kind === 'robot' ? 'ロボット' : PAL[sim.people[m.id].color].name + 'の人';
    }

    function crashMessage(crash) {
      const h = crash.hits[0];
      const a = h.a.kind === 'robot' ? h.b : h.a;
      const b = h.a.kind === 'robot' ? h.a : h.b;
      if (b.kind === 'robot') return crash.t + '歩目に、' + nameOf(a) + 'がロボットにぶつかった';
      if (h.kind === 'swap') return crash.t + '歩目に、' + nameOf(a) + 'と' + nameOf(b) + 'がすれ違えずにぶつかった';
      return crash.t + '歩目に、' + nameOf(a) + 'と' + nameOf(b) + 'が同じマスに来てぶつかった';
    }

    function handleDrawEvents() {
      for (const e of sim.events) {
        if (e.type === 'add') api.sound('draw');
        else if (e.type === 'done') api.sound('up');
      }
      sim.events.length = 0;
    }

    function startBeat() {
      outcome = sim.beat();
      frame = 0;
      if (outcome === 'fail') {
        crashF = touchF(sim.crash);
        const h = sim.crash.hits[0];
        const p = moverAt(h.a, crashF);
        const q = moverAt(h.b, crashF);
        crashAt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }

    // 扉に入り終えた（扉に着いた拍の動きが終わった）か
    const gone = (p) => p.inside && (sim.t > p.path.length - 1 || phase === 'end');

    function step() {
      t++;
      for (let i = fx.length - 1; i >= 0; i--) if (++fx[i].t > 40) fx.splice(i, 1);
      sim.people.forEach((p, i) => {
        if (gone(p) && lit[i] < 1) lit[i] = Math.min(1, lit[i] + 0.08);
      });
      if (phase === 'wait') {
        if (++wait >= START_WAIT) {
          phase = 'walk';
          startBeat();
        }
        return;
      }
      if (phase !== 'walk') return;
      frame++;
      if (outcome === 'fail' && frame / BEAT >= crashF) {
        phase = 'crash';
        frame = Math.round(crashF * BEAT);
        sim.events.length = 0;
        fx.push({ kind: 'bump', x: crashAt[0], y: crashAt[1], t: 0 });
        api.sound('bump');
        api.finish({ clear: false, title: 'ぶつかった', message: crashMessage(sim.crash), delay: 1300 });
        return;
      }
      if (frame >= BEAT) {
        // この拍で扉に着いた人を、扉へ入れる
        for (const e of sim.events) {
          if (e.type === 'enter') {
            const p = sim.people[e.id];
            const [x, y] = center(p.door);
            fx.push({ kind: 'enter', x, y, col: p.color, t: 0 });
            api.sound('door');
          }
        }
        sim.events.length = 0;
        updateHud();
        if (outcome === 'clear') {
          phase = 'end';
          api.finish({ clear: true, title: 'クリア！', message: '全員が扉に入った（' + sim.t + '歩）', delay: 700 });
          return;
        }
        startBeat();
      }
    }

    function render(ctx) {
      drawBoard(ctx, sim);
      const { C, left, top } = L;
      // 扉
      sim.people.forEach((p, i) => drawDoor(ctx, left + (p.door % W) * C, top + Math.floor(p.door / W) * C, C, p.color, lit[i]));
      // 前に歩かせた道（描いている間だけ、うすく）
      if (ghost && phase === 'draw') {
        for (const g of ghost) {
          const k = sim.people.findIndex((p) => p.color === g.color);
          const off = LINE_OFF[k] || [0, 0];
          drawPath(ctx, L, W, g.path, g.color, [off[0] * C, off[1] * C], 0.28, true, false, C * 0.08);
        }
      }
      // 道（歩いている間は、まだ歩いていない所だけ）
      const walking = phase === 'walk' || phase === 'crash' || phase === 'end';
      const f = walking ? Math.min(1, frame / BEAT) : 0;
      sim.people.forEach((p, k) => {
        const off = LINE_OFF[k] || [0, 0];
        let path = p.path;
        if (walking) {
          if (gone(p)) return;
          path = p.path.slice(Math.max(0, sim.t - 1));
        }
        const drawingThis = sim.drawing === k;
        drawPath(ctx, L, W, path, p.color, [off[0] * C, off[1] * C], walking ? 0.55 : 0.95, false, !walking, C * (drawingThis ? 0.15 : 0.12));
        // できあがっていない道の先
        if (!walking && !p.done && p.path.length > 1) {
          const [x, y] = center(p.path[p.path.length - 1]);
          ctx.fillStyle = PAL[p.color].fill;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x + off[0] * C, y + off[1] * C, C * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      });
      // ロボット
      sim.robots.forEach((rb) => {
        let pos;
        let dir;
        if (walking) {
          const a = sim.robotCell(rb.id, sim.t - 1);
          const b = sim.robotCell(rb.id, sim.t);
          const ff = phase === 'crash' ? crashF : f;
          pos = lerp(center(a), center(b), ff);
          dir = b - a === -W ? 0 : b - a === 1 ? 1 : b - a === W ? 2 : 3;
        } else {
          pos = center(rb.track[0]);
          const d = rb.track[1] - rb.track[0];
          dir = d === -W ? 0 : d === 1 ? 1 : d === W ? 2 : 3;
        }
        drawRobot(ctx, pos[0], pos[1], C, dir);
      });
      // 人
      sim.people.forEach((p, k) => {
        if (!walking) {
          const [x, y] = center(p.start);
          const pulse = !p.done && sim.drawing !== k ? 0.5 + 0.5 * Math.sin(t / 8 + k) : 0;
          if (pulse > 0) {
            ctx.save();
            ctx.globalAlpha = 0.25 + 0.35 * pulse;
            ctx.strokeStyle = PAL[p.color].light;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, C * (0.44 + 0.04 * pulse), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          drawPerson(ctx, x, y, C, p.color, 1, sim.drawing === k);
          return;
        }
        const last = p.path.length - 1;
        if (gone(p) || sim.t - 1 >= last) return; // もう扉の中
        const a = center(p.path[sim.t - 1 < 0 ? 0 : sim.t - 1]);
        const b = center(p.path[Math.min(sim.t, last)]);
        const ff = phase === 'crash' ? crashF : f;
        const [x, y] = lerp(a, b, ff);
        // 扉に入る拍は、扉に近づくほど小さくする
        const entering = sim.t === last && phase !== 'crash';
        const k2 = entering ? 1 - 0.75 * ff : 1;
        const bob = phase === 'walk' ? Math.abs(Math.sin(ff * Math.PI)) * C * 0.05 : 0;
        drawPerson(ctx, x, y - bob, C, p.color, k2, false);
      });
      // 演出
      for (const e of fx) {
        const k = e.t / 40;
        ctx.save();
        if (e.kind === 'enter') {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = PAL[e.col].light;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (let n = 0; n < 8; n++) {
            const a = (n / 8) * Math.PI * 2 + 0.3;
            const d0 = C * 0.3 + k * C * 0.4;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * d0, e.y + Math.sin(a) * d0);
            ctx.lineTo(e.x + Math.cos(a) * (d0 + 8), e.y + Math.sin(a) * (d0 + 8));
            ctx.stroke();
          }
        } else {
          // ぶつかった所: 赤い輪と小さな星
          ctx.globalAlpha = Math.max(0.6, 1 - k);
          ctx.strokeStyle = '#ff5050';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(e.x, e.y, C * (0.45 + 0.08 * Math.min(1, k * 3)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#ffe066';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (let n = 0; n < 6; n++) {
            const a = (n / 6) * Math.PI * 2;
            const d0 = C * 0.12;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * d0, e.y - C * 0.25 + Math.sin(a) * d0);
            ctx.lineTo(e.x + Math.cos(a) * (d0 + C * 0.1), e.y - C * 0.25 + Math.sin(a) * (d0 + C * 0.1));
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      // ぶつかったあとは、赤い輪を残す
      if (phase === 'crash' && crashAt && !fx.some((e) => e.kind === 'bump')) {
        ctx.save();
        ctx.strokeStyle = '#ff5050';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(crashAt[0], crashAt[1], C * 0.53, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 指の位置のマス（盤の外なら、いちばん近いふちのマス）
    function cellNear(x, y) {
      const c = Math.max(0, Math.min(W - 1, Math.floor((x - L.left) / L.C)));
      const r = Math.max(0, Math.min(sim.H - 1, Math.floor((y - L.top) / L.C)));
      return [r, c];
    }

    function pointerDown(x, y) {
      if (phase !== 'draw' || sim.drawing >= 0) return;
      const cell = sim.cellAt(x, y);
      if (!cell) return;
      const got = sim.pick(cell[0], cell[1]);
      if (!got || !sim.beginDraw(got.id, got.from)) return;
      denied = false;
      api.sound('tap');
      handleDrawEvents();
    }

    function pointerMove(x, y) {
      if (phase !== 'draw' || sim.drawing < 0) return;
      const [r, c] = cellNear(x, y);
      const res = sim.drawTo(r, c);
      handleDrawEvents();
      if (res.some((k) => k !== 'stop')) denied = false;
      if (res[res.length - 1] === 'stop' && !denied) {
        denied = true;
        api.sound('deny');
      }
    }

    function pointerUp() {
      if (phase !== 'draw' || sim.drawing < 0) return;
      const started = sim.endDraw();
      sim.events.length = 0;
      if (started) {
        lastPaths[levelIndex] = sim.people.map((p) => ({ color: p.color, path: p.path.slice() }));
        phase = 'wait';
        wait = 0;
        api.sound('go');
      }
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#171a33';
    ctx.fillRect(0, 0, 96, 96);
    const s = 20;
    const left = 8;
    const top = 8;
    ctx.fillStyle = '#10132c';
    ctx.fillRect(left, top, 4 * s, 4 * s);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#1b2049' : '#232963';
        ctx.fillRect(left + c * s + 1, top + r * s + 1, s - 2, s - 2);
      }
    }
    const L = { left, top, C: s };
    // 赤: 左下 → 右上、青: 右下 → 左上（交わる道）
    drawPath(ctx, L, 4, [12, 8, 9, 10, 6, 7, 3], 'R', [0, 0], 1, false, false, 4);
    drawPath(ctx, L, 4, [15, 11, 10, 9, 5, 4, 0], 'B', [0, 0], 1, false, false, 4);
    drawDoor(ctx, left + 3 * s, top, s, 'R', 0);
    drawDoor(ctx, left, top, s, 'B', 0);
    drawPerson(ctx, left + 0.5 * s, top + 3.5 * s, s * 1.3, 'R', 1, false);
    drawPerson(ctx, left + 3.5 * s, top + 3.5 * s, s * 1.3, 'B', 1, false);
  }

  KG.registerGame({
    id: 'door',
    title: '同じ色の扉へ連れていく',
    cardTitle: ['同じ色の扉へ', '連れていく'],
    desc: '道を描いて、全員をぶつけずに同じ色の扉へ入れる',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
