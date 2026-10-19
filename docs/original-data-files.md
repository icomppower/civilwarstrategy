# Original data files (cws141.zip)

| File | Format | Meaning |
|---|---|---|
| `CITIES.GRD` | CSV | `id, x, y, name, region(0 neutral/1 Union/2 Rebel), value, 6 link slots, port(0/90 river/99 sea), fort` |
| `CWSLEAD.DAT` | CSV | 40 rows `name, rating` — first 20 Union, last 20 Rebel |
| `CWS.INI` | mixed | side/month strings; `3,1861,3,1865,80,80,1,3` = start, end, cities %, income %, capital flag, ratio; 5 Union + 4 Rebel start armies `city,strength(×100),fort,supply`; `300,50` start money; three polylines = Appalachian ridges; `4,30,39,33` = ? , Philadelphia port box, Union capital, Rebel capital |
| `CWSTRAT.SAV` | CSV | per-army `name, strength(×100), leader, city, supply, exp, orders` |
| `HISCORE.CWS` | CSV | 10 rows `name, score` (5 per side) |
| `CWS.EXE` | LZEXE-packed DOS binary, almost certainly compiled QuickBASIC 4.x | combat dice, events and AI |

Map coordinate space is roughly 600 × 450.
