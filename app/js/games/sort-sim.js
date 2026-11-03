// 水の色分けの中身（注ぐ決まり・そろったかの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-sort.js がそのまま読み込むため）。
// 試験管は色の文字の配列（下から上）。注ぐと、いちばん上で続いている同じ色の段を、入るだけまとめて移す。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const CAP = 4; // 試験管1本に入る段の数

  function createSim(level) {
    const tubes = level.tubes.map((s) => s.split(''));
    // hidden[i][k]: i 本目の試験管の下から k 段目が「？」で隠れているか。隠す面では、いちばん上の段のほかを隠す
    const hidden = tubes.map((t) => t.map((c, k) => !!level.hidden && k < t.length - 1));

    const sim = {
      level,
      tubes,
      hidden,
      cap: CAP,
      selected: -1, // 選んでいる試験管（選んでいなければ -1）
      moves: 0,
      state: 'play', // 'play' | 'clear' | 'fail'
      reason: null, // 失敗の理由 'stuck'（そろえられる注ぎ方が残っていない）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      tap,
      pour,
      canPour,
      isDone,
      topRun,
      usefulMoves,
    };

    // いちばん上で続いている同じ色の段の数（隠れている段も数える。同じ色の水はひとかたまりで流れ出るため）
    function topRun(i) {
      const t = tubes[i];
      if (!t.length) return 0;
      const c = t[t.length - 1];
      let n = 1;
      while (n < t.length && t[t.length - 1 - n] === c) n++;
      return n;
    }

    // 4段とも同じ色でそろった
    function isDone(i) {
      return tubes[i].length === CAP && topRun(i) === CAP;
    }

    function canPour(a, b) {
      if (a === b) return false;
      const s = tubes[a];
      const d = tubes[b];
      if (!s.length || d.length >= CAP) return false;
      return !d.length || d[d.length - 1] === s[s.length - 1];
    }

    // 形が変わる注ぎ方の数。1色だけの試験管を空の試験管へ丸ごと移す手は、入れ替わるだけなので数えない
    function usefulMoves() {
      let n = 0;
      for (let a = 0; a < tubes.length; a++) {
        if (!tubes[a].length || isDone(a)) continue;
        const whole = topRun(a) === tubes[a].length;
        for (let b = 0; b < tubes.length; b++) {
          if (!canPour(a, b)) continue;
          if (whole && !tubes[b].length) continue;
          n++;
        }
      }
      return n;
    }

    function judge() {
      if (tubes.every((t, i) => !t.length || isDone(i))) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
        return;
      }
      if (!usefulMoves()) {
        sim.state = 'fail';
        sim.reason = 'stuck';
        sim.events.push({ type: 'fail', reason: 'stuck' });
      }
    }

    function pour(a, b) {
      if (sim.state !== 'play' || !canPour(a, b)) return false;
      const s = tubes[a];
      const d = tubes[b];
      const c = s[s.length - 1];
      const n = Math.min(topRun(a), CAP - d.length);
      for (let k = 0; k < n; k++) {
        s.pop();
        hidden[a].pop();
        d.push(c);
        hidden[b].push(false);
      }
      sim.moves++;
      sim.events.push({ type: 'pour', from: a, to: b, color: c, n });
      // 注いだあとに上になった段は見えるようにする
      if (s.length && hidden[a][s.length - 1]) {
        hidden[a][s.length - 1] = false;
        sim.events.push({ type: 'reveal', tube: a });
      }
      if (isDone(b)) sim.events.push({ type: 'done', tube: b });
      judge();
      return true;
    }

    // タップ。何も選んでいなければ選ぶ。選んでいれば、そこへ注ぐ。注げないときは、色の入った試験管なら選び直す
    function tap(i) {
      if (sim.state !== 'play' || i < 0 || i >= tubes.length) return;
      const a = sim.selected;
      if (a < 0) {
        if (tubes[i].length && !isDone(i)) {
          sim.selected = i;
          sim.events.push({ type: 'select', tube: i });
        } else {
          sim.events.push({ type: 'deny', tube: i });
        }
        return;
      }
      if (i === a) {
        sim.selected = -1;
        sim.events.push({ type: 'deselect', tube: i });
        return;
      }
      if (pour(a, i)) {
        sim.selected = -1;
        return;
      }
      if (tubes[i].length && !isDone(i)) {
        sim.selected = i;
        sim.events.push({ type: 'select', tube: i });
      } else {
        sim.events.push({ type: 'deny', tube: i });
      }
    }

    return sim;
  }

  KG.sortSim = { createSim, CAP };
})();
