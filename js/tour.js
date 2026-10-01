/*
 * Guided tour: dims the page, cuts a glowing spotlight (with bokeh lights) around the
 * element to look at, and moves a pretend hand pointer over it. The spotlight glides
 * from step to step. Steps can wait for the child to do something before moving on.
 *
 * A step looks like:
 *   { title, text,                       // either may be a function
 *     holes: () => [el | {x,y,w,h}],    // what to light up (first one is the main one)
 *     cursor: 'point' | { drag: { from: () => el, to: () => {x,y} } },
 *     next: 'Next',                      // show a Next button (omit for "do it yourself" steps)
 *     done: () => bool,                  // move on automatically when this becomes true
 *     onEnter: fn }
 */
(function (MC) {
  'use strict';

  var PAD = 8;
  var BOKEH_COLORS = [[255, 214, 102], [255, 150, 190], [130, 230, 210], [255, 255, 255], [160, 190, 255]];
  var HAND_SVG =
    '<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true">' +
    '<path d="M11 3.5c1.4 0 2.5 1.1 2.5 2.5v8.2l1.1-.2c1.2-.2 2.3.5 2.6 1.6l.1.4.5-.2c1.2-.3 2.4.3 2.8 1.5l.1.3.4-.1c1.3-.3 2.6.5 2.9 1.8.1.3.1.5.1.8V25c0 2.5-2 4.5-4.5 4.5h-5.3c-1.6 0-3.1-.8-4-2.1l-5-7.4c-.7-1-.5-2.4.5-3.1.9-.7 2.2-.6 3 .2l1.2 1.2V6c0-1.4 1.1-2.5 2.5-2.5z" ' +
    'fill="#fff" stroke="#1d1b22" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M14 18v5M17.5 18.5v4.5M21 19.5v3.5" stroke="#1d1b22" stroke-width="1.3" stroke-linecap="round"/></svg>';
  // Where the fingertip is inside the 44px hand picture.
  var TIP_X = 15;
  var TIP_Y = 5;

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function rectOf(target) {
    if (!target) return null;
    if (target.getBoundingClientRect) {
      if (!target.isConnected) return null;
      var r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return target;
  }

  function inflate(r, p) { return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 }; }

  function union(rects) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    rects.forEach(function (r) {
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function roundRect(ctx, r, rad) {
    var k = Math.min(rad, r.w / 2, r.h / 2);
    ctx.beginPath();
    ctx.moveTo(r.x + k, r.y);
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
    ctx.closePath();
  }

  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function Tour(opts) {
    opts = opts || {};
    this.onEnd = opts.onEnd || function () {};
    this.active = false;
    this.reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._frame = this.frame.bind(this);
  }

  Tour.prototype.build = function () {
    var root = el('div', 'tour');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', 'Guided tour');
    this.canvas = el('canvas', 'tour-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.hand = el('div', 'tour-hand');
    this.hand.innerHTML = HAND_SVG;
    this.ghost = el('div', 'tour-ghost');
    this.card = el('div', 'tour-card');
    this.card.innerHTML =
      '<div class="tour-count"></div><h3 class="tour-title"></h3><p class="tour-text"></p>' +
      '<div class="tour-actions"><button type="button" class="tour-skip">Skip tour</button>' +
      '<span class="tour-doit">👆 Your turn!</span><button type="button" class="tour-next">Next ▶</button></div>';
    root.appendChild(this.canvas);
    root.appendChild(this.ghost);
    root.appendChild(this.hand);
    root.appendChild(this.card);
    document.body.appendChild(root);
    this.root = root;
    var self = this;
    this.card.querySelector('.tour-next').addEventListener('click', function () { self.go(self.index + 1); });
    this.card.querySelector('.tour-skip').addEventListener('click', function () { self.stop(true); });
    this._onKey = function (e) { if (e.key === 'Escape' && self.active) self.stop(true); };
    window.addEventListener('keydown', this._onKey);
  };

  Tour.prototype.start = function (steps) {
    if (this.active) this.stop(false);
    this.steps = steps;
    this.active = true;
    this.build();
    this.shown = [];
    this.handPos = { x: window.innerWidth / 2, y: window.innerHeight + 40 };
    this.particles = [];
    this.last = performance.now();
    this.time = 0;
    this.go(0);
    requestAnimationFrame(this._frame);
  };

  Tour.prototype.stop = function (skipped) {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this._onKey);
    var root = this.root;
    root.classList.add('leaving');
    setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 350);
    this.onEnd(!!skipped);
  };

  Tour.prototype.go = function (i) {
    if (i >= this.steps.length) { this.stop(false); return; }
    this.index = i;
    this.step = this.steps[i];
    this.stepTime = 0;
    this.doneAt = null;
    if (this.step.onEnter) this.step.onEnter();
    this.card.querySelector('.tour-count').textContent = 'Step ' + (i + 1) + ' of ' + this.steps.length;
    this.renderText();
    var next = this.card.querySelector('.tour-next');
    next.hidden = !this.step.next;
    next.textContent = this.step.next || 'Next ▶';
    this.card.querySelector('.tour-doit').hidden = !!this.step.next;
    this.card.querySelector('.tour-skip').hidden = i === this.steps.length - 1;
    this.card.classList.remove('pop');
    void this.card.offsetWidth;
    this.card.classList.add('pop');
    this.ghost.innerHTML = '';
    this.ghost.style.opacity = 0;
    // Make sure the thing we talk about is on screen.
    var holes = this.targets();
    var main = this.step.holes && this.step.holes()[0];
    if (main && main.scrollIntoView && holes.length) {
      var r = holes[0];
      if (r.y < 60 || r.y + r.h > window.innerHeight - 20) main.scrollIntoView({ block: 'center', behavior: this.reduced ? 'auto' : 'smooth' });
    }
    if (!this.reduced) this.spawnBokeh();
    if (!next.hidden) next.focus({ preventScroll: true });
  };

  Tour.prototype.renderText = function () {
    var self = this;
    [['.tour-title', this.step.title], ['.tour-text', this.step.text]].forEach(function (pair) {
      var value = typeof pair[1] === 'function' ? pair[1]() : pair[1];
      var node = self.card.querySelector(pair[0]);
      if (node.textContent !== value) node.textContent = value;
    });
  };

  Tour.prototype.targets = function () {
    var list = this.step.holes ? this.step.holes() : [];
    return list.map(rectOf).filter(Boolean).map(function (r) { return inflate(r, PAD); });
  };

  Tour.prototype.spawnBokeh = function () {
    var n = 22;
    this.particles = [];
    for (var i = 0; i < n; i++) {
      this.particles.push({
        hole: i % 2,
        angle: Math.random() * Math.PI * 2,
        dist: 0.55 + Math.random() * 0.8, // <1 floats over the element, >1 around it
        speed: (Math.random() - 0.5) * 0.00035,
        size: 6 + Math.random() * 22,
        color: BOKEH_COLORS[Math.floor(Math.random() * BOKEH_COLORS.length)],
        phase: Math.random() * Math.PI * 2,
        bornAt: this.time + Math.random() * 400
      });
    }
  };

  /* ---------- per-frame work ---------- */

  Tour.prototype.frame = function (now) {
    if (!this.active) return;
    var dt = Math.min(50, now - this.last);
    this.last = now;
    this.time += dt;
    this.stepTime += dt;

    var targets = this.targets();
    if (!targets.length) targets = this.shown.length ? this.shown.map(function (r) { return r.target; }) : [];
    this.animateHoles(targets, dt);
    this.draw();
    this.moveHand(dt);
    this.placeCard();
    this.renderText();

    // Hide the pretend hand while the child is dragging a real block.
    var dragging = document.body.classList.contains('dragging-blocks');
    this.root.classList.toggle('kid-dragging', dragging);

    if (this.step.done && this.stepTime > 300) {
      if (this.step.done()) {
        if (this.doneAt == null) {
          this.doneAt = this.time;
          this.card.classList.add('success');
        } else if (this.time - this.doneAt > 650) {
          this.card.classList.remove('success');
          this.go(this.index + 1);
        }
      } else {
        this.doneAt = null;
        this.card.classList.remove('success');
      }
    }
    if (this.active) requestAnimationFrame(this._frame);
  };

  Tour.prototype.animateHoles = function (targets, dt) {
    var k = this.reduced ? 1 : 1 - Math.exp(-dt / 110);
    var shown = this.shown;
    while (shown.length < targets.length) {
      var from = shown[0] ? Object.assign({}, shown[0].r) : { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0 };
      shown.push({ r: from, alpha: 0 });
    }
    shown.forEach(function (s, i) {
      var t = targets[i];
      if (t) {
        s.target = t;
        s.r.x += (t.x - s.r.x) * k;
        s.r.y += (t.y - s.r.y) * k;
        s.r.w += (t.w - s.r.w) * k;
        s.r.h += (t.h - s.r.h) * k;
        s.alpha += (1 - s.alpha) * k;
      } else {
        s.alpha -= s.alpha * k;
      }
    });
    this.shown = shown.filter(function (s, i) { return targets[i] || s.alpha > 0.02; });
  };

  Tour.prototype.draw = function () {
    var c = this.canvas;
    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth;
    var H = window.innerHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1. The dark see-through layer.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(14, 10, 32, 0.66)';
    ctx.fillRect(0, 0, W, H);

    // 2. Cut out the spotlight holes (soft edges).
    ctx.globalCompositeOperation = 'destination-out';
    var self = this;
    this.shown.forEach(function (s) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.shadowColor = 'rgba(0,0,0,1)';
      ctx.shadowBlur = 22;
      roundRect(ctx, s.r, 16);
      ctx.fill();
      ctx.restore();
    });

    // 3. Golden glowing ring around each hole.
    ctx.globalCompositeOperation = 'source-over';
    var pulse = 0.55 + 0.45 * Math.sin(this.time / 380);
    this.shown.forEach(function (s, i) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = 'rgba(255, 210, 90, ' + (0.65 + 0.35 * pulse) + ')';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 190, 60, 0.9)';
      ctx.shadowBlur = 10 + 14 * pulse;
      if (i > 0) ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -self.time / 30;
      roundRect(ctx, s.r, 16);
      ctx.stroke();
      ctx.restore();
    });

    // 4. Bokeh: soft discs of light drifting around (and a little over) the spotlight.
    if (this.reduced) return;
    ctx.globalCompositeOperation = 'lighter';
    this.particles.forEach(function (p) {
      var s = self.shown[p.hole] || self.shown[0];
      if (!s) return;
      var age = self.time - p.bornAt;
      if (age < 0) return;
      p.angle += p.speed * 16;
      var cx = s.r.x + s.r.w / 2;
      var cy = s.r.y + s.r.h / 2;
      var rx = s.r.w / 2 + 14;
      var ry = s.r.h / 2 + 14;
      var wob = Math.sin(self.time / 900 + p.phase) * 0.08;
      var x = cx + Math.cos(p.angle) * rx * (p.dist + wob);
      var y = cy + Math.sin(p.angle) * ry * (p.dist + wob) - Math.sin(self.time / 1300 + p.phase) * 6;
      var inside = p.dist < 1;
      var twinkle = 0.55 + 0.45 * Math.sin(self.time / 520 + p.phase * 3);
      var fadeIn = Math.min(1, age / 500);
      var a = (inside ? 0.16 : 0.34) * twinkle * fadeIn * s.alpha;
      var col = p.color.join(',');
      var g = ctx.createRadialGradient(x, y, 0, x, y, p.size);
      g.addColorStop(0, 'rgba(' + col + ',' + a * 0.55 + ')');
      g.addColorStop(0.78, 'rgba(' + col + ',' + a * 0.45 + ')');
      g.addColorStop(0.92, 'rgba(' + col + ',' + a + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  };

  /** Work out where the hand should be right now, then glide there. */
  Tour.prototype.moveHand = function (dt) {
    var step = this.step;
    var want = null;
    var pressed = false;
    var ghostAlpha = 0;
    var ghostPos = null;
    var cursor = step.cursor || 'point';
    var follow = this.reduced ? 1 : 1 - Math.exp(-dt / 90);

    if (cursor.drag) {
      var fromR = rectOf(cursor.drag.from());
      var to = cursor.drag.to();
      if (fromR && to) {
        var from = { x: fromR.x + Math.min(36, fromR.w / 2), y: fromR.y + fromR.h / 2 };
        var LOOP = 3200;
        var t = this.stepTime % LOOP;
        if (t < 700) {
          want = from;
        } else if (t < 900) {
          want = from; pressed = true; ghostAlpha = (t - 700) / 200;
          ghostPos = from;
        } else if (t < 2100) {
          var e = ease((t - 900) / 1200);
          want = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
          pressed = true; ghostAlpha = 1; ghostPos = want;
          follow = 1;
        } else if (t < 2500) {
          want = to; ghostPos = to; ghostAlpha = 1 - (t - 2100) / 400;
        } else {
          want = to;
        }
        if (!this.ghost.firstChild) {
          var src = cursor.drag.from();
          if (src && src.cloneNode) this.ghost.appendChild(src.cloneNode(true));
        }
        if (ghostPos) {
          this.ghost.style.transform = 'translate(' + (ghostPos.x - Math.min(36, fromR.w / 2)) + 'px,' + (ghostPos.y - fromR.h / 2) + 'px)';
        }
      }
    } else {
      var main = this.shown[0] && this.shown[0].target;
      var pointAt = step.pointAt ? rectOf(step.pointAt()) : null;
      var r = pointAt || (main && { x: main.x + PAD, y: main.y + PAD, w: main.w - PAD * 2, h: main.h - PAD * 2 });
      if (r) {
        var bob = this.reduced ? 0 : Math.sin(this.time / 300) * 4;
        want = { x: r.x + r.w / 2, y: r.y + r.h / 2 + 6 + bob };
        var tapT = this.stepTime % 1800;
        pressed = tapT > 1300 && tapT < 1500;
        if (tapT > 1300 && tapT < 1340 && !this.tapped) {
          this.tapped = true;
          this.ripple(want.x, want.y - 6);
        }
        if (tapT < 1300) this.tapped = false;
      }
    }

    this.ghost.style.opacity = ghostAlpha * 0.85;
    if (want) {
      this.handPos.x += (want.x - this.handPos.x) * follow;
      this.handPos.y += (want.y - this.handPos.y) * follow;
    }
    this.hand.style.transform = 'translate(' + (this.handPos.x - TIP_X) + 'px,' + (this.handPos.y - TIP_Y) + 'px) scale(' + (pressed ? 0.86 : 1) + ')';
  };

  Tour.prototype.ripple = function (x, y) {
    if (this.reduced) return;
    var r = el('div', 'tour-ripple');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    this.root.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 700);
  };

  /** Put the speech card next to the spotlight, where it doesn't cover it. */
  Tour.prototype.placeCard = function () {
    var targets = this.shown.map(function (s) { return s.r; });
    var W = window.innerWidth;
    var H = window.innerHeight;
    var cw = this.card.offsetWidth;
    var ch = this.card.offsetHeight;
    var gap = 22;
    var x, y;
    if (!targets.length) {
      x = (W - cw) / 2;
      y = (H - ch) / 2;
    } else {
      var u = union(targets);
      var options = [
        { x: u.x + u.w / 2 - cw / 2, y: u.y + u.h + gap, fits: u.y + u.h + gap + ch < H - 8 },
        { x: u.x + u.w / 2 - cw / 2, y: u.y - gap - ch, fits: u.y - gap - ch > 8 },
        { x: u.x + u.w + gap, y: u.y + u.h / 2 - ch / 2, fits: u.x + u.w + gap + cw < W - 8 },
        { x: u.x - gap - cw, y: u.y + u.h / 2 - ch / 2, fits: u.x - gap - cw > 8 }
      ];
      var pick = options.find(function (o) { return o.fits; }) || { x: (W - cw) / 2, y: H - ch - 12 };
      x = pick.x;
      y = pick.y;
    }
    x = Math.max(12, Math.min(W - cw - 12, x));
    y = Math.max(12, Math.min(H - ch - 12, y));
    this.card.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  };

  MC.Tour = Tour;
})(window.MC = window.MC || {});
