/* Tiny sound effects made with the Web Audio API (no sound files needed). */
(function (MC) {
  'use strict';

  var ctx = null;
  var muted = false;

  function audio() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, vol, endFreq) {
    var c = audio();
    if (!c) return;
    var t = c.currentTime + start;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  var SOUNDS = {
    pop: function () { tone(520, 0, 0.12, 'sine', 0.2, 900); },
    coin: function () { tone(988, 0, 0.08, 'square', 0.07); tone(1319, 0.08, 0.25, 'square', 0.07); },
    jump: function () { tone(280, 0, 0.25, 'triangle', 0.2, 820); },
    boing: function () { tone(150, 0, 0.45, 'sine', 0.25, 620); },
    laser: function () { tone(1400, 0, 0.22, 'square', 0.05, 180); },
    drum: function () { tone(110, 0, 0.18, 'sine', 0.35, 50); },
    bump: function () { tone(140, 0, 0.14, 'sine', 0.22, 70); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.3, 'triangle', 0.18); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, i * 0.18, 0.32, 'sawtooth', 0.06); }); }
  };

  MC.Sound = {
    names: ['pop', 'coin', 'jump', 'boing', 'laser', 'drum', 'win', 'lose'],
    play: function (name) {
      if (muted) return;
      try { (SOUNDS[name] || SOUNDS.pop)(); } catch (e) { /* sound is optional */ }
    },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; }
  };
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
