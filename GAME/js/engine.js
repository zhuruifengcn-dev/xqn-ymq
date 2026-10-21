/**
 * 苍澜拓土录 · 游戏引擎
 * 负责：自动存档、五维数值结算、事件随机（永不重复）、副本挑战、结局判定。
 */
import { WORLD, INITIAL, CHAPTERS, NPCS, DUNGEONS, RANDOM_POOL, ENDINGS } from './data.js';

const SAVE_KEY = 'canglan_tuotuo_save_v1';

export class Game {
  constructor() {
    this.s = this.load() || this.freshState();
  }

  freshState() {
    return {
      回合: 0,
      剧情: [],
      五维: {
        民心: INITIAL.民心,
        军政: INITIAL.军政,
        财库: { ...INITIAL.财库 },
        教化: INITIAL.教化,
        疆域进度: INITIAL.疆域进度,
      },
      领地: JSON.parse(JSON.stringify(INITIAL.领地)),
      兵力: { ...INITIAL.兵力 },
      人口: { ...INITIAL.人口 },
      章节序: 1,
      章节进度: 0,
      已触发事件: [],
      已通关副本: {},
      NPC态度: Object.fromEntries(Object.entries(NPCS).map(([k, v]) => [k, v.初始态度])),
      行为计数: { 剿匪: 0, 练兵: 0, 赈灾: 0, 教化: 0, 开荒: 0, 通商: 0, 拓土: 0 },
      税率: '中',
      方略: '尚未定策',
      结局: null,
      存档时间: new Date().toISOString(),
    };
  }

  /* ---------------- 存档 ---------------- */
  save() {
    this.s.存档时间 = new Date().toISOString();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
    } catch (e) { /* 隐私模式忽略 */ }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d.五维?.疆域进度 !== 'number') return null;
      return d;
    } catch (e) { return null; }
  }
  reset() {
    this.s = this.freshState();
    this.save();
  }
  exportSave() {
    return JSON.stringify(this.s, null, 2);
  }
  importSave(text) {
    try {
      const d = JSON.parse(text);
      if (!d || !d.五维) throw new Error('格式错误');
      this.s = d;
      this.save();
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 便捷读取 ---------------- */
  get dim() { return this.s.五维; }
  get 财库() { return this.s.五维.财库; }
  get 当前章节() { return CHAPTERS.find(c => c.序 === this.s.章节序) || CHAPTERS[0]; }
  get 已满章() { return this.s.章节序 > CHAPTERS.length; }
  get 总兵力() { return this.s.兵力.边军 + this.s.兵力.巡检兵 + this.s.兵力.亲兵; }
  canAfford(cost) {
    if (!cost) return true;
    return (this.财库.铜钱 >= (cost.铜钱 || 0)) && (this.财库.粮草石 >= (cost.粮草石 || 0));
  }
  pay(cost) {
    if (!cost) return;
    this.财库.铜钱 -= (cost.铜钱 || 0);
    this.财库.粮草石 -= (cost.粮草石 || 0);
  }
  gain(delta) {
    const d = this.dim;
    if (delta.民心) d.民心 = clamp(d.民心 + delta.民心, 0, 100);
    if (delta.军政) d.军政 = clamp(d.军政 + delta.军政, 0, 100);
    if (delta.教化) d.教化 = clamp(d.教化 + delta.教化, 0, 100);
    if (delta.铜钱) this.财库.铜钱 = Math.max(0, this.财库.铜钱 + delta.铜钱);
    if (delta.粮草石) this.财库.粮草石 = Math.max(0, this.财库.粮草石 + delta.粮草石);
    if (delta.疆域进度) d.疆域进度 = clamp(d.疆域进度 + delta.疆域进度, 0, 100);
    if (delta.兵) {
      for (const k of ['边军', '巡检兵', '亲兵']) {
        if (delta.兵[k]) this.s.兵力[k] = Math.max(0, this.s.兵力[k] + delta.兵[k]);
      }
    }
    if (delta.户口) {
      this.s.人口.归附户数 = Math.max(0, this.s.人口.归附户数 + delta.户口);
      this.s.人口.流民户数 = Math.max(0, this.s.人口.流民户数 - Math.abs(delta.户口) + (delta.户口 < 0 ? Math.abs(delta.户口) : 0));
      this.s.人口.在册丁壮 = Math.max(0, Math.round(this.s.人口.归附户数 * 1.6));
    }
    if (delta.田亩) this.s.领地.田亩 = Math.max(0, this.s.领地.田亩 + delta.田亩);
    if (delta.据点 && !this.s.领地.据点.includes(delta.据点)) this.s.领地.据点.push(delta.据点);
    if (delta.解锁 && !this.s.领地.已解锁.includes(delta.解锁)) {
      this.s.领地.已解锁.push(delta.解锁);
      this.s.领地.未解锁 = this.s.领地.未解锁.filter(x => x !== delta.解锁);
    }
  }
  attitude(k, delta) {
    if (this.s.NPC态度[k] === undefined) return;
    this.s.NPC态度[k] = clamp(this.s.NPC态度[k] + delta, 0, 100);
  }
  attitudeText(k) {
    const a = this.s.NPC态度[k] ?? 0;
    if (a >= 80) return '倾心';
    if (a >= 60) return '亲厚';
    if (a >= 45) return '信任';
    if (a >= 30) return '观望';
    if (a >= 15) return '疑虑';
    return '敌意';
  }
  log(text, kind = '旁白') {
    this.s.剧情.push({ 回合: this.s.回合, kind, text });
    if (this.s.剧情.length > 600) this.s.剧情.splice(0, 200);
  }

  /* ---------------- 事件池：永不重复 ---------------- */
  poolRemaining() {
    const out = [];
    for (const [cat, list] of Object.entries(RANDOM_POOL)) {
      for (const name of list) {
        if (!this.s.已触发事件.includes(name)) out.push({ cat, name });
      }
    }
    return out;
  }
  /** 抽一个未发生的事件；池空则回补（允许重演但标记） */
  drawEvent() {
    let pool = this.poolRemaining();
    if (pool.length === 0) {
      this.s.已触发事件 = [];
      pool = Object.entries(RANDOM_POOL).flatMap(([cat, list]) => list.map(name => ({ cat, name })));
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.s.已触发事件.push(pick.name);
    return pick;
  }

  /* ---------------- 随机事件效果 ---------------- */
  applyRandomEvent(cat, name) {
    const D = this.dim;
    const res = { 标题: name, 类别: cat, 叙事: '', 选项: [] };
    const 幕 = (t) => { res.叙事 += t; };

    switch (cat) {
      case '灾害': {
        const t = {
          旱灾: { 粮: -260, 民心: -3, 文本: '入夏不雨，井泉见底，田土龟裂如瓦。流民蹲在田埂上，眼里空着。' },
          蝗灾: { 粮: -320, 民心: -4, 文本: '蝗自东来，遮天蔽日，落处禾稼立尽。农人跪在蝗影里，没有喊。' },
          洪涝: { 粮: -300, 民心: -3, 文本: '浊浪破堤，沃野尽成泽国。断枝、牲畜、屋梁，在水面上打转。' },
          寒潮: { 粮: -200, 民心: -3, 文本: '朔风过境，滴水成冰。老人说这是三十年一遇的早年。' },
          瘟疫: { 粮: -180, 民心: -6, 文本: '村中起病，一病十人，抬出去的比留着的多。' },
          粮荒: { 粮: -240, 民心: -5, 文本: '仓廪见底，最后一把谷种也被煮了。' },
          山崩: { 粮: -150, 民心: -2, 文本: '西坡轰然塌落，压了半条山路，也堵了半条水路。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '开仓赈济', 花费: { 粮草石: 300, 铜钱: 200 }, 效果: { 民心: 8, 教化: 3 }, 后续: '你亲赴灾区施粥三日。粥棚前排起长队，有人跪下磕头，有人只是看着你，把那口粥喝得很慢。' },
          { 名: '以工代赈', 花费: { 铜钱: 400 }, 效果: { 民心: 5, 军政: 2, 田亩: 60 }, 后续: '以修渠筑路抵赈，饥民有食，道路也通了几分。' },
          { 名: '请术士禳灾', 花费: { 铜钱: 200 }, 效果: { 民心: -1, 教化: -2 }, 后续: '术士在滩上念了半日，灾没有退，人心也没有安。' },
        ];
        void t;
        break;
      }
      case '民生': {
        const t = {
          大规模流民投奔: { 文本: '又有三百余户拖家带口自东而来，跪在关外不肯走，说再无别处可去。' },
          百姓请愿: { 文本: '乡老捧着一卷联名状，诉的是三年旱灾、苛捐、兵役，请求减赋。' },
          乡邻纠纷: { 文本: '两姓争一处水渠，斗到见了血。邻里的仇，比山贼还难解。' },
          老弱求助: { 文本: '一队无丁老者跪于辕门，言愿出力换一口饭，子孙记大人恩。' },
          秋收歉收: { 文本: '秋粮比去年少了两成，仓里开始能听见耗子的声音。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '悉数接纳安置', 花费: { 粮草石: 260, 铜钱: 300 }, 效果: { 民心: 7, 教化: 2, 户口: 120 }, 后续: '你令开义仓、给田契、编户入籍。新来的人第一次有了籍贯。' },
          { 名: '择壮丁编军', 花费: { 粮草石: 120 }, 效果: { 军政: 6, 民心: -2, 兵: { 边军: 40 } }, 后续: '青壮入伍，老弱归屯。军册添了四十人，营中却多了一些怨声。' },
          { 名: '闭门不纳', 花费: {}, 效果: { 民心: -5, 军政: 1 }, 后续: '城门闭了整整一日。夜里墙外有婴啼声，天亮就散了。' },
        ];
        break;
      }
      case '军政': {
        const t = {
          匪寇围城: { 文本: '黑山残匪趁夜逼近，火把连成一线，把城东照得发红。' },
          山贼合兵: { 文本: '三路山贼合兵一处，旗号换了三面，人数却多了一倍。' },
          水匪作乱: { 文本: '水匪夜入外村，夺粮、牵牲、打伤巡丁。' },
          斥候遇袭: { 文本: '派出的斥候十去其七，生还者带回一句话：山里有埋伏。' },
          逃兵乱象: { 文本: '营中夜起逃亡三十余人，连旗也带走了一面。' },
          边境警戒: { 文本: '烽燧连举三烽。按旧例，这是有骑队逼近。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '发兵迎击', 花费: { 粮草石: 200 }, 效果: { 军政: 6, 民心: 4, 疆域进度: 0.6 }, 后续: '你亲督三阵，贼众溃于城下。缴获的马匹，够装备一营。' },
          { 名: '守城不出', 花费: { 粮草石: 100 }, 效果: { 军政: 3, 民心: -1 }, 后续: '你令闭门死守。贼寇绕城而走，焚了城外几处茅舍。' },
          { 名: '遣使招安', 花费: { 铜钱: 300 }, 效果: { 民心: 3, 教化: 3, 疆域进度: 0.4 }, 后续: '一纸文书送入贼营。三日后，匪首遣人来回话：愿降者三成，其众尚疑。' },
        ];
        break;
      }
      case '外交族': {
        const t = {
          部落遣使归附: { 文本: '北荒草甸来使，鞍上挂着狼皮契，说首领愿率部归附，只求一处水草。' },
          部落冲突求助: { 文本: '两支牧部为一片冬牧场相争，死伤已十数人，各遣使来请大人为公断。' },
          异族互市请求: { 文本: '有商队自草甸来，愿以皮马易我茶盐，只求在关外开一处互市。' },
          部族献礼求助: { 文本: '部族送来良马二十匹、酥油十坛，说去年风雪毁帐，愿以厚礼换你出手。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '厚抚之，纳为编户', 花费: { 铜钱: 600, 粮草石: 200 }, 效果: { 教化: 7, 民心: 5, 疆域进度: 0.8, 户口: 90 }, 后续: '你划水草、立互市、授农具。部众学着在垄间下种，笨，但认真。' },
          { 名: '开互市而不纳编', 花费: { 铜钱: 200 }, 效果: { 教化: 4, 铜钱: 600, 粮草石: 120 }, 后续: '关外市集开张，皮货换茶盐，各取所需，尚未及编籍。' },
          { 名: '严词谢绝', 花费: {}, 效果: { 教化: -4, 军政: 2 }, 后续: '你把礼物退回，只留一句：边境以安为先，来去自便。' },
        ];
        break;
      }
      case '经济': {
        const t = {
          富商入境投资: { 文本: '中原富商郭氏入关，愿出巨资修桥、辟田，只求免税三年。' },
          商队被劫: { 文本: '一支商队于道中遇劫，货尽失，十七人死伤，货主跪在堂下。' },
          古道拥堵: { 文本: '古道被废弃车辆与横木塞死，商旅绕行百里，怨声载道。' },
          物价涨跌: { 文本: '米价一月三涨，仓吏言：不是米少了，是囤的人多了。' },
          发现废弃粮仓: { 文本: '沙掩废窖，石封的仓门，启之见粟，尚未霉坏。' },
          发现古藏铜钱: { 文本: '断墙下现古窖，铜钱成堆，锈色深碧，隐约可辨前朝年号。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '兴利除弊，公开招徕', 花费: {}, 效果: { 铜钱: 900, 粮草石: 200, 教化: 3, 民心: 3 }, 后续: '你贴榜招徕，减税宽商。市集一日比一日热闹。' },
          { 名: '严加管制，充盈府库', 花费: {}, 效果: { 铜钱: 1400, 民心: -4, 教化: -2 }, 后续: '关口设卡，抽厘加税。府库满了，怨气也满了。' },
          { 名: '抚恤受损，暂免赋税', 花费: { 铜钱: 500 }, 效果: { 民心: 6, 教化: 4 }, 后续: '你亲自查勘 dead 者家属，减免今岁之赋。商旅感其诚，往者渐众。' },
        ];
        break;
      }
      case '奇遇': {
        const t = {
          偶遇隐世谋士: { 文本: '樵夫担上一卷破竹简，说是山里捡的。你展开，见前朝屯田之法。' },
          落魄武将投奔: { 文本: '一骑独行至关下，解刀弃马，说愿以旧部之勇，换一饭之地。' },
          发现前朝军械: { 文本: '沙掩窑中，锈铁成堆，识者认出是前朝官制弩机，虽锈，犹可用。' },
          发现荒废良田: { 文本: '荒草深处，旧田垄尚在，界石倾倒，年号已模糊。' },
          天降祥瑞: { 文本: '夜有瑞雪，落地无痕，而明日檐冰生白兰。老农言：这是丰年之兆。' },
        }[name];
        幕(t.文本);
        res.选项 = [
          { 名: '厚礼相待，委以职事', 花费: { 铜钱: 400 }, 效果: { 教化: 8, 军政: 4, 疆域进度: 0.4 }, 后续: '你延之入幕府，赐座、赐笔。此后种种决策，他都先你一步算到。' },
          { 名: '赏其机缘，收归官用', 花费: {}, 效果: { 军政: 6, 铜钱: 700, 粮草石: 150, 疆域进度: 0.5 }, 后续: '旧法、军械、荒田，逐一登记入册。你的府库里，多了别人没有的底子。' },
          { 名: '记名存档，遣送归乡', 花费: { 铜钱: 100 }, 效果: { 民心: 3, 教化: 3 }, 后续: '你亲送其归乡，赠米十石。传闻传开，来投者渐众。' },
        ];
        break;
      }
    }
    // 修正一处占位
    res.选项 = res.选项.map(o => (o.后续 || '').replace(' dead 者', '死者'));
    res.叙事 = res.叙事.replace(' dead 者', '死者');
    void D;
    return res;
  }

  /* ---------------- 副本挑战 ---------------- */
  runDungeon(name) {
    const d = DUNGEONS[name];
    if (!d) return { 成功: false, 文本: '此地未有此副本。' };
    const 军政 = this.dim.军政;
    const 训练 = this.s.行为计数.练兵 * 0.4;
    const 胜算 = clamp(0.30 + 军政 * 0.006 + 训练 - d.敌军.凶名 * 0.004, 0.05, 0.97);
    const roll = Math.random();
    const 成功 = roll < 胜算;
    const res = { 副本: name, 成功, 文本: '', 数值变化: [] };
    if (成功) {
      const 粮 = randInt(d.缴获.粮草石[0], d.缴获.粮草石[1]);
      const 钱 = randInt(d.缴获.铜钱[0], d.缴获.铜钱[1]);
      this.gain({ 铜钱: 钱, 粮草石: 粮, 军政: 4, 疆域进度: 0.8, 民心: 2 });
      this.s.行为计数.剿匪++;
      this.s.已通关副本[name] = (this.s.已通关副本[name] || 0) + 1;
      res.数值变化 = [`军政 +4`, `疆域进度 +0.8%`, `缴获粮草 ${粮} 石`, `缴获铜钱 ${钱} 钱`, `民心 +2`];
      res.文本 = `${d.描述}\n\n寨门撞开时天正亮。你在残旗下面站了片刻，命人埋了阵亡者的刀，也命人把缴获分了三成给随军的流民。`;
    } else {
      const 损 = randInt(20, 60);
      this.gain({ 军政: -2, 民心: -3, 兵: { 边军: -损 } });
      res.数值变化 = [`军政 -2`, `民心 -3`, `边军 -${损}`, '疆域进度无变化'];
      res.文本 = `${d.描述}\n\n前锋陷入苦战，你下令退兵，亲自压住阵脚才没溃。退回时点数，少了 ${损} 人。你在名册上一个个划掉名字，划得很慢。`;
    }
    return res;
  }

  /* ---------------- 章节推进 ---------------- */
  /** 章序 → 该章对应的荒疆区域（九大荒疆随主线逐章解锁） */
  static 区域映射 = {
    2: '青川河谷', 3: '断云古道', 4: '黑松岭', 5: '落霞湖泽', 6: '古残县遗址',
    7: '北荒草甸', 8: '千石坞堡', 9: '西峡要塞', 10: '沧海边陲',
  };

  advanceChapter() {
    const ch = this.当前章节;
    const remain = Math.max(0, ch.区间[1] - this.dim.疆域进度);
    // 基数 + 与剩余量的比例，保证每推一次都实打实推进，且越接近章末步长越小
    const step = 1.2 + remain * 0.45;
    this.gain({ 疆域进度: step });
    this.s.章节进度 = clamp(
      (this.dim.疆域进度 - ch.区间[0]) / (ch.区间[1] - ch.区间[0]) * 100, 0, 100);

    if (this.dim.疆域进度 >= ch.区间[1]) {
      this.s.章节序++;
      this.s.章节进度 = 0;
      // 逐章解锁所有已越过的荒疆（自由操作累积进度可能一次跨多章）
      let unlocked = null;
      for (let seq = 2; seq <= this.s.章节序; seq++) {
        const rg = Game.区域映射[seq];
        if (rg && this.s.领地.未解锁.includes(rg)) {
          this.gain({ 解锁: rg });
          unlocked = rg;
        }
        for (const [k, d] of Object.entries(DUNGEONS)) {
          if (d.区域 === Game.区域映射[seq]) d.解锁 = true;
        }
      }
      if (this.s.章节序 > CHAPTERS.length) {
        this.s.结局 = this.judgeEnding();
        return { 完成章节: ch, 通关: true, 结局: this.s.结局, 解锁: unlocked };
      }
      return { 完成章节: ch, 通关: false, 下一章: CHAPTERS[this.s.章节序 - 1], 解锁: unlocked };
    }
    return { 完成章节: null, 通关: false, 当前: ch, 章节进度: this.s.章节进度 };
  }

  /* ---------------- 结局判定 ---------------- */
  judgeEnding() {
    const d = this.dim;
    const c = this.s.行为计数;
    const score铁 = d.军政 * 1.2 + c.剿匪 * 4 + c.练兵 * 2;
    const score盛 = d.民心 * 1.2 + d.教化 * 1.2 + c.赈灾 * 4 + c.教化 * 3;
    const vals = [d.民心, d.军政, d.教化];
    const spread = Math.max(...vals) - Math.min(...vals);
    const score全 = (d.民心 + d.军政 + d.教化) / 3 * 1.4 + d.疆域进度 * 0.6 - spread * 0.5;
    const max = Math.max(score铁, score盛, score全);
    if (max === score铁) return { 键: '铁血镇疆', ...ENDINGS.铁血镇疆 };
    if (max === score盛) return { 键: '盛世牧守', ...ENDINGS.盛世牧守 };
    return { 键: '万古开疆', ...ENDINGS.万古开疆 };
  }

  /* ---------------- 状态摘要 ---------------- */
  summary() {
    const d = this.dim;
    return {
      回合: this.s.回合,
      章节: this.当前章节,
      章节序: this.s.章节序,
      章节进度: this.s.章节进度,
      民心: Math.round(d.民心),
      军政: Math.round(d.军政),
      财库: { 铜钱: Math.round(this.财库.铜钱), 粮草石: Math.round(this.财库.粮草石) },
      教化: Math.round(d.教化),
      疆域进度: round1(d.疆域进度),
      兵力: { ...this.s.兵力, 总: this.总兵力 },
      人口: { ...this.s.人口 },
      领地: this.s.领地,
      税率: this.s.税率,
      方略: this.s.方略,
      结局: this.s.结局,
      NPC: Object.fromEntries(Object.keys(NPCS).map(k => [k, { 态度: Math.round(this.s.NPC态度[k]), 关系: this.attitudeText(k) }])),
    };
  }
}

/* ---------------- 工具 ---------------- */
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
export function round1(v) { return Math.round(v * 10) / 10; }
export { WORLD, INITIAL, CHAPTERS, NPCS, DUNGEONS, RANDOM_POOL, ENDINGS, FREE_ACTIONS } from './data.js';
