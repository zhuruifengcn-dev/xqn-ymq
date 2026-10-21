/**
 * 浏览器端到端验证：真实渲染 + 交互 + 存档持久化 + 截图
 */
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PW = 'C:/Users/朱瑞丰/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(PW).href);
const OUT = path.join(__dir, 'shots');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8899/GAME/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = [];
const chk = (n, c, x = '') => results.push({ n, ok: !!c, x });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
// 拦截 alert（通关后 doAction 会提示）
page.on('dialog', async d => { await d.accept(); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

/* 1. 首屏渲染 */
chk('页面标题正确', (await page.title()).includes('苍澜拓土录'), await page.title());
chk('开篇剧情已渲染', (await page.locator('.ev-h').first().textContent()).includes('开卷'));
chk('五维面板存在', (await page.locator('.dim').count()) === 4, `dim=${await page.locator('.dim').count()}`);
chk('初始值正确', (await page.locator('.dim-v').first().textContent()).trim() === '40');
const chpText = (await page.locator('.chp-t').first().textContent() || '').trim();
chk('政务面板有章节', /第\s*1\s*章/.test(chpText) && chpText.includes('初临荒疆'), chpText);
chk('已解锁区域含近郊', (await page.locator('.tag.on').first().textContent()).includes('云边城关近郊'));
chk('NPC 全部列出', (await page.locator('.npc').count()) === 6, `npc=${await page.locator('.npc').count()}`);

await page.screenshot({ path: path.join(OUT, '01-opening.png'), fullPage: false });

/* 2. 进入游戏 + 行动菜单 */
await page.locator('.opt').first().click();
await page.waitForTimeout(300);
await page.locator('.tabs button[data-v=menu]').click();
await page.waitForTimeout(300);
const menuLabels = await page.locator('.m-btn b').allTextContents();
chk('行动菜单 20 项齐全', menuLabels.length === 20, `${menuLabels.length} 项`);
chk('含核心三项', ['推进主线', '随机任务', '刷副本'].every(k => menuLabels.includes(k)), menuLabels.slice(0, 3).join(','));

/* 3. 执行自由操作：开荒拓田 */
const before = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('canglan_tuotuo_save_v1'));
  return { 铜钱: s.五维.财库.铜钱, 田亩: s.领地.田亩, 回合: s.回合 };
});
await page.locator('.m-btn[data-a=开荒拓田]').click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('canglan_tuotuo_save_v1'));
  return { 铜钱: s.五维.财库.铜钱, 田亩: s.领地.田亩, 回合: s.回合, 户: s.人口.归附户数 };
});
chk('行动后回合 +1', after.回合 === before.回合 + 1, `${before.回合} → ${after.回合}`);
chk('开荒拓田扣钱', after.铜钱 < before.铜钱, `${before.铜钱} → ${after.铜钱}`);
chk('开荒拓田增田亩', after.田亩 > before.田亩, `${before.田亩} → ${after.田亩}`);
chk('行动后回到剧情视图', await page.locator('.ev-h').first().isVisible());
await page.screenshot({ path: path.join(OUT, '02-action.png'), fullPage: false });

/* 4. 随机任务事件渲染（先测事件，再推主线，避免提前通关） */
await page.locator('.tabs button[data-v=menu]').click();
await page.waitForTimeout(200);
await page.locator('.m-btn[data-a=随机任务]').click();
await page.waitForTimeout(400);
const evTitle = await page.locator('.ev-h').first().textContent();
chk('随机任务触发事件', evTitle.includes('随机事件'), evTitle);
chk('事件提供选项', (await page.locator('.opt').count()) >= 2, `${await page.locator('.opt').count()} 项`);
await page.screenshot({ path: path.join(OUT, '03-random-event.png'), fullPage: false });

/* 5. 刷副本 */
await page.locator('.tabs button[data-v=menu]').click();
await page.waitForTimeout(200);
await page.locator('.m-btn[data-a=刷副本]').click();
await page.waitForTimeout(400);
chk('副本列表已渲染', (await page.locator('.dung').count()) >= 1, `${await page.locator('.dung').count()} 个可刷`);
if (await page.locator('.dung').count() > 0) {
  await page.locator('.dung').first().click();
  await page.waitForTimeout(500);
  const dTitle = await page.locator('.ev-h').first().textContent();
  chk('副本可执行并回显结果', dTitle.includes('副本'), dTitle);
}
await page.screenshot({ path: path.join(OUT, '04-dungeon.png'), fullPage: false });

/* 6. 推进主线（多章） */
for (let i = 0; i < 12; i++) {
  await page.locator('.tabs button[data-v=menu]').click();
  await page.waitForTimeout(150);
  const btn = page.locator('.m-btn[data-a=推进主线]');
  if (!(await btn.isVisible())) break;
  await btn.click();
  await page.waitForTimeout(250);
}
const prog = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('canglan_tuotuo_save_v1'));
  return { 进度: s.五维.疆域进度, 章: s.章节序, 已解锁: s.领地.已解锁.length, 结局: s.结局 };
});
chk('主线推进疆域进度上升', prog.进度 > 0, `${prog.进度}%`);
chk('主线推进解锁新区域', prog.已解锁 > 1, `已解锁 ${prog.已解锁} 区`);
chk('主线可推至终章并判定结局', !!prog.结局, prog.结局 ? prog.结局.键 : '未达成');

/* 7. 存档：刷新后自动续上 */
const turnBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('canglan_tuotuo_save_v1')).回合);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const bootTitle = await page.locator('.ev-h').first().textContent();
chk('刷新后自动读档', bootTitle.includes('存档续上'), bootTitle);
const turnAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('canglan_tuotuo_save_v1')).回合);
chk('回合数保持一致', turnBefore === turnAfter, `${turnBefore} vs ${turnAfter}`);

/* 8. 编年史 */
await page.locator('#btn-log').click();
await page.waitForTimeout(300);
chk('编年史有记录', (await page.locator('.lg').count()) >= 1, `${await page.locator('.lg').count()} 条`);

/* 9. 移动端视图 */
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(URL, { waitUntil: 'networkidle' });
await m.waitForTimeout(600);
chk('移动端底部导航显示', await m.locator('.tabbar').isVisible());
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
chk('移动端无横向溢出', overflow <= 2, `溢出 ${overflow}px`);
await m.screenshot({ path: path.join(OUT, '05-mobile.png'), fullPage: false });

/* 10. 控制台无错误 */
chk('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' ; '));

await browser.close();

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log(`  ✓ ${r.n}${r.x ? '  (' + r.x + ')' : ''}`); }
  else { fail++; console.log(`  ✗ ${r.n}  ${r.x}`); }
}
console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
