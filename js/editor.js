/*
 * The block editor: a palette of blocks on the left and a workspace where kids
 * snap blocks together. Uses Pointer Events so it works with a mouse and on tablets.
 */
(function (MC) {
  'use strict';

  var SNAP_DISTANCE = 34;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function catColor(cat) {
    var c = MC.CATEGORIES.find(function (x) { return x.id === cat; });
    return c ? c.color : '#888';
  }

  function Editor(opts) {
    this.paletteEl = opts.palette;
    this.catsEl = opts.cats;
    this.paletteWrap = opts.paletteWrap || opts.palette;
    this.wsEl = opts.workspace;
    this.canvasEl = opts.canvas;
    this.trashEl = opts.trash;
    this.emptyEl = opts.empty;
    this.onChange = opts.onChange || function () {};
    this.onSound = opts.onSound || function () {};
    this.kindOptions = opts.kindOptions || function () { return []; };
    this.stacks = [];
    this.allowed = null;
    this.locked = false;
    this.press = null;
    this.drag = null;
    this.lastHighlight = '';

    this.indicator = el('div', 'snap-indicator');
    this._onMove = this.onMove.bind(this);
    this._onUp = this.onUp.bind(this);
    this._scrollStep = this.scrollStep.bind(this);
  }

  /* ---------- palette ---------- */

  Editor.prototype.setAllowed = function (types) {
    this.allowed = types;
    this.renderPalette();
  };

  Editor.prototype.renderPalette = function () {
    var self = this;
    var types = this.allowed || MC.BLOCK_ORDER;
    this.paletteEl.innerHTML = '';
    this.catsEl.innerHTML = '';
    MC.CATEGORIES.forEach(function (cat) {
      var list = types.filter(function (t) { return MC.BLOCKS[t] && MC.BLOCKS[t].cat === cat.id; });
      if (!list.length) return;
      var heading = el('div', 'palette-heading', cat.icon + ' ' + cat.name);
      heading.style.color = cat.color;
      self.paletteEl.appendChild(heading);
      var btn = el('button', 'cat-btn');
      btn.type = 'button';
      btn.innerHTML = '<span class="cat-dot"></span>';
      btn.appendChild(document.createTextNode(cat.name));
      btn.firstChild.style.background = cat.color;
      btn.addEventListener('click', function () { heading.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      self.catsEl.appendChild(btn);
      list.forEach(function (type) {
        var b = self.buildBlock(MC.newBlock(type), true);
        b.addEventListener('pointerdown', function (e) { self.startPress(e, { from: 'palette', type: type }, b); });
        var wrap = el('div', 'palette-item');
        wrap.appendChild(b);
        self.paletteEl.appendChild(wrap);
      });
    });
  };

  /* ---------- workspace ---------- */

  Editor.prototype.setStacks = function (stacks) {
    this.stacks = stacks;
    this.render();
  };

  Editor.prototype.setLocked = function (locked) {
    this.locked = locked;
    this.wsEl.classList.toggle('locked', locked);
    this.paletteWrap.classList.toggle('locked', locked);
  };

  Editor.prototype.render = function () {
    var self = this;
    this.canvasEl.innerHTML = '';
    var maxX = 0;
    var maxY = 0;
    this.stacks.forEach(function (st, i) {
      var sEl = el('div', 'stack');
      sEl.dataset.index = i;
      sEl.style.left = st.x + 'px';
      sEl.style.top = st.y + 'px';
      sEl.appendChild(self.buildChain(st.blocks, false));
      self.canvasEl.appendChild(sEl);
      maxX = Math.max(maxX, st.x);
      maxY = Math.max(maxY, st.y);
    });
    this.canvasEl.style.minWidth = (maxX + 500) + 'px';
    this.canvasEl.style.minHeight = (maxY + 400) + 'px';
    if (this.emptyEl) this.emptyEl.hidden = this.stacks.length > 0;
    this.lastHighlight = '';
  };

  var GRID = 22; // the dots in the code area are 22px apart

  function snap(v) { return Math.max(0, Math.round(v / GRID) * GRID); }

  /**
   * Line the scripts up neatly. Keeps the order they already have on the page
   * (top to bottom, then left to right).
   *   column: one under another · row: side by side · grid: fill the width, then wrap
   */
  Editor.prototype.arrange = function (mode) {
    var stackEls = this.canvasEl.querySelectorAll(':scope > .stack');
    var items = this.stacks.map(function (st, i) {
      var e = stackEls[i];
      return { st: st, w: e ? e.offsetWidth : 200, h: e ? e.offsetHeight : 60 };
    });
    items.sort(function (a, b) { return (a.st.y - b.st.y) || (a.st.x - b.st.x); });
    var x = GRID;
    var y = GRID;
    var rowH = 0;
    var maxRight = Math.max(GRID * 12, this.wsEl.clientWidth - GRID);
    items.forEach(function (it) {
      if (mode === 'row') {
        it.st.x = x;
        it.st.y = GRID;
        x = snap(x + it.w + GRID);
      } else if (mode === 'grid') {
        if (x > GRID && x + it.w > maxRight) {
          x = GRID;
          y = snap(y + rowH + GRID);
          rowH = 0;
        }
        it.st.x = x;
        it.st.y = y;
        x = snap(x + it.w + GRID);
        rowH = Math.max(rowH, it.h);
      } else {
        it.st.x = GRID;
        it.st.y = y;
        y = snap(y + it.h + GRID);
      }
    });
    this.render();
    this.onChange();
    this.wsEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  Editor.prototype.tidy = function () { this.arrange('column'); };

  /* ---------- building block elements ---------- */

  /**
   * Draw a list of blocks as a chain. Each block sits under the one before it,
   * or to its right when it has join: 'right'. They still run in list order.
   */
  Editor.prototype.buildChain = function (list, inPalette) {
    var self = this;
    function segment(i) {
      var bEl = self.buildBlock(list[i], inPalette);
      if (i === list.length - 1) return bEl;
      var right = list[i + 1].join === 'right';
      if (right) bEl.classList.add('joins-right');
      var seg = el('div', 'seg ' + (right ? 'seg-right' : 'seg-down'));
      seg.appendChild(bEl);
      seg.appendChild(segment(i + 1));
      return seg;
    }
    var frag = document.createDocumentFragment();
    if (list.length) frag.appendChild(segment(0));
    return frag;
  };

  Editor.prototype.buildBlock = function (block, inPalette) {
    var self = this;
    var def = MC.BLOCKS[block.type];
    var b = el('div', 'block cat-' + def.cat + (def.hat ? ' hat' : '') + (def.c ? ' cblock' : '') + (def.cap ? ' cap' : ''));
    b.style.setProperty('--c', catColor(def.cat));
    b.dataset.id = block.id;
    var row = el('div', 'block-row');
    var icon = el('span', 'block-icon', MC.blockIcon(block));
    icon.setAttribute('aria-hidden', 'true');
    row.appendChild(icon);
    b.title = def.help || '';
    var parts = def.label.split(/(\{\w+\})/);
    parts.forEach(function (part) {
      var m = /^\{(\w+)\}$/.exec(part);
      if (!m) {
        if (part.trim()) row.appendChild(el('span', 'block-text', part.trim()));
        return;
      }
      row.appendChild(self.buildInput(block, m[1], def.args[m[1]], inPalette));
    });
    b.appendChild(row);
    if (def.c) {
      var body = el('div', 'block-body');
      body.appendChild(this.buildChain(block.body || [], inPalette));
      b.appendChild(body);
      b.appendChild(el('div', 'block-foot'));
    }
    if (!inPalette) {
      b.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        self.startPress(e, { from: 'ws', id: block.id }, b);
      });
    }
    return b;
  };

  Editor.prototype.buildInput = function (block, name, argDef, inPalette) {
    var self = this;
    var type = MC.ARG_TYPES[argDef.type];
    var value = block.args[name];
    var input;
    if (type.kind === 'select') {
      input = el('select', 'block-input');
      var options = type.dynamic ? this.kindOptions() : type.options;
      if (!options.some(function (o) { return o.value === value; })) {
        options = options.concat([{ value: value, label: type.dynamic ? MC.kindLabel(value) : value }]);
      }
      options.forEach(function (o) {
        var opt = el('option', null, o.label);
        opt.value = o.value;
        input.appendChild(opt);
      });
      input.value = value;
      input.addEventListener('change', function () {
        block.args[name] = input.value;
        // Some icons follow the setting (turn ↩️ / ↪️).
        var iconEl = input.closest('.block-row') && input.closest('.block-row').querySelector('.block-icon');
        if (iconEl) iconEl.textContent = MC.blockIcon(block);
        self.onChange();
      });
    } else {
      input = el('input', 'block-input');
      if (type.kind === 'number') {
        input.type = 'number';
        input.inputMode = 'decimal';
        if (argDef.min != null) input.min = argDef.min;
        if (argDef.max != null) input.max = argDef.max;
        input.step = argDef.min != null && argDef.min < 1 && argDef.min > 0 ? '0.1' : '1';
      } else {
        input.type = 'text';
        input.maxLength = 40;
      }
      input.value = value;
      var size = function () { input.style.width = Math.max(2, String(input.value).length + 1) + 'ch'; };
      size();
      input.addEventListener('input', size);
      input.addEventListener('change', function () {
        if (type.kind === 'number') {
          var n = parseFloat(input.value);
          if (!isFinite(n)) n = argDef.def;
          if (argDef.min != null) n = Math.max(argDef.min, n);
          if (argDef.max != null) n = Math.min(argDef.max, n);
          input.value = n;
          size();
          block.args[name] = n;
        } else {
          block.args[name] = input.value;
        }
        self.onChange();
      });
      input.addEventListener('keydown', function (e) { e.stopPropagation(); });
    }
    if (inPalette) {
      input.tabIndex = -1;
      input.disabled = true;
    } else {
      input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    }
    return input;
  };

  /** Refresh the "touch / chase" pickers when pictures are added or removed. */
  Editor.prototype.refreshKinds = function () {
    this.render();
    this.renderPalette();
  };

  /* ---------- finding blocks in the scripts ---------- */

  Editor.prototype.find = function (id) {
    function search(list, stack) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (b.id === id) return { list: list, index: i, block: b, stack: stack };
        if (b.body) {
          var r = search(b.body, stack);
          if (r) return r;
        }
      }
      return null;
    }
    for (var s = 0; s < this.stacks.length; s++) {
      var r = search(this.stacks[s].blocks, this.stacks[s]);
      if (r) return r;
    }
    return null;
  };

  /* ---------- dragging ---------- */

  Editor.prototype.startPress = function (e, info, blockEl) {
    if (this.locked || this.drag || (e.button != null && e.button > 0)) return;
    e.preventDefault();
    this.press = { x: e.clientX, y: e.clientY, info: info, el: blockEl };
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  };

  Editor.prototype.onMove = function (e) {
    if (!this.press) return;
    if (!this.drag) {
      if (Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 5) return;
      this.beginDrag();
    }
    this.moveDrag(e);
  };

  Editor.prototype.onUp = function (e) {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    if (this.drag) this.drop(e);
    this.press = null;
  };

  Editor.prototype.beginDrag = function () {
    var p = this.press;
    var rect = p.el.getBoundingClientRect();
    var group;
    var origin = null;
    if (p.info.from === 'palette') {
      group = [MC.newBlock(p.info.type)];
    } else {
      var r = this.find(p.info.id);
      if (!r) { this.press = null; return; }
      var canvasRect = this.canvasEl.getBoundingClientRect();
      origin = { x: rect.left - canvasRect.left, y: rect.top - canvasRect.top };
      group = r.list.splice(r.index);
      delete group[0].join; // it is the start of its own chain now
      if (r.list === r.stack.blocks && r.list.length === 0) {
        this.stacks.splice(this.stacks.indexOf(r.stack), 1);
      }
      this.render();
    }
    var ghost = el('div', 'stack drag-ghost');
    var self = this;
    ghost.appendChild(this.buildChain(group, false));
    document.body.appendChild(ghost);
    this.drag = {
      group: group,
      origin: origin,
      ghost: ghost,
      offX: p.x - rect.left,
      offY: p.y - rect.top,
      height: ghost.offsetHeight,
      target: null
    };
    document.body.classList.add('dragging-blocks');
    this.onSound('pop');
  };

  Editor.prototype.candidates = function () {
    var self = this;
    var d = this.drag;
    var first = MC.BLOCKS[d.group[0].type];
    var last = MC.BLOCKS[d.group[d.group.length - 1].type];
    var list = [];
    if (!first.hat) {
      this.canvasEl.querySelectorAll('.block').forEach(function (bEl) {
        var r = self.find(bEl.dataset.id);
        if (!r) return;
        var def = MC.BLOCKS[r.block.type];
        var rect = bEl.getBoundingClientRect();
        if (!def.cap) {
          list.push({ x: rect.left, y: rect.bottom, kind: 'after', id: r.block.id });
          var row = bEl.querySelector(':scope > .block-row').getBoundingClientRect();
          list.push({ x: rect.right, y: row.top, kind: 'right', id: r.block.id, h: row.height });
        }
        if (def.c) {
          var body = bEl.querySelector(':scope > .block-body').getBoundingClientRect();
          list.push({ x: body.left, y: body.top, kind: 'inside', id: r.block.id });
        }
      });
    }
    if (!last.cap) {
      this.canvasEl.querySelectorAll(':scope > .stack').forEach(function (sEl) {
        var st = self.stacks[+sEl.dataset.index];
        var top = st && st.blocks[0];
        if (!top || MC.BLOCKS[top.type].hat) return;
        var rect = sEl.getBoundingClientRect();
        list.push({ x: rect.left, y: rect.top - d.height, kind: 'top', stack: st });
      });
    }
    return list;
  };

  function over(elem, x, y) {
    if (!elem) return false;
    var r = elem.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** While dragging near an edge of the code area, scroll it so blocks can go anywhere. */
  Editor.prototype.updateAutoScroll = function (e) {
    var r = this.wsEl.getBoundingClientRect();
    var EDGE = 44;
    var speed = function (dist) { return Math.round(Math.min(1, Math.max(0, (EDGE - dist) / EDGE)) * 16); };
    var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    this.scrollV = inside ? {
      x: speed(r.right - e.clientX) - speed(e.clientX - r.left),
      y: speed(r.bottom - e.clientY) - speed(e.clientY - r.top)
    } : { x: 0, y: 0 };
    if ((this.scrollV.x || this.scrollV.y) && !this.scrolling) {
      this.scrolling = true;
      requestAnimationFrame(this._scrollStep);
    }
  };

  Editor.prototype.scrollStep = function () {
    var v = this.scrollV;
    if (!this.drag || !v || (!v.x && !v.y)) { this.scrolling = false; return; }
    var ws = this.wsEl;
    // Make room to keep going right or down.
    if (v.x > 0) this.canvasEl.style.minWidth = Math.max(this.canvasEl.offsetWidth, ws.scrollLeft + ws.clientWidth + 120) + 'px';
    if (v.y > 0) this.canvasEl.style.minHeight = Math.max(this.canvasEl.offsetHeight, ws.scrollTop + ws.clientHeight + 120) + 'px';
    ws.scrollLeft += v.x;
    ws.scrollTop += v.y;
    if (this.lastMove) this.moveDrag(this.lastMove, true);
    requestAnimationFrame(this._scrollStep);
  };

  Editor.prototype.moveDrag = function (e, fromScroll) {
    var d = this.drag;
    if (!d) return;
    this.lastMove = { clientX: e.clientX, clientY: e.clientY };
    if (!fromScroll) this.updateAutoScroll(e);
    var gx = e.clientX - d.offX;
    var gy = e.clientY - d.offY;
    d.ghost.style.left = gx + 'px';
    d.ghost.style.top = gy + 'px';

    var deleting = over(this.paletteWrap, e.clientX, e.clientY) || over(this.trashEl, e.clientX, e.clientY);
    if (this.trashEl) this.trashEl.classList.toggle('active', deleting);
    d.ghost.classList.toggle('deleting', deleting);

    var best = null;
    if (!deleting && over(this.wsEl, e.clientX, e.clientY)) {
      var bestDist = SNAP_DISTANCE;
      this.candidates().forEach(function (c) {
        var dist = Math.hypot(c.x - gx, c.y - gy);
        if (dist < bestDist) { bestDist = dist; best = c; }
      });
    }
    d.target = best;
    if (best) {
      var cr = this.canvasEl.getBoundingClientRect();
      var side = best.kind === 'right';
      this.indicator.classList.toggle('side', side);
      this.indicator.style.left = (best.x - cr.left - (side ? 3 : 0)) + 'px';
      this.indicator.style.top = (best.kind === 'top' ? best.y + d.height - cr.top : best.y - cr.top) - (side ? 0 : 3) + 'px';
      this.indicator.style.height = side ? best.h + 'px' : '';
      if (!this.indicator.parentNode) this.canvasEl.appendChild(this.indicator);
    } else if (this.indicator.parentNode) {
      this.indicator.parentNode.removeChild(this.indicator);
    }
  };

  Editor.prototype.drop = function (e) {
    var d = this.drag;
    this.drag = null;
    this.scrollV = null;
    this.lastMove = null;
    document.body.classList.remove('dragging-blocks');
    if (this.indicator.parentNode) this.indicator.parentNode.removeChild(this.indicator);
    if (this.trashEl) this.trashEl.classList.remove('active');
    var ghostRect = d.ghost.getBoundingClientRect();
    d.ghost.parentNode.removeChild(d.ghost);
    var cr = this.canvasEl.getBoundingClientRect();

    var deleting = over(this.paletteWrap, e.clientX, e.clientY) || over(this.trashEl, e.clientX, e.clientY);
    if (deleting) {
      this.onSound('drum');
    } else if (over(this.wsEl, e.clientX, e.clientY)) {
      var t = d.target;
      if (t && (t.kind === 'after' || t.kind === 'right')) {
        var ra = this.find(t.id);
        if (t.kind === 'right') d.group[0].join = 'right';
        ra.list.splice.apply(ra.list, [ra.index + 1, 0].concat(d.group));
      } else if (t && t.kind === 'inside') {
        var ri = this.find(t.id);
        ri.block.body.unshift.apply(ri.block.body, d.group);
      } else if (t && t.kind === 'top') {
        t.stack.blocks = d.group.concat(t.stack.blocks);
        t.stack.x = snap(ghostRect.left - cr.left);
        t.stack.y = snap(ghostRect.top - cr.top);
      } else {
        // A script dropped on its own lands on the nearest dot, so scripts line up easily.
        this.stacks.push({ x: snap(ghostRect.left - cr.left), y: snap(ghostRect.top - cr.top), blocks: d.group });
      }
      if (t) this.onSound('pop');
    } else if (d.origin) {
      // Dropped somewhere odd: put the blocks back where they came from.
      this.stacks.push({ x: Math.max(0, d.origin.x), y: Math.max(0, d.origin.y), blocks: d.group });
    }
    this.render();
    this.onChange();
  };

  /* ---------- glow on running blocks ---------- */

  Editor.prototype.highlight = function (ids) {
    var key = ids.join(',');
    if (key === this.lastHighlight) return;
    this.lastHighlight = key;
    this.canvasEl.querySelectorAll('.block.running').forEach(function (b) { b.classList.remove('running'); });
    var self = this;
    ids.forEach(function (id) {
      var b = self.canvasEl.querySelector('[data-id="' + id + '"]');
      if (b) b.classList.add('running');
    });
  };

  MC.Editor = Editor;
})(window.MC = window.MC || {});
