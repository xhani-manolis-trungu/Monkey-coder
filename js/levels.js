/* Story Adventure: a chapter book of small coding puzzles. */
(function (MC) {
  'use strict';

  // Map legend: M monkey, B banana, C crocodile, W water, T tree, # wall, f flower, . grass
  var LEGEND = {
    M: { kind: 'monkey' },
    B: { kind: 'banana' },
    C: { kind: 'crocodile' },
    W: { kind: 'water' },
    T: { kind: 'tree', solid: true },
    '#': { kind: 'wall', solid: true },
    f: { kind: 'flower' }
  };

  MC.LEVELS = [
    {
      title: 'Hungry Monkey',
      story: 'Good morning! Momo the monkey woke up with a rumbly tummy. A yummy banana is waiting just ahead.',
      goal: 'Get the banana 🍌',
      hint: 'Drag a “move” block under “when ▶ Run clicked”. How many steps away is the banana? Change the number, then press Run!',
      blocks: ['move'],
      par: 1,
      map: [
        '..........',
        '.T......T.',
        '..........',
        '..M..B....',
        '..........',
        '.f......T.',
        '..........'
      ]
    },
    {
      title: 'Up the Hill',
      story: 'Yum! But Momo is still hungry. Another banana is hiding up the hill. Momo will have to turn to get there.',
      goal: 'Get the banana 🍌',
      hint: 'Move 3 steps, then “turn left” so Momo faces up, then move 3 more steps.',
      blocks: ['move', 'turn'],
      par: 3,
      map: [
        '..........',
        '......T...',
        '.....B....',
        '..T.......',
        '..........',
        '..M.......',
        '.......f..'
      ]
    },
    {
      title: 'Banana Pond',
      story: 'Momo found a pond with bananas all around it! Walking around a square means doing the same thing 4 times… is there a shortcut?',
      goal: 'Collect all 4 bananas 🍌 (try using “repeat”!)',
      hint: 'Put “move 3 steps” and “turn right” inside a “repeat 4 times” block.',
      blocks: ['move', 'turn', 'repeat'],
      par: 3,
      map: [
        '........T.',
        '...M.B....',
        '...BWW....',
        '....WWB...',
        '....B.....',
        '.........T',
        'T.........'
      ]
    },
    {
      title: 'Banana Stairs',
      story: 'Somebody left bananas on a big staircase! Up one, over one, up one, over one… that sounds like a pattern.',
      goal: 'Collect all 4 bananas 🍌',
      hint: 'One stair is: move 1, turn left, move 1, turn right. Repeat that 4 times!',
      blocks: ['move', 'turn', 'repeat'],
      par: 5,
      map: [
        '........T.',
        '.....B....',
        '....B.#...',
        '...B.##...',
        '..B.###...',
        '.M.####...',
        '##########'
      ]
    },
    {
      title: 'Sleepy Crocodile',
      story: 'Shhh! A crocodile is napping on the path. Don’t step on it! Luckily Momo is a super jumper.',
      goal: 'Jump over the crocodile 🐊 and get the banana 🍌',
      hint: 'Move 2 steps, then “jump” over the crocodile, then move 2 steps.',
      blocks: ['move', 'turn', 'jump'],
      par: 3,
      map: [
        '....#.....',
        '....#.....',
        '....#...T.',
        '.M..C..B..',
        '....#.....',
        '....#.....',
        '....#.....'
      ],
      hazardText: { crocodile: 'Snap! You woke up the crocodile. Try jumping over it!' }
    },
    {
      title: 'Crocodile River',
      story: 'The last bananas are across the river. Crocodiles float between the logs. Step, jump, step, jump… you know what to do!',
      goal: 'Collect all 3 bananas 🍌',
      hint: 'Inside “repeat 3 times” put “move 1 step” and “jump”.',
      blocks: ['move', 'turn', 'jump', 'repeat'],
      par: 3,
      map: [
        'T...f...T.',
        '..........',
        'WWWWWWWWWW',
        'M.CB.CB.CB',
        'WWWWWWWWWW',
        '..........',
        '.f..T...f.'
      ],
      hazardText: { crocodile: 'Snap! Jump over the crocodiles!', water: 'Splash! Monkeys can’t swim. Stay on the path.' }
    }
  ];

  /** Turn a level's map into a project the engine and stage understand. */
  MC.buildLevelProject = function (level, scripts) {
    var sprites = [];
    level.map.forEach(function (row, y) {
      row.split('').forEach(function (ch, x) {
        var item = LEGEND[ch];
        if (!item) return;
        var s = { id: 'L' + x + '_' + y, kind: item.kind, x: x, y: y, dir: 0, solid: !!item.solid, scripts: [] };
        if (item.kind === 'monkey') {
          s.id = 'hero';
          s.dir = MC.dirIndex(level.dir || 'right');
          s.scripts = scripts || [MC.S(24, 24, [{ type: 'on_start', args: {} }])];
        }
        sprites.push(s);
      });
    });
    var hero = sprites.find(function (s) { return s.id === 'hero'; });
    if (hero) MC.normalizeScripts(hero.scripts);
    return {
      title: level.title,
      background: level.background || 'jungle',
      cols: level.map[0].length,
      rows: level.map.length,
      sprites: sprites,
      images: [],
      rules: {
        hero: 'monkey',
        collect: 'banana',
        hazards: ['crocodile', 'water'],
        hazardText: Object.assign({
          crocodile: 'Snap! Watch out for the crocodile.',
          water: 'Splash! Monkeys can’t swim.'
        }, level.hazardText || {})
      }
    };
  };

  /** Stars: 3 if the program is as short as ours, fewer if it's longer. */
  MC.levelStars = function (level, blockCount) {
    if (blockCount <= level.par) return 3;
    if (blockCount <= level.par + 3) return 2;
    return 1;
  };
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
