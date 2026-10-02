/* Game Maker starter stories. Each one is a small game that kids can change. */
(function (MC) {
  'use strict';

  var B = MC.B;
  var S = MC.S;

  function sprite(kind, x, y, extra) {
    var info = MC.IMAGE_MAP[kind] || {};
    var s = { id: MC.uid('s'), kind: kind, x: x, y: y, dir: 0, solid: !!info.solid, scripts: [] };
    return Object.assign(s, extra || {});
  }

  // Arrow keys move the hero: one little script per arrow.
  function arrowScripts() {
    return ['up', 'down', 'left', 'right'].map(function (k) {
      return S(0, 0, [B('on_key', { key: k }), B('step', { dir: k, n: 1 })]);
    });
  }

  // Rough height of a script in pixels, so scripts can be stacked without overlapping.
  function height(blocks) {
    return (blocks || []).reduce(function (sum, b) {
      var def = MC.BLOCKS[b.type];
      if (def.hat) return sum + 66;
      if (def.c) return sum + 90 + Math.max(38, height(b.body));
      return sum + 54;
    }, 0);
  }

  /** Put scripts in one neat column (it fits narrow screens and reads top to bottom). */
  function column(scripts) {
    var y = 16;
    scripts.forEach(function (st) {
      st.x = 16;
      st.y = y;
      y += height(st.blocks) + 28;
    });
    return scripts;
  }

  function collectScript(x, y, treat, goal) {
    return S(x, y, [
      B('on_touch', { kind: treat }),
      B('collect'),
      B('score', { n: 1 }),
      B('sound', { sound: 'coin' }),
      B('if_score', { n: goal }, [B('win')])
    ]);
  }

  MC.TEMPLATES = [
    {
      id: 'banana-party',
      name: 'Banana Party',
      icon: '🐒',
      blurb: 'Help the monkey grab 5 bananas without bumping into the crocodile.',
      make: function () {
        var monkey = sprite('monkey', 1, 3, {
          scripts: column([
            S(0, 0, [B('on_start'), B('say', { text: 'Help me get 5 bananas!' })]),
            collectScript(0, 0, 'banana', 5),
            S(0, 0, [B('on_touch', { kind: 'crocodile' }), B('lose')])
          ].concat(arrowScripts()))
        });
        var croc = sprite('crocodile', 4, 3, {
          scripts: [S(16, 16, [
            B('on_start'),
            B('speed', { speed: 'slow' }),
            B('forever', {}, [B('move', { n: 4 }), B('turn', { dir: 'right' }), B('turn', { dir: 'right' })])
          ])]
        });
        return {
          title: 'Banana Party',
          background: 'jungle',
          story: 'Momo is throwing a banana party! Use the arrow keys to collect 5 bananas, but stay away from the grumpy crocodile.',
          sprites: [
            monkey, croc,
            sprite('banana', 5, 0), sprite('banana', 2, 1), sprite('banana', 8, 2),
            sprite('banana', 1, 5), sprite('banana', 7, 5),
            sprite('tree', 0, 0), sprite('tree', 9, 0), sprite('tree', 5, 2), sprite('tree', 3, 4),
            sprite('tree', 0, 6), sprite('tree', 6, 6), sprite('flower', 9, 6)
          ]
        };
      }
    },
    {
      id: 'space-rescue',
      name: 'Space Rescue',
      icon: '🚀',
      blurb: 'Fly the rocket, collect 5 stars and escape the chasing UFO.',
      make: function () {
        var rocket = sprite('rocket', 1, 5, {
          scripts: column([
            S(0, 0, [B('on_start'), B('say', { text: 'Collect 5 stars!' })]),
            collectScript(0, 0, 'star', 5),
            S(0, 0, [B('on_touch', { kind: 'ufo' }), B('lose')])
          ].concat(arrowScripts()))
        });
        var ufo = sprite('ufo', 8, 1, {
          scripts: column([
            S(0, 0, [B('on_start'), B('say', { text: 'Beep boop!' })]),
            S(0, 0, [B('on_timer', { n: 1.5 }), B('chase', { kind: 'rocket' })])
          ])
        });
        return {
          title: 'Space Rescue',
          background: 'space',
          story: 'Captain Zip must collect 5 lost stars to power the rocket home. Watch out: a sneaky UFO is following you!',
          sprites: [
            rocket, ufo,
            sprite('star', 3, 1), sprite('star', 7, 0), sprite('star', 8, 4), sprite('star', 5, 6), sprite('star', 1, 2),
            sprite('meteor', 4, 3), sprite('meteor', 5, 3), sprite('meteor', 6, 2), sprite('meteor', 2, 4),
            sprite('planet', 9, 6), sprite('moon', 0, 0)
          ]
        };
      }
    },
    {
      id: 'ocean-treasure',
      name: 'Ocean Treasure',
      icon: '🐠',
      blurb: 'Swim around, find 3 gems, then reach the crown. Avoid the shark!',
      make: function () {
        var fish = sprite('fish', 0, 3, {
          scripts: column([
            S(0, 0, [B('on_start'), B('say', { text: 'Find 3 gems, then the crown!' })]),
            S(0, 0, [B('on_touch', { kind: 'gem' }), B('collect'), B('score', { n: 1 }), B('sound', { sound: 'coin' })]),
            S(0, 0, [B('on_touch', { kind: 'crown' }), B('if_score', { n: 3 }, [B('win')]), B('say', { text: 'I need 3 gems first!' })]),
            S(0, 0, [B('on_touch', { kind: 'shark' }), B('lose')])
          ].concat(arrowScripts()))
        });
        var shark = sprite('shark', 5, 3, {
          scripts: [S(16, 16, [B('on_timer', { n: 0.8 }), B('wander')])]
        });
        var octopus = sprite('octopus', 2, 6, {
          scripts: [S(16, 16, [B('on_start'), B('forever', {}, [B('step', { dir: 'up', n: 2 }), B('wait', { n: 1 }), B('step', { dir: 'down', n: 2 }), B('wait', { n: 1 })])])]
        });
        return {
          title: 'Ocean Treasure',
          background: 'ocean',
          story: 'Finn the fish heard about a royal crown at the bottom of the sea. But the crown only opens for someone with 3 sparkly gems!',
          sprites: [
            fish, shark, octopus,
            sprite('gem', 3, 1), sprite('gem', 6, 5), sprite('gem', 8, 2), sprite('crown', 9, 6)
          ]
        };
      }
    },
    {
      id: 'empty',
      name: 'Empty Page',
      icon: '✏️',
      blurb: 'Start from nothing and invent your very own game.',
      make: function () {
        return {
          title: 'My Game',
          background: 'jungle',
          story: 'Once upon a time… (drag pictures onto the stage and write your own story!)',
          sprites: []
        };
      }
    }
  ];

  /** Build a fresh Game Maker project from a template id. */
  MC.makeProject = function (templateId) {
    var t = MC.TEMPLATES.find(function (x) { return x.id === templateId; }) || MC.TEMPLATES[0];
    var p = t.make();
    p.version = 1;
    p.template = t.id;
    p.cols = 10;
    p.rows = 7;
    p.images = [];
    p.sprites.forEach(function (s) { MC.normalizeScripts(s.scripts); });
    return p;
  };

  /** Make sure a loaded project has everything it needs. */
  MC.repairProject = function (p) {
    if (!p || !Array.isArray(p.sprites)) throw new Error('This is not a Monkey Coder game file.');
    p.version = 1;
    p.title = String(p.title || 'My Game').slice(0, 40);
    p.background = MC.BACKGROUNDS[p.background] ? p.background : 'jungle';
    p.cols = 10;
    p.rows = 7;
    p.story = String(p.story || '');
    p.images = Array.isArray(p.images) ? p.images.filter(function (i) { return i && i.id && typeof i.src === 'string' && i.src.indexOf('data:image/') === 0; }) : [];
    p.sprites = p.sprites.filter(function (s) { return s && s.kind; }).map(function (s) {
      return {
        id: s.id || MC.uid('s'),
        kind: String(s.kind),
        x: Math.max(0, Math.min(p.cols - 1, s.x | 0)),
        y: Math.max(0, Math.min(p.rows - 1, s.y | 0)),
        dir: (s.dir | 0) % 4,
        solid: !!s.solid,
        scripts: MC.normalizeScripts((s.scripts || []).filter(function (st) {
          return st && Array.isArray(st.blocks);
        }).map(function (st) {
          return { x: +st.x || 20, y: +st.y || 20, blocks: cleanBlocks(st.blocks) };
        }))
      };
    });
    return p;
  };

  function cleanBlocks(list) {
    return (list || []).filter(function (b) { return b && MC.BLOCKS[b.type]; }).map(function (b) {
      var out = { id: b.id, type: b.type, args: {} };
      if (b.join === 'right') out.join = 'right';
      var def = MC.BLOCKS[b.type];
      Object.keys(def.args || {}).forEach(function (k) {
        if (b.args && b.args[k] !== undefined) out.args[k] = typeof b.args[k] === 'number' ? b.args[k] : String(b.args[k]).slice(0, 60);
      });
      if (def.c) out.body = cleanBlocks(b.body);
      return out;
    });
  }
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
