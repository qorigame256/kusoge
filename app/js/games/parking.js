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
  const FAIL_TEXT = { stuck: 'どの車も動けなくなった', nosafe: 'どれを動かしても金色の車にぶつかる', gold: '金色の車が大破した' };
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

  // 車体の形（前が +x）。後ろ（x0）の角は小さく、前（x1）の角は大きく丸めて、どちらが前かを形でも見分けられるようにする
  function bodyPath(ctx, x0, x1, hw, rr, rf) {
    ctx.beginPath();
    ctx.moveTo(x0 + rr, -hw);
    ctx.lineTo(x1 - rf, -hw);
    ctx.quadraticCurveTo(x1, -hw, x1, -hw + rf);
    ctx.lineTo(x1, hw - rf);
    ctx.quadraticCurveTo(x1, hw, x1 - rf, hw);
    ctx.lineTo(x0 + rr, hw);
    ctx.quadraticCurveTo(x0, hw, x0, hw - rr);
    ctx.lineTo(x0, -hw + rr);
    ctx.quadraticCurveTo(x0, -hw, x0 + rr, -hw);
    ctx.closePath();
  }

  // 太い矢印（前が +x）。x はまん中、len は長さ、hh は頭の高さの半分、sh は軸の太さの半分
  function arrowPath(ctx, x, len, hh, sh) {
    const tip = x + len / 2;
    const tail = x - len / 2;
    const neck = tip - len * 0.46;
    ctx.beginPath();
    ctx.moveTo(tip, 0);
    ctx.lineTo(neck, -hh);
    ctx.lineTo(neck, -sh);
    ctx.lineTo(tail, -sh);
    ctx.lineTo(tail, sh);
    ctx.lineTo(neck, sh);
    ctx.lineTo(neck, hh);
    ctx.closePath();
  }

  // 前の窓（濃い色のガラスに光の筋）。x0 から x1 まで、後ろの端の高さの半分 h0・前の端の高さの半分 h1
  function windshield(ctx, x0, x1, h0, h1) {
    ctx.fillStyle = '#2a3552';
    ctx.beginPath();
    ctx.moveTo(x0, -h0);
    ctx.lineTo(x1, -h1);
    ctx.lineTo(x1, h1);
    ctx.lineTo(x0, h0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + (x1 - x0) * 0.35, -h0 * 0.7);
    ctx.lineTo(x0 + (x1 - x0) * 0.35, h0 * 0.2);
    ctx.stroke();
  }

  // 前のライトの光。車より先に全部描くので、すぐ前に車がいればその車に隠れ、空いている所にだけ光が見える
  function drawBeam(ctx, cx, cy, dir, L, W) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ROT[dir]);
    const hl = L / 2;
    const hw = W / 2;
    const reach = W * 0.62;
    const g = ctx.createLinearGradient(hl, 0, hl + reach, 0);
    g.addColorStop(0, 'rgba(255,244,170,0.5)');
    g.addColorStop(1, 'rgba(255,244,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hl - 4, -hw * 0.72);
    ctx.lineTo(hl + reach, -hw * 0.98);
    ctx.lineTo(hl + reach, hw * 0.98);
    ctx.lineTo(hl - 4, hw * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 大破した車の傷（前が +x の向きで描く）。焦げてつやが消え、ぶつかった所 (ix, iy) がへこみ、前の窓にひびが入る。
  // 爆発や画面の揺れは足さない（CLAUDE.md「広告の『お約束』の演出は入れない」の、失敗したときの大げさな演出）
  function drawDamage(ctx, L, hl, hw, rr, rf, ix, iy) {
    ctx.save();
    bodyPath(ctx, -hl, hl, hw, rr, rf);
    ctx.clip();
    ctx.fillStyle = 'rgba(55,35,15,0.45)';
    ctx.fillRect(-hl, -hw, hl * 2, hw * 2);
    // へこみ（ぎざぎざの濃い形。縁の明るい線で、つぶれた金属に見せる）と、そこから伸びるしわ
    const r = hw * 1.35;
    ctx.fillStyle = 'rgba(45,30,12,0.9)';
    ctx.beginPath();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      const rk = r * (k % 2 ? 0.55 : 1) * (0.8 + 0.2 * Math.sin(k * 2.3));
      ctx.lineTo(ix + Math.cos(a) * rk, iy + Math.sin(a) * rk);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,140,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,170,0.75)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + 0.4;
      ctx.beginPath();
      ctx.moveTo(ix + Math.cos(a) * r * 0.35, iy + Math.sin(a) * r * 0.35);
      ctx.lineTo(ix + Math.cos(a + 0.3) * r * 1.6, iy + Math.sin(a + 0.3) * r * 1.6);
      ctx.stroke();
    }
    // 前の窓のひび（1点から放射状に割れる）
    const wx = hl - L * 0.28;
    const wy = -hw * 0.18;
    ctx.strokeStyle = 'rgba(235,245,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      const len = hw * (0.45 + 0.25 * ((k * 5) % 3) / 2);
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(a) * len, wy + Math.sin(a) * len);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k <= 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      ctx.lineTo(wx + Math.cos(a) * hw * 0.24, wy + Math.sin(a) * hw * 0.24);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 大破した車から上がる黒い煙（画面の上へのぼって消える。くり返す）。age は大破してからの刻み。
  // 駐車場の地面（灰色）と同じような明るさの灰色にすると、ほとんど見えなかった
  function drawSmoke(ctx, cx, cy, W, age) {
    for (let k = 0; k < 4; k++) {
      const start = k * 12;
      if (age < start) continue;
      const p = ((age - start) / 70) % 1;
      const x = cx + Math.sin(p * 4 + k * 1.9) * W * 0.18;
      const y = cy - W * 0.1 - p * W * 1.6;
      const rad = W * (0.2 + p * 0.36);
      // ふちをぼかす（くっきりした丸では、しみのように見えた）
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(24,24,30,' + (0.7 * (1 - p)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(24,24,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  }

  // 上から見た車。中心 (cx, cy)、前の向き dir、長さ L・幅 W（ピクセル）。truck はトラック、gold は金色の車。
  // 向きは「太い白い矢印」「丸い鼻先と角ばったお尻」「前だけの大きな濃い窓とライト」で示し、前を照らす光（drawBeam）も重ねる
  // （最初の、細い矢印と前後に同じような窓の絵では、向きが分かりづらいと言われた）。
  // wreck は大破した車のぶつかった所 { ix, iy }（前が +x の向き）。大破した車はきらめかない
  function drawCar(ctx, cx, cy, dir, L, W, color, truck, gold, t, wreck) {
    const hl = L / 2;
    const hw = W / 2;
    const rr = W * 0.16; // 後ろの角の丸み
    const rf = hw * 0.9; // 前の角の丸み（大きく丸める）
    // 影（画面の右下へ落とす）
    ctx.save();
    ctx.translate(cx + 2, cy + 4);
    ctx.rotate(ROT[dir]);
    bodyPath(ctx, -hl, hl, hw, rr, rf);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ROT[dir]);
    // ここから先は、車の前が +x の向き
    let paint = color;
    if (gold) {
      const g = ctx.createLinearGradient(0, -hw, 0, hw);
      g.addColorStop(0, '#fff0a0');
      g.addColorStop(0.5, '#f4c534');
      g.addColorStop(1, '#c98f12');
      paint = g;
    }
    bodyPath(ctx, -hl, hl, hw, rr, rf);
    ctx.fillStyle = paint;
    ctx.fill();
    // 金色の車はふちを明るく光らせて、ほかの車と見分けやすくする
    ctx.strokeStyle = gold ? '#fff6c4' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = gold ? 3 : 2;
    ctx.stroke();
    let arrowX;
    let arrowLen;
    if (truck) {
      // 1台に見えるよう、車体は1つの形で塗り、荷台はその上に明るい箱として重ねる（運転席と離して描くと、小さな別の車に見えた）
      const cab = W * 0.95; // 運転席の長さ
      const bx = -hl + 4;
      const bw = L - cab - 6;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.roundRect(bx, -hw + 4, bw, W - 8, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) {
        const x = bx + (bw * k) / 5;
        ctx.beginPath();
        ctx.moveTo(x, -hw + 7);
        ctx.lineTo(x, hw - 7);
        ctx.stroke();
      }
      windshield(ctx, hl - cab * 0.62, hl - cab * 0.3, hw * 0.8, hw * 0.66);
      arrowX = bx + bw / 2;
      arrowLen = Math.min(bw * 0.72, L * 0.34);
    } else {
      // 後ろの窓は小さく、前の窓は大きく
      ctx.fillStyle = '#2a3552';
      ctx.beginPath();
      ctx.roundRect(-hl + L * 0.07, -hw * 0.56, L * 0.06, W * 0.56, 3);
      ctx.fill();
      windshield(ctx, hl - L * 0.35, hl - L * 0.2, hw * 0.8, hw * 0.64);
      arrowX = -hl + L * 0.42;
      arrowLen = L * 0.4;
    }
    // 前のライトと後ろのランプ
    ctx.fillStyle = '#fffbe0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hl - 6, s * hw * 0.52, 3.5, W * 0.1, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(-hl + 1, -hw * 0.72, 3, W * 0.16);
    ctx.fillRect(-hl + 1, hw * 0.56, 3, W * 0.16);
    // 進む向きの太い矢印
    arrowPath(ctx, arrowX, arrowLen, W * 0.3, W * 0.11);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(3, W * 0.07);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (wreck) drawDamage(ctx, L, hl, hw, rr, rf, wreck.ix, wreck.iy);
    ctx.restore();
    if (gold && !wreck) {
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
    const wreck = {}; // 車の番号 → 大破 { t（大破してからの刻み）, ix, iy（ぶつかった所。drawCar の wreck）}
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

    // 画面の点 (px, py) を、j 番の車の中心から見た「前が +x」の向きの位置に直す（車体の中に収める）
    function localPoint(j, px, py) {
      const c = sim.cars[j];
      const r = rectOf(j);
      const dx = px - (r.x + r.w / 2);
      const dy = py - (r.y + r.h / 2);
      const a = -ROT[c.dir];
      const h = horizontal(c.dir);
      const hl = ((h ? r.w : r.h) - pad * 2) / 2;
      const hw = ((h ? r.h : r.w) - pad * 2) / 2;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      return { ix: Math.max(-hl, Math.min(hl, lx)), iy: Math.max(-hw, Math.min(hw, ly)) };
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
          // 大破した金色の車は、ぶつかった所を覚えてへこみを描く（sim は車が止まる前に大破を決めているので、ここで見た目を追いつかせる）
          let crash = false;
          for (const j of [i, m.hit]) {
            if (!sim.cars[j].wrecked) continue;
            wreck[j] = Object.assign({ t: 0 }, localPoint(j, px, py));
            crash = true;
          }
          api.sound(crash ? 'crash' : 'hit');
        }
      }
      for (const k in wreck) wreck[k].t++;
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
      // ライトの光を先に全部描き、そのあと車を描く（光が車の上に重ならないように）
      for (const pass of ['beam', 'car']) {
        for (let i = 0; i < sim.cars.length; i++) {
          if (vis[i].gone) continue;
          const c = sim.cars[i];
          const r = rectOf(i);
          const [ox, oy] = shakeOffset(i);
          const h = horizontal(c.dir);
          const len = (h ? r.w : r.h) - pad * 2;
          const wid = (h ? r.h : r.w) - pad * 2;
          const x = r.x + r.w / 2 + ox;
          const y = r.y + r.h / 2 + oy;
          // 大破した車はライトが消える
          if (pass === 'beam') {
            if (!wreck[i]) drawBeam(ctx, x, y, c.dir, len, wid);
          } else drawCar(ctx, x, y, c.dir, len, wid, BODY[i % BODY.length], c.len === 3, c.gold, t, wreck[i]);
        }
      }
      for (const k in wreck) {
        const i = Number(k);
        const r = rectOf(i);
        const h = horizontal(sim.cars[i].dir);
        drawSmoke(ctx, r.x + r.w / 2, r.y + r.h / 2, (h ? r.h : r.w) - pad * 2, wreck[k].t);
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
