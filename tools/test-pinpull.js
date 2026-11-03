// ピン抜きの各ステージを、決めた順番でピンを抜いたときに「クリア／どの理由で失敗」になるかを確かめる。
// 使い方: node tools/test-pinpull.js            （このフォルダの app/ を調べる）
//         node tools/test-pinpull.js <app のフォルダ>  （壊した写しを調べるとき）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'pinpull-levels.js'));
require(path.join(appDir, 'js', 'games', 'pinpull-sim.js'));
const KG = globalThis.KG;

const SETTLE_STEPS = 60; // 最初に粒を落ち着かせる時間（1秒）
const WAIT_MAX = 360; // ピンを抜いてから次を抜くまで、落ち着くのを最大で待つ刻み数（6秒）
const END_MAX = 1200; // 最後のピンのあと、結果が出るまで最大で待つ刻み数（20秒）

// [ステージ番号(0始まり), 抜く順番, 期待する結果]
const CASES = [
  [0, ['a'], 'clear'],
  [0, ['b'], 'fail:lava'],
  [0, ['b', 'a'], 'fail:lava'],
  [1, ['a', 'c', 'b'], 'clear'],
  [1, ['a', 'b', 'c'], 'clear'],
  [1, ['c'], 'fail:lava'],
  [1, ['b', 'c'], 'fail:lava'],
  [2, ['a'], 'clear'],
  [2, ['c', 'a'], 'fail:nogold'],
  [2, ['b'], 'fail:lava'],
  [2, ['c', 'a', 'b'], 'fail:nogold'],
  [3, ['b', 'a', 'c'], 'clear'],
  [3, ['c'], 'fail:monster'],
  [3, ['b', 'c'], 'fail:lava'],
  [3, ['a', 'b', 'c'], 'fail:monster'],
  [4, ['b', 'a', 'c'], 'clear'],
  [4, ['e'], 'fail:lava'],
  [4, ['c'], 'fail:monster'],
  [4, ['a', 'b', 'c'], 'fail:monster'],
  [4, ['b', 'c'], 'fail:lava'],
  [4, ['d', 'b', 'a', 'c'], 'fail:nogold'],
];

function run(levelIndex, order) {
  const sim = KG.pinpullSim.createSim(KG.pinpullLevels[levelIndex]);
  for (let i = 0; i < SETTLE_STEPS; i++) sim.step();
  const log = [];
  for (const id of order) {
    if (sim.state !== 'playing' || sim.locked) break;
    if (!sim.pull(id)) throw new Error('ピン ' + id + ' を抜けなかった');
    let waited = 0;
    while (waited < WAIT_MAX && sim.state === 'playing' && !sim.isCalm()) {
      sim.step();
      waited++;
    }
    log.push(id + ':' + waited + (sim.isCalm() ? '' : '(落ち着かず)'));
  }
  let tail = 0;
  while (tail < END_MAX && sim.state === 'playing') {
    sim.step();
    tail++;
  }
  const result = sim.state === 'fail' ? 'fail:' + sim.reason : sim.state;
  return { result, sim, log, tail };
}

let bad = 0;
for (const [lv, order, expect] of CASES) {
  const { result, sim, log, tail } = run(lv, order);
  const ok = result === expect;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') +
      ' ステージ' + (lv + 1) +
      ' 順番 ' + order.join('→').padEnd(8) +
      ' 期待 ' + expect.padEnd(12) +
      ' 結果 ' + result.padEnd(12) +
      ' 宝 ' + sim.collected + '/' + sim.target + '（全' + sim.totalGold + '・届かない' + sim.lost + '）' +
      ' 待ち ' + log.join(' ') + ' 最後' + tail
  );
}
console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり（' + CASES.length + ' 件）');
process.exit(bad ? 1 : 0);
