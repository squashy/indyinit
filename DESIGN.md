# Visual system

BTT-15 page shell for Battle for the 92. Geometry, colors, and type live here. Turn flow, pan and zoom, and quiz grading belong to the UI modules that bind this markup.

The contract checked for this pass is `CONTRACT.md` on `main`, identical to commit `98adc1310ba0ea3d870ee30941a58480d99bbf50`. Section 8 layout is the adopted Vite tree. Section 6.3 is the DOM contract. Region names, membership, and bonus numbers stay open (section 11), so this page does not invent them.

## What you see

The map is a paper quilt: warm ground, stitched county edges, and a gold-and-thread frame. Indiana shows up as flag blue, torch gold, and limestone paper. Player colors are a six-color set chosen so they stay apart under color-vision deficiency. Each seat also has its own pattern (rings, stripes, dots, diagonal, crosshatch, bars) and its own swatch shape. The pattern is the non-color cue.

County names and army badges are on the map. Before a game starts, badges read “–” and counties have no `data-owner`. System fonts only. No external images, fonts, or scripts.

Dialogs are sections in the side column, not modal dialogs. The map pane and the side pane scroll separately, including at phone width, so a quiz, battle, or handoff cannot cover the highlighted county.

## Files

| Path | Role |
|---|---|
| `index.html` | Document structure and the first paint of the Indiana map |
| `src/styles.css` | Layout, controls, map states, motion, and focus |
| `src/styles/theme.css` | Indiana tokens and the six player skins |
| `public/assets/mark.svg` | Original torch mark used as the header image and icon |

`src/styles.css` imports the theme. A later state swaps `src/styles/theme.css` and the place-specific sentences. Layout rules stay in `src/styles.css` and do not assume Indiana’s tall shape: the SVG `viewBox` comes from the map pack, and the map column scrolls inside itself.

## DOM contract

These ids are in `index.html`:

`app`, `setup`, `player-list`, `mode`, `start-game`, `continue-game`, `map` (the `svg`), `county-info`, `regions`, `player-stats`, `phase`, `reinforcement-count`, `trip-log`, `quiz-dialog`, `quiz-county`, `quiz-question`, `quiz-choices`, `quiz-result`, `skip-quiz`, `battle-dialog`, `occupy-dialog`, `end-attacks`, `end-turn`, `handoff-dialog`, `winner-dialog`, `error-status`.

County groups:

- `[data-county-id]` is the five-character FIPS id from the map pack.
- `[data-owner]` is `"0"` through `"5"` once a seat owns the county. Leave the attribute off while the county is unassigned.
- Classes on the group: `county`, plus `is-selected`, `is-source`, `is-target`, and `is-quiz-county` when those states are true.
- `.county-label` is the name text. `.army-badge` wraps the count. Write both with `textContent`. Do not use `innerHTML` for names, questions, or log lines.

There is one static copy of each county path (`#county-shape-<fips>`) plus `<use>` copies for the fill and the six pattern overlays (`url(#cue-0)` … `url(#cue-5)`). Pattern fills are presentation attributes so they still resolve when CSS is an external file. Prefer updating the existing `[data-county-id]` nodes. If you redraw the map, keep `#map`, its `viewBox`, and the `<defs>` patterns.

## Hooks for the other UI work

- `#map` is in tab order. Each `.county` is `role="button"` and `tabindex="-1"`. Move `tabindex="0"` to the active county and handle Arrow, Home, End, Enter, and Space there. This shell does not ship that key handler, because `src/ui/map.ts` owns it.
- The map column scrolls on its own. After marking `.is-quiz-county`, scroll that county into the map pane (`scrollIntoView({ block: "nearest", inline: "nearest" })`). The dialog sits in the side pane and does not cover the map. A county below the fold is hidden only until that scroll.
- Update the county `aria-label` when owner or armies change, for example `Adams, seat 1, 3 armies`.
- Remove the `hidden` attribute to show `#quiz-dialog`, `#battle-dialog`, `#occupy-dialog`, `#handoff-dialog`, or `#winner-dialog`. Do not call `showModal`, and do not give these boxes a backdrop. `aria-modal` is `false`.
- Put choice buttons inside `#quiz-choices`. Style already gives them a 44px minimum height. Set `#quiz-county`, `#quiz-question`, and `#quiz-result` with `textContent`.
- `#trip-log` is `role="log"` with `aria-live="polite"`. Append list items. `#error-status` is `role="status"` with `aria-live="assertive"`.
- `#phase` and `#reinforcement-count` are live text. Keep the plain labels (“This step”, “Armies to place”). The count includes the one-time +2 only when the engine says it was earned.
- Setup fields are `player-name-0` … `player-name-5` and `player-kind-0` … `player-kind-5` (`human` or `computer`). Win mode radios use `win-mode` values `quick60` and `total92`. Quick starts checked because that is the proposed default, not a new rule.
- Occupation amount is the number input `occupy-count`. The handoff button uses class `handoff-ready`.
- `#regions` contains an empty `ul` for reviewed region rows. Do not display draft bonus values from the pack as if they were final.
- `#county-info` is only for facts supplied on the county. Do not write a fact that is not in the pack. With the current map pack, every county’s fact list is empty, so the box stays on its empty sentence.
- There is no `<script>` yet. `src/main.ts` is not in this slice. Add `<script type="module" src="/src/main.ts"></script>` at the end of `body` when that file exists. Adding it sooner breaks the production build.
- Buttons other than the contract ids that this page introduces: class `handoff-ready` only.

## Accessibility choices

- Body type is 18px equivalent, with a slightly tighter size only on short Chromebook viewports.
- Buttons, text inputs, the how-to-play summary, radio rows, and player swatches are at least 44px. County shapes follow the real outlines, so a county can be smaller than 44px until the map is zoomed. Zoom stays with the map module.
- Focus uses a gold ring with an offset, including on the blue buttons. Counties draw a thick edge on `:focus-visible`.
- `prefers-reduced-motion: reduce` cuts transitions, animations, and smooth scrolling. The page does not rely on motion.
- The page itself does not scroll sideways. The map column and the side column scroll on their own.

## Copy

How-to-play text is the locked rules in short sentences: random deal, fixed +2 once, skip or wrong gives 0, adjacent attacks, defender wins ties, mandatory move-in, one end-of-turn move, Quick at 60, Total at 92. It does not state starting army pools, a second-player bonus, region bonus numbers, or any county history. Those pools and the second-player bonus are still proposed defaults, and region bonuses are open.

## Check

Open the Vite page and confirm every id above, six `data-owner` skins, the four county state classes, a visible focus ring, and a quiz section that sits beside the map rather than on top of it. Phone, 1366×768, and a wide desktop all use the same panes. This file does not claim a full turn of play.
