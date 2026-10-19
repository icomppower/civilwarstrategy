import { CITIES, cityDef } from './data';
import { FORT_COST, Game, RECRUIT_COST, SHIP_COST } from './game';
import type { Army, Side } from './types';
import { other } from './types';

/** BFS distances from a set of city ids over the link graph. */
function distances(from: number[]): Map<number, number> {
  const d = new Map<number, number>();
  const q: number[] = [];
  for (const f of from) { d.set(f, 0); q.push(f); }
  while (q.length) {
    const c = q.shift()!;
    for (const n of cityDef(c).links) if (!d.has(n)) { d.set(n, d.get(c)! + 1); q.push(n); }
  }
  return d;
}

export function runAI(g: Game, side: Side) {
  const st = g.state;
  const ss = st.sides[side];
  const enemy = other(side);
  const aggr = st.settings.aggression;
  const enemyCities = () => g.ownedCities(enemy).map((c) => c.id);
  const enemyStrengthAt = (id: number) => g.armiesAt(id, enemy).reduce((n, a) => n + a.strength, 0);
  const frontier = (id: number) => cityDef(id).links.some((l) => g.city(l).owner !== side);
  const threatened = (id: number) => cityDef(id).links.reduce((n, l) => n + enemyStrengthAt(l), 0);

  // ---- recruit (keep a reserve for supplies)
  const reserve = Math.min(150, Math.round(g.totalStrength(side) / 1000) * 2);
  let tries = 0;
  while (ss.money >= RECRUIT_COST + reserve && ss.recruitsThisTurn < 4 && tries++ < 8) {
    const cands = ss.recruitCities.filter((c) => g.city(c).owner === side);
    if (!cands.length) break;
    const scored = cands.map((c) => {
      const mine = g.armiesAt(c, side);
      let sc = frontier(c) ? 10 : 2;
      sc += threatened(c) / 5000;
      if (c === ss.capital) sc += 4;
      if (!mine.length && g.armiesOf(side).length < 6 + aggr) sc += 6; // new army
      if (mine.length && mine[0].strength > 60000) sc -= 8;
      return { c, sc };
    });
    scored.sort((a, b) => b.sc - a.sc);
    if (g.recruit(side, scored[0].c)) break;
  }

  // ---- navy
  const f = ss.fleet;
  if (f.ships > 0) {
    if (g.city(f.port).owner === enemy) g.bombard(side);
    else if (f.ships >= 3 && g.rng.chance(0.3 + aggr * 0.1)) {
      const targets = CITIES.filter((c) => c.port !== 0 && g.city(c.id).owner === enemy && g.city(c.id).fort < 2).map((c) => c.id);
      if (targets.length) { g.moveFleet(side, g.rng.pick(targets)); g.bombard(side); }
    } else if (f.ships < 6 && ss.money >= SHIP_COST + 250 && g.rng.chance(0.3)) g.buildShip(side);
  } else if (ss.money >= SHIP_COST + 300 && g.rng.chance(0.2)) {
    const ports = CITIES.filter((c) => c.port !== 0 && g.city(c.id).owner === side);
    if (ports.length) { f.port = g.rng.pick(ports).id; g.buildShip(side); }
  }
  if (side === 'union') {
    const inv = g.invasionTargets(side);
    if (inv.length && f.ships >= 4 && g.rng.chance(0.4)) g.invade(side, g.rng.pick(inv));
  }

  // ---- join stacked armies
  for (const c of g.joinCandidates(side)) {
    const tot = g.armiesAt(c, side).reduce((n, a) => n + a.strength, 0);
    if (tot <= 125000 && (threatened(c) > tot * 0.5 || g.rng.chance(0.5))) g.join(side, c);
  }

  // ---- fortify
  for (const c of g.fortifyCandidates(side)) {
    if (ss.money < FORT_COST + 100) break;
    const isCap = c === ss.capital;
    const p = (isCap ? 0.6 : 0.25) * (frontier(c) ? 1 : 0.2) * ((6 - aggr) / 6) + (threatened(c) > 0 ? 0.3 : 0);
    if (g.rng.chance(Math.min(0.9, p))) g.fortify(side, c);
  }

  // ---- moves
  const distToEnemy = distances(enemyCities().length ? enemyCities() : [st.sides[enemy].capital]);
  const attackThreshold = 0.72 - aggr * 0.07;
  const capitalId = ss.capital;
  const capitalHeld = g.city(capitalId).owner === side;
  const atCapital = g.armiesAt(capitalId, side);
  const capThreat = capitalHeld ? threatened(capitalId) : 0;

  for (const a of g.movable(side).sort((x, y) => y.strength - x.strength)) {
    // a garrison stays home if the capital is threatened
    if (a.city === capitalId && capitalHeld && (capThreat > 0 || atCapital.length === 1)) {
      if (!(aggr >= 4 && capThreat === 0)) continue;
    }
    const here = a.city;
    const options = cityDef(here).links;
    let best: { dest: number; sc: number } | null = null;
    const consider = (dest: number, sc: number) => { if (!best || sc > best.sc) best = { dest, sc }; };
    const jan = g.isJanuary() && !st.settings.janCampaigns;
    for (const dest of options) {
      const c = g.city(dest);
      const d = cityDef(dest);
      if (c.owner === side) {
        // reinforce a threatened friendly city, especially the capital
        const th = threatened(dest);
        const garrison = g.armiesAt(dest, side).reduce((n, x) => n + x.strength, 0);
        if (th > garrison) consider(dest, 20 + (dest === capitalId ? 30 : 0) + (th - garrison) / 2000);
        else if ((distToEnemy.get(dest) ?? 9) < (distToEnemy.get(here) ?? 9) && threatened(here) === 0) consider(dest, 5 + aggr * 2 + d.value / 10);
        continue;
      }
      if (jan) continue;
      const defs = g.armiesAt(dest, enemy);
      if (c.owner === 'neutral') { consider(dest, 25 + d.value); continue; }
      if (!defs.length) { consider(dest, 40 + d.value * 2 + (dest === st.sides[enemy].capital ? 60 : 0)); continue; }
      // estimate odds vs the strongest defender
      const strongest = defs.reduce((m, x) => (x.strength > m.strength ? x : m));
      const odds = g.odds(a, strongest, c);
      const totalDef = defs.reduce((n, x) => n + x.strength, 0);
      if (odds >= attackThreshold && a.strength > totalDef * (0.8 - aggr * 0.1)) {
        consider(dest, 30 + odds * 60 + d.value + (dest === st.sides[enemy].capital ? 50 : 0));
      }
    }
    const b = best as { dest: number; sc: number } | null;
    if (b && (b.sc >= 10 || aggr >= 3)) {
      // don't strip a valuable or threatened frontier city of its last army
      const lastHere = g.armiesAt(here, side).filter((x) => x.orders < 0).length === 1;
      const valuable = cityDef(here).value >= 10 || here === capitalId;
      const leaving = lastHere && frontier(here) && (threatened(here) > 0 || valuable) && b.sc < 40 + aggr * 5;
      if (!leaving) g.order(a.id, b.dest);
    }
  }

  // ---- supply the starving
  for (const a of g.armiesOf(side).filter((x: Army) => x.supply === 0)) {
    if (ss.money < 50) break;
    g.resupply(side, a.id);
  }
}
