// 塔登りの中身（部屋に入る・戦う・どの階まで入れるか）。DOM・canvas・window には触らない（Node の検査 tools/test-tower.js がそのまま読み込むため）。
// 階は下から 1, 2, 3 …。勇者は 0 階（塔の前の地面）から始める。
// 入れるのは「これまでに立った最も高い階」の1つ上の階まで。下の階へはいつでも戻れる（立った階には空いた部屋が必ずあり、そこを通れるため）。
// 錠前つきの部屋は、鍵を1本使って開けてから入る（鍵は鍵の部屋で1本ずつもらう）。入れる部屋が1つも無くなったら（残りが錠前つきで鍵も無い）失敗にする。
// 1回の step() は 1/60 秒。部屋へ移るのに MOVE_STEPS、戦いに FIGHT_STEPS かかる。
// createSim(level, { instant: true }) は待たずにその場で決まる（入る順番を全部試す検査用）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  const MOVE_STEPS = 24;
  const FIGHT_STEPS = 36;
  const MAX_POWER = 999999;

  // 部屋の文字: 'E5'（敵）'B40'（てっぺんの敵）'+5'（強くなる薬）'×2'（強さが倍になる）'−3'（罠。半角の '-' でもよい）'K'（鍵）。
  // 頭に 'L' を付けると錠前つきの部屋になる（'L×3' 'LE20' 'LB50' など。中身は 'L' を除いた文字のとおり）
  function parseRoom(label) {
    if (label.charAt(0) === 'L') return Object.assign(parseRoom(label.slice(1)), { locked: true });
    if (label === 'K') return { kind: 'key', locked: false };
    const c = label.charAt(0);
    const v = Number(label.slice(1));
    if (c === 'E') return { kind: 'enemy', v, locked: false };
    if (c === 'B') return { kind: 'boss', v, locked: false };
    if (c === '+' || c === '×') return { kind: 'item', op: c, v, locked: false };
    if (c === '−' || c === '-') return { kind: 'trap', op: '−', v, locked: false };
    throw new Error('部屋の文字が読めない: ' + label);
  }

  function createSim(level, opts) {
    const instant = !!(opts && opts.instant);
    const rooms = [];
    level.floors.forEach((labels, fi) => {
      labels.forEach((label, ci) => {
        rooms.push(Object.assign({ id: rooms.length, floor: fi + 1, col: ci, cols: labels.length, label, done: false }, parseRoom(label)));
      });
    });

    const sim = {
      level,
      rooms,
      floors: level.floors.length,
      power: level.start,
      at: null, // 勇者がいる部屋（null は 0 階の地面）
      maxFloor: 0, // これまでに立った最も高い階
      keys: 0, // 持っている鍵の数
      state: 'play', // 'play'（タップ待ち）| 'move' | 'fight' | 'clear' | 'fail'
      reason: null, // 失敗の理由 'lose'（自分より強い敵）| 'even'（同じ強さの敵）| 'zero'（罠で0以下）| 'stuck'（鍵が足りず、入れる部屋が無い）
      move: null, // { from（部屋か null）, to, t }
      fight: null, // { room, t, win }
      t: 0,
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      canEnter,
      tap,
      step,
    };

    function canEnter(room) {
      return sim.state === 'play' && room !== sim.at && room.floor <= sim.maxFloor + 1 && (!room.locked || sim.keys > 0);
    }

    // 部屋を選ぶ。入れない部屋なら false を返し、何も変えない
    function tap(id) {
      const room = rooms[id];
      if (!room || !canEnter(room)) return false;
      sim.move = { from: sim.at, to: room, t: 0 };
      sim.state = 'move';
      sim.events.push({ type: 'move', room });
      if (instant) arrive();
      return true;
    }

    function arrive() {
      const room = sim.move.to;
      sim.move = null;
      sim.at = room;
      sim.maxFloor = Math.max(sim.maxFloor, room.floor);
      if (room.locked) {
        room.locked = false;
        sim.keys--;
        sim.events.push({ type: 'unlock', room });
      }
      if (room.done) {
        sim.state = 'play';
        return;
      }
      if (room.kind === 'key') {
        sim.keys++;
        room.done = true;
        sim.events.push({ type: 'key', room });
        settle();
        return;
      }
      if (room.kind === 'enemy' || room.kind === 'boss') {
        sim.state = 'fight';
        sim.fight = { room, t: 0, win: sim.power > room.v };
        sim.events.push({ type: 'fightStart', room, win: sim.fight.win });
        if (instant) endFight();
        return;
      }
      // 薬と罠はその場で効く
      const before = sim.power;
      if (room.op === '+') sim.power += room.v;
      else if (room.op === '×') sim.power *= room.v;
      else if (room.op === '−') sim.power -= room.v;
      sim.power = Math.max(0, Math.min(MAX_POWER, sim.power));
      room.done = true;
      sim.events.push({ type: 'item', room, before, after: sim.power });
      if (sim.power <= 0) {
        fail('zero');
        return;
      }
      settle();
    }

    // 次の部屋を選ぶ番に戻す。入れる部屋が1つも無ければ（残りが錠前つきで、鍵も無い）、もう進めないので失敗にする
    function settle() {
      sim.state = 'play';
      if (!rooms.some((r) => !r.done && canEnter(r))) fail('stuck');
    }

    // 勝てば敵の強さがそのまま勇者に足される。同じ強さでは勝てない
    function endFight() {
      const { room, win } = sim.fight;
      sim.fight = null;
      if (win) {
        const before = sim.power;
        sim.power = Math.min(MAX_POWER, sim.power + room.v);
        room.done = true;
        sim.events.push({ type: 'win', room, before, after: sim.power });
        if (room.kind === 'boss') {
          sim.state = 'clear';
          sim.events.push({ type: 'clear' });
        } else {
          settle();
        }
      } else {
        fail(sim.power === room.v ? 'even' : 'lose');
      }
    }

    function fail(reason) {
      sim.state = 'fail';
      sim.reason = reason;
      sim.events.push({ type: 'fail', reason });
    }

    function step() {
      sim.t++;
      if (sim.state === 'move') {
        sim.move.t++;
        if (sim.move.t >= MOVE_STEPS) arrive();
      } else if (sim.state === 'fight') {
        sim.fight.t++;
        if (sim.fight.t >= FIGHT_STEPS) endFight();
      }
    }

    return sim;
  }

  KG.towerSim = { createSim, parseRoom, MOVE_STEPS, FIGHT_STEPS };
})();
