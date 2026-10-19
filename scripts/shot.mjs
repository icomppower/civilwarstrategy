import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
const p = await b.newPage({ viewport: { width: 960, height: 760 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await p.goto('http://localhost:4173/');
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/title.png' });
await p.click('text=New Game');
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/main.png' });
// recruit
await p.keyboard.press('r'); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/recruit.png' });
const first = p.locator('.mitem').first(); await first.click(); await p.waitForTimeout(200);
await p.keyboard.press('Escape');
// move: army moves, first army, first dest
await p.keyboard.press('a'); await p.waitForTimeout(200);
await p.locator('.mitem').nth(1).click(); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/dest.png' });
await p.locator('.mitem').first().click(); await p.waitForTimeout(200);
await p.keyboard.press('Escape');
// next turn x3
for (let i=0;i<6;i++){
  await p.keyboard.press('F4'); await p.waitForTimeout(300);
  for (let k=0;k<12;k++){ const btn = p.locator('.modal:not(.hidden) .mbtn').first(); if (await btn.count()) { await btn.click(); await p.waitForTimeout(150);} else break; }
}
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/turn4.png' });
await p.keyboard.press('i'); await p.keyboard.press('c'); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/claude-0/-home-claude/fc47a052-fe9e-5f99-9e49-569be01987f6/scratchpad/cities.png' });
console.log('errors:', errors);
await b.close();
