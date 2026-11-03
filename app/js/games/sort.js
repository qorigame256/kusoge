// 水の色分けの見た目（描画・タップ・音と演出）。注ぐ決まりと判定は sort-sim.js が持つ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.sortSim;
  const LEVELS = KG.sortLevels;
  const TAU = Math.PI * 2;
  const CAP = SIM.CAP;
  const TW = 60; // 試験管の幅
  const LH = 44; // 1段の高さ
  const TOP_PAD = 18; // いちばん上の段より上の、空いているところ
  const TH = CAP * LH + TOP_PAD + 4; // 試験管の高さ
  const LIFT = 30; // 選んだ試験管を持ち上げる高さ
  const POUR_FRAMES = 18; // 注ぐ動きの長さ（刻み）

  // 色の文字ごとの色（見分けやすいよう、明るさも少しずつ変える）
  const PALETTE = {
    A: '#ef4b4b',
    B: '#3d7cff',
    C: '#ffd23f',
    D: '#3cc45a',
    E: '#a35cf0',
    F: '#ff8c1a',
    G: '#ff7ab8',
    H: '#4fd6e8',
    I: '#9a6436',
  };

  // 試験管を並べる位置。6本までは1段、それより多いと2段に分ける
  function layout(n) {
    const rows = n <= 6 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)];
    const bottoms = rows.length === 1 ? [660] : [540, 840];
    const out = [];
    rows.forEach((m, r) => {
      const gap = Math.min(92, 500 / m);
      for (let i = 0; i < m; i++) out.push({ cx: KG.W / 2 + (i - (m - 1) / 2) * gap, bottom: bottoms[r], gap, row: r });
    });
    return out;
  }

  function tubePath(ctx, cx, bottom, inset) {
    const r = TW / 2 - inset;
    const top = bottom - TH + inset;
    ctx.beginPath();
    ctx.moveTo(cx - r, top);
    ctx.lineTo(cx - r, bottom - TW / 2);
    ctx.arc(cx, bottom - TW / 2, r, Math.PI, 0, true);
    ctx.lineTo(cx + r, top);
  }

  function drawBackground(ctx, pos) {
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // 試験管立ての板（段ごとに1枚）
    const rows = {};
    for (const p of pos) {
      const r = rows[p.row] || (rows[p.row] = { x1: Infinity, x2: -Infinity, y: p.bottom, gap: p.gap });
      r.x1 = Math.min(r.x1, p.cx);
      r.x2 = Math.max(r.x2, p.cx);
    }
    for (const k in rows) {
      const r = rows[k];
      const x1 = r.x1 - r.gap / 2 - 6;
      const w = r.x2 - r.x1 + r.gap + 12;
      ctx.fillStyle = '#5a3d24';
      ctx.beginPath();
      ctx.roundRect(x1, r.y + 4, w, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#8a6040';
      ctx.beginPath();
      ctx.roundRect(x1, r.y + 4, w, 7, 4);
      ctx.fill();
    }
  }

  // 段を下から積む。layers は [{c, hidden, h}]（h は段の高さ。注いでいる途中だけ LH より低い）
  function drawLiquid(ctx, cx, bottom, layers) {
    ctx.save();
    tubePath(ctx, cx, bottom, 4);
    ctx.closePath();
    ctx.clip();
    let y = bottom - 4;
    for (let k = 0; k < layers.length; k++) {
      const L = layers[k];
      if (L.h <= 0) continue;
      const y0 = y - L.h;
      // いちばん下の段は丸い底まで塗る
      const y1 = k === 0 ? bottom : y;
      if (L.hidden) {
        ctx.fillStyle = '#2c3150';
        ctx.fillRect(cx - TW / 2, y0, TW, y1 - y0);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '900 24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, y0 + L.h / 2 + (k === 0 ? -4 : 0));
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx - TW / 2, y0, TW, 2);
      } else {
        ctx.fillStyle = PALETTE[L.c] || '#ccc';
        ctx.fillRect(cx - TW / 2, y0, TW, y1 - y0);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(cx - TW / 2 + 9, y0, 7, y1 - y0);
        // 下の段と色が違うときだけ、境めに薄い影を入れる（同じ色はひとかたまりの水に見せる）
        const below = layers[k - 1];
        if (below && (below.hidden || below.c !== L.c)) {
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(cx - TW / 2, y0 + L.h - 2, TW, 2);
        }
      }
      y = y0;
    }
    // 水面
    if (layers.length && layers[layers.length - 1].h > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(cx - TW / 2, y, TW, 3);
    }
    ctx.restore();
  }

  function drawGlass(ctx, cx, bottom, selected, done) {
    tubePath(ctx, cx, bottom, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = selected ? 4.5 : 3.5;
    ctx.strokeStyle = selected ? '#ffcc33' : 'rgba(220,235,255,0.75)';
    ctx.stroke();
    // 口のふち
    const top = bottom - TH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - TW / 2 - 6, top);
    ctx.lineTo(cx + TW / 2 + 6, top);
    ctx.stroke();
    // ガラスの光
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + TW / 2 - 10, top + 14);
    ctx.lineTo(cx + TW / 2 - 10, bottom - TW / 2 - 4);
    ctx.stroke();
    if (done) {
      // そろったらコルクの栓をする
      ctx.fillStyle = '#b7834f';
      ctx.beginPath();
      ctx.roundRect(cx - TW / 2 + 6, top - 12, TW - 12, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#d9a46c';
      ctx.beginPath();
      ctx.roundRect(cx - TW / 2 + 6, top - 12, TW - 12, 7, 4);
      ctx.fill();
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const pos = layout(sim.tubes.length);
    const fx = [];
    let anim = null; // 注いでいる途中 { from, to, color, n, t }
    let t = 0;
    const shake = {}; // 試験管の番号 → 首を振っている残りの刻み

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('手数 ' + sim.moves);
    }

    function handle(e) {
      switch (e.type) {
        case 'select':
          api.sound('tap');
          break;
        case 'deselect':
          break;
        case 'deny':
          shake[e.tube] = 12;
          api.sound('hit');
          break;
        case 'pour':
          anim = { from: e.from, to: e.to, color: e.color, n: e.n, t: 0 };
          api.sound('pour');
          updateHud();
          break;
        case 'done':
          for (let i = 0; i < 8; i++) fx.push({ kind: 'spark', tube: e.tube, a: (i / 8) * TAU, t: -POUR_FRAMES });
          setTimeout(() => api.sound('up'), 280);
          break;
        case 'clear':
          api.finish({ clear: true, title: 'クリア！', message: sim.moves + '手でそろえた', delay: 1000 });
          break;
        case 'fail':
          api.finish({ clear: false, title: '失敗', message: 'そろえられる注ぎ方が、もう無い', delay: 1000 });
          break;
      }
    }

    function flush() {
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
    }

    function step() {
      t++;
      if (anim && ++anim.t >= POUR_FRAMES) anim = null;
      for (const k in shake) if (--shake[k] <= 0) delete shake[k];
      for (let i = fx.length - 1; i >= 0; i--) if (++fx[i].t >= 24) fx.splice(i, 1);
    }

    // i 本目の試験管に見せる段の並び（注いでいる途中は、移る段の高さを少しずつ変える）
    function layersOf(i) {
      const tube = sim.tubes[i];
      const hid = sim.hidden[i];
      const out = tube.map((c, k) => ({ c, hidden: hid[k], h: LH }));
      if (anim) {
        const p = anim.t / POUR_FRAMES;
        if (i === anim.from) for (let k = 0; k < anim.n; k++) out.push({ c: anim.color, hidden: false, h: LH * (1 - p) });
        if (i === anim.to) for (let k = out.length - anim.n; k < out.length; k++) out[k].h = LH * p;
      }
      return out;
    }

    function liftOf(i) {
      if (anim && i === anim.from) return LIFT;
      return i === sim.selected ? LIFT : 0;
    }

    function render(ctx) {
      drawBackground(ctx, pos);
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i];
        const dx = shake[i] ? Math.sin(shake[i] * 1.6) * 5 : 0;
        const b = p.bottom - liftOf(i);
        drawLiquid(ctx, p.cx + dx, b, layersOf(i));
        drawGlass(ctx, p.cx + dx, b, i === sim.selected, sim.isDone(i) && !(anim && anim.to === i));
      }
      // 注いでいる水の流れ
      if (anim) {
        const a = pos[anim.from];
        const d = pos[anim.to];
        const ax = a.cx + (d.cx > a.cx ? 1 : -1) * (TW / 2);
        const ay = a.bottom - LIFT - TH;
        const dy = d.bottom - TH + 6;
        ctx.strokeStyle = PALETTE[anim.color];
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + d.cx) / 2, Math.min(ay, dy) - 50, d.cx, dy);
        ctx.stroke();
      }
      for (const f of fx) {
        if (f.t < 0) continue;
        const p = pos[f.tube];
        const k = f.t / 24;
        const cx = p.cx;
        const cy = p.bottom - TH / 2;
        ctx.strokeStyle = 'rgba(255,240,150,' + (1 - k) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(f.a) * (40 + k * 30), cy + Math.sin(f.a) * (70 + k * 40));
        ctx.lineTo(cx + Math.cos(f.a) * (52 + k * 40), cy + Math.sin(f.a) * (86 + k * 50));
        ctx.stroke();
      }
    }

    function pointerDown(x, y) {
      if (anim) return; // 注いでいる途中のタップは受け付けない
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i];
        const b = p.bottom - liftOf(i);
        if (Math.abs(x - p.cx) < p.gap / 2 && y > b - TH - 50 && y < b + 24) {
          sim.tap(i);
          flush();
          return;
        }
      }
      // 試験管の外をタップしたら、選んでいたのをやめる
      if (sim.selected >= 0) {
        sim.selected = -1;
      }
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
    const tubes = [['A', 'B', 'A', 'C'], ['B', 'C', 'B'], ['C', 'A']];
    tubes.forEach((tube, i) => {
      const cx = 22 + i * 26;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 9, 16);
      ctx.lineTo(cx - 9, 76);
      ctx.arc(cx, 76, 9, Math.PI, 0, true);
      ctx.lineTo(cx + 9, 16);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      tube.forEach((c, k) => {
        ctx.fillStyle = PALETTE[c];
        ctx.fillRect(cx - 10, 85 - (k + 1) * 16, 20, k === 0 ? 20 : 16);
      });
      ctx.restore();
      ctx.strokeStyle = 'rgba(220,235,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });
  }

  KG.registerGame({
    id: 'sort',
    title: '水の色分け',
    desc: '試験管の色水を移し替えて、色ごとにそろえる',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
