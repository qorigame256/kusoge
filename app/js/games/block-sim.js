// ブロックを置いて列を消すの中身（盤・ブロック・列が消える決まりと勝ち負け）。DOM・canvas・window には触らない
// （Node の検査 tools/test-block.js がそのまま読み込むため）。描画と指で運ぶ操作は block.js が持つ。
// 盤は N × N（N = 8）のマス目。マスの番号は 行 × N + 列（行は上から 0、列は左から 0）。
// マスの中身 cells[i]: 0 空き／1 ブロック／2 氷のブロック（6面から）。宝石 gem[i] はブロックか氷のブロックの中にある。
// ブロック（level.pieces の1つ。'##/#.' のように行を / で区切り、# が埋まった所）は決まった形のまま置き、回せない。
// 受け皿（tray）には3つまで並び、どれからでも、どの順でも置ける。3つとも置くと、次の3つ（残りが3つより少なければ残り全部）が出る。
// 出る順は level.pieces の並びで、毎回同じ。
// 置いたあと、横の1行か縦の1列が全部埋まっていたら、その行・列のマスを全部消す（同時にそろった行と列はまとめて消す）。
// 消える行・列が1本通るたびに、そのマスは1回消える。ふつうのブロックは1回で空きになり、宝石があれば取れる。
// 氷のブロックは1回目で氷が割れてふつうのブロックになり（宝石は残る）、2回目で空きになる。
// 1回に消える行と列が交わるマスは2回消える（氷のブロックもそこで空きになる）。
// 宝石を全部取ればクリア。受け皿のどのブロックも置ける所が無い（'nospace'）か、ブロックを全部置いても宝石が残った（'nopiece'）ときは失敗。
// 手数は置いた回数。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});
  const N = 8;
  const TRAY = 3;

  // 画面の並べ方（論理座標）。描画（block.js）と、指の位置から置く所を決める計算（dropCell）が使う
  const LAYOUT = {
    C: 54, // 盤の1マス
    left: 54, // 盤の左の端
    top: 156, // 盤の上の端
    trayY: 712, // 受け皿の真ん中の高さ
    trayX: [90, 270, 450], // 受け皿の3つの置き場の真ん中
    trayHalfW: 90, // 置き場をつかめる幅の半分
    trayHalfH: 96, // 置き場をつかめる高さの半分
    trayCell: 26, // 受け皿に並ぶブロックの1マス
    lift: 70, // 運んでいるブロックの下の端と指のすき間（指でブロックが隠れないように）
  };

  // 形の文字列を { cells: [[行, 列] …], w, h } にする（左上が 0, 0）
  function parseShape(s) {
    const rows = s.split('/');
    const cells = [];
    rows.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        if (ch === '#') cells.push([r, c]);
      });
    });
    return { cells, w: Math.max(...rows.map((l) => l.length)), h: rows.length };
  }

  // 運んでいるブロックの左上のマス。指が (fx, fy) にあるとき、ブロックは指の真上（下の端が lift だけ上）に描かれ、いちばん近いマスへ寄せる
  function dropCell(piece, fx, fy) {
    const x0 = fx - (piece.w * LAYOUT.C) / 2;
    const y0 = fy - LAYOUT.lift - piece.h * LAYOUT.C;
    return [Math.round((y0 - LAYOUT.top) / LAYOUT.C), Math.round((x0 - LAYOUT.left) / LAYOUT.C)];
  }

  // 指が (x, y) にあるとき、つかむ受け皿の置き場（無ければ -1）
  function slotAt(x, y) {
    if (Math.abs(y - LAYOUT.trayY) > LAYOUT.trayHalfH) return -1;
    return LAYOUT.trayX.findIndex((cx) => Math.abs(x - cx) <= LAYOUT.trayHalfW);
  }

  function createSim(level) {
    const cells = new Uint8Array(N * N);
    const gem = new Uint8Array(N * N);
    const owner = new Int16Array(N * N).fill(-1); // そのマスを埋めたブロックの番号（色分け用）。最初からあるブロックは -1
    level.board.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const i = r * N + c;
        if (ch === '#' || ch === '*') cells[i] = 1;
        else if (ch === '=' || ch === '@') cells[i] = 2;
        if (ch === '*' || ch === '@') gem[i] = 1;
      });
    });
    const pieces = level.pieces.map((shape, id) => Object.assign({ id, shape }, parseShape(shape)));
    const tray = new Array(TRAY).fill(-1); // 置き場ごとのブロックの番号（空いていれば -1）

    const sim = {
      N,
      TRAY,
      level,
      cells,
      gem,
      owner,
      pieces,
      tray,
      next: 0, // 次に受け皿へ出るブロックの番号
      moves: 0,
      state: 'play', // 'play' | 'clear' | 'fail'
      reason: '', // 失敗の理由。'nospace'（置ける所が無い）／'nopiece'（ブロックを全部置いても宝石が残った）
      events: [], // 描画側が読んで空にする（音や演出のきっかけ）
      canPlace,
      place,
      fits,
      linesIf,
      gemsLeft,
      piecesLeft,
    };

    // ブロック id を、左上が (r, c) になるように置けるか（盤の中で、全部のマスが空き）
    function fitsAt(id, r, c) {
      for (const [dr, dc] of pieces[id].cells) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N || cells[rr * N + cc]) return false;
      }
      return true;
    }

    function canPlace(slot, r, c) {
      return sim.state === 'play' && slot >= 0 && slot < TRAY && tray[slot] >= 0 && fitsAt(tray[slot], r, c);
    }

    // ブロック id を置ける所が盤のどこかにあるか
    function fits(id) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fitsAt(id, r, c)) return true;
      return false;
    }

    // 置き場 slot のブロックを (r, c) に置いたら全部埋まる行と列（置けなければ null）。運んでいる間の下見に使う
    function linesIf(slot, r, c) {
      if (!canPlace(slot, r, c)) return null;
      const filled = cells.slice();
      for (const [dr, dc] of pieces[tray[slot]].cells) filled[(r + dr) * N + c + dc] = 1;
      return fullLines(filled);
    }

    function fullLines(b) {
      const rows = [];
      const cols = [];
      for (let k = 0; k < N; k++) {
        let row = true;
        let col = true;
        for (let j = 0; j < N; j++) {
          if (!b[k * N + j]) row = false;
          if (!b[j * N + k]) col = false;
        }
        if (row) rows.push(k);
        if (col) cols.push(k);
      }
      return { rows, cols };
    }

    function gemsLeft() {
      let n = 0;
      for (let i = 0; i < N * N; i++) n += gem[i];
      return n;
    }

    // まだ置いていないブロックの数（受け皿のぶんと、これから出るぶん）
    function piecesLeft() {
      return tray.filter((id) => id >= 0).length + pieces.length - sim.next;
    }

    function deal() {
      const ids = [];
      for (let k = 0; k < TRAY; k++) {
        tray[k] = sim.next < pieces.length ? sim.next++ : -1;
        if (tray[k] >= 0) ids.push(tray[k]);
      }
      return ids;
    }

    // 置き場 slot のブロックを、左上が (r, c) になるように置く。置けたら true
    function place(slot, r, c) {
      if (!canPlace(slot, r, c)) {
        if (sim.state === 'play' && slot >= 0 && slot < TRAY && tray[slot] >= 0) sim.events.push({ type: 'deny', slot });
        return false;
      }
      const id = tray[slot];
      const put = [];
      for (const [dr, dc] of pieces[id].cells) {
        const i = (r + dr) * N + c + dc;
        cells[i] = 1;
        owner[i] = id;
        put.push(i);
      }
      tray[slot] = -1;
      sim.moves++;
      sim.events.push({ type: 'place', slot, id, r, c, cells: put });
      const { rows, cols } = fullLines(cells);
      if (rows.length || cols.length) {
        // マスごとに、通る行・列の数だけ消す
        const hits = new Uint8Array(N * N);
        for (const k of rows) for (let j = 0; j < N; j++) hits[k * N + j]++;
        for (const k of cols) for (let j = 0; j < N; j++) hits[j * N + k]++;
        const removed = []; // { i, owner, ice }（ice: 氷のブロックが一度に2回消えたもの）
        const cracked = []; // 氷が割れて、ふつうのブロックになったマス
        const gems = []; // 宝石を取ったマス
        for (let i = 0; i < N * N; i++) {
          if (!hits[i]) continue;
          if (cells[i] === 2 && hits[i] === 1) {
            cells[i] = 1;
            cracked.push(i);
            continue;
          }
          removed.push({ i, owner: owner[i], ice: cells[i] === 2 });
          cells[i] = 0;
          owner[i] = -1;
          if (gem[i]) {
            gem[i] = 0;
            gems.push(i);
          }
        }
        sim.events.push({ type: 'lines', rows, cols, removed, cracked, gems });
      }
      if (!gemsLeft()) {
        sim.state = 'clear';
        sim.events.push({ type: 'clear' });
        return true;
      }
      if (tray.every((x) => x < 0)) {
        if (sim.next >= pieces.length) {
          fail('nopiece');
          return true;
        }
        sim.events.push({ type: 'deal', ids: deal() });
      }
      if (!tray.some((x) => x >= 0 && fits(x))) fail('nospace');
      return true;
    }

    function fail(reason) {
      sim.state = 'fail';
      sim.reason = reason;
      sim.events.push({ type: 'fail', reason });
    }

    deal();
    return sim;
  }

  KG.blockSim = { N, TRAY, LAYOUT, parseShape, dropCell, slotAt, createSim };
})();
