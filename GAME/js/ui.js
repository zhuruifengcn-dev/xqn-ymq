/**
 * 苍澜拓土录 · 界面层
 * 纯原生 JS，无框架依赖。移动端优先。
 */
import { Game, clamp } from './engine.js';
import { ACTIONS } from './actions.js';
import { FREE_ACTIONS, CHAPTERS, DUNGEONS, NPCS, WORLD } from './data.js';

const g = new Game();
let current = null;      // 当前事件对象
let logDirty = true;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ============ 渲染：状态面板 ============ */
function renderStatus() {
  const s = g.summary();
  const bar = (v, color) => `<div class="bar"><i style="width:${clamp(v, 0, 100)}%;background:${color}"></i></div>`;
  $('panel').innerHTML = `
    <div class="chp">
      <div class="chp-t">第 ${s.章节序} 章 · ${esc(s.章节.标题)}</div>
      <div class="chp-s">${s.章节.区间[0]}%—${s.章节.区间[1]}%　|　本章 ${Math.round(s.章节进度)}%　|　回合 ${s.回合}</div>
      <div class="bar big"><i style="width:${clamp(s.疆域进度, 0, 100)}%;background:linear-gradient(90deg,#8a6d3b,#c9a227)"></i></div>
      <div class="chp-s">疆域开拓进度 <b>${s.疆域进度}%</b></div>
    </div>

    <div class="dims">
      <div class="dim">
        <div class="dim-l">民心</div>
        <div class="dim-v">${s.民心}</div>
        ${bar(s.民心, '#a8322d')}
        <div class="dim-d">归附·安民·垦荒</div>
      </div>
      <div class="dim">
        <div class="dim-l">军政</div>
        <div class="dim-v">${s.军政}</div>
        ${bar(s.军政, '#2f5d8a')}
        <div class="dim-d">剿匪·守土·练兵</div>
      </div>
      <div class="dim">
        <div class="dim-l">教化</div>
        <div class="dim-v">${s.教化}</div>
        ${bar(s.教化, '#3d6b4a')}
        <div class="dim-d">归化·兴学·长治</div>
      </div>
      <div class="dim">
        <div class="dim-l">财库</div>
        <div class="dim-v sm">${s.财库.铜钱}<em>钱</em></div>
        <div class="dim-v sm">${s.财库.粮草石}<em>石</em></div>
        <div class="dim-d">建设·征兵·赈灾</div>
      </div>
    </div>

    <div class="rows">
      <div class="row"><span>主城</span><b>${esc(s.领地.主城)}</b></div>
      <div class="row"><span>兵力</span><b>边军 ${s.兵力.边军} · 巡检 ${s.兵力.巡检兵} · 亲兵 ${s.兵力.亲兵}（总 ${s.兵力.总}）</b></div>
      <div class="row"><span>人口</span><b>归附 ${s.人口.归附户数} 户 · 丁壮 ${s.人口.在册丁壮}</b></div>
      <div class="row"><span>已垦</span><b>${s.领地.田亩} 亩 · 据点 ${s.领地.据点.length} 处</b></div>
      <div class="row"><span>税率</span><b>${esc(s.税率)}</b></div>
      <div class="row"><span>方略</span><b>${esc(s.方略)}</b></div>
    </div>

    <div class="zones">
      <div class="z-l">已解锁</div>
      <div class="z-tags">${s.领地.已解锁.map(z => `<span class="tag on">${esc(z)}</span>`).join('')}</div>
      <div class="z-l">未解锁九大荒疆</div>
      <div class="z-tags">${s.领地.未解锁.map(z => `<span class="tag">${esc(z)}</span>`).join('')}</div>
    </div>

    <div class="npcs">
      <div class="z-l">幕府与乡野</div>
      ${Object.entries(s.NPC).map(([k, v]) => `
        <div class="npc">
          <div class="npc-n">${esc(NPCS[k].名号)}</div>
          <div class="npc-r">${esc(NPCS[k].立场)}</div>
          <div class="npc-a">态度 ${v.态度} · <b>${v.关系}</b></div>
        </div>`).join('')}
    </div>
  `;
}

/* ============ 渲染：剧情与选项 ============ */
function renderEvent(ev) {
  current = ev;
  const opts = (ev.选项 || []).map((o, i) => `
    <button class="opt" data-i="${i}">
      <span class="opt-n">${esc(o.名)}</span>
      ${o.花费 ? `<span class="opt-c">耗 ${o.花费.铜钱 || 0}钱 · ${o.花费.粮草石 || 0}石</span>` : ''}
    </button>`).join('');

  const dungeon = ev.副本选择 ? `
    <div class="dung-list">
      ${ev.副本选择.map(k => `<button class="dung" data-d="${esc(k)}">
        <span class="dung-n">${esc(k)}</span>
        <span class="dung-d">${esc(DUNGEONS[k].区域)} · ${esc(DUNGEONS[k].描述.slice(0, 40))}…</span>
      </button>`).join('')}
      ${ev.未解锁.length ? `<div class="dung-lock">未解锁：${ev.未解锁.map(k => esc(k)).join('、')}　—　需先推进主线解锁对应疆域</div>` : ''}
    </div>` : '';

  $('stage').innerHTML = `
    <div class="ev">
      <div class="ev-h">${esc(ev.标题 || '苍澜拓土录')}</div>
      ${ev.类别 ? `<div class="ev-cat">${esc(ev.类别)}</div>` : ''}
      <div class="ev-body">${esc(ev.叙事 || '').replace(/\n/g, '<br>')}</div>
      ${ev.数值变化 && ev.数值变化.length ? `<div class="ev-chg">${ev.数值变化.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${ev.NPC备注 ? `<div class="ev-npc">${esc(ev.NPC备注)}</div>` : ''}
      ${dungeon}
      <div class="opts">${opts}</div>
      ${ev.结局 ? `<div class="ev-end"><b>结局 · ${esc(ev.结局.键)}</b><p>${esc(ev.结局.描述)}</p></div>` : ''}
    </div>`;

  $('stage').querySelectorAll('.opt').forEach(b => {
    b.onclick = () => chooseOption(ev, Number(b.dataset.i));
  });
  $('stage').querySelectorAll('.dung').forEach(b => {
    b.onclick = () => runDungeon(b.dataset.d);
  });
  $('stage').scrollTop = 0;
}

function chooseOption(ev, i) {
  const o = (ev.选项 || [])[i];
  if (!o) return;
  if (o.花费 && !g.canAfford(o.花费)) {
    alert('府库不敷，无法施行。');
    return;
  }
  if (o.效果) {
    g.pay(o.花费);
    g.gain(o.效果);
    if (o.后续) g.log(o.后续);
  }
  if (o.效果 && o.效果.剿匪 !== undefined) g.s.行为计数.剿匪 += o.效果.剿匪;
  g.s.回合++;
  g.save();
  renderStatus();
  if (o.后续) {
    renderEvent({ 标题: '…', 叙事: o.后续, 数值变化: [], 选项: [{ 名: '继续', 效果: null, 后续: '' }] });
  } else {
    renderEvent({ 标题: '…', 叙事: '（事已办妥）', 数值变化: [], 选项: [{ 名: '继续', 效果: null, 后续: '' }] });
  }
}

function runDungeon(name) {
  const r = g.runDungeon(name);
  g.s.回合++;
  g.save();
  renderStatus();
  renderEvent({
    标题: `副本 · ${name} — ${r.成功 ? '功成' : '失利'}`,
    叙事: r.文本,
    数值变化: r.数值变化,
    选项: [{ 名: '继续', 效果: null, 后续: '' }],
  });
}

/* ============ 行动菜单 ============ */
function renderMenu() {
  const avail = FREE_ACTIONS.filter(a => a.键 !== '推进主线' && a.键 !== '随机任务' && a.键 !== '刷副本');
  $('menu').innerHTML = `
    <div class="m-sec">核心</div>
    <div class="m-grid">
      <button class="m-btn core" data-a="推进主线"><b>推进主线</b><span>按当前章目标推进</span></button>
      <button class="m-btn core" data-a="随机任务"><b>随机任务</b><span>事件池抽取，永不重复</span></button>
      <button class="m-btn core" data-a="刷副本"><b>刷副本</b><span>可重复挑战</span></button>
    </div>
    <div class="m-sec">自由操作</div>
    <div class="m-grid">
      ${avail.map(a => `<button class="m-btn" data-a="${esc(a.键)}">
        <b>${esc(a.键)}</b>
        <span>${esc(a.说明)}</span>
        ${a.花费 ? `<i class="m-cost">${a.花费.铜钱 || 0}钱 / ${a.花费.粮草石 || 0}石</i>` : ''}
      </button>`).join('')}
    </div>`;
  $('menu').querySelectorAll('.m-btn').forEach(b => {
    b.onclick = () => doAction(b.dataset.a);
  });
}

function doAction(name) {
  if (g.s.结局) { alert('此局已至终章结局。可在「存档」中另起新局。'); return; }
  const fn = ACTIONS[name];
  if (!fn) return;
  const ev = fn(g);
  g.s.回合++;
  if (!ev.副本选择) {
    g.log(`【${ev.标题}】`, '纪事');
  }
  g.save();
  renderStatus();
  renderEvent(ev);
  // 行动后回到剧情视图；移动端同时收起政务面板
  switchView('stage');
  $('panel').classList.remove('open');
}

/* ============ 编年史 ============ */
function renderLog() {
  const items = g.s.剧情.slice(-120).reverse();
  $('log').innerHTML = items.length ? items.map(it => `
    <div class="lg">
      <div class="lg-h">第 ${it.回合} 回合 · ${esc(it.kind)}</div>
      <div class="lg-b">${esc(it.text).replace(/\n/g, '<br>')}</div>
    </div>`).join('') : '<div class="lg-empty">尚无纪事。开局第一令，便是史笔之始。</div>';
}

/* ============ 存档面板 ============ */
function openSave() {
  const s = g.summary();
  $('modal').innerHTML = `
    <div class="m-box">
      <div class="m-h">存档 · 苍澜拓土录</div>
      <div class="m-save">${esc(JSON.stringify(s, null, 2)).slice(0, 1200)}</div>
      <div class="m-btns">
        <button class="m-btn2" id="m-export">导出存档</button>
        <button class="m-btn2" id="m-import">导入存档</button>
        <button class="m-btn2 danger" id="m-reset">另起新局</button>
        <button class="m-btn2" id="m-close">关闭</button>
      </div>
      <textarea id="m-ta" class="m-ta" placeholder="在此粘贴存档 JSON 后点「导入存档」"></textarea>
    </div>`;
  $('modal').classList.add('show');
  $('m-close').onclick = () => $('modal').classList.remove('show');
  $('m-export').onclick = () => {
    const ta = $('m-ta');
    ta.value = g.exportSave();
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    alert('存档已导出到文本框（已尝试复制）。');
  };
  $('m-import').onclick = () => {
    if (g.importSave($('m-ta').value)) { renderStatus(); renderMenu(); renderLog(); $('modal').classList.remove('show'); alert('导入成功。'); }
    else alert('存档格式有误。');
  };
  $('m-reset').onclick = () => {
    if (confirm('另起新局将清空当前进度，确定？')) {
      g.reset(); renderStatus(); renderMenu(); renderLog(); $('modal').classList.remove('show');
      renderEvent({ 标题: '新局开启 · 第一章 初临荒疆·立足城关', 叙事: `${WORLD.dynastyFall}\n\n${WORLD.west}\n\n你是朝廷正式任命的【云边镇疆牧守】，持圣旨、领亲兵三十，到西陲接的第一件差事，是守住这座塌了半边的城。\n\n霍崇单膝跪在泥里接旨，抬头看你时，眼里有两样东西：终于有人来了的湿意，和你来了又能怎样的冷。\n\n谢昀抱着账册站在破旗下，报出三个数字：粮三千石，钱八千钱，人八百三十七户。\n\n崔翁拄杖跪在城门口：「草民只求大人别散伙。散伙了，我们就真是野草了。」`,
        数值变化: ['民心 40', '军政 35', '教化 25', '疆域进度 0%', '边军300·巡检100·亲兵30', '流民800户'],
        选项: [{ 名: '开始理政', 效果: null, 后续: '' }] });
    }
  };
}

/* ============ 开场 ============ */
function opening() {
  renderEvent({
    标题: '开卷 · 第一章 初临荒疆·立足城关',
    叙事: `苍澜旧历三百一十七年，冬。\n\n西陲的风裹着黄沙，从断云古道的尽头一路刮过来，撞在云边残破的城关上，发出一种像老人咳嗽的声音。\n\n关墙塌了半边。箭垛只剩九个，缺口处的夯土被雨水泡成了泥浆。城门只剩一扇，还被流民用木头顶住，怕风一吹就散。门内是三条被踩成泥浆的街，街边倒着两具无人认领的尸首，草席都没盖。\n\n三个月前，苍澜大朝崩了。\n\n消息传到西陲时，只剩一句：宫门烧了，天子不知所终。朝廷缩回中原，诏书三个月才来一次，来的还常常是"暂缓""从议""再议"。\n\n于是这一万里地，就成了无主之土。\n\n无国家，无主权，无一处是"谁的"。旧朝的界碑被人推倒埋了，郡县成了笑话，废田在风里长草，荒村在雾里等人。流民从东边一路往西走，走了三个月，走到云边关前就走不动了——不是不想走，是过不去了。\n\n关外三十里，黑山寨的旗子在土坡上插着。三百来号人，几十条狗，抢粮、抢牛、抢人。关内八百多户流民，靠城头那点陈粮和城外的荒地吊着命。\n\n而你，带着三十名亲兵和一卷圣旨，来了。\n\n咚、咚、咚。\n\n三声叩门，不是军鼓，是有人在用额头撞城门。\n\n守门的兵先看见的是你身后三十个黑甲亲兵，然后才看见你手里那卷明黄。\n\n门开了一条缝。一个须发花白的老将半跪在泥里，双手举过头顶接旨。\n\n「臣戍边校尉霍崇，恭迎钦差大人。」\n\n老将声音嘶哑，膝盖陷在泥里没起来。他抬头看你时，眼里有两样东西：一样是"终于有人来了"的湿意，一样是"你来了又能怎样"的冷。\n\n「敢问大人，此番……是来守城，还是来……」\n\n他没说完，把后半句咽了回去。`,
    数值变化: ['民心 40', '军政 35', '教化 25', '疆域进度 0%', '财库 8000钱 / 3000石', '边军300·巡检100·亲兵30', '流民800户'],
    选项: [{ 名: '入城', 效果: null, 后续: '' }],
  });
}

/* ============ 启动 ============ */
function boot() {
  renderStatus();
  renderMenu();
  renderLog();
  if (g.s.回合 > 0) {
    renderEvent({
      标题: `存档续上 · 第 ${g.s.回合} 回合`,
      叙事: `卷轴重新展开。苍澜旧历三百一十七年冬仍在继续，城关的破墙仍在风里咳。\n\n你已行 ${g.s.回合} 令，疆域开拓 ${g.dim.疆域进度}%。存档时间：${new Date(g.s.存档时间).toLocaleString('zh-CN')}`,
      数值变化: [],
      选项: [{ 名: '继续', 效果: null, 后续: '' }],
    });
  } else {
    opening();
  }

  $('btn-panel').onclick = () => $('panel').classList.toggle('open');
  $('btn-log').onclick = () => { renderLog(); $('logbox').classList.toggle('open'); };
  $('btn-save').onclick = openSave;
  $('btn-menu').onclick = () => {
    switchView('menu');
  };

  // 桌面顶部页签 + 移动端底部导航共用同一套切换逻辑
  const navs = document.querySelectorAll('.tabs button[data-v], .tabbar button[data-v]');
  navs.forEach(b => {
    b.onclick = () => switchView(b.dataset.v);
  });
}

function switchView(v) {
  document.querySelectorAll('.tabs button[data-v], .tabbar button[data-v]').forEach(x => {
    x.classList.toggle('on', x.dataset.v === v);
  });
  $('view-menu').style.display = v === 'menu' ? 'block' : 'none';
  $('view-stage').style.display = v === 'stage' ? 'block' : 'none';
  if (v === 'menu') renderMenu();
}

document.addEventListener('DOMContentLoaded', boot);
