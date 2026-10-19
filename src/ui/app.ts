import { runAI } from '../engine/ai';
import { CITIES, cityDef } from '../engine/data';
import { DEFAULT_SETTINGS, Game, fmt, sideName } from '../engine/game';
import type { BattleReport, Settings, Side } from '../engine/types';
import { other } from '../engine/types';
import { MAP_H, MAP_W, cityAt, drawMap, type MapView } from './map';
import { beep } from './sound';

type MenuItem = { label: string; key?: string; action: () => void; disabled?: boolean; hint?: string; kind?: 'cta' | 'back' };
type ModalButton = { label: string; action: () => void };

const SAVE_KEY = 'cws.save';
const CFG_KEY = 'cws.cfg';
const HISCORE_KEY = 'cws.hiscore';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
const k = (n: number) => `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;

export class App {
  g!: Game;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  menuEl: HTMLElement;
  statusEl: HTMLElement;
  logEl: HTMLElement;
  bannerEl: HTMLElement;
  turnEl: HTMLElement;
  endTurnBtn: HTMLButtonElement;
  tipEl: HTMLElement;
  toastsEl: HTMLElement;
  toolsEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  view: MapView = { overlay: 'none', highlight: new Set(), selected: -1, selectedArmy: -1, hover: -1, viewer: 'union' };
  menuStack: { title: string; items: MenuItem[]; onCity?: (id: number) => void }[] = [];
  settings: Settings;
  logShown = 0;
  started = false;
  scale = 1;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = this.loadCfg();
    root.innerHTML = '';
    const shell = el('div', 'shell');

    // top bar
    const top = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.append(el('span', 'mark', 'CW'), el('span', '', 'Civil War Strategy'), el('span', 'sub', '1861–1865'));
    this.bannerEl = el('div', 'headline');
    const actions = el('div', 'topactions');
    this.turnEl = el('div', 'pill accent');
    const help = el('button', 'btn ghost', 'Help');
    help.onclick = () => this.showHelp();
    this.endTurnBtn = el('button', 'btn primary');
    this.endTurnBtn.innerHTML = `End Turn <span class="kbd">F4</span>`;
    this.endTurnBtn.onclick = () => this.confirmNextTurn();
    actions.append(this.turnEl, help, this.endTurnBtn);
    top.append(brand, this.bannerEl, actions);

    // main grid
    const frame = el('div', 'frame');
    const left = el('div', 'left');
    const right = el('div', 'right');
    const mapCard = el('div', 'card mapcard');
    const mapwrap = el('div', 'mapwrap');
    this.canvas = el('canvas', 'map');
    this.ctx = this.canvas.getContext('2d')!;
    this.tipEl = el('div', 'tip');
    const legend = el('div', 'maplegend');
    legend.innerHTML = `<span><i style="background:#2f6fe4"></i>Union</span><span><i style="background:#d63a3a"></i>Confederate</span><span><i style="background:#8e97a6"></i>Neutral</span><span><i style="background:#f5c342;border-radius:2px"></i>Capital</span>`;
    this.toolsEl = el('div', 'maptools');
    mapwrap.append(this.canvas, this.tipEl, legend, this.toolsEl);
    mapCard.append(mapwrap);
    const logCard = el('div', 'card logcard');
    const logHead = el('div', 'cardhead');
    logHead.append(el('span', '', 'Dispatches'));
    this.logEl = el('div', 'log');
    logCard.append(logHead, this.logEl);
    left.append(mapCard, logCard);
    this.statusEl = el('div', 'card status');
    this.menuEl = el('div', 'card menu');
    right.append(this.statusEl, this.menuEl);
    frame.append(left, right);

    this.toastsEl = el('div', 'toasts');
    this.modalEl = el('div', 'modal hidden');
    this.titleEl = el('div', 'title');
    shell.append(top, frame);
    root.append(shell, this.toastsEl, this.modalEl, this.titleEl);

    this.fitCanvas();
    new ResizeObserver(() => this.fitCanvas()).observe(this.canvas);
    this.bindCanvas();
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Back the canvas at device resolution so the map stays crisp at any size. */
  private fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(this.canvas.clientWidth || MAP_W));
    const bw = Math.round(w * dpr);
    const bh = Math.round((w * MAP_H / MAP_W) * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.scale = bw / MAP_W;
  }

  // ------------------------------------------------------------- lifecycle
  private frame(t: number) {
    if (this.started) {
      this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      drawMap(this.ctx, this.g, this.view, t);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  showTitle() {
    this.started = false;
    this.titleEl.classList.remove('hidden');
    this.titleEl.innerHTML = '';
    const box = el('div', 'titlebox');
    box.append(el('div', 'eyebrow', 'VGA · 1993 · Browser edition'));
    const h = el('h1', 'titleart');
    h.innerHTML = 'Civil War<br><span>Strategy</span>';
    box.append(h);
    box.append(el('div', 'titlesub', 'A strategic-level wargame of the American Civil War. Forty cities, two-month turns, one capital to take.'));
    const hs = this.loadHiscores();
    const menu = el('div', 'titlemenu');
    const mk = (label: string, fn: () => void) => { const b = el('button', 'tbtn', label); b.onclick = fn; menu.append(b); };
    mk('New Game', () => this.newGame(false));
    mk('Vary Start', () => this.newGame(true));
    if (localStorage.getItem(SAVE_KEY)) mk('Load Saved Game', () => this.loadGame());
    mk('Settings', () => { this.startStub(); this.pushUtility(); });
    box.append(menu);
    const hsEl = el('div', 'hiscores');
    hsEl.append(el('div', 'hstitle', 'High scores'));
    for (const s of ['union', 'rebel'] as Side[]) {
      const col = el('div', 'hscol');
      col.append(el('div', `hsside ${s}`, sideName(s)));
      const list = hs[s];
      if (!list.length) col.append(el('div', 'hsrow empty', 'No scores yet'));
      for (const r of list) {
        const row = el('div', 'hsrow');
        row.append(el('span', '', r.name), el('b', '', String(r.score)));
        col.append(row);
      }
      hsEl.append(col);
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
    this.view.overlay = 'none';
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
  private confirmNextTurn() {
    if (!this.started || !this.modalEl.classList.contains('hidden')) return;
    this.modal('End your decisions and run the turn?', [{ label: 'Run turn', action: () => this.nextTurn() }, { label: 'Not yet', action: () => {} }], '', 'End turn');
  }

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
        this.modal(`Pass the keyboard to the ${sideName(st.activeSide)} player.`, [{ label: 'Ready', action: () => this.startDecision() }], '', 'Hot seat');
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
        this.modalHtml(`<ul class="events">${events.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ul>`, [{ label: 'Continue', action: () => done() }], '', 'Events of the season');
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
    const row = (name: string, x: typeof r.atk) => `<tr><td>${name}</td><td>${x.base}</td><td>${x.ldrExp}</td><td>${x.small}</td><td>${x.outman}</td><td>${x.supply}</td><td>${x.difclt}</td><td>${x.fort}</td><td class="final">${x.final}</td></tr>`;
    const loser = r.attackerWon ? r.defender : r.attacker;
    const sideCard = (role: string, a: typeof r.attacker, loss: number, won: boolean) =>
      `<div class="side ${a.side}${won ? ' won' : ''}"><div class="role">${role} · ${sideName(a.side)}</div><div class="nm">${esc(a.name)}</div><div class="loss">Losses ${fmt(loss)}</div>${won ? '<span class="pill accent">Victor</span>' : ''}</div>`;
    const html = `
      <div class="vs">${sideCard('Attacker', r.attacker, r.atkLoss, r.attackerWon)}<div class="vsmark">VS</div>${sideCard('Defender', r.defender, r.defLoss, !r.attackerWon)}</div>
      <table><thead><tr><th></th><th>Base</th><th>Ldr</th><th>Small</th><th>Outnum</th><th>Supply</th><th>Diff</th><th>Fort</th><th>Final</th></tr></thead>
      <tbody>${row('Attacker', r.atk)}${row('Defender', r.def)}</tbody></table>
      <div class="odds"><span>Attacker odds (guide)</span><b>${(r.odds * 100).toFixed(0)}%</b></div>
      ${r.surrendered ? `<div class="outcome sur">${esc(loser.name)}'s army surrenders.</div>` : r.retreatTo > 0 ? `<div class="outcome">${esc(loser.name)} retreats to ${esc(cityDef(r.retreatTo).name)}.</div>` : ''}`;
    this.modalHtml(html, [{ label: 'Continue', action: next }], 'battle', `Battle of ${cityDef(r.cityId).name}`);
  }

  private showGameOver() {
    const st = this.g.state;
    const w = st.winner!;
    const tile = (kk: string, v: string, s?: string) => `<div class="stat"><div class="k">${kk}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const html = `
      <h1>${sideName(w)} victory</h1>
      <div class="reason">${esc(st.endReason)}</div>
      <div class="grid">
        ${tile('Union VP', String(st.sides.union.vp))}${tile('Rebel VP', String(st.sides.rebel.vp))}${tile('Turns', String(st.turn))}
        ${tile('Battles won', `${st.sides.union.battlesWon} · ${st.sides.rebel.battlesWon}`, 'Union · Rebel')}
        ${tile('Casualties', `${k(st.sides.union.casualties)} · ${k(st.sides.rebel.casualties)}`, 'Union · Rebel')}
        ${tile('Date', this.g.dateStr())}
      </div>`;
    this.modalHtml(html, [
      { label: 'Record score', action: () => this.recordScore() },
      { label: 'Override & keep playing', action: () => { this.g.override(); this.startDecision(); } },
      { label: 'Title screen', action: () => this.showTitle() },
    ], 'gameover', 'Game over');
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
      { label: 'Informs', key: 'i', action: () => this.pushInform() },
      { label: 'Options', key: 'o', action: () => this.pushOptions() },
      { label: 'Utility', key: 'u', action: () => this.pushUtility() },
      { label: 'Files', key: 'f', action: () => this.pushFiles() },
      { label: 'Help', key: 'h', action: () => this.showHelp() },
      { label: 'Next Turn', key: 'n', kind: 'cta', hint: 'F4', action: () => this.confirmNextTurn() },
    ]);
  }

  private cityItems(ids: number[], fn: (id: number) => void, extra?: (id: number) => string): MenuItem[] {
    return ids
      .map((id) => ({ id, name: cityDef(id).name }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ label: name, action: () => fn(id), hint: extra?.(id) }));
  }

  private exit(label = 'Back'): MenuItem {
    return { label, key: 'x', kind: 'back', action: () => this.popMenu() };
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
    items.push(this.exit());
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
      this.exit(),
    ]);
  }

  private pushPortPick() {
    const g = this.g;
    const side = this.active();
    const ports = g.portsFor(side);
    const items = this.cityItems(ports, (id) => this.doAction(g.moveFleet(side, id), () => { this.popMenu(); this.refreshTop(); }), (id) => g.city(id).owner);
    items.push(this.exit());
    this.pushMenu('Sail to', items, (id) => { if (ports.includes(id)) this.doAction(g.moveFleet(side, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(ports);
  }

  private pushInvade() {
    const g = this.g;
    const side = this.active();
    const ids = g.invasionTargets(side);
    const items = this.cityItems(ids, (id) => this.doAction(g.invade(side, id), () => { this.popMenu(); this.refreshTop(); }));
    items.push(this.exit());
    this.pushMenu('Invade', items, (id) => { if (ids.includes(id)) this.doAction(g.invade(side, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(ids);
  }

  private pushMoves() {
    const g = this.g;
    const side = this.active();
    const armies = g.movable(side);
    const items: MenuItem[] = armies.map((a) => ({
      label: `${a.name}`,
      hint: `${cityDef(a.city).name} · ${k(a.strength)}`,
      action: () => this.pushDest(a.id),
    }));
    items.push(this.exit());
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
      return `${c.owner}${c.fort ? ' · fort ' + c.fort : ''}${en.length ? ` · enemy ~${Math.round(en.reduce((n, x) => n + x.strength, 0) / 1000)}k` : ''}`;
    });
    items.push(this.exit());
    this.pushMenu(`${a.name} → ?`, items, (id) => { if (dests.includes(id)) this.doAction(g.order(armyId, id), () => { this.popMenu(); this.refreshTop(); }); });
    this.view.highlight = new Set(dests);
  }

  private pushInform() {
    const ov = (o: MapView['overlay']) => () => { this.view.overlay = this.view.overlay === o ? 'none' : o; this.render(); };
    this.pushMenu('Inform', [
      { label: 'Friendly armies', key: 'f', action: () => this.reportArmies(this.active()) },
      { label: 'Enemy armies', key: 'e', action: () => this.reportArmies(other(this.active())) },
      { label: 'Cities', key: 'c', action: () => this.reportCities() },
      { label: 'Force summary', key: 's', hint: this.view.overlay === 'force' ? 'on' : 'map overlay', action: ov('force') },
      { label: 'Intelligence', key: 'i', hint: this.view.overlay === 'intel' ? 'on' : 'map overlay', action: ov('intel') },
      { label: 'Battle summary', key: 'b', action: () => this.reportBattles() },
      { label: 'Event log', key: 'l', action: () => this.reportLog() },
      { label: 'Back', key: 'x', kind: 'back', action: () => { this.view.overlay = 'none'; this.popMenu(); } },
    ]);
  }

  private reportArmies(side: Side) {
    const g = this.g;
    const own = side === this.active();
    const rows = g.armiesOf(side).map((a) => own
      ? `${a.name.padEnd(14)} ${cityDef(a.city).name.padEnd(15)} ${fmt(a.strength).padStart(8)}  L${a.leader} E${String(a.exp).padStart(2)} S${String(a.supply).padStart(2)}  ${a.resting ? 'Resting' : a.busy ? 'Organizing' : a.orders > 0 ? '→ ' + cityDef(a.orders).name : ''}`
      : `${a.name.padEnd(14)} ${cityDef(a.city).name.padEnd(15)} ~${fmt(Math.round(a.strength / 5000) * 5000).padStart(8)}  L${a.leader}`);
    const ss = g.state.sides[side];
    const text = [
      ...(rows.length ? rows : ['(none)']),
      '',
      `Total strength: ${fmt(g.totalStrength(side))}   Armies: ${rows.length}   Fleet: ${ss.fleet.ships} ships at ${cityDef(ss.fleet.port).name}`,
      own ? `Money: ${ss.money}   Income: ${ss.income}/turn   VP: ${ss.vp}` : `Enemy total strength: ${fmt(g.totalStrength(side))}`,
    ].join('\n');
    this.modal(text, [{ label: 'Close', action: () => {} }], 'report', `${sideName(side)} armies · ${g.dateStr()}`);
  }

  private reportCities() {
    const g = this.g;
    const rows = CITIES.map((c) => {
      const city = g.city(c.id);
      return `${c.name.padEnd(16)} ${String(c.value).padStart(3)}  ${city.owner.padEnd(8)} ${city.fort ? 'FORT' + '+'.repeat(city.fort) : '      '} ${c.port === 99 ? 'sea' : c.port === 90 ? 'river' : '     '}`.padEnd(44) + (g.armiesAt(c.id).length ? ` ${g.armiesAt(c.id).map((a) => (a.side === 'union' ? 'U:' : 'R:') + a.name).join(', ')}` : '');
    });
    const u = g.ownedCities('union').length;
    const r = g.ownedCities('rebel').length;
    this.modal(['City              Pts  Owner    Fort   Port', ...rows].join('\n'), [{ label: 'Close', action: () => {} }], 'report', `Cities · Union ${u} · Rebel ${r} · Neutral ${40 - u - r}`);
  }

  private reportBattles() {
    const s = this.g.state.sides;
    this.modal([
      `              Battles won   Casualties`,
      `Union         ${String(s.union.battlesWon).padStart(11)}   ${fmt(s.union.casualties).padStart(10)}`,
      `Rebel         ${String(s.rebel.battlesWon).padStart(11)}   ${fmt(s.rebel.casualties).padStart(10)}`,
      '',
      `Victory points — Union ${s.union.vp}   Rebel ${s.rebel.vp}`,
    ].join('\n'), [{ label: 'Close', action: () => {} }], 'report', 'Battle summary');
  }

  private reportLog() {
    const lines = this.g.state.log.slice(-60).map((l) => `${l.kind === 'major' ? '★ ' : l.kind === 'battle' ? '⚔ ' : l.kind === 'event' ? '• ' : '  '}${l.text}`);
    this.modal(lines.join('\n'), [{ label: 'Close', action: () => {} }], 'report', 'Event log · last 60');
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
      this.exit('Main menu'),
    ]);
  }

  private pushPick(title: string, items: MenuItem[]) {
    items.push(this.exit());
    this.pushMenu(title, items);
  }

  private pushCityPick(title: string, ids: number[], fn: (id: number) => string | null) {
    const run = (id: number) => this.doAction(fn(id), () => { this.popMenu(); this.refreshTop(); });
    const items = this.cityItems(ids, run);
    items.push(this.exit());
    this.pushMenu(title, items, (id) => { if (ids.includes(id)) run(id); });
    this.view.highlight = new Set(ids);
  }

  private pushUtility() {
    const g = this.g;
    const s = g.state.settings;
    const ec = s.endCond;
    const balanceNames = { '-2': 'Rebel++', '-1': 'Rebel+', '0': 'Even', '1': 'Union+', '2': 'Union++' } as Record<string, string>;
    const set = (fn: () => void) => () => { fn(); this.settings = s; this.saveCfg(); this.refreshTop(); };
    const box = (b: boolean) => (b ? '●' : '○');
    this.pushMenu('Utility', [
      { label: 'Side', key: 's', hint: `${sideName(s.humanSide)} · next game`, action: set(() => { s.humanSide = other(s.humanSide); }) },
      { label: 'Players', key: 'p', hint: `${s.players} · next game`, action: set(() => { s.players = s.players === 1 ? 2 : 1; }) },
      { label: 'Graphics', key: 'g', hint: `G${s.graphics}`, action: set(() => { s.graphics = ((s.graphics + 1) % 4) as 0 | 1 | 2 | 3; }) },
      { label: 'Sound', key: 'o', hint: s.sound ? 'On' : 'Off', action: set(() => { s.sound = !s.sound; }) },
      { label: 'Balance', key: 'b', hint: balanceNames[String(s.balance)], action: set(() => { s.balance = (s.balance >= 2 ? -2 : s.balance + 1) as typeof s.balance; g.updateIncome(); }) },
      { label: 'End conditions', key: 'e', hint: `time ${box(ec.time)} cities ${box(ec.cities)} inc ${box(ec.income)} cap ${box(ec.capital)} ratio ${box(ec.ratio)}`, action: () => this.pushEndCond() },
      { label: 'Events', key: 'v', hint: s.events, action: set(() => { const o = ['off', 'union', 'neutral', 'rebel'] as const; s.events = o[(o.indexOf(s.events) + 1) % 4]; }) },
      { label: 'Jan campaigns', key: 'j', hint: s.janCampaigns ? 'On' : 'Off', action: set(() => { s.janCampaigns = !s.janCampaigns; }) },
      { label: 'Max recruit', key: 'm', hint: s.maxRecruit ? 'On · scales with city' : 'Off', action: set(() => { s.maxRecruit = !s.maxRecruit; }) },
      { label: 'Aggression', key: 'a', hint: `${s.aggression} · AI 0–5`, action: set(() => { s.aggression = (s.aggression + 1) % 6; }) },
      { label: this.menuStack.length > 1 ? 'Main menu' : 'Title screen', key: 'x', kind: 'back', action: () => (this.menuStack.length > 1 ? this.popMenu() : this.showTitle()) },
    ]);
  }

  private pushEndCond() {
    const s = this.g.state.settings;
    const th = this.g.state.thresholds;
    const ec = s.endCond;
    const tog = (kk: keyof typeof ec) => () => { ec[kk] = !ec[kk]; this.saveCfg(); this.menuStack.pop(); this.pushEndCond(); };
    const box = (b: boolean) => (b ? '●' : '○');
    this.pushMenu('End conditions', [
      { label: `${box(ec.time)} Time`, key: 't', hint: `${th.endMonth}/${th.endYear}`, action: tog('time') },
      { label: `${box(ec.cities)} Cities`, key: 'c', hint: `${th.citiesPct}%`, action: tog('cities') },
      { label: `${box(ec.income)} Income`, key: 'i', hint: `${th.incomePct}%`, action: tog('income') },
      { label: `${box(ec.capital)} Capital captured`, key: 'p', action: tog('capital') },
      { label: `${box(ec.ratio)} Strength ratio`, key: 'r', hint: `${th.ratio}:1`, action: tog('ratio') },
      { label: 'Back', key: 'x', kind: 'back', action: () => { this.popMenu(); this.refreshTop(); } },
    ]);
  }

  private pushFiles() {
    this.pushMenu('Files', [
      { label: 'Save game', key: 's', action: () => { this.saveGame(); this.popMenu(); } },
      { label: 'Load game', key: 'l', disabled: !localStorage.getItem(SAVE_KEY), action: () => this.loadGame() },
      { label: 'New game', key: 'n', action: () => this.modal('Abandon the current game?', [{ label: 'Abandon', action: () => this.showTitle() }, { label: 'Keep playing', action: () => {} }], '', 'New game') },
      this.exit(),
    ]);
  }

  private showHelp() {
    if (!this.started) return;
    this.modal(HELP, [{ label: 'Close', action: () => {} }], 'report', 'Quick rules');
  }

  // ------------------------------------------------------------- helpers
  private doAction(err: string | null, ok: () => void) {
    if (err) { this.toast(err, true); beep(this.settings.sound, 'error'); return; }
    beep(this.settings.sound, 'click');
    ok();
    this.render();
  }

  private toast(msg: string, isErr = false) {
    const t = el('div', 'toast' + (isErr ? ' err' : ''), msg);
    this.toastsEl.append(t);
    while (this.toastsEl.childElementCount > 4) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  private modal(text: string, buttons: ModalButton[], cls = '', title = '') {
    const pre = el('pre', 'modaltext', text);
    this.modalNode(pre, buttons, cls, title);
  }

  private modalHtml(html: string, buttons: ModalButton[], cls = '', title = '') {
    const body = el('div', 'modalrich');
    body.innerHTML = html;
    this.modalNode(body, buttons, cls, title);
  }

  private modalNode(node: HTMLElement, buttons: ModalButton[], cls: string, title: string) {
    this.modalEl.className = `modal ${cls}`;
    this.modalEl.innerHTML = '';
    const box = el('div', 'modalbox');
    if (title) {
      const head = el('div', 'modalhead');
      head.append(el('h2', '', title));
      box.append(head);
    }
    const body = el('div', 'modalbody');
    body.append(node);
    box.append(body);
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
    const key = e.key.toLowerCase();
    if (key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const item = top.items.find((it) => (it.key ?? it.label[0].toLowerCase()) === key && !it.disabled) ?? top.items.find((it) => it.label[0].toLowerCase() === key && !it.disabled);
    if (item) item.action();
  }

  private bindCanvas() {
    const pos = (ev: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return cityAt(((ev.clientX - r.left) / r.width) * MAP_W, ((ev.clientY - r.top) / r.height) * MAP_H);
    };
    this.canvas.addEventListener('mousemove', (ev) => {
      const id = pos(ev);
      if (id !== this.view.hover) { this.view.hover = id; this.updateTip(); }
    });
    this.canvas.addEventListener('mouseleave', () => { this.view.hover = -1; this.updateTip(); });
    this.canvas.addEventListener('click', (ev) => {
      if (!this.started || !this.modalEl.classList.contains('hidden')) return;
      const id = pos(ev);
      if (id < 0) return;
      const top = this.menuStack[this.menuStack.length - 1];
      if (top?.onCity) top.onCity(id);
      else { this.view.selected = this.view.selected === id ? -1 : id; }
    });
  }

  private updateTip() {
    const id = this.view.hover;
    if (id < 0 || !this.started) { this.tipEl.classList.remove('show'); return; }
    const g = this.g;
    const c = cityDef(id);
    const city = g.city(id);
    const st = g.state;
    const meta = [city.owner === 'rebel' ? 'Confederate' : city.owner === 'union' ? 'Union' : 'Neutral'];
    if (city.fort) meta.push('Fort ' + '+'.repeat(city.fort));
    if (c.port) meta.push(c.port === 99 ? 'Sea port' : 'River port');
    if (st.sides.union.capital === id && !st.sides.union.capitalLost) meta.push('Union capital');
    if (st.sides.rebel.capital === id && !st.sides.rebel.capitalLost) meta.push('Rebel capital');
    let html = `<div class="tname">${esc(c.name)}<span>${c.value} pts</span></div><div class="tmeta">${meta.join(' · ')}</div>`;
    for (const a of g.armiesAt(id)) {
      const own = a.side === this.view.viewer || st.settings.players === 2;
      html += own
        ? `<div class="tarmy ${a.side}"><b>${esc(a.name)}</b><span>${k(a.strength)} · L${a.leader} E${a.exp} S${a.supply}${a.orders > 0 ? ' → ' + esc(cityDef(a.orders).name) : ''}</span></div>`
        : `<div class="tarmy ${a.side}"><b>${esc(a.name)}</b><span>~${Math.round(a.strength / 5000) * 5}k · L${a.leader}</span></div>`;
    }
    this.tipEl.innerHTML = html;
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width / MAP_W;
    const sy = r.height / MAP_H;
    const tw = this.tipEl.offsetWidth || 200;
    const th = this.tipEl.offsetHeight || 60;
    let left = c.x * sx + 16;
    let top = c.y * sy - th / 2;
    if (left + tw > r.width - 8) left = c.x * sx - 16 - tw;
    top = Math.max(8, Math.min(r.height - th - 8, top));
    this.tipEl.style.left = `${left}px`;
    this.tipEl.style.top = `${top}px`;
    this.tipEl.classList.add('show');
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

    // top bar
    this.turnEl.textContent = `${g.dateStr()} · Turn ${st.turn}`;
    if (st.banner && this.bannerEl.textContent !== st.banner) this.bannerEl.textContent = st.banner;

    // map tools (overlay toggles)
    this.toolsEl.innerHTML = '';
    for (const [o, lab] of [['force', 'Forces'], ['intel', 'Intel']] as const) {
      const b = el('button', 'btn' + (this.view.overlay === o ? ' on' : ''), lab);
      b.onclick = () => { this.view.overlay = this.view.overlay === o ? 'none' : o; this.render(); };
      this.toolsEl.append(b);
    }

    // status card
    this.statusEl.innerHTML = '';
    const head = el('div', 'sidehead');
    head.append(el('div', `flag ${side}`, side === 'union' ? 'Union' : 'Confederate'), el('div', 'date', g.dateStr()));
    const vp = el('div', 'vp');
    const vprow = el('div', 'vprow');
    vprow.innerHTML = `<span>Victory points <b>${ss.vp}</b></span><span><b>${es.vp}</b> ${sideName(other(side))}</span>`;
    const bar = el('div', 'bar');
    const fill = el('div', `fill ${side}`);
    fill.style.width = `${pct}%`;
    bar.append(fill);
    vp.append(vprow, bar);
    const stats = el('div', 'stats');
    const tile = (kk: string, v: string, s?: string) => `<div class="stat"><div class="k">${kk}</div><div class="v${v.length > 8 ? ' long' : ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    stats.innerHTML =
      tile('Money', `$${ss.money}`, `+${ss.income} / turn`) +
      tile('Cities', String(g.ownedCities(side).length), `of ${CITIES.length}`) +
      tile('Armies', String(g.armiesOf(side).length), k(g.totalStrength(side)) + ' men') +
      tile('Fleet', `${ss.fleet.ships} ship${ss.fleet.ships === 1 ? '' : 's'}`, cityDef(ss.fleet.port).name) +
      tile('Capital', ss.capitalLost ? 'Lost' : cityDef(ss.capital).name) +
      tile('Battles won', String(ss.battlesWon), `${k(ss.casualties)} lost`);
    const flags = el('div', 'flags');
    flags.innerHTML = `<span class="pill">${st.settings.players === 1 ? 'Solo' : 'Hot seat'}</span><span class="pill">G${st.settings.graphics}</span><span class="pill">${st.settings.sound ? 'Sound on' : 'Muted'}</span><span class="pill">Esc back</span>`;
    this.statusEl.append(head, vp, stats, flags);

    // menu card
    this.menuEl.innerHTML = '';
    const top = this.menuStack[this.menuStack.length - 1];
    if (top) {
      const title = el('div', 'mtitle');
      if (this.menuStack.length > 1) {
        const back = el('button', 'back', '‹');
        back.title = 'Back (Esc)';
        back.onclick = () => this.popMenu();
        title.append(back);
        title.append(el('span', 'crumb', this.menuStack.slice(0, -1).map((m) => m.title.split(' (')[0]).join(' / ') + ' /'));
      }
      title.append(el('span', '', top.title));
      this.menuEl.append(title);
      const list = el('div', 'mlist');
      for (const it of top.items) {
        const b = el('button', 'mitem' + (it.disabled ? ' disabled' : '') + (it.kind ? ' ' + it.kind : ''));
        const key = it.key ?? it.label[0].toLowerCase();
        b.append(el('span', 'kbd key', key.toUpperCase()));
        const lab = el('span', 'lab', it.label);
        b.append(lab);
        if (it.hint) b.append(el('span', 'hint', it.hint));
        else if (!it.kind) b.append(el('span', 'chev', '›'));
        if (!it.disabled) b.onclick = () => it.action();
        list.append(b);
      }
      this.menuEl.append(list);
    }

    // log
    const log = st.log;
    while (this.logShown < log.length) {
      const l = log[this.logShown++];
      this.logEl.append(el('div', `l ${l.kind}`, l.text));
    }
    while (this.logEl.childElementCount > 200) this.logEl.firstElementChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    if (this.view.hover >= 0) this.updateTip();
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

const HELP = `Each turn is two months. Both sides make decisions, then all moves and
battles are resolved at once. Win by victory points: cities you hold
(each worth its value), your capital (+50), battles won (+1), armies
captured (+25), fleets sunk (+25), and the side that ends the war (+100).

RECRUIT   100 money. A few of your cities are offered each turn. Empty
          city = new 7,000-man army (can't move this turn). Occupied city
          = +4,500 men to the army there.
MOVES     Point-to-point along the links. Entering an enemy or
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
