// 砂を掘って玉を運ぶの見た目（描画・指でなぞって掘る操作・音と演出）。砂・岩・玉の動きと勝ち負けは sand-sim.js が持つ。
// 砂は別の canvas（layer）に一度描き、掘った帯をそこから消していく（毎こま、ます目を描き直さない）。
// 画面の大きさが変わったら、掘った帯の記録（sim.digs）から作り直す。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.sandSim;
  const LEVELS = KG.sandLevels;
  const TAU = Math.PI * 2;
  const HEADER = 150; // 上の帯（ボタンと文字の下地）
  const R = SIM.BALL_R;

  const FAIL_TEXT = {
    black: '黒い玉がトラックに入った',
    short: '入れられる玉が足りなくなった',
  };
  const BALL_COLORS = ['#ff5a5f', '#ffb020', '#ffe14d', '#4fd16a', '#3fb6ff', '#a57bff', '#ff7ac8'];
  const RIM = '#cf8f45'; // 掘った所のふちの、少し濃い砂の色

  // ---- 形 ----

  function shapePath(c, s, grow) {
    const g = grow || 0;
    c.beginPath();
    if (s.rect) {
      c.rect(s.rect[0] - g, s.rect[1] - g, s.rect[2] - s.rect[0] + g * 2, s.rect[3] - s.rect[1] + g * 2);
    } else if (s.circle) {
      c.arc(s.circle[0], s.circle[1], s.circle[2] + g, 0, TAU);
    } else if (s.poly) {
      c.moveTo(s.poly[0][0], s.poly[0][1]);
      for (let i = 1; i < s.poly.length; i++) c.lineTo(s.poly[i][0], s.poly[i][1]);
      c.closePath();
    }
  }

  // 形を塗る。管（path）は太い線で、多角形の広げた分（grow）はふちの太い線で描く
  function fillShape(c, s, grow) {
    const g = grow || 0;
    if (s.path) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = (s.r + g) * 2;
      c.strokeStyle = c.fillStyle;
      c.beginPath();
      c.moveTo(s.path[0][0], s.path[0][1]);
      for (let i = 1; i < s.path.length; i++) c.lineTo(s.path[i][0], s.path[i][1]);
      if (s.path.length === 1) c.lineTo(s.path[0][0] + 0.01, s.path[0][1]);
      c.stroke();
      return;
    }
    shapePath(c, s, s.poly ? 0 : g);
    c.fill();
    if (s.poly && g) {
      c.lineJoin = 'round';
      c.lineWidth = g * 2;
      c.strokeStyle = c.fillStyle;
      c.stroke();
    }
  }

  // 砂に穴をあける。ふちを少し濃くしてから、内側を消す
  function carve(c, s) {
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = RIM;
    fillShape(c, s, 4);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    fillShape(c, s, 0);
    c.restore();
  }

  function digShape(d) {
    return { path: [[d[0], d[1]], [d[2], d[3]]], r: SIM.DIG_R };
  }

  // ---- 砂の絵（layer） ----

  function buildLayer(level, w, h, digs) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.setTransform(w / KG.W, 0, 0, h / KG.H, 0, 0);
    const top = level.top === undefined ? SIM.TOP_DEFAULT : level.top;
    const sands = level.sand || [{ rect: [0, top, KG.W, KG.H] }];
    const g = c.createLinearGradient(0, top, 0, KG.H);
    g.addColorStop(0, '#f8c776');
    g.addColorStop(1, '#eba650');
    c.fillStyle = g;
    for (const s of sands) fillShape(c, s, 0);
    // 地層のすじと、砂粒の点（毎回同じ並び）
    c.save();
    c.globalCompositeOperation = 'source-atop';
    const rnd = KG.rng(level.seed || 1);
    c.strokeStyle = 'rgba(190,120,50,0.18)';
    c.lineWidth = 3;
    for (let y = top + 40; y < KG.H; y += 46 + rnd() * 30) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= KG.W; x += 30) c.lineTo(x, y + Math.sin(x * 0.02 + y) * 5);
      c.stroke();
    }
    for (let i = 0; i < 900; i++) {
      const x = rnd() * KG.W;
      const y = top + rnd() * (KG.H - top);
      c.fillStyle = rnd() < 0.5 ? 'rgba(200,128,52,0.45)' : 'rgba(255,230,170,0.6)';
      c.beginPath();
      c.arc(x, y, 1.2 + rnd() * 1.6, 0, TAU);
      c.fill();
    }
    // 上の面に、明るい縁
    c.fillStyle = '#ffdc9a';
    c.fillRect(0, top, KG.W, 5);
    c.restore();
    for (const s of level.caves || []) carve(c, s);
    carve(c, SIM.truckShapes(level.truck).cave);
    for (const d of digs) carve(c, digShape(d));
    return cv;
  }

  // ---- 背景・岩・玉・トラック ----

  function drawBackground(ctx, top) {
    ctx.fillStyle = '#14162b';
    ctx.fillRect(0, 0, KG.W, HEADER);
    const sky = ctx.createLinearGradient(0, HEADER, 0, top);
    sky.addColorStop(0, '#7cc6f4');
    sky.addColorStop(1, '#cdeeff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, HEADER, KG.W, top - HEADER);
    // 砂の奥（掘った所から見える）
    const g = ctx.createLinearGradient(0, top, 0, KG.H);
    g.addColorStop(0, '#6a3c1f');
    g.addColorStop(0.85, '#3f2210');
    g.addColorStop(1, '#1d0f06');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, KG.W, KG.H - top);
  }

  function drawRocks(ctx, rocks) {
    for (const s of rocks || []) {
      ctx.fillStyle = '#5f6672';
      fillShape(ctx, s, 0);
      ctx.save();
      shapePath(ctx, s, 0);
      ctx.clip();
      ctx.fillStyle = '#8d96a5';
      if (s.circle) {
        ctx.beginPath();
        ctx.arc(s.circle[0] - 3, s.circle[1] - 3, s.circle[2] - 3, 0, TAU);
        ctx.fill();
      } else {
        const [x1, y1, x2, y2] = s.rect || boxOf(s.poly);
        ctx.fillRect(x1 + 3, y1 + 3, x2 - x1 - 7, y2 - y1 - 7);
      }
      // 小石の模様（矢印に見えないよう、向きの無い丸にする）
      ctx.fillStyle = 'rgba(70,76,88,0.35)';
      const [px1, py1, px2, py2] = s.circle ? [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]] : s.rect || boxOf(s.poly);
      for (let x = px1 + 18, k = 0; x < px2 - 8; x += 34, k++) {
        ctx.beginPath();
        ctx.ellipse(x, py1 + (py2 - py1) * (k % 2 ? 0.35 : 0.65), 6, 3.5, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      const [bx1, by1, bx2] = s.circle ? [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2]] : s.rect || boxOf(s.poly);
      ctx.fillRect(bx1, by1, bx2 - bx1, 4);
      ctx.restore();
    }
  }

  function boxOf(pts) {
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  }

  function drawBall(ctx, x, y, black, id) {
    ctx.fillStyle = black ? '#22232b' : BALL_COLORS[id % BALL_COLORS.length];
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    if (black) {
      ctx.strokeStyle = '#5b5e6c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, R - 0.8, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = black ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.32, 0, TAU);
    ctx.fill();
  }

  // トラック。(tx, ty) は荷台の真ん中とふちの高さ。荷台の手前の板は低くして、積んだ玉が見えるようにする
  // bed は荷台に入った玉（黒い玉も、失敗のあとに入った数えない玉も、入ったときの色のまま積む）。count は数えた玉の数
  function drawTruck(ctx, tx, ty, bed, count, need, shake) {
    ctx.save();
    ctx.translate(tx + shake, ty);
    // 荷台の奥
    ctx.fillStyle = '#245a93';
    ctx.fillRect(-66, 0, 132, 56);
    // 積んだ玉（入った順に下の段から。手前の板より上に出た分が見える）
    let n = 0;
    for (let row = 0; n < bed.length && row < 6; row++) {
      const y = 46 - R - row * 15.5;
      const off = row % 2 ? R : 0;
      for (let x = -56 + R + off; x <= 56 - R + 0.1 && n < bed.length; x += R * 2 + 0.5) {
        drawBall(ctx, x, y, bed[n].black, bed[n].id);
        n++;
      }
    }
    // 左右の壁と、手前の低い板
    ctx.fillStyle = '#3b8ad9';
    ctx.fillRect(-66, 0, 10, 56);
    ctx.fillRect(56, 0, 10, 56);
    ctx.fillRect(-66, 28, 132, 28);
    ctx.fillStyle = '#62a8ec';
    ctx.fillRect(-66, 28, 132, 5);
    ctx.fillRect(-66, 0, 10, 4);
    ctx.fillRect(56, 0, 10, 4);
    // 入った数
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = count >= need ? '#fff59a' : '#ffffff';
    ctx.fillText(count + ' / ' + need, 0, 44);
    // 運転席（屋根は前へ下がる坂）
    ctx.fillStyle = '#e8453c';
    ctx.beginPath();
    ctx.moveTo(66, 4);
    ctx.lineTo(124, 34);
    ctx.lineTo(124, 56);
    ctx.lineTo(66, 56);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath();
    ctx.moveTo(76, 16);
    ctx.lineTo(108, 33);
    ctx.lineTo(108, 40);
    ctx.lineTo(76, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(117, 40, 7, 6);
    // 車体の下と車輪
    ctx.fillStyle = '#3a3c44';
    ctx.fillRect(-70, 56, 194, 8);
    for (const wx of [-36, 92]) {
      ctx.fillStyle = '#26272d';
      ctx.beginPath();
      ctx.arc(wx, 70, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#a3a9b3';
      ctx.beginPath();
      ctx.arc(wx, 70, 5.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const truck = level.truck;
    const fx = [];
    let layer = null;
    let applied = 0; // layer に反映した掘った帯の数
    let down = false;
    let lastX = 0;
    let lastY = 0;
    let lastHud = '';
    let shake = 0;
    let seed = 9;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      const text = 'のこり ' + Math.max(0, sim.need - sim.collected) + '個';
      if (text === lastHud) return;
      lastHud = text;
      api.setHud(text);
    }

    function handle(e) {
      switch (e.type) {
        case 'dig':
          api.sound('dig');
          for (let i = 0; i < 2; i++) {
            fx.push({ kind: 'grain', x: e.x1 + (rnd() - 0.5) * 20, y: e.y1 + (rnd() - 0.5) * 20, vx: (rnd() - 0.5) * 3, vy: -1 - rnd() * 2, t: 0 });
          }
          break;
        case 'in':
          if (e.black) {
            api.sound('deny');
            shake = 12;
            fx.push({ kind: 'cross', x: e.x, y: truck.y - 10, t: 0 });
          } else {
            api.sound('ball');
            fx.push({ kind: 'ring', x: e.x, y: truck.y, t: 0 });
          }
          break;
        case 'clear':
          for (let i = 0; i < 10; i++) fx.push({ kind: 'star', x: truck.x + (rnd() - 0.5) * 150, y: truck.y - 10 - rnd() * 40, t: -i * 4 });
          api.finish({ clear: true, title: 'クリア！', message: () => '玉を ' + sim.collected + ' 個 運んだ', delay: 900 });
          break;
        case 'fail':
          api.finish({ clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: 1000 });
          break;
      }
    }

    function step() {
      sim.step();
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
      if (shake > 0) shake--;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t++;
        if (f.kind === 'grain') {
          f.x += f.vx;
          f.y += f.vy;
          f.vy += 0.35;
        }
        const life = f.kind === 'grain' ? 24 : f.kind === 'star' ? 40 : f.kind === 'cross' ? 50 : 18;
        if (f.t >= life) fx.splice(i, 1);
      }
      updateHud();
    }

    function drawFx(ctx) {
      for (const f of fx) {
        if (f.t < 0) continue;
        if (f.kind === 'grain') {
          ctx.fillStyle = 'rgba(246,190,110,' + (1 - f.t / 24) + ')';
          ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
        } else if (f.kind === 'ring') {
          const k = f.t / 18;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 6 + k * 16, 0, TAU);
          ctx.stroke();
        } else if (f.kind === 'cross') {
          const a = Math.min(1, (50 - f.t) / 15);
          ctx.strokeStyle = 'rgba(235,50,50,' + a + ')';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(f.x - 14, f.y - 14);
          ctx.lineTo(f.x + 14, f.y + 14);
          ctx.moveTo(f.x + 14, f.y - 14);
          ctx.lineTo(f.x - 14, f.y + 14);
          ctx.stroke();
        } else if (f.kind === 'star') {
          const k = f.t / 40;
          const s = 7 * (1 - k * 0.4);
          ctx.fillStyle = 'rgba(255,236,120,' + (1 - k) + ')';
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU - Math.PI / 2;
            const r = i % 2 ? s * 0.45 : s;
            ctx.lineTo(f.x + Math.cos(a) * r, f.y - f.t * 1.1 + Math.sin(a) * r);
          }
          ctx.fill();
        }
      }
    }

    function render(ctx) {
      const cw = ctx.canvas.width;
      const ch = ctx.canvas.height;
      if (!layer || layer.width !== cw || layer.height !== ch) {
        layer = buildLayer(level, cw, ch, sim.digs);
        applied = sim.digs.length;
      } else if (applied < sim.digs.length) {
        const c = layer.getContext('2d');
        for (; applied < sim.digs.length; applied++) carve(c, digShape(sim.digs[applied]));
      }
      drawBackground(ctx, sim.top);
      ctx.drawImage(layer, 0, 0, KG.W, KG.H);
      drawRocks(ctx, level.rocks);
      for (const b of sim.balls) if (b.alive) drawBall(ctx, b.x, b.y, b.black, b.id);
      drawTruck(ctx, truck.x, truck.y, sim.bed, sim.collected, sim.need, shake ? Math.sin(shake * 1.7) * 3 : 0);
      // 指で掘っている所の目印
      if (down && sim.state === 'play' && !sim.locked) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lastX, lastY, SIM.DIG_R, 0, TAU);
        ctx.stroke();
      }
      drawFx(ctx);
    }

    function pointerDown(x, y) {
      down = true;
      lastX = x;
      lastY = y;
      sim.dig(x, y, x, y);
    }

    function pointerMove(x, y) {
      if (!down) return;
      sim.dig(lastX, lastY, x, y);
      lastX = x;
      lastY = y;
    }

    function pointerUp() {
      down = false;
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#4a2a16';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#f2b45e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(96, 0);
    ctx.lineTo(96, 96);
    ctx.lineTo(0, 96);
    ctx.closePath();
    // 掘った道（左上から右下へ）
    ctx.moveTo(10, 0);
    ctx.lineTo(10, 30);
    ctx.quadraticCurveTo(14, 52, 46, 58);
    ctx.lineTo(66, 62);
    ctx.lineTo(66, 96);
    ctx.lineTo(84, 96);
    ctx.lineTo(84, 52);
    ctx.quadraticCurveTo(80, 42, 50, 38);
    ctx.quadraticCurveTo(32, 34, 32, 18);
    ctx.lineTo(32, 0);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.fillStyle = 'rgba(200,128,52,0.5)';
    for (const [x, y] of [[50, 14], [72, 22], [14, 70], [36, 84], [88, 30], [56, 80]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.scale(96 / 108, 96 / 108);
    [[24, 12], [24, 28], [36, 44], [52, 52], [68, 56], [84, 66]].forEach(([x, y], i) => drawBall(ctx, x, y, false, i));
    ctx.restore();
    // トラックの荷台
    ctx.fillStyle = '#3b8ad9';
    ctx.fillRect(58, 84, 34, 12);
    ctx.fillStyle = '#62a8ec';
    ctx.fillRect(58, 84, 34, 3);
  }

  KG.registerGame({
    id: 'sand',
    title: '砂を掘って玉を運ぶ',
    desc: '指でなぞって砂を掘り、玉をトラックまで転がす',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
