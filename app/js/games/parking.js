// 駐車場から車を出すの見た目（描画・タップ・音と演出）。車の動きと勝ち負けは parking-sim.js が持つ。
// sim はタップした瞬間に車を動かし終える。ここでは見た目の位置（vis）を少しずつ追いつかせて、走る・止まる・出ていく様子を描く。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const SIM = KG.parkingSim;
  const LEVELS = KG.parkingLevels;
  const DIRS = SIM.DIRS;
  const TAU = Math.PI * 2;
  // 駐車場を置ける範囲とマスの大きさの上限（tools/test-parking.js の AREA_W・AREA_H・CELL_MAX と揃える）
  const AREA_X = 24;
  const AREA_Y = 150;
  const AREA_W = 492;
  const AREA_H = 770;
  const CELL_MAX = 80;
  const ROAD = 20; // 駐車場のまわりの道の幅
  const V0 = 0.12; // 走り出しの速さ（マス/刻み）
  const ACC = 0.05; // 1刻みで増える速さ
  const VMAX = 0.75; // いちばん速いとき
  // 車の色。金色の車とまぎれないよう、黄色・だいだい色は使わない
  const BODY = ['#ef4b4b', '#3d7cff', '#3cc45a', '#a35cf0', '#ff7ab8', '#2ec4d6', '#8e99ad', '#9a6436'];
  const FAIL_TEXT = { stuck: 'どの車も動けなくなった', nosafe: 'どれを動かしても金色の車にぶつかる', gold: '金色の車にぶつかった' };
  const ROT = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };

  function layout(level) {
    const S = Math.min(CELL_MAX, Math.floor(AREA_W / level.cols), Math.floor(AREA_H / level.rows));
    const w = S * level.cols;
    const h = S * level.rows;
    return { S, w, h, ox: Math.round(AREA_X + (AREA_W - w) / 2), oy: Math.round(AREA_Y + (AREA_H - h) / 2) };
  }

  function horizontal(dir) {
    return dir === 'L' || dir === 'R';
  }

  // 4つのとがりのある星（金色の車のきらめき・ぶつかった所）
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const rr = k % 2 ? r * 0.32 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 上から見た車。中心 (cx, cy)、前の向き dir、長さ L・幅 W（ピクセル）。truck はトラック、gold は金色の車
  function drawCar(ctx, cx, cy, dir, L, W, color, truck, gold, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ROT[dir]);
    // ここから先は、車の前が +x の向き
    const hl = L / 2;
    const hw = W / 2;
    const r = W * 0.26;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(-hl + 2, -hw + 4, L, W, r);
    ctx.fill();
    let paint = color;
    if (gold) {
      const g = ctx.createLinearGradient(0, -hw, 0, hw);
      g.addColorStop(0, '#fff0a0');
      g.addColorStop(0.5, '#f4c534');
      g.addColorStop(1, '#c98f12');
      paint = g;
    }
    let arrowX = 0; // 矢印を描く所
    if (truck) {
      // 1台に見えるよう、車体は1つの四角で塗り、荷台はその上に明るい箱として重ねる（運転席と離して描くと、小さな別の車に見えた）
      const cab = W * 0.9; // 運転席の長さ
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.roundRect(-hl, -hw, L, W, r * 0.6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 荷台（白っぽい箱と、横の筋）
      const bx = -hl + 3;
      const bw = L - cab - 6;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.roundRect(bx, -hw + 3, bw, W - 6, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) {
        const x = bx + (bw * k) / 5;
        ctx.beginPath();
        ctx.moveTo(x, -hw + 6);
        ctx.lineTo(x, hw - 6);
        ctx.stroke();
      }
      // 運転席の前の窓
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath();
      ctx.roundRect(hl - cab * 0.5, -hw * 0.7, cab * 0.28, W * 0.7, 3);
      ctx.fill();
      arrowX = bx + bw / 2;
    } else {
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.roundRect(-hl, -hw, L, W, r);
      ctx.fill();
      // 金色の車はふちを明るく光らせて、ほかの車と見分けやすくする
      ctx.strokeStyle = gold ? '#fff6c4' : 'rgba(0,0,0,0.18)';
      ctx.lineWidth = gold ? 3 : 2;
      ctx.stroke();
      // 屋根
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.roundRect(-hl + L * 0.2, -hw * 0.74, L * 0.46, W * 0.74, 6);
      ctx.fill();
      // 前と後ろの窓
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath();
      ctx.moveTo(hl - L * 0.32, -hw * 0.74);
      ctx.lineTo(hl - L * 0.17, -hw * 0.6);
      ctx.lineTo(hl - L * 0.17, hw * 0.6);
      ctx.lineTo(hl - L * 0.32, hw * 0.74);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-hl + L * 0.08, -hw * 0.6, L * 0.09, W * 0.6, 3);
      ctx.fill();
      arrowX = -hl + L * 0.43;
    }
    // 前のライトと後ろのランプ
    ctx.fillStyle = '#fff3a6';
    ctx.fillRect(hl - 4, -hw * 0.78, 3, W * 0.2);
    ctx.fillRect(hl - 4, hw * 0.58, 3, W * 0.2);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(-hl + 1, -hw * 0.74, 3, W * 0.16);
    ctx.fillRect(-hl + 1, hw * 0.58, 3, W * 0.16);
    // 進む向きの矢印
    const a = W * 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(4, W * 0.13);
    ctx.beginPath();
    ctx.moveTo(arrowX - a * 0.6, -a);
    ctx.lineTo(arrowX + a * 0.6, 0);
    ctx.lineTo(arrowX - a * 0.6, a);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2.5, W * 0.08);
    ctx.stroke();
    ctx.restore();
    if (gold) {
      // きらめき（車の向きに関係なく、まわりで光る）
      ctx.fillStyle = '#fffbe0';
      const span = Math.max(L, W) / 2;
      for (let k = 0; k < 3; k++) {
        const p = (t / 40 + k / 3) % 1;
        const s = Math.sin(p * Math.PI);
        const ang = k * 2.2 + 0.6;
        star(ctx, cx + Math.cos(ang) * span * 0.62, cy + Math.sin(ang) * span * 0.5, 2 + s * 5);
      }
    }
  }

  function drawLot(ctx, L, level) {
    const g = ctx.createLinearGradient(0, 0, 0, KG.H);
    g.addColorStop(0, '#20244a');
    g.addColorStop(1, '#14162b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, KG.W, KG.H);
    // まわりの道と、道のまん中の破線
    ctx.fillStyle = '#2b2f3c';
    ctx.beginPath();
    ctx.roundRect(L.ox - ROAD, L.oy - ROAD, L.w + ROAD * 2, L.h + ROAD * 2, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,90,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.roundRect(L.ox - ROAD / 2, L.oy - ROAD / 2, L.w + ROAD, L.h + ROAD, 12);
    ctx.stroke();
    ctx.setLineDash([]);
    // 駐車場の地面と縁石
    ctx.fillStyle = '#4b5162';
    ctx.beginPath();
    ctx.roundRect(L.ox, L.oy, L.w, L.h, 6);
    ctx.fill();
    ctx.strokeStyle = '#8f98ad';
    ctx.lineWidth = 3;
    ctx.stroke();
    // マス目の角の白い印
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    const m = Math.max(4, L.S * 0.09);
    for (let y = 1; y < level.rows; y++) {
      for (let x = 1; x < level.cols; x++) {
        const px = L.ox + x * L.S;
        const py = L.oy + y * L.S;
        ctx.fillRect(px - m, py - 1, m * 2, 2);
        ctx.fillRect(px - 1, py - m, 2, m * 2);
      }
    }
  }

  function create(api, levelIndex) {
    const level = LEVELS[levelIndex];
    const sim = SIM.createSim(level);
    const L = layout(level);
    const S = L.S;
    const pad = Math.max(3, S * 0.07); // 車とマスの境めのすき間
    const vis = sim.cars.map((c) => ({ x: c.x, y: c.y, gone: false })); // 見た目の位置（マス）
    const mov = {}; // 車の番号 → 走っている途中 { tx, ty, v, exit, hit }
    const shake = {}; // 車の番号 → 揺れ { t, n, kind, dir }
    const fx = []; // ぶつかった所の星
    let pending = null; // 勝ち負けが決まったら、ぶつかる動きが終わってから結果を出す
    let t = 0;

    api.setHint(level.hint || '');
    updateHud();

    function updateHud() {
      api.setHud('のこり ' + sim.left() + '台');
    }

    // 見た目の位置での、車の四角（ピクセル）
    function rectOf(i) {
      const c = sim.cars[i];
      const v = vis[i];
      const h = horizontal(c.dir);
      return { x: L.ox + v.x * S, y: L.oy + v.y * S, w: (h ? c.len : 1) * S, h: (h ? 1 : c.len) * S };
    }

    function overlaps(r, x, y, w, h) {
      return r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;
    }

    // タップを受け付けない間（止まる途中の車がいるか、出ていく車がまだ駐車場の上にいる）
    function busy() {
      for (const k in mov) {
        if (!mov[k].exit) return true;
        if (overlaps(rectOf(Number(k)), L.ox, L.oy, L.w, L.h)) return true;
      }
      return false;
    }

    function handle(e) {
      switch (e.type) {
        case 'exit': {
          const c = sim.cars[e.car];
          const [dx, dy] = DIRS[c.dir];
          const far = level.cols + level.rows + 10; // 画面の外まで十分に（マス）
          mov[e.car] = { tx: e.from.x + dx * far, ty: e.from.y + dy * far, v: V0, exit: true };
          api.sound('drive');
          updateHud();
          break;
        }
        case 'move':
          mov[e.car] = { tx: sim.cars[e.car].x, ty: sim.cars[e.car].y, v: V0, exit: false, hit: e.hit };
          api.sound('drive');
          break;
        case 'deny':
          shake[e.car] = { t: 16, n: 16, kind: 'deny', dir: sim.cars[e.car].dir };
          api.sound('honk');
          break;
        case 'fail':
          pending = { clear: false, title: '失敗', message: FAIL_TEXT[e.reason] || '', delay: 900 };
          break;
        case 'clear':
          pending = { clear: true, title: 'クリア！', message: '全部の車を出した（' + sim.moves + '手）', delay: 900 };
          break;
      }
    }

    function flush() {
      for (const e of sim.events) handle(e);
      sim.events.length = 0;
    }

    // ぶつかった所（動いた車のいちばん前の、まん中）
    function frontPoint(i) {
      const c = sim.cars[i];
      const r = rectOf(i);
      if (c.dir === 'R') return [r.x + r.w, r.y + r.h / 2];
      if (c.dir === 'L') return [r.x, r.y + r.h / 2];
      if (c.dir === 'D') return [r.x + r.w / 2, r.y + r.h];
      return [r.x + r.w / 2, r.y];
    }

    function step() {
      t++;
      for (const k in mov) {
        const i = Number(k);
        const m = mov[k];
        const c = sim.cars[i];
        const [dx, dy] = DIRS[c.dir];
        const v = vis[i];
        m.v = Math.min(VMAX, m.v + ACC);
        const rem = (m.tx - v.x) * dx + (m.ty - v.y) * dy;
        const d = Math.min(m.v, rem);
        v.x += dx * d;
        v.y += dy * d;
        if (m.exit) {
          if (!overlaps(rectOf(i), 0, 0, KG.W, KG.H)) {
            v.gone = true;
            delete mov[k];
          }
        } else if (rem - d <= 1e-6) {
          v.x = m.tx;
          v.y = m.ty;
          delete mov[k];
          shake[m.hit] = { t: 12, n: 12, kind: 'bump', dir: c.dir };
          shake[i] = { t: 8, n: 8, kind: 'recoil', dir: c.dir };
          const [px, py] = frontPoint(i);
          fx.push({ x: px, y: py, t: 0, gold: c.gold || sim.cars[m.hit].gold });
          api.sound('hit');
        }
      }
      for (const k in shake) if (--shake[k].t <= 0) delete shake[k];
      for (let j = fx.length - 1; j >= 0; j--) if (++fx[j].t >= 22) fx.splice(j, 1);
      if (pending && !Object.keys(mov).some((k) => !mov[k].exit)) {
        api.finish(pending);
        pending = null;
      }
    }

    // 揺れのずれ（ピクセル）
    function shakeOffset(i) {
      const s = shake[i];
      if (!s) return [0, 0];
      const [dx, dy] = DIRS[s.dir];
      const k = s.t / s.n;
      if (s.kind === 'deny') {
        // 進めない車は、横にぶるっと震える
        const w = Math.sin(s.t * 1.7) * 3 * k;
        return [-dy * w, dx * w];
      }
      const amp = s.kind === 'bump' ? 5 : -3;
      return [dx * amp * k, dy * amp * k];
    }

    function render(ctx) {
      drawLot(ctx, L, level);
      for (let i = 0; i < sim.cars.length; i++) {
        if (vis[i].gone) continue;
        const c = sim.cars[i];
        const r = rectOf(i);
        const [ox, oy] = shakeOffset(i);
        const h = horizontal(c.dir);
        const len = (h ? r.w : r.h) - pad * 2;
        const wid = (h ? r.h : r.w) - pad * 2;
        drawCar(ctx, r.x + r.w / 2 + ox, r.y + r.h / 2 + oy, c.dir, len, wid, BODY[i % BODY.length], c.len === 3, c.gold, t);
      }
      for (const f of fx) {
        const k = f.t / 22;
        ctx.fillStyle = f.gold ? 'rgba(255,90,70,' + (1 - k) + ')' : 'rgba(255,240,170,' + (1 - k) + ')';
        star(ctx, f.x, f.y, 6 + k * 10);
      }
    }

    function pointerDown(x, y) {
      if (sim.state !== 'play' || busy()) return;
      const cx = Math.floor((x - L.ox) / S);
      const cy = Math.floor((y - L.oy) / S);
      if (cx < 0 || cy < 0 || cx >= level.cols || cy >= level.rows) return;
      const i = sim.carAt(cx, cy);
      if (i < 0) return;
      sim.tap(i);
      flush();
    }

    return { step, render, pointerDown, sim };
  }

  // 一覧に出す小さな絵（96×96）
  function drawIcon(ctx) {
    ctx.fillStyle = '#2b2f3c';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#4b5162';
    ctx.beginPath();
    ctx.roundRect(7, 7, 68, 82, 6);
    ctx.fill();
    ctx.strokeStyle = '#8f98ad';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCar(ctx, 67, 26, 'R', 44, 22, BODY[0], false, false, 0); // 右へ出ていく車
    drawCar(ctx, 22, 64, 'U', 42, 22, BODY[1], false, false, 0);
    drawCar(ctx, 55, 72, 'L', 38, 22, BODY[2], false, false, 0);
    // 走っている印
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const [x, y, w] of [[30, 19, 9], [26, 26, 12], [30, 33, 9]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    }
  }

  KG.registerGame({
    id: 'parking',
    title: '駐車場から車を出す',
    desc: '車をタップして走らせ、駐車場から全部出す',
    levels: LEVELS.map((l) => ({ name: l.name })),
    drawIcon,
    create,
  });
})();
