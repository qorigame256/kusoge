// 線を引いて守るの見た目（描画・指でなぞる操作・音と演出）。動きと判定は guard-sim.js が持つ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.guardSim;
  const LEVELS = KG.guardLevels;
  const TAU = Math.PI * 2;
  const HEADER = 150; // 上の帯（ボタンと文字の下地。明るい空の上では文字が読みにくいため）

  // 失敗したときの結果画面の文
  const FAIL_TEXT = {
    sting: 'ハチが犬に届いてしまった',
    fall: '犬が落ちてしまった',
  };

  function drawBackground(ctx) {
    ctx.fillStyle = '#14162b';
    ctx.fillRect(0, 0, KG.W, HEADER);
    const g = ctx.createLinearGradient(0, HEADER, 0, KG.H);
    g.addColorStop(0, '#6fbdf2');
    g.addColorStop(1, '#d8f0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, HEADER, KG.W, KG.H - HEADER);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y, s] of [[90, 330, 1], [420, 250, 0.8], [330, 470, 0.6]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 46 * s, 18 * s, 0, 0, TAU);
      ctx.ellipse(x - 30 * s, y + 6 * s, 28 * s, 14 * s, 0, 0, TAU);
      ctx.ellipse(x + 32 * s, y + 5 * s, 30 * s, 13 * s, 0, 0, TAU);
      ctx.fill();
    }
  }

  // 地面と足場。上の面に草をのせる
  function drawBlocks(ctx, blocks) {
    for (const b of blocks) {
      const w = b[2] - b[0];
      const h = b[3] - b[1];
      ctx.fillStyle = '#6f4527';
      ctx.fillRect(b[0], b[1], w, h);
      ctx.fillStyle = '#86562f';
      ctx.fillRect(b[0] + 4, b[1] + 4, w - 8, Math.max(0, h - 8));
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = b[0] + 14; x < b[2] - 8; x += 38) {
        for (let y = b[1] + 30; y < b[3] - 8; y += 34) {
          ctx.beginPath();
          ctx.ellipse(x + ((y / 34) % 2) * 16, y, 5, 3, 0, 0, TAU);
          ctx.fill();
        }
      }
      const gh = Math.min(10, h);
      ctx.fillStyle = '#3f9a35';
      ctx.fillRect(b[0], b[1], w, gh);
      ctx.fillStyle = '#5cc04a';
      ctx.fillRect(b[0], b[1], w, gh - 3);
    }
  }

  // ハチの巣。上の枝からぶら下がっている
  function drawHive(ctx, h, t, blocks) {
    // 枝は、真上にある足場の下の面か、上の帯の下の端まで
    let top = HEADER;
    for (const b of blocks) if (h.x > b[0] && h.x < b[2] && b[3] <= h.y) top = Math.max(top, b[3]);
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(h.x, top);
    ctx.lineTo(h.x, h.y - SIM.HIVE_R + 4);
    ctx.stroke();
    if (top === HEADER) {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(h.x - 46, top + 4);
      ctx.lineTo(h.x + 40, top + 10);
      ctx.stroke();
    }
    const bands = [
      [-20, 15, 9],
      [-8, 23, 9],
      [4, 26, 9],
      [16, 20, 8],
    ];
    bands.forEach(([dy, rx, ry], i) => {
      ctx.fillStyle = i % 2 ? '#d99a2b' : '#efb441';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + dy, rx, ry, 0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = '#3a2810';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 15, 7, 5 + Math.sin(t * 0.2) * 0.6, 0, 0, TAU);
    ctx.fill();
  }

  // 犬（中心が x, y。足もとは y + DOG_R）。mood: normal / happy / stung
  function drawDog(ctx, x, y, mood, t) {
    const happy = mood === 'happy';
    const stung = mood === 'stung';
    ctx.save();
    ctx.translate(x, y);
    if (happy) ctx.translate(0, -Math.abs(Math.sin(t * 0.2)) * 8);
    if (stung) ctx.translate(Math.sin(t * 1.3) * 1.5, 0);
    const fur = '#f4e2bd';
    const line = '#b48c5c';
    const ear = '#9a6738';
    // しっぽ
    ctx.strokeStyle = fur;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const wag = happy ? Math.sin(t * 0.6) * 0.6 : 0.15;
    ctx.beginPath();
    ctx.moveTo(15, 18);
    ctx.quadraticCurveTo(28, 14 - wag * 8, 25 + wag * 6, 2);
    ctx.stroke();
    // 体
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.ellipse(0, 11, 20, 17, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(0, 11, 18.5, 15.5, 0, 0, TAU);
    ctx.fill();
    // 前足
    ctx.fillStyle = '#fff6e6';
    ctx.beginPath();
    ctx.ellipse(-8, 25, 6, 3.6, 0, 0, TAU);
    ctx.ellipse(8, 25, 6, 3.6, 0, 0, TAU);
    ctx.fill();
    // 首輪
    ctx.strokeStyle = '#e2453c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -10, 13, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
    // 頭
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.arc(0, -9, 17.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, -9, 16, 0, TAU);
    ctx.fill();
    // 片目のまわりのぶち
    ctx.fillStyle = '#d9b27c';
    ctx.beginPath();
    ctx.ellipse(6.5, -13, 6.5, 5.5, 0.3, 0, TAU);
    ctx.fill();
    // 耳（たれ耳）
    const flap = happy ? Math.sin(t * 0.4) * 0.15 : 0;
    ctx.fillStyle = ear;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 15, -10, 5.5, 11, s * (0.35 + flap), 0, TAU);
      ctx.fill();
    }
    // 鼻の上の白いところ
    ctx.fillStyle = '#fff8ea';
    ctx.beginPath();
    ctx.ellipse(0, -3, 8.5, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b1d14';
    ctx.beginPath();
    ctx.ellipse(0, -6, 3.4, 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2b1d14';
    ctx.lineWidth = 1.6;
    if (stung) {
      // ぎゅっとつぶった目と涙、刺されたこぶ
      ctx.beginPath();
      ctx.moveTo(-9, -15);
      ctx.lineTo(-4, -12.5);
      ctx.lineTo(-9, -10);
      ctx.moveTo(9, -15);
      ctx.lineTo(4, -12.5);
      ctx.lineTo(9, -10);
      ctx.stroke();
      ctx.fillStyle = '#7cc8ff';
      ctx.beginPath();
      ctx.ellipse(-8, -6, 1.8, 3, 0, 0, TAU);
      ctx.ellipse(8, -6, 1.8, 3, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 1);
      ctx.quadraticCurveTo(0, -2, 4, 1);
      ctx.stroke();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(-6, -24, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffb3b3';
      ctx.beginPath();
      ctx.arc(-7.5, -25.5, 1.8, 0, TAU);
      ctx.fill();
    } else if (happy) {
      ctx.beginPath();
      ctx.arc(-6.5, -12, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(9.5, -12);
      ctx.arc(6.5, -12, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = '#e8585e';
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 3, 3.6, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2b1d14';
      ctx.beginPath();
      ctx.arc(-6.5, -12.5, 2.4, 0, TAU);
      ctx.arc(6.5, -12.5, 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-5.8, -13.3, 0.8, 0, TAU);
      ctx.arc(7.2, -13.3, 0.8, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3.5, -1);
      ctx.quadraticCurveTo(-1.5, 1.2, 0, -1);
      ctx.quadraticCurveTo(1.5, 1.2, 3.5, -1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ハチ（中心が x, y）。進む向きに顔を向ける
  function drawBee(ctx, b, t, i) {
    const face = b.x - b.px < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(face, 1);
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.9 + i));
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-2, -6, 4, 6 * flap, -0.5, 0, TAU);
    ctx.ellipse(3, -6, 4, 6 * flap, 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-12, 1.5);
    ctx.lineTo(-8, 3);
    ctx.fill();
    ctx.fillStyle = '#ffcf33';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, 6.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-4.5, -5.6, 2.6, 11.2);
    ctx.fillRect(0.5, -6, 2.6, 12);
    ctx.beginPath();
    ctx.arc(6.5, -0.5, 3.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7.4, -1.4, 1.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function strokePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    ctx.stroke();
  }

  // 線。描いている途中は少し薄く、固まったら濃く
  function drawLine(ctx, pts, solid) {
    if (!pts || !pts.length) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = solid ? '#1f2027' : 'rgba(31,32,39,0.75)';
    ctx.lineWidth = SIM.LINE_R * 2;
    strokePath(ctx, pts);
    ctx.strokeStyle = solid ? '#4a4d5c' : 'rgba(90,94,112,0.7)';
    ctx.lineWidth = SIM.LINE_R * 0.8;
    strokePath(ctx, pts);
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const fx = [];
    let down = false;
    let lastHud = '';
    let blockedFx = 0;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      let text;
      if (sim.state === 'draw') text = 'インク ' + Math.round((100 * sim.inkLeft()) / sim.ink) + '%';
      else text = 'のこり ' + Math.ceil(sim.timeLeft() - 1e-9) + '秒';
      if (text === lastHud) return;
      lastHud = text;
      api.setHud(text);
    }

    function handle(e) {
      switch (e.type) {
        case 'solid':
          api.sound('pin');
          break;
        case 'sting':
          api.sound('sting');
          for (let i = 0; i < 6; i++) fx.push({ kind: 'star', x: e.x, y: e.y, a: (i / 6) * TAU + rnd(), t: 0 });
          break;
        case 'clear':
          for (const d of sim.dogs) for (let i = 0; i < 4; i++) fx.push({ kind: 'heart', x: d.x + (rnd() - 0.5) * 40, y: d.y - 30, t: -i * 10 });
          api.finish({ clear: true, title: 'クリア！', message: sim.dogs.length > 1 ? '2ひきとも守りきった' : '犬を守りきった', delay: 1100 });
          break;
        case 'fail':
          api.finish({ clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: 1300 });
          break;
      }
    }

    function step() {
      sim.step();
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
      if (sim.state === 'defend' && sim.bees.length && sim.t % 14 === 0) api.sound('buzz');
      if (blockedFx > 0) blockedFx--;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t++;
        if ((f.kind === 'star' && f.t >= 18) || (f.kind === 'heart' && f.t >= 50)) fx.splice(i, 1);
      }
      updateHud();
    }

    function drawFx(ctx) {
      for (const f of fx) {
        if (f.kind === 'star') {
          const k = f.t / 18;
          ctx.strokeStyle = 'rgba(255,90,90,' + (1 - k) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(f.a) * (4 + k * 10), f.y + Math.sin(f.a) * (4 + k * 10));
          ctx.lineTo(f.x + Math.cos(f.a) * (10 + k * 18), f.y + Math.sin(f.a) * (10 + k * 18));
          ctx.stroke();
        } else if (f.kind === 'heart' && f.t >= 0) {
          const k = f.t / 50;
          const x = f.x + Math.sin(f.t * 0.15) * 6;
          const y = f.y - f.t * 1.2;
          const s = 7 * (1 - k * 0.3);
          ctx.fillStyle = 'rgba(255,92,140,' + (1 - k) + ')';
          ctx.beginPath();
          ctx.moveTo(x, y + s);
          ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.4, x, y - s * 0.5);
          ctx.bezierCurveTo(x + s * 0.7, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s);
          ctx.fill();
        }
      }
    }

    function render(ctx) {
      drawBackground(ctx);
      drawBlocks(ctx, sim.blocks);
      for (const h of sim.hives) drawHive(ctx, h, sim.t, sim.blocks);
      for (const d of sim.dogs) {
        const mood = d.stung ? 'stung' : sim.state === 'clear' ? 'happy' : 'normal';
        drawDog(ctx, d.x, d.y, mood, sim.t);
      }
      if (sim.stroke) drawLine(ctx, sim.stroke, false);
      if (sim.line) drawLine(ctx, sim.line, true);
      sim.bees.forEach((b, i) => drawBee(ctx, b, sim.t, i));
      // 線が止められた所に、赤い × を少しの間だけ出す
      if (sim.blockedAt && sim.stroke) blockedFx = 20;
      if (blockedFx > 0 && sim.blockedAt) {
        const b = sim.blockedAt;
        ctx.strokeStyle = 'rgba(230,50,50,' + Math.min(1, blockedFx / 10) + ')';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - 7, b.y - 7);
        ctx.lineTo(b.x + 7, b.y + 7);
        ctx.moveTo(b.x + 7, b.y - 7);
        ctx.lineTo(b.x - 7, b.y + 7);
        ctx.stroke();
      }
      // 守っている間は、残りの秒数を大きく出す
      if (sim.state === 'defend') {
        const n = Math.ceil(sim.timeLeft() - 1e-9);
        ctx.font = '900 76px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(20,40,70,0.35)';
        ctx.strokeText(String(n), KG.W / 2, 222);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(String(n), KG.W / 2, 222);
      }
      drawFx(ctx);
    }

    function pointerDown(x, y) {
      down = true;
      if (sim.state === 'draw') sim.beginStroke(x, y);
    }

    // 引けない所から描き始めても、指がそこを出たところから線が始まる
    function pointerMove(x, y) {
      if (!down || sim.state !== 'draw') return;
      if (sim.stroke) sim.extendStroke(x, y);
      else sim.beginStroke(x, y);
    }

    function pointerUp() {
      down = false;
      if (sim.stroke) sim.endStroke();
    }

    return { step, render, pointerDown, pointerMove, pointerUp, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, '#6fbdf2');
    g.addColorStop(1, '#d8f0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#86562f';
    ctx.fillRect(0, 80, 96, 16);
    ctx.fillStyle = '#5cc04a';
    ctx.fillRect(0, 80, 96, 5);
    ctx.save();
    ctx.translate(48, 66);
    ctx.scale(0.5, 0.5);
    drawDog(ctx, 0, 0, 'normal', 0);
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2027';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(48, 79, 27, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    for (const [x, y] of [[18, 26], [36, 14], [62, 20], [80, 34]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.75, 0.75);
      drawBee(ctx, { x: 0, y: 0, px: x < 48 ? -1 : 1, py: 0 }, 3, x);
      ctx.restore();
    }
  }

  KG.registerGame({
    id: 'guard',
    title: '線を引いて守る',
    desc: '線を1本描いて壁にし、ハチの群れから犬を守る',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
