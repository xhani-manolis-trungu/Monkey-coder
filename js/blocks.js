/* The logic blocks kids drag around, and helpers to create / copy them. */
(function (MC) {
  'use strict';

  MC.CATEGORIES = [
    { id: 'events', name: 'Events', icon: '⚡', color: '#f7b500' },
    { id: 'motion', name: 'Move', icon: '🏃', color: '#4c97ff' },
    { id: 'looks', name: 'Looks', icon: '💬', color: '#9966ff' },
    { id: 'control', name: 'Control', icon: '🔁', color: '#ff8c1a' },
    { id: 'game', name: 'Game', icon: '🏆', color: '#2fb569' }
  ];

  MC.DIR_OPTIONS = [
    { value: 'right', label: '→ right' },
    { value: 'left', label: '← left' },
    { value: 'up', label: '↑ up' },
    { value: 'down', label: '↓ down' }
  ];

  MC.ARG_TYPES = {
    num: { kind: 'number' },
    text: { kind: 'text' },
    kind: { kind: 'select', dynamic: true },
    dir: { kind: 'select', options: MC.DIR_OPTIONS },
    turn: { kind: 'select', options: [{ value: 'left', label: '↺ left' }, { value: 'right', label: '↻ right' }] },
    key: {
      kind: 'select',
      options: [
        { value: 'right', label: '→' }, { value: 'left', label: '←' },
        { value: 'up', label: '↑' }, { value: 'down', label: '↓' },
        { value: 'space', label: 'space' }
      ]
    },
    sound: {
      kind: 'select',
      options: ['pop', 'coin', 'jump', 'boing', 'laser', 'drum', 'win', 'lose'].map(function (s) { return { value: s, label: s }; })
    },
    speed: {
      kind: 'select',
      options: [{ value: 'slow', label: '🐢 slow' }, { value: 'normal', label: '🐒 normal' }, { value: 'fast', label: '🐇 fast' }]
    }
  };

  // label: text shown on the block, {name} marks an input.
  // hat: starts a script.  c: has a mouth for other blocks.  cap: nothing can go below it.
  MC.BLOCKS = {
    on_start: { cat: 'events', hat: true, label: 'when ▶ Run clicked', help: 'Starts when you press Run.' },
    on_key: { cat: 'events', hat: true, label: 'when {key} pressed', args: { key: { type: 'key', def: 'right' } }, help: 'Starts when a key (or an on-screen arrow) is pressed.' },
    on_touch: { cat: 'events', hat: true, label: 'when I touch {kind}', args: { kind: { type: 'kind', def: 'banana' } }, help: 'Starts when this picture bumps into another one.' },
    on_timer: { cat: 'events', hat: true, label: 'every {n} seconds', args: { n: { type: 'num', def: 1, min: 0.2, max: 60 } }, help: 'Starts again and again on a timer.' },

    move: { cat: 'motion', label: 'move {n} steps', args: { n: { type: 'num', def: 1, min: 1, max: 20 } }, help: 'Walk forward the way you are facing.' },
    turn: { cat: 'motion', label: 'turn {dir}', args: { dir: { type: 'turn', def: 'left' } }, help: 'Turn to face a new way.' },
    jump: { cat: 'motion', label: 'jump', help: 'Hop over the next square.' },
    step: { cat: 'motion', label: 'step {dir} {n}', args: { dir: { type: 'dir', def: 'right' }, n: { type: 'num', def: 1, min: 1, max: 20 } }, help: 'Face a way and walk.' },
    chase: { cat: 'motion', label: 'step toward {kind}', args: { kind: { type: 'kind', def: 'monkey' } }, help: 'Take one step closer to something.' },
    wander: { cat: 'motion', label: 'step randomly', help: 'Take one step in a random direction.' },
    goto_random: { cat: 'motion', label: 'jump to a random spot', help: 'Teleport to an empty square.' },
    speed: { cat: 'motion', label: 'set speed {speed}', args: { speed: { type: 'speed', def: 'normal' } }, help: 'Walk slower or faster.' },

    say: { cat: 'looks', label: 'say {text}', args: { text: { type: 'text', def: 'Hello!' } }, help: 'Show a speech bubble.' },
    hide: { cat: 'looks', label: 'hide', help: 'Disappear.' },
    show: { cat: 'looks', label: 'show', help: 'Appear again.' },
    spin: { cat: 'looks', label: 'spin', help: 'Do a happy spin!' },

    repeat: { cat: 'control', c: true, label: 'repeat {n} times', args: { n: { type: 'num', def: 3, min: 1, max: 50 } }, help: 'Do the blocks inside again and again.' },
    forever: { cat: 'control', c: true, cap: true, label: 'forever', help: 'Do the blocks inside forever.' },
    wait: { cat: 'control', label: 'wait {n} seconds', args: { n: { type: 'num', def: 1, min: 0.1, max: 30 } }, help: 'Take a little break.' },
    if_touching: { cat: 'control', c: true, label: 'if touching {kind}', args: { kind: { type: 'kind', def: 'banana' } }, help: 'Only do the blocks inside if touching something.' },
    if_score: { cat: 'control', c: true, label: 'if score ≥ {n}', args: { n: { type: 'num', def: 5, min: 0, max: 999 } }, help: 'Only do the blocks inside if the score is big enough.' },

    collect: { cat: 'game', label: 'collect it', help: 'Make the thing you touched disappear.' },
    score: { cat: 'game', label: 'add {n} to score', args: { n: { type: 'num', def: 1, min: -99, max: 99 } }, help: 'Change the score.' },
    sound: { cat: 'game', label: 'play sound {sound}', args: { sound: { type: 'sound', def: 'pop' } }, help: 'Make a noise!' },
    win: { cat: 'game', cap: true, label: 'you win!', help: 'The player wins the game.' },
    lose: { cat: 'game', cap: true, label: 'game over', help: 'The player loses the game.' }
  };

  MC.BLOCK_ORDER = Object.keys(MC.BLOCKS);

  // A picture on every block, so children can tell what it does before they can read it well.
  MC.BLOCK_ICONS = {
    on_start: '🏁',
    on_key: '⌨️',
    on_touch: '🤝',
    on_timer: '⏰',
    move: '👣',
    turn: function (args) { return args && args.dir === 'right' ? '↪️' : '↩️'; },
    jump: '🦘',
    step: '👟',
    chase: '🎯',
    wander: '🎲',
    goto_random: '🔀',
    speed: '⏱️',
    say: '💬',
    hide: '🙈',
    show: '👀',
    spin: '🌀',
    repeat: '🔁',
    forever: '♾️',
    wait: '⏳',
    if_touching: '🤔',
    if_score: '🏅',
    collect: '🧺',
    score: '➕',
    sound: '🔊',
    win: '🏆',
    lose: '💥'
  };

  /** The icon for a block (some icons follow the block's setting, like turn left / right). */
  MC.blockIcon = function (block) {
    var icon = MC.BLOCK_ICONS[block.type];
    return typeof icon === 'function' ? icon(block.args) : (icon || '');
  };

  var counter = 0;
  MC.uid = function (prefix) {
    counter += 1;
    return (prefix || 'b') + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  };

  MC.newBlock = function (type) {
    var def = MC.BLOCKS[type];
    var block = { id: MC.uid('b'), type: type, args: {} };
    if (def.args) {
      Object.keys(def.args).forEach(function (k) { block.args[k] = def.args[k].def; });
    }
    if (def.c) block.body = [];
    return block;
  };

  MC.clone = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  /** Give every block an id and fill in missing arguments (used for templates & loaded files). */
  MC.normalizeBlocks = function (list) {
    (list || []).forEach(function (b) {
      var def = MC.BLOCKS[b.type];
      if (!b.id) b.id = MC.uid('b');
      b.args = b.args || {};
      if (def && def.args) {
        Object.keys(def.args).forEach(function (k) {
          if (b.args[k] === undefined) b.args[k] = def.args[k].def;
        });
      }
      if (def && def.c) {
        b.body = b.body || [];
        MC.normalizeBlocks(b.body);
      }
    });
    return list;
  };

  MC.normalizeScripts = function (scripts) {
    (scripts || []).forEach(function (st) {
      st.x = st.x || 20;
      st.y = st.y || 20;
      st.blocks = MC.normalizeBlocks(st.blocks || []);
    });
    return scripts || [];
  };

  /** Count blocks (not counting hats). Used for stars in Story mode. */
  MC.countBlocks = function (list) {
    var n = 0;
    (list || []).forEach(function (b) {
      if (!MC.BLOCKS[b.type] || !MC.BLOCKS[b.type].hat) n += 1;
      if (b.body) n += MC.countBlocks(b.body);
    });
    return n;
  };

  // Tiny helpers to write scripts in code (templates, levels, tests).
  MC.B = function (type, args, body) {
    var b = { type: type, args: args || {} };
    if (body) b.body = body;
    return b;
  };
  MC.S = function (x, y, blocks) { return { x: x, y: y, blocks: blocks }; };
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
