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
    customLevels: loadCustomLevels(),
    maker: null,
    project: null,
    selectedId: null,
    engine: null,
    speed: 1,
    galleryTab: 'Heroes'
  };
  if (!state.progress || typeof state.progress.stars !== 'object') state.progress = { stars: {} };

  /** Levels made in Game Maker, saved in this browser. Broken entries are skipped. */
  function loadCustomLevels() {
    var list = load('customLevels', []);
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (lv) { try { out.push(MC.repairCustomLevel(lv)); } catch (e) { /* skip it */ } });
    return out;
  }
  function saveCustomLevels() {
    if (!save('customLevels', state.customLevels)) {
      askConfirm('Could not save', 'This browser is out of space for saved levels. Save your levels to a file, then remove some.', 'OK', function () {});
    }
  }

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

  /** Story Adventure: the 6 built-in chapters, then the levels made in Game Maker. */
  function allLevels() { return MC.LEVELS.concat(state.customLevels); }
  function level() { return allLevels()[state.levelIndex]; }
  /** Where a chapter's stars and code are saved: built-in chapters by number, made ones by id. */
  function levelKey(i) {
    var lv = allLevels()[i];
    return lv && lv.custom ? 'c:' + lv.id : i;
  }
  /** The name of the character the child programs on this chapter. */
  function heroName() {
    var lv = level();
    if (!lv || !lv.custom || !hero()) return 'Momo';
    return MC.imageInfo(hero().kind, state.project).name;
  }
  function heroHasKeys() {
    return !!hero() && hero().scripts.some(function (st) { return st.blocks[0] && st.blocks[0].type === 'on_key'; });
  }
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

  function heroBlockTotal() {
    return hero() ? hero().scripts.reduce(function (n, st) { return n + MC.countBlocks(st.blocks); }, 0) : 0;
  }

  function persist() {
    if (state.mode === 'story') {
      if (hero()) state.storyScripts[levelKey(state.levelIndex)] = hero().scripts;
      save('story', state.storyScripts);
    } else if (state.maker) {
      if (!save('maker', state.maker)) console.warn('Could not save the game in this browser (storage full?).');
    }
  }

  function onCodeChange() {
    // In Story Adventure a finished run stays on the stage while the code is changed,
    // so the child can see where Momo stopped and which way it faces.
    if (!(state.mode === 'story' && state.engine && !isPlaying())) stopGame();
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
    state.levelIndex = Math.max(0, Math.min(allLevels().length - 1, i));
    var lv = level();
    var scripts = null;
    var saved = state.storyScripts[levelKey(state.levelIndex)];
    if (Array.isArray(saved) && saved.length) {
      try { scripts = MC.repairProject({ sprites: [{ kind: 'monkey', scripts: saved }] }).sprites[0].scripts; } catch (e) { scripts = null; }
    }
    scripts = scripts && scripts.length ? scripts : null;
    state.project = lv.custom ? MC.buildCustomLevelProject(lv, scripts) : MC.buildLevelProject(lv, scripts);
    state.selectedId = 'hero';
    stopGame();
    editor.setAllowed(lv.blocks);
    editor.setStacks(hero().scripts);
    var info = MC.imageInfo(hero().kind, state.project);
    $('ws-sprite').textContent = lv.custom ? MC.kindLabel(hero().kind, state.project) : '🐒 Momo';
    $('story-avatar').textContent = lv.custom ? (info.emoji || '🖼️') : '🐒';
    $('ws-empty').textContent = 'Drag blocks from the left and snap them together here 👈';
    $('story-chapter').textContent = 'Chapter ' + (state.levelIndex + 1) + ' of ' + allLevels().length + (lv.custom ? ' · made in Game Maker 🎨' : '');
    $('story-title').textContent = lv.title;
    $('story-body').textContent = lv.story;
    $('story-goal').textContent = lv.goal;
    $('story-hint').textContent = '💡 ' + lv.hint;
    $('story-hint').hidden = true;
    $('btn-hint').hidden = !lv.hint;
    $('btn-guide').hidden = state.levelIndex !== 0;
    renderLevels();
  }

  function renderLevels() {
    var wrap = $('levels');
    wrap.innerHTML = '';
    var maxOpen = unlockedUpTo();
    allLevels().forEach(function (lv, i) {
      var b = h('button', 'level-dot' + (i === state.levelIndex ? ' current' : '') + (lv.custom ? ' custom' : ''));
      b.type = 'button';
      b.title = lv.title + (lv.custom ? ' (made in Game Maker)' : '');
      b.textContent = String(i + 1);
      var stars = state.progress.stars[levelKey(i)] || 0;
      // Built-in chapters open one after another; levels made in Game Maker are always open.
      var locked = !lv.custom && i > maxOpen;
      var small = h('small', null, stars ? '⭐'.repeat(stars) : (locked ? '🔒' : (lv.custom ? '🎨' : '')));
      b.appendChild(small);
      b.disabled = locked;
      b.addEventListener('click', function () { loadLevel(i); });
      wrap.appendChild(b);
    });
  }

  function storyWin() {
    var lv = level();
    var count = startBlockCount();
    var stars = MC.levelStars(lv, count);
    var i = state.levelIndex;
    var key = levelKey(i);
    state.progress.stars[key] = Math.max(state.progress.stars[key] || 0, stars);
    save('progress', state.progress);
    renderLevels();
    var last = i === allLevels().length - 1;
    var actions = last
      ? [{ label: '🎨 Make my own game', go: true, fn: function () { setMode('maker'); } }, { label: '↺ Play again', fn: stopGame }]
      : [{ label: 'Next chapter ▶', go: true, fn: function () { loadLevel(i + 1); } }, { label: '↺ Try again', fn: stopGame }];
    showOverlay({
      icon: last ? '🏆' : (lv.custom ? (MC.imageInfo(hero().kind, state.project).emoji || '🎉') : '🍌'),
      title: last ? 'You finished the story!' : ['Yum!', 'Banana-tastic!', 'You did it!'][i % 3],
      stars: stars,
      text: stars === 3
        ? (last ? 'You are a coding champion! Now invent your own game.' : 'Perfect code! ' + heroName() + ' is happy.')
        : 'You used ' + count + ' blocks. Can you do it with only ' + lv.par + '?' + (lv.blocks.indexOf('repeat') >= 0 ? ' (Try “repeat”!)' : ''),
      actions: actions
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
    if (state.mode === 'story' && heroBlockTotal() === 0) {
      showOverlay({
        icon: '🤔',
        title: heroName() + ' needs some code!',
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
    $('keypad').hidden = !(state.mode === 'maker' || heroHasKeys());
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
            { label: '✏️ Fix my code', go: true, fn: hideOverlay },
            { label: '💡 Hint', fn: function () { hideOverlay(); $('story-hint').hidden = false; } }
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
      var r = state.project.rules || {};
      if (r.collect) {
        var total = state.project.sprites.filter(function (s) { return s.kind === r.collect; }).length;
        text = (MC.imageInfo(r.collect, state.project).emoji || '🖼️') + ' ' + (e ? e.collected : 0) + ' / ' + total;
      } else if (r.reach) {
        text = '🎯 ' + (MC.imageInfo(r.reach, state.project).emoji || '🖼️');
      } else if (e) {
        text = '⭐ Score: ' + e.score;
      }
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
        '💾 Your work is saved in this browser automatically. Use “Save to file” to keep a copy or share it.',
        '🏁 In Game Maker, “Make it a level” turns your game into a puzzle in Story Adventure. You choose who the child programs, how to win and which blocks they get. “My levels” lets you play, edit, reorder or share them.',
        '📲 On an Android phone or tablet, press “Install” at the top (or Chrome’s ⋮ menu → “Install app”) to put Monkey Coder on your home screen. It works without internet too. On an iPhone or iPad: Share → “Add to Home Screen”.'
      ].forEach(function (line) { ul.appendChild(h('li', null, line)); });
      c.appendChild(ul);
      var guide = h('button', 'pill', '🧭 Show me how, step by step');
      guide.type = 'button';
      guide.addEventListener('click', startTour);
      c.appendChild(guide);
    });
  }

  /* ---------- turning a Game Maker game into a Story level ---------- */

  function downloadJSON(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    var a = h('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function safeName(text, fallback) {
    return (text || fallback).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || fallback;
  }

  /** "move {n} steps" → "move … steps" */
  function blockLabel(type) {
    return MC.BLOCKS[type].label.replace(/\{\w+\}/g, '…').replace(/\s+/g, ' ').trim();
  }

  function typesUsed(scripts) {
    var out = [];
    function walk(list) {
      (list || []).forEach(function (b) {
        if (out.indexOf(b.type) < 0) out.push(b.type);
        walk(b.body);
      });
    }
    (scripts || []).forEach(function (st) { walk(st.blocks); });
    return out;
  }

  function hasWinBlock(sprites) {
    return sprites.some(function (s) { return typesUsed(s.scripts).indexOf('win') >= 0; });
  }

  function customIndex(id) {
    for (var i = 0; i < state.customLevels.length; i++) if (state.customLevels[i].id === id) return i;
    return -1;
  }

  /** Open a level made in Game Maker in Story Adventure. */
  function playCustomLevel(id) {
    var j = customIndex(id);
    if (j < 0) return;
    if (!$('modal').hidden) closeModal();
    state.levelIndex = MC.LEVELS.length + j;
    if (state.mode === 'story') loadLevel(state.levelIndex);
    else setMode('story');
  }

  function formField(labelText, control, note) {
    var wrap = h(control.tagName === 'DIV' ? 'div' : 'label', 'form-field');
    wrap.appendChild(h('span', 'form-label', labelText));
    wrap.appendChild(control);
    if (note) wrap.appendChild(h('small', 'form-note', note));
    return wrap;
  }

  function selectOf(options, value, onChange) {
    var sel = h('select', 'form-input');
    options.forEach(function (o) {
      var opt = h('option', null, o.label);
      opt.value = o.value;
      sel.appendChild(opt);
    });
    sel.value = value;
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  function showMakeLevel() {
    var p = state.maker;
    if (!p.sprites.length) {
      askConfirm('Add some characters first', 'Drag pictures onto the stage and give them code, then turn your game into a level.', 'OK', function () {});
      return;
    }
    var existing = p.levelId && customIndex(p.levelId) >= 0 ? state.customLevels[customIndex(p.levelId)] : null;
    var selected = spriteById(state.selectedId);
    var player = (existing && p.sprites.find(function (s) { return s.id === existing.playerId; })) ||
      selected || p.sprites.find(function (s) { return s.scripts.length; }) || p.sprites[0];

    function kindsBesides(playerSprite) {
      var out = [];
      p.sprites.forEach(function (s) { if (s !== playerSprite && s.kind !== playerSprite.kind && out.indexOf(s.kind) < 0) out.push(s.kind); });
      return out;
    }
    function count(kind) { return p.sprites.filter(function (s) { return s.kind === kind; }).length; }

    function guessWin(playerSprite) {
      var kinds = kindsBesides(playerSprite).filter(function (k) {
        var info = MC.imageInfo(k, p);
        return !info.solid && MC.DEFAULT_HAZARDS.indexOf(k) < 0;
      });
      kinds.sort(function (a, b) { return count(b) - count(a); });
      if (kinds.length && count(kinds[0]) >= 2) return { type: 'collect', kind: kinds[0] };
      if (kinds.length) return { type: 'reach', kind: kinds[0] };
      return { type: 'block' };
    }

    function defaultBlocks(playerSprite) {
      var used = typesUsed(playerSprite.scripts).filter(function (t) { return !MC.BLOCKS[t].hat; });
      ['move', 'turn'].forEach(function (t) { if (used.indexOf(t) < 0) used.push(t); });
      return used;
    }

    function startCount(playerSprite) {
      return playerSprite.scripts.reduce(function (n, st) {
        return n + (st.blocks[0] && st.blocks[0].type === 'on_start' ? MC.countBlocks(st.blocks) : 0);
      }, 0);
    }

    var f = {
      title: existing ? existing.title : (p.title || 'My level'),
      story: existing ? existing.story : (p.story || ''),
      hint: existing ? existing.hint : '',
      playerId: player.id,
      start: existing && existing.startScripts && MC.countBlocks(existing.startScripts[0] ? existing.startScripts[0].blocks : []) > 0 ? 'current' : 'empty',
      win: existing ? MC.clone(existing.win) : guessWin(player),
      hazards: existing ? existing.hazards.slice() : kindsBesides(player).filter(function (k) { return MC.DEFAULT_HAZARDS.indexOf(k) >= 0; }),
      blocks: existing ? existing.blocks.slice() : defaultBlocks(player),
      par: existing ? existing.par : (startCount(player) || 5),
      goal: existing ? existing.goal : '',
      goalEdited: !!existing,
      target: existing ? 'update' : 'new'
    };

    openModal(function (c) { renderForm(c); });

    function renderForm(c) {
      c.innerHTML = '';
      c.classList.add('level-form');
      var t = h('h2', null, '🏁 Make it a Story level');
      t.id = 'modal-title';
      c.appendChild(t);
      c.appendChild(h('p', 'lead', 'Your game becomes a puzzle in Story Adventure, after the built-in chapters. The child writes the code for one character; the others keep the code you gave them.'));

      var playerSprite = p.sprites.find(function (s) { return s.id === f.playerId; }) || p.sprites[0];
      var form = h('div', 'form-grid');

      // name & story
      var title = h('input', 'form-input');
      title.maxLength = 40;
      title.value = f.title;
      title.addEventListener('input', function () { f.title = title.value; });
      form.appendChild(formField('Level name', title));

      var story = h('textarea', 'form-input');
      story.rows = 2;
      story.maxLength = 300;
      story.value = f.story;
      story.placeholder = 'Tell the story of this level…';
      story.addEventListener('input', function () { f.story = story.value; });
      form.appendChild(formField('Story', story));

      // the child's character
      form.appendChild(formField('The child programs', selectOf(p.sprites.map(function (s) {
        return { value: s.id, label: MC.kindLabel(s.kind, p) + ' (' + (s.x + 1) + ', ' + (s.y + 1) + ')' + (s.scripts.length ? ' · has code' : '') };
      }), f.playerId, function (v) {
        f.playerId = v;
        var np = p.sprites.find(function (s) { return s.id === v; });
        f.win = guessWin(np);
        f.hazards = kindsBesides(np).filter(function (k) { return MC.DEFAULT_HAZARDS.indexOf(k) >= 0; });
        f.blocks = defaultBlocks(np);
        f.par = startCount(np) || 5;
        renderForm(c);
      }), 'The other characters do what you programmed, but the child can’t see or change their code.'));

      var startRow = h('div', 'radio-row');
      [['empty', 'An empty program (only “when ▶ Run clicked”)'], ['current', 'This character’s code as it is now']].forEach(function (o) {
        var lab = h('label', 'radio');
        var r = h('input');
        r.type = 'radio';
        r.name = 'lvl-start';
        r.value = o[0];
        r.checked = f.start === o[0];
        r.addEventListener('change', function () { f.start = o[0]; });
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(' ' + o[1]));
        startRow.appendChild(lab);
      });
      form.appendChild(formField('The child starts with', startRow));

      // how to win
      var kinds = kindsBesides(playerSprite);
      var winRow = h('div', 'inline-row');
      winRow.appendChild(selectOf([
        { value: 'collect', label: 'Collect every…' },
        { value: 'reach', label: 'Reach the…' },
        { value: 'block', label: 'When a “you win!” block runs in my game' }
      ], f.win.type, function (v) {
        f.win = v === 'block' ? { type: 'block' } : { type: v, kind: f.win.kind || kinds[0] };
        renderForm(c);
      }));
      if (f.win.type !== 'block') {
        if (!f.win.kind || kinds.indexOf(f.win.kind) < 0) f.win.kind = kinds[0];
        if (kinds.length) {
          winRow.appendChild(selectOf(kinds.map(function (k) {
            return { value: k, label: MC.kindLabel(k, p) + (f.win.type === 'collect' ? ' (' + count(k) + ')' : '') };
          }), f.win.kind, function (v) { f.win.kind = v; renderForm(c); }));
        }
      }
      form.appendChild(formField('How to win', winRow));

      // dangers
      var hz = h('div', 'chip-group');
      kinds.filter(function (k) { return !(f.win.kind === k && f.win.type !== 'block'); }).forEach(function (k) {
        var lab = h('label', 'pic-chip');
        var cb = h('input');
        cb.type = 'checkbox';
        cb.checked = f.hazards.indexOf(k) >= 0;
        cb.addEventListener('change', function () {
          f.hazards = f.hazards.filter(function (x) { return x !== k; });
          if (cb.checked) f.hazards.push(k);
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + MC.kindLabel(k, p)));
        hz.appendChild(lab);
      });
      if (!hz.childNodes.length) hz.appendChild(h('span', 'form-note', 'No other pictures on the stage.'));
      form.appendChild(formField('“Oops!” if the character touches', hz));

      // goal & hint
      var goal = h('input', 'form-input');
      goal.maxLength = 80;
      if (!f.goalEdited) f.goal = MC.levelGoalText(f.win, p);
      goal.value = f.goal;
      goal.addEventListener('input', function () { f.goal = goal.value; f.goalEdited = true; });
      form.appendChild(formField('Goal (shown on the story card)', goal));

      var hint = h('input', 'form-input');
      hint.maxLength = 200;
      hint.value = f.hint;
      hint.placeholder = 'Optional: a clue for when the child is stuck';
      hint.addEventListener('input', function () { f.hint = hint.value; });
      form.appendChild(formField('Hint', hint));

      // blocks
      var blocksBox = h('div', 'block-picker');
      MC.CATEGORIES.forEach(function (cat) {
        var types = MC.BLOCK_ORDER.filter(function (t) { return MC.BLOCKS[t].cat === cat.id; });
        var group = h('div', 'picker-group');
        var head = h('div', 'picker-head');
        var name = h('b', null, cat.icon + ' ' + cat.name);
        name.style.color = cat.color;
        head.appendChild(name);
        var all = h('button', 'link-btn', 'all');
        all.type = 'button';
        var none = h('button', 'link-btn', 'none');
        none.type = 'button';
        head.appendChild(all);
        head.appendChild(none);
        group.appendChild(head);
        var boxes = [];
        types.forEach(function (type) {
          var lab = h('label', 'block-chip');
          lab.style.setProperty('--c', cat.color);
          lab.title = MC.BLOCKS[type].help || '';
          var cb = h('input');
          cb.type = 'checkbox';
          cb.checked = f.blocks.indexOf(type) >= 0;
          cb.addEventListener('change', function () {
            f.blocks = f.blocks.filter(function (x) { return x !== type; });
            if (cb.checked) f.blocks.push(type);
          });
          boxes.push(cb);
          lab.appendChild(cb);
          lab.appendChild(h('span', 'chip-icon', MC.blockIcon(MC.newBlock(type))));
          lab.appendChild(h('span', null, blockLabel(type)));
          group.appendChild(lab);
        });
        function setAll(on) {
          boxes.forEach(function (cb) { if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change')); } });
        }
        all.addEventListener('click', function () { setAll(true); });
        none.addEventListener('click', function () { setAll(false); });
        blocksBox.appendChild(group);
      });
      form.appendChild(formField('Blocks the child can use', blocksBox, '“when ▶ Run clicked” is already in the child’s code area.'));

      // stars
      var par = h('input', 'form-input narrow');
      par.type = 'number';
      par.min = 1;
      par.max = 99;
      par.value = f.par;
      par.addEventListener('input', function () { f.par = parseInt(par.value, 10) || 1; });
      var parRow = h('div', 'inline-row');
      parRow.appendChild(document.createTextNode('3 ⭐ when the code uses at most '));
      parRow.appendChild(par);
      parRow.appendChild(document.createTextNode(' blocks'));
      form.appendChild(formField('Stars', parRow));

      if (existing) {
        var tg = h('div', 'radio-row');
        [['update', 'Update “' + existing.title + '” (chapter ' + (MC.LEVELS.length + customIndex(existing.id) + 1) + ')'], ['new', 'Add it as a new level']].forEach(function (o) {
          var lab = h('label', 'radio');
          var r = h('input');
          r.type = 'radio';
          r.name = 'lvl-target';
          r.checked = f.target === o[0];
          r.addEventListener('change', function () { f.target = o[0]; });
          lab.appendChild(r);
          lab.appendChild(document.createTextNode(' ' + o[1]));
          tg.appendChild(lab);
        });
        form.appendChild(formField('This game is already a level', tg));
      }

      c.appendChild(form);
      var err = h('p', 'form-error');
      err.hidden = true;
      c.appendChild(err);

      var actions = h('div', 'overlay-actions');
      var saveBtn = h('button', 'pill go', existing && f.target === 'update' ? '🏁 Save level' : '🏁 Add to Story Adventure');
      saveBtn.type = 'button';
      saveBtn.addEventListener('click', function () {
        var problem = checkForm(playerSprite);
        if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); return; }
        saveLevel(playerSprite);
      });
      var cancel = h('button', 'pill', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', closeModal);
      actions.appendChild(saveBtn);
      actions.appendChild(cancel);
      c.appendChild(actions);
    }

    function checkForm(playerSprite) {
      if (!f.title.trim()) return 'Give the level a name.';
      if (f.win.type !== 'block' && !f.win.kind) return 'Pick what the child has to collect or reach.';
      if (!f.blocks.length) return 'Choose at least one block for the child.';
      if (f.win.type === 'block') {
        var others = p.sprites.filter(function (s) { return s !== playerSprite; });
        if (!hasWinBlock(others) && !(f.start === 'current' && hasWinBlock([playerSprite]))) {
          return 'Nothing in your game has a “you win!” block, so this level could never be won. Pick another way to win, or add a “you win!” block.';
        }
      }
      return '';
    }

    function saveLevel(playerSprite) {
      var update = existing && f.target === 'update';
      var raw = {
        id: update ? existing.id : MC.uid('lv'),
        title: f.title.trim(),
        story: f.story.trim(),
        goal: f.goal.trim(),
        hint: f.hint.trim(),
        blocks: MC.BLOCK_ORDER.filter(function (t) { return f.blocks.indexOf(t) >= 0; }),
        par: f.par,
        playerId: playerSprite.id,
        startScripts: f.start === 'current' ? MC.clone(playerSprite.scripts) : [MC.S(24, 24, [{ type: 'on_start', args: {} }])],
        win: f.win,
        hazards: f.hazards,
        project: MC.clone(p)
      };
      delete raw.project.levelId;
      var lv;
      try { lv = MC.repairCustomLevel(raw); } catch (e) { return; }
      if (update) {
        state.customLevels[customIndex(lv.id)] = lv;
        delete state.storyScripts['c:' + lv.id]; // the level changed: start from its new starting code
        save('story', state.storyScripts);
      } else {
        state.customLevels.push(lv);
      }
      saveCustomLevels();
      p.levelId = lv.id;
      persist();
      MC.Sound.play('win');
      var chapter = MC.LEVELS.length + customIndex(lv.id) + 1;
      openModal(function (c) {
        c.classList.remove('level-form');
        var t = h('h2', null, '🎉 “' + lv.title + '” is ready!');
        t.id = 'modal-title';
        c.appendChild(t);
        c.appendChild(h('p', 'lead', 'It is chapter ' + chapter + ' in Story Adventure. Children see it after the built-in chapters, and it is always open.'));
        var row = h('div', 'overlay-actions');
        var play = h('button', 'pill go', '▶ Play it now');
        play.type = 'button';
        play.addEventListener('click', function () { playCustomLevel(lv.id); });
        var keep = h('button', 'pill', '🎨 Keep editing');
        keep.type = 'button';
        keep.addEventListener('click', closeModal);
        row.appendChild(play);
        row.appendChild(keep);
        c.appendChild(row);
      });
    }
  }

  /* ---------- the list of levels made in Game Maker ---------- */

  function showMyLevels() {
    openModal(function (c) { renderList(c); });

    function renderList(c) {
      c.innerHTML = '';
      c.classList.remove('level-form');
      var t = h('h2', null, '📚 My levels');
      t.id = 'modal-title';
      c.appendChild(t);
      c.appendChild(h('p', 'lead', 'Levels you made in Game Maker. They come after the ' + MC.LEVELS.length + ' built-in chapters in Story Adventure, in this order.'));
      var list = h('div', 'my-levels');
      if (!state.customLevels.length) {
        list.appendChild(h('p', 'empty-note', 'No levels yet. Build a game in Game Maker, then press “🏁 Make it a level”.'));
      }
      state.customLevels.forEach(function (lv, j) {
        var row = h('div', 'my-level');
        var player = lv.project.sprites.find(function (s) { return s.id === lv.playerId; });
        var info = MC.imageInfo(player.kind, lv.project);
        row.appendChild(h('span', 'my-level-icon', info.emoji || '🖼️'));
        var text = h('div', 'my-level-text');
        text.appendChild(h('b', null, lv.title));
        var stars = state.progress.stars['c:' + lv.id] || 0;
        text.appendChild(h('small', null, 'Chapter ' + (MC.LEVELS.length + j + 1) + ' · ' + lv.goal + (stars ? ' · ' + '⭐'.repeat(stars) : '')));
        row.appendChild(text);
        var tools = h('div', 'my-level-tools');
        function tool(label, title, fn, disabled) {
          var b = h('button', 'pill small', label);
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.disabled = !!disabled;
          b.addEventListener('click', fn);
          tools.appendChild(b);
        }
        tool('▶', 'Play “' + lv.title + '”', function () { playCustomLevel(lv.id); });
        tool('✏️', 'Edit “' + lv.title + '” in Game Maker', function () { editLevel(lv); });
        tool('▲', 'Move up', function () { moveLevel(j, -1); renderList(c); }, j === 0);
        tool('▼', 'Move down', function () { moveLevel(j, 1); renderList(c); }, j === state.customLevels.length - 1);
        tool('🗑️', 'Delete “' + lv.title + '”', function () {
          askConfirm('Delete “' + lv.title + '”?', 'It disappears from Story Adventure in this browser. Save your levels to a file first if you might want it back.', '🗑️ Yes, delete it', function () {
            deleteLevel(lv.id);
            showMyLevels();
          });
        });
        row.appendChild(tools);
        list.appendChild(row);
      });
      c.appendChild(list);

      var files = h('div', 'overlay-actions');
      var exp = h('button', 'pill', '💾 Save levels to a file');
      exp.type = 'button';
      exp.disabled = !state.customLevels.length;
      exp.addEventListener('click', function () {
        downloadJSON('my-levels.monkey-levels.json', { format: 'monkey-coder-levels', version: 1, levels: state.customLevels });
      });
      var imp = h('button', 'pill', '📂 Add levels from a file');
      imp.type = 'button';
      imp.addEventListener('click', function () { $('file-levels').click(); });
      files.appendChild(exp);
      files.appendChild(imp);
      c.appendChild(files);
      c.appendChild(h('p', 'form-note', 'Levels are kept in this browser. To put them on another device, such as a child’s tablet, save them to a file and open that file there with “Add levels from a file”.'));
    }
  }

  function currentLevelKey() { return state.mode === 'story' ? levelKey(state.levelIndex) : null; }

  function reloadStoryAt(key) {
    if (state.mode !== 'story') return;
    var idx = 0;
    allLevels().forEach(function (lv, i) { if (levelKey(i) === key) idx = i; });
    loadLevel(key == null ? Math.min(state.levelIndex, allLevels().length - 1) : idx);
  }

  function moveLevel(j, delta) {
    var k = j + delta;
    if (k < 0 || k >= state.customLevels.length) return;
    var key = currentLevelKey();
    var tmp = state.customLevels[j];
    state.customLevels[j] = state.customLevels[k];
    state.customLevels[k] = tmp;
    saveCustomLevels();
    reloadStoryAt(key);
  }

  function deleteLevel(id) {
    var j = customIndex(id);
    if (j < 0) return;
    var key = currentLevelKey();
    state.customLevels.splice(j, 1);
    delete state.progress.stars['c:' + id];
    delete state.storyScripts['c:' + id];
    save('progress', state.progress);
    save('story', state.storyScripts);
    saveCustomLevels();
    if (state.maker && state.maker.levelId === id) { delete state.maker.levelId; save('maker', state.maker); }
    reloadStoryAt(key === 'c:' + id ? null : key);
  }

  function editLevel(lv) {
    function open() {
      state.maker = MC.repairProject(MC.clone(lv.project));
      state.maker.levelId = lv.id;
      state.selectedId = lv.playerId;
      closeModal();
      setMode('maker');
      persist();
    }
    if (state.maker && state.maker.levelId === lv.id) { closeModal(); setMode('maker'); return; }
    askConfirm('Open “' + lv.title + '” in Game Maker?', 'Your current Game Maker game' + (state.maker && state.maker.title ? ' “' + state.maker.title + '”' : '') + ' will be replaced. Save it to a file first if you want to keep it. When you are done, press “🏁 Make it a level” to update the level.', '✏️ Open it', open);
  }

  function importLevels(text) {
    var data = JSON.parse(text);
    var list = data && Array.isArray(data.levels) ? data.levels : (data && data.project ? [data] : null);
    if (!list) throw new Error('not levels');
    var added = 0;
    var updated = 0;
    list.forEach(function (raw) {
      var lv;
      try { lv = MC.repairCustomLevel(raw); } catch (e) { return; }
      var j = customIndex(lv.id);
      if (j >= 0) { state.customLevels[j] = lv; updated++; } else { state.customLevels.push(lv); added++; }
    });
    if (!added && !updated) throw new Error('no usable levels');
    saveCustomLevels();
    reloadStoryAt(currentLevelKey());
    return { added: added, updated: updated };
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
        done: function () { return !$('overlay').hidden || (!!state.engine && state.engine.status !== 'running'); }
      },
      {
        title: function () { return won() ? 'You did it! 🎉' : 'So close!'; },
        text: function () {
          return won()
            ? 'Yum! You wrote your first program. Press “Next chapter ▶” whenever you’re ready for the next puzzle.'
            : 'I stopped here, before the banana. Count the squares that are left, fix the number, and press ▶ Run again. You can do it!';
        },
        holes: function () { return won() ? [q('#overlay .overlay-card')] : [$('stage'), attachedMove()]; },
        pointAt: function () { return won() ? q('#overlay-actions .go') : (state.engine && cellRect(state.engine.byId.hero)); },
        next: 'Finish 🎉',
        done: function () { return won() && $('overlay').hidden; }
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
    downloadJSON(safeName(state.maker.title, 'my-game') + '.monkey.json', state.maker);
  });
  $('btn-make-level').addEventListener('click', showMakeLevel);
  $('btn-my-levels').addEventListener('click', showMyLevels);
  $('file-levels').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(function (text) {
      var r = importLevels(text);
      var parts = [];
      if (r.added) parts.push(r.added + ' new level' + (r.added === 1 ? '' : 's'));
      if (r.updated) parts.push(r.updated + ' updated');
      askConfirm('📂 Levels added', parts.join(', ') + '. You’ll find them in Story Adventure after the built-in chapters.', 'OK', showMyLevels);
    }).catch(function () {
      askConfirm('Oops!', 'That file doesn’t contain Monkey Coder levels. Level files end in .monkey-levels.json', 'OK', function () {});
    });
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

  /* ---------- install as an app (PWA) ---------- */

  var installPrompt = null;
  var installBtn = $('btn-install');

  function runningAsApp() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  // Chrome on Android (and desktop) tells us when the game can be installed.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = runningAsApp();
  });
  installBtn.addEventListener('click', function () {
    if (!installPrompt) return;
    var p = installPrompt;
    installPrompt = null;
    installBtn.hidden = true;
    p.prompt();
  });
  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    installBtn.hidden = true;
    MC.Sound.play('win');
  });

  // Keep a copy of the game on the device so the installed app works offline.
  // Only on a real website: not when opened as a file or inside the Windows app.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* the game works without it */ });
    });
  }

  /** After a Story run, a faint Momo marks the start square, where ▶ Run begins again. */
  function startGhosts(e) {
    if (state.mode !== 'story' || !e || e.status === 'running') return null;
    var start = hero();
    var now = e.byId.hero;
    if (!start || !now || (start.x === now.x && start.y === now.y)) return null;
    return [{ kind: start.kind, x: start.x, y: start.y }];
  }

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
      if (state.mode === 'story' && e.status === 'running' && e.heroDone()) {
        // The code ran out before all the bananas were found: Momo just stays where it
        // stopped (no message), and ▶ Run tries again from the start.
        e.status = 'done';
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
        ghosts: startGhosts(e),
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
