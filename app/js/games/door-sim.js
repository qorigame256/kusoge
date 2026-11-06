// 人を同じ色の扉へ連れていくの中身（盤・道・歩く・ぶつかる の決まりと勝ち負け）。DOM・canvas・window には触らない
// （Node の検査 tools/test-door.js がそのまま読み込むため）。描画と指の操作は door.js が持つ。
// 盤は W × H のマス目。level.grid は H 行 × W 字:
//   . 床／# 壁（通れない）／大文字 人（R 赤・B 青・Y 黄・G 緑・P 紫）／小文字 扉（r 赤・b 青・y 黄・g 緑・p 紫。同じ色の人の行き先）。
//   1色に人1人と扉1つ。
// level.robots は見回りロボットの並び [[行, 列, 行, 列], …]（6面から）。1つ目のマスにいて、2つ目のマスへ向かってまっすぐ動き、
// はしに着いたらすぐ向きを変えて、行ったり来たりする（止まらない）。ロボットの通る所は床だけ。
// 道（2026-11-06 Claude の判断。道の長さが少しずれるだけでぶつかる、という弱い所を無くすため、マス目に沿わせ、1歩＝1マスで数える）:
//   人のマスから始まり、上下左右のとなりのマスへつながる。同じマスを2回通らない。壁とほかの色の扉は通れない。
//   ほかの人の道と重なってもよく、ほかの人のいるマスも通れる（その人は1拍目に動き出している）。
//   自分の扉に着いたら、その道はできあがり（そこで終わる）。
// 全員の道ができあがったら（指を離したとき）、全員が一斉に歩き出す。1拍ごとに、扉に入っていない全員とロボットが1マスずつ進む（止まらない）。
// 扉に着いた人は、その拍に扉へ入って盤から消える。
// ぶつかる: 同じ拍に同じマスへ来る、または向かい合ってすれ違う（2人が入れかわる）。人どうしも、人とロボットも、ぶつかったら失敗。
// 後ろについて歩く（前の人が出たマスへ、次の拍に入る）のはぶつからない。全員が扉に入ればクリア。失敗のほかに時間の制限は無い。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const DR = [-1, 0, 1, 0]; // 向き 0 上・1 右・2 下・3 左
  const DC = [0, 1, 0, -1];
  const DIRS = 'URDL'; // 検査の手順の書き方で使う向きの文字（DR・DC と同じ並び）
  const COLORS = 'RBYGP'; // 人と扉の色（この並びで人の番号を決める）

  // 画面の並べ方（論理座標）。盤の大きさで1マスの大きさを決め、上の帯の下（140〜940）の真ん中に置く。
  // 描画（door.js）と、指の位置からマスを決める計算（cellAt）が使う
  function layout(W, H) {
    const T = 14; // 外の壁の厚さ
    const C = Math.floor(Math.min(84, (KG.W - 2 * (T + 24)) / W, (800 - 2 * T - 20) / H));
    const left = Math.round((KG.W - W * C) / 2);
    const top = Math.round(140 + T + (800 - 2 * T - H * C) / 2);
    return { C, T, left, top };
  }

  // ロボットの通るマス（1つ目のマスから2つ目のマスまで、まっすぐ）
  function trackOf(W, spec) {
    const [r0, c0, r1, c1] = spec;
    const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    const sr = Math.sign(r1 - r0);
    const sc = Math.sign(c1 - c0);
    const cells = [];
    for (let k = 0; k <= n; k++) cells.push((r0 + sr * k) * W + c0 + sc * k);
    return cells;
  }

  // ロボットが拍 t にいるマス（はしで向きを変えて行ったり来たり。拍 0 は1つ目のマス）
  function robotAt(track, t) {
    const m = track.length - 1;
    if (m <= 0) return track[0];
    const k = t % (2 * m);
    return track[k <= m ? k : 2 * m - k];
  }

  function parseLevel(level) {
    const g = level.grid;
    const H = g.length;
    const W = g[0].length;
    const wall = new Uint8Array(W * H);
    const doorColor = new Array(W * H).fill(''); // そのマスの扉の色（扉でなければ ''）
    const starts = {};
    const doors = {};
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = g[r][c];
        const i = r * W + c;
        if (ch === '#') wall[i] = 1;
        else if (COLORS.includes(ch)) starts[ch] = i;
        else if (ch !== ch.toUpperCase() && COLORS.includes(ch.toUpperCase())) {
          doors[ch.toUpperCase()] = i;
          doorColor[i] = ch.toUpperCase();
        }
      }
    }
    const people = [...COLORS]
      .filter((col) => starts[col] !== undefined)
      .map((col, id) => ({ id, color: col, start: starts[col], door: doors[col] }));
    const robots = (level.robots || []).map((spec, id) => ({ id, spec, track: trackOf(W, spec) }));
    return { W, H, wall, doorColor, people, robots };
  }

  function createSim(level) {
    const parsed = parseLevel(level);
    const { W, H, wall, doorColor, robots } = parsed;
    // path: 道のマスの並び（最初は人のいるマスだけ）／done: 道が自分の扉まで届いた／inside: 扉に入った
    const people = parsed.people.map((p) => Object.assign(p, { path: [p.start], done: false, inside: false }));

    const sim = {
      W,
      H,
      level,
      wall,
      doorColor,
      people,
      robots,
      L: layout(W, H),
      state: 'draw', // 'draw' 道を描いている | 'walk' 歩いている | 'clear' | 'fail'
      t: 0, // 歩き出してからの拍
      drawing: -1, // 道を描いている人の番号（いなければ -1）
      crash: null, // ぶつかったときの様子 { t, hits: [{ kind: 'cell' | 'swap', a, b }] }（a・b は { kind: 'person' | 'robot', id, from, to }）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      inside,
      walkable,
      cellAt,
      pick,
      beginDraw,
      drawTo,
      endDraw,
      personCell,
      robotCell,
      beat,
      runAll,
      left,
    };

    function inside(r, c) {
      return r >= 0 && c >= 0 && r < H && c < W;
    }

    // 人 id がマス cell を歩けるか（壁でも、ほかの色の扉でもない）
    function walkable(id, cell) {
      if (wall[cell]) return false;
      const col = doorColor[cell];
      return !col || col === people[id].color;
    }

    // 画面の (x, y) にあるマス [行, 列]（盤の外なら null）
    function cellAt(x, y) {
      const c = Math.floor((x - sim.L.left) / sim.L.C);
      const r = Math.floor((y - sim.L.top) / sim.L.C);
      return inside(r, c) ? [r, c] : null;
    }

    // マス (r, c) をさわったときに道を描き始める人と、その始め方。人のいるマスなら 'start'（道を描き直す）、
    // 道の先（道の最後のマス。できあがった道なら扉）なら 'end'（その続きを描く・戻って直す）。どちらでもなければ null
    function pick(r, c) {
      if (sim.state !== 'draw' || !inside(r, c)) return null;
      const cell = r * W + c;
      for (const p of people) if (p.start === cell) return { id: p.id, from: 'start' };
      for (const p of people) if (p.path.length > 1 && p.path[p.path.length - 1] === cell) return { id: p.id, from: 'end' };
      return null;
    }

    // 人 id の道を描き始める。from が 'start' なら、それまでの道を消して人のマスから描き直す
    function beginDraw(id, from) {
      if (sim.state !== 'draw' || !people[id]) return false;
      const p = people[id];
      sim.drawing = id;
      if (from === 'start') {
        p.path = [p.start];
        p.done = false;
      }
      sim.events.push({ type: 'begin', id });
      return true;
    }

    // 描いている道を、マス (r, c) へ向けて1マスずつのばす（指の動きに合わせて呼ぶ）。
    // 離れているほうの向き（縦か横）を先に試し、通れなければもう片方を試す。
    // 自分の道のマスへ戻ると、道はそこまで縮む（1つ前のマスへ戻れば1マス縮む）。壁・ほかの色の扉・盤の外では止まる。
    // 自分の扉に着いたら道はできあがり、その先へはのびない（戻れば縮む）。
    // 起きたことを順に並べて返す（'add' のびた・'back' 縮んだ・'done' 扉に着いた・'stop' 止まった）
    function drawTo(r, c) {
      const out = [];
      const id = sim.drawing;
      if (id < 0 || sim.state !== 'draw') return out;
      const p = people[id];
      for (let n = 0; n < 200; n++) {
        const last = p.path[p.path.length - 1];
        const lr = Math.floor(last / W);
        const lc = last % W;
        const dr = r - lr;
        const dc = c - lc;
        if (!dr && !dc) break;
        const h = dc > 0 ? 1 : dc < 0 ? 3 : -1;
        const v = dr > 0 ? 2 : dr < 0 ? 0 : -1;
        const cand = Math.abs(dc) >= Math.abs(dr) ? [h, v] : [v, h];
        let did = '';
        for (const d of cand) {
          if (d < 0) continue;
          const nr = lr + DR[d];
          const nc = lc + DC[d];
          if (!inside(nr, nc)) continue;
          const cell = nr * W + nc;
          const at = p.path.indexOf(cell);
          if (at >= 0) {
            p.path.length = at + 1;
            p.done = false;
            did = 'back';
            break;
          }
          if (p.done || !walkable(id, cell)) continue;
          p.path.push(cell);
          if (cell === p.door) p.done = true;
          did = p.done ? 'done' : 'add';
          break;
        }
        if (!did) {
          out.push('stop');
          break;
        }
        out.push(did);
        sim.events.push({ type: did, id });
        if (did === 'done') break;
      }
      return out;
    }

    // 指を離した。全員の道ができあがっていれば、歩き出す（歩き出したら true）
    function endDraw() {
      if (sim.drawing < 0) return false;
      sim.drawing = -1;
      if (sim.state === 'draw' && people.every((p) => p.done)) {
        sim.state = 'walk';
        sim.t = 0;
        sim.events.push({ type: 'start' });
        return true;
      }
      return false;
    }

    // 人 id が拍 t にいるマス（扉に入ったあとは -1。扉に着いた拍は扉のマス）
    function personCell(id, t) {
      const path = people[id].path;
      return t < path.length ? path[t] : -1;
    }

    function robotCell(id, t) {
      return robotAt(robots[id].track, t);
    }

    // 1拍進める（拍 t-1 → t）。ぶつかったら 'fail'、全員が扉に入ったら 'clear'、続くなら 'walk' を返す
    function beat() {
      if (sim.state !== 'walk') return null;
      const t = ++sim.t;
      const movers = [];
      for (const p of people) {
        const to = personCell(p.id, t);
        if (to >= 0) movers.push({ kind: 'person', id: p.id, from: personCell(p.id, t - 1), to });
      }
      for (const rb of robots) movers.push({ kind: 'robot', id: rb.id, from: robotAt(rb.track, t - 1), to: robotAt(rb.track, t) });
      const hits = [];
      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          const a = movers[i];
          const b = movers[j];
          if (a.kind === 'robot' && b.kind === 'robot') continue; // ロボットどうしは面の作りで重ならない
          if (a.to === b.to) hits.push({ kind: 'cell', a, b });
          else if (a.to === b.from && b.to === a.from) hits.push({ kind: 'swap', a, b });
        }
      }
      if (hits.length) {
        sim.state = 'fail';
        sim.crash = { t, hits };
        sim.events.push({ type: 'crash', crash: sim.crash });
        return 'fail';
      }
      for (const p of people) {
        if (!p.inside && t === p.path.length - 1) {
          p.inside = true;
          sim.events.push({ type: 'enter', id: p.id });
        }
      }
      if (people.every((p) => p.inside)) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
        return 'clear';
      }
      return 'walk';
    }

    // 歩き終わるまで進める（検査用）
    function runAll() {
      while (sim.state === 'walk') beat();
      return sim.state;
    }

    // まだ扉に入っていない人の数
    function left() {
      return people.filter((p) => !p.inside).length;
    }

    return sim;
  }

  KG.doorSim = { DR, DC, DIRS, COLORS, layout, trackOf, robotAt, parseLevel, createSim };
})();
