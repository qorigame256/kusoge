// 水の色分けの中身（注ぐ決まり・そろったかの判定）。DOM・canvas・window には触らない（Node の検査 tools/test-sort.js がそのまま読み込むため）。
// 試験管は色の文字の配列（下から上）。注ぐと、いちばん上で続いている同じ色の段を、入るだけまとめて移す。注ぐ先の色は問わない（違う色の上にも注げる）。
// 大きな入れ物（level.big に番号を並べる）は BIG_CAP 段まで入る。試験管も大きな入れ物も、1色 CAP 段だけになったら「そろった」として栓をし、
// 選べず、注げなくなる（大きな入れ物は半分まで入った所で栓をする）。
// 失敗は無い。面の側で空きを十分に取り、注げる所が必ず残るようにする（決まりは sort-levels.js の冒頭）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const CAP = 4; // 試験管1本に入る段の数。どの色もちょうどこの段の数だけある
  const BIG_CAP = 8; // 大きな入れ物に入る段の数

  function createSim(level) {
    const tubes = level.tubes.map((s) => s.split(''));
    const big = tubes.map((t, i) => !!level.big && level.big.includes(i));
    const caps = big.map((b) => (b ? BIG_CAP : CAP));
    // hidden[i][k]: i 本目の下から k 段目が「？」で隠れているか。隠す面では、いちばん上の段のほかを隠す
    const hidden = tubes.map((t) => t.map((c, k) => !!level.hidden && k < t.length - 1));

    const sim = {
      level,
      tubes,
      hidden,
      big, // big[i]: i 本目が大きな入れ物か
      caps, // caps[i]: i 本目に入る段の数
      selected: -1, // 選んでいる試験管（選んでいなければ -1）
      moves: 0,
      state: 'play', // 'play' | 'clear'
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      tap,
      pour,
      canPour,
      isDone,
      topRun,
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

    // 1色 CAP 段だけになった（栓をしている）
    function isDone(i) {
      return tubes[i].length === CAP && topRun(i) === CAP;
    }

    function canPour(a, b) {
      if (a === b || isDone(a) || isDone(b)) return false;
      return tubes[a].length > 0 && tubes[b].length < caps[b];
    }

    function judge() {
      if (tubes.every((t, i) => !t.length || isDone(i))) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
      }
    }

    function pour(a, b) {
      if (sim.state !== 'play' || !canPour(a, b)) return false;
      const s = tubes[a];
      const d = tubes[b];
      const c = s[s.length - 1];
      const n = Math.min(topRun(a), caps[b] - d.length);
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
      // 大きな入れ物は、上をどかして1色4段だけが残っても、そろったことになる
      if (isDone(a)) sim.events.push({ type: 'done', tube: a });
      if (isDone(b)) sim.events.push({ type: 'done', tube: b });
      judge();
      return true;
    }

    // タップ。何も選んでいなければ選ぶ。選んでいれば、そこへ注ぐ。注げないとき（満杯・栓をしている）は、色の入った試験管なら選び直す
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

  KG.sortSim = { createSim, CAP, BIG_CAP };
})();
