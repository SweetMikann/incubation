import { chromium } from 'playwright-core';
const [code, invite, token] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.addInitScript(([c, t]) => { try { localStorage.setItem('plague2.seat.' + c, JSON.stringify({ playerToken: t })); } catch (e) {} }, [code, token]);
await page.goto(`http://127.0.0.1:8085/plague/game.html?room=${code}&invite=${invite}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const r1 = await page.evaluate(() => {
  const d = document.getElementById('chatDock').getBoundingClientRect();
  return { role: document.body.dataset.side, dockBottom: Math.round(d.bottom), innerH: innerHeight, dockH: Math.round(d.height), peek: document.getElementById('chatPeek').textContent.slice(0, 40), sig: !!document.getElementById('cards').dataset.sig, cards: document.querySelectorAll('#cards .card-btn').length };
});
// 滑到卡面板中间，等两次 pull，看位置动没动、DOM 换没换
await page.evaluate(() => document.getElementById('cards').scrollIntoView({ block: 'start' }));
await page.evaluate(() => scrollBy(0, 120));
const before = await page.evaluate(() => ({ y: scrollY, first: document.querySelector('#cards .card-btn') }));
const mark = await page.evaluate(() => { const el = document.querySelector('#cards .card-btn'); el.dataset.mark = 'kept'; return scrollY; });
await page.waitForTimeout(5000);
const after = await page.evaluate(() => ({ y: scrollY, kept: document.querySelector('#cards .card-btn')?.dataset.mark === 'kept' }));
await page.screenshot({ path: '/root/chengbot/plague-smoke/dock-mid.png' });
await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
const r3 = await page.evaluate(() => { const d = document.getElementById('chatDock').getBoundingClientRect(); return { dockBottom: Math.round(d.bottom), innerH: innerHeight }; });
await page.screenshot({ path: '/root/chengbot/plague-smoke/dock-bottom.png' });
console.log(JSON.stringify({ r1, scrollBefore: mark, scrollAfter: after.y, domKept: after.kept, atBottom: r3, errs }, null, 1));
await b.close();
