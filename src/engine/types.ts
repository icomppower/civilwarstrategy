export type Side = 'union' | 'rebel';
export const SIDES: Side[] = ['union', 'rebel'];
export const other = (s: Side): Side => (s === 'union' ? 'rebel' : 'union');

export type Owner = Side | 'neutral';

export interface CityDef {
  id: number;
  x: number;
  y: number;
  name: string;
  /** 0 = neutral/border, 1 = Union, 2 = Rebel at start */
  region: 0 | 1 | 2;
  value: number;
  links: number[];
  /** 0 = inland, 90 = river port, 99 = sea port */
  port: 0 | 90 | 99;
  fort: number;
}

export interface City {
  id: number;
  owner: Owner;
  fort: number;
}

export interface Army {
  id: number;
  side: Side;
  name: string;
  strength: number; // men
  leader: number; // 1-10
  exp: number; // 0-10
  supply: number; // 0-10
  city: number;
  /** destination city id or -1 */
  orders: number;
  /** cannot move this turn (new, joined, fortified) */
  busy: boolean;
  movedThisTurn: boolean;
  foughtThisTurn: boolean;
  resting: boolean;
}

export interface Fleet {
  ships: number; // 0-10
  hits: number[]; // remaining hits per ship (10 max)
  port: number; // city id
  movedThisTurn: boolean;
}

export interface SideState {
  money: number;
  vp: number; // displayed (lagging)
  bonusVp: number; // accumulated event/battle/capture points
  income: number;
  capital: number; // city id or -1 if lost
  capitalLost: boolean;
  battlesWon: number;
  casualties: number;
  fleet: Fleet;
  leadersUsed: number[]; // indexes into leader roster
  leadersLost: number[];
  genericCount: number;
  recruitCities: number[];
  recruitsThisTurn: number;
}

export type Balance = -2 | -1 | 0 | 1 | 2; // -2 Rebel++, +2 Union++
export type EventBias = 'off' | 'union' | 'neutral' | 'rebel';

export interface Settings {
  players: 1 | 2;
  humanSide: Side;
  balance: Balance;
  events: EventBias;
  janCampaigns: boolean;
  maxRecruit: boolean;
  aggression: number; // 0-5
  graphics: 0 | 1 | 2 | 3;
  sound: boolean;
  endCond: {
    time: boolean;
    cities: boolean;
    income: boolean;
    capital: boolean;
    ratio: boolean;
  };
}

export interface EndThresholds {
  endMonth: number;
  endYear: number;
  citiesPct: number; // e.g. 80
  incomePct: number;
  ratio: number;
}

export interface LogEntry {
  turn: number;
  text: string;
  kind: 'info' | 'battle' | 'event' | 'major';
}

export interface GameState {
  month: number; // 1-12
  year: number;
  turn: number;
  phase: 'decision' | 'update' | 'over';
  activeSide: Side;
  cities: City[];
  armies: Army[];
  nextArmyId: number;
  sides: Record<Side, SideState>;
  settings: Settings;
  thresholds: EndThresholds;
  log: LogEntry[];
  banner: string;
  winner: Side | null;
  endReason: string;
  overrideCount: number;
  rng: number; // seed
}

export interface CombatCalc {
  base: number;
  ldrExp: number;
  small: number;
  outman: number;
  supply: number;
  difclt: number;
  fort: number;
  final: number;
}

export interface BattleReport {
  attacker: Army;
  defender: Army;
  cityId: number;
  atk: CombatCalc;
  def: CombatCalc;
  odds: number;
  attackerWon: boolean;
  atkLoss: number;
  defLoss: number;
  surrendered: boolean;
  retreatTo: number;
}
