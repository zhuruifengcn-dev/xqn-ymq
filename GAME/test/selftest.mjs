/**
 * 引擎自测：模拟 200 回合全随机操作，验证不崩溃、数值不越界、事件不重复、结局可判定。
 */
import { Game } from '../js/engine.js';
import { ACTIONS } from '../js/actions.js';
import { FREE_ACTIONS, DUNGEONS, CHAPTERS } from '../js/data.js';

const KEY = '__clt_test__';
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const g = new Game();
const keys = Object.keys(ACTIONS);
let err = null;
const evNames = [];

try {
  for (let turn = 0; turn < 200; turn++) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    const before = g.dim.疆域进度;
    const ev = ACTIONS[k](g);
    if (ev.标题 && ev.标题.includes('随机事件')) evNames.push(ev.标题);

    // 副本分支
    if (ev.副本选择) {
      const d = ev.副本选择[Math.floor(Math.random() * ev.副本选择.length)];
      const r = g.runDungeon(d);
      if (!r.文本) throw new Error('副本无文本: ' + d);
    }
    // 选项结算
    for (const o of (ev.选项 || [])) {
      if (!o.效果) continue;
      if (o.花费 && !g.canAfford(o.花费)) continue;
      g.pay(o.花费);
      g.gain(o.效果);
    }
    g.s.回合++;
    void before;
  }
} catch (e) {
  err = e;
}

const s = g.summary();
const checks = [];
const chk = (name, cond, extra = '') => checks.push({ name, ok: !!cond, extra });

chk('200 回合无异常', !err, err ? err.message + '\n' + err.stack : '');
chk('民心在 0-100', s.民心 >= 0 && s.民心 <= 100, String(s.民心));
chk('军政在 0-100', s.军政 >= 0 && s.军政 <= 100, String(s.军政));
chk('教化在 0-100', s.教化 >= 0 && s.教化 <= 100, String(s.教化));
chk('疆域进度在 0-100', s.疆域进度 >= 0 && s.疆域进度 <= 100, String(s.疆域进度));
chk('铜钱非负', s.财库.铜钱 >= 0, String(s.财库.铜钱));
chk('粮草非负', s.财库.粮草石 >= 0, String(s.财库.粮草石));
chk('兵力非负', s.兵力.总 >= 0, String(s.兵力.总));
chk('人口非负', s.人口.归附户数 >= 0, String(s.人口.归附户数));
chk('已解锁含主城近郊', s.领地.已解锁.includes('云边城关近郊'), s.领地.已解锁.join('/'));
chk('已解锁+未解锁=10', s.领地.已解锁.length + s.领地.未解锁.length === 10, String(s.领地.已解锁.length + s.领地.未解锁.length));
chk('存档可写', !!g.exportSave());

// 事件不重复
const dup = evNames.length - new Set(evNames).size;
chk('随机事件池无重复', dup === 0, `重复 ${dup} 次 / 共 ${evNames.length}`);

// 结局判定
const e = g.judgeEnding();
chk('结局可判定', !!e && !!e.键, e ? e.键 : 'null');

// 存档往返
const g2 = new Game();
g2.importSave(g.exportSave());
chk('存档导入导出往返一致', Math.abs(g2.dim.疆域进度 - g.dim.疆域进度) < 0.01, `${g2.dim.疆域进度} vs ${g.dim.疆域进度}`);

// 自由操作全覆盖
const freeKeys = FREE_ACTIONS.map(a => a.键);
const missing = freeKeys.filter(k => k !== '推进主线' && k !== '随机任务' && k !== '刷副本' && !ACTIONS[k]);
chk('自由操作 20 项全部实现', missing.length === 0, missing.join(','));

// 副本可跑
const dres = g.runDungeon('黑山贼巢');
chk('副本可执行', !!dres.文本 && dres.数值变化.length > 0);

// 章节推进到终章（经行动层「推进主线」连推）
const g3 = new Game();
let chOk = false;
const unlockedSeen = new Set();
for (let i = 0; i < 400; i++) {
  const ev = ACTIONS['推进主线'](g3);
  const s3 = g3.summary();
  for (const z of s3.领地.已解锁) unlockedSeen.add(z);
  if (ev.结局) { chOk = !!ev.结局; break; }
}
chk('主线可推进至终章并给出结局', chOk, `进度 ${g3.dim.疆域进度}% 章节 ${g3.s.章节序}`);
chk('九大荒疆随主线全部解锁', unlockedSeen.size === 10, `已解锁 ${unlockedSeen.size}/10：${[...unlockedSeen].join('、')}`);
chk('终局已解锁全部十区', g3.s.领地.已解锁.length === 10 && g3.s.领地.未解锁.length === 0,
  `已解锁 ${g3.s.领地.已解锁.length} 未解锁 ${g3.s.领地.未解锁.length}`);
chk('七个副本全部随区域解锁', Object.values(DUNGEONS).every(d => d.解锁),
  Object.entries(DUNGEONS).filter(([, d]) => !d.解锁).map(([k]) => k).join(',') || '全部解锁');
chk('章节区间严格递增', CHAPTERS.every((c, i) => i === 0 || c.区间[0] === CHAPTERS[i - 1].区间[1]),
  '区间连续');
chk('终章区间覆盖 100', CHAPTERS[CHAPTERS.length - 1].区间[1] === 100, '');

let pass = 0, fail = 0;
for (const c of checks) {
  if (c.ok) { pass++; console.log(`  ✓ ${c.name}${c.extra ? '  (' + c.extra + ')' : ''}`); }
  else { fail++; console.log(`  ✗ ${c.name}  ${c.extra}`); }
}
console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
