// ネジ外しの中身（ネジ・板・穴の決まりと勝ち負け）。DOM・canvas・window には触らない（Node の検査 tools/test-screw.js がそのまま読み込むため）。
// 盤は cols × rows の点のマス目。穴（level.holes）は点の上にあり、ネジは穴に1本ずつ差さる。
// 板はまっすぐな棒（横か縦。長さ len マス）で、両はしにだけ穴がある。はしの点に差さったネジがその板を留める（1本のネジが、そこに
// はしがある板をまとめて留めることもある）。板には重なりの順がある（level.planks の並び。後ろほど上）。
// ネジをタップすると外れて手に持つ。そのネジだけで留まっていた板は落ち、留めるネジが1本だけになった板は、そのネジから真下へぶら下がる。
// 持ったネジは、外した穴のほかの空いている穴へ差す（そこにはしがある板を留める）。外した穴へ戻せないのは、戻せると
// 「外して板を回し、同じ穴へ戻す」をくり返すだけで、ほとんどの面が気をつけなくても解けてしまったため（2026-11-04 に全部の手を調べて確かめた）。
// 板の中ほど（はし以外）がかぶさっている穴には差せない。ネジより上の板の中ほどがかぶさっているネジは外せない。
// 色つきのネジ（6面から）は同じ色の穴にだけ差せる（色の無いネジは色の無い穴にだけ）。穴の色は level.holes の3つ目。
// 全部の板を落とせばクリア。持ったネジを差せる穴が無いとき（'nohole'）は失敗。
// 「外せるネジが1本も無い」は起こらない（いちばん上の板を留めるネジには、上からかぶさる板が無い）ので、失敗の理由に入れていない。
// 手数は外した回数（外して差すまでで1手。最後の板を落とした1手は差さずに終わる）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  function createSim(level) {
    const cols = level.cols;
    const rows = level.rows;
    // 穴 { x, y, color }。色の無い穴は color が ''
    const holes = level.holes.map(([x, y, color]) => ({ x, y, color: color || '' }));
    const holeAt = (x, y) => holes.findIndex((h) => h.x === x && h.y === y);
    // 板 { i, x0, y0, x1, y1, len, fallen, pins }。pins[0] は (x0, y0) のはし、pins[1] は (x1, y1) のはしが留まっているか
    const planks = level.planks.map(([x0, y0, x1, y1], i) => ({ i, x0, y0, x1, y1, len: Math.abs(x1 - x0) + Math.abs(y1 - y0), fallen: false, pins: [false, false] }));
    // ネジ { i, hole, color }。hole は差さっている穴の番号（手に持っている間は -1）。ネジの色は、最初に差さっている穴の色
    const screws = level.screws.map(([x, y], i) => ({ i, hole: holeAt(x, y), color: holes[holeAt(x, y)].color }));
    const screwAt = holes.map(() => -1); // 穴の番号 → 差さっているネジの番号（空いていれば -1）
    for (const s of screws) screwAt[s.hole] = s.i;

    const sim = {
      level,
      cols,
      rows,
      holes,
      planks,
      screws,
      screwAt,
      held: -1, // 手に持っているネジ（持っていなければ -1）
      heldFrom: -1, // 持っているネジを外した穴
      moves: 0,
      state: 'play', // 'play' | 'clear' | 'fail'
      reason: '', // 失敗の理由。'nohole'（持ったネジを差せる穴が無い）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      lift,
      place,
      canLift,
      canPlace,
      coverOf,
      screwZ,
      holeAt,
      left,
    };

    // 板 k の中ほど（はし以外）が点 (x, y) にかぶさっているか
    function inside(k, x, y) {
      if (k.fallen) return false;
      if (k.y0 === k.y1) return y === k.y0 && x > Math.min(k.x0, k.x1) && x < Math.max(k.x0, k.x1);
      return x === k.x0 && y > Math.min(k.y0, k.y1) && y < Math.max(k.y0, k.y1);
    }

    // 板 k のはしのうち、点 (x, y) にあるもの（0 か 1。無ければ -1）
    function endAt(k, x, y) {
      if (k.x0 === x && k.y0 === y) return 0;
      if (k.x1 === x && k.y1 === y) return 1;
      return -1;
    }

    // ネジの高さ: 留めている板のうち、いちばん上の板の順番（何も留めていなければ -1）
    function screwZ(si) {
      const h = holes[screws[si].hole];
      let z = -1;
      for (const k of planks) {
        if (k.fallen) continue;
        const e = endAt(k, h.x, h.y);
        if (e >= 0 && k.pins[e]) z = Math.max(z, k.i);
      }
      return z;
    }

    // 点 (x, y) に中ほどがかぶさっている板のうち、above より上でいちばん上のもの（無ければ -1）
    function coverOf(x, y, above) {
      let top = -1;
      for (const k of planks) if (k.i > above && inside(k, x, y)) top = k.i;
      return top;
    }

    function canLift(si) {
      const s = screws[si];
      if (sim.state !== 'play' || sim.held >= 0 || s.hole < 0) return false;
      const h = holes[s.hole];
      return coverOf(h.x, h.y, screwZ(si)) < 0;
    }

    // 持っているネジを穴 hi へ差せるか（外した穴へは戻せない）
    function canPlace(hi) {
      if (sim.state !== 'play' || sim.held < 0 || hi === sim.heldFrom || screwAt[hi] >= 0) return false;
      const h = holes[hi];
      return h.color === screws[sim.held].color && coverOf(h.x, h.y, -1) < 0;
    }

    function left() {
      return planks.filter((k) => !k.fallen).length;
    }

    // 留めるネジが無い板は落ち、1本だけの板はそのネジから真下へぶら下がる。quiet なら知らせを出さない（最初の形を整えるとき）
    function settle(quiet) {
      for (const k of planks) {
        if (k.fallen) continue;
        const n = (k.pins[0] ? 1 : 0) + (k.pins[1] ? 1 : 0);
        const from = { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 };
        if (n === 0) {
          k.fallen = true;
          if (!quiet) sim.events.push({ type: 'fall', plank: k.i, from });
        } else if (n === 1) {
          const e = k.pins[0] ? 0 : 1;
          const px = e === 0 ? k.x0 : k.x1;
          const py = e === 0 ? k.y0 : k.y1;
          // 留まっているはしを (x0, y0) にそろえ、もう一方のはしを真下に置く。もともと真下にぶら下がっていれば、はしの呼び方を直すだけ
          const hang = { x0: px, y0: py, x1: px, y1: py + k.len };
          const same = k.x0 === k.x1 && Math.min(k.y0, k.y1) === py && (e === 0 ? k.y1 : k.y0) === py + k.len;
          Object.assign(k, hang);
          k.pins = [true, false];
          if (!same && !quiet) sim.events.push({ type: 'swing', plank: k.i, from, to: hang, pivot: { x: px, y: py } });
        }
      }
    }

    // ネジ si を外して手に持つ。外せたら true
    function lift(si) {
      if (!canLift(si)) {
        if (sim.state === 'play' && sim.held < 0 && si >= 0 && si < screws.length) {
          const h = holes[screws[si].hole];
          sim.events.push({ type: 'deny', screw: si, by: coverOf(h.x, h.y, screwZ(si)) });
        }
        return false;
      }
      const s = screws[si];
      const hi = s.hole;
      const h = holes[hi];
      sim.moves++;
      sim.held = si;
      sim.heldFrom = hi;
      screwAt[hi] = -1;
      s.hole = -1;
      for (const k of planks) {
        if (k.fallen) continue;
        const e = endAt(k, h.x, h.y);
        if (e >= 0) k.pins[e] = false;
      }
      sim.events.push({ type: 'lift', screw: si, hole: hi });
      settle(false);
      if (left() === 0) {
        // 最後の板が落ちたら、持っているネジは外した穴へ戻しておく（もう留める板は無い）
        screwAt[hi] = si;
        s.hole = hi;
        sim.held = -1;
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
        return true;
      }
      if (!holes.some((x, j) => canPlace(j))) {
        sim.state = 'fail';
        sim.reason = 'nohole';
        sim.events.push({ type: 'fail', reason: 'nohole' });
      }
      return true;
    }

    // 持っているネジを穴 hi へ差す。差せたら true
    function place(hi) {
      if (!canPlace(hi)) {
        if (sim.state === 'play' && sim.held >= 0) sim.events.push({ type: 'deny', hole: hi });
        return false;
      }
      const si = sim.held;
      const h = holes[hi];
      screwAt[hi] = si;
      screws[si].hole = hi;
      sim.held = -1;
      const pinned = [];
      for (const k of planks) {
        if (k.fallen) continue;
        const e = endAt(k, h.x, h.y);
        if (e >= 0) {
          k.pins[e] = true;
          pinned.push(k.i);
        }
      }
      sim.events.push({ type: 'place', screw: si, hole: hi, from: sim.heldFrom, pinned });
      sim.heldFrom = -1;
      return true;
    }

    // 最初の形: ネジが差さっているはしを留め、留まり方に合わせて板を置き直す（面の側では、どの板も両はしを留めておく）
    for (const s of screws) {
      const h = holes[s.hole];
      for (const k of planks) {
        const e = endAt(k, h.x, h.y);
        if (e >= 0) k.pins[e] = true;
      }
    }
    settle(true);
    return sim;
  }

  KG.screwSim = { createSim };
})();
