// 砂を掘って玉を運ぶの各レベルを決めた掘り方でなぞり、「クリア／どの理由で失敗／止まったまま」になるかを確かめる。
// クリアになるはずの掘り方は、上下左右に少しずらした9通りと、指の速さを変えた4通りのすべてでクリアになることも確かめる（指でなぞる線はぶれるため）。
// 7面から先は、素直なやり方（管の下の端を開けて、そのままトラックへ掘る）では勝てないことも確かめる。
// あわせて、レベルの形（玉が全部置ける・掘らなければ玉は落ちてこない・トラックが画面に収まる・黒い玉は6面から・ヒントの字数）と、
// 砂・岩・玉の決まりごと（掘ると消える・岩とトラックは消えない・掘る量に上限が無い・荷台に入った玉を数える・ふちより下に落ちた玉はもう入らない・
// 黒い玉が荷台に入ったら失敗・動いている黒い玉を待ってからクリア・ゆるい坂でも止まらない・終わったあとは掘れない など）を小さな盤で確かめる。
// 使い方: node tools/test-sand.js            （このフォルダの app/ を調べる）
//         node tools/test-sand.js <app のフォルダ>  （壊した写しを調べるとき）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'sand-levels.js'));
require(path.join(appDir, 'js', 'games', 'sand-sim.js'));
const KG = globalThis.KG;
const SIM = KG.sandSim;
const LEVELS = KG.sandLevels;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（sand-levels.js の冒頭の注記）
const FINGER = 10; // 指が1刻み（1/60 秒）に進む長さ。秒速 600
const SETTLE = 30; // 面が始まってから指を置くまでの刻み
const AFTER = 900; // なぞり終えてから結果を待つ最大の刻み（15秒）。それでも決まらなければ「止まったまま」

// 1本のなぞり。pts を指でなぞり、なぞり終えたら wait 刻み待つ
const S = (pts, wait) => ({ pts, wait: wait || 0 });

// [レベル番号(0始まり), 掘り方の名前, なぞりの並び, 期待する結果, 素直なやり方なら true]
// 期待は clear / fail:black（黒い玉が荷台に入った）/ fail:short（入れられる玉が足りない）/ stuck（決まらないまま止まった）。
// 期待が clear のものは、ずらしても・速さを変えてもクリアになることまで確かめる。
const CASES = [
  [0, 'まっすぐ下', [S([[240, 330], [240, 860]])], 'clear'],
  [1, '岩の右を回る', [S([[400, 340], [495, 420], [495, 500], [260, 800], [240, 860]])], 'clear'],
  [1, 'まっすぐ下（岩に乗って止まる）', [S([[390, 340], [390, 860]])], 'stuck'],
  [2, '左右の部屋から', [S([[115, 340], [225, 860]]), S([[425, 340], [255, 860]])], 'clear'],
  [2, '左の部屋だけ', [S([[115, 340], [225, 860]])], 'stuck'],
  [3, 'ななめにトラックへ', [S([[160, 340], [360, 860]])], 'clear'],
  [3, 'まっすぐ下（穴に落ちる）', [S([[130, 340], [130, 700]])], 'fail:short'],
  [4, '岩のすき間をジグザグに', [S([[290, 345], [455, 400], [460, 480], [270, 590], [270, 700], [240, 860]])], 'clear'],
  [4, 'まっすぐ下（岩に乗って止まる）', [S([[270, 340], [270, 860]])], 'stuck'],
  [5, '黒い玉の部屋の左を回る', [S([[110, 330], [110, 600], [300, 780], [360, 860]])], 'clear'],
  [5, 'まっすぐななめ（黒い玉の部屋を掘る）', [S([[110, 330], [360, 860]])], 'fail:black'],
  [6, '黒い玉より上で管に穴', [S([[231, 367], [262, 600], [320, 860]])], 'clear'],
  [6, '管の下の端を開ける', [S([[140, 420], [320, 860]])], 'fail:black', true],
  [7, '黒い玉を穴へ逃がしてから管の下の端', [S([[227, 322], [75, 640]], 90), S([[400, 420], [330, 860]])], 'clear'],
  [7, '管の下の端を開ける', [S([[400, 420], [330, 860]])], 'fail:black', true],
  [8, '上の黒い玉を穴へ逃がしてから、下の黒い玉の上に穴', [S([[231, 321], [75, 660]], 90), S([[367, 397], [290, 860]])], 'clear'],
  [8, '管の下の端を開ける', [S([[450, 440], [290, 860]])], 'fail:black', true],
  [8, '下の黒い玉の上に穴だけ（上の黒い玉があとから来る）', [S([[367, 397], [290, 860]])], 'fail:black'],
  [9, '黒い玉の上に穴 → 黒い玉の下に穴（空き部屋へ） → 管の下の端', [S([[276, 346], [240, 860]], 90), S([[369, 398], [366, 500]], 60), S([[470, 450], [480, 620], [250, 860]])], 'clear'],
  [9, '管の下の端を開ける', [S([[470, 450], [480, 620], [250, 860]])], 'fail:black', true],
  [9, '黒い玉の上に穴 → 管の下の端（黒い玉があとから来る）', [S([[276, 346], [240, 860]], 90), S([[470, 450], [480, 620], [250, 860]])], 'fail:black'],
  [9, '黒い玉の下の穴を先に（上の色の玉も空き部屋へ落ちる）', [S([[369, 398], [366, 500]], 90), S([[276, 346], [240, 860]], 60), S([[470, 450], [480, 620], [250, 860]])], 'stuck'],
];

// 指でなぞる。o.dx・o.dy だけずらし、指の速さを o.speed 倍にする
function play(sim, script, o) {
  const dx = o.dx || 0;
  const dy = o.dy || 0;
  const step = FINGER * (o.speed || 1);
  for (const s of script) {
    const pts = s.pts.map(([x, y]) => [x + dx, y + dy]);
    let prev = pts[0];
    sim.dig(prev[0], prev[1], prev[0], prev[1]);
    sim.step();
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 1; k <= n; k++) {
        const p = [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n];
        sim.dig(prev[0], prev[1], p[0], p[1]);
        prev = p;
        sim.step();
      }
    }
    for (let i = 0; i < s.wait; i++) sim.step();
  }
}

function run(levelIndex, script, o = {}) {
  const sim = SIM.createSim(LEVELS[levelIndex]);
  for (let i = 0; i < SETTLE; i++) sim.step();
  const t0 = sim.t;
  play(sim, script, o);
  for (let n = 0; sim.state === 'play' && n < AFTER; n++) sim.step();
  const result = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state === 'play' ? 'stuck' : sim.state;
  return { result, sim, secs: (sim.t - t0) / 60 };
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

// ---- 各レベルの掘り方 ----
const VARIANTS = [];
for (const dx of [-8, 0, 8]) for (const dy of [-6, 0, 6]) VARIANTS.push({ dx, dy });
for (const speed of [0.5, 0.7, 1.5, 2]) VARIANTS.push({ speed });
const naiveSeen = new Set();
for (const [lv, label, script, expect, naive] of CASES) {
  const { result, sim, secs } = run(lv, script);
  let extra = '';
  let ok = result === expect;
  if (ok && expect === 'clear') {
    const miss = [];
    for (const v of VARIANTS) {
      const r = run(lv, script, v).result;
      if (r !== 'clear') miss.push(JSON.stringify(v) + r);
    }
    extra = miss.length ? ' ずらす・速さを変えると失敗: ' + miss.join(' ') : ' ずらした9通り・速さを変えた4通りもクリア';
    ok = !miss.length;
  }
  if (naive) {
    naiveSeen.add(lv);
    if (result === 'clear') ok = false;
  }
  const line = ' ' + (lv + 1) + '面 ' + label + (naive ? '（素直なやり方）' : '') + '  期待 ' + expect + ' 結果 ' + result + ' ' + secs.toFixed(1) + '秒' +
    '（入った ' + sim.collected + '/' + sim.need + '・落とした ' + sim.lostColored + '）' + extra;
  if (ok) console.log('OK ' + line);
  else ng(line.slice(1));
}
for (let lv = 6; lv < LEVELS.length; lv++) {
  if (!naiveSeen.has(lv)) ng((lv + 1) + '面 素直なやり方（管の下の端を開ける）の掘り方が CASES に無い');
}
LEVELS.forEach((level, lv) => {
  if (!CASES.some((c) => c[0] === lv && c[3] === 'clear')) ng((lv + 1) + '面 クリアになる掘り方が CASES に無い');
});

// ---- レベルの形 ----
LEVELS.forEach((level, lv) => {
  const name = (lv + 1) + '面';
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng(name + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  const sim = SIM.createSim(level);
  level.balls.forEach((g, i) => {
    if (sim.placed[i] !== g.n) ng(name + ' 玉の組 ' + (i + 1) + ' は ' + g.n + ' 個のはずが ' + sim.placed[i] + ' 個しか置けない');
  });
  if (!(level.need >= 1 && level.need <= sim.totalColored)) ng(name + ' クリアに要る数 ' + level.need + ' が色の玉の数 ' + sim.totalColored + ' と合わない');
  const blacks = sim.balls.filter((b) => b.black).length;
  if (lv < 5 && blacks) ng(name + ' 黒い玉は6面から（' + blacks + ' 個ある）');
  if (lv >= 5 && !blacks) ng(name + ' 6面から先は黒い玉を置く');
  const t = level.truck;
  const c = SIM.TRUCK_PARTS.cave;
  if (t.x + c[0] < 0 || t.x + c[2] > KG.W || t.y + 84 > KG.H) ng(name + ' トラック（車輪まで）が画面に収まらない: ' + JSON.stringify(t));
});

// ---- 決まりごと ----
function box(o) {
  return Object.assign({ seed: 1, need: 3, caves: [], balls: [], truck: { x: 240, y: 868 } }, o);
}
function stepN(sim, n) {
  for (let i = 0; i < n; i++) sim.step();
}
const settle = (sim) => stepN(sim, SETTLE);
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['砂は掘ると消え、岩とトラックは消えない', () => {
    const sim = SIM.createSim(box({ rocks: [{ rect: [100, 500, 200, 540] }] }));
    sim.dig(60, 520, 480, 520);
    // トラックを横切ってなぞる（左の壁・荷台の床・右の壁・運転席が帯の中に入る）
    sim.dig(150, 900, 400, 900);
    const sand = sim.cellAt(70, 520);
    const rock = sim.cellAt(150, 520);
    const truck = [[240 - 61, 900], [240, 919], [240 + 61, 900], [240 + 100, 900]].map(([x, y]) => sim.cellAt(x, y));
    return [sand === SIM.EMPTY && rock === SIM.ROCK && truck.every((c) => c === SIM.TRUCK), '砂 ' + sand + ' 岩 ' + rock + ' 左の壁・床・右の壁・運転席 ' + truck.join(',') + '（空き ' + SIM.EMPTY + '・岩 ' + SIM.ROCK + '・トラック ' + SIM.TRUCK + '）'];
  }],
  ['指でなぞった帯（半径 DIG_R）の中の砂だけが消える', () => {
    const sim = SIM.createSim(box({}));
    sim.dig(270, 500, 270, 500);
    const inside = sim.cellAt(270 + SIM.DIG_R - 4, 500);
    const outside = sim.cellAt(270 + SIM.DIG_R + 6, 500);
    return [inside === SIM.EMPTY && outside === SIM.SAND, '中心から ' + (SIM.DIG_R - 4) + ' は ' + inside + '、' + (SIM.DIG_R + 6) + ' は ' + outside];
  }],
  ['掘らなければ、どの面の玉も落ちてこない（5秒待っても入った・落とした玉は0。置いた玉は3秒で落ち着き、そのあと2秒でどの玉も1より動かない）', () => {
    const seen = [];
    let ok = true;
    LEVELS.forEach((level, lv) => {
      const sim = SIM.createSim(level);
      stepN(sim, 180);
      const before = sim.balls.map((b) => [b.x, b.y]);
      stepN(sim, 120);
      let moved = 0;
      sim.balls.forEach((b, i) => {
        moved = Math.max(moved, Math.hypot(b.x - before[i][0], b.y - before[i][1]));
      });
      const good = sim.state === 'play' && sim.collected === 0 && sim.lostColored === 0 && sim.balls.every((b) => b.alive) && moved < 1;
      if (!good) ok = false;
      seen.push((lv + 1) + '面 ' + (good ? '' : '★') + moved.toFixed(2));
    });
    return [ok, '3秒後から2秒間でいちばん動いた玉の動き ' + seen.join(' ')];
  }],
  ['掘る量に上限は無い（画面の砂を全部掘っても、まだ掘れる面のまま）', () => {
    const sim = SIM.createSim(box({}));
    let last = false;
    for (let y = 210; y <= 960; y += 30) last = sim.dig(10, y, 530, y) || last;
    let left = 0;
    for (let i = 0; i < sim.grid.length; i++) if (sim.grid[i] === SIM.SAND) left++;
    return [last && left === 0 && sim.state === 'play' && !sim.locked, '残った砂のます ' + left + '、状態 ' + sim.state + '、消した砂のます ' + sim.dug];
  }],
  ['荷台に入った玉を数え、決めた数でクリアになる（クリアのあとに入った玉も数える）', () => {
    const sim = SIM.createSim(box({ need: 4, caves: [{ circle: [240, 300, 50] }], balls: [{ rect: [190, 250, 290, 350], n: 8 }] }));
    settle(sim);
    play(sim, [S([[240, 340], [240, 860]])], {});
    let clearAt = -1;
    let atClear = -1;
    for (let i = 0; i < 300; i++) {
      sim.step();
      if (sim.state === 'clear' && clearAt < 0) {
        clearAt = sim.t;
        atClear = sim.collected;
      }
    }
    return [atClear === 4 && sim.collected === 8, 'クリアした刻みの数 ' + atClear + '（決めた数 4）、5秒後 ' + sim.collected + '（全部で 8）'];
  }],
  ['荷台のふちより下に落ちた玉は（画面の下まで落ちなくても）、もう入らないものとして数え、足りなくなったら失敗', () => {
    const sim = SIM.createSim(box({ need: 4, caves: [{ circle: [120, 300, 50] }], balls: [{ rect: [70, 250, 170, 350], n: 6 }] }));
    settle(sim);
    // トラックの横に、ふちより下で行き止まりになる穴を掘る（画面の下までは抜けない）
    play(sim, [S([[120, 340], [120, 930]])], {});
    for (let i = 0; i < 300 && sim.state === 'play'; i++) sim.step();
    const onScreen = sim.balls.filter((b) => b.alive).length;
    return [sim.state === 'fail' && sim.reason === 'short' && sim.collected === 0 && onScreen === 6, '状態 ' + sim.state + ':' + sim.reason + '、入った ' + sim.collected + '、落とした ' + sim.lostColored + '、画面に残った玉 ' + onScreen];
  }],
  ['黒い玉が1つでも荷台に入ったら失敗', () => {
    const sim = SIM.createSim(box({ need: 2, caves: [{ circle: [240, 300, 50] }, { circle: [400, 300, 40] }], balls: [{ rect: [190, 250, 290, 350], n: 1, black: true }, { rect: [360, 260, 440, 340], n: 5 }] }));
    settle(sim);
    play(sim, [S([[240, 340], [240, 860]])], {});
    for (let i = 0; i < 300 && sim.state === 'play'; i++) sim.step();
    return [sim.state === 'fail' && sim.reason === 'black', '状態 ' + sim.state + ':' + sim.reason];
  }],
  ['荷台に入った玉は、黒い玉も失敗のあとに入った玉も積む玉に残す（数えるのは失敗の前に入った色の玉だけ）', () => {
    const r = run(5, [S([[110, 330], [360, 860]])]);
    const atFail = r.sim.collected;
    stepN(r.sim, 120);
    const bed = r.sim.bed;
    const black = bed.filter((b) => b.black).length;
    const entered = r.sim.balls.filter((b) => b.in).length;
    const good = r.result === 'fail:black' && bed.length === entered && black > 0 && bed.length - black > atFail && r.sim.collected === atFail;
    return [good, '6面の失敗から2秒で荷台に積んだ玉 ' + bed.length + '（黒 ' + black + '・入った玉 ' + entered + '）、数えた色の玉 ' + r.sim.collected + '（失敗のとき ' + atFail + '）'];
  }],
  ['クリアのあとに荷台へ入った黒い玉は、失敗にも失敗の合図にもならない（積む玉には残す）', () => {
    const sim = SIM.createSim(box({ need: 2, caves: [{ circle: [240, 300, 50] }, { circle: [420, 300, 40] }], balls: [{ rect: [190, 250, 290, 350], n: 4 }, { rect: [380, 260, 460, 340], n: 1, black: true }] }));
    settle(sim);
    play(sim, [S([[240, 340], [240, 860]])], {});
    for (let i = 0; i < 300 && sim.state === 'play'; i++) sim.step();
    const before = sim.state;
    // 止まっている黒い玉を、荷台の中へ運んで入れる（ほかの玉に押されて、あとから転がりこんだ形）
    const k = sim.balls.find((b) => b.black);
    k.x = k.px = sim.truck.x;
    k.y = k.py = sim.truck.y + 20;
    sim.events.length = 0;
    sim.step();
    const signal = sim.events.some((e) => e.type === 'in' && e.black);
    return [before === 'clear' && sim.state === 'clear' && k.in && sim.bed.includes(k) && !signal, '入れる前 ' + before + '、入れたあと ' + sim.state + '、荷台に積んだ ' + sim.bed.includes(k) + '、失敗の合図 ' + signal];
  }],
  ['止まっている黒い玉が残っていても、決めた数を入れたらクリア', () => {
    const sim = SIM.createSim(box({ need: 3, caves: [{ circle: [240, 300, 50] }, { circle: [420, 600, 40] }], balls: [{ rect: [190, 250, 290, 350], n: 5 }, { rect: [380, 560, 460, 640], n: 4, black: true }] }));
    settle(sim);
    play(sim, [S([[240, 340], [240, 860]])], {});
    for (let i = 0; i < 300 && sim.state === 'play'; i++) sim.step();
    const left = sim.balls.filter((b) => b.black && b.alive).length;
    return [sim.state === 'clear' && left === 4, '状態 ' + sim.state + '、残った黒い玉 ' + left];
  }],
  ['動いている黒い玉があるうちはクリアにせず、荷台に入ったら失敗（決めた数を入れたあとでも）', () => {
    const r = run(7, [S([[400, 420], [330, 860]])]);
    return [r.result === 'fail:black' && r.sim.collected >= r.sim.need && r.sim.goalAt >= 0, '8面で管の下の端を開けると ' + r.result + '（入った ' + r.sim.collected + '/' + r.sim.need + '）'];
  }],
  ['終わったあとは掘れない（クリアのあとも、失敗のあとも）', () => {
    const a = run(0, [S([[240, 330], [240, 860]])]).sim;
    const b = run(5, [S([[110, 330], [360, 860]])]).sim;
    const da = a.dig(400, 400, 450, 450);
    const db = b.dig(400, 400, 450, 450);
    return [a.state === 'clear' && b.state === 'fail' && !da && !db, 'クリアのあと ' + da + '、失敗のあと ' + db];
  }],
  ['ゆるい坂の管でも、玉は途中で止まらず下の端まで転がる（10・15・20・30度）', () => {
    const seen = [];
    let ok = true;
    for (const deg of [10, 15, 20, 30]) {
      const a = (deg * Math.PI) / 180;
      const x0 = 60;
      const y0 = 260;
      const x1 = 480;
      const y1 = y0 + Math.tan(a) * (x1 - x0);
      const sim = SIM.createSim(box({ caves: [{ path: [[x0, y0], [x1, y1]], r: 13 }], balls: [{ rect: [x0 - 10, y0 - 20, x0 + 20, y0 + 20], n: 1 }] }));
      stepN(sim, 300);
      const b = sim.balls[0];
      const dist = Math.hypot(b.x - x1, b.y - y1);
      if (dist > 12) ok = false;
      seen.push(deg + '度 ' + (dist > 12 ? '★' : '') + '下の端から ' + dist.toFixed(1));
    }
    return [ok, '5秒後 ' + seen.join(' / ')];
  }],
  ['1面をまっすぐ下へ掘ると、なぞり終えてから2秒以内にクリア（玉がすぐ転がる）', () => {
    const r = run(0, [S([[240, 330], [240, 860]])]);
    const secsAfter = r.secs - (860 - 330) / FINGER / 60;
    return [r.result === 'clear' && secsAfter < 2, '結果 ' + r.result + '、なぞり終えてから ' + secsAfter.toFixed(2) + '秒'];
  }],
  ['同じ掘り方なら毎回同じ結果になる（10面を2回）', () => {
    const c = CASES.find((k) => k[0] === 9 && k[3] === 'clear');
    const a = run(9, c[2]).sim;
    const b = run(9, c[2]).sim;
    const same = a.state === b.state && a.t === b.t && a.collected === b.collected && a.balls.every((e, i) => e.x === b.balls[i].x && e.y === b.balls[i].y);
    return [same, same ? '玉の位置も刻みも同じ' : '違う'];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + CASES.length + ' 件と決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
