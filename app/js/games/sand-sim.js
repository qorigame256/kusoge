// 砂を掘って玉を運ぶの中身（砂・岩・玉の動きと勝ち負けの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-sand.js がそのまま読み込むため）。
// 砂・岩・トラックは CELL 四方のます目で持つ。指でなぞった帯（半径 DIG_R）の中にある砂のますを消す。岩とトラックは消えない。
// 玉はピン抜きと同じ位置ベースの計算（Verlet）で動かし、ます目と重なったら押し戻す。1回の step() は 1/60 秒で、中で SUB 回に分ける。
// トラックの荷台に入った玉は数えて消す（描画側が荷台に積んだ形で描く）。荷台のふちより下へ落ちた玉は、もう入らないものとして数える
// （玉は上へは戻れないので、ふちより下にいる荷台の外の玉は二度と入らない）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  const CELL = 5;
  const COLS = KG.W / CELL;
  const ROWS = KG.H / CELL;
  const EMPTY = 0;
  const SAND = 1;
  const ROCK = 2;
  const TRUCK = 3;
  const SUB = 4;
  const DT = 1 / 60 / SUB;
  const GSTEP = 1400 * DT * DT;
  const DAMP = 0.998;
  const MAXV = 5; // 1小刻みに動ける最大距離（玉の半径より小さく保ち、薄い砂の壁をすり抜けないように）
  const BALL_R = 9;
  const REACH = BALL_R + CELL / 2; // 玉の中心と、当たるますの中心との近さの下限（ますは半径 CELL/2 の円として当てる）
  const SMOOTH = 4; // 押し出す向きを、これだけ広い範囲のますでならして求める
  const DIG_R = 22; // 指でなぞった所を掘る帯の半径
  const FRIC = 0.003;
  const REST = 0.12;
  const STIFF = 0.8; // 玉どうしの重なりを1回でどれだけ押し戻すか
  const TOP_DEFAULT = 200; // 砂の上の端（level.top が無いとき）。これより上は空
  const CALM_MOVE = 0.3; // 1刻みの動きがこれ未満の黒い玉は「止まっている」
  const CALM_STEPS = 30; // 決めた数を入れたあと、動いている黒い玉がこの刻み数止まっていたらクリア
  const BLACK_WAIT_MAX = 240; // 黒い玉が止まらないときに、クリアを待つ最大の刻み数
  const OFF_Y = KG.H + 30; // これより下へ落ちた玉は画面の外へ出たものとして消す

  // トラック。(x, y) は荷台の真ん中とふちの高さ。荷台の内側に入った玉を数える。運転席は右に付く（屋根は前へ下がる坂にして、玉が乗ったままにならないように）
  const TRUCK_PARTS = {
    walls: [[-66, 0, -56, 56], [56, 0, 66, 56], [-66, 46, 66, 56], [-70, 56, 124, 64]], // 荷台の左右の壁・底・車体の下
    cab: [[66, 4], [124, 34], [124, 56], [66, 56]],
    bed: [-56, 46], // 荷台の内側の左右（x）と底（y）
    cave: [-82, -14, 138], // トラックのまわりで砂を消す範囲（左・上・右。下は画面の下まで）
  };

  // 形の中に点 (px, py) が入るか。形は { rect: [x1, y1, x2, y2] } | { circle: [x, y, r] } | { path: [[x, y], ...], r } | { poly: [[x, y], ...] }
  function inShape(s, px, py) {
    if (s.rect) return px >= s.rect[0] && px <= s.rect[2] && py >= s.rect[1] && py <= s.rect[3];
    if (s.circle) return Math.hypot(px - s.circle[0], py - s.circle[1]) <= s.circle[2];
    if (s.path) {
      const p = s.path;
      if (p.length === 1) return Math.hypot(px - p[0][0], py - p[0][1]) <= s.r;
      for (let i = 1; i < p.length; i++) if (segDist(px, py, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= s.r) return true;
      return false;
    }
    if (s.poly) {
      let inside = false;
      const p = s.poly;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i];
        const [xj, yj] = p[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    return false;
  }

  // 点から線分までの距離
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let u = len2 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    return Math.hypot(x0 + dx * u - px, y0 + dy * u - py);
  }

  // 形がかかるます目の範囲 [cx0, cy0, cx1, cy1]
  function shapeBox(s) {
    let x0;
    let y0;
    let x1;
    let y1;
    if (s.rect) [x0, y0, x1, y1] = s.rect;
    else if (s.circle) [x0, y0, x1, y1] = [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]];
    else {
      const pts = s.path || s.poly;
      const r = s.path ? s.r : 0;
      x0 = Math.min(...pts.map((p) => p[0])) - r;
      y0 = Math.min(...pts.map((p) => p[1])) - r;
      x1 = Math.max(...pts.map((p) => p[0])) + r;
      y1 = Math.max(...pts.map((p) => p[1])) + r;
    }
    return [
      Math.max(0, Math.floor(x0 / CELL)),
      Math.max(0, Math.floor(y0 / CELL)),
      Math.min(COLS - 1, Math.floor(x1 / CELL)),
      Math.min(ROWS - 1, Math.floor(y1 / CELL)),
    ];
  }

  // 形の中に中心があるます目を v にする（only を渡したときは、その値のますだけを変える）
  function paint(grid, s, v, only) {
    const [cx0, cy0, cx1, cy1] = shapeBox(s);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = cy * COLS + cx;
        if (only !== undefined && grid[i] !== only) continue;
        if (inShape(s, cx * CELL + CELL / 2, cy * CELL + CELL / 2)) grid[i] = v;
      }
    }
  }

  // トラックの形を、画面の座標の形の並びにする
  function truckShapes(truck) {
    const { x, y } = truck;
    const walls = TRUCK_PARTS.walls.map((w) => ({ rect: [x + w[0], y + w[1], x + w[2], y + w[3]] }));
    const cab = { poly: TRUCK_PARTS.cab.map((p) => [x + p[0], y + p[1]]) };
    const c = TRUCK_PARTS.cave;
    return { solid: walls.concat([cab]), cave: { rect: [x + c[0], y + c[1], x + c[2], KG.H] } };
  }

  function createSim(level) {
    const rng = KG.rng(level.seed || 1);
    const grid = new Uint8Array(COLS * ROWS);
    const top = level.top === undefined ? TOP_DEFAULT : level.top;
    for (const s of level.sand || [{ rect: [0, top, KG.W, KG.H] }]) paint(grid, s, SAND);
    for (const s of level.caves || []) paint(grid, s, EMPTY, SAND);
    const ts = truckShapes(level.truck);
    paint(grid, ts.cave, EMPTY, SAND);
    for (const s of level.rocks || []) paint(grid, s, ROCK);
    for (const s of ts.solid) paint(grid, s, TRUCK);

    function solidCell(cx, cy) {
      if (cx < 0 || cx >= COLS || cy < 0) return true; // 左右の外と上の外は壁
      if (cy >= ROWS) return false; // 下の外は開いている（落ちた玉は出ていく）
      return grid[cy * COLS + cx] !== EMPTY;
    }

    // 中心 (x, y) の玉が、ます目と重ならずに置けるか
    function fits(x, y) {
      const reach = REACH - 0.5;
      const cx0 = Math.floor((x - reach) / CELL);
      const cx1 = Math.floor((x + reach) / CELL);
      const cy0 = Math.floor((y - reach) / CELL);
      const cy1 = Math.floor((y + reach) / CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (solidCell(cx, cy) && Math.hypot(x - (cx + 0.5) * CELL, y - (cy + 0.5) * CELL) < reach) return false;
        }
      }
      return true;
    }

    // 玉は g.rect の中に、下から詰めて置く。細かい格子の点を下の段から順に試し、洞穴の形からはみ出す所と、
    // 先に置いた玉に重なる所には置かない（坂になった管のような形でも、下から詰まる）
    const balls = [];
    const placed = []; // 組ごとに置けた数（検査が level.balls の n と比べる）
    for (const g of level.balls) {
      const [x1, y1, x2, y2] = g.rect;
      const STEP = 3;
      let n = 0;
      for (let y = y2; y >= y1 && n < g.n; y -= STEP) {
        for (let x = x1; x <= x2 && n < g.n; x += STEP) {
          if (!fits(x, y) || balls.some((b) => Math.hypot(b.x - x, b.y - y) < BALL_R * 2 + 0.5)) continue;
          const px = x + (rng() - 0.5) * 0.6;
          const py = y + (rng() - 0.5) * 0.6;
          balls.push({ id: balls.length, black: !!g.black, x: px, y: py, px, py, sx: px, sy: py, alive: true, in: false, lost: false });
          n++;
        }
      }
      placed.push(n);
    }
    const totalColored = balls.filter((b) => !b.black).length;
    const tx = level.truck.x;
    const ty = level.truck.y;
    const bedX1 = tx + TRUCK_PARTS.bed[0];
    const bedX2 = tx - TRUCK_PARTS.bed[0];

    const sim = {
      level,
      grid,
      balls,
      placed,
      top,
      truck: level.truck,
      totalColored,
      need: level.need,
      collected: 0, // 荷台に入った色の玉（クリアのあとに入った分も数える）
      bed: [], // 荷台に入った玉（入った順。黒い玉と、失敗のあとに入った数えない玉も入る）
      lostColored: 0, // もう荷台に入らない色の玉
      state: 'play', // 'play' | 'clear' | 'fail'
      reason: null, // 失敗の理由 'black'（黒い玉が荷台に入った）| 'short'（入れられる玉が足りない）
      locked: false, // true になったら掘れない
      t: 0,
      goalAt: -1,
      blackCalm: 0,
      digs: [], // 砂を消した帯 [x0, y0, x1, y1] の並び（描画側が砂の絵を作り直すときに使う）
      dug: 0, // 消した砂のますの数
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      dig,
      step,
      cellAt,
    };

    function cellAt(x, y) {
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      if (cx < 0 || cx >= COLS || cy < 0) return ROCK;
      if (cy >= ROWS) return EMPTY;
      return grid[cy * COLS + cx];
    }

    // (x0, y0) から (x1, y1) まで指でなぞった帯の砂を消す。消せた砂があれば true
    function dig(x0, y0, x1, y1) {
      if (sim.state !== 'play' || sim.locked) return false;
      const r = DIG_R;
      const cx0 = Math.max(0, Math.floor((Math.min(x0, x1) - r) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(y0, y1) - r) / CELL));
      const cx1 = Math.min(COLS - 1, Math.floor((Math.max(x0, x1) + r) / CELL));
      const cy1 = Math.min(ROWS - 1, Math.floor((Math.max(y0, y1) + r) / CELL));
      let removed = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const i = cy * COLS + cx;
          if (grid[i] !== SAND) continue;
          if (segDist(cx * CELL + CELL / 2, cy * CELL + CELL / 2, x0, y0, x1, y1) <= r) {
            grid[i] = EMPTY;
            removed++;
          }
        }
      }
      if (!removed) return false;
      sim.digs.push([x0, y0, x1, y1]);
      sim.dug += removed;
      sim.events.push({ type: 'dig', x0, y0, x1, y1, n: removed });
      return true;
    }

    function integrate(b) {
      let vx = (b.x - b.px) * DAMP;
      let vy = (b.y - b.py) * DAMP;
      const s2 = vx * vx + vy * vy;
      if (s2 > MAXV * MAXV) {
        const k = MAXV / Math.sqrt(s2);
        vx *= k;
        vy *= k;
      }
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + GSTEP;
    }

    // ます目（砂・岩・トラック）と重なっていたら押し出し、ぶつかった向きの速度を消して（少しはね返し）、すべる向きに摩擦をかける。
    // ますは中心に置いた半径 CELL/2 の円とみなし、押し出す向きは、少し広い範囲（REACH + SMOOTH）のますから求めた「ならした面の向き」にする。
    // ます1つずつから押し出すと、ゆるい坂の階段の段（ます2つぶんの平ら）のくぼみや、角の真上で玉が止まったままになった
    // （管の上の端で黒い玉が、10面の管の上のほうで色の玉が止まった）
    const near = []; // 触れているますの中心からの向き（使い回す）
    function collideGrid(b) {
      const R2 = REACH + SMOOTH;
      const cx0 = Math.floor((b.x - R2) / CELL);
      const cx1 = Math.floor((b.x + R2) / CELL);
      const cy0 = Math.floor((b.y - R2) / CELL);
      const cy1 = Math.floor((b.y + R2) / CELL);
      let sx = 0;
      let sy = 0;
      near.length = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (!solidCell(cx, cy)) continue;
          const dx = b.x - (cx + 0.5) * CELL;
          const dy = b.y - (cy + 0.5) * CELL;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R2 * R2) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const w = R2 - d;
          sx += (dx / d) * w;
          sy += (dy / d) * w;
          if (d < REACH) near.push(dx, dy);
        }
      }
      if (!near.length) return;
      const len = Math.hypot(sx, sy);
      const nx = len > 1e-9 ? sx / len : 0;
      const ny = len > 1e-9 ? sy / len : -1;
      // n の向きへ、触れているどのますからも REACH 離れるまで押し出す（n の向きの先にあるますは、次の小刻みでならした向きに入る）
      let pen = 0;
      for (let i = 0; i < near.length; i += 2) {
        const dx = near[i];
        const dy = near[i + 1];
        const p = dx * nx + dy * ny;
        if (p <= 0) continue;
        const disc = p * p - (dx * dx + dy * dy) + REACH * REACH;
        if (disc <= 0) continue;
        const t = Math.sqrt(disc) - p;
        if (t > pen) pen = t;
      }
      if (pen <= 0) return;
      let wx = b.x - b.px; // 押し出す前の速度
      let wy = b.y - b.py;
      b.x += nx * pen;
      b.y += ny * pen;
      const vn = wx * nx + wy * ny;
      if (vn < 0) {
        wx -= nx * vn * (1 + REST);
        wy -= ny * vn * (1 + REST);
      }
      const vn2 = wx * nx + wy * ny;
      const tx2 = wx - nx * vn2;
      const ty2 = wy - ny * vn2;
      wx = nx * vn2 + tx2 * (1 - FRIC);
      wy = ny * vn2 + ty2 * (1 - FRIC);
      b.px = b.x - wx;
      b.py = b.y - wy;
    }

    function collidePairs() {
      const min = BALL_R * 2;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b.alive) continue;
          let dx = a.x - b.x;
          if (dx >= min || dx <= -min) continue;
          let dy = a.y - b.y;
          if (dy >= min || dy <= -min) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-6) {
            dx = 0.01;
            dy = 0;
            d = 0.01;
          }
          const k = ((min - d) / d) * 0.5 * STIFF;
          dx *= k;
          dy *= k;
          a.x += dx;
          a.y += dy;
          b.x -= dx;
          b.y -= dy;
        }
      }
    }

    function substep() {
      for (const b of balls) if (b.alive) integrate(b);
      collidePairs();
      for (const b of balls) if (b.alive) collideGrid(b);
    }

    function fail(reason) {
      if (sim.state !== 'play') return;
      sim.state = 'fail';
      sim.reason = reason;
      sim.locked = true;
      sim.events.push({ type: 'fail', reason });
    }

    function markLost(b) {
      b.lost = true;
      if (!b.black) sim.lostColored++;
      sim.events.push({ type: 'lost', x: b.x, y: b.y, black: b.black });
    }

    function judge() {
      let blackMoving = false;
      for (const b of balls) {
        if (!b.alive) continue;
        if (b.y > OFF_Y) {
          b.alive = false;
          if (!b.lost) markLost(b);
          continue;
        }
        if (!b.lost && b.x > bedX1 && b.x < bedX2 && b.y > ty + 6) {
          // 荷台に入った（数えない玉も、描画側が荷台に積んで見せるので bed に入れる）
          b.alive = false;
          b.in = true;
          sim.bed.push(b);
          if (b.black) {
            // クリアのあとに入った黒い玉は失敗にしないので、失敗の合図も出さない
            if (sim.state !== 'clear') sim.events.push({ type: 'in', x: b.x, y: b.y, black: true });
            fail('black');
          } else if (sim.state !== 'fail') {
            sim.collected++;
            sim.events.push({ type: 'in', x: b.x, y: b.y, black: false });
          }
          continue;
        }
        if (!b.lost && b.y > ty + BALL_R + 2) markLost(b);
        if (b.black && !b.lost && Math.abs(b.x - b.sx) + Math.abs(b.y - b.sy) >= CALM_MOVE) blackMoving = true;
      }
      sim.blackCalm = blackMoving ? 0 : sim.blackCalm + 1;
      if (sim.state !== 'play') return;
      if (sim.collected >= sim.need) {
        if (!sim.locked) {
          sim.locked = true;
          sim.goalAt = sim.t;
          sim.events.push({ type: 'goal' });
        }
        // 動いている黒い玉があるうちはクリアにしない（あとから荷台へ落ちてくるのを見逃さないため）
        if (sim.blackCalm >= CALM_STEPS || sim.t - sim.goalAt >= BLACK_WAIT_MAX) {
          sim.state = 'clear';
          sim.events.push({ type: 'clear' });
        }
        return;
      }
      if (sim.totalColored - sim.lostColored < sim.need) fail('short');
    }

    function step() {
      for (const b of balls) {
        b.sx = b.x;
        b.sy = b.y;
      }
      for (let i = 0; i < SUB; i++) substep();
      sim.t++;
      judge();
    }

    // 黒い玉が1つも無い面や、黒い玉が最初から止まっている面では、決めた数を入れた刻みでクリアになるように、始めの値をそろえておく
    sim.blackCalm = CALM_STEPS;
    return sim;
  }

  KG.sandSim = { createSim, inShape, truckShapes, TRUCK_PARTS, CELL, COLS, ROWS, EMPTY, SAND, ROCK, TRUCK, BALL_R, DIG_R, TOP_DEFAULT, CALM_STEPS };
})();
