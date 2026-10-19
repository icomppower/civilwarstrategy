import { CITIES, RIVERS, cityDef } from '../engine/data';
import type { Game } from '../engine/game';
import type { Side } from '../engine/types';

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
  sea: '#1b2a3f',
  seaDeep: '#15223a',
  land: '#d8d0ba',
  landEdge: '#b9b097',
  river: '#4f8fd6',
  link: 'rgba(30, 40, 60, 0.22)',
  linkHi: 'rgba(245, 195, 66, 0.7)',
  union: '#2f6fe4',
  rebel: '#d63a3a',
  neutral: '#8e97a6',
  text: '#2b3242',
  fort: '#2b3242',
  capital: '#f5c342',
  order: 'rgba(255,255,255,0.92)',
  mountain: 'rgba(90, 80, 60, 0.28)',
  mountainEdge: 'rgba(60, 52, 38, 0.35)',
  halo: 'rgba(216,208,186,0.9)',
};

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

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

const COAST: number[] = [0, 0, 600, 0, 600, 22, 548, 58, 530, 110, 522, 165, 518, 195, 478, 240, 452, 282, 412, 320, 372, 352, 358, 400, 362, 450, 300, 450, 240, 438, 175, 418, 140, 428, 95, 440, 40, 425, 0, 440];

function poly(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, halo: string | null, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawMap(ctx: CanvasRenderingContext2D, g: Game, v: MapView, t: number) {
  const st = g.state;
  ctx.save();
  ctx.clearRect(0, 0, MAP_W, MAP_H);

  // sea
  const seaGrad = ctx.createLinearGradient(0, 0, MAP_W, MAP_H);
  seaGrad.addColorStop(0, C.sea);
  seaGrad.addColorStop(1, C.seaDeep);
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // land with a soft coastal shadow
  poly(ctx, COAST);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = C.land;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.landEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Chesapeake Bay
  poly(ctx, [512, 95, 500, 120, 496, 150, 508, 168, 520, 160, 522, 120]);
  ctx.fillStyle = C.sea;
  ctx.fill();
  ctx.strokeStyle = C.landEdge;
  ctx.stroke();

  // mountain ridges (the original data file's three polylines are the Appalachian chains)
  for (const r of RIVERS) {
    for (let i = 0; i < r.length - 2; i += 2) {
      const x = (r[i] + r[i + 2]) / 2;
      const y = (r[i + 1] + r[i + 3]) / 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 5);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 8, y + 5);
      ctx.closePath();
      ctx.fillStyle = C.mountain;
      ctx.fill();
      ctx.strokeStyle = C.mountainEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // rivers
  ctx.strokeStyle = C.river;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const r of RIVERS_HAND) {
    ctx.beginPath();
    ctx.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
    ctx.stroke();
  }

  // links; the ones touching the selected city/army glow
  if (st.settings.graphics >= 1) {
    const selFrom = v.selectedArmy >= 0 ? (g.army(v.selectedArmy)?.city ?? -1) : v.selected;
    const done = new Set<string>();
    for (const c of CITIES) {
      for (const l of c.links) {
        const k = c.id < l ? `${c.id}-${l}` : `${l}-${c.id}`;
        if (done.has(k)) continue;
        done.add(k);
        const o = cityDef(l);
        const hi = selFrom >= 0 && (c.id === selFrom || l === selFrom);
        ctx.strokeStyle = hi ? C.linkHi : C.link;
        ctx.lineWidth = hi ? 2.2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
      }
    }
  }

  // move orders (own side only), animated dashes with an arrow head
  for (const a of st.armies) {
    if (a.orders < 0 || a.side !== v.viewer) continue;
    const f = cityDef(a.city);
    const d = cityDef(a.orders);
    ctx.strokeStyle = C.order;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -(t / 50) % 10;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(d.y - f.y, d.x - f.x);
    const hx = d.x - Math.cos(ang) * 11;
    const hy = d.y - Math.sin(ang) * 11;
    ctx.fillStyle = C.order;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(ang) * 6, hy + Math.sin(ang) * 6);
    ctx.lineTo(hx + Math.cos(ang + 2.4) * 5, hy + Math.sin(ang + 2.4) * 5);
    ctx.lineTo(hx + Math.cos(ang - 2.4) * 5, hy + Math.sin(ang - 2.4) * 5);
    ctx.closePath();
    ctx.fill();
  }

  // highlight rings (under the markers)
  for (const c of CITIES) {
    if (v.highlight.has(c.id)) {
      const pulse = (Math.sin(t / 220) + 1) / 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 13 + pulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,195,66,${0.18 + pulse * 0.12})`;
      ctx.fill();
      ctx.strokeStyle = C.capital;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (v.selected === c.id) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // cities
  for (const c of CITIES) {
    const city = g.city(c.id);
    const col = city.owner === 'union' ? C.union : city.owner === 'rebel' ? C.rebel : C.neutral;
    const isCap = (['union', 'rebel'] as Side[]).some((s) => st.sides[s].capital === c.id && !st.sides[s].capitalLost);
    const r = c.value >= 25 ? 7 : c.value >= 10 ? 6 : 5;
    if (city.fort > 0) {
      roundRect(ctx, c.x - r - 4, c.y - r - 4, (r + 4) * 2, (r + 4) * 2, 4);
      ctx.fillStyle = city.fort > 1 ? C.fort : 'rgba(43,50,66,0.22)';
      ctx.fill();
      ctx.strokeStyle = C.fort;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (isCap) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = C.capital;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? 3.2 : 1.4;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = c.x + Math.cos(a) * rr;
        const py = c.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (c.port) {
      ctx.beginPath();
      ctx.arc(c.x + r + 2, c.y + r + 2, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = c.port === 99 ? C.river : '#8fc1ee';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const emphasised = v.hover === c.id || v.selected === c.id;
    if (st.settings.graphics >= 2 || emphasised || v.highlight.has(c.id)) {
      label(ctx, c.name, Math.max(36, Math.min(MAP_W - 36, c.x)), c.y + r + 11, emphasised ? 11 : 10, C.text, C.halo, emphasised ? 700 : 500);
    }
  }

  // fleets
  for (const s of ['union', 'rebel'] as Side[]) {
    const f = st.sides[s].fleet;
    if (f.ships === 0) continue;
    const c = cityDef(f.port);
    const x = c.x - 18;
    const y = c.y - 16;
    const col = s === 'union' ? C.union : C.rebel;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 9, y + 2);
    ctx.lineTo(x + 9, y + 2);
    ctx.lineTo(x + 6, y + 7);
    ctx.lineTo(x - 6, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 0.75, y - 7, 1.5, 9);
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 7);
    ctx.lineTo(x + 7, y - 2);
    ctx.lineTo(x + 1, y + 1);
    ctx.closePath();
    ctx.fill();
    label(ctx, String(f.ships), x - 5, y - 3, 9, '#fff', 'rgba(0,0,0,0.5)', 700);
  }

  // armies as side-coloured pills next to the city
  const byCity = new Map<number, typeof st.armies>();
  for (const a of st.armies) {
    if (!byCity.has(a.city)) byCity.set(a.city, []);
    byCity.get(a.city)!.push(a);
  }
  for (const [cid, list] of byCity) {
    const c = cityDef(cid);
    const bySide = { union: list.filter((a) => a.side === 'union'), rebel: list.filter((a) => a.side === 'rebel') };
    let dx = 9;
    for (const s of ['union', 'rebel'] as Side[]) {
      const arr = bySide[s];
      if (!arr.length) continue;
      const col = s === 'union' ? C.union : C.rebel;
      const total = arr.reduce((n, a) => n + a.strength, 0);
      const showNum = v.overlay === 'force' || (v.overlay === 'intel' && s === v.viewer);
      const txt = showNum ? `${Math.round(total / 1000)}k` : '';
      ctx.font = `700 9px ${FONT}`;
      const w = showNum ? ctx.measureText(txt).width + 18 : 14;
      const h = 14;
      const x = c.x + dx;
      const y = c.y - 22;
      const sel = arr.some((a) => a.id === v.selectedArmy);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.5;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
      roundRect(ctx, x, y, w, h, 4);
      ctx.strokeStyle = sel ? C.capital : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.stroke();
      // flag glyph
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 3);
      ctx.lineTo(x + 10, y + 6);
      ctx.lineTo(x + 4, y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 3.5, y + 3, 1, 8);
      if (showNum) {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 9px ${FONT}`;
        ctx.fillText(txt, x + 13, y + h / 2 + 0.5);
      }
      if (arr.length > 1) {
        ctx.beginPath();
        ctx.arc(x + w, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = C.capital;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        label(ctx, String(arr.length), x + w, y + 0.5, 7, '#1a1403', null, 800);
      }
      if (arr.some((a) => a.supply === 0) && Math.floor(t / 450) % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y + h, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = C.rebel;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        label(ctx, '!', x, y + h + 0.5, 8, C.rebel, null, 800);
      }
      if (v.overlay === 'intel' && s === v.viewer) {
        arr.forEach((a, i) => label(ctx, `L${a.leader} E${a.exp} S${a.supply}`, x + w / 2 + 2, y + h + 7 + i * 9, 8, C.text, C.halo, 600));
      }
      dx += w + 4;
    }
  }

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
