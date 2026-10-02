/* Monkey Coder: puts the stage, the block editor and the two modes together. */
(function (MC) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- saving in the browser ---------- */

  var STORE = 'monkeycoder.v1.';
  function load(key, def) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function save(key, value) {
    try { localStorage.setItem(STORE + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  var SPEEDS = [0.5, 1, 2.2];

  var state = {
    mode: 'story',
    levelIndex: 0,
    progress: load('progress', { stars: {} }),
    storyScripts: load('story', {}),
    maker: null,
    project: null,
    selectedId: null,
    engine: null,
    speed: 1,
    galleryTab: 'Heroes'
  };
  if (!state.progress || typeof state.progress.stars !== 'object') state.progress = { stars: {} };

  var stage = new MC.Stage($('stage'));
  var editor = new MC.Editor({
    palette: $('palette'),
    cats: $('palette-cats'),
    paletteWrap: $('palette-wrap'),
    workspace: $('workspace'),
    canvas: $('ws-canvas'),
    trash: $('trash'),
    empty: $('ws-empty'),
    onChange: onCodeChange,
    onSound: function (n) { MC.Sound.play(n); },
    kindOptions: kindOptions
  });

  /* ---------- helpers ---------- */

  function spriteById(id) {
    return state.project ? state.project.sprites.find(function (s) { return s.id === id; }) : null;
  }
  function hero() { return spriteById('hero'); }
  function level() { return MC.LEVELS[state.levelIndex]; }
  function isPlaying() { return !!(state.engine && state.engine.status === 'running'); }

  function kindOptions() {
    var p = state.project;
    var seen = {};
    var out = [];
    function add(kind) {
      if (seen[kind]) return;
      seen[kind] = true;
      out.push({ value: kind, label: MC.kindLabel(kind, p) });
    }
    if (p) {
      p.sprites.forEach(function (s) { add(s.kind); });
      (p.images || []).forEach(function (i) { add(i.id); });
    }
    MC.IMAGES.forEach(function (i) { add(i.id); });
    return out;
  }

  function startBlockCount() {
    var h0 = hero();
    if (!h0) return 0;
    return h0.scripts.reduce(function (n, st) {
      return n + (st.blocks[0] && st.blocks[0].type === 'on_start' ? MC.countBlocks(st.blocks) : 0);
    }, 0);
  }

  function persist() {
    if (state.mode === 'story') {
      if (hero()) state.storyScripts[state.levelIndex] = hero().scripts;
      save('story', state.storyScripts);
    } else if (state.maker) {
      if (!save('maker', state.maker)) console.warn('Could not save the game in this browser (storage full?).');
    }
  }

  function onCodeChange() {
    stopGame();
    persist();
    if (state.mode === 'maker') renderSprites();
  }

  /* ---------- modes ---------- */

  function setMode(mode) {
    stopGame();
    state.mode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    save('mode', mode);
    if (mode === 'story') {
      loadLevel(state.levelIndex);
      maybeStartTour();
    } else {
      loadMaker();
    }
  }

  /* ---------- Story Adventure ---------- */

  function unlockedUpTo() {
    var n = 0;
    while (n < MC.LEVELS.length - 1 && state.progress.stars[n] > 0) n++;
    return n;
  }

  function loadLevel(i) {
    state.levelIndex = Math.max(0, Math.min(MC.LEVELS.length - 1, i));
    var lv = level();
    var scripts = null;
    var saved = state.storyScripts[state.levelIndex];
    if (Array.isArray(saved) && saved.length) {
      try { scripts = MC.repairProject({ sprites: [{ kind: 'monkey', scripts: saved }] }).sprites[0].scripts; } catch (e) { scripts = null; }
    }
    state.project = MC.buildLevelProject(lv, scripts && scripts.length ? scripts : null);
    state.selectedId = 'hero';
    stopGame();
    editor.setAllowed(lv.blocks);
    editor.setStacks(hero().scripts);
    $('ws-sprite').textContent = '🐒 Momo';
    $('ws-empty').textContent = 'Drag blocks from the left and snap them together here 👈';
    $('story-chapter').textContent = 'Chapter ' + (state.levelIndex + 1) + ' of ' + MC.LEVELS.length;
    $('story-title').textContent = lv.title;
    $('story-body').textContent = lv.story;
    $('story-goal').textContent = lv.goal;
    $('story-hint').textContent = '💡 ' + lv.hint;
    $('story-hint').hidden = true;
    $('btn-guide').hidden = state.levelIndex !== 0;
    renderLevels();
  }

  function renderLevels() {
    var wrap = $('levels');
    wrap.innerHTML = '';
    var maxOpen = unlockedUpTo();
    MC.LEVELS.forEach(function (lv, i) {
      var b = h('button', 'level-dot' + (i === state.levelIndex ? ' current' : ''));
      b.type = 'button';
      b.title = lv.title;
      b.textContent = String(i + 1);
      var stars = state.progress.stars[i] || 0;
      var small = h('small', null, stars ? '⭐'.repeat(stars) : (i > maxOpen ? '🔒' : ''));
      b.appendChild(small);
      b.disabled = i > maxOpen;
      b.addEventListener('click', function () { loadLevel(i); });
      wrap.appendChild(b);
    });
  }

  function storyWin() {
    var lv = level();
    var count = startBlockCount();
    var stars = MC.levelStars(lv, count);
    var i = state.levelIndex;
    state.progress.stars[i] = Math.max(state.progress.stars[i] || 0, stars);
    save('progress', state.progress);
    renderLevels();
    var last = i === MC.LEVELS.length - 1;
    var actions = last
      ? [{ label: '🎨 Make my own game', go: true, fn: function () { setMode('maker'); } }, { label: '↺ Play again', fn: stopGame }]
      : [{ label: 'Next chapter ▶', go: true, fn: function () { loadLevel(i + 1); } }, { label: '↺ Try again', fn: stopGame }];
    showOverlay({
      icon: last ? '🏆' : '🍌',
      title: last ? 'You finished the story!' : ['Yum!', 'Banana-tastic!', 'You did it!'][i % 3],
      stars: stars,
      text: stars === 3
        ? (last ? 'You are a coding champion! Now invent your own game.' : 'Perfect code! Momo is happy.')
        : 'You used ' + count + ' blocks. Can you do it with only ' + lv.par + '?' + (lv.blocks.indexOf('repeat') >= 0 ? ' (Try “repeat”!)' : ''),
      actions: actions
    });
  }

  function storyNotDone(engine) {
    var left = engine.sprites.filter(function (s) { return s.kind === 'banana' && s.visible; }).length;
    showOverlay({
      icon: '🤔',
      title: 'Almost!',
      text: 'Momo still needs ' + left + ' more banana' + (left === 1 ? '' : 's') + '. Change your code and try again!',
      actions: [
        { label: '↺ Try again', go: true, fn: stopGame },
        { label: '💡 Hint', fn: function () { stopGame(); $('story-hint').hidden = false; } }
      ]
    });
  }

  /* ---------- Game Maker ---------- */

  function loadMaker() {
    if (!state.maker) {
      var saved = load('maker', null);
      try { state.maker = saved ? MC.repairProject(saved) : MC.makeProject('banana-party'); } catch (e) { state.maker = MC.makeProject('banana-party'); }
    }
    state.project = state.maker;
    stopGame();
    editor.setAllowed(null);
    $('game-title').value = state.maker.title || '';
    $('game-story').value = state.maker.story || '';
    $('bg-select').value = state.maker.background;
    if (!spriteById(state.selectedId)) {
      var first = state.maker.sprites.find(function (s) { return s.scripts.length; }) || state.maker.sprites[0];
      state.selectedId = first ? first.id : null;
    }
    renderGallery();
    selectSprite(state.selectedId);
  }

  function selectSprite(id) {
    var s = spriteById(id);
    state.selectedId = s ? s.id : null;
    if (s) {
      editor.setStacks(s.scripts);
      $('ws-sprite').textContent = MC.kindLabel(s.kind, state.project);
      $('ws-empty').textContent = 'Give the ' + MC.imageInfo(s.kind, state.project).name + ' some code: drag blocks here 👈';
    } else {
      editor.setStacks([]);
      $('ws-sprite').textContent = 'nobody yet';
      $('ws-empty').textContent = '👈 First drag a picture onto the stage, then give it some code!';
    }
    updateLock();
    renderSprites();
  }

  function updateLock() {
    var noSprite = state.mode === 'maker' && !spriteById(state.selectedId);
    editor.setLocked(isPlaying() || noSprite);
    $('ws-locked-msg').textContent = isPlaying() ? '⏳ Running… press Stop to change the code' : '👈 Add a picture to the stage first';
    $('ws-locked-msg').hidden = noSprite && !isPlaying();
  }

  function renderSprites() {
    if (state.mode !== 'maker') return;
    var list = $('sprite-list');
    list.innerHTML = '';
    var p = state.project;
    if (!p.sprites.length) {
      list.appendChild(h('div', 'empty-note', 'No characters yet. Drag a picture from below onto the stage!'));
    }
    p.sprites.forEach(function (s) {
      var info = MC.imageInfo(s.kind, p);
      var chip = h('button', 'sprite-chip' + (s.id === state.selectedId ? ' selected' : ''));
      chip.type = 'button';
      chip.title = info.name;
      if (info.src) {
        var img = h('img');
        img.src = info.src;
        img.alt = info.name;
        chip.appendChild(img);
      } else {
        chip.appendChild(document.createTextNode(info.emoji));
      }
      chip.appendChild(h('small', null, info.name));
      if (s.scripts.length) {
        var badge = h('span', 'badge', String(s.scripts.length));
        badge.title = s.scripts.length + ' scripts';
        chip.appendChild(badge);
      }
      chip.addEventListener('click', function () { selectSprite(s.id); });
      list.appendChild(chip);
    });
    renderSpriteProps();
  }

  function renderSpriteProps() {
    var box = $('sprite-props');
    box.innerHTML = '';
    var s = spriteById(state.selectedId);
    if (!s) return;
    box.appendChild(h('span', 'who', MC.kindLabel(s.kind, state.project)));

    var faceLabel = h('label', null, 'faces');
    var face = h('select');
    MC.DIR_OPTIONS.forEach(function (o) {
      var opt = h('option', null, o.label);
      opt.value = String(MC.dirIndex(o.value));
      face.appendChild(opt);
    });
    face.value = String(s.dir || 0);
    face.addEventListener('change', function () { s.dir = +face.value; persist(); });
    faceLabel.appendChild(face);
    box.appendChild(faceLabel);

    var wallLabel = h('label', null);
    var wall = h('input');
    wall.type = 'checkbox';
    wall.checked = !!s.solid;
    wall.addEventListener('change', function () { s.solid = wall.checked; persist(); });
    wallLabel.appendChild(wall);
    wallLabel.appendChild(document.createTextNode('🧱 is a wall'));
    wallLabel.title = 'Walls stop other characters from walking through.';
    box.appendChild(wallLabel);

    var copy = h('button', 'pill small', '📄 Copy');
    copy.type = 'button';
    copy.addEventListener('click', function () { duplicateSprite(s); });
    box.appendChild(copy);

    var del = h('button', 'pill small danger', '🗑️ Remove');
    del.type = 'button';
    del.addEventListener('click', function () { removeSprite(s); });
    box.appendChild(del);
  }

  function reId(list) {
    (list || []).forEach(function (b) { b.id = MC.uid('b'); reId(b.body); });
  }

  function freeCell(near) {
    var p = state.project;
    var cx = near ? near.x : Math.floor(p.cols / 2);
    var cy = near ? near.y : Math.floor(p.rows / 2);
    for (var r = 0; r < Math.max(p.cols, p.rows); r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          var x = cx + dx;
          var y = cy + dy;
          if (x < 0 || y < 0 || x >= p.cols || y >= p.rows) continue;
          if (!p.sprites.some(function (s) { return s.x === x && s.y === y; })) return { x: x, y: y };
        }
      }
    }
    return { x: cx, y: cy };
  }

  function addSprite(kind, cell) {
    if (state.mode !== 'maker' || isPlaying()) return;
    var info = MC.imageInfo(kind, state.project);
    var s = { id: MC.uid('s'), kind: kind, x: cell.x, y: cell.y, dir: 0, solid: !!info.solid, scripts: [] };
    state.project.sprites.push(s);
    MC.Sound.play('pop');
    selectSprite(s.id);
    persist();
  }

  function duplicateSprite(s) {
    var copy = MC.clone(s);
    copy.id = MC.uid('s');
    copy.scripts.forEach(function (st) { reId(st.blocks); });
    var cell = freeCell(s);
    copy.x = cell.x;
    copy.y = cell.y;
    state.project.sprites.push(copy);
    MC.Sound.play('pop');
    selectSprite(copy.id);
    persist();
  }

  function removeSprite(s, confirmed) {
    var name = MC.imageInfo(s.kind, state.project).name;
    if (s.scripts.length && !confirmed) {
      askConfirm('Remove the ' + name + '?', 'Its code will be removed too.', '🗑️ Yes, remove it', function () { removeSprite(s, true); });
      return;
    }
    var list = state.project.sprites;
    list.splice(list.indexOf(s), 1);
    MC.Sound.play('drum');
    var next = list.find(function (q) { return q.scripts.length; }) || list[0];
    selectSprite(next ? next.id : null);
    persist();
  }

  /* ---------- picture gallery ---------- */

  function renderGallery() {
    var tabs = $('gallery-tabs');
    var grid = $('gallery');
    tabs.innerHTML = '';
    grid.innerHTML = '';
    var p = state.project;
    var groups = MC.IMAGE_GROUPS.slice();
    if (p.images && p.images.length) groups.push('Mine');
    if (groups.indexOf(state.galleryTab) < 0) state.galleryTab = groups[0];
    groups.forEach(function (g) {
      var t = h('button', 'gallery-tab' + (g === state.galleryTab ? ' active' : ''), g === 'Mine' ? '⭐ Mine' : g);
      t.type = 'button';
      t.addEventListener('click', function () { state.galleryTab = g; renderGallery(); });
      tabs.appendChild(t);
    });
    var items = state.galleryTab === 'Mine'
      ? p.images.map(function (i) { return MC.imageInfo(i.id, p); })
      : MC.IMAGES.filter(function (i) { return i.group === state.galleryTab; });
    items.forEach(function (info) {
      var b = h('button', 'gallery-item');
      b.type = 'button';
      b.title = info.name;
      b.setAttribute('aria-label', 'Add ' + info.name);
      if (info.src) {
        var img = h('img');
        img.src = info.src;
        img.alt = '';
        b.appendChild(img);
      } else {
        b.textContent = info.emoji;
      }
      b.addEventListener('pointerdown', function (e) { startPictureDrag(e, info); });
      grid.appendChild(b);
    });
  }

  function startPictureDrag(e, info) {
    if (isPlaying() || (e.button != null && e.button > 0)) return;
    e.preventDefault();
    var sx = e.clientX;
    var sy = e.clientY;
    var ghost = null;
    var wrap = $('stage-wrap');
    function move(ev) {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ghost = h('div', 'picture-ghost');
        if (info.src) {
          var img = h('img');
          img.src = info.src;
          ghost.appendChild(img);
        } else {
          ghost.textContent = info.emoji;
        }
        document.body.appendChild(ghost);
      }
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      var overStage = !!stage.cellAt(ev.clientX, ev.clientY);
      wrap.classList.toggle('drop-over', overStage);
    }
    function up(ev) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      wrap.classList.remove('drop-over');
      if (!ghost) {
        addSprite(info.id, freeCell()); // a simple tap adds it in the middle
        return;
      }
      ghost.parentNode.removeChild(ghost);
      var cell = ev.type === 'pointerup' ? stage.cellAt(ev.clientX, ev.clientY) : null;
      if (cell) addSprite(info.id, cell);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function addCustomImage(file, cell) {
    if (!file || !/^image\//.test(file.type) || state.mode !== 'maker') return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 96;
        var k = Math.min(1, max / img.width, max / img.height);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var p = state.project;
        var name = (file.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 16) || 'My picture';
        var id = MC.uid('img');
        p.images.push({ id: id, name: name, src: c.toDataURL('image/png') });
        state.galleryTab = 'Mine';
        renderGallery();
        addSprite(id, cell || freeCell());
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- moving pictures around on the stage ---------- */

  var stageDrag = null;
  var canvas = $('stage');

  canvas.addEventListener('pointerdown', function (e) {
    if (state.mode !== 'maker' || isPlaying()) return;
    var cell = stage.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    var here = state.project.sprites.filter(function (s) { return s.x === cell.x && s.y === cell.y; });
    if (!here.length) return;
    here.sort(function (a, b) { return (a.scripts.length ? 1 : 0) - (b.scripts.length ? 1 : 0); });
    var current = here.find(function (s) { return s.id === state.selectedId; });
    var pick = here.length > 1 && current ? here[(here.indexOf(current) + 1) % here.length] : here[here.length - 1];
    if (current && here.length === 1) pick = current;
    if (pick.id !== state.selectedId) selectSprite(pick.id);
    stageDrag = { sprite: pick, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!stageDrag) return;
    var cell = stage.cellAt(e.clientX, e.clientY);
    var s = stageDrag.sprite;
    if (cell && (cell.x !== s.x || cell.y !== s.y)) {
      s.x = cell.x;
      s.y = cell.y;
      stageDrag.moved = true;
    }
  });
  function endStageDrag() {
    if (!stageDrag) return;
    if (stageDrag.moved) persist();
    stageDrag = null;
  }
  canvas.addEventListener('pointerup', endStageDrag);
  canvas.addEventListener('pointercancel', endStageDrag);

  // Drop picture files from the computer straight onto the stage.
  var wrapEl = $('stage-wrap');
  wrapEl.addEventListener('dragover', function (e) {
    if (state.mode !== 'maker') return;
    e.preventDefault();
    wrapEl.classList.add('drop-over');
    $('drop-hint').hidden = false;
  });
  wrapEl.addEventListener('dragleave', function () {
    wrapEl.classList.remove('drop-over');
    $('drop-hint').hidden = true;
  });
  wrapEl.addEventListener('drop', function (e) {
    if (state.mode !== 'maker') return;
    e.preventDefault();
    wrapEl.classList.remove('drop-over');
    $('drop-hint').hidden = true;
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) addCustomImage(file, stage.cellAt(e.clientX, e.clientY));
  });

  /* ---------- running the game ---------- */

  /* ---------- full screen ---------- */

  var playArea = $('play-area');
  var fullOpt = load('fullOnRun', false);

  function isFull() { return playArea.classList.contains('is-full'); }

  function setFullClass(on) {
    playArea.classList.toggle('is-full', on);
    var b = $('btn-full');
    b.textContent = on ? '✕ Exit' : '⛶';
    b.title = on ? 'Exit full screen' : 'Full screen';
    b.setAttribute('aria-label', b.title);
  }

  /** Make the stage fill the screen. Must be called from a click. */
  function enterFull() {
    if (isFull()) return;
    setFullClass(true);
    var req = playArea.requestFullscreen || playArea.webkitRequestFullscreen;
    if (!req) return; // no Fullscreen API (e.g. iPhone): the page-filling class is enough
    try {
      var p = req.call(playArea);
      if (p && p.catch) p.catch(function () { /* blocked: keep the page-filling version */ });
    } catch (e) { /* same */ }
  }

  function exitFull() {
    if (!isFull()) return;
    setFullClass(false);
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        var p = exit.call(document);
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    }
  }

  function onFullscreenChange() {
    // The child pressed Esc (or the browser left full screen by itself).
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) setFullClass(false);
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  function runGame() {
    if (isPlaying()) { stopGame(); return; }
    hideOverlay();
    if (state.mode === 'story' && startBlockCount() === 0) {
      showOverlay({
        icon: '🤔',
        title: 'Momo needs some code!',
        text: 'Drag a block from the left and snap it under “when ▶ Run clicked”.',
        actions: [{ label: 'OK', go: true, fn: hideOverlay }]
      });
      return;
    }
    var engine = new MC.Engine(state.project, {
      speed: state.mode === 'story' ? state.speed : 1,
      hooks: {
        sound: function (n) { MC.Sound.play(n); },
        onEnd: onGameEnd
      }
    });
    state.engine = engine;
    if (fullOpt && !tour.active) enterFull();
    engine.start();
    updateLock();
    updateRunButton();
    $('keypad').hidden = state.mode !== 'maker';
  }

  /** Stop the game. Leaves full screen too (so the code can be changed), unless keepFull. */
  function stopGame(keepFull) {
    if (keepFull !== true) exitFull();
    if (state.engine) state.engine.stop();
    state.engine = null;
    hideOverlay();
    editor.highlight([]);
    updateLock();
    updateRunButton();
    $('keypad').hidden = true;
  }

  function afterRun() {
    editor.highlight([]);
    updateLock();
    updateRunButton();
    $('keypad').hidden = true;
  }

  function updateRunButton() {
    var b = $('btn-run');
    var playing = isPlaying();
    b.textContent = playing ? '■ Stop' : '▶ Run';
    b.classList.toggle('stop', playing);
  }

  function onGameEnd(status, message) {
    var engine = state.engine;
    setTimeout(function () {
      if (state.engine !== engine) return;
      if (state.mode === 'story') {
        if (status === 'win') storyWin();
        else showOverlay({
          icon: '💥', title: 'Oops!', text: message,
          actions: [
            { label: '↺ Try again', go: true, fn: stopGame },
            { label: '💡 Hint', fn: function () { stopGame(); $('story-hint').hidden = false; } }
          ]
        });
      } else {
        showOverlay({
          icon: status === 'win' ? '🏆' : '💥',
          title: status === 'win' ? 'You win!' : 'Game over',
          text: 'Score: ' + engine.score,
          actions: [
            { label: '▶ Play again', go: true, fn: function () { stopGame(true); runGame(); } },
            { label: '✏️ Change my game', fn: stopGame }
          ]
        });
      }
    }, 600);
  }

  function updateHud() {
    var hud = $('hud');
    var e = state.engine;
    var text = '';
    if (state.mode === 'story') {
      var total = state.project.sprites.filter(function (s) { return s.kind === 'banana'; }).length;
      text = '🍌 ' + (e ? e.collected : 0) + ' / ' + total;
    } else if (e) {
      text = '⭐ Score: ' + e.score;
    }
    if (hud.textContent !== text) hud.textContent = text;
    hud.hidden = !text;
  }

  /* ---------- overlay & dialogs ---------- */

  function showOverlay(o) {
    $('overlay-icon').textContent = o.icon || '';
    $('overlay-title').textContent = o.title || '';
    $('overlay-text').textContent = o.text || '';
    var stars = $('overlay-stars');
    stars.innerHTML = '';
    if (o.stars) {
      for (var i = 0; i < 3; i++) stars.appendChild(h('span', i < o.stars ? '' : 'off', '⭐'));
    }
    var actions = $('overlay-actions');
    actions.innerHTML = '';
    (o.actions || []).forEach(function (a) {
      var b = h('button', 'pill' + (a.go ? ' go' : ''), a.label);
      b.type = 'button';
      b.addEventListener('click', a.fn);
      actions.appendChild(b);
    });
    $('overlay').hidden = false;
    var first = actions.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function hideOverlay() { $('overlay').hidden = true; }

  var modalOnClose = null;
  function openModal(build, onClose) {
    var c = $('modal-content');
    c.innerHTML = '';
    build(c);
    modalOnClose = onClose || null;
    $('modal').hidden = false;
  }
  function closeModal() {
    $('modal').hidden = true;
    var cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
  }
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });

  /** A kid-friendly yes/no question (the browser's confirm() box is easy to miss). */
  function askConfirm(title, text, yesLabel, onYes) {
    openModal(function (c) {
      var t = h('h2', null, title);
      t.id = 'modal-title';
      c.appendChild(t);
      c.appendChild(h('p', 'lead', text));
      var row = h('div', 'overlay-actions');
      var yes = h('button', 'pill go', yesLabel);
      yes.type = 'button';
      yes.addEventListener('click', function () { closeModal(); onYes(); });
      row.appendChild(yes);
      if (yesLabel !== 'OK') {
        var no = h('button', 'pill', 'No, keep it');
        no.type = 'button';
        no.addEventListener('click', closeModal);
        row.appendChild(no);
      }
      c.appendChild(row);
    });
  }

  function choice(icon, title, text, onClick) {
    var b = h('button', 'choice');
    b.type = 'button';
    b.appendChild(h('div', 'big', icon));
    b.appendChild(h('b', null, title));
    b.appendChild(h('span', null, text));
    b.addEventListener('click', onClick);
    return b;
  }

  function showWelcome() {
    openModal(function (c) {
      var hero0 = h('div', 'welcome-hero');
      hero0.appendChild(h('div', 'big', '🐒'));
      var t = h('h2', null, 'Welcome to Monkey Coder!');
      t.id = 'modal-title';
      hero0.appendChild(t);
      hero0.appendChild(h('p', 'lead', 'Snap code blocks together like puzzle pieces and make your own games. No typing needed!'));
      c.appendChild(hero0);
      var grid = h('div', 'choice-grid');
      grid.appendChild(choice('📖', 'Story Adventure', 'Help Momo the monkey find bananas by snapping blocks together. 6 chapters!', function () { closeModal(); setMode('story'); }));
      grid.appendChild(choice('🎨', 'Game Maker', 'Drag pictures onto the stage, give them code and make a game to play.', function () { closeModal(); setMode('maker'); }));
      c.appendChild(grid);
    });
  }

  function showTemplates() {
    openModal(function (c) {
      var t = h('h2', null, '✨ Start a new game');
      t.id = 'modal-title';
      c.appendChild(t);
      c.appendChild(h('p', 'lead', 'Pick a story to start from. You can change everything! (Your current game will be replaced, so save it to a file first if you want to keep it.)'));
      var grid = h('div', 'choice-grid');
      MC.TEMPLATES.forEach(function (tp) {
        grid.appendChild(choice(tp.icon, tp.name, tp.blurb, function () {
          state.maker = MC.makeProject(tp.id);
          state.selectedId = null;
          closeModal();
          loadMaker();
          persist();
        }));
      });
      c.appendChild(grid);
    });
  }

  function showHelp() {
    openModal(function (c) {
      var t = h('h2', null, '❓ How to play');
      t.id = 'modal-title';
      c.appendChild(t);
      var ul = h('ul', 'help-list');
      [
        '🧩 Drag blocks from the block box into the code area. Snap them under a yellow “when…” block. Blocks that aren’t attached to one never run.',
        '🗑️ To remove blocks, drag them back to the block box (or onto the bin).',
        '▶ Press Run to start. Blocks light up while they run.',
        '📖 In Story Adventure, get all the bananas. If you use fewer blocks, you get more stars ⭐.',
        '🎨 In Game Maker, drag pictures onto the stage. Click a character to see and change its code.',
        '⌨️ When your game is running, use the arrow keys (or the blue buttons under the stage).',
        '📷 You can also add your own drawings or photos with “Add my own picture”, or drop picture files onto the stage.',
        '💾 Your work is saved in this browser automatically. Use “Save to file” to keep a copy or share it.'
      ].forEach(function (line) { ul.appendChild(h('li', null, line)); });
      c.appendChild(ul);
      var guide = h('button', 'pill', '🧭 Show me how, step by step');
      guide.type = 'button';
      guide.addEventListener('click', startTour);
      c.appendChild(guide);
    });
  }

  /* ---------- guided tour for the very first chapter ---------- */

  var booting = true;
  var tour = new MC.Tour({ onEnd: function () { save('tourDone', true); } });

  function q(sel) { return document.querySelector(sel); }

  function heroHasMove() {
    var h0 = hero();
    return !!h0 && h0.scripts.some(function (st) {
      return st.blocks[0] && st.blocks[0].type === 'on_start' && st.blocks.some(function (b) { return b.type === 'move'; });
    });
  }

  // The "move" block that is snapped under the start block.
  function attachedMove() { return q('#ws-canvas .block.hat ~ .block.cat-motion'); }

  // The square on the stage where a sprite stands.
  function cellRect(sprite) {
    var r = $('stage').getBoundingClientRect();
    var c = r.width / state.project.cols;
    return { x: r.left + sprite.x * c, y: r.top + sprite.y * c, w: c, h: c };
  }

  function dropZone() {
    var hat = q('#ws-canvas .block.hat');
    if (!hat) return null;
    var r = hat.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 2, w: Math.max(r.width, 200), h: 56 };
  }

  function level1Steps() {
    return [
      {
        title: 'Hi! I’m Momo 🐒',
        text: 'This card tells you my story. The green part is your goal 🎯: help me get the banana!',
        holes: function () { return [q('.story-card')]; },
        next: 'Next ▶'
      },
      {
        title: 'This is the stage',
        text: 'Here I am, and there’s the banana 🍌. The little orange arrow shows which way I’m looking.',
        holes: function () { return [$('stage')]; },
        pointAt: function () { return hero() && cellRect(hero()); },
        next: 'Next ▶'
      },
      {
        title: 'Drag the “move” block',
        text: 'Press on the blue “move” block, hold it, and drag it right under “when ▶ Run clicked” until it snaps. Watch my hand!',
        holes: function () { return [q('.palette .block'), dropZone()]; },
        cursor: {
          drag: {
            from: function () { return q('.palette .block'); },
            to: function () { var z = dropZone(); return z && { x: z.x + 36, y: z.y + 27 }; }
          }
        },
        done: heroHasMove
      },
      {
        title: 'How many steps?',
        text: 'Count the squares from me to the banana: 1, 2, 3! Tap the number on the move block and change it to 3.',
        holes: function () { return [attachedMove(), $('stage')]; },
        pointAt: function () { var m = attachedMove(); return m && m.querySelector('input'); },
        done: function () { var m = attachedMove(); var i = m && m.querySelector('input'); return !!i && i.value.trim() === '3'; }
      },
      {
        title: 'Press Run!',
        text: 'Now press ▶ Run and watch what I do.',
        holes: function () { return [$('btn-run')]; },
        done: function () { return !!state.engine; }
      },
      {
        title: 'Watch me go! 👀',
        text: 'Your code is running. The block that is working right now glows yellow.',
        holes: function () { return [$('stage'), q('#ws-canvas .stack')]; },
        pointAt: function () { return hero() && state.engine && cellRect(state.engine.byId.hero); },
        done: function () { return !$('overlay').hidden; }
      },
      {
        title: function () { return won() ? 'You did it! 🎉' : 'So close!'; },
        text: function () {
          return won()
            ? 'Yum! You wrote your first program. Press “Next chapter ▶” whenever you’re ready for the next puzzle.'
            : 'I didn’t reach the banana this time. Press “Try again”, check the number, and run it again. You can do it!';
        },
        holes: function () { return [q('#overlay .overlay-card')]; },
        pointAt: function () { return q('#overlay-actions .go'); },
        next: 'Finish 🎉',
        done: function () { return $('overlay').hidden; }
      }
    ];
  }

  function won() { return !!state.engine && state.engine.status === 'win'; }

  function startTour() {
    if (!$('modal').hidden) closeModal();
    state.levelIndex = 0;
    if (state.mode !== 'story') {
      state.mode = 'story';
      document.body.dataset.mode = 'story';
      document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === 'story'); });
      save('mode', 'story');
    }
    // Start chapter 1 from a clean page so every step makes sense.
    delete state.storyScripts[0];
    save('story', state.storyScripts);
    loadLevel(0);
    tour.start(level1Steps());
  }

  function maybeStartTour() {
    if (booting || tour.active || load('tourDone', false)) return;
    if (state.mode === 'story' && state.levelIndex === 0 && $('modal').hidden) startTour();
  }

  /* ---------- wiring up buttons ---------- */

  document.querySelectorAll('.mode-btn').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  $('btn-home').addEventListener('click', showWelcome);
  $('btn-help').addEventListener('click', showHelp);
  $('btn-run').addEventListener('click', runGame);
  $('btn-reset').addEventListener('click', function () { stopGame(); });
  $('btn-full').addEventListener('click', function () { if (isFull()) exitFull(); else enterFull(); });
  var fullBox = $('opt-full');
  fullBox.checked = fullOpt;
  fullBox.addEventListener('change', function () { fullOpt = fullBox.checked; save('fullOnRun', fullOpt); });
  document.querySelectorAll('#arrange button').forEach(function (b) {
    b.addEventListener('click', function () { if (!editor.locked) editor.arrange(b.dataset.arrange); });
  });
  $('btn-hint').addEventListener('click', function () { $('story-hint').hidden = !$('story-hint').hidden; });
  $('btn-guide').addEventListener('click', startTour);
  $('btn-new').addEventListener('click', showTemplates);

  var soundBtn = $('btn-sound');
  MC.Sound.setMuted(load('muted', false));
  function updateSoundBtn() { soundBtn.textContent = MC.Sound.isMuted() ? '🔇' : '🔊'; }
  updateSoundBtn();
  soundBtn.addEventListener('click', function () {
    MC.Sound.setMuted(!MC.Sound.isMuted());
    save('muted', MC.Sound.isMuted());
    updateSoundBtn();
    MC.Sound.play('pop');
  });

  var speed = $('speed');
  speed.addEventListener('input', function () { state.speed = SPEEDS[+speed.value] || 1; });

  var bgSelect = $('bg-select');
  Object.keys(MC.BACKGROUNDS).forEach(function (k) {
    var o = h('option', null, MC.BACKGROUNDS[k].name);
    o.value = k;
    bgSelect.appendChild(o);
  });
  bgSelect.addEventListener('change', function () { state.maker.background = bgSelect.value; persist(); });
  $('game-title').addEventListener('input', function (e) { state.maker.title = e.target.value; persist(); });
  $('game-story').addEventListener('input', function (e) { state.maker.story = e.target.value; persist(); });

  $('btn-upload').addEventListener('click', function () { $('file-image').click(); });
  $('file-image').addEventListener('change', function (e) {
    addCustomImage(e.target.files[0]);
    e.target.value = '';
  });

  $('btn-export').addEventListener('click', function () {
    var data = JSON.stringify(state.maker, null, 1);
    var blob = new Blob([data], { type: 'application/json' });
    var a = h('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.maker.title || 'my-game').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.monkey.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('btn-import').addEventListener('click', function () { $('file-project').click(); });
  $('file-project').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(function (text) {
      state.maker = MC.repairProject(JSON.parse(text));
      state.selectedId = null;
      loadMaker();
      persist();
    }).catch(function () {
      askConfirm('Oops!', 'That file is not a Monkey Coder game. Game files end in .monkey.json', 'OK', function () {});
    });
  });

  // Keyboard: arrows and space drive the game.
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'space', Spacebar: 'space' };
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(); return; }
    if (e.key === 'Escape' && isFull() && !tour.active) { exitFull(); return; }
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = KEYS[e.key];
    if (k && isPlaying()) {
      e.preventDefault();
      state.engine.keyDown(k);
    }
  });

  // On-screen arrow buttons (for tablets). Holding a button keeps moving.
  document.querySelectorAll('#keypad button').forEach(function (b) {
    var timer = null;
    function press(e) {
      e.preventDefault();
      if (!isPlaying()) return;
      state.engine.keyDown(b.dataset.key);
      clearInterval(timer);
      timer = setInterval(function () { if (isPlaying()) state.engine.keyDown(b.dataset.key); }, 150);
    }
    function release() { clearInterval(timer); timer = null; }
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('pointercancel', release);
  });

  /* ---------- animation loop ---------- */

  var last = performance.now();
  var wasRunning = false;
  function frame(now) {
    var dt = Math.min(50, now - last);
    last = now;
    var e = state.engine;
    if (e && e.status === 'running') {
      e.speed = state.mode === 'story' ? state.speed : 1;
      e.update(dt);
      editor.highlight(e.activeBlockIds());
      if (state.mode === 'story' && e.status === 'running' && e.isFinished()) {
        e.status = 'done';
        storyNotDone(e);
      }
    }
    var running = isPlaying();
    if (wasRunning && !running) afterRun();
    wasRunning = running;
    updateHud();
    try {
      stage.draw({
        project: state.project,
        engine: e,
        selectedId: state.mode === 'maker' ? state.selectedId : null,
        showArrows: true,
        time: now
      });
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */

  var hash = (location.hash || '').replace('#', '');
  var startMode = hash === 'maker' || hash === 'story' ? hash : load('mode', 'story');
  state.levelIndex = Math.min(unlockedUpTo(), MC.LEVELS.length - 1);
  setMode(startMode === 'maker' ? 'maker' : 'story');
  booting = false;
  if (hash !== 'maker' && hash !== 'story') showWelcome();
  else maybeStartTour();
  requestAnimationFrame(frame);

  MC.app = { state: state, tour: tour, startTour: startTour, editor: editor, stage: stage, setMode: setMode, loadLevel: loadLevel, runGame: runGame, stopGame: stopGame };
})(window.MC = window.MC || {});
