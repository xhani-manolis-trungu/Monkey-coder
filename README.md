# 🐒 Monkey Coder

A no-code programming game for kids, inspired by CodeMonkey. Children snap colourful **logic blocks** together and drag **pictures** onto a stage to solve story puzzles and build their own little games. No typing needed.

It's plain HTML, CSS and JavaScript: no build step, no server and no image files (all pictures are emoji). **Just open `index.html` in a browser.** It works with a mouse or on a tablet with touch. It can be [installed on Android phones and tablets](#install-on-android-and-iphone-pwa), and there's also a [Windows desktop app](#windows-desktop-app).

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

The first time a child opens Chapter 1, a **guided tour** walks them through it. The page dims, a glowing spotlight with soft bokeh lights glides to each thing they need to use, and a pretend hand pointer shows what to do (it even demonstrates dragging a block). Steps that ask the child to act wait until they've done it. They can replay it any time with **🧭 Show me how**.

If the code finishes before Momo has every banana, Momo simply stays where it stopped, still facing the same way, even while the child changes the code. A faint Momo marks the start square: **▶ Run** tries the whole program again from there, and **↺ Reset** puts everything back.

Shorter programs earn more ⭐ stars, the same idea CodeMonkey uses to encourage loops. Blocks light up while they run, so kids can see what their code is doing. Progress is saved in the browser.

### 🎨 Game Maker
Start from a story template (**Banana Party**, **Space Rescue**, **Ocean Treasure**) or from an empty page, then:

- **Drag pictures** from the picture box onto the stage (or tap one to add it). There are 50+ characters, treats, obstacles and places.
- **Add your own pictures** with “📷 Add my own picture”, or drop an image file straight onto the stage.
- **Click a character** to see its code, and drag blocks in to give it behaviour.
- **Move characters** by dragging them around the stage. Mark any of them as a 🧱 wall.
- Press **▶ Run** and play with the arrow keys (or the on-screen arrows on tablets).
- Tick **⛶ Play full screen when I press Run** (under the stage) to make the stage fill the whole screen every time a game starts, or press **⛶** any time. Press **Esc** or **✕ Exit** to come back. This works in both modes.
- Games are saved automatically. **Save to file** / **Open file** lets kids keep or share a game (`.monkey.json`).

## The blocks

Every block has a picture at its start, so children who are still learning to read can tell blocks apart.

| Category | Blocks |
|---|---|
| ⚡ Events | 🏁 when ▶ Run clicked · ⌨️ when [key] pressed · 🤝 when I touch [thing] · ⏰ every [n] seconds |
| 🏃 Move | 👣 move [n] steps · ↩️/↪️ turn [left/right] · 🦘 jump · 👟 step [direction] [n] · 🎯 step toward [thing] · 🎲 step randomly · 🔀 jump to a random spot · ⏱️ set speed |
| 💬 Looks | 💬 say [text] · 🙈 hide · 👀 show · 🌀 spin |
| 🔁 Control | 🔁 repeat [n] times · ♾️ forever · ⏳ wait [n] seconds · 🤔 if touching [thing] · 🏅 if score ≥ [n] |
| 🏆 Game | 🧺 collect it · ➕ add [n] to score · 🔊 play sound · 🏆 you win! · 💥 game over |

Drag a block out of the code area (back to the block box or onto the 🗑️) to delete it. Dropping a block under, to the right of, inside or on top of another one snaps it into place. A script can grow sideways as well as down, like a chain: it runs in chain order, from the first block to the last, whether each one is attached underneath or to the right.

Scripts can go anywhere in the code area: drag a script by its top block and drop it where you like. It lands on the nearest dot so scripts line up, and the code area scrolls by itself when you drag near its edge. The **Arrange** buttons line all scripts up for you: **⬇** one under another, **➡** side by side, or **▦** as a grid that fills the space.

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
js/tour.js        guided tour (spotlight, bokeh, pretend hand pointer)
js/app.js         ties everything together
manifest.webmanifest, sw.js, icons/   installable app (PWA)
tests/            engine tests
fonts/            Baloo 2 font, shipped with the app so it works offline
electron/main.js  Windows desktop app window (Electron)
build/icon.png    desktop app icon
```

### Adding a story chapter
Add an entry to `MC.LEVELS` in `js/levels.js`. Maps are 10×7 text grids: `M` monkey, `B` banana, `C` crocodile, `W` water, `T` tree, `#` wall, `f` flower. Then add its solution to `tests/engine.test.js`. The test checks that every chapter can be won with 3 stars.

## Development

```bash
npm test     # runs the engine tests with Node's built-in test runner
npm start    # optional: serve the folder at http://localhost:3000
npm run app  # optional: run it as a desktop app (after npm install)
```

The same tests run on GitHub Actions for every pull request and every push to `main` (`.github/workflows/test.yml`).

## Install on Android (and iPhone): PWA

Monkey Coder is an installable web app (a *PWA*). On a phone or tablet it gets its own home-screen icon, opens full screen without the browser's address bar, and keeps working with no internet.

**Play or install it:** https://xhani-manolis-trungu.github.io/Monkey-coder/

- **Android (Chrome):** open the link and press **📲 Install** at the top of the game, or Chrome's **⋮** menu → **Install app** / **Add to Home screen**.
- **iPhone / iPad (Safari):** open the link, press **Share** → **Add to Home Screen**.

Updates arrive by themselves: the app checks for a new version in the background and uses it the next time it's opened.

How it works: `manifest.webmanifest` gives the app its name, colours and icons (`icons/`, including a *maskable* icon that Android shapes into a circle or squircle). `sw.js` is a service worker that keeps a copy of every file on the device; `tests/pwa.test.js` makes sure its file list matches what the page loads. The **Website** workflow (`.github/workflows/pages.yml`) publishes the game to GitHub Pages on every push to `main`.

One-time setup for GitHub Pages: in the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.

To try the installable version on your own computer, serve the folder (`npm start`) and open it at `http://localhost:3000`. Service workers don't run when `index.html` is opened directly as a file.

## Windows desktop app

The same game also comes as a Windows program, built with [Electron](https://www.electronjs.org/). It runs the same `index.html` in its own window, so it needs nothing else installed and works without the internet.

- **Get it:** open the **Windows app** workflow run on GitHub Actions and download **Monkey-Coder-Windows**. Every push to `main` and every pull request builds it. Pushing a tag such as `v1.1.0` also attaches the files to a GitHub Release with that version number.
- `Monkey-Coder-Setup-<version>.exe` installs the app with Start menu and desktop shortcuts. It doesn't need administrator rights.
- `Monkey-Coder-Portable-<version>.exe` runs straight away without installing, from a USB stick for example.

The app isn't code-signed, so the first time it runs Windows may show **“Windows protected your PC”**. Click **More info → Run anyway**. Removing this warning needs a code-signing certificate (electron-builder can use one through its `CSC_LINK` and `CSC_KEY_PASSWORD` settings).

How it differs from the browser version:

- Progress and games are saved inside the app (in `%APPDATA%\Monkey Coder`), not in the browser.
- **💾 Save to file** opens a normal Windows *Save as* box, starting in *Documents*.
- There's no menu bar. **F11** toggles full screen, and **Ctrl +**, **Ctrl −** and **Ctrl 0** zoom.
- The window can only show the game: links to websites open in the normal browser.

To build it yourself on Windows: `npm install`, then `npm run dist`. The `.exe` files appear in `dist/`. The app icon is the 🐒 from [Noto Color Emoji](https://github.com/googlefonts/noto-emoji) (SIL Open Font License).
