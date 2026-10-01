/* Run with: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

['assets', 'blocks', 'engine', 'levels', 'templates'].forEach((f) => require('../js/' + f + '.js'));
const MC = global.MC;
const { B, S } = MC;

function run(project, opts = {}, maxMs = 60000) {
  const engine = new MC.Engine(project, { random: opts.random || (() => 0.42) });
  engine.start();
  for (let t = 0; t < maxMs && !engine.isFinished(); t += 16) {
    if (opts.onTick) opts.onTick(engine, t);
    engine.update(16);
  }
  return engine;
}

function levelWith(index, blocks) {
  const scripts = MC.normalizeScripts([S(20, 20, [B('on_start')].concat(blocks))]);
  return MC.buildLevelProject(MC.LEVELS[index], scripts);
}

const SOLUTIONS = [
  [B('move', { n: 3 })],
  [B('move', { n: 3 }), B('turn', { dir: 'left' }), B('move', { n: 3 })],
  [B('repeat', { n: 4 }, [B('move', { n: 3 }), B('turn', { dir: 'right' })])],
  [B('repeat', { n: 4 }, [B('move', { n: 1 }), B('turn', { dir: 'left' }), B('move', { n: 1 }), B('turn', { dir: 'right' })])],
  [B('move', { n: 2 }), B('jump'), B('move', { n: 2 })],
  [B('repeat', { n: 3 }, [B('move', { n: 1 }), B('jump')])]
];

test('every story level has a solution that wins with 3 stars', () => {
  assert.strictEqual(SOLUTIONS.length, MC.LEVELS.length);
  MC.LEVELS.forEach((level, i) => {
    const project = levelWith(i, SOLUTIONS[i]);
    const engine = run(project);
    assert.strictEqual(engine.status, 'win', 'level ' + (i + 1) + ' should be won');
    const count = MC.countBlocks(project.sprites.find((s) => s.id === 'hero').scripts[0].blocks);
    assert.strictEqual(MC.levelStars(level, count), 3, 'level ' + (i + 1) + ' par');
    for (const type of JSON.stringify(SOLUTIONS[i]).match(/"type":"(\w+)"/g).map((m) => m.slice(8, -1))) {
      assert.ok(level.blocks.includes(type), 'level ' + (i + 1) + ' allows ' + type);
    }
  });
});

test('an empty program does not win', () => {
  const engine = run(levelWith(0, []));
  assert.strictEqual(engine.status, 'running');
  assert.ok(engine.isFinished());
});

test('walking into a crocodile loses', () => {
  const engine = run(levelWith(4, [B('move', { n: 5 })]));
  assert.strictEqual(engine.status, 'lose');
  assert.match(engine.message, /crocodile/);
});

test('walls and trees block the way', () => {
  // Level 2 has a tree right above the path when turning left first.
  const engine = run(levelWith(1, [B('turn', { dir: 'left' }), B('move', { n: 3 })]));
  const hero = engine.sprites.find((s) => s.id === 'hero');
  assert.deepStrictEqual([hero.x, hero.y], [2, 4]);
  // Can't walk off the edge either.
  const e2 = run(levelWith(0, [B('turn', { dir: 'left' }), B('turn', { dir: 'left' }), B('move', { n: 9 })]));
  const h2 = e2.sprites.find((s) => s.id === 'hero');
  assert.deepStrictEqual([h2.x, h2.y], [0, 3]);
});

test('templates load and run without errors', () => {
  MC.TEMPLATES.forEach((t) => {
    const p = MC.makeProject(t.id);
    const engine = run(p, {}, 5000);
    assert.ok(['running', 'win', 'lose'].includes(engine.status), t.id);
  });
});

test('arrow keys, collecting and score win the Banana Party', () => {
  const p = MC.makeProject('banana-party');
  // Freeze the crocodile so the test is about the monkey.
  p.sprites.find((s) => s.kind === 'crocodile').scripts = [];
  const engine = new MC.Engine(p, {});
  engine.start();
  const tick = (ms) => { for (let t = 0; t < ms; t += 16) engine.update(16); };
  const press = (key, times) => { for (let i = 0; i < times; i++) { engine.keyDown(key); tick(400); } };
  const monkey = engine.sprites.find((s) => s.kind === 'monkey');
  // Monkey at (1,3). Banana at (1,5): go down 2.
  press('down', 2);
  assert.deepStrictEqual([monkey.x, monkey.y], [1, 5]);
  tick(100);
  assert.strictEqual(engine.score, 1);
  const banana = engine.sprites.find((s) => s.kind === 'banana' && s.x === 1 && s.y === 5);
  assert.strictEqual(banana.visible, false);
  engine.score = 4;
  press('right', 6); // walk to (7,5) -> 5th banana
  tick(100);
  assert.strictEqual(engine.status, 'win');
});

test('touching the crocodile is game over', () => {
  const p = MC.makeProject('banana-party');
  p.sprites.find((s) => s.kind === 'crocodile').scripts = [];
  const engine = new MC.Engine(p, {});
  engine.start();
  for (let i = 0; i < 3; i++) { engine.keyDown('right'); for (let t = 0; t < 400; t += 16) engine.update(16); }
  assert.strictEqual(engine.status, 'lose');
});

test('chase moves toward the target', () => {
  const p = { cols: 10, rows: 7, sprites: [
    { id: 'a', kind: 'ufo', x: 8, y: 1, scripts: MC.normalizeScripts([S(0, 0, [B('on_start'), B('repeat', { n: 3 }, [B('chase', { kind: 'rocket' })])])]) },
    { id: 'b', kind: 'rocket', x: 2, y: 2, scripts: [] }
  ] };
  const engine = run(p);
  const ufo = engine.sprites.find((s) => s.id === 'a');
  assert.deepStrictEqual([ufo.x, ufo.y], [5, 1]);
});

test('repairProject rejects junk and keeps valid content', () => {
  assert.throws(() => MC.repairProject({}));
  const p = MC.repairProject({
    title: 'x', background: 'nope',
    images: [{ id: 'c1', name: 'pic', src: 'javascript:alert(1)' }],
    sprites: [{ kind: 'monkey', x: 99, y: -3, scripts: [{ blocks: [{ type: 'on_start' }, { type: 'evil' }, { type: 'say', args: { text: 'hi' } }] }] }]
  });
  assert.strictEqual(p.background, 'jungle');
  assert.strictEqual(p.images.length, 0);
  assert.deepStrictEqual([p.sprites[0].x, p.sprites[0].y], [9, 0]);
  assert.deepStrictEqual(p.sprites[0].scripts[0].blocks.map((b) => b.type), ['on_start', 'say']);
});

test('blocks joined to the right are kept when loading and run in chain order', () => {
  const p = MC.repairProject({
    sprites: [
      { id: 'u', kind: 'unicorn', x: 1, y: 1, scripts: [{ x: 0, y: 0, blocks: [
        { type: 'on_start' },
        { type: 'score', args: { n: 1 }, join: 'right' },
        { type: 'score', args: { n: 10 }, join: 'sideways?' },
        { type: 'hide' }
      ] }] }
    ]
  });
  assert.deepStrictEqual(p.sprites[0].scripts[0].blocks.map((b) => b.join || '-'), ['-', 'right', '-', '-']);
  const engine = run(p);
  assert.strictEqual(engine.score, 11);
  assert.strictEqual(engine.sprites[0].visible, false);
});

test('every block has an icon, and turn shows which way it turns', () => {
  MC.BLOCK_ORDER.forEach((type) => {
    assert.ok(MC.blockIcon(MC.newBlock(type)), type + ' needs an icon');
  });
  assert.notStrictEqual(MC.blockIcon({ type: 'turn', args: { dir: 'left' } }), MC.blockIcon({ type: 'turn', args: { dir: 'right' } }));
});
