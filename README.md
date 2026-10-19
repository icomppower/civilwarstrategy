# VGA Civil War Strategy — browser rewrite

A TypeScript / HTML5 Canvas rewrite of **VGA Civil War Strategy v1.41**, W.R. Hutsell's 1993 MS-DOS shareware strategic-level wargame of the American Civil War. Zero runtime dependencies; built with Vite.

Play: 1 or 2 players, 40 cities on a point-to-point map, two-month turns from March 1861. Recruit armies, hold and fortify cities, run a fleet, bombard ports, and take the enemy capital before the European powers recognise the Confederacy.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run sim      # headless AI-vs-AI balance run
```

## Layout

```
src/engine/   pure game logic, no DOM — data.ts (cities, leaders), game.ts (rules), ai.ts, rng.ts
src/ui/       map.ts (Canvas renderer), app.ts (menus/reports/save), sound.ts
scripts/      sim.ts / diag.ts headless balance tools, shot.mjs Playwright smoke test
docs/         notes on the original data files
```

## Fidelity to the original

Rules follow `CWS.DOC` (the original manual) and the plain-text data files `CITIES.GRD`, `CWSLEAD.DAT`, `CWS.INI`:

- 40 cities with the original values, links, port flags and fort levels
- 20 named commanders per side with their leadership ratings, then Roman-numeral generics
- Sequential combat adjustments: base → leader/experience → small force → outnumbered table → supply → balance → fort, clamped 1–20
- Recruit (100), ship (100), fortify (200), join to 125,000, manual/auto supply, Union-only invasions, January campaign ban, harvest months
- Five end-game conditions with the victory-condition override, random events with Union/neutral/Rebel bias, variable start, Max Recruit, aggression 0–5
- High-score table (top 5 per side) and single-slot save, both in localStorage

The exact combat dice, casualty formulas and AI heuristics live only in the original `CWS.EXE` and were re-derived from the manual's description rather than disassembled.

## Keys

Letter hotkeys on every menu · `F4` next turn · `Esc` back · click a city on the map when a menu asks for one · hover a city for details.

## Credits

Original game © 1993 W.R. Hutsell, Kingsport TN. This rewrite is an independent re-implementation and is not affiliated with or endorsed by the original author.
