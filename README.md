# funkick

An offline picture puzzle with art and photo collections.

Open `puzzle-game.html` in a browser. Keep the theme scripts, `lucide.min.js`,
and GIF files alongside the HTML. No development server is required.

- Tutorial: a two-picture practice game with a one-swap opening.
- Relax: unlimited time, with free hints.
- Normal / Hard: timed challenges with combo and rotating region rewards.
- Completed theme pictures, achievements, preferences, and personal bests are
  stored in the current browser's local storage. Uploaded images stay in memory.
- The toolbar provides hints, undo before a clear, pause, fragment inspection,
  shuffle, and image upload. Gallery and fragment dialogs pause the game.

## Verification

With Node.js and Playwright installed, run:

```sh
node tests/puzzle-game.cjs
```

The test opens the local HTML in Chromium, verifies both themes and the main
game flows, and writes desktop/mobile screenshots to a temporary directory.
If Chromium is not installed for Playwright, run `npx playwright install chromium`.

Lucide icons are bundled locally under the ISC license in `lucide.LICENSE`.
