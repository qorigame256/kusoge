// 塔登りの各レベルを、決めた順番で部屋に入り、クリア／どの理由で失敗かを確かめる。
// あわせて入る順番を全部試し、勝てる割合を出す（難しさの目安。勝てる順番が0か全部なら NG）。最後に決まりごとを小さな塔で確かめる。
// 使い方: node tools/test-tower.js            （このフォルダの app/ を調べる）
//         node tools/test-tower.js <app のフォルダ>  （壊した写しを調べるとき）
//         node tools/test-tower.js --all      （レベルごとに、勝てる順番の例とてっぺんに着いたときの最大の強さを出す）
// 1つでも期待と違えば終了コード 1。
'use strict';
const path = require('path');

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const dirArg = args.find((a) => !a.startsWith('--'));
const appDir = path.resolve(dirArg || path.join(__dirname, '..', 'app'));
globalThis.KG = {};
require(path.join(appDir, 'js', 'core.js'));
require(path.join(appDir, 'js', 'games', 'tower-levels.js'));
require(path.join(appDir, 'js', 'games', 'tower-sim.js'));
const KG = globalThis.KG;
const { createSim } = KG.towerSim;

const MAX_STEPS = 60 * 10; // 1回入るごとに待つ上限

// 部屋の呼び方: '2-1' は 2階の左から1つ目
// [レベル番号(0始まり), 入る部屋の順番, 期待する結果（'refused' は入れずに断られる）]
const CASES = [
  [0, ['1-1', '2-1', '1-2', '3-1'], 'clear'],
  [0, ['1-1', '1-2'], 'fail:even'], // 3 を倒して 8。8 の敵とは同じ強さ
  [0, ['1-2'], 'fail:lose'],
  [0, ['1-1', '2-1', '3-1'], 'fail:lose'], // 下に残した敵を倒さずに登ると足りない
  [0, ['2-1'], 'refused'], // 最初は 1階にしか入れない
  [1, ['1-1', '1-2', '2-1', '2-2', '3-1', '4-1'], 'clear'],
  [1, ['1-1', '1-2', '2-1', '3-1'], 'fail:even'], // 10 の敵を残して 15 の敵へ
  [1, ['1-1', '2-1'], 'fail:lose'], // 薬を飲まずに 6 の敵へ
  [2, ['1-1', '2-1', '1-2', '2-2', '3-1', '4-1'], 'clear'],
  [2, ['1-1', '1-2', '2-1', '2-2', '3-1', '4-1'], 'fail:lose'], // ×2 を早く取ると、てっぺんで 1 足りない
  [2, ['1-1', '2-1', '2-2'], 'fail:even'],
  [3, ['1-1', '2-1', '3-2', '3-1', '1-2', '2-2', '4-1'], 'clear'], // 罠で登ってから、下に戻って強い敵を倒す
  [3, ['1-1', '2-1', '3-1'], 'fail:lose'], // 罠で弱くなったまま 8 の敵へ
  [3, ['1-1', '2-1', '3-2', '3-1', '2-2', '4-1'], 'fail:lose'], // 1階の 12 の敵を倒し忘れる
  [4, ['1-1', '1-2', '2-1', '1-3', '2-2', '3-2', '3-3', '4-2', '4-1', '5-1'], 'clear'],
  [4, ['1-1', '1-2', '2-1', '1-3', '2-2', '3-2', '3-3', '4-1', '4-2', '5-1'], 'fail:lose'], // 4階の ×2 を先に取る
  [4, ['1-1', '1-2', '1-3'], 'fail:even'],
  [5, ['1-1', '1-2', '1-3', '2-1', '3-2', '3-3', '2-2', '4-1'], 'clear'],
  [5, ['1-1', '2-2'], 'refused'], // 鍵を持たずに錠前の部屋へ
  [5, ['1-1', '1-2', '2-2', '1-3', '2-1', '3-2', '3-3', '4-1'], 'fail:lose'], // 鍵ですぐ ×2 を開けると、てっぺんで足りない
  [6, ['1-1', '1-2', '2-2', '3-1', '3-2', '4-1'], 'clear'],
  [6, ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'], 'fail:stuck'], // 鍵を +40 に使うと、てっぺんの扉を開けられない
  [6, ['1-1', '1-2', '2-2', '3-2', '3-1', '4-1'], 'fail:lose'],
  [7, ['1-1', '1-3', '2-1', '2-3', '3-1', '3-3', '1-2', '3-2', '4-1'], 'clear'],
  [7, ['1-2', '2-1', '2-3', '3-1', '3-3', '1-1', '1-3', '3-2', '4-1'], 'fail:lose'], // 錠前の無い ×2 を最初に取ると 3 足りない
  [7, ['1-1', '1-3', '2-2', '3-2'], 'refused'], // 鍵は1本。+15 に使うと ×3 は開かない
  [8, ['1-1', '1-2', '1-3', '2-2', '3-1', '3-2', '2-3', '4-1', '3-3', '5-1'], 'clear'], // 鍵を取っておき、罠を通って登る
  [8, ['1-1', '1-2', '1-3', '2-1', '2-3', '3-2', '4-1', '3-1', '5-1'], 'fail:lose'], // 鍵を目先の +20 に使う
  [8, ['1-1', '1-2', '2-2', '3-1'], 'fail:even'], // 薬を飲まずに罠を通ると 12。12 の敵と同じ
  [9, ['1-1', '1-2', '1-3', '2-3', '3-1', '3-2', '3-3', '4-2', '4-1', '5-1'], 'clear'],
  [9, ['1-1', '1-2', '1-3', '2-1', '2-3', '3-1', '3-2', '3-3', '4-2', '4-1', '2-2'], 'fail:stuck'], // 鍵2本を +25 と ×3 に使う
  [9, ['1-3', '1-1', '1-2', '2-3'], 'fail:lose'], // ×2 を先に取ると 21。22 の敵に届かない
];
const HINT_MAX = 20; // 上の帯のヒントの字数の上限（tower-levels.js の冒頭の注記）
const GREEDY_MUST_FAIL_FROM = 6; // 0始まりの番号。7面から先は、素直な進め方では勝てないこと

function roomOf(sim, name) {
  const [f, c] = name.split('-').map(Number);
  const r = sim.rooms.find((r) => r.floor === f && r.col === c - 1);
  if (!r) throw new Error('無い部屋: ' + name);
  return r;
}

// 時間を進めながら1部屋ずつ入る（画面と同じ進み方）。中身が例外を出したら、その文を結果にする
function run(level, names) {
  try {
    return runInner(level, names);
  } catch (e) {
    return { result: 'error: ' + e.message, power: NaN };
  }
}
function runInner(level, names) {
  const sim = createSim(level);
  for (const name of names) {
    if (sim.state !== 'play') break;
    if (!sim.tap(roomOf(sim, name).id)) return { result: 'refused', power: sim.power };
    for (let i = 0; i < MAX_STEPS && (sim.state === 'move' || sim.state === 'fight'); i++) sim.step();
  }
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, power: sim.power };
}

function nameOf(r) {
  return r.floor + '-' + (r.col + 1) + '(' + r.label + ')';
}

// 入る順番を全部試す。同じ状態（入った部屋・登った階・強さ）からの先は同じなので、数え終えた状態は覚えて使い回す
// 中身のある部屋は1回入れば空になるので、部屋の数より多く入れたら中身がおかしい（tooLong に数える）
function countAll(level) {
  const memo = new Map();
  const roomCount = level.floors.reduce((s, f) => s + f.length, 0);
  let best = -1;
  let bestSeq = null;
  let tooLong = 0;
  function replay(seq) {
    const sim = createSim(level, { instant: true });
    for (const id of seq) sim.tap(id);
    return sim;
  }
  function dfs(seq) {
    if (seq.length > roomCount) {
      tooLong++;
      return { wins: 0, total: 1 };
    }
    const sim = replay(seq);
    if (sim.state === 'clear' || sim.state === 'fail') {
      if (sim.state === 'clear' && sim.power > best) {
        best = sim.power;
        bestSeq = seq;
      }
      return { wins: sim.state === 'clear' ? 1 : 0, total: 1 };
    }
    const key = sim.rooms.map((r) => (r.done ? 1 : 0)).join('') + '/' + sim.maxFloor + '/' + sim.power + '/' + sim.keys;
    if (memo.has(key)) return memo.get(key);
    let wins = 0;
    let total = 0;
    for (const r of sim.rooms) {
      if (r.done || !sim.canEnter(r)) continue;
      const c = dfs(seq.concat(r.id));
      wins += c.wins;
      total += c.total;
    }
    const res = { wins, total };
    memo.set(key, res);
    return res;
  }
  const res = Object.assign({}, dfs([]));
  const sim = createSim(level, { instant: true });
  res.bestText = bestSeq ? bestSeq.map((id) => nameOf(sim.rooms[id])).join(' → ') + ' 強さ ' + best : 'なし';
  res.tooLong = tooLong;
  return res;
}

// 素直な進め方: 入れる部屋のうち、入ったあとの強さがいちばん大きい部屋へ入り続ける（同じなら下の階・左の部屋。鍵は強さが変わらない部屋として比べる）。
// 勝てる部屋も罠も無ければ、最初の入れる部屋に入って終わる
function gainOf(sim, r) {
  if (r.kind === 'enemy' || r.kind === 'boss') return sim.power > r.v ? sim.power + r.v : -Infinity;
  if (r.kind === 'item') return r.op === '+' ? sim.power + r.v : sim.power * r.v;
  if (r.kind === 'trap') return sim.power - r.v > 0 ? sim.power - r.v : -Infinity;
  return sim.power;
}
function greedy(level) {
  const sim = createSim(level, { instant: true });
  const seq = [];
  for (let i = 0; i < 100 && sim.state === 'play'; i++) {
    let best = null;
    let bestP = -Infinity;
    for (const r of sim.rooms) {
      if (r.done || !sim.canEnter(r)) continue;
      const p = gainOf(sim, r);
      if (best === null || p > bestP) {
        best = r;
        bestP = p;
      }
    }
    if (!best) break;
    seq.push(nameOf(best));
    sim.tap(best.id);
  }
  return { result: sim.state === 'fail' ? 'fail:' + sim.reason : sim.state, power: sim.power, seq };
}

let bad = 0;
for (const [lv, names, expect] of CASES) {
  const level = KG.towerLevels[lv];
  const r = run(level, names);
  const ok = r.result === expect;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 順番 ' + names.join(' ').padEnd(30) +' 期待 ' + expect.padEnd(10) + ' 結果 ' + r.result.padEnd(10) + ' 強さ ' + r.power
  );
}

for (let lv = 0; lv < KG.towerLevels.length; lv++) {
  let c;
  try {
    c = countAll(KG.towerLevels[lv]);
  } catch (e) {
    bad++;
    console.log('★NG レベル' + (lv + 1) + ' 全部の順番を試す途中で止まった: ' + e.message);
    continue;
  }
  const ok = c.wins > 0 && c.wins < c.total && c.tooLong === 0;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 全' + c.total + '通りのうち勝てるのは ' + c.wins + ' 通り（' + ((c.wins / c.total) * 100).toFixed(1) + '%）' +
      (c.tooLong ? ' 部屋の数より多く入れた順番が ' + c.tooLong + ' 通り' : '')
  );
  if (showAll) console.log('     最も強くクリアする順番: ' + c.bestText);
  const level = KG.towerLevels[lv];
  const hintLen = [...(level.hint || '')].length;
  if (!hintLen || hintLen > HINT_MAX) {
    bad++;
    console.log('★NG レベル' + (lv + 1) + ' ヒントの字数 ' + hintLen + '（1〜' + HINT_MAX + ' 字）: ' + level.hint);
  }
  let g;
  try {
    g = greedy(level);
  } catch (e) {
    g = { result: 'error: ' + e.message, power: NaN, seq: [] };
  }
  const must = lv >= GREEDY_MUST_FAIL_FROM;
  const gok = !g.result.startsWith('error') && (!must || g.result !== 'clear');
  if (!gok) bad++;
  console.log((gok ? 'OK ' : '★NG') + ' レベル' + (lv + 1) + ' 素直な進め方 → ' + g.result + ' 強さ ' + g.power + (must ? '（勝てないこと）' : '') + (showAll ? '  ' + g.seq.join(' ') : ''));
}

// 決まりごと。小さな塔で1つずつ確かめる
// [説明, 最初の強さ, 階, 入る部屋の順番, 期待する結果, 期待する強さ（null は見ない）]
const RULES = [
  ['薬は足す', 7, [['+4'], ['B10']], ['1-1', '2-1'], 'clear', 21],
  ['倍の薬はかける', 7, [['×3'], ['B10']], ['1-1', '2-1'], 'clear', 31],
  ['罠は引く', 7, [['−3'], ['B3']], ['1-1', '2-1'], 'clear', 7],
  ['半角の罠も同じ', 7, [['-3'], ['B3']], ['1-1', '2-1'], 'clear', 7],
  ['罠でちょうど0になったら失敗', 3, [['−3'], ['B1']], ['1-1'], 'fail:zero', 0],
  ['同じ強さの敵には負ける', 5, [['E5'], ['B1']], ['1-1'], 'fail:even', null],
  ['最初は 2階に入れない', 5, [['E1'], ['E1'], ['B1']], ['2-1'], 'refused', 5],
  ['1階に立っても 3階には入れない', 5, [['E1'], ['E1'], ['B1']], ['1-1', '3-1'], 'refused', 6],
  ['下の階へ戻って戦える', 5, [['E1', 'E8'], ['E3'], ['B15']], ['1-1', '2-1', '1-2', '3-1'], 'clear', 32],
  ['空いた部屋へ移っても強さは変わらない', 5, [['E1', 'E2'], ['B10']], ['1-1', '1-2', '1-1'], 'play', 8],
  ['いまいる部屋は選べない', 5, [['E1'], ['B3']], ['1-1', '1-1'], 'refused', 6],
  ['鍵で錠前の部屋に入れる', 5, [['K', 'L+4'], ['B8']], ['1-1', '1-2', '2-1'], 'clear', 17],
  ['鍵が無いと錠前の部屋に入れない', 5, [['L+4', 'E1'], ['B3']], ['1-1'], 'refused', 5],
  ['鍵は1回使うと無くなる', 5, [['K', 'L+4', 'L+6'], ['B30']], ['1-1', '1-2', '1-3'], 'refused', 9],
  ['鍵は2本まとめて持てる', 5, [['K', 'K', 'L+4'], ['L+6'], ['B10']], ['1-1', '1-2', '1-3', '2-1', '3-1'], 'clear', 25],
  ['錠前の敵は、開けてから戦う', 5, [['K', 'LE3'], ['B7']], ['1-1', '1-2', '2-1'], 'clear', 15],
  ['てっぺんの敵も錠前つきにできる', 5, [['K', 'E1'], ['LB4']], ['1-1', '2-1'], 'clear', 9],
  ['開けた部屋は、空いたあと鍵なしで通れる', 5, [['K', 'L+4', 'E1'], ['B9']], ['1-1', '1-2', '1-3', '1-2', '2-1'], 'clear', 19],
  ['空いた鍵の部屋へ戻っても鍵は増えない', 5, [['K', 'E1'], ['L+4', 'L+6'], ['B30']], ['1-1', '1-2', '1-1', '2-1', '2-2'], 'refused', 10],
  ['鍵が足りず入れる部屋が無くなったら失敗', 5, [['K', 'L+4'], ['LB3']], ['1-1', '1-2'], 'fail:stuck', 9],
];
for (const [label, start, floors, names, expect, power] of RULES) {
  const r = run({ start, floors }, names);
  const ok = r.result === expect && (power === null || r.power === power);
  if (!ok) bad++;
  console.log((ok ? 'OK ' : '★NG') + ' 決まり ' + label + ' → ' + r.result + ' 強さ ' + r.power + '（期待 ' + expect + (power === null ? '' : ' 強さ ' + power) + '）');
}
console.log(bad ? '★NG ' + bad + ' 件' : 'すべて期待どおり');
process.exit(bad ? 1 : 0);
