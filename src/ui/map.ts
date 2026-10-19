import { CITIES, RIVERS, cityDef } from '../engine/data';
import type { Game } from '../engine/game';
import type { Side } from '../engine/types';
import { other } from '../engine/types';

export const MAP_W = 600;
export const MAP_H = 450;

export type Overlay = 'none' | 'force' | 'intel';

export interface MapView {
  overlay: Overlay;
  highlight: Set<number>; // city ids to pulse (selectable)
  selected: number; // city id or -1
  selectedArmy: number; // army id or -1
  hover: number;
  viewer: Side;
}

const C = {
  land: '#c9b98a',
  landDark: '#b5a373',
  sea: '#2b4a6b',
  river: '#3f7fc4',
  link: '#6d6247',
  union: '#2a5bd7',
  rebel: '#8a8a8a',
  neutral: '#d9342b',
  text: '#1a1408',
  fort: '#111',
  capital: '#ffe34d',
  order: '#ffffff',
  flagUnion: '#1c3fa8',
  flagRebel: '#b02020',
  mountain: '#8f7f57',
};

const RIVERS_HAND: number[][] = [
  // Mississippi
  [62, 0, 70, 50, 60, 110, 82, 160, 72, 215, 56, 270, 60, 330, 48, 380, 70, 410, 100, 432],
  // Ohio
  [378, 28, 335, 58, 280, 70, 232, 92, 195, 120, 160, 150, 118, 168, 82, 160],
  // Tennessee / Cumberland
  [118, 168, 140, 195, 165, 230, 200, 215, 236, 230, 262, 250],
  // Potomac
  [400, 90, 436, 78, 460, 95, 496, 112],
  // James
  [430, 150, 470, 150, 500, 170],
  // Savannah
  [300, 270, 320, 300, 345, 335],
];

export function drawMap(ctx: CanvasRenderingContext2D, g: Game, v: MapView, t: number) {
  const st = g.state;
  ctx.save();
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  // sea on the east/south edges
  ctx.fillStyle = C.sea;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = C.land;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(600, 0);
  ctx.lineTo(600, 22);
  ctx.lineTo(548, 58);
  ctx.lineTo(530, 110);
  ctx.lineTo(522, 165);
  ctx.lineTo(518, 195);
  ctx.lineTo(478, 240);
  ctx.lineTo(452, 282);
  ctx.lineTo(412, 320);
  ctx.lineTo(372, 352);
  ctx.lineTo(358, 400);
  ctx.lineTo(362, 450);
  ctx.lineTo(300, 450);
  ctx.lineTo(240, 438);
  ctx.lineTo(175, 418);
  ctx.lineTo(140, 428);
  ctx.lineTo(95, 440);
  ctx.lineTo(40, 425);
  ctx.lineTo(0, 440);
  ctx.closePath();
  ctx.fill();
  // Chesapeake Bay
  ctx.fillStyle = C.sea;
  ctx.beginPath();
  ctx.moveTo(512, 95); ctx.lineTo(500, 120); ctx.lineTo(496, 150); ctx.lineTo(508, 168); ctx.lineTo(520, 160); ctx.lineTo(522, 120); ctx.closePath();
  ctx.fill();
  // subtle paper grain
  ctx.fillStyle = C.landDark;
  for (let i = 0; i < 60; i++) {
    const x = (i * 97) % MAP_W;
    const y = (i * 53) % MAP_H;
    ctx.fillRect(x, y, 2, 1);
  }
  // mountain ridges (the original data file's three polylines are the Appalachian chains)
  ctx.fillStyle = C.mountain;
  ctx.strokeStyle = '#5f5236';
  ctx.lineWidth = 1;
  for (const r of RIVERS) {
    for (let i = 0; i < r.length - 2; i += 2) {
      const x = (r[i] + r[i + 2]) / 2;
      const y = (r[i + 1] + r[i + 3]) / 2;
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 5);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 7, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // rivers
  ctx.strokeStyle = C.river;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  for (const r of RIVERS_HAND) {
    ctx.beginPath();
    ctx.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
    ctx.stroke();
  }

  // links
  if (st.settings.graphics >= 1) {
    ctx.strokeStyle = C.link;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const done = new Set<string>();
    for (const c of CITIES) {
      for (const l of c.links) {
        const k = c.id < l ? `${c.id}-${l}` : `${l}-${c.id}`;
        if (done.has(k)) continue;
        done.add(k);
        const o = cityDef(l);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // move orders (own side only)
  ctx.strokeStyle = C.order;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -(t / 60) % 8;
  for (const a of st.armies) {
    if (a.orders < 0 || a.side !== v.viewer) continue;
    const f = cityDef(a.city);
    const d = cityDef(a.orders);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // cities
  for (const c of CITIES) {
    const city = g.city(c.id);
    const col = city.owner === 'union' ? C.union : city.owner === 'rebel' ? C.rebel : C.neutral;
    if (city.fort > 0) {
      ctx.strokeStyle = C.fort;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
      if (city.fort > 1) {
        ctx.fillStyle = C.fort;
        ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
      }
    }
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const s of ['union', 'rebel'] as Side[]) {
      if (st.sides[s].capital === c.id && !st.sides[s].capitalLost) {
        ctx.strokeStyle = C.capital;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - 4, c.y); ctx.lineTo(c.x + 4, c.y);
        ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x, c.y + 4);
        ctx.stroke();
      }
    }
    if (v.highlight.has(c.id)) {
      const r = 10 + Math.sin(t / 150) * 2;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (v.selected === c.id) {
      ctx.strokeStyle = C.capital;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (st.settings.graphics >= 2 || v.hover === c.id) {
      ctx.font = '11px "VT323", monospace';
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.fillText(c.name, Math.max(34, Math.min(MAP_W - 34, c.x)), c.y + 20);
    }
  }

  // fleets
  for (const s of ['union', 'rebel'] as Side[]) {
    const f = st.sides[s].fleet;
    if (f.ships === 0) continue;
    const c = cityDef(f.port);
    const x = c.x - 16;
    const y = c.y - 14;
    ctx.fillStyle = s === 'union' ? C.flagUnion : C.flagRebel;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x + 5, y + 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 1, y - 7, 2, 7);
    ctx.font = '10px "VT323", monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(String(f.ships), x, y + 4);
  }

  // armies
  const byCity = new Map<number, typeof st.armies>();
  for (const a of st.armies) {
    if (!byCity.has(a.city)) byCity.set(a.city, []);
    byCity.get(a.city)!.push(a);
  }
  for (const [cid, list] of byCity) {
    const c = cityDef(cid);
    const bySide = { union: list.filter((a) => a.side === 'union'), rebel: list.filter((a) => a.side === 'rebel') };
    let dx = 10;
    for (const s of ['union', 'rebel'] as Side[]) {
      const arr = bySide[s];
      if (!arr.length) continue;
      const x = c.x + dx;
      const y = c.y - 12;
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y, 1.5, 14);
      ctx.fillStyle = s === 'union' ? C.flagUnion : C.flagRebel;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 11, y + 3);
      ctx.lineTo(x + 1, y + 7);
      ctx.closePath();
      ctx.fill();
      if (arr.length > 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(x + 9, y + 9, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (arr.some((a) => a.supply === 0) && Math.floor(t / 400) % 2 === 0) {
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#d00';
        ctx.textAlign = 'left';
        ctx.fillText('S', x + 13, y + 6);
      }
      if (arr.some((a) => a.id === v.selectedArmy)) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 2, y - 2, 15, 17);
      }
      const total = arr.reduce((n, a) => n + a.strength, 0);
      if (v.overlay === 'force') {
        ctx.font = '11px "VT323", monospace';
        ctx.fillStyle = s === 'union' ? '#0b2a8a' : '#7a0f0f';
        ctx.textAlign = 'left';
        ctx.fillText(String(Math.round(total / 100)), x + 13, y + 14);
      } else if (v.overlay === 'intel' && s === v.viewer) {
        ctx.font = '10px "VT323", monospace';
        ctx.fillStyle = '#0b2a8a';
        ctx.textAlign = 'left';
        arr.forEach((a, i) => ctx.fillText(`${Math.round(a.strength / 100)}/L${a.leader}/E${a.exp}/S${a.supply}`, x + 13, y + 6 + i * 10));
      }
      dx += 16;
    }
  }

  // hover tooltip
  if (v.hover > 0) {
    const c = cityDef(v.hover);
    const city = g.city(c.id);
    const lines = [`${c.name}  (${c.value} pts)`, `${city.owner.toUpperCase()}${city.fort ? '  FORT' + '+'.repeat(city.fort) : ''}${c.port ? (c.port === 99 ? '  sea port' : '  river port') : ''}`];
    for (const a of g.armiesAt(c.id)) {
      const own = a.side === v.viewer || st.settings.players === 2;
      lines.push(own ? `${a.side === 'union' ? 'U' : 'R'} ${a.name}: ${(a.strength / 1000).toFixed(1)}k L${a.leader} E${a.exp} S${a.supply}${a.orders > 0 ? ' →' + cityDef(a.orders).name : ''}` : `${a.side === 'union' ? 'U' : 'R'} ${a.name}: ~${(Math.round(a.strength / 5000) * 5).toFixed(0)}k`);
    }
    ctx.font = '12px "VT323", monospace';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
    const h = lines.length * 13 + 8;
    let bx = c.x + 14;
    let by = c.y - h / 2;
    if (bx + w > MAP_W) bx = c.x - 14 - w;
    by = Math.max(2, Math.min(MAP_H - h - 2, by));
    ctx.fillStyle = 'rgba(10,10,20,0.92)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = '#ffe34d';
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, bx + 6, by + 13 + i * 13));
  }
  void other;
  ctx.restore();
}

export function cityAt(x: number, y: number): number {
  let best = -1;
  let bd = 14 * 14;
  for (const c of CITIES) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}
