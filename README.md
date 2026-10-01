# 🐒 Monkey Coder

A no-code programming game for kids, inspired by CodeMonkey. Children snap colourful **logic blocks** together and drag **pictures** onto a stage to solve story puzzles and build their own little games. No typing needed.

It's plain HTML, CSS and JavaScript: no build step, no server and no image files (all pictures are emoji). **Just open `index.html` in a browser.** It works with a mouse or on a tablet with touch.

## Two ways to play

### 📖 Story Adventure
A 6-chapter story about Momo the monkey. Each chapter puts a puzzle on the stage, and the child drags blocks under **“when ▶ Run clicked”** to get Momo to the bananas.

| Chapter | What it teaches |
|---|---|
| 1. Hungry Monkey | `move` and choosing how many steps |
| 2. Up the Hill | `turn` (sequencing) |
| 3. Banana Pond | `repeat` loops |
| 4. Banana Stairs | loops with a pattern inside |
| 5. Sleepy Crocodile | `jump` over danger |
| 6. Crocodile River | loops + jumping together |

Shorter programs earn more ⭐ stars, the same idea CodeMonkey uses to encourage loops. Blocks light up while they run, so kids can see what their code is doing. Progress is saved in the browser.

### 🎨 Game Maker
Start from a story template (**Banana Party**, **Space Rescue**, **Ocean Treasure**) or from an empty page, then:

- **Drag pictures** from the picture box onto the stage (or tap one to add it). There are 50+ characters, treats, obstacles and places.
- **Add your own pictures** with “📷 Add my own picture”, or drop an image file straight onto the stage.
- **Click a character** to see its code, and drag blocks in to give it behaviour.
- **Move characters** by dragging them around the stage. Mark any of them as a 🧱 wall.
- Press **▶ Run** and play with the arrow keys (or the on-screen arrows on tablets).
- Games are saved automatically. **Save to file** / **Open file** lets kids keep or share a game (`.monkey.json`).

## The blocks

| Category | Blocks |
|---|---|
| ⚡ Events | when ▶ Run clicked · when [key] pressed · when I touch [thing] · every [n] seconds |
| 🏃 Move | move [n] steps · turn [left/right] · jump · step [direction] [n] · step toward [thing] · step randomly · jump to a random spot · set speed |
| 💬 Looks | say [text] · hide · show · spin |
| 🔁 Control | repeat [n] times · forever · wait [n] seconds · if touching [thing] · if score ≥ [n] |
| 🏆 Game | collect it · add [n] to score · play sound · you win! · game over |

Drag a block out of the code area (back to the block box or onto the 🗑️) to delete it. Dropping a block under, inside or on top of another one snaps it into place.

## Project layout

```
index.html        page layout
css/style.css     all styling (light and dark)
js/assets.js      pictures (emoji) and backgrounds
js/blocks.js      block definitions and helpers
js/engine.js      runs the programs (no DOM, so it can be tested in Node)
js/levels.js      Story Adventure chapters (maps are drawn as text)
js/templates.js   Game Maker starter games
js/stage.js       draws the world on a <canvas>
js/editor.js      drag-and-drop block editor (Pointer Events: mouse + touch)
js/app.js         ties everything together
tests/            engine tests
```

### Adding a story chapter
Add an entry to `MC.LEVELS` in `js/levels.js`. Maps are 10×7 text grids: `M` monkey, `B` banana, `C` crocodile, `W` water, `T` tree, `#` wall, `f` flower. Then add its solution to `tests/engine.test.js`. The test checks that every chapter can be won with 3 stars.

## Development

```bash
npm test     # runs the engine tests with Node's built-in test runner
npm start    # optional: serve the folder at http://localhost:3000
```
