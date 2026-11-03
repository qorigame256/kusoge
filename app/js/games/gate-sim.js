// 数字ゲートの中身（進み方・門・戦いの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-gate.js がそのまま読み込むため）。
// 座標はメートル。x は道の横方向（左端 -ROAD_HALF・右端 +ROAD_HALF）、z は奥行き（スタート 0・ゴール level.length）。
// 1回の step() は 1/60 秒。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  const DT = 1 / 60;
  const ROAD_HALF = 4; // 道の半分の幅
  const X_LIMIT = ROAD_HALF - 0.3; // 群れの中心が動ける範囲
  const SPEED = 10; // 前へ進む速さ（m/秒）
  const SIDE_SPEED = 14; // 横へ動く最大の速さ（m/秒）
  const MAX_COUNT = 99999;
  const FIGHT_RATE = 0.06; // 戦いで1刻みに減る割合（少ないほうの人数に対して。最低1人）

  // 群れの半径（m）。人数が増えるほど広がる
  function crowdRadius(n) {
    return Math.min(3.6, 0.3 + 0.22 * Math.sqrt(Math.max(0, n)));
  }

  // 門の文字 '+10' '×2' '−5' '÷2' を計算の形にする（ひき算は全角の「−」と半角の「-」のどちらでもよい）
  function parseLabel(label) {
    const c = label.charAt(0);
    const op = c === '-' ? '−' : c;
    return { op, v: Number(label.slice(1)), good: op === '+' || op === '×' };
  }

  function applyOp(n, g) {
    if (g.op === '+') return n + g.v;
    if (g.op === '×') return n * g.v;
    if (g.op === '−') return n - g.v;
    if (g.op === '÷') return Math.floor(n / g.v);
    return n;
  }

  function createSim(level) {
    const rows = level.rows.map((r) => ({
      z: r.z,
      gates: r.gates.map((g) => Object.assign({ x1: g.x1, x2: g.x2, label: g.label }, parseLabel(g.label))),
      passed: false,
    }));
    const enemies = (level.enemies || []).map((e) => ({ x: e.x, z: e.z, n: e.n, n0: e.n, done: false, boss: false }));
    const boss = { x: 0, z: level.length, n: level.boss, n0: level.boss, done: false, boss: true };

    const sim = {
      level,
      rows,
      enemies,
      boss,
      x: 0,
      targetX: 0,
      z: 0,
      count: level.start,
      state: 'ready', // 'ready'（最初のタッチ待ち）| 'run' | 'battle' | 'clear' | 'fail'
      reason: null, // 失敗の理由 'zero'（門で0人）| 'battle'（戦いで負け）
      battle: null, // 戦っている相手（enemies の要素か boss）
      t: 0,
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      start,
      setTargetX,
      step,
      radius() {
        return crowdRadius(sim.count);
      },
    };

    function start() {
      if (sim.state !== 'ready') return;
      sim.state = 'run';
      sim.events.push({ type: 'start' });
    }

    function setTargetX(x) {
      sim.targetX = Math.max(-X_LIMIT, Math.min(X_LIMIT, x));
    }

    function fail(reason) {
      sim.state = 'fail';
      sim.reason = reason;
      sim.events.push({ type: 'fail', reason, boss: !!(sim.battle && sim.battle.boss) });
    }

    function startBattle(e) {
      sim.state = 'battle';
      sim.battle = e;
      sim.events.push({ type: 'battleStart', boss: e.boss });
    }

    // 1刻みごとに、少ないほうの人数の FIGHT_RATE ぶん（最低1人）ずつ両方が減る。同じ人数なら両方0になり負け
    function fight() {
      const e = sim.battle;
      const k = Math.max(1, Math.floor(Math.min(sim.count, e.n) * FIGHT_RATE));
      const loss = Math.min(k, sim.count, e.n);
      sim.count -= loss;
      e.n -= loss;
      sim.events.push({ type: 'hit', loss });
      if (e.n <= 0 && sim.count > 0) {
        e.done = true;
        sim.battle = null;
        sim.events.push({ type: 'battleEnd', win: true, boss: e.boss });
        if (e.boss) {
          sim.state = 'clear';
          sim.events.push({ type: 'clear' });
        } else {
          sim.state = 'run';
        }
      } else if (sim.count <= 0) {
        sim.events.push({ type: 'battleEnd', win: false, boss: e.boss });
        fail('battle');
      }
    }

    function step() {
      sim.t++;
      if (sim.state === 'battle') {
        fight();
        return;
      }
      if (sim.state !== 'run') return;
      const dx = sim.targetX - sim.x;
      const maxd = SIDE_SPEED * DT;
      sim.x += dx > maxd ? maxd : dx < -maxd ? -maxd : dx;
      sim.z += SPEED * DT;

      // 門: 群れの中心がどの門の幅に入っているかで1つだけ効く
      for (const row of rows) {
        if (row.passed || sim.z < row.z) continue;
        row.passed = true;
        const i = row.gates.findIndex((g) => sim.x >= g.x1 && sim.x < g.x2);
        if (i < 0) continue;
        const g = row.gates[i];
        const before = sim.count;
        sim.count = Math.max(0, Math.min(MAX_COUNT, applyOp(sim.count, g)));
        sim.events.push({ type: 'gate', gate: g, before, after: sim.count });
        if (sim.count <= 0) {
          fail('zero');
          return;
        }
      }

      // 途中の敵の群れ: 横に重なったまま近づいたら戦い。横にずれていれば通り過ぎる
      const r = crowdRadius(sim.count);
      for (const e of enemies) {
        if (e.done) continue;
        const er = crowdRadius(e.n);
        if (sim.z >= e.z + er) {
          e.done = true;
          continue;
        }
        if (sim.z >= e.z - (r + er) * 0.6 && Math.abs(sim.x - e.x) < r + er - 0.2) {
          startBattle(e);
          return;
        }
      }

      // ゴールの敵
      if (sim.z >= boss.z - 1) {
        sim.z = boss.z - 1;
        startBattle(boss);
      }
    }

    return sim;
  }

  KG.gateSim = { createSim, crowdRadius, parseLabel, ROAD_HALF, X_LIMIT, SPEED };
})();
