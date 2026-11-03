// 線を引いて守るの各レベルに決めた線を描き、「クリア／どの理由で失敗」になるかを確かめる。
// クリアになるはずの線は、上下左右に少しずらした9通りすべてでクリアになることも確かめる（指で描く線はぶれるため）。
// あわせて、線とハチの決まりごと（線は落ちる・置いた線は止まる・インクが尽きたら固まる など）を小さな場面で確かめる。
// 使い方: node tools/test-guard.js            （このフォルダの app/ を調べる）
//         node tools/test-guard.js <app のフォルダ>  （壊した写しを調べるとき）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'guard-levels.js'));
require(path.join(appDir, 'js', 'games', 'guard-sim.js'));
const KG = globalThis.KG;
const SIM = KG.guardSim;
const LEVELS = KG.guardLevels;
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（guard-levels.js の冒頭の注記）

// ---- 線の形（指でなぞる点の並び） ----
function arc(cx, cy, r, a0, a1) {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 3));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
// 上に凸の半円。足は (cx ± r, footY)
const dome = (cx, footY, r) => arc(cx, footY, r, Math.PI, Math.PI * 2);
// 上に凸の半楕円（横の半径 rx、高さ ry）
function edome(cx, footY, rx, ry) {
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const a = Math.PI + (Math.PI * i) / 160;
    pts.push([cx + Math.cos(a) * rx, footY + Math.sin(a) * ry]);
  }
  return pts;
}
// 折れ線
function poly(list) {
  const out = [list[0]];
  for (let i = 1; i < list.length; i++) {
    const [x0, y0] = list[i - 1];
    const [x1, y1] = list[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// [レベル番号(0始まり), 線の名前, 点の並び, 期待する結果]
// 期待が clear のものは、9通りにずらしてもクリアになることまで確かめる。
// 6面から先の失敗の例は「素直な考え方では勝てない」ことの確認（片方の犬だけ守る・壁をまたぐ大きなドームはインクが足りない など）。
const CASES = [
  [0, 'ふた', poly([[180, 688], [360, 688]]), 'clear'],
  [0, '高い所から落とすふた', poly([[180, 600], [360, 600]]), 'clear'],
  [0, '何も守らない', poly([[450, 500], [480, 500]]), 'fail:sting'],
  [1, 'ドーム', dome(270, 850, 100), 'clear'],
  [1, '小さいドーム', dome(270, 850, 70), 'clear'],
  [1, '縦の壁だけ', poly([[190, 700], [195, 850]]), 'fail:sting'],
  [2, '壁に立てかける', poly([[160, 700], [262, 852]]), 'clear'],
  [2, '壁から地面への弧', arc(152, 852, 85, -Math.PI / 2, 0), 'clear'],
  [2, '何も守らない', poly([[450, 500], [480, 500]]), 'fail:sting'],
  [3, '足場に乗るドーム', dome(270, 590, 80), 'clear'],
  [3, '足場をおおう大きなドーム', dome(270, 590, 130), 'clear'],
  [3, '小さすぎて犬の頭に乗るドーム', dome(270, 596, 60), 'fail:sting'],
  [3, '上にふただけ', poly([[180, 520], [360, 520]]), 'fail:sting'],
  [4, '張り出しに立てかける', poly([[240, 735], [300, 852]]), 'clear'],
  [4, '張り出しに長めに立てかける', poly([[240, 730], [330, 852]]), 'clear'],
  [4, '入口に立てた棒', poly([[242, 768], [242, 852]]), 'fail:sting'],
  [4, '中の低いドーム（インクが足りない）', [[60, 852], [70, 800], [100, 790], [130, 788], [160, 790], [190, 800], [200, 852]], 'fail:sting'],
  [5, '長いふた', poly([[60, 680], [480, 680]]), 'clear'],
  [5, '2つの穴をまたぐアーチ', dome(270, 850, 200), 'clear'],
  [5, '左の穴だけふた', poly([[75, 688], [205, 688]]), 'fail:sting'],
  [6, '大きなドーム', dome(270, 850, 170), 'clear'],
  [6, '平たいドーム', edome(270, 850, 170, 110), 'clear'],
  [6, '1ぴきだけドーム', dome(185, 850, 70), 'fail:sting'],
  [7, '段から地面への屋根', poly([[60, 690], [100, 600], [210, 600], [480, 850]]), 'clear'],
  [7, '下の犬だけドーム', dome(390, 850, 70), 'fail:sting'],
  [7, '上の犬だけドーム', dome(150, 690, 60), 'fail:sting'],
  [8, '壁の上に乗せる山形', poly([[95, 852], [238, 600], [302, 600], [445, 852]]), 'clear'],
  [8, '壁をまたぐ大きなドーム（インクが足りない）', dome(270, 850, 210), 'fail:sting'],
  [8, '片側だけ', poly([[95, 852], [100, 760], [160, 720], [240, 700]]), 'fail:sting'],
  [8, '壁の上に横棒', poly([[100, 640], [440, 640]]), 'fail:sting'],
  [9, '足場の上の半円', dome(270, 750, 118), 'clear'],
  [9, '足場をはみ出すコの字', poly([[95, 820], [95, 660], [445, 660], [445, 820]]), 'fail:sting'],
  [9, '1ぴきだけドーム', dome(210, 750, 60), 'fail:sting'],
];

function run(levelIndex, pts) {
  const sim = SIM.createSim(LEVELS[levelIndex]);
  if (!sim.drawPath(pts)) return { result: 'notdrawn', sim };
  while (sim.state === 'defend') sim.step();
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, sim };
}

let bad = 0;
const ng = (msg) => {
  bad++;
  console.log('★NG ' + msg);
};

for (const [lv, label, pts, expect] of CASES) {
  const { result, sim } = run(lv, pts);
  let extra = '';
  let ok = result === expect;
  if (ok && expect === 'clear') {
    const miss = [];
    for (const dx of [-8, 0, 8]) {
      for (const dy of [-6, 0, 6]) {
        const r = run(lv, shift(pts, dx, dy)).result;
        if (r !== 'clear') miss.push('(' + dx + ',' + dy + ')' + r);
      }
    }
    extra = miss.length ? ' ずらすと失敗: ' + miss.join(' ') : ' ずらした9通りもクリア';
    ok = !miss.length;
  }
  const when = sim.state === 'fail' ? ' ' + (sim.defendT / 60).toFixed(1) + '秒で' : '';
  const line = ' ' + (lv + 1) + '面 ' + label + '  期待 ' + expect + ' 結果 ' + result + when + '（インク ' + sim.inkUsed + '/' + sim.ink + '）' + extra;
  if (ok) console.log('OK ' + line);
  else ng(line.slice(1));
}

LEVELS.forEach((level, lv) => {
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng((lv + 1) + '面 ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
});

// ---- 決まりごと ----
function box(o) {
  return Object.assign({ seed: 1, ink: 1000, time: 8, blocks: [[0, 860, 540, 960]], dogs: [{ x: 270, y: 832 }], hives: [] }, o);
}
function stepN(sim, n) {
  for (let i = 0; i < n; i++) sim.step();
}
const lowest = (sim) => Math.max(...sim.line.map((p) => p.y));
const snapshot = (sim) => sim.line.map((p) => [p.x, p.y]);
function maxMoved(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
  return m;
}
// [説明, 確かめる関数（[合っているか, 見た値] を返す）]
const RULES = [
  ['線は指を離すと落ち、地面に乗って止まる', () => {
    const sim = SIM.createSim(box({}));
    sim.drawPath(poly([[100, 400], [200, 400]]));
    stepN(sim, 90);
    const y = lowest(sim);
    const a = snapshot(sim);
    stepN(sim, 60);
    const moved = maxMoved(a, snapshot(sim));
    return [Math.abs(y - (860 - SIM.LINE_R)) < 1.5 && moved < 0.5, '1.5秒後のいちばん下 ' + y.toFixed(1) + '（地面 860 − 太さ ' + SIM.LINE_R + '）、その後1秒の動き ' + moved.toFixed(2)];
  }],
  ['壁に立てかけた線は、すべり落ちずに止まる（3面・ハチなし）', () => {
    const sim = SIM.createSim(Object.assign({}, LEVELS[2], { hives: [] }));
    sim.drawPath(poly([[160, 700], [262, 852]]));
    stepN(sim, 30);
    const a = snapshot(sim);
    stepN(sim, 300);
    const moved = maxMoved(a, snapshot(sim));
    return [moved < 1, '5秒間の動き ' + moved.toFixed(2)];
  }],
  ['線は地面・犬・巣の上には引けない', () => {
    const sim = SIM.createSim(box({ hives: [{ x: 270, y: 300, n: 0 }] }));
    const r = [sim.canDraw(270, 880), sim.canDraw(270, 832), sim.canDraw(270, 300), sim.canDraw(270, 600)];
    return [!r[0] && !r[1] && !r[2] && r[3], '地面 ' + r[0] + ' 犬 ' + r[1] + ' 巣 ' + r[2] + ' 何も無い所 ' + r[3]];
  }],
  ['犬を横切ろうとした線は、犬の手前で止まる', () => {
    const sim = SIM.createSim(box({}));
    sim.beginStroke(150, 832);
    sim.extendStroke(390, 832);
    const s = sim.stroke;
    const endX = s[s.length - 1].x;
    const limit = 270 - SIM.DOG_R - SIM.LINE_R;
    return [endX <= limit && endX > limit - 10, '線の先 ' + endX.toFixed(1) + '（犬の左の端 ' + limit + ' の手前で止まるはず）'];
  }],
  ['インクが尽きたら、指を離していなくても線が固まる', () => {
    const sim = SIM.createSim(box({ ink: 100 }));
    sim.beginStroke(50, 400);
    sim.extendStroke(450, 400);
    return [sim.state === 'defend' && sim.inkUsed <= 100 && sim.inkUsed > 90, '状態 ' + sim.state + ' 使ったインク ' + sim.inkUsed + '/100'];
  }],
  ['短すぎる線（タップ）は無かったことになり、インクも戻る', () => {
    const sim = SIM.createSim(box({}));
    sim.beginStroke(100, 400);
    sim.extendStroke(110, 400);
    sim.endStroke();
    return [sim.state === 'draw' && sim.inkUsed === 0 && !sim.line, '状態 ' + sim.state + ' 使ったインク ' + sim.inkUsed];
  }],
  ['線を描くまでは、ハチは出てこない', () => {
    const sim = SIM.createSim(LEVELS[1]);
    stepN(sim, 300);
    return [sim.bees.length === 0 && sim.state === 'draw', '5秒後のハチ ' + sim.bees.length + ' 状態 ' + sim.state];
  }],
  ['守る秒数が過ぎた刻みでクリアになる（1面のふた）', () => {
    const sim = SIM.createSim(LEVELS[0]);
    sim.drawPath(poly([[180, 688], [360, 688]]));
    while (sim.state === 'defend') sim.step();
    return [sim.state === 'clear' && sim.defendT === LEVELS[0].time * 60, '状態 ' + sim.state + ' 守った刻み ' + sim.defendT + '（' + LEVELS[0].time + '秒 = ' + LEVELS[0].time * 60 + '）'];
  }],
  ['クリアしたら、ハチは上へ帰っていく', () => {
    const sim = SIM.createSim(LEVELS[0]);
    sim.drawPath(poly([[180, 688], [360, 688]]));
    while (sim.state === 'defend') sim.step();
    const n0 = sim.bees.length;
    stepN(sim, 360);
    return [n0 > 0 && sim.bees.length === 0, 'クリアのときのハチ ' + n0 + ' → 6秒後 ' + sim.bees.length];
  }],
  ['犬が画面の下へ落ちたら失敗', () => {
    const sim = SIM.createSim(box({ blocks: [[0, 860, 200, 960]], dogs: [{ x: 300, y: 500 }] }));
    sim.drawPath(poly([[40, 600], [120, 600]]));
    stepN(sim, 120);
    return [sim.state === 'fail' && sim.reason === 'fall', '状態 ' + sim.state + ' ' + sim.reason];
  }],
  ['ハチは犬に向かい、守りが無ければ刺す（2面に短い線だけ）', () => {
    const { result, sim } = run(1, poly([[450, 500], [480, 500]]));
    return [result === 'fail:sting' && sim.defendT < 240, '結果 ' + result + ' ' + (sim.defendT / 60).toFixed(1) + '秒'];
  }],
  ['同じ線なら毎回同じ結果になる（9面の山形を2回）', () => {
    const pts = poly([[95, 852], [238, 600], [302, 600], [445, 852]]);
    const a = run(8, pts).sim;
    const b = run(8, pts).sim;
    const same = a.state === b.state && a.defendT === b.defendT && maxMoved(snapshot(a), snapshot(b)) === 0 && a.bees.every((e, i) => e.x === b.bees[i].x && e.y === b.bees[i].y);
    return [same, same ? '線もハチも同じ位置' : '違う'];
  }],
];
for (const [label, check] of RULES) {
  const [ok, seen] = check();
  if (ok) console.log('OK  決まり ' + label + ' → ' + seen);
  else ng('決まり ' + label + ' → ' + seen);
}

console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + CASES.length + ' 件と決まり ' + RULES.length + ' 件）');
process.exit(bad ? 1 : 0);
