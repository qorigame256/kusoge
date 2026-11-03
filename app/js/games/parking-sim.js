// 駐車場から車を出すの中身（車の動き・勝ち負け）。DOM・canvas・window には触らない（Node の検査 tools/test-parking.js がそのまま読み込むため）。
// 駐車場は cols × rows のマス目。車は縦か横に len マス（普通の車 2、トラック 3）を占め、前を向いた方向（dir）へしか進まない。
// タップした車は前へ進み、前が駐車場の端まで空いていれば外へ出る（盤から消える）。途中に別の車がいれば、そのすぐ手前で止まる。
// すぐ前に車がいる車は動かない（手数に数えない）。全部の車を出せばクリア。どの車も動けなくなったら失敗。
// 金色の車（6面から）は、ぶつかったら失敗（ほかの車がぶつかっても、金色の車がぶつかりにいっても）。すぐ前にいて動けないだけなら失敗にしない。
// 動ける車が残っていても、どれを動かしても金色の車にぶつかるなら、その時点で失敗にする（打つ手が無いのに、やり直しを押すまで待たせないため）。
// ぶつかった車は元の場所へ戻さず、手前で止めたままにする。戻すと詰む手が無くなり、どの順で出しても解けてしまう（CLAUDE.md「Claude が決めた作り」）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  // 向きごとの1マスの進み方
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

  function createSim(level) {
    const cols = level.cols;
    const rows = level.rows;
    // level.cars の1台は [x, y, 向き, 長さ, 種類]。x, y は車が占めるマスのうち左上のマス。長さを省くと 2、種類 'gold' は金色の車
    const cars = level.cars.map(([x, y, dir, len, kind], i) => ({ i, x, y, dir, len: len || 2, gold: kind === 'gold', out: false }));

    const sim = {
      level,
      cols,
      rows,
      cars,
      moves: 0, // 動かした回数（動かなかったタップは数えない）
      state: 'play', // 'play' | 'clear' | 'fail'
      reason: '', // 失敗の理由。'stuck'（どの車も動けない）| 'nosafe'（どれを動かしても金色の車にぶつかる）| 'gold'（金色の車がぶつかった）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      tap,
      cellsOf,
      carAt,
      lookAhead,
      canMove,
      left,
    };

    function horizontal(c) {
      return c.dir === 'L' || c.dir === 'R';
    }

    // 車が占めるマス [[x, y], ...]
    function cellsOf(c) {
      const out = [];
      for (let k = 0; k < c.len; k++) out.push(horizontal(c) ? [c.x + k, c.y] : [c.x, c.y + k]);
      return out;
    }

    // そのマスにいる車の番号（いなければ -1。出た車は数えない）
    function carAt(x, y) {
      for (const c of cars) {
        if (c.out) continue;
        if (horizontal(c) ? y === c.y && x >= c.x && x < c.x + c.len : x === c.x && y >= c.y && y < c.y + c.len) return c.i;
      }
      return -1;
    }

    // i 番の車の前を見る。free は前に空いているマスの数、hit は前をふさいでいる車の番号（端まで空いていれば -1）
    function lookAhead(i) {
      const c = cars[i];
      const [dx, dy] = DIRS[c.dir];
      // いちばん前のマス
      let x = dx > 0 ? c.x + c.len - 1 : c.x;
      let y = dy > 0 ? c.y + c.len - 1 : c.y;
      let free = 0;
      for (;;) {
        x += dx;
        y += dy;
        if (x < 0 || x >= cols || y < 0 || y >= rows) return { free, hit: -1 };
        const o = carAt(x, y);
        if (o >= 0) return { free, hit: o };
        free++;
      }
    }

    function canMove(i) {
      if (cars[i].out) return false;
      const a = lookAhead(i);
      return a.hit < 0 || a.free > 0;
    }

    // 動けて、しかも金色の車にぶつからない
    function canMoveSafely(i) {
      if (!canMove(i)) return false;
      const a = lookAhead(i);
      return a.hit < 0 || !(cars[i].gold || cars[a.hit].gold);
    }

    // 駐車場に残っている車の数
    function left() {
      return cars.filter((c) => !c.out).length;
    }

    function judge() {
      if (cars.every((c) => c.out)) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
        return;
      }
      const reason = !cars.some((c) => canMove(c.i)) ? 'stuck' : !cars.some((c) => canMoveSafely(c.i)) ? 'nosafe' : '';
      if (reason) {
        sim.state = 'fail';
        sim.reason = reason;
        sim.events.push({ type: 'fail', reason });
      }
    }

    // i 番の車をタップする。動いたら true
    function tap(i) {
      if (sim.state !== 'play' || i < 0 || i >= cars.length || cars[i].out) return false;
      const c = cars[i];
      const { free, hit } = lookAhead(i);
      if (hit >= 0 && free === 0) {
        sim.events.push({ type: 'deny', car: i, hit });
        return false;
      }
      const from = { x: c.x, y: c.y };
      sim.moves++;
      if (hit < 0) {
        c.out = true;
        sim.events.push({ type: 'exit', car: i, from, dist: free });
      } else {
        const [dx, dy] = DIRS[c.dir];
        c.x += dx * free;
        c.y += dy * free;
        sim.events.push({ type: 'move', car: i, from, dist: free, hit });
        if (c.gold || cars[hit].gold) {
          sim.state = 'fail';
          sim.reason = 'gold';
          sim.events.push({ type: 'fail', reason: 'gold', car: i, hit });
          return true;
        }
      }
      judge();
      return true;
    }

    return sim;
  }

  KG.parkingSim = { createSim, DIRS };
})();
