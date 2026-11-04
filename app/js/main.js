// 画面の切り替え（ゲーム一覧 → レベル選択 → 遊ぶ画面 → 結果）と、ゲームを動かす時計・タップの受け渡し。
// 各ゲームは KG.registerGame で次の形を登録する:
//   { id, title, cardTitle?, desc, levels: [{ name }], drawIcon(ctx), create(api, levelIndex) → { step(), render(ctx), pointerDown(x, y), pointerMove?(x, y), pointerUp?(x, y) } }
//   cardTitle は一覧の札の題名を、行を変えてよい所で区切った配列（例: ['線を引いて', '守る']）。札は1行に全角6字までしか入らないので、
//   7字以上の題名に付ける（無ければ title をそのまま出す。区切りの中では行を変えない）。
//   step() は 1/60 秒ぶん進める。render(ctx) は論理座標（KG.W × KG.H）で描く。タップの座標も論理座標。
//   pointerMove・pointerUp はなぞる操作をするゲームだけが持つ（指を画面の外へ出しても追えるよう、押した指を canvas が捕まえる）。
//   渡すのは最初に触れた指だけで、その指を離すまでほかの指は渡さない（下の「操作」）。
(function () {
  'use strict';
  const KG = globalThis.KG;
  const STEP = 1 / 60;
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // まだ作っていないゲームの枠。同じ id のゲームが登録されたら出さない。
  // 書き方の例: { id: 'xxx', title: '一覧に出す題名' }
  const UPCOMING = [];

  const save = KG.loadSave();
  if (!save.games || typeof save.games !== 'object') save.games = {};
  KG.sound.setMuted(!!save.muted);

  let scale = 1;
  let currentScreen = 'title';
  let selectedGame = null;
  let play = null; // { game, levelIndex, inst, token }
  let playToken = 0;

  function clearedOf(game) {
    const g = save.games[game.id];
    return g && Array.isArray(g.cleared) ? g.cleared : [];
  }

  function markCleared(game, levelIndex) {
    const g = save.games[game.id] || (save.games[game.id] = {});
    if (!Array.isArray(g.cleared)) g.cleared = [];
    if (!g.cleared.includes(levelIndex)) g.cleared.push(levelIndex);
    KG.writeSave(save);
  }

  // ---- 大きさ合わせ ----

  function resize() {
    // 見えている範囲に必ず収まるよう、測り方の違う値の小さいほうを使う
    // （スマホでは window.innerWidth が見えている幅より大きく返ることがある）
    const de = document.documentElement;
    const vv = window.visualViewport;
    const vw = Math.min(window.innerWidth, de.clientWidth || Infinity, vv ? vv.width : Infinity);
    const vh = Math.min(window.innerHeight, de.clientHeight || Infinity, vv ? vv.height : Infinity);
    scale = Math.min(vw / KG.W, vh / KG.H);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(KG.W * scale);
    const h = Math.round(KG.H * scale);
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.setProperty('--u', scale + 'px');
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (currentScreen === 'title') renderTitle();
  }

  function showScreen(name) {
    currentScreen = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-levels').hidden = name !== 'levels';
    $('screen-play').hidden = name !== 'play';
  }

  // ---- ゲーム一覧 ----

  function drawIconInto(cv, game) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.max(1, Math.round(84 * scale * dpr)); // 一覧の絵の表示の大きさ（style.css の .game-card .icon）
    cv.width = px;
    cv.height = px;
    const c = cv.getContext('2d');
    c.setTransform(px / 96, 0, 0, px / 96, 0, 0);
    game.drawIcon(c);
  }

  function renderTitle() {
    const list = $('game-list');
    list.textContent = '';
    for (const game of KG.games) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'game-card';
      const icon = document.createElement('canvas');
      icon.className = 'icon';
      card.appendChild(icon);
      // 一覧は3列の札なので、説明（game.desc）はレベル選択の画面に出す
      const text = document.createElement('div');
      text.className = 'card-text';
      const done = clearedOf(game).filter((i) => i < game.levels.length).length;
      text.innerHTML = '<h3 class="card-title"></h3><p class="card-progress"></p>';
      // 題名は区切りの間（wbr）でだけ行を変える（style.css の .card-title）。h3 が真ん中にそろえる1つの span に入れる
      const name = document.createElement('span');
      (game.cardTitle || [game.title]).forEach((part, n) => {
        if (n) name.appendChild(document.createElement('wbr'));
        name.appendChild(document.createTextNode(part));
      });
      text.querySelector('.card-title').appendChild(name);
      text.querySelector('.card-progress').textContent = 'クリア ' + done + ' / ' + game.levels.length;
      card.appendChild(text);
      card.addEventListener('click', () => {
        KG.sound.play('tap');
        openLevels(game);
      });
      list.appendChild(card);
      drawIconInto(icon, game);
    }
    for (const up of UPCOMING) {
      if (KG.games.some((g) => g.id === up.id)) continue;
      const card = document.createElement('div');
      card.className = 'game-card soon';
      card.innerHTML = '<div class="icon soon">?</div><div class="card-text"><h3 class="card-title"></h3><p class="card-progress">準備中</p></div>';
      card.querySelector('.card-title').textContent = up.title;
      list.appendChild(card);
    }
    $('btn-sound').textContent = KG.sound.isMuted() ? '音 OFF' : '音 ON';
  }

  function openTitle() {
    stopPlay();
    showScreen('title');
    renderTitle();
  }

  // ---- レベル選択 ----

  function openLevels(game) {
    stopPlay();
    selectedGame = game;
    showScreen('levels');
    $('levels-title').textContent = game.title;
    $('levels-desc').textContent = game.desc;
    const list = $('level-list');
    list.textContent = '';
    const cleared = clearedOf(game);
    game.levels.forEach((lv, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-btn';
      b.innerHTML = '<span class="level-num"></span><span class="level-name"></span><span class="level-mark"></span>';
      b.querySelector('.level-num').textContent = String(i + 1);
      b.querySelector('.level-name').textContent = lv.name;
      b.querySelector('.level-mark').textContent = cleared.includes(i) ? 'クリア済み' : '';
      b.addEventListener('click', () => {
        KG.sound.play('tap');
        startLevel(game, i);
      });
      list.appendChild(b);
    });
  }

  // ---- 遊ぶ画面 ----

  function stopPlay() {
    play = null;
    playToken++;
    $('result').hidden = true;
  }

  function startLevel(game, levelIndex) {
    stopPlay();
    showScreen('play');
    const token = playToken;
    $('play-title').textContent = game.title + '  ' + (levelIndex + 1) + '/' + game.levels.length;
    $('play-hint').textContent = '';
    $('play-hud').textContent = '';
    const api = {
      setHud(t) {
        if (token === playToken) $('play-hud').textContent = t;
      },
      setHint(t) {
        if (token === playToken) $('play-hint').textContent = t;
      },
      sound(name) {
        if (token === playToken) KG.sound.play(name);
      },
      finish(result) {
        if (token !== playToken) return;
        if (result.clear) markCleared(game, levelIndex);
        setTimeout(() => {
          if (token === playToken) showResult(game, levelIndex, result);
        }, result.delay || 800);
      },
    };
    const inst = game.create(api, levelIndex);
    play = { game, levelIndex, inst, token, pointer: null };
  }

  function showResult(game, levelIndex, result) {
    const title = $('result-title');
    title.textContent = result.title;
    title.className = result.clear ? 'clear' : '';
    $('result-msg').textContent = (typeof result.message === 'function' ? result.message() : result.message) || '';
    const main = $('result-main');
    const sub = $('result-sub');
    const hasNext = levelIndex + 1 < game.levels.length;
    if (result.clear) {
      main.textContent = hasNext ? '次のレベルへ' : 'レベル選択へ';
      main.onclick = () => {
        KG.sound.play('tap');
        if (hasNext) startLevel(game, levelIndex + 1);
        else openLevels(game);
      };
      sub.textContent = 'もう一度';
      sub.onclick = () => {
        KG.sound.play('tap');
        startLevel(game, levelIndex);
      };
    } else {
      main.textContent = 'もう一度';
      main.onclick = () => {
        KG.sound.play('tap');
        startLevel(game, levelIndex);
      };
      sub.textContent = 'レベル選択へ';
      sub.onclick = () => {
        KG.sound.play('tap');
        openLevels(game);
      };
    }
    $('result').hidden = false;
    KG.sound.play(result.clear ? 'clear' : 'fail');
  }

  // ---- 時計 ----

  let last = 0;
  let acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    if (!play) return;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      play.inst.step();
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0;
    ctx.setTransform(canvas.width / KG.W, 0, 0, canvas.height / KG.H, 0, 0);
    play.inst.render(ctx);
  }

  // ---- 操作 ----

  document.addEventListener('pointerdown', () => KG.sound.unlock(), { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * KG.W, ((e.clientY - r.top) / r.height) * KG.H];
  }
  // 最初に触れた指（play.pointer）だけを受け取る。2本目の指も渡すと、砂は2本の指の間がまっすぐ掘れ、線はジグザグに飛ぶ。
  // 離したときは画面のどこで離しても受け取る（指を捕まえられず、canvas の外で離したときに、触れたままになって止まらないように）
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!play || play.pointer != null) return;
    play.pointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // 捕まえられなくても操作はできる
    }
    const [x, y] = toLogical(e);
    play.inst.pointerDown(x, y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!play || e.pointerId !== play.pointer || !play.inst.pointerMove) return;
    const [x, y] = toLogical(e);
    play.inst.pointerMove(x, y);
  });
  const pointerEnd = (e) => {
    if (!play || e.pointerId !== play.pointer) return;
    play.pointer = null;
    if (!play.inst.pointerUp) return;
    const [x, y] = toLogical(e);
    play.inst.pointerUp(x, y);
  };
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);

  $('btn-sound').addEventListener('click', () => {
    KG.sound.setMuted(!KG.sound.isMuted());
    save.muted = KG.sound.isMuted();
    KG.writeSave(save);
    $('btn-sound').textContent = save.muted ? '音 OFF' : '音 ON';
    KG.sound.play('tap');
  });
  $('btn-levels-back').addEventListener('click', () => {
    KG.sound.play('tap');
    openTitle();
  });
  $('btn-play-back').addEventListener('click', () => {
    KG.sound.play('tap');
    const game = play ? play.game : selectedGame;
    if (game) openLevels(game);
    else openTitle();
  });
  $('btn-retry').addEventListener('click', () => {
    KG.sound.play('tap');
    if (play) startLevel(play.game, play.levelIndex);
  });

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();
  openTitle();
  requestAnimationFrame(frame);
})();
