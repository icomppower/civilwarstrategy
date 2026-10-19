import { Game, DEFAULT_SETTINGS } from '../src/engine/game';
import { runAI } from '../src/engine/ai';
for (let seed = 1; seed <= 6; seed++) {
  const g = new Game({ ...DEFAULT_SETTINGS, players: 2, aggression: 2 }, seed, false);
  let guard = 0; const rows:string[]=[];
  while (g.state.phase !== 'over' && guard++ < 40) {
    runAI(g, 'union'); g.endDecision('union');
    runAI(g, 'rebel'); g.endDecision('rebel');
    const u=g.state.sides.union,r=g.state.sides.rebel;
    rows.push(`${g.dateStr().slice(0,3)}${g.state.year%100} U:c${g.ownedCities('union').length} $${u.money} inc${u.income} str${Math.round(g.totalStrength('union')/1000)}k a${g.armiesOf('union').length} | R:c${g.ownedCities('rebel').length} $${r.money} inc${r.income} str${Math.round(g.totalStrength('rebel')/1000)}k a${g.armiesOf('rebel').length}`);
  }
  console.log(seed, g.state.winner, g.state.endReason); console.log(rows.filter((_,i)=>i%3==0).join('\n'));
}
