/*
 * The engine runs the kids' block programs.
 * Every script is a JavaScript generator ("thread"); a thread yields a number of
 * milliseconds to wait, so many characters can move at the same time.
 * The engine has no DOM code, so it can also be tested with Node.
 */
(function (MC) {
  'use strict';

  var DIRS = [
    { name: 'right', dx: 1, dy: 0 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
    { name: 'up', dx: 0, dy: -1 }
  ];
  var DIR_INDEX = { right: 0, down: 1, left: 2, up: 3 };
  var SPEEDS = { slow: 0.5, normal: 1, fast: 2 };

  MC.DIRS = DIRS;
  MC.dirIndex = function (name) { return DIR_INDEX[name] !== undefined ? DIR_INDEX[name] : 0; };

  var STEP_MS = 320;

  function num(v, def) {
    var n = parseFloat(v);
    return isFinite(n) ? n : def;
  }

  function Engine(project, opts) {
    opts = opts || {};
    this.project = project;
    this.cols = project.cols || 10;
    this.rows = project.rows || 7;
    this.rules = project.rules || null; // Story-mode rules (hero, collect, hazards)
    this.hooks = opts.hooks || {};
    this.speed = opts.speed || 1; // global speed multiplier (story speed slider)
    this.random = opts.random || Math.random;
    this.time = 0;
    this.score = 0;
    this.collected = 0;
    this.status = 'ready';
    this.message = '';
    this.threads = [];
    this.timers = [];
    this.effects = [];

    var self = this;
    this.sprites = project.sprites.map(function (s) {
      return {
        id: s.id,
        kind: s.kind,
        x: s.x,
        y: s.y,
        dir: s.dir || 0,
        solid: !!s.solid,
        visible: s.hidden ? false : true,
        speed: 1,
        scripts: MC.clone(s.scripts || []),
        anim: null,
        say: null,
        sayUntil: 0
      };
    });
    this.byId = {};
    this.sprites.forEach(function (s) { self.byId[s.id] = s; });
  }

  Engine.prototype.sound = function (name) {
    if (this.hooks.sound) this.hooks.sound(name);
  };

  Engine.prototype.effect = function (type, x, y, text) {
    this.effects.push({ type: type, x: x, y: y, text: text, t0: this.time, dur: 800 });
  };

  /* ---------- starting and stopping ---------- */

  Engine.prototype.start = function () {
    var self = this;
    this.status = 'running';
    this.sprites.forEach(function (s) {
      s.scripts.forEach(function (st) {
        var hat = st.blocks[0];
        if (!hat) return;
        if (hat.type === 'on_start') self.startThread(s, st, {});
        if (hat.type === 'on_timer') {
          var every = Math.max(200, num(hat.args.n, 1) * 1000);
          self.timers.push({ sprite: s, stack: st, every: every, next: every });
        }
      });
    });
  };

  Engine.prototype.stop = function () {
    if (this.status === 'running') this.status = 'stopped';
    this.threads = [];
  };

  Engine.prototype.end = function (status, message) {
    if (this.status !== 'running') return;
    this.status = status;
    this.message = message || '';
    this.threads = [];
    this.sound(status === 'win' ? 'win' : 'lose');
    if (this.hooks.onEnd) this.hooks.onEnd(status, this.message);
  };

  Engine.prototype.startThread = function (sprite, stack, ctx) {
    for (var i = 0; i < this.threads.length; i++) {
      var t = this.threads[i];
      if (t.stack === stack && t.sprite === sprite && !t.dead) return null; // already running
    }
    var c = { sprite: sprite, touched: ctx.touched || null, thread: null };
    var thread = { sprite: sprite, stack: stack, wakeAt: this.time, dead: false, current: null };
    c.thread = thread;
    thread.gen = this.runList(stack.blocks.slice(1), c);
    this.threads.push(thread);
    return thread;
  };

  Engine.prototype.startHats = function (sprite, type, match, ctx) {
    if (!sprite.visible && type === 'on_touch') return;
    var self = this;
    sprite.scripts.forEach(function (st) {
      var hat = st.blocks[0];
      if (hat && hat.type === type && match(hat)) self.startThread(sprite, st, ctx || {});
    });
  };

  /** A key was pressed (arrow keys, space or the on-screen buttons). */
  Engine.prototype.keyDown = function (key) {
    if (this.status !== 'running') return;
    var self = this;
    this.sprites.forEach(function (s) {
      self.startHats(s, 'on_key', function (h) { return h.args.key === key; });
    });
  };

  /* ---------- the main loop ---------- */

  Engine.prototype.update = function (dt) {
    if (this.status !== 'running') return;
    this.time += dt;
    var self = this;

    this.timers.forEach(function (tm) {
      if (self.time >= tm.next) {
        tm.next += tm.every;
        self.startThread(tm.sprite, tm.stack, {});
      }
    });

    var list = this.threads.slice();
    for (var i = 0; i < list.length && this.status === 'running'; i++) {
      var th = list[i];
      var guard = 0;
      while (!th.dead && this.time >= th.wakeAt && this.status === 'running') {
        var r = th.gen.next();
        if (r.done) { th.dead = true; break; }
        var wait = num(r.value, 0);
        th.wakeAt = this.time + wait;
        if (wait <= 0 || ++guard > 50) break; // yield to the next frame
      }
    }
    this.threads = this.threads.filter(function (t) { return !t.dead; });

    var now = this.time;
    this.effects = this.effects.filter(function (e) { return now - e.t0 < e.dur; });
  };

  /** True when nothing is running and nothing can start by itself any more. */
  Engine.prototype.isFinished = function () {
    if (this.status !== 'running') return true;
    if (this.threads.length > 0 || this.timers.length > 0) return false;
    var hasKeys = this.sprites.some(function (s) {
      return s.scripts.some(function (st) { return st.blocks[0] && (st.blocks[0].type === 'on_key' || st.blocks[0].type === 'on_touch'); });
    });
    return !hasKeys;
  };

  /** Block ids that are running right now (to make them glow in the editor). */
  Engine.prototype.activeBlockIds = function () {
    var ids = [];
    this.threads.forEach(function (t) { if (t.current) ids.push(t.current); });
    return ids;
  };

  /* ---------- the world ---------- */

  Engine.prototype.spritesAt = function (x, y, except) {
    return this.sprites.filter(function (s) { return s !== except && s.visible && s.x === x && s.y === y; });
  };

  Engine.prototype.inside = function (x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  };

  Engine.prototype.canEnter = function (sprite, x, y) {
    if (!this.inside(x, y)) return false;
    return !this.spritesAt(x, y, sprite).some(function (o) { return o.solid; });
  };

  Engine.prototype.nearest = function (sprite, kind) {
    var best = null;
    var bestD = Infinity;
    this.sprites.forEach(function (o) {
      if (o === sprite || !o.visible || o.kind !== kind) return;
      var d = Math.abs(o.x - sprite.x) + Math.abs(o.y - sprite.y);
      if (d < bestD) { bestD = d; best = o; }
    });
    return best;
  };

  Engine.prototype.touching = function (sprite, kind) {
    var here = this.spritesAt(sprite.x, sprite.y, sprite);
    for (var i = 0; i < here.length; i++) if (here[i].kind === kind) return here[i];
    return null;
  };

  Engine.prototype.dur = function (sprite, ms) {
    return ms / (this.speed * (sprite ? sprite.speed : 1));
  };

  /** Called whenever a sprite lands on a square. */
  Engine.prototype.arrived = function (s) {
    var self = this;
    var r = this.rules;
    var others = this.spritesAt(s.x, s.y, s);
    if (r && s.kind === r.hero) {
      others.forEach(function (o) {
        if (self.status !== 'running') return;
        if (o.kind === r.collect && o.visible) {
          o.visible = false;
          self.collected += 1;
          self.effect('sparkle', o.x, o.y);
          self.sound('coin');
          var left = self.sprites.some(function (q) { return q.kind === r.collect && q.visible; });
          if (!left) self.end('win');
        } else if (r.hazards && r.hazards.indexOf(o.kind) >= 0) {
          self.effect('boom', o.x, o.y);
          self.end('lose', (r.hazardText && r.hazardText[o.kind]) || 'Oh no! Try again.');
        }
      });
    }
    if (this.status !== 'running') return;
    this.spritesAt(s.x, s.y, s).forEach(function (o) {
      self.startHats(s, 'on_touch', function (h) { return h.args.kind === o.kind; }, { touched: o });
      self.startHats(o, 'on_touch', function (h) { return h.args.kind === s.kind; }, { touched: s });
    });
  };

  /* ---------- movement helpers (generators) ---------- */

  Engine.prototype.moveTo = function* (s, nx, ny, kind) {
    var ms = this.dur(s, kind === 'jump' ? 480 : STEP_MS);
    s.anim = { type: kind || 'walk', fx: s.x, fy: s.y, tx: nx, ty: ny, t0: this.time, dur: ms };
    yield ms;
    s.x = nx;
    s.y = ny;
    s.anim = null;
    this.arrived(s);
  };

  Engine.prototype.bump = function* (s, dx, dy) {
    var ms = this.dur(s, 260);
    s.anim = { type: 'bump', dx: dx, dy: dy, t0: this.time, dur: ms };
    this.sound('bump');
    yield ms;
    s.anim = null;
  };

  Engine.prototype.stepOnce = function* (s, dx, dy) {
    var nx = s.x + dx;
    var ny = s.y + dy;
    if (!this.canEnter(s, nx, ny)) { yield* this.bump(s, dx, dy); return false; }
    yield* this.moveTo(s, nx, ny, 'walk');
    return true;
  };

  /* ---------- running blocks ---------- */

  Engine.prototype.runList = function* (list, ctx) {
    for (var i = 0; i < list.length; i++) {
      if (this.status !== 'running' || ctx.thread.dead) return;
      yield* this.runBlock(list[i], ctx);
    }
  };

  Engine.prototype.runBlock = function* (b, ctx) {
    var s = ctx.sprite;
    var a = b.args || {};
    var self = this;
    var i, n, d, target;
    ctx.thread.current = b.id;

    switch (b.type) {
      case 'move':
        n = Math.max(0, Math.round(num(a.n, 1)));
        for (i = 0; i < n && this.status === 'running'; i++) {
          d = DIRS[s.dir];
          yield* this.stepOnce(s, d.dx, d.dy);
        }
        break;

      case 'turn':
        s.dir = (s.dir + (a.dir === 'right' ? 1 : 3)) % 4;
        yield this.dur(s, 160);
        break;

      case 'step':
        s.dir = MC.dirIndex(a.dir);
        n = Math.max(0, Math.round(num(a.n, 1)));
        for (i = 0; i < n && this.status === 'running'; i++) {
          d = DIRS[s.dir];
          yield* this.stepOnce(s, d.dx, d.dy);
        }
        break;

      case 'jump':
        d = DIRS[s.dir];
        if (this.canEnter(s, s.x + d.dx * 2, s.y + d.dy * 2)) {
          this.sound('jump');
          yield* this.moveTo(s, s.x + d.dx * 2, s.y + d.dy * 2, 'jump');
        } else {
          yield* this.bump(s, d.dx, d.dy);
        }
        break;

      case 'chase':
        target = this.nearest(s, a.kind);
        if (!target) { yield this.dur(s, STEP_MS); break; }
        var ddx = target.x - s.x;
        var ddy = target.y - s.y;
        var tries = [];
        var hx = { dx: Math.sign(ddx), dy: 0 };
        var vy = { dx: 0, dy: Math.sign(ddy) };
        if (Math.abs(ddx) >= Math.abs(ddy)) { tries.push(hx, vy); } else { tries.push(vy, hx); }
        tries = tries.filter(function (t) { return t.dx || t.dy; });
        var moved = false;
        for (i = 0; i < tries.length; i++) {
          if (this.canEnter(s, s.x + tries[i].dx, s.y + tries[i].dy)) {
            s.dir = DIRS.findIndex(function (q) { return q.dx === tries[i].dx && q.dy === tries[i].dy; });
            yield* this.moveTo(s, s.x + tries[i].dx, s.y + tries[i].dy, 'walk');
            moved = true;
            break;
          }
        }
        if (!moved) yield this.dur(s, STEP_MS);
        break;

      case 'wander':
        var open = DIRS.map(function (q, idx) { return idx; }).filter(function (idx) {
          return self.canEnter(s, s.x + DIRS[idx].dx, s.y + DIRS[idx].dy);
        });
        if (!open.length) { yield this.dur(s, STEP_MS); break; }
        s.dir = open[Math.floor(this.random() * open.length)];
        yield* this.moveTo(s, s.x + DIRS[s.dir].dx, s.y + DIRS[s.dir].dy, 'walk');
        break;

      case 'goto_random':
        var empty = [];
        for (var yy = 0; yy < this.rows; yy++) {
          for (var xx = 0; xx < this.cols; xx++) {
            if (this.spritesAt(xx, yy, s).length === 0) empty.push({ x: xx, y: yy });
          }
        }
        if (empty.length) {
          var spot = empty[Math.floor(this.random() * empty.length)];
          this.effect('poof', s.x, s.y);
          s.x = spot.x;
          s.y = spot.y;
          this.effect('poof', s.x, s.y);
          this.sound('boing');
          this.arrived(s);
        }
        yield this.dur(s, 300);
        break;

      case 'speed':
        s.speed = SPEEDS[a.speed] || 1;
        break;

      case 'say':
        s.say = String(a.text == null ? '' : a.text).slice(0, 60);
        s.sayUntil = this.time + 2200;
        yield 900;
        break;

      case 'hide':
        s.visible = false;
        break;

      case 'show':
        s.visible = true;
        this.arrived(s);
        break;

      case 'spin':
        s.anim = { type: 'spin', t0: this.time, dur: 500 };
        yield 500;
        s.anim = null;
        break;

      case 'repeat':
        n = Math.max(0, Math.round(num(a.n, 1)));
        for (i = 0; i < n && this.status === 'running'; i++) {
          yield* this.runList(b.body || [], ctx);
          ctx.thread.current = b.id;
        }
        break;

      case 'forever':
        while (this.status === 'running' && !ctx.thread.dead) {
          yield* this.runList(b.body || [], ctx);
          ctx.thread.current = b.id;
          yield 0; // let everybody else have a turn
        }
        break;

      case 'wait':
        yield Math.max(0, num(a.n, 1)) * 1000;
        break;

      case 'if_touching':
        target = this.touching(s, a.kind);
        if (target) {
          var inner = { sprite: s, touched: target, thread: ctx.thread };
          yield* this.runList(b.body || [], inner);
        }
        break;

      case 'if_score':
        if (this.score >= num(a.n, 0)) yield* this.runList(b.body || [], ctx);
        break;

      case 'collect':
        target = ctx.touched;
        if (target && target.visible) {
          target.visible = false;
          this.effect('sparkle', target.x, target.y);
        }
        break;

      case 'score':
        n = Math.round(num(a.n, 1));
        this.score += n;
        this.effect('text', s.x, s.y, (n >= 0 ? '+' : '') + n);
        if (this.hooks.onScore) this.hooks.onScore(this.score);
        break;

      case 'sound':
        this.sound(a.sound);
        break;

      case 'win':
        this.end('win', 'You win!');
        break;

      case 'lose':
        this.end('lose', 'Game over!');
        break;

      default:
        break; // hats and unknown blocks do nothing
    }
  };

  /* ---------- drawing helpers ---------- */

  /** Where to draw a sprite right now (in grid units, may be between squares). */
  Engine.prototype.renderState = function (s) {
    var st = { x: s.x, y: s.y, lift: 0, rot: 0, scale: 1 };
    var an = s.anim;
    if (!an) return st;
    var t = Math.min(1, Math.max(0, (this.time - an.t0) / (an.dur || 1)));
    if (an.type === 'walk' || an.type === 'jump') {
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      st.x = an.fx + (an.tx - an.fx) * e;
      st.y = an.fy + (an.ty - an.fy) * e;
      st.lift = Math.sin(Math.PI * t) * (an.type === 'jump' ? 0.9 : 0.12);
    } else if (an.type === 'bump') {
      var k = Math.sin(Math.PI * t) * 0.22;
      st.x += an.dx * k;
      st.y += an.dy * k;
    } else if (an.type === 'spin') {
      st.rot = t * Math.PI * 2;
    }
    return st;
  };

  MC.Engine = Engine;
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
