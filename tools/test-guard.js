// 線を引いて守るの各レベルに決めた線を描き、「クリア／どの理由で失敗」になるかを確かめる。
// クリアになるはずの線は、上下左右に少しずらした9通りすべてでクリアになることも確かめる（指で描く線はぶれるため）。
// あわせて、線とハチの決まりごと（線は落ちる・置いた線は止まる・線の長さに上限が無い・ハチは地面や床の下を回りこみ、すき間を通り、
// とじこめられると線を押す・守りが無ければすぐ刺される など）を小さな場面で確かめる。
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
// 点を通るなめらかな曲線（Catmull-Rom）
function smooth(list) {
  const out = [list[0]];
  for (let i = 0; i < list.length - 1; i++) {
    const p0 = list[Math.max(0, i - 1)];
    const p1 = list[i];
    const p2 = list[i + 1];
    const p3 = list[Math.min(list.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
// 左右の床に足を下ろす2つのドームを、床のすき間 (gx1..gx2) に差しこんだくぼみでつなぐ形（8面）
function omega(l, r, gx1, gx2, top, dip) {
  const m = (gx1 + gx2) / 2;
  return smooth([[l, 752], [l + 15, 700], [(l + gx1) / 2, top], [gx1 - 25, 700], [gx1 - 8, 738], [gx1 + 18, 742], [gx1 + 20, 775], [m, dip],
    [gx2 - 20, 775], [gx2 - 18, 742], [gx2 + 8, 738], [gx2 + 25, 700], [(gx2 + r) / 2, top], [r - 15, 700], [r, 752]]);
}
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// [レベル番号(0始まり), 線の名前, 点の並び, 期待する結果]
// 期待が clear のものは、9通りにずらしてもクリアになることまで確かめる。
// 6面から先の失敗の例は「素直な考え方では勝てない」ことの確認（2ひきを大きなドームでまとめてかこむと、巣もいっしょにかこむか、
// 床のすき間から入られる など）。どの面も線の長さに上限は無いので、大きなドームは「描けない」のではなく「守れない」ことを確かめる。
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
  [4, '張り出しに長めに立てかける', poly([[240, 730], [330, 852]]), 'clear'],
  [4, 'ほら穴の中の低いドーム', smooth([[60, 852], [70, 800], [130, 788], [190, 800], [200, 852]]), 'clear'],
  [4, '入口に立てた棒', poly([[242, 768], [242, 852]]), 'fail:sting'],
  [4, '張り出しの上にふただけ', poly([[240, 700], [400, 700]]), 'fail:sting'],
  [5, '長いふた', poly([[60, 680], [480, 680]]), 'clear'],
  [5, '2つの穴をまたぐアーチ', dome(270, 850, 200), 'clear'],
  [5, '左の穴だけふた', poly([[75, 688], [205, 688]]), 'fail:sting'],
  [6, '巣の下を通る低いドーム', edome(270, 852, 235, 95), 'clear'],
  [6, '巣の下を通るM字', smooth([[40, 852], [50, 790], [110, 770], [180, 790], [270, 805], [360, 790], [430, 770], [490, 790], [500, 852]]), 'clear'],
  [6, '巣ごとかこむ大きなドーム', dome(270, 852, 240), 'fail:sting'],
  [6, '1ぴきだけドーム', dome(110, 852, 70), 'fail:sting'],
  [7, 'すき間にくぼみを差しこむ', omega(70, 470, 234, 306, 670, 800), 'clear'],
  [7, 'すき間の上を床の高さで渡る', smooth([[70, 752], [85, 700], [152, 670], [215, 700], [226, 745], [270, 748], [314, 745], [325, 700], [393, 670], [455, 700], [470, 752]]), 'clear'],
  [7, 'すき間ごとかこむドーム', edome(270, 752, 205, 140), 'fail:sting'],
  [7, '床からはみ出す大きなドーム', edome(270, 752, 230, 150), 'fail:sting'],
  [8, '壁の上に乗せるM字', poly([[60, 852], [70, 770], [120, 745], [200, 745], [225, 760], [226, 672], [314, 672], [315, 760], [340, 745], [420, 745], [470, 770], [480, 852]]), 'clear'],
  [8, '壁の上に乗せるなめらかなM字', smooth([[70, 852], [80, 775], [130, 750], [200, 752], [222, 740], [232, 680], [270, 672], [308, 680], [318, 740], [340, 752], [410, 750], [460, 775], [470, 852]]), 'clear'],
  [8, '壁をまたぐ大きなドーム', dome(270, 852, 255), 'fail:sting'],
  [8, '巣にぶつかる高い山形', poly([[95, 852], [238, 600], [302, 600], [445, 852]]), 'fail:sting'],
  [8, '1ぴきだけドーム', smooth([[90, 852], [100, 780], [160, 760], [220, 780], [235, 852]]), 'fail:sting'],
  [9, 'すき間を床の高さで渡り、巣の下を通る', smooth([[50, 746], [58, 705], [105, 670], [152, 705], [160, 744], [195, 746], [270, 746], [345, 746], [380, 744], [388, 705], [435, 670], [482, 705], [490, 746]]), 'clear'],
  [9, '同じ形で山を高めに', smooth([[52, 746], [60, 700], [105, 666], [150, 700], [158, 742], [180, 746], [270, 746], [360, 746], [382, 742], [390, 700], [435, 666], [480, 700], [488, 746]]), 'clear'],
  [9, 'すき間の上を浮いて渡るM字', smooth([[50, 752], [58, 705], [105, 672], [152, 705], [200, 722], [240, 752], [270, 752], [300, 752], [340, 722], [388, 705], [435, 672], [482, 705], [490, 752]]), 'fail:sting'],
  [9, '巣ごとかこむ大きなドーム', dome(270, 752, 225), 'fail:sting'],
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
  const line = ' ' + (lv + 1) + '面 ' + label + '  期待 ' + expect + ' 結果 ' + result + when + '（線の長さ ' + sim.drawn + '）' + extra;
  if (ok) console.log('OK ' + line);
  else ng(line.slice(1));
}

LEVELS.forEach((level, lv) => {
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) ng((lv + 1) + '面 ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
});

// ---- 決まりごと ----
function box(o) {
  return Object.assign({ seed: 1, time: 8, blocks: [[0, 860, 540, 960]], dogs: [{ x: 270, y: 832 }], hives: [] }, o);
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
// 線の粒の重心
function center(sim) {
  let x = 0;
  let y = 0;
  for (const p of sim.line) {
    x += p.x;
    y += p.y;
  }
  return [x / sim.line.length, y / sim.line.length];
}
// 何も守らない短い線を、その面の右上の引ける所に描く
function uselessLine(sim) {
  for (let y = 300; y < 700; y += 20) {
    for (let x = 440; x < 500; x += 10) {
      if (sim.canDraw(x, y) && sim.canDraw(x + 30, y)) return poly([[x, y], [x + 30, y]]);
    }
  }
  return null;
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
  ['線の長さに上限は無い（画面の幅を8往復しても、指を離すまで描き続けられる）', () => {
    const sim = SIM.createSim(box({}));
    sim.beginStroke(20, 200);
    for (let k = 0; k < 8; k++) {
      sim.extendStroke(520, 210 + k * 40);
      sim.extendStroke(20, 230 + k * 40);
    }
    const drawn = sim.drawn;
    const before = sim.state;
    sim.endStroke();
    return [before === 'draw' && drawn > 7000 && sim.state === 'defend', '描いた長さ ' + drawn + '、指を離す前の状態 ' + before + '、離したあと ' + sim.state];
  }],
  ['短すぎる線（タップ）は無かったことになる', () => {
    const sim = SIM.createSim(box({}));
    sim.beginStroke(100, 400);
    sim.extendStroke(110, 400);
    sim.endStroke();
    return [sim.state === 'draw' && sim.drawn === 0 && !sim.line, '状態 ' + sim.state + ' 描いた長さ ' + sim.drawn];
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
  ['守りが無ければ、どの面でも2.5秒以内に刺される（線を描くと、すぐハチが来る）', () => {
    const seen = [];
    let ok = true;
    LEVELS.forEach((level, lv) => {
      const sim = SIM.createSim(level);
      const pts = uselessLine(sim);
      if (!pts || !sim.drawPath(pts)) {
        ok = false;
        seen.push((lv + 1) + '面 線を引ける所が無い');
        return;
      }
      while (sim.state === 'defend') sim.step();
      if (!(sim.state === 'fail' && sim.reason === 'sting' && sim.defendT < 150)) ok = false;
      seen.push((lv + 1) + '面 ' + (sim.state === 'fail' ? sim.reason + ' ' + (sim.defendT / 60).toFixed(2) + '秒' : sim.state));
    });
    return [ok, seen.join(' / ')];
  }],
  ['ハチは線を描いた直後から出てきて、1秒で30ぴき出そろう', () => {
    const sim = SIM.createSim(box({ dogs: [{ x: 270, y: 832 }], hives: [{ x: 100, y: 300, n: 30 }] }));
    sim.drawPath(dome(270, 852, 100));
    sim.step();
    const first = sim.bees.length;
    stepN(sim, 59);
    return [first >= 1 && sim.bees.length === 30, '1刻み目 ' + first + 'ひき、1秒後 ' + sim.bees.length + 'ひき'];
  }],
  // 何も描かない5面では、道案内が無くてもハチは張り出しの上をすべり落ちて犬に届く（道案内を外す壊し方で確かめた）。
  // 本人が報告した「張り出しの上で止まる」形は、入口を線でふさいだときに出る
  ['入口を線でふさいでも、ハチは張り出しの上で止まらず、入口まで回りこむ（5面・3秒後）', () => {
    const sim = SIM.createSim(LEVELS[4]);
    sim.drawPath(poly([[240, 730], [330, 852]]));
    stepN(sim, 180);
    const onTop = sim.bees.filter((b) => b.x < 230 && b.y < 720).length;
    const entrance = sim.bees.filter((b) => b.x >= 230 && b.y > 700).length;
    return [sim.state === 'defend' && onTop === 0 && entrance >= 15, '状態 ' + sim.state + '、ハチ ' + sim.bees.length + 'ひきのうち 張り出しの上 ' + onTop + '・入口のそば ' + entrance];
  }],
  ['ハチは床の下を回り、すき間を通って入ってくる（8面で、すき間ごとかこむドーム）', () => {
    const sim = SIM.createSim(LEVELS[7]);
    sim.drawPath(edome(270, 752, 205, 140));
    let through = 0;
    while (sim.state === 'defend') {
      sim.step();
      for (const b of sim.bees) if (b.x > 234 && b.x < 306 && b.y > 760 && b.y < 800) through++;
    }
    return [sim.state === 'fail' && sim.reason === 'sting' && through > 0, '結果 ' + sim.state + ':' + sim.reason + ' ' + (sim.defendT / 60).toFixed(2) + '秒、すき間の中にいたハチ（のべ刻み） ' + through];
  }],
  ['ハチの群れは線を押し動かす（巣ごとかこんだドームが1秒で犬の方へ50以上動く。ハチがいなければ動かない）', () => {
    const moved = [0, 20].map((n) => {
      const sim = SIM.createSim(box({ dogs: [{ x: 450, y: 832 }], hives: [{ x: 120, y: 790, n }] }));
      sim.drawPath(dome(120, 852, 110));
      stepN(sim, 20);
      const a = center(sim);
      stepN(sim, 60);
      return center(sim)[0] - a[0];
    });
    return [Math.abs(moved[0]) < 0.5 && moved[1] > 50, 'ハチ0ぴき ' + moved[0].toFixed(1) + '、20ぴき ' + moved[1].toFixed(1)];
  }],
  ['同じ線なら毎回同じ結果になる（9面のM字を2回）', () => {
    const pts = smooth([[70, 852], [80, 775], [130, 750], [200, 752], [222, 740], [232, 680], [270, 672], [308, 680], [318, 740], [340, 752], [410, 750], [460, 775], [470, 852]]);
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
