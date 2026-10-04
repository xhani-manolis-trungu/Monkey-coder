/* Draws the game world on the <canvas>. */
(function (MC) {
  'use strict';

  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  function Stage(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = {};
    this.stars = [];
    for (var i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 });
    }
  }

  Stage.prototype.resize = function (cols, rows) {
    var cell = 64;
    if (this.canvas.width !== cols * cell) this.canvas.width = cols * cell;
    if (this.canvas.height !== rows * cell) this.canvas.height = rows * cell;
    this.cell = cell;
    this.cols = cols;
    this.rows = rows;
  };

  /** Which grid square is under the mouse / finger? */
  Stage.prototype.cellAt = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    var x = Math.floor(((clientX - r.left) / r.width) * this.cols);
    var y = Math.floor(((clientY - r.top) / r.height) * this.rows);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return { x: x, y: y };
  };

  Stage.prototype.image = function (src) {
    var img = this.images[src];
    if (!img) {
      img = new Image();
      img.src = src;
      this.images[src] = img;
    }
    return img.complete && img.naturalWidth ? img : null;
  };

  Stage.prototype.drawPicture = function (info, cx, cy, size) {
    var ctx = this.ctx;
    if (info.src) {
      var img = this.image(info.src);
      if (img) {
        var k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
        var w = img.naturalWidth * k;
        var h = img.naturalHeight * k;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      }
      return;
    }
    ctx.font = Math.round(size * 0.86) + 'px ' + EMOJI_FONT;
    ctx.fillStyle = '#000'; // colour emoji take the fill's transparency, so keep it solid
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.emoji, cx, cy + size * 0.04);
  };

  Stage.prototype.drawBackground = function (bgId, time) {
    var ctx = this.ctx;
    var bg = MC.BACKGROUNDS[bgId] || MC.BACKGROUNDS.jungle;
    var c = this.cell;
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        ctx.fillStyle = (x + y) % 2 ? bg.b : bg.a;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }
    if (bg.stars) {
      var w = this.canvas.width;
      var h = this.canvas.height;
      this.stars.forEach(function (s) {
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time / 600 + s.p);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = bg.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 1; gx < this.cols; gx++) { ctx.moveTo(gx * c + 0.5, 0); ctx.lineTo(gx * c + 0.5, this.rows * c); }
    for (var gy = 1; gy < this.rows; gy++) { ctx.moveTo(0, gy * c + 0.5); ctx.lineTo(this.cols * c, gy * c + 0.5); }
    ctx.stroke();
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Stage.prototype.drawArrow = function (cx, cy, dir) {
    var ctx = this.ctx;
    var c = this.cell;
    var d = MC.DIRS[dir];
    var ax = cx + d.dx * c * 0.4;
    var ay = cy + d.dy * c * 0.4;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(d.dy, d.dx));
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, c * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a00';
    ctx.beginPath();
    ctx.moveTo(c * 0.08, 0);
    ctx.lineTo(-c * 0.05, -c * 0.065);
    ctx.lineTo(-c * 0.05, c * 0.065);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  Stage.prototype.drawBubble = function (text, cx, top) {
    var ctx = this.ctx;
    ctx.font = 'bold 15px "Baloo 2", "Nunito", system-ui, sans-serif';
    var w = Math.min(260, ctx.measureText(text).width + 22);
    var h = 30;
    var x = Math.max(4, Math.min(this.canvas.width - w - 4, cx - w / 2));
    var y = Math.max(4, top - h - 10);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + h - 1);
    ctx.lineTo(cx, y + h + 9);
    ctx.lineTo(cx + 6, y + h - 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 5, y + h - 3, 10, 3);
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1, w - 14);
  };

  /**
   * view = { project, engine (optional), selectedId, showArrows, time }
   */
  Stage.prototype.draw = function (view) {
    var self = this;
    var p = view.project;
    var engine = view.engine;
    var ctx = this.ctx;
    var c = this.cell;
    this.resize(p.cols, p.rows);
    var time = engine ? engine.time : view.time;
    this.drawBackground(p.background, view.time);

    var sprites = engine ? engine.sprites : p.sprites;
    var ordered = sprites.slice().sort(function (a, b) {
      var am = (a.scripts && a.scripts.length) ? 1 : 0;
      var bm = (b.scripts && b.scripts.length) ? 1 : 0;
      return am - bm || a.y - b.y;
    });

    // Faint copies (e.g. where Momo started) under everything else.
    (view.ghosts || []).forEach(function (g) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      roundRect(ctx, g.x * c + 5, g.y * c + 5, c - 10, c - 10, 12);
      ctx.stroke();
      self.drawPicture(MC.imageInfo(g.kind, p), (g.x + 0.5) * c, (g.y + 0.5) * c, c * 0.84);
      ctx.restore();
    });

    ordered.forEach(function (s) {
      if (engine && !s.visible) return;
      var st = engine ? engine.renderState(s) : { x: s.x, y: s.y, lift: 0, rot: 0 };
      var cx = (st.x + 0.5) * c;
      var cy = (st.y + 0.5) * c;
      var info = MC.imageInfo(s.kind, p);
      var moving = s.scripts && s.scripts.length;

      if (moving) {
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + c * 0.36, c * 0.3 * (1 - st.lift * 0.3), c * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (view.selectedId === s.id && !engine) {
        ctx.save();
        ctx.strokeStyle = '#ff7a00';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -view.time / 40;
        roundRect(ctx, s.x * c + 3, s.y * c + 3, c - 6, c - 6, 12);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(cx, cy - st.lift * c);
      if (st.rot) ctx.rotate(st.rot);
      self.drawPicture(info, 0, 0, c * 0.84);
      ctx.restore();
      if (view.showArrows && (s.id === 'hero' || hasMoveBlocks(s))) self.drawArrow(cx, cy - st.lift * c, s.dir);
    });

    if (engine) {
      engine.effects.forEach(function (e) {
        var t = (time - e.t0) / e.dur;
        var ex = (e.x + 0.5) * c;
        var ey = (e.y + 0.5) * c;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        if (e.type === 'sparkle') {
          ctx.strokeStyle = '#ffd400';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(ex, ey, c * (0.2 + t * 0.5), 0, Math.PI * 2);
          ctx.stroke();
          self.drawPicture({ emoji: '✨' }, ex, ey - t * c * 0.6, c * 0.6);
        } else if (e.type === 'boom') {
          self.drawPicture({ emoji: '💥' }, ex, ey, c * (0.7 + t * 0.4));
        } else if (e.type === 'poof') {
          self.drawPicture({ emoji: '💨' }, ex, ey, c * 0.6);
        } else if (e.type === 'text') {
          ctx.font = 'bold 24px "Baloo 2", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#fff';
          ctx.fillStyle = '#2fb569';
          ctx.strokeText(e.text, ex, ey - c * 0.4 - t * c * 0.6);
          ctx.fillText(e.text, ex, ey - c * 0.4 - t * c * 0.6);
        }
        ctx.restore();
      });
      sprites.forEach(function (s) {
        if (!s.visible || !s.say || engine.time > s.sayUntil) return;
        var st = engine.renderState(s);
        self.drawBubble(s.say, (st.x + 0.5) * c, (st.y - st.lift) * c + 4);
      });
    }
  };

  function hasMoveBlocks(s) {
    var json = JSON.stringify(s.scripts || []);
    return /"type":"(move|jump|turn)"/.test(json);
  }

  MC.Stage = Stage;
})(window.MC = window.MC || {});
