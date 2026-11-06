// 効果音。音のファイルは使わず、ブラウザの音声機能（Web Audio）でその場で合成する。
// スマホのブラウザは「画面に触れたあと」でないと音を出せないので、最初のタップで unlock() を呼ぶ。
(function () {
  'use strict';
  const KG = (globalThis.KG = globalThis.KG || {});

  let ac = null;
  let noiseBuf = null;
  let muted = false;
  const lastPlayed = {};
  // 同じ音が短い間に重なりすぎないようにする間隔（秒）
  const MIN_GAP = { coin: 0.045, sizzle: 0.2, pin: 0.05, hit: 0.07, buzz: 0.18, honk: 0.2, dig: 0.07, ball: 0.05, slide: 0.045 };

  function getCtx() {
    if (!ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(a, freq, start, dur, type, vol, freqEnd) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(a.destination);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function noise(a, start, dur, vol, cutoff) {
    const s = a.createBufferSource();
    s.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(a.destination);
    s.start(start);
    s.stop(start + dur + 0.02);
  }

  KG.sound = {
    unlock() {
      getCtx();
    },
    setMuted(m) {
      muted = !!m;
    },
    isMuted() {
      return muted;
    },
    play(name) {
      if (muted) return;
      const a = getCtx();
      if (!a) return;
      const t = a.currentTime;
      const gap = MIN_GAP[name];
      if (gap && lastPlayed[name] !== undefined && t - lastPlayed[name] < gap) return;
      lastPlayed[name] = t;
      switch (name) {
        case 'tap':
          tone(a, 660, t, 0.06, 'square', 0.06);
          break;
        case 'pin':
          noise(a, t, 0.12, 0.25, 3000);
          tone(a, 1100, t, 0.12, 'triangle', 0.12, 500);
          break;
        case 'coin':
          tone(a, 1320, t, 0.06, 'square', 0.05);
          tone(a, 1760, t + 0.045, 0.08, 'square', 0.05);
          break;
        case 'sizzle':
          noise(a, t, 0.4, 0.2, 5000);
          break;
        case 'burn':
          noise(a, t, 0.6, 0.3, 900);
          tone(a, 240, t, 0.5, 'sawtooth', 0.1, 70);
          break;
        case 'monster':
          tone(a, 180, t, 0.3, 'sawtooth', 0.14, 90);
          tone(a, 120, t + 0.12, 0.35, 'square', 0.08, 60);
          break;
        case 'poof':
          noise(a, t, 0.35, 0.22, 1400);
          break;
        case 'up':
          tone(a, 520, t, 0.08, 'square', 0.07);
          tone(a, 780, t + 0.07, 0.12, 'square', 0.07);
          break;
        case 'down':
          tone(a, 400, t, 0.1, 'sawtooth', 0.08);
          tone(a, 260, t + 0.08, 0.16, 'sawtooth', 0.08);
          break;
        case 'hit':
          noise(a, t, 0.06, 0.15, 2200);
          break;
        case 'crash':
          // 金色の車の大破: つぶれる低い音と、ガラスの割れる高い音
          noise(a, t, 0.45, 0.3, 1600);
          tone(a, 130, t, 0.3, 'square', 0.09, 45);
          [2900, 3500, 2500].forEach((f, i) => tone(a, f, t + 0.05 + i * 0.06, 0.07, 'triangle', 0.035));
          break;
        case 'buzz':
          tone(a, 205, t, 0.14, 'sawtooth', 0.022, 185);
          break;
        case 'sting':
          noise(a, t, 0.1, 0.16, 4000);
          tone(a, 1500, t, 0.1, 'square', 0.07, 600);
          break;
        case 'pour':
          noise(a, t, 0.3, 0.1, 1100);
          tone(a, 320, t, 0.28, 'sine', 0.06, 620);
          break;
        case 'drive':
          tone(a, 95, t, 0.3, 'sawtooth', 0.06, 240);
          noise(a, t, 0.22, 0.07, 900);
          break;
        case 'honk':
          tone(a, 415, t, 0.12, 'square', 0.04);
          tone(a, 523, t, 0.12, 'square', 0.035);
          break;
        case 'unscrew':
          // ネジを外す: きゅっと上がる音
          tone(a, 700, t, 0.12, 'triangle', 0.07, 1400);
          noise(a, t, 0.05, 0.08, 3500);
          break;
        case 'screw':
          // ネジを差す: かちかちと回る音
          [0, 0.035, 0.07].forEach((d) => tone(a, 1500, t + d, 0.025, 'square', 0.035));
          break;
        case 'plank':
          // 板が落ちる: 木のからんという音
          noise(a, t, 0.16, 0.18, 900);
          tone(a, 260, t, 0.14, 'triangle', 0.09, 140);
          break;
        case 'deny':
          tone(a, 160, t, 0.12, 'square', 0.04);
          break;
        case 'dig':
          // 砂を掘る: ざっという短い音
          noise(a, t, 0.08, 0.06, 1300);
          break;
        case 'ball':
          // 玉が荷台に入る: ころんという音
          tone(a, 880, t, 0.06, 'triangle', 0.06);
          tone(a, 1320, t + 0.04, 0.07, 'triangle', 0.05);
          break;
        case 'put':
          // ブロックを置く: ことんという音
          noise(a, t, 0.07, 0.12, 1100);
          tone(a, 300, t, 0.09, 'triangle', 0.09, 180);
          break;
        case 'line':
          // 列が消える: しゅわっと上がる音
          noise(a, t, 0.25, 0.1, 4500);
          [660, 880, 1175].forEach((f, i) => tone(a, f, t + i * 0.05, 0.12, 'triangle', 0.07));
          break;
        case 'crack':
          // 氷が割れる: ぱりんという音
          noise(a, t, 0.12, 0.2, 7000);
          [2600, 3300].forEach((f, i) => tone(a, f, t + i * 0.04, 0.06, 'triangle', 0.04));
          break;
        case 'slide':
          // ブロックが1マス滑る: こつっという小さな音
          tone(a, 330, t, 0.04, 'triangle', 0.05, 260);
          noise(a, t, 0.03, 0.04, 1500);
          break;
        case 'out':
          // ブロックが出口から出る: しゅっと抜ける音と、ちりんという音
          noise(a, t, 0.22, 0.12, 2600);
          tone(a, 520, t, 0.16, 'triangle', 0.06, 1250);
          tone(a, 1568, t + 0.1, 0.14, 'triangle', 0.05);
          break;
        case 'peel':
          // 2色のブロックの外側がはがれる: ぺりっという音
          noise(a, t, 0.12, 0.14, 5200);
          tone(a, 980, t, 0.1, 'square', 0.035, 640);
          break;
        case 'clear':
          [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.09, 0.2, 'triangle', 0.14));
          break;
        case 'fail':
          [392, 330, 262].forEach((f, i) => tone(a, f, t + i * 0.15, 0.24, 'triangle', 0.14));
          break;
      }
    },
  };
})();
