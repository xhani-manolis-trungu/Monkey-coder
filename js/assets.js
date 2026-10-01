/* Pictures (sprites) and backgrounds that kids can use. */
(function (MC) {
  'use strict';

  // Every picture is an emoji so the app works offline with no image files.
  // `solid: true` means other characters can't walk through it (a wall).
  MC.IMAGES = [
    // Heroes
    { id: 'monkey', emoji: '🐒', name: 'Monkey', group: 'Heroes' },
    { id: 'cat', emoji: '🐱', name: 'Cat', group: 'Heroes' },
    { id: 'dog', emoji: '🐶', name: 'Dog', group: 'Heroes' },
    { id: 'frog', emoji: '🐸', name: 'Frog', group: 'Heroes' },
    { id: 'rabbit', emoji: '🐰', name: 'Bunny', group: 'Heroes' },
    { id: 'unicorn', emoji: '🦄', name: 'Unicorn', group: 'Heroes' },
    { id: 'robot', emoji: '🤖', name: 'Robot', group: 'Heroes' },
    { id: 'penguin', emoji: '🐧', name: 'Penguin', group: 'Heroes' },
    { id: 'turtle', emoji: '🐢', name: 'Turtle', group: 'Heroes' },
    { id: 'fish', emoji: '🐠', name: 'Fish', group: 'Heroes' },
    { id: 'rocket', emoji: '🚀', name: 'Rocket', group: 'Heroes' },
    { id: 'car', emoji: '🚗', name: 'Car', group: 'Heroes' },
    // Baddies
    { id: 'crocodile', emoji: '🐊', name: 'Crocodile', group: 'Baddies' },
    { id: 'shark', emoji: '🦈', name: 'Shark', group: 'Baddies' },
    { id: 'ghost', emoji: '👻', name: 'Ghost', group: 'Baddies' },
    { id: 'dragon', emoji: '🐉', name: 'Dragon', group: 'Baddies' },
    { id: 'ufo', emoji: '🛸', name: 'UFO', group: 'Baddies' },
    { id: 'alien', emoji: '👾', name: 'Space bug', group: 'Baddies' },
    { id: 'bee', emoji: '🐝', name: 'Bee', group: 'Baddies' },
    { id: 'snake', emoji: '🐍', name: 'Snake', group: 'Baddies' },
    { id: 'octopus', emoji: '🐙', name: 'Octopus', group: 'Baddies' },
    // Treats
    { id: 'banana', emoji: '🍌', name: 'Banana', group: 'Treats' },
    { id: 'apple', emoji: '🍎', name: 'Apple', group: 'Treats' },
    { id: 'strawberry', emoji: '🍓', name: 'Strawberry', group: 'Treats' },
    { id: 'carrot', emoji: '🥕', name: 'Carrot', group: 'Treats' },
    { id: 'cake', emoji: '🍰', name: 'Cake', group: 'Treats' },
    { id: 'star', emoji: '⭐', name: 'Star', group: 'Treats' },
    { id: 'gem', emoji: '💎', name: 'Gem', group: 'Treats' },
    { id: 'heart', emoji: '❤️', name: 'Heart', group: 'Treats' },
    { id: 'key', emoji: '🔑', name: 'Key', group: 'Treats' },
    { id: 'gift', emoji: '🎁', name: 'Present', group: 'Treats' },
    { id: 'crown', emoji: '👑', name: 'Crown', group: 'Treats' },
    { id: 'trophy', emoji: '🏆', name: 'Trophy', group: 'Treats' },
    // Obstacles
    { id: 'wall', emoji: '🧱', name: 'Wall', group: 'Obstacles', solid: true },
    { id: 'tree', emoji: '🌳', name: 'Tree', group: 'Obstacles', solid: true },
    { id: 'palm', emoji: '🌴', name: 'Palm tree', group: 'Obstacles', solid: true },
    { id: 'cactus', emoji: '🌵', name: 'Cactus', group: 'Obstacles', solid: true },
    { id: 'mountain', emoji: '⛰️', name: 'Mountain', group: 'Obstacles', solid: true },
    { id: 'meteor', emoji: '☄️', name: 'Meteor', group: 'Obstacles', solid: true },
    { id: 'water', emoji: '🌊', name: 'Water', group: 'Obstacles' },
    { id: 'fire', emoji: '🔥', name: 'Fire', group: 'Obstacles' },
    { id: 'bomb', emoji: '💣', name: 'Bomb', group: 'Obstacles' },
    // Places & things
    { id: 'house', emoji: '🏠', name: 'House', group: 'Places', solid: true },
    { id: 'castle', emoji: '🏰', name: 'Castle', group: 'Places', solid: true },
    { id: 'tent', emoji: '⛺', name: 'Tent', group: 'Places' },
    { id: 'flag', emoji: '🚩', name: 'Flag', group: 'Places' },
    { id: 'flower', emoji: '🌸', name: 'Flower', group: 'Places' },
    { id: 'mushroom', emoji: '🍄', name: 'Mushroom', group: 'Places' },
    { id: 'planet', emoji: '🪐', name: 'Planet', group: 'Places' },
    { id: 'moon', emoji: '🌙', name: 'Moon', group: 'Places' },
    { id: 'cloud', emoji: '☁️', name: 'Cloud', group: 'Places' },
    { id: 'snowman', emoji: '⛄', name: 'Snowman', group: 'Places' },
    { id: 'ball', emoji: '⚽', name: 'Ball', group: 'Places' }
  ];

  MC.IMAGE_GROUPS = ['Heroes', 'Baddies', 'Treats', 'Obstacles', 'Places'];

  MC.IMAGE_MAP = {};
  MC.IMAGES.forEach(function (img) { MC.IMAGE_MAP[img.id] = img; });

  // Backgrounds are a checkerboard of two colours.
  MC.BACKGROUNDS = {
    jungle: { name: 'Jungle', a: '#c4eba5', b: '#b3e08e', line: 'rgba(60,110,40,0.10)' },
    beach: { name: 'Beach', a: '#fbe9b7', b: '#f6dd9b', line: 'rgba(150,110,40,0.10)' },
    ocean: { name: 'Ocean', a: '#a6dcf6', b: '#93d1f1', line: 'rgba(20,90,140,0.12)' },
    space: { name: 'Space', a: '#1f2457', b: '#262d68', line: 'rgba(255,255,255,0.07)', stars: true },
    snow: { name: 'Snow', a: '#f1f7fb', b: '#e3eef6', line: 'rgba(60,100,140,0.10)' },
    candy: { name: 'Candy land', a: '#ffd9ec', b: '#ffc7e2', line: 'rgba(160,40,100,0.10)' }
  };

  /** Information about a picture: built-in emoji or a picture the child uploaded. */
  MC.imageInfo = function (kind, project) {
    if (MC.IMAGE_MAP[kind]) return MC.IMAGE_MAP[kind];
    var custom = project && project.images && project.images.find(function (i) { return i.id === kind; });
    if (custom) return { id: custom.id, name: custom.name, src: custom.src, custom: true, group: 'Mine' };
    return { id: kind, emoji: '❓', name: kind };
  };

  MC.kindLabel = function (kind, project) {
    var info = MC.imageInfo(kind, project);
    return (info.emoji || '🖼️') + ' ' + info.name;
  };
})(typeof window !== 'undefined' ? (window.MC = window.MC || {}) : (global.MC = global.MC || {}));
