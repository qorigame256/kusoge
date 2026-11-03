// 水の色分けのレベル。tubes は試験管ごとの色を下から上へ並べた文字（A〜I が色、'' は空の試験管）。1本に4段まで。
// 各色はちょうど4段ずつある。hidden: true の面は、各試験管のいちばん上の段のほかを「？」で隠す（上をどかすと見える）。
// hint は画面上部に1行で出る。右に「手数 ◯」が並ぶので、全角20字以内にする。
// 並びは乱数で混ぜたものから選んだ。どの面も解けること・最短手数・でたらめに注いで勝てる割合は tools/test-sort.js が確かめる。
// 7面から先は「同じ色の上へ注げるなら注ぐ」素直なやり方では勝てないことも、同じ検査が確かめる。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  KG.sortLevels = [
    { name: 'はじめての色分け', hint: 'タップで選んで、別の試験管へ注ぐ', tubes: ['AABB', 'BAAB', ''] },
    { name: '3色', hint: '同じ色の上か、空の試験管に注げる', tubes: ['BBAC', 'ACCB', 'BAAC', '', ''] },
    { name: '4色', hint: '空の試験管をうまく使おう', tubes: ['BDAD', 'CBAB', 'DCDB', 'ACAC', '', ''] },
    { name: '5色', hint: '色が増えた。あわてずに', tubes: ['ABDC', 'EBAA', 'EDCB', 'ECBD', 'ECAD', '', ''] },
    { name: '6色', hint: '6色。先を読んで注ごう', tubes: ['ECCB', 'EAFB', 'BFCE', 'FDAE', 'DFAC', 'BDAD', '', ''] },
    // ここから難しい面（6〜10面）。下の段の色が「？」で隠れる
    { name: '隠れた色', hint: '？の色は、上をどかすと見える', hidden: true, tubes: ['CEDC', 'EBCB', 'EEDA', 'ABBD', 'ACAD', '', ''] },
    { name: '？が増えた', hint: '隠れた色を早めに見よう', hidden: true, tubes: ['FFBC', 'ADED', 'EBBD', 'FEFB', 'ACCD', 'ACAE', '', ''] },
    { name: '7色と？', hint: '7色と？。じっくりいこう', hidden: true, tubes: ['ABCF', 'EGAE', 'GDDF', 'CBEF', 'BEDD', 'FACG', 'ABCG', '', ''] },
    { name: '空きが1本', hint: '空きは1本だけ', hidden: true, tubes: ['ABCD', 'BAAC', 'DCDB', 'DBCA', ''] },
    { name: '総仕上げ', hint: '空き1本と？。総仕上げ', hidden: true, tubes: ['AABD', 'CCEB', 'DCCD', 'DEBE', 'AABE', ''] },
  ];
})();
