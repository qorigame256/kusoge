// ピン抜きの中身（物理と勝ち負けの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-pinpull.js がそのまま読み込むため）。
// 粒は位置ベースの計算（Verlet）で動かす: 速度を持たず「今の位置 − 1つ前の位置」を速度とみなし、重なりは位置を押し戻して解く。
// 1回の step() は 1/60 秒。中で SUB 回に分けて計算する（速い粒が壁をすり抜けないように）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  const SUB = 4;
  const DT = 1 / 60 / SUB;
  const GRAVITY = 1400; // 論理ピクセル毎秒毎秒
  const GSTEP = GRAVITY * DT * DT;
  const DAMP = 0.998;
  const MAXV = 6; // 1小刻みに動ける最大距離（壁の半分の太さ + 粒の半径より小さく保つ）
  const STIFF = 0.8; // 粒どうしの重なりを1回でどれだけ押し戻すか
  const WALL_R = 8;
  const PIN_R = 6;
  const HERO_R = 14;
  const MONSTER = { r: 24, fric: 0.01, rest: 0 };
  const CELL = 24; // 近くの粒だけを調べるためのます目の大きさ（いちばん大きい粒の直径 20 より大きく）
  const TOUCH = 1.5; // 反応（水と溶岩・溶岩と敵）は、これだけ離れていても触れたとみなす
  const TOUCH_HOT = 4; // 固まりたての石は、これだけ離れた溶岩まで固める（金貨の山にまぎれた溶岩を取り残さないため）
  const HOT_STEPS = 60; // 固まりたての石が、触れた溶岩を続けて固める時間（刻み）
  const CALM_MOVE = 0.15; // 1刻みの最大移動がこれ未満なら「止まっている」
  const CALM_STEPS = 40; // 止まっている状態がこの刻み数続いたら「落ち着いた」
  // 宝が目標数に届いても、溶岩と生きた敵が止まるまではクリアにしない（あとから転がってくるものを見逃さないため）。
  // 水と石は勇者に害が無いので待たない（待つと、狭い部屋に積み上がるまで4秒ほどかかった）。
  // 止まらないときに最大で待つ刻み数。120 では坂を転がる敵を見逃した（ステージ5 で a→b→c がクリアになった）。
  const GOAL_WAIT_MAX = 360;
  const NOPIN_WAIT_MAX = 360; // ピンが無くなってから、落ち着くのを最大で待つ刻み数

  const TYPES = {
    gold: { r: 10, fric: 0.005, rest: 0.15 },
    water: { r: 6.5, fric: 0.002, rest: 0 },
    lava: { r: 6.5, fric: 0.004, rest: 0 },
    stone: { r: 6.5, fric: 0.006, rest: 0 }, // 摩擦を大きくすると坂の上をゆっくりずり落ち続け、「止まった」判定がいつまでも来ない
  };

  function seg(x1, y1, x2, y2, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return { x1, y1, x2, y2, dx, dy, len2: dx * dx + dy * dy || 1, r };
  }

  function inRect(o, r) {
    return o.x >= r[0] && o.x <= r[2] && o.y >= r[1] && o.y <= r[3];
  }

  // 長方形（粒の中心が入る範囲）を、下の段から詰めて粒で埋める
  function spawnRect(out, f, rng) {
    const r = TYPES[f.type].r;
    const x1 = f.rect[0];
    const y1 = f.rect[1];
    const x2 = f.rect[2];
    const y2 = f.rect[3];
    const dx = r * 2 + 0.5;
    const dy = dx * 0.866;
    let n = 0;
    for (let row = 0, y = y2; y >= y1 && n < f.n; row++, y -= dy) {
      for (let x = x1 + (row % 2 ? dx / 2 : 0); x <= x2 + 0.001 && n < f.n; x += dx) {
        const px = x + (rng() - 0.5) * 0.6;
        const py = y + (rng() - 0.5) * 0.6;
        out.push({ type: f.type, r, x: px, y: py, px, py, sx: px, sy: py, hot: 0, dead: false, cx: 0, cy: 0 });
        n++;
      }
    }
    return n;
  }

  function createSim(level) {
    const rng = KG.rng(level.seed || 1);
    const walls = level.walls.map((w) => seg(w[0], w[1], w[2], w[3], WALL_R));
    const pins = level.pins.map((p) => {
      const s = seg(p.ring[0], p.ring[1], p.end[0], p.end[1], PIN_R);
      s.id = p.id;
      s.active = true;
      s.pulledAt = -1;
      return s;
    });
    const particles = [];
    for (const f of level.fill) spawnRect(particles, f, rng);
    const monsters = (level.monsters || []).map((m) => ({
      x: m.x,
      y: m.y,
      px: m.x,
      py: m.y,
      sx: m.x,
      sy: m.y,
      r: MONSTER.r,
      alive: true,
      diedAt: -1,
    }));
    const hero = { x: level.hero.x, y: level.hero.y };
    const heroSeg = seg(hero.x, hero.y - HERO_R - 2, hero.x, hero.y - 50, HERO_R);
    const totalGold = particles.filter((p) => p.type === 'gold').length;

    const cols = Math.ceil(KG.W / CELL) + 2;
    const rows = Math.ceil(KG.H / CELL) + 2;
    const head = new Int32Array(cols * rows);
    let next = new Int32Array(Math.max(16, particles.length));
    let lostOff = 0;
    let sizzled = false;

    const sim = {
      level,
      walls,
      pins,
      particles,
      monsters,
      hero,
      totalGold,
      target: Math.max(1, Math.ceil(totalGold * (level.goal || 0.6))),
      collected: 0,
      lost: 0,
      state: 'playing', // 'playing' | 'clear' | 'fail'
      reason: null, // 失敗の理由 'lava' | 'monster' | 'nogold'
      locked: false, // true になったらピンを抜けない
      t: 0,
      maxMove: 0,
      calmSteps: 0,
      threatCalmSteps: 0, // 溶岩と生きた敵だけを見たときの「止まっている」刻み数
      goalAt: -1,
      lastPullAt: -1,
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      step,
      pull,
      pinAt,
      isCalm() {
        return sim.calmSteps >= CALM_STEPS;
      },
    };

    // タップした位置にいちばん近い、まだ抜いていないピン
    function pinAt(x, y) {
      let best = null;
      let bestD = 34;
      for (const p of pins) {
        if (!p.active) continue;
        let u = ((x - p.x1) * p.dx + (y - p.y1) * p.dy) / p.len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const d = Math.hypot(x - (p.x1 + p.dx * u), y - (p.y1 + p.dy * u));
        if (d < bestD) {
          bestD = d;
          best = p.id;
        }
      }
      return best;
    }

    function pull(id) {
      if (sim.state !== 'playing' || sim.locked) return false;
      const p = pins.find((q) => q.id === id && q.active);
      if (!p) return false;
      p.active = false;
      p.pulledAt = sim.t;
      sim.lastPullAt = sim.t;
      sim.calmSteps = 0;
      sim.events.push({ type: 'pull', id });
      return true;
    }

    function integrate(p) {
      let vx = (p.x - p.px) * DAMP;
      let vy = (p.y - p.py) * DAMP;
      const s2 = vx * vx + vy * vy;
      if (s2 > MAXV * MAXV) {
        const k = MAXV / Math.sqrt(s2);
        vx *= k;
        vy *= k;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GSTEP;
    }

    // 太さのある線分（壁・ピン・勇者）から押し出し、ぶつかった向きの速度を消して（少しはね返し）、すべる向きに摩擦をかける
    function collideSeg(p, s, t) {
      let u = ((p.x - s.x1) * s.dx + (p.y - s.y1) * s.dy) / s.len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      let nx = p.x - (s.x1 + s.dx * u);
      let ny = p.y - (s.y1 + s.dy * u);
      const min = s.r + p.r;
      const d2 = nx * nx + ny * ny;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        nx = 0;
        ny = -1;
      } else {
        nx /= d;
        ny /= d;
      }
      let wx = p.x - p.px; // 押し出す前の速度
      let wy = p.y - p.py;
      const pen = min - d;
      p.x += nx * pen;
      p.y += ny * pen;
      const vn = wx * nx + wy * ny;
      if (vn < 0) {
        wx -= nx * vn * (1 + t.rest);
        wy -= ny * vn * (1 + t.rest);
      }
      const vn2 = wx * nx + wy * ny;
      const tx = wx - nx * vn2;
      const ty = wy - ny * vn2;
      wx = nx * vn2 + tx * (1 - t.fric);
      wy = ny * vn2 + ty * (1 - t.fric);
      p.px = p.x - wx;
      p.py = p.y - wy;
    }

    function collideStatic(p, t) {
      for (let i = 0; i < walls.length; i++) collideSeg(p, walls[i], t);
      for (let i = 0; i < pins.length; i++) if (pins[i].active) collideSeg(p, pins[i], t);
      collideSeg(p, heroSeg, t);
    }

    function toStone(p) {
      p.type = 'stone';
      p.r = TYPES.stone.r;
      p.hot = HOT_STEPS;
    }

    // 水と溶岩が触れたら両方が石になる。固まりたての石に触れた溶岩も石になる（溶岩のかたまり全体が固まる）
    // gap は2つの粒のすき間（負なら重なっている）
    function react(a, b, gap) {
      const ta = a.type;
      const tb = b.type;
      if ((ta === 'water' && tb === 'lava') || (ta === 'lava' && tb === 'water')) {
        if (gap > TOUCH) return;
        toStone(a);
        toStone(b);
        if (!sizzled) {
          sizzled = true;
          sim.events.push({ type: 'sizzle', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      } else if (ta === 'lava' && tb === 'stone' && b.hot > 0) {
        toStone(a);
      } else if (tb === 'lava' && ta === 'stone' && a.hot > 0) {
        toStone(b);
      }
    }

    function collidePairs() {
      const n = particles.length;
      if (next.length < n) next = new Int32Array(n * 2);
      head.fill(-1);
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        let cx = Math.floor(p.x / CELL) + 1;
        let cy = Math.floor(p.y / CELL) + 1;
        if (cx < 0) cx = 0;
        else if (cx >= cols) cx = cols - 1;
        if (cy < 0) cy = 0;
        else if (cy >= rows) cy = rows - 1;
        p.cx = cx;
        p.cy = cy;
        const c = cy * cols + cx;
        next[i] = head[c];
        head[c] = i;
      }
      for (let i = 0; i < n; i++) {
        const a = particles[i];
        for (let oy = -1; oy <= 1; oy++) {
          const gy = a.cy + oy;
          if (gy < 0 || gy >= rows) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const gx = a.cx + ox;
            if (gx < 0 || gx >= cols) continue;
            for (let j = head[gy * cols + gx]; j !== -1; j = next[j]) {
              if (j <= i) continue;
              const b = particles[j];
              let dx = a.x - b.x;
              let dy = a.y - b.y;
              const min = a.r + b.r;
              const d2 = dx * dx + dy * dy;
              if (d2 >= (min + TOUCH_HOT) * (min + TOUCH_HOT)) continue;
              if (a.type !== b.type) react(a, b, Math.sqrt(d2) - min);
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
      }
    }

    function killMonster(m) {
      m.alive = false;
      m.diedAt = sim.t;
      sim.events.push({ type: 'monsterDie', x: m.x, y: m.y });
    }

    // 敵は大きくて重い粒として扱う（押し合いでは粒のほうが大きく動く）。溶岩に触れたら倒れる
    function collideMonster(m) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let dx = p.x - m.x;
        let dy = p.y - m.y;
        const min = p.r + m.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (min + TOUCH) * (min + TOUCH)) continue;
        if (p.type === 'lava') {
          killMonster(m);
          return;
        }
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          dx = 0;
          dy = -0.01;
          d = 0.01;
        }
        const k = (min - d) / d;
        p.x += dx * k * 0.85;
        p.y += dy * k * 0.85;
        m.x -= dx * k * 0.15;
        m.y -= dy * k * 0.15;
      }
    }

    function substep() {
      for (let i = 0; i < particles.length; i++) integrate(particles[i]);
      for (const m of monsters) if (m.alive) integrate(m);
      collidePairs();
      for (const m of monsters) if (m.alive) collideMonster(m);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        collideStatic(p, TYPES[p.type]);
      }
      for (const m of monsters) if (m.alive) collideStatic(m, MONSTER);
    }

    function fail(reason) {
      if (sim.state !== 'playing') return;
      sim.state = 'fail';
      sim.reason = reason;
      sim.locked = true;
      sim.events.push({ type: 'fail', reason });
    }

    // 判定は「勇者の部屋（level.room）に入ったか」で行う。金貨は入った瞬間に回収、溶岩か生きた敵が入ったら失敗。
    // 穴（level.pits）に落ちた金貨は、もう届かないものとして数える。
    function judge() {
      const room = level.room;
      const pits = level.pits || [];
      let inPits = 0;
      for (const p of particles) {
        if (p.dead) continue;
        if (p.y > KG.H + 40 || p.x < -40 || p.x > KG.W + 40) {
          p.dead = true;
          if (p.type === 'gold') lostOff++;
          continue;
        }
        if (p.type === 'gold') {
          // クリアが決まったあとに届いた金貨も数える（失敗のあとは数えない）
          if (sim.state !== 'fail' && inRect(p, room)) {
            p.dead = true;
            sim.collected++;
            sim.events.push({ type: 'collect', x: p.x, y: p.y });
          } else if (sim.state === 'playing') {
            for (const r of pits) {
              if (inRect(p, r)) {
                inPits++;
                break;
              }
            }
          }
        } else if (p.type === 'lava' && sim.state === 'playing' && inRect(p, room)) {
          fail('lava');
        }
      }
      if (sim.state !== 'playing') return;
      for (const m of monsters) {
        if (m.alive && inRect(m, room)) {
          fail('monster');
          return;
        }
      }
      sim.lost = inPits + lostOff;
      if (sim.collected >= sim.target) {
        if (!sim.locked) {
          sim.locked = true;
          sim.goalAt = sim.t;
          sim.events.push({ type: 'goal' });
        }
        if (sim.threatCalmSteps >= CALM_STEPS || sim.t - sim.goalAt >= GOAL_WAIT_MAX) {
          sim.state = 'clear';
          sim.events.push({ type: 'clear' });
        }
        return;
      }
      const reachable = sim.totalGold - sim.collected - sim.lost; // まだ届く見込みのある金貨
      const pinsLeft = pins.some((p) => p.active);
      const settled = sim.isCalm() || (!pinsLeft && sim.t - sim.lastPullAt >= NOPIN_WAIT_MAX);
      if (settled && (!pinsLeft || sim.collected + reachable < sim.target)) fail('nogold');
    }

    function compact() {
      let w = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.dead) particles[w++] = p;
      }
      particles.length = w;
    }

    function step() {
      sizzled = false;
      for (const p of particles) {
        p.sx = p.x;
        p.sy = p.y;
      }
      for (const m of monsters) {
        m.sx = m.x;
        m.sy = m.y;
      }
      for (let i = 0; i < SUB; i++) substep();
      sim.t++;
      let maxMove = 0;
      let threatMove = 0;
      for (const p of particles) {
        if (p.hot > 0) p.hot--;
        const mv = Math.abs(p.x - p.sx) + Math.abs(p.y - p.sy);
        if (mv > maxMove) maxMove = mv;
        if (p.type === 'lava' && mv > threatMove) threatMove = mv;
      }
      for (const m of monsters) {
        if (!m.alive) continue;
        const mv = Math.abs(m.x - m.sx) + Math.abs(m.y - m.sy);
        if (mv > maxMove) maxMove = mv;
        if (mv > threatMove) threatMove = mv;
      }
      sim.maxMove = maxMove;
      sim.calmSteps = maxMove < CALM_MOVE ? sim.calmSteps + 1 : 0;
      sim.threatCalmSteps = threatMove < CALM_MOVE ? sim.threatCalmSteps + 1 : 0;
      judge();
      compact();
    }

    return sim;
  }

  KG.pinpullSim = { createSim, TYPES, WALL_R, PIN_R, HERO_R, MONSTER_R: MONSTER.r, HOT_STEPS };
})();
