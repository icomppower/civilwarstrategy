import { Game, DEFAULT_SETTINGS } from '../src/engine/game';
import { runAI } from '../src/engine/ai';
const results: Record<string, number> = {};
for (let seed = 1; seed <= 30; seed++) {
  const g = new Game({ ...DEFAULT_SETTINGS, players: 2, aggression: 2 }, seed, seed % 2 === 0);
  let guard = 0;
  while (g.state.phase !== 'over' && guard++ < 40) {
    runAI(g, 'union'); g.endDecision('union');
    runAI(g, 'rebel'); g.endDecision('rebel');
  }
  const k = `${g.state.winner}:${g.state.endReason}`;
  results[k] = (results[k] ?? 0) + 1;
  if (seed === 1) {
    console.log(g.state.log.filter(l => l.kind !== 'info').slice(0, 40).map(l => l.text).join('\n'));
    console.log('turns', g.state.turn, 'U', g.state.sides.union, 'R', g.state.sides.rebel.vp);
  }
}
console.log(results);
