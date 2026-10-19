import type { CityDef } from './types';

// id, x, y, name, region, value, links..., port, fort
const RAW: [number, number, number, string, number, number, number[], number, number][] = [
  [1, 265, 290, 'Atlanta', 2, 25, [4, 8, 25, 34], 0, 0],
  [2, 485, 80, 'Baltimore', 0, 40, [13, 14, 30, 39], 99, 0],
  [3, 64, 392, 'Baton Rouge', 2, 5, [27, 38], 90, 0],
  [4, 240, 240, 'Chattanooga', 2, 5, [1, 19, 25, 26, 37], 0, 0],
  [5, 385, 310, 'Charleston SC', 2, 10, [8, 34, 40], 99, 2],
  [6, 320, 110, 'Charleston WV', 1, 5, [7, 12], 0, 0],
  [7, 231, 81, 'Cincinnati', 1, 15, [6, 9, 15, 20, 21], 0, 0],
  [8, 350, 280, 'Columbia', 2, 5, [1, 5, 32, 40], 0, 0],
  [9, 310, 36, 'Columbus', 1, 15, [7, 15, 31], 0, 0],
  [10, 135, 200, 'Fort Donelson', 2, 5, [26, 29, 37], 0, 1],
  [11, 470, 125, 'Fredericksburg', 2, 5, [12, 22, 33, 39], 90, 0],
  [12, 400, 100, 'Front Royal', 2, 5, [6, 11, 13, 22, 33], 0, 0],
  [13, 431, 74, "Harper's Ferry", 1, 10, [2, 12, 14, 22, 39], 0, 1],
  [14, 475, 36, 'Harrisburg', 1, 5, [2, 13, 30, 31], 0, 0],
  [15, 190, 60, 'Indianapolis', 1, 5, [7, 9, 21, 35], 0, 0],
  [16, 339, 412, 'Jacksonville', 2, 5, [34], 99, 0],
  [17, 100, 343, 'Jackson MS', 2, 5, [24, 23, 25, 27, 38], 0, 0],
  [18, 23, 97, 'Jefferson City', 0, 5, [36], 0, 0],
  [19, 270, 205, 'Knoxville', 0, 4, [4], 0, 0],
  [20, 240, 140, 'Lexington', 0, 5, [7, 21, 26], 0, 0],
  [21, 190, 130, 'Louisville', 0, 5, [7, 15, 20, 26, 29], 0, 0],
  [22, 440, 110, 'Manassas', 2, 10, [11, 12, 13, 33, 39], 0, 0],
  [23, 76, 241, 'Memphis', 2, 10, [17, 29, 37, 38], 0, 1],
  [24, 156, 396, 'Mobile', 2, 15, [17, 25, 27], 99, 2],
  [25, 200, 353, 'Montgomery', 2, 15, [1, 4, 17, 24], 0, 0],
  [26, 190, 205, 'Nashville', 2, 10, [4, 10, 20, 21, 37], 0, 0],
  [27, 111, 413, 'New Orleans', 2, 25, [3, 17, 24], 99, 2],
  [28, 500, 175, 'Norfolk', 2, 15, [32, 33], 99, 1],
  [29, 110, 175, 'Paducah', 0, 5, [10, 21, 23, 36], 0, 0],
  [30, 520, 45, 'Philadelphia', 1, 50, [2, 14], 99, 0],
  [31, 373, 36, 'Pittsburgh', 1, 30, [9, 14], 0, 0],
  [32, 430, 210, 'Raleigh', 2, 5, [8, 28, 33, 40], 0, 0],
  [33, 474, 145, 'Richmond', 2, 25, [11, 12, 22, 28, 32], 90, 1],
  [34, 345, 340, 'Savannah', 2, 10, [1, 5, 16], 99, 0],
  [35, 115, 82, 'Springfield', 1, 5, [15, 36], 0, 0],
  [36, 73, 101, 'St. Louis', 1, 25, [18, 29, 35], 0, 0],
  [37, 175, 235, 'Tullahoma', 2, 1, [4, 10, 23, 26], 0, 0],
  [38, 67, 338, 'Vicksburg', 2, 15, [3, 17, 23], 0, 2],
  [39, 474, 104, 'Washington', 1, 25, [2, 11, 13, 22], 90, 1],
  [40, 433, 270, 'Wilmington', 2, 10, [5, 8, 32], 99, 2],
];

export const CITIES: CityDef[] = RAW.map(([id, x, y, name, region, value, links, port, fort]) => ({
  id,
  x,
  y,
  name,
  region: region as 0 | 1 | 2,
  value,
  links,
  port: port as 0 | 90 | 99,
  fort,
}));

export const cityDef = (id: number): CityDef => CITIES[id - 1];

// Links in the source data are one-directional in places; make the graph symmetric.
for (const c of CITIES) {
  for (const l of c.links) {
    const o = cityDef(l);
    if (!o.links.includes(c.id)) o.links.push(c.id);
  }
}

export interface LeaderDef {
  name: string;
  rating: number;
}

export const UNION_LEADERS: LeaderDef[] = [
  ['McDowell', 4], ['McClellan', 5], ['Fremont', 5], ['Buell', 7], ['Pope', 3],
  ['Grant', 8], ['Banks', 4], ['Burnside', 1], ['Sherman', 8], ['Rosecrans', 7],
  ['Hooker', 6], ['Meade', 5], ['Thomas', 7], ['Grierson', 7], ['Custer', 5],
  ['Sheridan', 9], ['Halleck', 5], ['Sigel', 1], ['Butler', 3], ['McPherson', 7],
].map(([name, rating]) => ({ name: name as string, rating: rating as number }));

export const REBEL_LEADERS: LeaderDef[] = [
  ['J.E. Johnston', 8], ['Jackson', 10], ['A.S. Johnston', 10], ['Pemberton', 2], ['Beauregard', 7],
  ['R.E. Lee', 10], ['J.E.B. Stuart', 9], ['Ashby', 8], ['Bragg', 4], ['Longstreet', 8],
  ['Early', 6], ['Van Dorn', 8], ['Hardee', 7], ['Pickett', 8], ['Forrest', 10],
  ['Hood', 8], ['Polk', 7], ['Breckinridge', 8], ['Zollicoffer', 7], ['McCulloch', 6],
].map(([name, rating]) => ({ name: name as string, rating: rating as number }));

/** Starting armies: [cityId, strength(men), startFortBonus, supply, leaderIndex] */
export const START_ARMIES = {
  union: [
    [39, 40000, 1, 9, 0], // McDowell @ Washington
    [7, 28000, 0, 9, 1], // McClellan @ Cincinnati
    [13, 7500, 0, 9, 2], // Fremont @ Harper's Ferry
    [36, 10000, 0, 5, 3], // Buell @ St. Louis
    [9, 12500, 0, 5, 4], // Pope @ Columbus
  ],
  rebel: [
    [33, 30000, 1, 7, 0], // J.E. Johnston @ Richmond
    [12, 20000, 1, 6, 1], // Jackson @ Front Royal
    [26, 14000, 0, 7, 2], // A.S. Johnston @ Nashville
    [38, 7500, 0, 4, 3], // Pemberton @ Vicksburg
  ],
} as const;

export const START_MONEY = { union: 300, rebel: 50 };
export const START = { month: 3, year: 1861 };
export const END = { month: 3, year: 1865 };
export const CAPITALS = { union: 39, rebel: 33 };
export const UNION_PORT_BOX = 30; // Philadelphia

export const RIVERS: number[][] = [
  [390, 125, 380, 145, 360, 160, 345, 180, 330, 193, 317, 209, 300, 230, 280, 242, 270, 265],
  [200, 250, 218, 230, 227, 210, 242, 190, 262, 170, 278, 150, 290, 170, 298, 208],
  [310, 150, 325, 130, 340, 110, 328, 97, 348, 90, 370, 70, 390, 50],
];

export const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
