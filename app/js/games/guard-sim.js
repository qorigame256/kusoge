// 線を引いて守るの中身（線の物理・ハチ・勝ち負けの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-guard.js がそのまま読み込むため）。
// 線は「曲がらない1枚の板」として、位置・向き・速さ・回る速さを持つ（形は描いた点の並びを丸い粒の列として持つ）。線の長さに上限は無い。
// 犬とハチは回らない丸。ぶつかったら、めり込みを戻す向きの勢い（撃力）と、すべりを止める勢い（摩擦。押す力の MU 倍まで）を
// 両方に分けて与える。これを何回か繰り返して全部の接触をそろえる（ゲームの物理でよく使う「撃力をくり返し解く」やり方）。
// 摩擦に上限があるので、斜めに立てかけた線は止まり、強く押されると初めてすべる。ハチの群れも線を押す（押す強さは BEE_M）。
// ハチは升目の道案内（犬までの道のりを升目ごとに書いた地図）をたどり、地面や線を回り込んで犬へ向かう。線のすき間も通り抜ける。
// 犬までの道が無い（線で閉じられている）ときは、地面と足場だけをよけた道をたどって線に突き当たり、線を押す。
// 1回の step() は 1/60 秒。中で SUB 回に分けて計算する（速い粒が線をすり抜けないように）。速さの単位は 論理ピクセル毎秒。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  const SUB = 4;
  const DT = 1 / 60 / SUB;
  const GRAVITY = 1400; // 論理ピクセル毎秒毎秒
  const ITER = 8; // 1小刻みの中で、全部の接触を解き直す回数
  const BETA = 0.25; // めり込みを1小刻みでどれだけ戻すか
  const SLOP = 0.3; // これより浅いめり込みは戻さない（置いた物が小刻みに震えないように）
  const MAX_BIAS = 240; // めり込みを戻す速さの上限（深くめり込んだ物がはじけ飛ばないように）
  const MAX_SPEED = 1400; // 線と犬の速さの上限（1小刻みに約6。線の太さ 12 より小さく保つ）
  const DAMP = 0.9995; // 小刻みごとの速さの減り（置いた物が揺れ続けないように）
  const LINE_R = 6; // 線の太さの半分
  const SPACING = 5; // 線の粒の間隔
  const MIN_LEN = 20; // これより短い線は、引かなかったことにする（タップで線が出ないように）
  const DOG_R = 28;
  const BEE_R = 7;
  const HIVE_R = 26;
  const TOP = 160; // これより上には線を引けない（guard.js が描く上の帯 150 の下）
  const DRAW_GAP = 2; // 線は地面・犬から、これだけ離れた所までしか引けない（くっつけて描くと、置いた瞬間にめり込むため）
  // 重さ。線は粒1つが LINE_M（長い線ほど重い）。ハチの重さは、線を押す強さになる
  // LINE_M: ハチの群れに押されると動く重さ。巣ごとかこんだドームがハチ20ぴきに1秒で押される距離は 0.5 で 143、1 で 79、0.25 で 182。
  // 0.25 では5面の張り出しに立てかけた線が押し倒された（9通りずらした中の3通り）
  const LINE_M = 0.5;
  const DOG_M = 12;
  const BEE_M = 6; // 2 では、上のドームが1秒に 45 しか動かなかった
  // 摩擦（押す力の何倍まで、すべりを止められるか）
  // MU_LINE: 線と地面。0.5 では5面の張り出しに立てかけた線がすべって倒れた（9通りずらした中の5通り）。
  // 0.8 との違いは小さい（上のドームが押される距離 137 → 143）
  const MU_LINE = 0.65;
  const MU_DOG = 1; // 犬と地面（犬は足をふんばる）
  const MU_LINE_DOG = 0.4;
  const MU_BEE = 0.05; // ハチは線や地面にそってすべる
  const BEE_SPEED = 340; // ハチの飛ぶ速さ
  const BEE_STEER = 0.02; // ハチが向きを変える強さ（1小刻みに、行きたい速さとの差をこの割合だけ縮める）
  const BEE_WANDER = 0.5; // ハチのふらつき（行きたい向きを最大でこの角度だけずらす）
  const SPAWN_EVERY = 2; // 巣からハチが1ぴき出てくる間隔（刻み）
  const DEFAULT_TIME = 8; // 守る秒数
  const TOUCH = 1; // ハチと犬がこれだけ離れていても、刺されたとみなす
  // ハチの道案内
  const CELL = 10; // 升目の大きさ
  const NAV_EVERY = 6; // 道案内を作り直す間隔（刻み）。線が押されて動くため
  const NEAR = 6; // 犬までの道のりがこれだけの升目より近ければ、道案内を使わずまっすぐ犬へ向かう
  const COLS = Math.ceil(540 / CELL);
  const ROWS = Math.ceil(960 / CELL);
  const INF = 1e9;

  // 長方形 b（[x1, y1, x2, y2]）と、中心 (x, y)・半径 r の丸の接触。重なっていなければ null。
  // 法線 (nx, ny) は長方形から丸へ向かう向き
  function blockContact(x, y, r, b) {
    const qx = x < b[0] ? b[0] : x > b[2] ? b[2] : x;
    const qy = y < b[1] ? b[1] : y > b[3] ? b[3] : y;
    let nx = x - qx;
    let ny = y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1e-9) {
      if (d2 >= r * r) return null;
      const d = Math.sqrt(d2);
      return { nx: nx / d, ny: ny / d, pen: r - d };
    }
    // 中心が長方形の中にある: いちばん近い辺から外へ
    const l = x - b[0];
    const rt = b[2] - x;
    const t = y - b[1];
    const bt = b[3] - y;
    const m = Math.min(l, rt, t, bt);
    if (m === t) return { nx: 0, ny: -1, pen: m + r };
    if (m === bt) return { nx: 0, ny: 1, pen: m + r };
    if (m === l) return { nx: -1, ny: 0, pen: m + r };
    return { nx: 1, ny: 0, pen: m + r };
  }

  // 点と長方形の距離（中なら 0）
  function rectDist(x, y, b) {
    const dx = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0;
    const dy = y < b[1] ? b[1] - y : y > b[3] ? y - b[3] : 0;
    return Math.hypot(dx, dy);
  }

  function createSim(level) {
    const rng = KG.rng(level.seed || 1);
    const blocks = level.blocks.map((b) => b.slice());
    const dogs = level.dogs.map((d) => ({ x: d.x, y: d.y, vx: 0, vy: 0, im: 1 / DOG_M, stung: false }));
    const hives = level.hives.map((h) => ({ x: h.x, y: h.y, n: h.n, spawned: 0 }));
    const timeSteps = Math.round((level.time || DEFAULT_TIME) * 60);
    let body = null; // 固まった線（板）
    let contacts = [];
    // 道案内: 地面と足場のそばの升目（ハチの中心が入れない所）と、犬ごとの道のりの地図
    const wall = new Uint8Array(COLS * ROWS);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const cx = (i + 0.5) * CELL;
        const cy = (j + 0.5) * CELL;
        for (const b of blocks) {
          if (rectDist(cx, cy, b) < BEE_R + 1) {
            wall[j * COLS + i] = 1;
            break;
          }
        }
      }
    }
    const blocked = new Uint8Array(COLS * ROWS);
    const fields = dogs.map(() => new Float64Array(COLS * ROWS).fill(INF)); // 線もよけた道のり（線のすき間を通る道）
    const terrain = dogs.map(() => new Float64Array(COLS * ROWS)); // 地面と足場だけをよけた道のり（線でふさがれていても、そこまで行って押す）
    dogs.forEach((d, k) => fillDistance(d, terrain[k], wall));

    const sim = {
      level,
      blocks,
      dogs,
      hives,
      bees: [],
      drawn: 0, // 描いている線の長さ
      stroke: null, // 描いている途中の点の並び [{x, y}]。描いていないときは null
      blockedAt: null, // 最後に線が止められた位置（描画側が印を出す）
      line: null, // 指を離したあとの線の粒の位置 [{x, y}]（描画用。body から毎回作り直す）
      state: 'draw', // 'draw'（線を描く）| 'defend'（守っている）| 'clear' | 'fail'
      reason: null, // 失敗の理由 'sting'（ハチに刺された）| 'fall'（犬が落ちた）
      t: 0,
      defendT: 0, // 守り始めてからの刻み数
      timeSteps,
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      canDraw,
      beginStroke,
      extendStroke,
      endStroke,
      drawPath,
      step,
      navDist,
      timeLeft() {
        return Math.max(0, timeSteps - sim.defendT) / 60;
      },
      lineBody() {
        return body;
      },
    };

    // ---- 線を描く ----

    // その点に線を引けるか（地面・犬・巣の上と、画面の外は不可）
    function canDraw(x, y) {
      if (x < LINE_R || x > KG.W - LINE_R || y < TOP || y > KG.H - LINE_R) return false;
      const m = LINE_R + DRAW_GAP;
      for (const b of blocks) {
        if (x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m) return false;
      }
      for (const d of dogs) {
        const r = DOG_R + LINE_R + DRAW_GAP;
        if ((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) < r * r) return false;
      }
      for (const h of hives) {
        const r = HIVE_R + LINE_R;
        if ((x - h.x) * (x - h.x) + (y - h.y) * (y - h.y) < r * r) return false;
      }
      return true;
    }

    function beginStroke(x, y) {
      if (sim.state !== 'draw' || sim.stroke) return false;
      if (!canDraw(x, y)) {
        sim.blockedAt = { x, y };
        return false;
      }
      sim.stroke = [{ x, y }];
      sim.drawn = 0;
      sim.blockedAt = null;
      return true;
    }

    // 指の位置まで、間隔 SPACING で点を足していく。引けない所に当たったらそこで止める（指が戻ってくれば続きを描ける）
    function extendStroke(x, y) {
      const s = sim.stroke;
      if (!s) return;
      let last = s[s.length - 1];
      let dx = x - last.x;
      let dy = y - last.y;
      let d = Math.hypot(dx, dy);
      while (d >= SPACING) {
        const nx = last.x + (dx / d) * SPACING;
        const ny = last.y + (dy / d) * SPACING;
        if (!canDraw((last.x + nx) / 2, (last.y + ny) / 2) || !canDraw(nx, ny)) {
          sim.blockedAt = { x: nx, y: ny };
          return;
        }
        sim.blockedAt = null;
        s.push({ x: nx, y: ny });
        sim.drawn += SPACING;
        last = s[s.length - 1];
        dx = x - last.x;
        dy = y - last.y;
        d = Math.hypot(dx, dy);
      }
    }

    // 指を離した。短すぎる線は無かったことにする。そうでなければ線を固め、ハチが出てくる
    function endStroke() {
      const s = sim.stroke;
      if (!s) return false;
      sim.stroke = null;
      sim.blockedAt = null;
      if (sim.drawn < MIN_LEN) {
        sim.drawn = 0;
        return false;
      }
      let cx = 0;
      let cy = 0;
      for (const p of s) {
        cx += p.x;
        cy += p.y;
      }
      cx /= s.length;
      cy /= s.length;
      // 回りにくさ（慣性モーメント）は粒ごとの「重心からの距離の2乗」の和に、粒の円盤のぶんを足して、粒の重さを掛ける
      let inertia = 0;
      const ps = s.map((p) => {
        const rx = p.x - cx;
        const ry = p.y - cy;
        inertia += rx * rx + ry * ry + (LINE_R * LINE_R) / 2;
        return { rx, ry };
      });
      body = { x: cx, y: cy, a: 0, vx: 0, vy: 0, w: 0, im: 1 / (s.length * LINE_M), ii: 1 / (inertia * LINE_M), ps };
      sim.line = s.map((p) => ({ x: p.x, y: p.y }));
      sim.state = 'defend';
      sim.events.push({ type: 'solid' });
      buildNav();
      return true;
    }

    // 検査用: 点の並びを、指でなぞったのと同じ手順で描いて離す（guard.js と同じく、引けない所から描き始めたら、そこを出た所から線が始まる）
    function drawPath(points) {
      for (let i = 0; i < points.length && sim.state === 'draw'; i++) {
        if (sim.stroke) extendStroke(points[i][0], points[i][1]);
        else beginStroke(points[i][0], points[i][1]);
      }
      if (sim.stroke) endStroke();
      return sim.state === 'defend';
    }

    // ---- ハチの道案内 ----

    // 線のそばの升目もふさいでから、犬ごとに「その升目から犬までの道のり（升目の数。斜めは 1.41）」を作る
    function buildNav() {
      blocked.set(wall);
      if (sim.line) {
        const R = LINE_R + BEE_R;
        for (const p of sim.line) {
          const i0 = Math.max(0, Math.floor((p.x - R) / CELL));
          const i1 = Math.min(COLS - 1, Math.floor((p.x + R) / CELL));
          const j0 = Math.max(0, Math.floor((p.y - R) / CELL));
          const j1 = Math.min(ROWS - 1, Math.floor((p.y + R) / CELL));
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const cx = (i + 0.5) * CELL - p.x;
              const cy = (j + 0.5) * CELL - p.y;
              if (cx * cx + cy * cy < R * R) blocked[j * COLS + i] = 1;
            }
          }
        }
      }
      dogs.forEach((d, k) => fillDistance(d, fields[k], blocked));
    }

    // 犬のまわりの升目から広げていく（いちばん近い升目から順に決める）。mask が 1 の升目は通れない
    function fillDistance(d, dist, mask) {
      dist.fill(INF);
      const hc = []; // 二分ヒープ（道のり）
      const hi = []; // 二分ヒープ（升目の番号）
      const push = (c, idx) => {
        let k = hc.length;
        hc.push(c);
        hi.push(idx);
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (hc[p] <= hc[k]) break;
          [hc[p], hc[k]] = [hc[k], hc[p]];
          [hi[p], hi[k]] = [hi[k], hi[p]];
          k = p;
        }
      };
      const pop = () => {
        const c = hc[0];
        const idx = hi[0];
        const lc = hc.pop();
        const li = hi.pop();
        if (hc.length) {
          hc[0] = lc;
          hi[0] = li;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1;
            const r = l + 1;
            let m = k;
            if (l < hc.length && hc[l] < hc[m]) m = l;
            if (r < hc.length && hc[r] < hc[m]) m = r;
            if (m === k) break;
            [hc[m], hc[k]] = [hc[k], hc[m]];
            [hi[m], hi[k]] = [hi[k], hi[m]];
            k = m;
          }
        }
        return [c, idx];
      };
      const R = DOG_R + BEE_R + 6;
      const i0 = Math.max(0, Math.floor((d.x - R) / CELL));
      const i1 = Math.min(COLS - 1, Math.floor((d.x + R) / CELL));
      const j0 = Math.max(0, Math.floor((d.y - R) / CELL));
      const j1 = Math.min(ROWS - 1, Math.floor((d.y + R) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const idx = j * COLS + i;
          const cx = (i + 0.5) * CELL - d.x;
          const cy = (j + 0.5) * CELL - d.y;
          if (mask[idx] || cx * cx + cy * cy > R * R) continue;
          dist[idx] = 0;
          push(0, idx);
        }
      }
      while (hc.length) {
        const [c, idx] = pop();
        if (c > dist[idx]) continue;
        const i = idx % COLS;
        const j = (idx - i) / COLS;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
            const n = nj * COLS + ni;
            if (mask[n]) continue;
            // 斜めは、角を削って通らない（両どなりが空いているときだけ）
            if (di && dj && (mask[j * COLS + ni] || mask[nj * COLS + i])) continue;
            const nc = c + (di && dj ? 1.414 : 1);
            if (nc < dist[n]) {
              dist[n] = nc;
              push(nc, n);
            }
          }
        }
      }
    }

    // (x, y) から k ひき目の犬までの道のり（升目の数）。画面の外やふさがった升目は INF
    function navDist(k, x, y) {
      const i = Math.floor(x / CELL);
      const j = Math.floor(y / CELL);
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return INF;
      return fields[k][j * COLS + i];
    }

    // 道のりの地図 dist の上で、(i, j) の升目から犬へ近づく点。犬のすぐそばなら 'near'、道が見つからなければ null
    function stepOn(dist, i, j) {
      const here = dist[j * COLS + i];
      if (here < NEAR) return 'near';
      let best = here;
      let bi = -1;
      let bj = -1;
      // 今の升目に道があれば、となりの8升から近いほうへ。ふさがった升目にいる（地面や線に触れている）ときは、2升先まで道を探す
      for (let r = 1; r <= (here < INF ? 1 : 2); r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
            const v = dist[nj * COLS + ni];
            if (v < best) {
              best = v;
              bi = ni;
              bj = nj;
            }
          }
        }
        if (bi >= 0) break;
      }
      if (bi < 0) return null;
      return [(bi + 0.5) * CELL, (bj + 0.5) * CELL];
    }

    // 道案内で次に向かう点。線のすき間を通る道が無ければ、地面だけをよけた道をたどって、線でふさがれた所まで行って押す。
    // 犬のすぐそば・どちらの道も無いときは null（まっすぐ犬へ向かう）
    function navTarget(b) {
      const i = Math.floor(b.x / CELL);
      const j = Math.floor(b.y / CELL);
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return null;
      for (const dist of [fields[b.dog], terrain[b.dog]]) {
        const t = stepOn(dist, i, j);
        if (t === 'near') return null;
        if (t) return t;
      }
      return null;
    }

    // ---- 動き ----

    // 線の粒の位置を、板の位置と向きから作り直す
    function placeLine() {
      const c = Math.cos(body.a);
      const s = Math.sin(body.a);
      const L = sim.line;
      for (let i = 0; i < body.ps.length; i++) {
        const p = body.ps[i];
        L[i].x = body.x + c * p.rx - s * p.ry;
        L[i].y = body.y + s * p.rx + c * p.ry;
      }
    }

    // 接触 1つ。a は線・犬・ハチのどれか、b は犬・ハチ・null（地面）。法線は b から a へ向かう向き。
    // 線が a のとき、(rax, ray) は線の重心から接触する粒までの腕の長さ
    function addContact(a, b, nx, ny, pen, mu, rax, ray) {
      let k = a.im + (b ? b.im : 0);
      let kt = k;
      if (a === body) {
        const rn = rax * ny - ray * nx;
        const rt = rax * nx + ray * ny; // 接線 (−ny, nx) との外積
        k += rn * rn * body.ii;
        kt += rt * rt * body.ii;
      }
      contacts.push({
        a, b, nx, ny, mu, rax, ray,
        kn: 1 / k,
        kt: 1 / kt,
        bias: Math.min(MAX_BIAS, (BETA / DT) * Math.max(0, pen - SLOP)),
        jn: 0,
        jt: 0,
      });
    }

    function relVel(c) {
      const a = c.a;
      let vx = a.vx;
      let vy = a.vy;
      if (a === body) {
        vx -= body.w * c.ray;
        vy += body.w * c.rax;
      }
      if (c.b) {
        vx -= c.b.vx;
        vy -= c.b.vy;
      }
      return [vx, vy];
    }

    function impulse(c, px, py) {
      const a = c.a;
      a.vx += px * a.im;
      a.vy += py * a.im;
      if (a === body) body.w += (c.rax * py - c.ray * px) * body.ii;
      if (c.b) {
        c.b.vx -= px * c.b.im;
        c.b.vy -= py * c.b.im;
      }
    }

    function solve(c) {
      let [vx, vy] = relVel(c);
      const vn = vx * c.nx + vy * c.ny;
      let jn = (c.bias - vn) * c.kn;
      const oldN = c.jn;
      c.jn = Math.max(0, oldN + jn);
      jn = c.jn - oldN;
      impulse(c, c.nx * jn, c.ny * jn);
      if (c.mu <= 0) return;
      [vx, vy] = relVel(c);
      const tx = -c.ny;
      const ty = c.nx;
      let jt = -(vx * tx + vy * ty) * c.kt;
      const max = c.mu * c.jn;
      const oldT = c.jt;
      c.jt = Math.max(-max, Math.min(max, oldT + jt));
      jt = c.jt - oldT;
      impulse(c, tx * jt, ty * jt);
    }

    function steerBee(b) {
      let tx;
      let ty;
      if (sim.state === 'clear') {
        // 守りきったら、ハチは上へ帰っていく
        tx = b.x + b.ox * 4;
        ty = -400;
      } else {
        const nav = navTarget(b);
        if (nav) {
          tx = nav[0];
          ty = nav[1];
        } else {
          const d = dogs[b.dog];
          tx = d.x + b.ox;
          ty = d.y + b.oy;
        }
      }
      let dx = tx - b.x;
      let dy = ty - b.y;
      const dist = Math.hypot(dx, dy) || 1;
      b.wa += (rng() - 0.5) * 0.35;
      const w = Math.sin(b.wa) * BEE_WANDER;
      const c = Math.cos(w);
      const s = Math.sin(w);
      dx /= dist;
      dy /= dist;
      b.vx += ((dx * c - dy * s) * BEE_SPEED - b.vx) * BEE_STEER;
      b.vy += ((dx * s + dy * c) * BEE_SPEED - b.vy) * BEE_STEER;
    }

    // 犬が2ひきのときは、出てきた順に交互にねらう犬を決める。
    // 「いちばん近い犬」をねらわせると、近いほうの犬の守りに群がったまま、守っていないもう1ぴきへ行かなかった
    function spawnBees() {
      if (sim.defendT % SPAWN_EVERY !== 0) return;
      for (const h of hives) {
        if (h.spawned >= h.n) continue;
        h.spawned++;
        const x = h.x + (rng() - 0.5) * 12;
        const y = h.y + HIVE_R * 0.55;
        // ox, oy: 犬のまわりのどこを狙うか（ハチごとに少しずつずらして、群れが一点に固まらないようにする）
        const a = rng() * Math.PI * 2;
        const dog = sim.bees.length % dogs.length;
        sim.bees.push({ x, y, vx: 0, vy: 120, im: 1 / BEE_M, dog, ox: Math.cos(a) * 12, oy: Math.sin(a) * 12, wa: rng() * 6.28 });
        sim.events.push({ type: 'spawn', x, y });
      }
    }

    function clampSpeed(o, max) {
      const s2 = o.vx * o.vx + o.vy * o.vy;
      if (s2 > max * max) {
        const k = max / Math.sqrt(s2);
        o.vx *= k;
        o.vy *= k;
      }
    }

    function findContacts() {
      contacts = [];
      const L = sim.line;
      const bees = sim.bees;
      if (body) {
        // 線の外枠。長い線でも、遠い物とは粒ごとに調べない
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        for (const p of L) {
          if (p.x < x1) x1 = p.x;
          if (p.x > x2) x2 = p.x;
          if (p.y < y1) y1 = p.y;
          if (p.y > y2) y2 = p.y;
        }
        const near = (x, y, r) => x > x1 - r && x < x2 + r && y > y1 - r && y < y2 + r;
        const nearBlocks = blocks.filter((bl) => bl[0] < x2 + LINE_R && bl[2] > x1 - LINE_R && bl[1] < y2 + LINE_R && bl[3] > y1 - LINE_R);
        const nearDogs = dogs.filter((d) => near(d.x, d.y, LINE_R + DOG_R));
        const nearBees = bees.filter((b) => near(b.x, b.y, LINE_R + BEE_R));
        for (let i = 0; i < L.length; i++) {
          const p = L[i];
          const rax = p.x - body.x;
          const ray = p.y - body.y;
          for (const bl of nearBlocks) {
            const c = blockContact(p.x, p.y, LINE_R, bl);
            if (c) addContact(body, null, c.nx, c.ny, c.pen, MU_LINE, rax, ray);
          }
          for (const d of nearDogs) {
            const dx = p.x - d.x;
            const dy = p.y - d.y;
            const min = LINE_R + DOG_R;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 1e-9) {
              const dd = Math.sqrt(d2);
              addContact(body, d, dx / dd, dy / dd, min - dd, MU_LINE_DOG, rax, ray);
            }
          }
          for (const b of nearBees) {
            const dx = p.x - b.x;
            const dy = p.y - b.y;
            const min = LINE_R + BEE_R;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 1e-9) {
              const dd = Math.sqrt(d2);
              addContact(body, b, dx / dd, dy / dd, min - dd, MU_BEE, rax, ray);
            }
          }
        }
      }
      for (let i = 0; i < dogs.length; i++) {
        const d = dogs[i];
        for (const bl of blocks) {
          const c = blockContact(d.x, d.y, DOG_R, bl);
          if (c) addContact(d, null, c.nx, c.ny, c.pen, MU_DOG, 0, 0);
        }
        for (let j = i + 1; j < dogs.length; j++) {
          const e = dogs[j];
          const dx = d.x - e.x;
          const dy = d.y - e.y;
          const min = DOG_R * 2;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 1e-9) {
            const dd = Math.sqrt(d2);
            addContact(d, e, dx / dd, dy / dd, min - dd, 0.2, 0, 0);
          }
        }
      }
      for (let i = 0; i < bees.length; i++) {
        const b = bees[i];
        for (const bl of blocks) {
          const c = blockContact(b.x, b.y, BEE_R, bl);
          if (c) addContact(b, null, c.nx, c.ny, c.pen, MU_BEE, 0, 0);
        }
        for (let j = i + 1; j < bees.length; j++) {
          const e = bees[j];
          const dx = b.x - e.x;
          const dy = b.y - e.y;
          const min = BEE_R * 2;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 1e-9) {
            const dd = Math.sqrt(d2);
            addContact(b, e, dx / dd, dy / dd, min - dd, 0, 0, 0);
          }
        }
        // 刺したあとは犬のまわりに群がる（犬に重ならない。犬は動かさない）
        if (sim.state === 'fail') {
          for (const d of dogs) {
            const dx = b.x - d.x;
            const dy = b.y - d.y;
            const min = BEE_R + DOG_R;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 1e-9) {
              const dd = Math.sqrt(d2);
              addContact(b, null, dx / dd, dy / dd, min - dd, 0, 0, 0);
            }
          }
        }
      }
    }

    function substep() {
      if (body) {
        body.vy += GRAVITY * DT;
        clampSpeed(body, MAX_SPEED);
      }
      for (const d of dogs) {
        d.vy += GRAVITY * DT;
        clampSpeed(d, MAX_SPEED);
      }
      for (const b of sim.bees) steerBee(b);
      findContacts();
      for (let it = 0; it < ITER; it++) for (let i = 0; i < contacts.length; i++) solve(contacts[i]);
      if (body) {
        body.vx *= DAMP;
        body.vy *= DAMP;
        body.w *= DAMP;
        body.x += body.vx * DT;
        body.y += body.vy * DT;
        body.a += body.w * DT;
        placeLine();
      }
      for (const d of dogs) {
        d.x += d.vx * DT;
        d.y += d.vy * DT;
      }
      for (const b of sim.bees) {
        b.x += b.vx * DT;
        b.y += b.vy * DT;
      }
    }

    function fail(reason) {
      if (sim.state !== 'defend') return;
      sim.state = 'fail';
      sim.reason = reason;
      sim.events.push({ type: 'fail', reason });
    }

    function judge() {
      if (sim.state !== 'defend') return;
      const touch = DOG_R + BEE_R + TOUCH;
      for (const d of dogs) {
        for (const b of sim.bees) {
          if ((b.x - d.x) * (b.x - d.x) + (b.y - d.y) * (b.y - d.y) < touch * touch) {
            d.stung = true;
            sim.events.push({ type: 'sting', x: b.x, y: b.y });
            fail('sting');
            return;
          }
        }
        if (d.y > KG.H + DOG_R) {
          fail('fall');
          return;
        }
      }
      if (sim.defendT >= timeSteps) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
      }
    }

    function step() {
      sim.t++;
      if (sim.state === 'draw') return; // 線を描き終わるまでは、何も動かさない
      if (sim.state === 'defend') {
        spawnBees();
        sim.defendT++;
      }
      if (sim.state !== 'clear' && sim.t % NAV_EVERY === 0) buildNav();
      for (let i = 0; i < SUB; i++) substep();
      judge();
      // 画面の外へ出たハチ（帰っていったハチ）は消す
      if (sim.state === 'clear') sim.bees = sim.bees.filter((b) => b.y > -60);
    }

    return sim;
  }

  KG.guardSim = { createSim, LINE_R, SPACING, DOG_R, BEE_R, HIVE_R, TOP, MIN_LEN, CELL };
})();
