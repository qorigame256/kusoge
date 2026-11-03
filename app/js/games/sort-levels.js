// 水の色分けのレベル。tubes は入れ物ごとの色を下から上へ並べた文字（A〜I が色、'' は空）。各色はちょうど4段ずつある。
// 試験管は4段まで。big に並べた番号の入れ物は大きな入れ物で、8段まで入る（1色4段だけになったら栓をする）。
// 失敗が無いように、空き（全部の入れ物に入る段の数 − 色の段の数）を「大きな入れ物の数 × 4 + 1」以上にする
// （栓をした大きな入れ物の残り4段は使えないため。これを守れば、そろう前に注げる所が無くなることは無い）。
// hidden: true の面は、各入れ物のいちばん上の段のほかを「？」で隠す（上をどかすと見える）。
// hint は画面上部に1行で出る。右に「手数 ◯」が並ぶので、全角20字以内にする。
// 並びは乱数で混ぜたものから選んだ。どの面も解けること・最短手数・空きの決まりは tools/test-sort.js が確かめる。
// 7面から先は「同じ色の上か空の入れ物にだけ注ぐ」素直なやり方では勝てないことも、同じ検査が確かめる。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  KG.sortLevels = [
    { name: 'はじめての色分け', hint: 'タップで選んで、別の試験管へ注ぐ', tubes: ['AABB', 'BAAB', ''] },
    { name: '違う色の上にも', hint: '違う色の上にも注げる', tubes: ['AAB', 'CCB', 'ACC', 'BAB'] },
    { name: '4色', hint: '空の試験管をうまく使おう', tubes: ['BDAD', 'CBAB', 'DCDB', 'ACAC', '', ''] },
    { name: '大きな入れ物', hint: '大きな入れ物には8段入る', tubes: ['ABCA', 'CCCD', '', 'ADDA', 'BDBB'], big: [2] },
    { name: '5色と大きな入れ物', hint: '大きな入れ物も、1色4段で栓をする', tubes: ['BDDB', 'CADA', '', 'CECE', 'BEDE', 'AABC'], big: [2] },
    // ここから難しい面（6〜10面）。下の段の色が「？」で隠れる
    { name: '隠れた色', hint: '？の色は、上をどかすと見える', hidden: true, tubes: ['CEDC', 'EBCB', 'EEDA', 'ABBD', 'ACAD', '', ''] },
    { name: '？が増えた', hint: '隠れた色を早めに見よう', hidden: true, tubes: ['FFBC', 'ADED', 'EBBD', 'FEFB', 'ACCD', 'ACAE', '', ''] },
    { name: '大きな入れ物と？', hint: '大きな入れ物の中も隠れている', hidden: true, tubes: ['BECF', 'BFCA', 'DFDD', 'ACADFCEB', 'EAEB', '', ''], big: [3] },
    { name: '空きが1本', hint: '空きは1本だけ', hidden: true, tubes: ['ABCD', 'BAAC', 'DCDB', 'DBCA', ''] },
    { name: '総仕上げ', hint: '大きな入れ物と？。総仕上げ', hidden: true, tubes: ['EDCB', 'ECBD', 'ABDCEBAA', 'ECAD', '', ''], big: [2] },
  ];
})();
