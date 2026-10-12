/* Levels made in Game Maker and played in Story Adventure. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

['assets', 'blocks', 'engine', 'levels', 'templates'].forEach((f) => require('../js/' + f + '.js'));
const MC = global.MC;
const { B, S } = MC;

// A small Game Maker game: a fish (the child's character) on row 3, gems to the right, a shark further on.
function game(extra) {
  const p = MC.makeProject('empty');
  p.sprites = [
    { id: 'fish1', kind: 'fish', x: 0, y: 3, dir: 0, solid: false, scripts: [] },
    { id: 'g1', kind: 'gem', x: 2, y: 3, dir: 0, solid: false, scripts: [] },
    { id: 'g2', kind: 'gem', x: 4, y: 3, dir: 0, solid: false, scripts: [] },
    { id: 'shark1', kind: 'shark', x: 6, y: 3, dir: 0, solid: false, scripts: [] },
    { id: 'crown1', kind: 'crown', x: 9, y: 0, dir: 0, solid: false, scripts: [] }
  ].concat(extra || []);
  return p;
}

function level(fields, project) {
  return MC.repairCustomLevel(Object.assign({
    id: 'lv-test', title: 'Gem Hunt', playerId: 'fish1', blocks: ['move', 'turn', 'repeat'], par: 1,
    win: { type: 'collect', kind: 'gem' }, hazards: ['shark'], project: project || game()
  }, fields));
}

function play(lv, blocks, maxMs = 30000) {
  const scripts = MC.normalizeScripts([S(24, 24, [B('on_start')].concat(blocks))]);
  const engine = new MC.Engine(MC.buildCustomLevelProject(lv, scripts), { random: () => 0.3 });
  engine.start();
  for (let t = 0; t < maxMs && engine.status === 'running' && !engine.heroDone(); t += 16) engine.update(16);
  return engine;
}

test('collect every gem wins', () => {
  const engine = play(level(), [B('move', { n: 4 })]);
  assert.strictEqual(engine.status, 'win');
  assert.strictEqual(engine.collected, 2);
});

test('stopping short is not a win, and the character stays where it stopped', () => {
  const engine = play(level(), [B('move', { n: 2 })]);
  assert.strictEqual(engine.status, 'running');
  assert.ok(engine.heroDone());
  assert.deepStrictEqual([engine.byId.hero.x, engine.byId.hero.y], [2, 3]);
});

test('touching a chosen danger is "Oops"', () => {
  const engine = play(level(), [B('move', { n: 6 })]);
  // both gems are collected on the way, which already wins before the shark
  assert.strictEqual(engine.status, 'win');
  const lose = play(level({ win: { type: 'reach', kind: 'crown' } }), [B('move', { n: 6 })]);
  assert.strictEqual(lose.status, 'lose');
  assert.match(lose.message, /shark/);
});

test('reach a picture wins', () => {
  const lv = level({ win: { type: 'reach', kind: 'crown' } });
  const engine = play(lv, [B('turn', { dir: 'left' }), B('move', { n: 3 }), B('turn', { dir: 'right' }), B('move', { n: 9 })]);
  assert.strictEqual(engine.status, 'win');
});

test('the game\'s own "you win!" blocks work too', () => {
  const p = game();
  p.sprites.find((s) => s.id === 'crown1').scripts = MC.normalizeScripts([S(0, 0, [B('on_touch', { kind: 'fish' }), B('win')])]);
  const lv = level({ win: { type: 'block' }, hazards: [] }, p);
  const engine = play(lv, [B('turn', { dir: 'left' }), B('move', { n: 3 }), B('turn', { dir: 'right' }), B('move', { n: 9 })]);
  assert.strictEqual(engine.status, 'win');
});

test('a patrolling enemy that walks into the child\'s character is "Oops", and other code keeps running', () => {
  const croc = { id: 'croc1', kind: 'crocodile', x: 3, y: 5, dir: 3, solid: false,
    scripts: MC.normalizeScripts([S(0, 0, [B('on_start'), B('forever', {}, [B('step', { dir: 'up', n: 1 }), B('wait', { n: 0.2 })])])]) };
  const lv = level({ win: { type: 'reach', kind: 'crown' }, hazards: ['shark', 'crocodile'] }, game([croc]));
  // the fish waits on the crocodile's path: (3,3)
  const engine = play(lv, [B('move', { n: 3 }), B('wait', { n: 3 })]);
  assert.strictEqual(engine.status, 'lose');
  assert.match(engine.message, /crocodile/);
  // without waiting there, the fish's code finishes first and the run is over even though the crocodile keeps going
  const lv2 = level({ win: { type: 'reach', kind: 'crown' }, hazards: ['crocodile'] }, game([Object.assign({}, croc, { x: 8, y: 6 })]));
  const e2 = play(lv2, [B('move', { n: 1 })]);
  assert.ok(e2.heroDone());
  assert.strictEqual(e2.status, 'running');
});

test('the child starts with the chosen code; other characters keep theirs', () => {
  const p = game();
  p.sprites.find((s) => s.id === 'shark1').scripts = MC.normalizeScripts([S(0, 0, [B('on_start'), B('say', { text: 'hi' })])]);
  const lv = level({ startScripts: [S(10, 10, [B('on_start'), B('move', { n: 1 })])] }, p);
  const built = MC.buildCustomLevelProject(lv);
  const hero = built.sprites.find((s) => s.id === 'hero');
  assert.deepStrictEqual(hero.scripts[0].blocks.map((b) => b.type), ['on_start', 'move']);
  assert.strictEqual(built.sprites.find((s) => s.kind === 'shark').scripts.length, 1);
  assert.strictEqual(built.rules.heroId, 'hero');
  // building does not change the saved level
  assert.strictEqual(lv.project.sprites.some((s) => s.id === 'hero'), false);
});

test('repairCustomLevel rejects junk and cleans what it keeps', () => {
  assert.throws(() => MC.repairCustomLevel(null));
  assert.throws(() => MC.repairCustomLevel({ project: game(), playerId: 'nobody' }));
  const lv = MC.repairCustomLevel({
    id: 'bad id with spaces!', title: 'x'.repeat(100), playerId: 'fish1', par: 999,
    blocks: ['move', 'evil', 'move', 'repeat'], hazards: ['shark', 'fish', 'shark'],
    win: { type: 'collect', kind: 'unicorn' }, project: game()
  });
  assert.notStrictEqual(lv.id, 'bad id with spaces!');
  assert.strictEqual(lv.title.length, 40);
  assert.strictEqual(lv.par, 99);
  assert.deepStrictEqual(lv.blocks, ['move', 'repeat']);
  assert.deepStrictEqual(lv.hazards, ['shark']);          // the player itself can't be a danger
  assert.deepStrictEqual(lv.win, { type: 'block' });      // no unicorn on the stage
  assert.deepStrictEqual(lv.startScripts[0].blocks.map((b) => b.type), ['on_start']);
  assert.match(MC.levelGoalText({ type: 'collect', kind: 'gem' }), /Collect every 💎 Gem/);
});

test('built-in chapters still play the same', () => {
  const scripts = MC.normalizeScripts([S(20, 20, [B('on_start'), B('move', { n: 3 })])]);
  const engine = new MC.Engine(MC.buildLevelProject(MC.LEVELS[0], scripts), {});
  engine.start();
  for (let t = 0; t < 20000 && engine.status === 'running'; t += 16) engine.update(16);
  assert.strictEqual(engine.status, 'win');
});
