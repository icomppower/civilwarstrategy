import {
  CITIES, cityDef, UNION_LEADERS, REBEL_LEADERS, START_ARMIES, START_MONEY, START, END,
  CAPITALS, UNION_PORT_BOX, MONTHS, ROMAN,
} from './data';
import { Rng } from './rng';
import type {
  Army, BattleReport, City, CombatCalc, GameState, Owner, Settings, Side, SideState,
} from './types';
import { SIDES, other } from './types';

export const RECRUIT_COST = 100;
export const SHIP_COST = 100;
export const FORT_COST = 200;
export const CAPITAL_MOVE_COST = 200;
export const MAX_ARMY = 125000;
export const MAX_FLEET = 10;
export const SHIP_HITS = 10;
export const CAPITAL_BONUS = 50;
export const UNION_OUTSIDE_INCOME = 120;

export const DEFAULT_SETTINGS: Settings = {
  players: 1,
  humanSide: 'union',
  balance: 0,
  events: 'neutral',
  janCampaigns: false,
  maxRecruit: false,
  aggression: 1,
  graphics: 2,
  sound: true,
  endCond: { time: true, cities: true, income: true, capital: true, ratio: true },
};

const sideName = (s: Side) => (s === 'union' ? 'Union' : 'Rebel');
const fmt = (n: number) => n.toLocaleString('en-US');

export class Game {
  state: GameState;
  rng: Rng;
  /** battle reports from the most recent update phase, for the UI */
  lastBattles: BattleReport[] = [];

  constructor(settings: Settings = DEFAULT_SETTINGS, seed = Date.now() & 0xffffffff, varyStart = false) {
    this.rng = new Rng(seed);
    this.state = this.createState(settings, seed, varyStart);
    this.updateIncome();
    this.pickRecruitCities('union');
    this.pickRecruitCities('rebel');
  }

  static fromJSON(json: string): Game {
    const g = Object.create(Game.prototype) as Game;
    g.state = JSON.parse(json) as GameState;
    g.rng = new Rng(g.state.rng);
    g.lastBattles = [];
    return g;
  }
  toJSON(): string {
    this.state.rng = this.rng.seed;
    return JSON.stringify(this.state);
  }

  // ---------------------------------------------------------------- setup
  private createState(settings: Settings, seed: number, vary: boolean): GameState {
    const cities: City[] = CITIES.map((c) => ({
      id: c.id,
      owner: c.region === 1 ? 'union' : c.region === 2 ? 'rebel' : 'neutral',
      fort: c.fort,
    }));
    const mkSide = (s: Side): SideState => ({
      money: START_MONEY[s],
      vp: 0,
      bonusVp: 0,
      income: 0,
      capital: CAPITALS[s],
      capitalLost: false,
      battlesWon: 0,
      casualties: 0,
      fleet: {
        ships: s === 'union' ? 2 : 1,
        hits: s === 'union' ? [SHIP_HITS, SHIP_HITS] : [SHIP_HITS],
        port: s === 'union' ? UNION_PORT_BOX : 28,
        movedThisTurn: false,
      },
      leadersUsed: [],
      leadersLost: [],
      genericCount: 0,
      recruitCities: [],
      recruitsThisTurn: 0,
    });
    const st: GameState = {
      month: START.month,
      year: START.year,
      turn: 1,
      phase: 'decision',
      activeSide: settings.players === 2 ? 'union' : settings.humanSide,
      cities,
      armies: [],
      nextArmyId: 1,
      sides: { union: mkSide('union'), rebel: mkSide('rebel') },
      settings: { ...settings, endCond: { ...settings.endCond } },
      thresholds: { endMonth: END.month, endYear: END.year, citiesPct: 80, incomePct: 80, ratio: 3 },
      log: [],
      banner: '',
      winner: null,
      endReason: '',
      overrideCount: 0,
      rng: seed,
    };
    this.state = st;
    for (const s of SIDES) {
      for (const [city, str, fortBonus, supply, li] of START_ARMIES[s]) {
        const roster = s === 'union' ? UNION_LEADERS : REBEL_LEADERS;
        const strength = vary ? Math.round((str * this.rng.int(70, 130)) / 100 / 100) * 100 : str;
        this.spawnArmy(s, city, strength, roster[li].rating, roster[li].name, li, supply, vary ? this.rng.int(0, 2) : 0);
        if (fortBonus && vary && this.rng.chance(0.5)) st.cities[city - 1].fort = Math.min(2, st.cities[city - 1].fort + 1);
      }
      st.sides[s].money = vary ? START_MONEY[s] + this.rng.int(0, 150) : START_MONEY[s];
    }
    if (vary) {
      // a couple of border cities may start already claimed
      for (const c of st.cities) {
        if (c.owner === 'neutral' && this.rng.chance(0.3)) c.owner = this.rng.chance(0.5) ? 'union' : 'rebel';
      }
    }
    this.log('major', `${MONTHS[st.month]} ${st.year} — The war begins.`);
    return st;
  }

  private spawnArmy(side: Side, city: number, strength: number, leader: number, name: string, leaderIdx: number, supply = 8, exp = 0): Army {
    const a: Army = {
      id: this.state.nextArmyId++,
      side, name, strength, leader, exp, supply, city,
      orders: -1, busy: false, movedThisTurn: false, foughtThisTurn: false, resting: false,
    };
    this.state.armies.push(a);
    if (leaderIdx >= 0) this.state.sides[side].leadersUsed.push(leaderIdx);
    return a;
  }

  // -------------------------------------------------------------- queries
  get s() { return this.state; }
  city(id: number): City { return this.state.cities[id - 1]; }
  def = cityDef;
  armiesAt(cityId: number, side?: Side): Army[] {
    return this.state.armies.filter((a) => a.city === cityId && (!side || a.side === side));
  }
  armiesOf(side: Side): Army[] { return this.state.armies.filter((a) => a.side === side); }
  army(id: number): Army | undefined { return this.state.armies.find((a) => a.id === id); }
  ownedCities(side: Owner): City[] { return this.state.cities.filter((c) => c.owner === side); }
  isPort(id: number): boolean { return cityDef(id).port !== 0; }
  isSeaPort(id: number): boolean { return cityDef(id).port === 99; }
  totalStrength(side: Side): number { return this.armiesOf(side).reduce((n, a) => n + a.strength, 0); }
  isJanuary(): boolean { return this.state.month === 1; }
  harvest(): boolean { return this.state.month === 7 || this.state.month === 9; }
  dateStr(): string { return `${MONTHS[this.state.month]} ${this.state.year}`; }
  isHuman(side: Side): boolean { return this.state.settings.players === 2 || this.state.settings.humanSide === side; }
  blockaded(cityId: number, side: Side): boolean {
    const ef = this.state.sides[other(side)].fleet;
    return ef.ships > 0 && ef.port === cityId;
  }
  availableLeader(side: Side): { name: string; rating: number; idx: number } {
    const roster = side === 'union' ? UNION_LEADERS : REBEL_LEADERS;
    const ss = this.state.sides[side];
    for (let i = 0; i < roster.length; i++) {
      if (!ss.leadersUsed.includes(i) && !ss.leadersLost.includes(i)) return { ...roster[i], idx: i };
    }
    ss.genericCount++;
    const n = ss.genericCount;
    return { name: `${sideName(side)} ${ROMAN[n] ?? n}`, rating: this.rng.int(3, 6), idx: -1 };
  }
  hasNamedLeader(side: Side): boolean {
    const roster = side === 'union' ? UNION_LEADERS : REBEL_LEADERS;
    const ss = this.state.sides[side];
    return roster.some((_, i) => !ss.leadersUsed.includes(i) && !ss.leadersLost.includes(i));
  }
  log(kind: 'info' | 'battle' | 'event' | 'major', text: string) {
    this.state.log.push({ turn: this.state.turn, text, kind });
    if (this.state.log.length > 400) this.state.log.splice(0, this.state.log.length - 400);
    if (kind === 'major' && !text.startsWith('—')) this.state.banner = text;
  }

  balanceMult(side: Side, per = 0.1): number {
    const b = this.state.settings.balance;
    return 1 + per * (side === 'union' ? b : -b);
  }

  // ------------------------------------------------------ decision actions
  pickRecruitCities(side: Side) {
    const owned = this.ownedCities(side).map((c) => c.id);
    const n = Math.min(owned.length, this.rng.int(2, 4));
    this.state.sides[side].recruitCities = this.rng.shuffle(owned).slice(0, n);
    this.state.sides[side].recruitsThisTurn = 0;
  }

  recruitSize(side: Side, cityId: number, isNew: boolean): number {
    let n = (isNew ? 7000 : 4500) * this.balanceMult(side);
    if (this.state.settings.maxRecruit) {
      const v = cityDef(cityId).value;
      n *= Math.min(3, Math.max(0.5, v / 12.5));
    }
    return Math.round(n / 100) * 100;
  }

  recruit(side: Side, cityId: number): string | null {
    const ss = this.state.sides[side];
    if (ss.money < RECRUIT_COST) return 'Not enough money (100 needed).';
    if (!ss.recruitCities.includes(cityId)) return 'Recruiting is not available there this turn.';
    if (this.city(cityId).owner !== side) return 'You do not control that city.';
    const existing = this.armiesAt(cityId, side);
    ss.money -= RECRUIT_COST;
    ss.recruitsThisTurn++;
    if (existing.length) {
      const a = existing.reduce((m, x) => (x.strength < m.strength ? x : m));
      const n = this.recruitSize(side, cityId, false);
      a.strength = Math.min(MAX_ARMY, a.strength + n);
      this.log('info', `${fmt(n)} recruits join ${a.name} at ${cityDef(cityId).name}.`);
    } else {
      const ld = this.availableLeader(side);
      const n = this.recruitSize(side, cityId, true);
      const a = this.spawnArmy(side, cityId, n, ld.rating, ld.name, ld.idx, 8, side === 'rebel' ? this.rng.int(0, 2) : this.rng.int(0, 1));
      a.busy = true;
      this.log('info', `${ld.name} raises a new army of ${fmt(n)} at ${cityDef(cityId).name}.`);
    }
    return null;
  }

  buildShip(side: Side): string | null {
    const ss = this.state.sides[side];
    const f = ss.fleet;
    if (ss.money < SHIP_COST) return 'Not enough money (100 needed).';
    if (f.ships >= MAX_FLEET) return 'Fleet is at maximum size (10).';
    if (this.city(f.port).owner !== side) return 'Fleet must be in a friendly port to build.';
    ss.money -= SHIP_COST;
    f.ships++;
    f.hits.push(SHIP_HITS);
    this.log('info', `${sideName(side)} navy launches a new ship at ${cityDef(f.port).name} (${f.ships} ships).`);
    return null;
  }

  portsFor(side: Side): number[] {
    return CITIES.filter((c) => c.port !== 0).map((c) => c.id).filter((id) => id !== this.state.sides[side].fleet.port);
  }

  moveFleet(side: Side, portId: number): string | null {
    const ss = this.state.sides[side];
    const f = ss.fleet;
    if (f.ships === 0) return 'You have no fleet.';
    if (!this.isPort(portId)) return 'That is not a port.';
    if (f.movedThisTurn) return 'Fleet has already moved this turn.';
    const from = f.port;
    f.port = portId;
    f.movedThisTurn = true;
    this.log('info', `${sideName(side)} fleet sails to ${cityDef(portId).name}.`);
    const ef = this.state.sides[other(side)].fleet;
    if (ef.ships > 0 && ef.port === portId) this.navalCombat(side, from);
    return null;
  }

  private navalCombat(attacker: Side, retreatPort: number) {
    const defender = other(attacker);
    const af = this.state.sides[attacker].fleet;
    const df = this.state.sides[defender].fleet;
    const port = cityDef(af.port).name;
    this.log('battle', `Naval battle off ${port}: ${af.ships} vs ${df.ships} ships.`);
    const volley = (from: typeof af, to: typeof af) => {
      let hits = 0;
      for (let i = 0; i < from.ships; i++) hits += this.rng.int(0, 3);
      for (let h = 0; h < hits && to.ships > 0; h++) {
        const t = this.rng.int(0, to.hits.length - 1);
        to.hits[t]--;
        if (to.hits[t] <= 0) {
          to.hits.splice(t, 1);
          to.ships--;
        }
      }
      return hits;
    };
    let rounds = 0;
    while (af.ships > 0 && df.ships > 0 && rounds < 10) {
      rounds++;
      volley(af, df);
      volley(df, af);
      const aTot = af.hits.reduce((a, b) => a + b, 0);
      const dTot = df.hits.reduce((a, b) => a + b, 0);
      if (af.ships > 0 && df.ships > 0 && aTot < dTot * 0.4) {
        af.port = retreatPort;
        this.log('battle', `${sideName(attacker)} fleet retires to ${cityDef(retreatPort).name} after ${rounds} rounds.`);
        return;
      }
    }
    if (df.ships === 0) {
      this.state.sides[attacker].bonusVp += 25;
      this.log('major', `${sideName(defender)} fleet destroyed off ${port}! (+25 VP)`);
    } else if (af.ships === 0) {
      this.state.sides[defender].bonusVp += 25;
      this.log('major', `${sideName(attacker)} fleet destroyed off ${port}! (+25 VP)`);
    } else {
      af.port = retreatPort;
      this.log('battle', `Inconclusive naval action; ${sideName(attacker)} fleet withdraws.`);
    }
  }

  canBombard(side: Side): string | null {
    const f = this.state.sides[side].fleet;
    if (f.ships === 0) return 'You have no fleet.';
    if (this.city(f.port).owner !== other(side)) return 'Fleet is not at an enemy port.';
    if (f.movedThisTurn && this.isHuman(side)) return 'Cannot move and bombard in the same turn.';
    return null;
  }

  bombard(side: Side): string | null {
    const err = this.canBombard(side);
    if (err) return err;
    const f = this.state.sides[side].fleet;
    const c = this.city(f.port);
    const name = cityDef(c.id).name;
    const enemy = other(side);
    const msgs: string[] = [];
    // forts shoot back
    if (c.fort > 0) {
      for (let i = f.hits.length - 1; i >= 0; i--) {
        if (this.rng.chance(0.12 * c.fort)) {
          f.hits[i] -= 5;
          if (f.hits[i] <= 0) {
            f.hits.splice(i, 1);
            f.ships--;
            msgs.push('a ship is sunk by the forts');
          }
        }
      }
      if (f.ships > 0 && this.rng.chance(0.25 + 0.05 * f.ships)) {
        c.fort--;
        msgs.push(`fortifications reduced to ${c.fort}`);
      }
    }
    const defenders = this.armiesAt(c.id, enemy);
    if (f.ships > 0 && defenders.length) {
      const target = defenders.reduce((m, x) => (x.strength > m.strength ? x : m));
      const dmg = Math.min(target.strength - 500, f.ships * this.rng.int(300, 800));
      if (dmg > 0) {
        target.strength -= Math.round(dmg / 100) * 100;
        this.state.sides[enemy].casualties += dmg;
        msgs.push(`${target.name} loses ${fmt(Math.round(dmg / 100) * 100)} men`);
      }
    } else if (f.ships > 0 && c.fort === 0 && this.rng.chance(0.5)) {
      c.owner = 'neutral';
      msgs.push('the city is driven to neutrality');
    }
    f.movedThisTurn = true; // one action per turn
    this.log('battle', `${sideName(side)} fleet bombards ${name}: ${msgs.length ? msgs.join('; ') : 'little effect'}.`);
    return null;
  }

  invasionTargets(side: Side): number[] {
    if (side !== 'union') return [];
    const f = this.state.sides[side].fleet;
    if (f.ships < 2 || !this.hasNamedLeader(side)) return [];
    return this.state.cities.filter((c) => c.owner === 'neutral' && this.isPort(c.id)).map((c) => c.id);
  }

  invade(side: Side, cityId: number): string | null {
    if (!this.invasionTargets(side).includes(cityId)) return 'Invasion not possible there.';
    const f = this.state.sides[side].fleet;
    f.ships--;
    f.hits.pop();
    f.port = cityId;
    f.movedThisTurn = true;
    this.city(cityId).owner = side;
    const ld = this.availableLeader(side);
    const a = this.spawnArmy(side, cityId, 3500, ld.rating, ld.name, ld.idx, 8, 0);
    a.busy = true;
    this.log('major', `Amphibious landing: ${ld.name} seizes ${cityDef(cityId).name} with 3,500 men.`);
    return null;
  }

  movable(side: Side): Army[] {
    return this.armiesOf(side).filter((a) => !a.busy && a.orders < 0);
  }

  destinations(armyId: number): number[] {
    const a = this.army(armyId);
    if (!a) return [];
    return cityDef(a.city).links.slice();
  }

  order(armyId: number, dest: number): string | null {
    const a = this.army(armyId);
    if (!a) return 'No such army.';
    if (a.busy) return `${a.name} cannot move this turn.`;
    if (!cityDef(a.city).links.includes(dest)) return 'Not an adjacent city.';
    if (this.isJanuary() && !this.state.settings.janCampaigns && this.city(dest).owner !== a.side) {
      return 'No land campaigns in January.';
    }
    a.orders = dest;
    return null;
  }

  cancel(armyId: number): string | null {
    const a = this.army(armyId);
    if (!a || a.orders < 0) return 'No orders to cancel.';
    a.orders = -1;
    return null;
  }

  fortifyCandidates(side: Side): number[] {
    if (this.state.sides[side].money < FORT_COST) return [];
    const ids = new Set<number>();
    for (const a of this.armiesOf(side)) {
      if (!a.busy && a.orders < 0 && this.city(a.city).owner === side && this.city(a.city).fort < 2) ids.add(a.city);
    }
    return [...ids];
  }

  fortify(side: Side, cityId: number): string | null {
    if (!this.fortifyCandidates(side).includes(cityId)) return 'Cannot fortify there.';
    const a = this.armiesAt(cityId, side).find((x) => !x.busy && x.orders < 0)!;
    this.state.sides[side].money -= FORT_COST;
    this.city(cityId).fort++;
    a.busy = true;
    a.resting = true;
    this.log('info', `${a.name} fortifies ${cityDef(cityId).name} (level ${this.city(cityId).fort}).`);
    return null;
  }

  joinCandidates(side: Side): number[] {
    const counts = new Map<number, number>();
    for (const a of this.armiesOf(side)) if (!a.busy && a.orders < 0) counts.set(a.city, (counts.get(a.city) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  }

  join(side: Side, cityId: number): string | null {
    const group = this.armiesAt(cityId, side).filter((a) => !a.busy && a.orders < 0);
    if (group.length < 2) return 'Need two or more armies there.';
    group.sort((x, y) => y.strength - x.strength);
    const base = group[0];
    let total = base.strength;
    let wLeader = base.leader * base.strength;
    let wExp = base.exp * base.strength;
    let wSup = base.supply * base.strength;
    let best = base;
    const merged: Army[] = [];
    for (const a of group.slice(1)) {
      if (total + a.strength > MAX_ARMY) continue;
      total += a.strength;
      wLeader += a.leader * a.strength;
      wExp += a.exp * a.strength;
      wSup += a.supply * a.strength;
      if (a.leader > best.leader) best = a;
      merged.push(a);
    }
    if (!merged.length) return 'Combined force would exceed 125,000 men.';
    const roster = side === 'union' ? UNION_LEADERS : REBEL_LEADERS;
    const ss = this.state.sides[side];
    // The best commander takes over; the others return to the pool.
    for (const a of [base, ...merged]) {
      if (a === best) continue;
      const idx = roster.findIndex((l) => l.name === a.name);
      if (idx >= 0) ss.leadersUsed = ss.leadersUsed.filter((i) => i !== idx);
    }
    base.name = best.name;
    base.leader = Math.max(1, best.leader - (best.leader >= 8 ? 1 : 0));
    void wLeader;
    base.exp = Math.round(wExp / total);
    base.supply = Math.round(wSup / total);
    base.strength = total;
    base.busy = true;
    this.state.armies = this.state.armies.filter((a) => !merged.includes(a));
    this.log('info', `${best.name} takes command of a combined ${fmt(total)}-man army at ${cityDef(cityId).name}.`);
    return null;
  }

  supplyCost(a: Army, units: number, manual: boolean): number {
    return Math.ceil((a.strength / 1000) * (manual ? 0.5 : 1) * units);
  }

  resupply(side: Side, armyId: number): string | null {
    const a = this.army(armyId);
    if (!a || a.side !== side) return 'No such army.';
    const ss = this.state.sides[side];
    let units = 0;
    while (units < 5 && a.supply + units < 10 && ss.money >= this.supplyCost(a, units + 1, true)) units++;
    if (units === 0) return 'Not enough money to supply that army.';
    ss.money -= this.supplyCost(a, units, true);
    a.supply += units;
    this.log('info', `${a.name} receives ${units} units of supply.`);
    return null;
  }

  moveCapital(side: Side, cityId: number): string | null {
    const ss = this.state.sides[side];
    if (ss.money < CAPITAL_MOVE_COST) return 'Need 200 money to move the capital.';
    if (this.city(cityId).owner !== side) return 'Must be a friendly city.';
    if (ss.capital === cityId) return 'That is already the capital.';
    ss.money -= CAPITAL_MOVE_COST;
    ss.capital = cityId;
    this.log('major', `${sideName(side)} capital moved to ${cityDef(cityId).name}.`);
    return null;
  }

  // ---------------------------------------------------------- turn flow
  /** Called when a side finishes its decisions. Returns true if the update phase ran. */
  endDecision(side: Side): boolean {
    const st = this.state;
    const first = st.settings.players === 2 ? 'union' : st.settings.humanSide;
    if (side === first) {
      st.activeSide = other(first);
      return false;
    }
    this.runUpdate();
    st.activeSide = first;
    return true;
  }

  // ------------------------------------------------------------ combat
  calc(att: Army, def: Army, defCity: City, isAttacker: boolean): CombatCalc {
    const me = isAttacker ? att : def;
    const foe = isAttacker ? def : att;
    const clamp = (v: number) => Math.max(1, Math.min(20, v));
    const c: CombatCalc = { base: 0, ldrExp: 0, small: 0, outman: 0, supply: 0, difclt: 0, fort: 0, final: 0 };
    c.base = clamp(Math.ceil(me.strength / (isAttacker ? 10000 : 8000)));
    const ratio = att.strength / Math.max(1, def.strength);
    const outnumbered5 = isAttacker ? ratio < 0.2 : ratio > 5;
    let v = c.base;
    if (!outnumbered5 || me.exp >= 8) v += Math.round((me.leader - 5) / 2) + Math.floor(me.exp / 3);
    c.ldrExp = clamp(v);
    v = c.ldrExp;
    if (me.strength < 1500) v -= 2;
    c.small = clamp(v);
    v = c.small;
    if (isAttacker) {
      if (ratio < 0.2) v = 1;
      else if (ratio < 0.5) v -= 2;
      else if (ratio >= 10) v = 20;
      else if (ratio >= 3) v += 2;
    } else {
      if (ratio <= 0.1) v = 20;
      else if (ratio < 0.5) v += 2;
      else if (ratio >= 5) v = 1;
      else if (ratio >= 2) v -= 2;
    }
    c.outman = clamp(v);
    v = c.outman;
    if (me.supply <= 0) v = Math.floor(v / 2);
    c.supply = clamp(v);
    v = c.supply;
    const b = this.state.settings.balance;
    v += me.side === 'union' ? b : -b;
    c.difclt = clamp(v);
    v = c.difclt;
    if (!isAttacker && defCity.fort > 0 && foe.side !== me.side) {
      const fresh = !me.movedThisTurn && !me.foughtThisTurn;
      if (fresh || (me.leader >= 9 && this.rng.chance(0.5))) v += defCity.fort * 2;
    }
    c.fort = clamp(v);
    c.final = c.fort;
    return c;
  }

  odds(att: Army, def: Army, defCity: City): number {
    const a = this.calc(att, def, defCity, true).final;
    const d = this.calc(att, def, defCity, false).final;
    return a / (a + d);
  }

  private retreatOptions(a: Army, exclude: number): number[] {
    return cityDef(a.city).links.filter(
      (id) => id !== exclude && this.city(id).owner === a.side && this.armiesAt(id, other(a.side)).length === 0,
    );
  }

  private chooseRetreat(a: Army, options: number[], prefer: number): number {
    if (options.includes(prefer)) return prefer;
    let best = options[0];
    let bestScore = -1;
    for (const id of options) {
      const sc = this.armiesAt(id, a.side).length * 2 + this.city(id).fort + (id === this.state.sides[a.side].capital ? 3 : 0);
      if (sc > bestScore) { bestScore = sc; best = id; }
    }
    return best;
  }

  private surrender(a: Army, captor: Side) {
    const roster = a.side === 'union' ? UNION_LEADERS : REBEL_LEADERS;
    const ss = this.state.sides[a.side];
    const idx = roster.findIndex((l) => l.name === a.name);
    if (idx >= 0) {
      ss.leadersLost.push(idx);
      ss.leadersUsed = ss.leadersUsed.filter((i) => i !== idx);
    }
    this.state.sides[captor].bonusVp += 25;
    this.state.sides[captor].casualties += 0;
    ss.casualties += a.strength;
    this.state.armies = this.state.armies.filter((x) => x !== a);
    for (const w of this.armiesAt(a.city, captor)) w.supply = Math.min(10, w.supply + 2);
    this.log('major', `${a.name}'s army surrenders at ${cityDef(a.city).name}! (+25 VP ${sideName(captor)})`);
  }

  private battle(att: Army, def: Army, origin: number): BattleReport {
    const cityId = def.city;
    const city = this.city(cityId);
    const atk = this.calc(att, def, city, true);
    const dfn = this.calc(att, def, city, false);
    const odds = atk.final / (atk.final + dfn.final);
    const attackerWon = atk.final * this.rng.next() * this.rng.int(80, 120) > dfn.final * this.rng.next() * this.rng.int(80, 120);
    const loserPct = this.rng.int(10, 25) * ((attackerWon ? atk.final : dfn.final) / 10 + 0.5);
    const winnerPct = this.rng.int(4, 12) * ((attackerWon ? dfn.final : atk.final) / 10 + 0.5);
    const cas = (a: Army, pct: number) => Math.min(a.strength - 100, Math.round((a.strength * Math.min(50, pct)) / 100 / 100) * 100);
    const atkLoss = cas(att, attackerWon ? winnerPct : loserPct);
    const defLoss = cas(def, attackerWon ? loserPct : winnerPct);
    att.strength -= atkLoss;
    def.strength -= defLoss;
    this.state.sides[att.side].casualties += atkLoss;
    this.state.sides[def.side].casualties += defLoss;
    att.supply = Math.max(0, att.supply - 1);
    def.supply = Math.max(0, def.supply - 1);
    att.foughtThisTurn = def.foughtThisTurn = true;
    const winner = attackerWon ? att : def;
    const loser = attackerWon ? def : att;
    winner.exp = Math.min(10, winner.exp + 1);
    this.state.sides[winner.side].battlesWon++;
    this.state.sides[winner.side].bonusVp += 1;
    const name = cityDef(cityId).name;
    this.log('battle', `Battle of ${name}: ${att.name} (${fmt(att.strength + atkLoss)}) attacks ${def.name} (${fmt(def.strength + defLoss)}). ` +
      `${winner.name} wins. Losses: ${sideName(att.side)} ${fmt(atkLoss)}, ${sideName(def.side)} ${fmt(defLoss)}.`);
    let surrendered = false;
    let retreatTo = -1;
    const shattered = loser.strength < 1500 || loser.strength * 10 < winner.strength;
    const options = this.retreatOptions(loser, attackerWon ? origin : cityId);
    if (attackerWon) {
      def.orders = -1;
      if (shattered || options.length === 0) { surrendered = true; this.surrender(def, att.side); }
      else { retreatTo = this.chooseRetreat(def, options, -1); def.city = retreatTo; def.movedThisTurn = true; this.log('info', `${def.name} retreats to ${cityDef(retreatTo).name}.`); }
    } else {
      if (this.rng.chance(0.5)) def.orders = -1;
      const originOk = this.city(origin).owner === att.side && this.armiesAt(origin, def.side).length === 0;
      const opts = originOk ? [origin, ...options] : options;
      if (shattered || opts.length === 0) { surrendered = true; att.city = cityId; this.surrender(att, def.side); }
      else { retreatTo = this.chooseRetreat(att, opts, origin); att.city = retreatTo; this.log('info', `${att.name} falls back to ${cityDef(retreatTo).name}.`); }
    }
    if (loser.strength < 1500 && !surrendered) this.log('major', `${loser.name}'s army is shattered!`);
    return { attacker: att, defender: def, cityId, atk, def: dfn, odds, attackerWon, atkLoss, defLoss, surrendered, retreatTo };
  }

  private captureCity(a: Army, cityId: number) {
    const c = this.city(cityId);
    const prev = c.owner;
    if (prev === a.side) return;
    c.owner = a.side;
    if (c.fort > 0) c.fort--;
    a.supply = Math.min(10, a.supply + 2);
    const name = cityDef(cityId).name;
    if (prev !== 'neutral') {
      const es = this.state.sides[prev];
      if (es.capital === cityId) {
        es.capitalLost = true;
        this.log('major', `${sideName(a.side)} captures the ${sideName(prev)} capital at ${name}!`);
      } else this.log('info', `${a.name} captures ${name}.`);
    } else this.log('info', `${a.name} occupies ${name}.`);
  }

  // ------------------------------------------------------------ update phase
  runUpdate() {
    const st = this.state;
    st.phase = 'update';
    this.lastBattles = [];
    this.log('major', `— ${this.dateStr()} —`);
    for (const a of st.armies) { a.movedThisTurn = false; a.foughtThisTurn = false; }

    const movers = st.armies.filter((a) => a.orders >= 0);
    const key = new Map(movers.map((a) => [a.id, a.leader * 10 + (a.supply > 0 ? 50 : 0) + this.rng.int(0, 30)]));
    movers.sort((x, y) => key.get(y.id)! - key.get(x.id)!);
    for (const a of movers) {
      if (!st.armies.includes(a) || a.orders < 0) continue;
      const dest = a.orders;
      const origin = a.city;
      a.orders = -1;
      if (this.isJanuary() && !st.settings.janCampaigns && this.city(dest).owner !== a.side) continue;
      a.supply = Math.max(0, a.supply - 1);
      a.movedThisTurn = true;
      const defenders = () => this.armiesAt(dest, other(a.side));
      let lost = false;
      while (defenders().length && !lost) {
        const d = defenders().sort((x, y) => y.strength - x.strength)[0];
        const r = this.battle(a, d, origin);
        this.lastBattles.push(r);
        if (!r.attackerWon) lost = true;
        if (!st.armies.includes(a)) { lost = true; break; }
      }
      if (lost) continue;
      a.city = dest;
      this.captureCity(a, dest);
    }

    this.randomEvents();
    this.updateSupply();
    this.updateIncome();
    this.updateScore();
    for (const a of st.armies) { a.busy = false; a.resting = false; }
    for (const s of SIDES) st.sides[s].fleet.movedThisTurn = false;
    this.checkEnd();
    if (this.state.phase !== 'over') {
      st.turn++;
      st.month += 2;
      if (st.month > 12) { st.month -= 12; st.year++; }
      st.phase = 'decision';
      this.pickRecruitCities('union');
      this.pickRecruitCities('rebel');
    }
  }

  private updateSupply() {
    const st = this.state;
    const free = this.harvest();
    for (const s of SIDES) {
      const ss = st.sides[s];
      const mine = this.armiesOf(s).sort((a, b) => a.id - b.id);
      for (const a of mine) {
        const port = this.isPort(a.city) && this.city(a.city).owner === s;
        const blockaded = port && this.blockaded(a.city, s);
        if (!free) a.supply = Math.max(0, a.supply - 1);
        if (blockaded) { a.supply = Math.max(0, a.supply - 1); continue; }
        if (port) { a.supply = Math.max(a.supply, 6); continue; }
        if (a.supply >= 10) continue;
        const cost = free ? 0 : this.supplyCost(a, 1, false);
        if (ss.money >= cost) { ss.money -= cost; a.supply++; }
      }
      const out = mine.filter((a) => a.supply === 0);
      if (out.length) this.log('info', `${sideName(s)} armies out of supply: ${out.map((a) => a.name).join(', ')}.`);
    }
  }

  updateIncome() {
    const st = this.state;
    for (const s of SIDES) {
      const ss = st.sides[s];
      let inc = this.ownedCities(s).reduce((n, c) => n + cityDef(c.id).value, 0);
      if (!ss.capitalLost && this.city(ss.capital).owner === s) inc += CAPITAL_BONUS;
      if (s === 'union') inc += UNION_OUTSIDE_INCOME;
      ss.income = Math.round(inc * this.balanceMult(s, 0.15));
    }
    if (st.phase === 'update') for (const s of SIDES) st.sides[s].money += st.sides[s].income;
  }

  scoreTarget(s: Side): number {
    const ss = this.state.sides[s];
    let t = this.ownedCities(s).reduce((n, c) => n + cityDef(c.id).value, 0) + ss.bonusVp;
    if (!ss.capitalLost && this.city(ss.capital).owner === s) t += CAPITAL_BONUS;
    return t;
  }

  private updateScore() {
    for (const s of SIDES) {
      const ss = this.state.sides[s];
      ss.vp = Math.round(ss.vp + (this.scoreTarget(s) - ss.vp) * 0.6);
    }
  }

  // ------------------------------------------------------------ events
  private randomEvents() {
    const st = this.state;
    // scripted history
    if (st.month === 1 && st.year === 1863) {
      st.sides.union.bonusVp += 25;
      this.log('event', 'Emancipation Proclamation issued. Union +25 VP.');
    }
    if (st.month === 11 && st.year === 1864) {
      st.sides.union.bonusVp += 25;
      this.log('event', 'Lincoln re-elected. Union +25 VP.');
    }
    if (st.month === 11 && st.year === 1862 && this.ownedCities('rebel').length >= 22) {
      st.sides.rebel.bonusVp += 25;
      this.log('event', 'Britain and France edge toward recognizing the Confederacy. Rebel +25 VP.');
    }
    const bias = st.settings.events;
    if (bias === 'off' || !this.rng.chance(0.4)) return;
    let pUnion = 0.5;
    if (bias === 'union') pUnion = 0.7;
    else if (bias === 'rebel') pUnion = 0.3;
    else if (st.settings.players === 1) pUnion = st.settings.humanSide === 'union' ? 0.3 : 0.7;
    const good: Side = this.rng.chance(pUnion) ? 'union' : 'rebel';
    const bad = other(good);
    const ga = this.armiesOf(good);
    const ba = this.armiesOf(bad);
    const G = sideName(good);
    const B = sideName(bad);
    const roll = this.rng.int(0, 9);
    let msg = '';
    switch (roll) {
      case 0: st.sides[good].money += 100; msg = `Gold shipment reaches the ${G} treasury (+100).`; break;
      case 1: st.sides[good].money += 150; msg = `${G} war bonds oversubscribed (+150).`; break;
      case 2: if (ga.length) { const a = this.rng.pick(ga); a.strength = Math.min(MAX_ARMY, a.strength + 3000); msg = `Volunteers flock to ${a.name} (+3,000 men).`; } break;
      case 3: if (ga.length) { const a = this.rng.pick(ga); a.exp = Math.min(10, a.exp + 1); msg = `Hard drilling pays off for ${a.name} (+1 experience).`; } break;
      case 4: for (const a of ga) a.supply = Math.min(10, a.supply + 2); msg = `Bountiful harvest in ${G} territory (all armies +2 supply).`; break;
      case 5: if (ba.length) { const a = this.rng.pick(ba); const l = Math.min(a.strength - 500, 2000); if (l > 0) { a.strength -= l; st.sides[bad].casualties += l; } msg = `Disease sweeps ${a.name}'s camp (-${fmt(l)} men).`; } break;
      case 6: if (ba.length) { const a = this.rng.pick(ba); a.supply = Math.max(0, a.supply - 3); msg = `${B} supply depot burned near ${cityDef(a.city).name} (${a.name} -3 supply).`; } break;
      case 7: if (ba.length) { const a = this.rng.pick(ba); a.leader = Math.max(1, a.leader - 2); msg = `${a.name} falls ill; staff takes over (-2 leadership).`; } break;
      case 8: if (ba.length) { const a = this.rng.pick(ba); a.busy = true; a.orders = -1; msg = `Rail bridge destroyed: ${a.name} delayed next turn.`; } break;
      case 9: { const f = st.sides[bad].fleet; if (f.ships > 0) { f.ships--; f.hits.pop(); msg = `Storm wrecks a ${B} warship.`; } break; }
    }
    if (msg) this.log('event', msg);
  }

  // ------------------------------------------------------------ end game
  private checkEnd() {
    const st = this.state;
    const ec = st.settings.endCond;
    const th = st.thresholds;
    const finish = (winner: Side, reason: string) => {
      st.winner = winner;
      st.endReason = reason;
      st.phase = 'over';
      st.sides[winner].bonusVp += 100;
      this.updateScore();
      this.log('major', `GAME OVER — ${sideName(winner)} victory: ${reason}`);
    };
    for (const s of SIDES) {
      if (st.turn > 1 && this.armiesOf(s).length === 0 && this.armiesOf(other(s)).length > 0) return finish(other(s), `${sideName(s)} armies eliminated`);
    }
    if (ec.capital) {
      const uLost = this.city(st.sides.union.capital).owner !== 'union';
      const rLost = this.city(st.sides.rebel.capital).owner !== 'rebel';
      if (uLost && !rLost) return finish('rebel', 'Union capital captured');
      if (rLost && !uLost) return finish('union', 'Rebel capital captured');
    }
    if (ec.cities) {
      const need = Math.ceil((CITIES.length * th.citiesPct) / 100);
      for (const s of SIDES) if (this.ownedCities(s).length >= need) return finish(s, `${th.citiesPct}% of cities controlled`);
      for (const s of SIDES) if (this.ownedCities(s).length >= need - 2) this.log('major', `${sideName(s)} nears the city-control victory condition!`);
    }
    if (ec.income) {
      const tot = st.sides.union.income + st.sides.rebel.income;
      for (const s of SIDES) if (st.sides[s].income >= (tot * th.incomePct) / 100) return finish(s, `${th.incomePct}% of income controlled`);
    }
    if (ec.ratio && st.turn > 2) {
      for (const s of SIDES) {
        const mine = this.totalStrength(s);
        const theirs = this.totalStrength(other(s));
        if (theirs > 0 && mine / theirs >= th.ratio) return finish(s, `${th.ratio}:1 superiority in strength`);
      }
    }
    if (ec.time) {
      const nextMonth = st.month + 2 > 12 ? st.month - 10 : st.month + 2;
      const nextYear = st.month + 2 > 12 ? st.year + 1 : st.year;
      if (nextYear > th.endYear || (nextYear === th.endYear && nextMonth >= th.endMonth)) {
        for (const s of SIDES) st.sides[s].vp = Math.round(st.sides[s].vp * 0.7);
        return finish('rebel', 'the European powers recognize the Confederacy — time has run out');
      }
    }
  }

  /** Keep playing after a victory condition fired; the triggered threshold is raised. */
  override() {
    const st = this.state;
    if (st.phase !== 'over' || !st.winner) return;
    st.sides[st.winner].bonusVp -= 100;
    st.overrideCount++;
    const r = st.endReason;
    if (r.includes('cities')) st.thresholds.citiesPct = Math.min(100, st.thresholds.citiesPct + 2.5);
    else if (r.includes('income')) st.thresholds.incomePct = Math.min(100, st.thresholds.incomePct + 2.5);
    else if (r.includes('superiority')) st.thresholds.ratio += 0.5;
    else if (r.includes('capital')) st.settings.endCond.capital = false;
    else if (r.includes('time')) { st.thresholds.endYear++; for (const s of SIDES) st.sides[s].vp = Math.round(st.sides[s].vp / 0.7); }
    else st.settings.endCond = { time: false, cities: false, income: false, capital: false, ratio: false };
    st.winner = null;
    st.endReason = '';
    st.phase = 'decision';
    st.turn++;
    st.month += 2;
    if (st.month > 12) { st.month -= 12; st.year++; }
    this.pickRecruitCities('union');
    this.pickRecruitCities('rebel');
    this.log('major', 'Victory condition overridden — the war goes on.');
  }
}

export { sideName, fmt };
