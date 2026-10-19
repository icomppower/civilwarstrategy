import { runAI } from '../engine/ai';
import { CITIES, cityDef } from '../engine/data';
import { DEFAULT_SETTINGS, Game, fmt, sideName } from '../engine/game';
import type { BattleReport, Settings, Side } from '../engine/types';
import { other } from '../engine/types';
import { MAP_H, MAP_W, cityAt, drawMap, type MapView } from './map';
import { beep } from './sound';

type MenuItem = { label: string; key?: string; action: () => void; disabled?: boolean; hint?: string };

const SAVE_KEY = 'cws.save';
const CFG_KEY = 'cws.cfg';
const HISCORE_KEY = 'cws.hiscore';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class App {
  g!: Game;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  menuEl: HTMLElement;
  statusEl: HTMLElement;
  logEl: HTMLElement;
  bannerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  view: MapView = { overlay: 'none', highlight: new Set(), selected: -1, selectedArmy: -1, hover: -1, viewer: 'union' };
  menuStack: { title: string; items: MenuItem[]; onCity?: (id: number) => void }[] = [];
  settings: Settings;
  logShown = 0;
  started = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = this.loadCfg();
    root.innerHTML = '';
    const frame = el('div', 'frame');
    const left = el('div', 'left');
    const right = el('div', 'right');
    this.canvas = el('canvas', 'map');
    this.canvas.width = MAP_W;
    this.canvas.height = MAP_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.logEl = el('div', 'log');
    this.bannerEl = el('div', 'banner');
    left.append(this.canvas, this.logEl, this.bannerEl);
    this.statusEl = el('div', 'status');
    this.menuEl = el('div', 'menu');
    right.append(this.statusEl, this.menuEl);
    frame.append(left, right);
    this.modalEl = el('div', 'modal hidden');
    this.titleEl = el('div', 'title');
    root.append(frame, this.modalEl, this.titleEl);
    this.bindCanvas();
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------- lifecycle
  private frame(t: number) {
    if (this.started) drawMap(this.ctx, this.g, this.view, t);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  showTitle() {
    this.started = false;
    this.titleEl.classList.remove('hidden');
    this.titleEl.innerHTML = '';
    const box = el('div', 'titlebox');
    box.append(el('div', 'titleart', 'VGA\nCIVIL WAR\nSTRATEGY'));
    box.append(el('div', 'titlesub', 'A strategic-level wargame of the American Civil War · 1861–1865'));
    const hs = this.loadHiscores();
    const menu = el('div', 'titlemenu');
    const mk = (label: string, fn: () => void) => { const b = el('button', 'tbtn', label); b.onclick = fn; menu.append(b); };
    mk('New Game', () => this.newGame(false));
    mk('New Game — Vary Start', () => this.newGame(true));
    if (localStorage.getItem(SAVE_KEY)) mk('Load Saved Game', () => this.loadGame());
    mk('Settings', () => { this.startStub(); this.pushUtility(); });
    box.append(menu);
    const hsEl = el('div', 'hiscores');
    hsEl.append(el('div', 'hstitle', 'HIGH SCORES'));
    for (const s of ['union', 'rebel'] as Side[]) {
      const list = hs[s];
      hsEl.append(el('div', 'hsside', sideName(s)));
      if (!list.length) hsEl.append(el('div', 'hsrow', '—'));
      for (const r of list) hsEl.append(el('div', 'hsrow', `${r.name.padEnd(12)} ${String(r.score).padStart(5)}`));
    }
    box.append(hsEl);
    box.append(el('div', 'credits', 'Rewrite of W.R. Hutsell\'s 1993 shareware VGA Civil War Strategy v1.41. Not affiliated with the original author.'));
    this.titleEl.append(box);
  }

  /** Lets the settings menu work from the title screen before a game exists. */
  private startStub() {
    if (!this.g) this.g = new Game(this.settings, 1);
    this.titleEl.classList.add('hidden');
    this.started = true;
    this.menuStack = [];
    this.render();
  }

  newGame(vary: boolean) {
    this.g = new Game(this.settings, (Date.now() ^ (Math.random() * 1e9)) >>> 0, vary);
    this.beginSession();
  }

  loadGame() {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return;
    this.g = Game.fromJSON(json);
    this.settings = this.g.state.settings;
    this.beginSession();
  }

  saveGame() {
    localStorage.setItem(SAVE_KEY, this.g.toJSON());
    this.saveCfg();
    this.toast('Game saved.');
  }

  private beginSession() {
    this.titleEl.classList.add('hidden');
    this.started = true;
    this.logShown = 0;
    this.logEl.innerHTML = '';
    this.view.viewer = this.humanSide();
    this.menuStack = [];
    if (this.g.state.phase === 'over') { this.render(); this.showGameOver(); return; }
    this.startDecision();
  }

  humanSide(): Side { return this.g.state.activeSide; }
  active(): Side { return this.g.state.activeSide; }

  private startDecision() {
    const st = this.g.state;
    this.view.viewer = st.activeSide;
    this.view.selectedArmy = -1;
    this.view.selected = -1;
    this.menuStack = [];
    this.pushMain();
    this.render();
    if (st.settings.players === 2) this.toast(`${sideName(st.activeSide)} player: make your decisions.`);
  }

  // ---------------------------------------------------------------- turn
  nextTurn() {
    const g = this.g;
    const st = g.state;
    const side = st.activeSide;
    const ran = g.endDecision(side);
    if (!ran) {
      if (st.settings.players === 1) {
        runAI(g, st.activeSide);
        g.endDecision(st.activeSide);
        this.afterUpdate();
      } else {
        this.modal(`Pass the keyboard to the ${sideName(st.activeSide)} player.`, [{ label: 'Ready', action: () => this.startDecision() }]);
      }
      return;
    }
    this.afterUpdate();
  }

  private afterUpdate() {
    const g = this.g;
    this.render();
    const battles = g.lastBattles;
    const events = g.state.log.filter((l) => l.turn === g.state.turn - 1 && l.kind === 'event');
    const show = (i: number) => {
      if (i < battles.length) { this.showBattle(battles[i], () => show(i + 1)); return; }
      if (events.length) {
        this.modal(`Events of the season:\n\n${events.map((e) => '• ' + e.text).join('\n')}`, [{ label: 'Continue', action: () => done() }]);
        return;
      }
      done();
    };
    const done = () => {
      if (g.state.phase === 'over') this.showGameOver();
      else this.startDecision();
    };
    if (battles.length) beep(this.settings.sound, 'battle');
    show(0);
  }

  private showBattle(r: BattleReport, next: () => void) {
    const c = (x: typeof r.atk) => `${x.base}  ${x.ldrExp}  ${x.small}  ${x.outman}  ${x.supply}  ${x.difclt}  ${x.fort}  →  ${x.final}`;
    const text = [
      `BATTLE OF ${cityDef(r.cityId).name.toUpperCase()}`,
      '',
      `Attacker: ${r.attacker.name} (${sideName(r.attacker.side)})   Defender: ${r.defender.name} (${sideName(r.defender.side)})`,
      '',
      '            Base Ldr Sml Out Sup Dif Frt   Final',
      `Attacker     ${c(r.atk)}`,
      `Defender     ${c(r.def)}`,
      '',
      `Attacker odds (guide): ${(r.odds * 100).toFixed(0)}%`,
      '',
      `WINNER: ${r.attackerWon ? r.attacker.name : r.defender.name}`,
      `Losses — ${sideName(r.attacker.side)}: ${fmt(r.atkLoss)}   ${sideName(r.defender.side)}: ${fmt(r.defLoss)}`,
      r.surrendered ? `${r.attackerWon ? r.defender.name : r.attacker.name}'s army SURRENDERS!` : r.retreatTo > 0 ? `${r.attackerWon ? r.defender.name : r.attacker.name} retreats to ${cityDef(r.retreatTo).name}.` : '',
    ].join('\n');
    this.modal(text, [{ label: 'Continue', action: next }], 'battle');
  }

  private showGameOver() {
    const st = this.g.state;
    const w = st.winner!;
    const text = [
      'GAME OVER',
      '',
      `${sideName(w).toUpperCase()} VICTORY — ${st.endReason}`,
      '',
      `Union: ${st.sides.union.vp} VP     Rebel: ${st.sides.rebel.vp} VP`,
      `Battles won — Union ${st.sides.union.battlesWon}, Rebel ${st.sides.rebel.battlesWon}`,
      `Casualties — Union ${fmt(st.sides.union.casualties)}, Rebel ${fmt(st.sides.rebel.casualties)}`,
    ].join('\n');
    this.modal(text, [
      { label: 'Record score', action: () => this.recordScore() },
      { label: 'Override & keep playing', action: () => { this.g.override(); this.startDecision(); } },
      { label: 'Title screen', action: () => this.showTitle() },
    ]);
  }

  private recordScore() {
    const st = this.g.state;
    const side = st.settings.players === 2 ? st.winner! : st.settings.humanSide;
    const score = st.sides[side].vp;
    const name = (prompt(`${sideName(side)} score ${score}. Enter your name:`, 'General') ?? '').slice(0, 12) || 'General';
    const hs = this.loadHiscores();
    hs[side].push({ name, score });
    hs[side].sort((a, b) => b.score - a.score);
    hs[side] = hs[side].slice(0, 5);
    localStorage.setItem(HISCORE_KEY, JSON.stringify(hs));
    this.showTitle();
  }

  // --------------------------------------------------------------- menus
  private pushMenu(title: string, items: MenuItem[], onCity?: (id: number) => void) {
    this.menuStack.push({ title, items, onCity });
    this.view.highlight = new Set();
    this.render();
  }
  private popMenu() {
    if (this.menuStack.length > 1) this.menuStack.pop();
    this.view.highlight = new Set();
    this.view.selectedArmy = -1;
    this.render();
  }

  private pushMain() {
    const g = this.g;
    const side = this.active();
    this.pushMenu('Main', [
      { label: 'Recruit', key: 'r', action: () => this.pushRecruit(), hint: `100 each · ${g.state.sides[side].recruitCities.length} cities offered` },
      { label: 'Ships', key: 's', action: () => this.pushShips() },
      { label: 'Army Moves', key: 'a', action: () => this.pushMoves() },
      { label: 'NEXT TURN', key: 'n', action: () => this.modal('End your decisions and run the turn?', [{ label: 'Yes', action: () => this.nextTurn() }, { label: 'No', action: () => {} }]) },
      { label: 'Informs', key: 'i', action: () => this.pushInform() },
      { label: 'OPTIONS', key: 'o', action: () => this.pushOptions() },
      { label: 'UTILITY', key: 'u', action: () => this.pushUtility() },
      { label: 'Files', key: 'f', action: () => this.pushFiles() },
      { label: 'Help', key: 'h', action: () => this.showHelp() },
    ]);
  }

  private cityItems(ids: number[], fn: (id: number) => void, extra?: (id: number) => string): MenuItem[] {
    return ids
      .map((id) => ({ id, name: cityDef(id).name }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ label: name, action: () => fn(id), hint: extra?.(id) }));
  }

  private pushRecruit() {
    const g = this.g;
    const side = this.active();
    const ss = g.state.sides[side];
    const ids = ss.recruitCities.filter((c) => g.city(c).owner === side);
    const items = this.cityItems(ids, (id) => this.doAction(g.recruit(side, id), () => this.refreshTop()), (id) => {
      const a = g.armiesAt(id, side)[0];
      return a ? `+${fmt(g.recruitSize(side, id, false))} to ${a.name}` : `new army ${fmt(g.recruitSize(side, id, true))}`;
    });
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu(`Recruit ($${ss.money})`, items, (id) => { if (ids.includes(id)) this.doAction(g.recruit(side, id), () => this.refreshTop()); });
    this.view.highlight = new Set(ids);
  }

  private refreshTop() {
    const top = this.menuStack[this.menuStack.length - 1];
    if (!top) return;
    const title = top.title.split(' (')[0];
    this.menuStack.pop();
    if (title === 'Recruit') this.pushRecruit();
    else if (title === 'Ships') this.pushShips();
    else if (title === 'Army Moves') this.pushMoves();
    else if (title === 'Options') this.pushOptions();
    else if (title === 'Utility') this.pushUtility();
    else this.render();
  }

  private pushShips() {
    const g = this.g;
    const side = this.active();
    const ss = g.state.sides[side];
    const f = ss.fleet;
    const inv = g.invasionTargets(side);
    this.pushMenu(`Ships (${f.ships} at ${cityDef(f.port).name})`, [
      { label: 'Build ship', key: 'b', action: () => this.doAction(g.buildShip(side), () => this.refreshTop()), hint: '100 · friendly port' },
      { label: 'Move fleet', key: 'm', action: () => this.pushPortPick(), disabled: f.ships === 0 || f.movedThisTurn },
      { label: 'Attack port', key: 'a', action: () => this.doAction(g.bombard(side), () => this.refreshTop()), disabled: !!g.canBombard(side), hint: g.canBombard(side) ?? 'bombard enemy port' },
      { label: 'Invade', key: 'i', action: () => this.pushInvade(), disabled: inv.length === 0, hint: side === 'union' ? 'Union only · needs 2+ ships' : 'Union only' },
      { label: 'EXIT', key: 'x', action: () => this.popMenu() },
    ]);
  }

  private pushPortPick() {
    const g = this.g;
    const side = this.active();
    const ports = g.portsFor(side);
    const items = this.cityItems(ports, (id) => this.doAction(g.moveFleet(side, id), () => { this.popMenu(); this.refreshTop(); }), (id) => g.city(id).owner);
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu('Sail to', items, (id) => { if (ports.includes(id)) this.doAction(g.moveFleet(side, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(ports);
  }

  private pushInvade() {
    const g = this.g;
    const side = this.active();
    const ids = g.invasionTargets(side);
    const items = this.cityItems(ids, (id) => this.doAction(g.invade(side, id), () => { this.popMenu(); this.refreshTop(); }));
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu('Invade', items, (id) => { if (ids.includes(id)) this.doAction(g.invade(side, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(ids);
  }

  private pushMoves() {
    const g = this.g;
    const side = this.active();
    const armies = g.movable(side);
    const items: MenuItem[] = armies.map((a) => ({
      label: `${a.name}`,
      hint: `${cityDef(a.city).name} · ${(a.strength / 1000).toFixed(1)}k`,
      action: () => this.pushDest(a.id),
    }));
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu('Army Moves', items, (id) => {
      const a = armies.find((x) => x.city === id);
      if (a) this.pushDest(a.id);
    });
    this.view.highlight = new Set(armies.map((a) => a.city));
  }

  private pushDest(armyId: number) {
    const g = this.g;
    const a = g.army(armyId)!;
    const dests = g.destinations(armyId);
    this.view.selectedArmy = armyId;
    const items = this.cityItems(dests, (id) => this.doAction(g.order(armyId, id), () => { this.popMenu(); this.refreshTop(); }), (id) => {
      const c = g.city(id);
      const en = g.armiesAt(id, other(a.side));
      return `${c.owner}${c.fort ? ' F' + c.fort : ''}${en.length ? ` · enemy ~${Math.round(en.reduce((n, x) => n + x.strength, 0) / 1000)}k` : ''}`;
    });
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu(`${a.name} → ?`, items, (id) => { if (dests.includes(id)) this.doAction(g.order(armyId, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(dests);
  }

  private pushInform() {
    this.pushMenu('Inform', [
      { label: 'Friendly armies', key: 'f', action: () => this.reportArmies(this.active()) },
      { label: 'Enemy armies', key: 'e', action: () => this.reportArmies(other(this.active())) },
      { label: 'Cities', key: 'c', action: () => this.reportCities() },
      { label: 'Force summary', key: 's', action: () => { this.view.overlay = this.view.overlay === 'force' ? 'none' : 'force'; this.render(); } },
      { label: 'Intelligence', key: 'i', action: () => { this.view.overlay = this.view.overlay === 'intel' ? 'none' : 'intel'; this.render(); } },
      { label: 'Battle summary', key: 'b', action: () => this.reportBattles() },
      { label: 'Event log', key: 'l', action: () => this.reportLog() },
      { label: 'EXIT', key: 'x', action: () => { this.view.overlay = 'none'; this.popMenu(); } },
    ]);
  }

  private reportArmies(side: Side) {
    const g = this.g;
    const own = side === this.active() || g.state.settings.players === 2 && false;
    const rows = g.armiesOf(side).map((a) => own
      ? `${a.name.padEnd(14)} ${cityDef(a.city).name.padEnd(15)} ${fmt(a.strength).padStart(8)}  L${a.leader} E${String(a.exp).padStart(2)} S${String(a.supply).padStart(2)}  ${a.resting ? 'Resting' : a.busy ? 'Organizing' : a.orders > 0 ? '→ ' + cityDef(a.orders).name : ''}`
      : `${a.name.padEnd(14)} ${cityDef(a.city).name.padEnd(15)} ~${fmt(Math.round(a.strength / 5000) * 5000).padStart(8)}  L${a.leader}`);
    const ss = g.state.sides[side];
    const text = [
      `${sideName(side).toUpperCase()} ARMIES — ${g.dateStr()}`,
      '',
      ...(rows.length ? rows : ['(none)']),
      '',
      `Total strength: ${fmt(g.totalStrength(side))}   Armies: ${rows.length}   Fleet: ${ss.fleet.ships} ships at ${cityDef(ss.fleet.port).name}`,
      own ? `Money: ${ss.money}   Income: ${ss.income}/turn   VP: ${ss.vp}` : `Enemy total strength: ${fmt(g.totalStrength(side))}`,
    ].join('\n');
    this.modal(text, [{ label: 'Close', action: () => {} }], 'report');
  }

  private reportCities() {
    const g = this.g;
    const rows = CITIES.map((c) => {
      const city = g.city(c.id);
      return `${c.name.padEnd(16)} ${String(c.value).padStart(3)}  ${city.owner.padEnd(8)} ${city.fort ? 'FORT' + '+'.repeat(city.fort) : '      '} ${c.port === 99 ? 'sea' : c.port === 90 ? 'river' : '     '}`.padEnd(44) + (g.armiesAt(c.id).length ? ` ${g.armiesAt(c.id).map((a) => (a.side === 'union' ? 'U:' : 'R:') + a.name).join(', ')}` : '');
    });
    const u = g.ownedCities('union').length;
    const r = g.ownedCities('rebel').length;
    this.modal([`CITIES — Union ${u}  Rebel ${r}  Neutral ${40 - u - r}`, '', 'City              Pts  Owner    Fort   Port', ...rows].join('\n'), [{ label: 'Close', action: () => {} }], 'report');
  }

  private reportBattles() {
    const s = this.g.state.sides;
    this.modal([
      'BATTLE SUMMARY', '',
      `              Battles won   Casualties`,
      `Union         ${String(s.union.battlesWon).padStart(11)}   ${fmt(s.union.casualties).padStart(10)}`,
      `Rebel         ${String(s.rebel.battlesWon).padStart(11)}   ${fmt(s.rebel.casualties).padStart(10)}`,
      '',
      `Victory points — Union ${s.union.vp}   Rebel ${s.rebel.vp}`,
    ].join('\n'), [{ label: 'Close', action: () => {} }], 'report');
  }

  private reportLog() {
    const lines = this.g.state.log.slice(-60).map((l) => `${l.kind === 'major' ? '★ ' : l.kind === 'battle' ? '⚔ ' : l.kind === 'event' ? '• ' : '  '}${l.text}`);
    this.modal(['EVENT LOG (last 60)', '', ...lines].join('\n'), [{ label: 'Close', action: () => {} }], 'report');
  }

  private pushOptions() {
    const g = this.g;
    const side = this.active();
    const canc = g.armiesOf(side).filter((a) => a.orders >= 0);
    const forts = g.fortifyCandidates(side);
    const joins = g.joinCandidates(side);
    const starving = g.armiesOf(side).filter((a) => a.supply < 10);
    this.pushMenu('Options', [
      { label: 'Cancel orders', key: 'c', disabled: !canc.length, action: () => this.pushPick('Cancel', canc.map((a) => ({ label: a.name, hint: '→ ' + cityDef(a.orders).name, action: () => this.doAction(g.cancel(a.id), () => { this.popMenu(); this.refreshTop(); }) }))) },
      { label: 'Fortify', key: 'f', disabled: !forts.length, hint: '200 · army rests', action: () => this.pushCityPick('Fortify', forts, (id) => g.fortify(side, id)) },
      { label: 'Join armies', key: 'j', disabled: !joins.length, action: () => this.pushCityPick('Join', joins, (id) => g.join(side, id)) },
      { label: 'Supply', key: 's', disabled: !starving.length, hint: '0.5 per 1,000 men / unit', action: () => this.pushPick('Supply', starving.map((a) => ({ label: a.name, hint: `S${a.supply} · ${fmt(a.strength)}`, action: () => this.doAction(g.resupply(side, a.id), () => { this.popMenu(); this.refreshTop(); }) }))) },
      { label: 'Move capital', key: 'm', hint: '200', action: () => this.pushCityPick('New capital', g.ownedCities(side).map((c) => c.id).filter((id) => id !== g.state.sides[side].capital), (id) => g.moveCapital(side, id)) },
      { label: 'MAIN MENU', key: 'x', action: () => this.popMenu() },
    ]);
  }

  private pushPick(title: string, items: MenuItem[]) {
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu(title, items);
  }

  private pushCityPick(title: string, ids: number[], fn: (id: number) => string | null) {
    const run = (id: number) => this.doAction(fn(id), () => { this.popMenu(); this.refreshTop(); });
    const items = this.cityItems(ids, run);
    items.push({ label: 'EXIT', key: 'x', action: () => this.popMenu() });
    this.pushMenu(title, items, (id) => { if (ids.includes(id)) run(id); });
    this.view.highlight = new Set(ids);
  }

  private pushUtility() {
    const g = this.g;
    const s = g.state.settings;
    const ec = s.endCond;
    const balanceNames = { '-2': 'Rebel++', '-1': 'Rebel+', '0': 'Even', '1': 'Union+', '2': 'Union++' } as Record<string, string>;
    const set = (fn: () => void) => () => { fn(); this.settings = s; this.saveCfg(); this.refreshTop(); };
    this.pushMenu('Utility', [
      { label: `Side: ${sideName(s.humanSide)}`, key: 's', hint: 'solo game · takes effect next game', action: set(() => { s.humanSide = other(s.humanSide); }) },
      { label: `Players: ${s.players}`, key: 'p', hint: 'next game', action: set(() => { s.players = s.players === 1 ? 2 : 1; }) },
      { label: `Graphics: G${s.graphics}`, key: 'g', action: set(() => { s.graphics = ((s.graphics + 1) % 4) as 0 | 1 | 2 | 3; }) },
      { label: `Sound: ${s.sound ? 'ON' : 'OFF'}`, key: 'o', action: set(() => { s.sound = !s.sound; }) },
      { label: `Balance: ${balanceNames[String(s.balance)]}`, key: 'b', action: set(() => { s.balance = (s.balance >= 2 ? -2 : s.balance + 1) as typeof s.balance; g.updateIncome(); }) },
      { label: `End: time ${ec.time ? '■' : '□'} cities ${ec.cities ? '■' : '□'} inc ${ec.income ? '■' : '□'} cap ${ec.capital ? '■' : '□'} ratio ${ec.ratio ? '■' : '□'}`, key: 'e', action: () => this.pushEndCond() },
      { label: `Events: ${s.events}`, key: 'v', action: set(() => { const o = ['off', 'union', 'neutral', 'rebel'] as const; s.events = o[(o.indexOf(s.events) + 1) % 4]; }) },
      { label: `Jan campaigns: ${s.janCampaigns ? 'ON' : 'OFF'}`, key: 'j', action: set(() => { s.janCampaigns = !s.janCampaigns; }) },
      { label: `Max recruit: ${s.maxRecruit ? 'ON' : 'OFF'}`, key: 'm', hint: 'recruits scale with city size', action: set(() => { s.maxRecruit = !s.maxRecruit; }) },
      { label: `Aggression: ${s.aggression}`, key: 'a', hint: 'computer opponent 0–5', action: set(() => { s.aggression = (s.aggression + 1) % 6; }) },
      { label: 'MAIN MENU', key: 'x', action: () => (this.menuStack.length > 1 ? this.popMenu() : this.showTitle()) },
    ]);
  }

  private pushEndCond() {
    const s = this.g.state.settings;
    const th = this.g.state.thresholds;
    const ec = s.endCond;
    const tog = (k: keyof typeof ec) => () => { ec[k] = !ec[k]; this.saveCfg(); this.menuStack.pop(); this.pushEndCond(); };
    this.pushMenu('End conditions', [
      { label: `${ec.time ? '■' : '□'} Time: ${th.endMonth}/${th.endYear}`, key: 't', action: tog('time') },
      { label: `${ec.cities ? '■' : '□'} Cities: ${th.citiesPct}%`, key: 'c', action: tog('cities') },
      { label: `${ec.income ? '■' : '□'} Income: ${th.incomePct}%`, key: 'i', action: tog('income') },
      { label: `${ec.capital ? '■' : '□'} Capital captured`, key: 'p', action: tog('capital') },
      { label: `${ec.ratio ? '■' : '□'} Strength ratio ${th.ratio}:1`, key: 'r', action: tog('ratio') },
      { label: 'EXIT', key: 'x', action: () => { this.popMenu(); this.refreshTop(); } },
    ]);
  }

  private pushFiles() {
    this.pushMenu('Files', [
      { label: 'Save game', key: 's', action: () => { this.saveGame(); this.popMenu(); } },
      { label: 'Load game', key: 'l', disabled: !localStorage.getItem(SAVE_KEY), action: () => this.loadGame() },
      { label: 'New game', key: 'n', action: () => this.modal('Abandon the current game?', [{ label: 'Yes', action: () => this.showTitle() }, { label: 'No', action: () => {} }]) },
      { label: 'EXIT', key: 'x', action: () => this.popMenu() },
    ]);
  }

  private showHelp() {
    this.modal(HELP, [{ label: 'Close', action: () => {} }], 'report');
  }

  // ------------------------------------------------------------- helpers
  private doAction(err: string | null, ok: () => void) {
    if (err) { this.toast(err); beep(this.settings.sound, 'error'); return; }
    beep(this.settings.sound, 'click');
    ok();
    this.render();
  }

  private toast(msg: string) {
    this.bannerEl.textContent = msg;
    this.bannerEl.classList.remove('flash');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('flash');
  }

  private modal(text: string, buttons: { label: string; action: () => void }[], cls = '') {
    this.modalEl.className = `modal ${cls}`;
    this.modalEl.innerHTML = '';
    const box = el('div', 'modalbox');
    const pre = el('pre', 'modaltext', text);
    box.append(pre);
    const row = el('div', 'modalbtns');
    buttons.forEach((b, i) => {
      const btn = el('button', 'mbtn', b.label);
      btn.onclick = () => { this.modalEl.classList.add('hidden'); b.action(); this.render(); };
      if (i === 0) setTimeout(() => btn.focus(), 0);
      row.append(btn);
    });
    box.append(row);
    this.modalEl.append(box);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.started) return;
    if (!this.modalEl.classList.contains('hidden')) {
      if (e.key === 'Escape' || e.key === 'Enter') { (this.modalEl.querySelector('button') as HTMLButtonElement)?.click(); e.preventDefault(); }
      return;
    }
    if (e.key === 'F4') { e.preventDefault(); this.nextTurn(); return; }
    if (e.key === 'Escape') { this.popMenu(); return; }
    const top = this.menuStack[this.menuStack.length - 1];
    if (!top) return;
    const k = e.key.toLowerCase();
    if (k.length !== 1) return;
    const item = top.items.find((it) => (it.key ?? it.label[0].toLowerCase()) === k && !it.disabled) ?? top.items.find((it) => it.label[0].toLowerCase() === k && !it.disabled);
    if (item) item.action();
  }

  private bindCanvas() {
    const pos = (ev: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return cityAt(((ev.clientX - r.left) / r.width) * MAP_W, ((ev.clientY - r.top) / r.height) * MAP_H);
    };
    this.canvas.addEventListener('mousemove', (ev) => { this.view.hover = pos(ev); });
    this.canvas.addEventListener('mouseleave', () => { this.view.hover = -1; });
    this.canvas.addEventListener('click', (ev) => {
      if (!this.started || !this.modalEl.classList.contains('hidden')) return;
      const id = pos(ev);
      if (id < 0) return;
      const top = this.menuStack[this.menuStack.length - 1];
      if (top?.onCity) top.onCity(id);
      else { this.view.selected = this.view.selected === id ? -1 : id; }
    });
  }

  render() {
    if (!this.started) return;
    const g = this.g;
    const st = g.state;
    const side = this.active();
    const ss = st.sides[side];
    const es = st.sides[other(side)];
    const total = Math.max(1, ss.vp + es.vp);
    const pct = Math.round((ss.vp / total) * 100);
    this.statusEl.innerHTML = '';
    const flag = el('div', `flag ${side}`, side === 'union' ? 'UNION' : 'CONFEDERATE');
    const date = el('div', 'date', `${g.dateStr()}  ·  Turn ${st.turn}`);
    const bar = el('div', 'bar');
    const fill = el('div', `fill ${side}`);
    fill.style.width = `${pct}%`;
    bar.append(fill);
    const stats = el('div', 'stats');
    stats.innerHTML = `<span>VP <b>${ss.vp}</b> vs ${es.vp}</span><span>Money <b>${ss.money}</b></span><span>Income <b>${ss.income}</b></span><span>Cities <b>${g.ownedCities(side).length}</b></span><span>Armies <b>${g.armiesOf(side).length}</b> · ${fmt(g.totalStrength(side))}</span><span>Fleet <b>${ss.fleet.ships}</b> @ ${cityDef(ss.fleet.port).name}</span>`;
    const flags = el('div', 'flags', `${st.settings.sound ? '♪ ' : ''}G${st.settings.graphics} · ${st.settings.players}P · F4 next turn · Esc back`);
    this.statusEl.append(flag, date, bar, stats, flags);

    this.menuEl.innerHTML = '';
    const top = this.menuStack[this.menuStack.length - 1];
    if (top) {
      this.menuEl.append(el('div', 'mtitle', top.title));
      for (const it of top.items) {
        const b = el('button', 'mitem' + (it.disabled ? ' disabled' : ''));
        const k = it.key ?? it.label[0].toLowerCase();
        const idx = it.label.toLowerCase().indexOf(k);
        const lab = el('span', 'lab');
        lab.innerHTML = idx >= 0 ? `${it.label.slice(0, idx)}<u>${it.label[idx]}</u>${it.label.slice(idx + 1)}` : it.label;
        b.append(lab);
        if (it.hint) b.append(el('span', 'hint', it.hint));
        if (!it.disabled) b.onclick = () => it.action();
        this.menuEl.append(b);
      }
    }
    // log
    const log = st.log;
    while (this.logShown < log.length) {
      const l = log[this.logShown++];
      const d = el('div', `l ${l.kind}`, l.text);
      this.logEl.append(d);
    }
    while (this.logEl.childElementCount > 200) this.logEl.firstElementChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    if (st.banner && this.bannerEl.textContent !== st.banner) this.bannerEl.textContent = st.banner;
  }

  // -------------------------------------------------------------- storage
  private loadCfg(): Settings {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), endCond: { ...DEFAULT_SETTINGS.endCond, ...(JSON.parse(raw).endCond ?? {}) } };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS, endCond: { ...DEFAULT_SETTINGS.endCond } };
  }
  private saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } }
  private loadHiscores(): Record<Side, { name: string; score: number }[]> {
    try { const r = localStorage.getItem(HISCORE_KEY); if (r) return JSON.parse(r); } catch { /* ignore */ }
    return { union: [], rebel: [] };
  }
}

const HELP = `VGA CIVIL WAR STRATEGY — QUICK RULES

Each turn is two months. Both sides make decisions, then all moves and
battles are resolved at once. Win by victory points: cities you hold
(each worth its value), your capital (+50), battles won (+1), armies
captured (+25), fleets sunk (+25), and the side that ends the war (+100).

RECRUIT   100 money. A few of your cities are offered each turn. Empty
          city = new 7,000-man army (can't move this turn). Occupied city
          = +4,500 men to the army there.
MOVES     Point-to-point along the dashed links. Entering an enemy or
          neutral city captures it; entering an enemy army fights it.
          No attacks in January unless Jan Campaigns is on.
COMBAT    Base = men/10,000 (defender /8,000), then leader & experience,
          small-force penalty, outnumbered table, supply, balance, forts.
          Loser retreats to an adjacent friendly city — or surrenders.
SUPPLY    -1 per turn (free in July & September). Out of supply = half
          strength. Auto-resupply costs 1 per 1,000 men; manual is 0.5.
          Port cities keep armies supplied unless blockaded.
SHIPS     One fleet of up to 10 ships (100 each, built in a friendly
          port). Sail to any port. Attack an enemy port to bombard its
          army, reduce forts, or (if empty & unfortified) turn it neutral.
          Union may Invade a neutral port: costs 1 ship, lands 3,500 men.
FORTIFY   200 money; the army rests. FORT+ / FORT++ add defence bonus;
          capture knocks a fort down one level.
JOIN      Stacked armies combine (max 125,000). Best leader commands.
END       Time (Mar 1865 → Rebel default win, scores ×0.7), 80% cities,
          80% income, capital captured, 3:1 strength, or annihilation.
          You may override a triggered condition and fight on.

Keys: letter hotkeys on menus, F4 = next turn, Esc = back.
Click a city on the map to pick it when a menu is asking for one.`;
