// 全体で共有する名前空間 KG と小道具。
// ES モジュールにせず classic script にしているのは、index.html をダブルクリック（file://）で開いても動かすため。
// ここは DOM に触らない（Node の検査からも読み込む。ブラウザにしか無い機能は、有るときだけ触る）。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  // 角の丸い四角を描く命令が無い古いブラウザ向けの代わり（角は丸めずに四角で描く）。どのゲームの描画も使う
  if (globalThis.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) {
      this.rect(x, y, w, h);
    };
  }

  // 人や物の上に出す数字の札。(x, y) は札の下の端の真ん中。描画側だけが呼ぶ（Node の検査は呼ばない）
  KG.drawBadge = function (ctx, x, y, text, bg, size) {
    ctx.font = '900 ' + size.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    const w = ctx.measureText(text).width + size * 0.9;
    const h = size * 1.3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h + 2, w, h, h * 0.4);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, h * 0.4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + size * 0.06);
  };

  // 論理解像度（縦画面）。描画も当たり判定もこの座標で考え、表示のときだけ拡大縮小する。
  KG.W = 540;
  KG.H = 960;

  KG.games = KG.games || [];
  KG.registerGame = function (game) {
    KG.games.push(game);
  };

  // 毎回同じ並びになる乱数（mulberry32）。物理の初期配置を検査と画面でそろえるために使う。
  KG.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 保存。localStorage が使えない環境（プライベートモードなど）でも落ちないようにする。
  const SAVE_KEY = 'kusoge-taizen-v1';
  KG.loadSave = function () {
    try {
      const s = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY) || '{}');
      return s && typeof s === 'object' ? s : {};
    } catch (e) {
      return {};
    }
  };
  KG.writeSave = function (data) {
    try {
      globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      // 保存できなくても遊べる
    }
  };
})();
