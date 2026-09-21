/* 瘟疫对局引擎（她 2026-09-05 01:14 点的单）：
   一个人当瘟疫，一个人当人类研究解药，回合制，两边都看得见对方干了什么。
   纯函数 + 可播种随机，方便测试。 */

'use strict';

// ── 世界 ──────────────────────────────────────────────────────────────────
// Natural Earth 生成的 176 国数据；pop 单位为万人。
const WORLD = require('../data/world.cjs');

// ── 瘟疫可买的东西 ────────────────────────────────────────────────────────
const PLAGUE_CARDS = [
  // 传播树
  { id:'air', name:'空气传播 I', tree:'transmission', cost:6, desc:'加强干燥地区与飞机传播', eff:{air:1,infectivity:1} },
  { id:'air2', name:'空气传播 II', tree:'transmission', cost:11, requires:['air'], desc:'大幅加强飞机传播', eff:{air:2,infectivity:2} },
  { id:'water', name:'水源传播 I', tree:'transmission', cost:6, desc:'加强潮湿地区与船运传播', eff:{sea:1,infectivity:1} },
  { id:'water2', name:'水源传播 II', tree:'transmission', cost:12, requires:['water'], desc:'大幅加强船运传播', eff:{sea:2,infectivity:2} },
  { id:'rodent', name:'鼠类媒介 I', tree:'transmission', cost:7, desc:'城市与陆路传播更快', eff:{land:1,urbanBonus:1,infectivity:1} },
  { id:'rodent2', name:'鼠类媒介 II', tree:'transmission', cost:12, requires:['rodent'], desc:'城市和陆路传播大幅加强', eff:{land:2,urbanBonus:2,infectivity:2} },
  { id:'insect', name:'昆虫媒介 I', tree:'transmission', cost:8, desc:'炎热国家传播更快', eff:{hotBonus:2,infectivity:1} },
  { id:'insect2', name:'昆虫媒介 II', tree:'transmission', cost:14, requires:['insect'], desc:'热带传播大幅加强', eff:{hotBonus:3,infectivity:2} },
  { id:'blood', name:'血液传播 I', tree:'transmission', cost:7, desc:'贫穷国家传播更快', eff:{poorBonus:2,infectivity:1} },
  { id:'blood2', name:'血液传播 II', tree:'transmission', cost:13, requires:['blood'], desc:'贫穷国家传播大幅加强', eff:{poorBonus:3,infectivity:2} },
  { id:'bird', name:'鸟类传播 I', tree:'transmission', cost:9, desc:'跨境与农村传播更快', eff:{land:1,ruralBonus:1,infectivity:1} },
  { id:'bird2', name:'鸟类传播 II', tree:'transmission', cost:15, requires:['bird'], desc:'远距离跨境传播加强', eff:{land:2,ruralBonus:2,infectivity:2} },
  { id:'livestock', name:'家畜传播 I', tree:'transmission', cost:7, desc:'农村国家传播更快', eff:{ruralBonus:2,infectivity:1} },
  { id:'livestock2', name:'家畜传播 II', tree:'transmission', cost:12, requires:['livestock'], desc:'农村传播大幅加强', eff:{ruralBonus:3,infectivity:2} },
  { id:'bioaerosol', name:'极端生物气溶胶', tree:'transmission', cost:18, requires:['air2','water2'], desc:'飞机、船运与全环境传播大幅加强，并留下潜伏宿主', eff:{air:2,sea:2,infectivity:4,reservoir:1} },
  { id:'zoonosis', name:'极端人畜共患', tree:'transmission', cost:22, requires:['rodent2','bird2','livestock2'], desc:'城市、农村与陆路全面加强，并留下潜伏宿主', eff:{land:3,urbanBonus:2,ruralBonus:2,infectivity:4,reservoir:1} },
  { id:'hematophagy', name:'极端嗜血', tree:'transmission', cost:23, requires:['insect2','blood2'], desc:'热带和贫穷国家全面加强，并留下潜伏宿主', eff:{hotBonus:3,poorBonus:3,infectivity:4,reservoir:1} },
  { id:'spreadSurge', name:'全球传播强化', tree:'transmission', cost:36, costStep:18, repeat:true, requiresAny:['bioaerosol','zoonosis','hematophagy'], desc:'后期强化：每次提高全球传播，价格逐次上涨', eff:{infectivity:2,air:1,sea:1,land:1} },

  // 症状树
  { id:'cough', name:'咳嗽', tree:'symptom', cost:4, desc:'轻微呼吸道症状，传染增加', eff:{infectivity:2,severity:1} },
  { id:'sneeze', name:'打喷嚏', tree:'symptom', cost:5, requires:['cough'], desc:'传染明显增加，仍较隐蔽', eff:{infectivity:4,severity:1} },
  { id:'pneu', name:'肺炎', tree:'symptom', cost:7, requires:['cough'], desc:'寒冷地区传播增强', eff:{infectivity:3,severity:2,coldBonus:2} },
  { id:'pulmonary', name:'肺水肿', tree:'symptom', cost:12, requires:['pneu'], desc:'严重呼吸损伤，开始致死', eff:{infectivity:4,severity:5,lethality:3} },
  { id:'nausea', name:'恶心', tree:'symptom', cost:2, desc:'轻微消化道症状', eff:{infectivity:1,severity:1} },
  { id:'vomit', name:'呕吐', tree:'symptom', cost:5, requires:['nausea'], desc:'与咳嗽组合可额外传播', eff:{infectivity:3,severity:2} },
  { id:'diarrhea', name:'腹泻', tree:'symptom', cost:8, requires:['vomit'], desc:'贫穷地区传播加快', eff:{infectivity:5,severity:4,poorBonus:1} },
  { id:'dysentery', name:'痢疾', tree:'symptom', cost:15, requires:['diarrhea'], desc:'高传染、高致死的消化道症状', eff:{infectivity:7,severity:8,lethality:6} },
  { id:'rash', name:'皮疹', tree:'symptom', cost:3, desc:'轻微皮肤症状', eff:{infectivity:1,severity:1} },
  { id:'sweat', name:'出汗', tree:'symptom', cost:4, requires:['rash'], desc:'寒冷地区更容易传播', eff:{infectivity:2,severity:1,coldBonus:1} },
  { id:'skin', name:'皮肤病变', tree:'symptom', cost:9, requires:['sweat'], desc:'接触传播显著加强', eff:{infectivity:6,severity:4} },
  { id:'necrosis', name:'坏死', tree:'symptom', cost:19, requires:['skin'], desc:'尸体仍能传播，且高度致命', eff:{infectivity:8,severity:10,lethality:10,corpse:1} },
  { id:'insomnia', name:'失眠', tree:'symptom', cost:2, desc:'轻微神经症状', eff:{severity:1} },
  { id:'paranoia', name:'偏执', tree:'symptom', cost:5, requires:['insomnia'], desc:'患者不配合医疗，研究稍慢', eff:{severity:3,cureSlow:1} },
  { id:'seizure', name:'癫痫', tree:'symptom', cost:9, requires:['paranoia'], desc:'严重神经症状，开始致死', eff:{severity:5,lethality:2} },
  { id:'insanity', name:'精神错乱', tree:'symptom', cost:16, requires:['seizure'], antiCure:true, desc:'显著增加解药难度', eff:{infectivity:4,severity:8,cureSlow:1} },
  { id:'paralysis', name:'瘫痪', tree:'symptom', cost:14, requires:['seizure'], desc:'高严重度并拖慢研究', eff:{severity:7,lethality:2,cureSlow:1} },
  { id:'coma', name:'昏迷', tree:'symptom', cost:21, requires:['paralysis'], antiCure:true, desc:'大幅增加解药难度', eff:{severity:10,lethality:3,cureSlow:1,cureBack:6} },
  { id:'anemia', name:'贫血', tree:'symptom', cost:2, desc:'与失眠组合会降低研究效率', eff:{infectivity:1,severity:1} },
  { id:'hemo', name:'内出血', tree:'symptom', cost:12, requires:['anemia'], desc:'快速致死', eff:{severity:7,lethality:8} },
  { id:'shock', name:'出血性休克', tree:'symptom', cost:20, requires:['hemo'], desc:'极高致死性', eff:{severity:10,lethality:14} },
  { id:'failure', name:'全器官衰竭', tree:'symptom', cost:26, requiresAny:['coma','pulmonary','shock','dysentery'], desc:'终局级致命症状', eff:{severity:12,lethality:20} },
  { id:'lethalSurge', name:'致命性强化', tree:'symptom', cost:42, costStep:22, repeat:true, requiresAny:['failure','necrosis','shock','dysentery'], desc:'后期强化：每次提高致命性和严重度，价格逐次上涨', eff:{severity:2,lethality:3} },

  // 能力树
  { id:'heat', name:'耐热 I', tree:'ability', cost:7, desc:'炎热国家不再严重拖慢传播', eff:{resHeat:1} },
  { id:'heat2', name:'耐热 II', tree:'ability', cost:13, requires:['heat'], desc:'炎热环境传播进一步加强', eff:{resHeat:1,hotBonus:2} },
  { id:'cold', name:'耐寒 I', tree:'ability', cost:7, desc:'寒冷国家不再严重拖慢传播', eff:{resCold:1} },
  { id:'cold2', name:'耐寒 II', tree:'ability', cost:13, requires:['cold'], desc:'寒冷环境传播进一步加强', eff:{resCold:1,coldBonus:2} },
  { id:'drug', name:'抗药性 I', tree:'ability', cost:10, antiCure:true, desc:'富国医疗压制减弱，解药小幅倒退', eff:{resDrug:1,cureBack:3} },
  { id:'drug2', name:'抗药性 II', tree:'ability', cost:18, requires:['drug'], antiCure:true, desc:'富国传播进一步加强', eff:{resDrug:1,cureBack:4} },
  { id:'hard1', name:'基因强化 I', tree:'ability', cost:9, requires:['drug'], desc:'永久降低后续研究效率', eff:{cureSlow:1} },
  { id:'hard2', name:'基因强化 II', tree:'ability', cost:18, requires:['hard1'], desc:'再次降低后续研究效率', eff:{cureSlow:1} },
  { id:'shuffle', name:'基因重排 I', tree:'ability', cost:14, requires:['drug'], antiCure:true, desc:'解药倒退 10%，可触发一天停研（共享三天冷却）', eff:{cureBack:10} },
  { id:'shuffle2', name:'基因重排 II', tree:'ability', cost:22, requires:['shuffle'], antiCure:true, desc:'解药倒退 12%，可触发一天停研（共享三天冷却）', eff:{cureBack:12} },
  { id:'shuffle3', name:'基因重排 III', tree:'ability', cost:30, requires:['shuffle2'], antiCure:true, desc:'解药倒退 15%，可触发一天停研（共享三天冷却）', eff:{cureBack:15} },
  { id:'escape', name:'免疫逃逸', tree:'ability', cost:18, requires:['hard1'], antiCure:true, desc:'解药倒退，部分已接种者重新易感', eff:{escape:1,cureBack:5} },
  { id:'antigenDrift', name:'抗原漂移', tree:'ability', cost:48, costStep:26, repeat:true, requiresAny:['shuffle3','hard2','escape'], antiCure:true, desc:'后期强化：解药小幅倒退，价格逐次上涨', eff:{cureBack:4} },
];

const TRANSMISSION_TIER2_SCALE = 0.6;
function transmissionEffect(card) {
  if (card.tree !== 'transmission' || !card.id.endsWith('2')) return card.eff;
  return Object.fromEntries(Object.entries(card.eff).map(([key,value]) => [key,value * TRANSMISSION_TIER2_SCALE]));
}

// ── 人类可买的东西 ────────────────────────────────────────────────────────
const CURE_CARDS = [
  { id:'publicHealth', name:'例行公卫', stage:'early', cost:3, repeat:true, maxBuys:3, costStep:0, desc:'每三天可组织一次筛查，察觉 +1；三次后可主动开启解药研究', kind:'global', eff:{vigilance:1} },
  { id:'detect', name:'溯源检测', stage:'early', awareness:1, cost:4, desc:'出现异常后追查病原，看清瘟疫属性', kind:'global', eff:{reveal:1} },
  { id:'watch', name:'全球监测网', stage:'early', awareness:2, cost:9, desc:'疫情引起关注后，看见所有国家真实数据', kind:'global', eff:{watch:1} },
  { id:'lab', name:'研究拨款', stage:'early', awareness:3, cost:7, repeat:true, maxBuys:3, costStep:10, desc:'疫情确认后建立研究所，整局最多投入三次', kind:'global', eff:{research:1} },
  { id:'sequence', name:'应急测序', stage:'early', awareness:3, cost:20, repeat:true, costStep:0, desc:'解除停研并保护至次日；期间研究倒退减半。三天冷却，固定 20 点', kind:'global', eff:{sequence:1} },
  { id:'fieldLab', name:'流动实验室', stage:'response', cost:8, repeat:true, desc:'指定国家：研究贡献翻倍五天', kind:'country' },
  { id:'closeAir', name:'关闭机场', stage:'response', cost:6, desc:'监测网开启后即可关闭指定国家机场：飞机进不来也出不去', kind:'country' },
  { id:'closePort', name:'关闭港口', stage:'response', cost:6, desc:'监测网开启后即可关闭指定国家港口：货轮进不来也出不去', kind:'country' },
  { id:'closeLand', name:'关闭边境', stage:'response', cost:7, repeat:true, desc:'指定国家：陆路跨境传播降低五天', kind:'country' },
  { id:'quarant', name:'就地隔离', stage:'response', cost:7, repeat:true, desc:'指定国家：本国传播减半五天', kind:'country' },
  { id:'care', name:'特效药', stage:'response', cost:9, repeat:true, desc:'指定国家：三天内减死亡并治疗感染者', kind:'country' },
  { id:'rescue', name:'国际救援队', stage:'late', cost:11, repeat:true, desc:'指定国家：避免崩溃并恢复研究能力五天', kind:'country' },
  { id:'vaccine', name:'疫苗接种', stage:'late', cost:10, repeat:true, desc:'指定国家：保护该国 15% 人口，最多按健康人口接种；阻止输入三天', kind:'country' },
  { id:'manufacture', name:'扩建生产线', stage:'late', cost:14, desc:'研究完成后部署速度翻倍', kind:'global', eff:{deploySpeed:1} },
  { id:'treaty', name:'全球研究协定', stage:'late', cost:16, desc:'未崩溃国家协作，研究永久加速，并抵消下一次研究倒退', kind:'global', eff:{research:2,rollbackShield:1} },
  { id:'deployTeams', name:'全球部署队', stage:'deployment', cost:12, repeat:true, maxBuys:3, desc:'立即推进解药部署并加快治疗', kind:'global', eff:{deployPush:18} },
];

// ── 随机 ──────────────────────────────────────────────────────────────────
function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function pushNews(st, key, text, extra = {}) {
  st.news = st.news || []; st.newsSeen = st.newsSeen || [];
  if (st.newsSeen.includes(key)) return;
  st.newsSeen.push(key); st.news.push(Object.assign({ day:st.day, key, text }, extra));
  if (st.news.length > 24) st.news = st.news.slice(-24);
}
function pushMilestone(st, key, text, country) {
  if ((st.newsSeen || []).includes(key)) return;
  const extra = {type:'milestone', priority:1}; if(country) extra.country=country;
  pushNews(st,key,text,extra);
  st.log.push(Object.assign({day:st.day,key,text},extra));
}
function normalizeState(st) {
  st.plague = st.plague || {};
  st.plague.owned = st.plague.owned || [];
  st.plague.combos = st.plague.combos || [];
  st.plague.dnaMilestones = st.plague.dnaMilestones || [];
  if (!st.plague.transmissionTier2Scaled) {
    for (const card of PLAGUE_CARDS.filter(c => c.tree === 'transmission' && c.id.endsWith('2') && st.plague.owned.includes(c.id))) {
      for (const [key,value] of Object.entries(card.eff)) st.plague[key] = Math.max(0, (st.plague[key] || 0) - value * (1 - TRANSMISSION_TIER2_SCALE));
    }
    st.plague.transmissionTier2Scaled = true;
  }
  if (st.plague.reservoir === undefined) st.plague.reservoir = 0;
  st.cure = st.cure || {};
  st.cure.owned = st.cure.owned || [];
  const cureDefaults = { progress:0, deployment:0, deploying:false, research:1, deploySpeed:1, reveal:0, watch:0, cureSlow:0, fieldResponse:0, paused:0, lastPauseDay:null, vigilance:0, lastPublicHealthDay:null, sequenceUntil:0, lastSequenceDay:null, rp:0 };
  for (const [key, value] of Object.entries(cureDefaults)) if (st.cure[key] === undefined) st.cure[key] = value;
  st.cure.peakProgress = Math.max(st.cure.peakProgress || 0, st.cure.progress);
  if (st.cure.rollbackShield === undefined) st.cure.rollbackShield = 0;
  if (st.cure.pauseStreak === undefined) st.cure.pauseStreak = 0;
  if (st.cure.lastPausedResearchDay === undefined) st.cure.lastPausedResearchDay = null;
  if (!Array.isArray(st.cure.pauseDays)) st.cure.pauseDays = st.cure.lastPausedResearchDay == null ? []
    : Array.from({length:Math.min(10,st.cure.pauseStreak)},(_,i)=>st.cure.lastPausedResearchDay-i);
  st.cure.pauseDays = [...new Set(st.cure.pauseDays)].filter(day => day > st.day - 10 && day <= st.day);
  if (st.lastStandImmuneUntil === undefined) st.lastStandImmuneUntil = 0;
  st.countries = st.countries || {};
  st.news = st.news || []; st.newsSeen = st.newsSeen || [];
  for (const m of WORLD) {
    if (!st.countries[m.id]) st.countries[m.id] = { id:m.id, healthy:m.pop, infected:0, dead:0, vaccinated:0, known:false };
    const c = st.countries[m.id];
    if (c.everInfected === undefined) c.everInfected = c.infected > 0 || c.dead > 0 || c.known;
    for (const [key, value] of Object.entries({ healthy:0, infected:0, dead:0, vaccinated:0, known:false, closedAir:false, closedSea:false, border:0, quarantine:0, care:0, researchBoost:0, rescue:0, importShield:0, lastInfectedDay:null, collapsed:false })) {
      if (c[key] === undefined) c[key] = value;
    }
  }
  st.worldPop = WORLD.reduce((n, m) => n + m.pop, 0);
  return st;
}

// ── 手感旋钮（平衡扫参用，改这里就能重扫）────────────────────────────────
const TUNE = {
  spreadBase: 0.16, spreadPerInf: 0.028,   // 国内蔓延
  deathPerLethal: 0.0032,                  // 症状树变深后按总致命值重新标定
  vaccDose: 5000, vaccShare: 0.15, vaccWane: 0.04,
  breakthrough: 0.15,                      // 突破感染（啃已接种的人）
  // ★9/5 13:44 她：「也得给我点数才行啊！我都没点数！」——原来 dnaBase 1/dnaPer 12000，前二十天每天只进 1-2 点，
  //   瘟疫方要连过好几个回合才买得起一张牌。底薪翻倍、按人头提速、新传到一国奖 2 点。
  dnaBase: 2, dnaPer: 8000, dnaCap: 6, newCountryDna: 1,
  // ★9/5 凌晨扫了 24 组参数选的这一组：两个会玩的 bot 对打 21:19，平均 146 天
  rpBase: 3, rpDiv: 3,   // 9/5 13:46 瘟疫收入提了之后人类也提一档，不然 bot 对打变 137:63
  cureF: 1.34, curePerKnown: 0.015,
  asymptomaticInfectivityCap: 6,
  labStep: 10, shuffleStep: 0,
  cureBack: 10, drugBack: 3, escapeBack: 5,
  evolutionPause: 1, slowF: 0.82,
  collapseDeadRatio: 0.70, collapseAliveRatio: 0.18,
  civilizationFloor: 0.08, deployPerDay: 15, careTreat: 0.08,
};

// ── 开局 ──────────────────────────────────────────────────────────────────
function createGame(opts) {
  opts = opts || {};
  const seed = opts.seed === undefined ? 20260905 : opts.seed;
  const rand = rngFrom(seed);
  const startId = opts.startCountry || WORLD[Math.floor(rand() * 4)].id; // 默认从四个人口大国之一起手
  const countries = {};
  for (const c of WORLD) {
    countries[c.id] = {
      id: c.id, healthy: c.pop, infected: 0, dead: 0, vaccinated: 0,
      closedAir: false, closedSea: false, border: 0, quarantine: 0, care: 0,
      researchBoost: 0, rescue: 0, collapsed: false, known: false,
    };
  }
  /* ★2026-09-05 02:04 她：「为什么我不能选择国家投放」——原版第一步就是选起手国家，
     我原来直接随机指一个，等于把开局最重要的决定拿走了。
     现在不指定就进 seed 阶段，由瘟疫点一个国家投放，投完才是第 1 天。 */
  const seeded = !!opts.startCountry;
  const first = countries[startId] || countries[WORLD[0].id];
  if (seeded) { first.infected = 1; first.healthy -= 1; }

  const worldPop = WORLD.reduce((a, c) => a + c.pop, 0);
  return {
    game: 'plague',
    worldPop,
    seed, day: 1, phase: seeded ? 'plague' : 'seed',   // seed=选投放国家；然后 plague→cure→结算
    done: false, winner: null, result: null,
    countries,
    plague: {
      dna: 10, owned: [], combos: [], dnaMilestones: [], transmissionTier2Scaled:true,
      infectivity: 3, severity: 0, lethality: 0,
      air: 0, sea: 0, land: 1, hotBonus: 0,
      resHeat: 0, resCold: 0, resDrug: 0, reservoir: 0,
      startCountry: seeded ? first.id : null,
    },
    cure: { rp: 8, owned: [], progress: 0, deployment: 0, deploying: false,
      research: 1, deploySpeed: 1, reveal: 0, watch: 0, cureSlow: 0, fieldResponse: 0, paused: 0, lastPauseDay: null },
    actionsLeft: 2,                     // 每人每天两步
    log: seeded
      ? [{ day: 1, text: '第 1 天：' + nameOf(first.id) + ' 出现了第一批感染者。' }]
      : [{ day: 1, text: '零号病人还没落地——瘟疫要先挑一个国家投放。' }],
    news: [], newsSeen: [],
  };
}

function costOf(st, card, side) {
  if (!card.repeat) return card.cost;
  const owned = (side === 'cure' ? st.cure.owned : st.plague.owned);
  const times = owned.filter((x) => x === card.id).length;
  return card.cost + times * (card.costStep === undefined ? (side === 'cure' ? TUNE.labStep : TUNE.shuffleStep) : card.costStep);
}

function ownedCount(st, side, id) { return st[side].owned.filter((x) => x === id).length; }
function prereqsMet(st, card) {
  const owned = st.plague.owned;
  if (card.requires && !card.requires.every((id) => owned.includes(id))) return false;
  if (card.requiresAny && !card.requiresAny.some((id) => owned.includes(id))) return false;
  return true;
}
function cureStage(st) {
  if (st.cure.deploying) return 'deployment';
  const known = Object.values(st.countries).filter((c) => c.known).length;
  // 设计单第 11 条：late 的 55% 解药 / 12% 死亡双门槛经复盘确认，刻意保留。
  if (st.cure.progress >= 55 || sum(st, 'dead') / st.worldPop >= 0.12) return 'late';
  if (known >= 2 || st.day >= 8) return 'response';
  return 'early';
}
function awarenessOf(st) {
  const known = Object.values(st.countries).filter((c) => c.known).length;
  return Math.min(8, Math.floor((st.plague.severity || 0) / 2) + Math.min(4, known) + (st.cure.vigilance || 0));
}
function researchIsOpen(st) { return awarenessOf(st) >= 3; }
const STAGE_RANK = { early:0, response:1, late:2, deployment:3 };
function cureCardUnlocked(st, card) {
  if (card.id === 'sequence' && st.cure.lastSequenceDay != null && st.day - st.cure.lastSequenceDay < 3) return false;
  if (card.id === 'publicHealth' && st.cure.lastPublicHealthDay != null && st.day - st.cure.lastPublicHealthDay < 3) return false;
  if (st.cure.watch && ['closeAir','closePort'].includes(card.id)) return true;
  if ((card.awareness || 0) > awarenessOf(st)) return false;
  if (card.stage === 'deployment') return st.cure.deploying;
  return STAGE_RANK[cureStage(st)] >= STAGE_RANK[card.stage || 'early'];
}

function nameOf(id) { const c = WORLD.find((x) => x.id === id); return c ? c.name : id; }
function meta(id) { return WORLD.find((x) => x.id === id); }
function plagueIncomeFloor(st) {
  return TUNE.dnaBase + Math.min(TUNE.dnaCap, Math.floor(sum(st, 'infected') / TUNE.dnaPer));
}
function cureIncome(st) {
  const known = Object.values(st.countries).filter((c) => c.known).length;
  const active = WORLD.filter((m) => !st.countries[m.id].collapsed).length;
  return TUNE.rpBase + Math.min(4, Math.floor(known / 20)) + Math.floor(3 * active / WORLD.length);
}
function cureIncomeBreakdown(st) {
  const known = Object.values(st.countries).filter(c=>c.known).length;
  const collapsed = WORLD.filter(m=>st.countries[m.id].collapsed);
  const collaboration = Math.floor(3 * (WORLD.length - collapsed.length) / WORLD.length);
  return {base:TUNE.rpBase,epidemic:Math.min(4,Math.floor(known/20)),collaboration,
    collapseLoss:3-collaboration,collapsedCountries:collapsed.map(m=>m.id)};
}
function researchCapacity(st) {
  let active = 0, total = 0;
  for (const m of WORLD) {
    const c = st.countries[m.id];
    total += m.research;
    if (!c || c.collapsed) continue;
    const workforce = Math.max(0, Math.min(1, (c.healthy + c.vaccinated + c.infected * 0.25) / m.pop));
    active += m.research * workforce * (c.researchBoost > 0 ? 2 : 1);
  }
  return total > 0 ? active / total : 0;
}
function responseCoverage(st) {
  let covered = 0, total = 0;
  for (const m of WORLD) {
    const c = st.countries[m.id];
    if (!c || !c.known || c.infected <= 0 || c.collapsed) continue;
    const weight = Math.max(1, m.research) * Math.max(1, Math.log10(c.infected + 10));
    total += weight;
    if (c.quarantine > 0 || c.care > 0 || c.researchBoost > 0 || c.rescue > 0) covered += weight;
  }
  const countryCoverage = total > 0 ? covered / total : 0;
  return Math.max(countryCoverage, st.cure.fieldResponse || 0);
}

// ── 合法动作 ──────────────────────────────────────────────────────────────
function legalMoves(st, role) {
  if (st.done) return [];
  if (st.phase === 'seed') {
    if (role !== 'plague') return [];
    return WORLD.map((m) => ({ type: 'seed', country: m.id }));
  }
  if (st.phase !== role) return [];
  const out = [{ type: 'pass' }];
  if (role === 'plague') {
    for (const card of PLAGUE_CARDS) {
      if (!prereqsMet(st, card)) continue;
      if (!card.repeat && st.plague.owned.includes(card.id)) continue;
      if (card.maxBuys && ownedCount(st, 'plague', card.id) >= card.maxBuys) continue;
      if (st.plague.dna >= costOf(st, card)) out.push({ type: 'buy', card: card.id, cost: costOf(st, card) });
    }
  } else {
    for (const card of CURE_CARDS) {
      if (!cureCardUnlocked(st, card)) continue;
      if (card.kind === 'global' && !card.repeat && st.cure.owned.includes(card.id)) continue;
      if (card.maxBuys && ownedCount(st, 'cure', card.id) >= card.maxBuys) continue;
      const price = costOf(st, card, 'cure');
      if (st.cure.rp < price) continue;
      if (card.kind === 'global') { out.push({ type: 'buy', card: card.id, cost: price }); continue; }
      const targets = [];
      for (const m of WORLD) {
        const c = st.countries[m.id];
        // 已经关掉的口岸、没有的口岸、已经没人可打的疫苗，都不该出现在合法动作里
        // ★死光的国家（她 9/5 16:58：「死完了的国家还显示吗」）一张都不该列；隔离/特效药还得有病人才有意义
        // ★这两条过滤只能看人类看得见的国家——雾里的国家一过滤，列表就把投放国漏出来了（9/5 17:41 第四局第 1 天我自己发现的）
        const visible = c.known || st.cure.watch > 0;
        if (visible && c.healthy + c.vaccinated + c.infected <= 0) continue;
        if (visible && ['quarant','care'].includes(card.id) && c.infected <= 0) continue;
        if (card.id === 'closeAir' && (!m.air || c.closedAir)) continue;
        if (card.id === 'closePort' && (!m.sea || c.closedSea)) continue;
        if (visible && card.id === 'vaccine' && c.healthy <= 0) continue;
        if (card.id === 'quarant' && c.quarantine > 0) continue;
        if (card.id === 'care' && c.care > 0) continue;
        if (card.id === 'closeLand' && c.border > 0) continue;
        if (card.id === 'fieldLab' && c.researchBoost > 0) continue;
        if (card.id === 'rescue' && c.rescue > 0) continue;
        targets.push({
          type: 'buy', card: card.id, country: m.id,
          targetInfected: visible ? c.infected : null,
          targetDead: visible ? c.dead : null,
          targetAlive: visible ? c.healthy + c.vaccinated : null,
        });
      }
      targets.sort((a, b) => {
        const ai = a.targetInfected, bi = b.targetInfected;
        if (ai === null || bi === null) return ai === null ? (bi === null ? 0 : 1) : -1;
        const burden = (bi + b.targetDead) - (ai + a.targetDead);
        if (burden) return burden;
        return b.targetAlive - a.targetAlive;
      });
      out.push(...targets);
    }
  }
  return out;
}

// ── 走一步 ────────────────────────────────────────────────────────────────
function apply(state, role, move) {
  const st = normalizeState(clone(state));
  if (st.done) throw new Error('这局已经结束了');
  move = move || { type: 'pass' };

  if (st.phase === 'seed') {
    if (role !== 'plague') throw new Error('等瘟疫先选投放的国家');
    if (move.type !== 'seed') throw new Error('先选一个国家投放');
    const c = st.countries[move.country];
    if (!c) throw new Error('没这个国家');
    c.infected = 1; c.healthy -= 1;
    st.plague.startCountry = c.id;
    st.phase = 'plague';
    st.actionsLeft = 2;
    st.log.push({ day: st.day, text: '第 1 天：' + nameOf(c.id) + ' 出现了第一批感染者。' });
    return { state: st };
  }

  if (st.phase !== role) throw new Error('还没轮到' + (role === 'plague' ? '瘟疫' : '人类'));

  if (move.type === 'pass') {
    st.actionsLeft = 0;
  } else if (move.type === 'buy') {
    if (role === 'plague') buyPlague(st, move);
    else buyCure(st, move);
    st.actionsLeft -= 1;
  } else {
    throw new Error('不认识的动作：' + move.type);
  }

  if (st.actionsLeft <= 0) {
    if (st.phase === 'plague') { st.phase = 'cure'; st.actionsLeft = 2; }
    else { tick(st); st.phase = 'plague'; st.actionsLeft = 2; }
  }
  return { state: st };
}

function buyPlague(st, move) {
  const card = PLAGUE_CARDS.find((c) => c.id === move.card);
  if (!card) throw new Error('没这张进化卡');
  if (!prereqsMet(st, card)) throw new Error('前置进化还没完成');
  if (!card.repeat && st.plague.owned.includes(card.id)) throw new Error('已经进化过了');
  if (card.maxBuys && ownedCount(st, 'plague', card.id) >= card.maxBuys) throw new Error('已经进化到顶了');
  const price = costOf(st, card);
  if (st.plague.dna < price) throw new Error('DNA 不够');
  st.plague.dna -= price;
  st.plague.owned.push(card.id);
  // 只有真正针对解药的进化才打乱实验室；普通传播/症状不再白送整天停研。
  if (card.antiCure && st.cure.pauseDays.length < 4 && st.day >= st.cure.sequenceUntil && (st.cure.lastPauseDay == null || st.day - st.cure.lastPauseDay >= 3)) {
    st.cure.paused = Math.max(st.cure.paused || 0, TUNE.evolutionPause || 1);
    st.cure.lastPauseDay = st.day;
  }
  const effect = transmissionEffect(card);
  for (const k of Object.keys(effect)) {
    if (k === 'cureBack') {
      const protection = st.day < st.cure.sequenceUntil ? 0.5 : 1;
      const floor = st.cure.peakProgress * 0.5;
      const back = Math.max(0, Math.min(card.eff.cureBack, st.cure.progress * 0.15) * protection);
      const loss = Math.max(0, Math.min(back, st.cure.progress - floor));
      if (loss > 0 && st.cure.rollbackShield > 0) {
        st.cure.rollbackShield -= 1;
        st.log.push({day:st.day,type:'research-protection',text:'全球研究协定抵消了这次研究倒退。'});
      } else st.cure.progress -= loss;
      continue;
    }
    if (k === 'cureSlow') { st.cure.cureSlow += card.eff.cureSlow; continue; }
    if (k === 'escape') {
      for (const c of Object.values(st.countries)) {
        const back = Math.floor(c.vaccinated / 2);
        c.vaccinated -= back; c.healthy += back;
      }
      continue;
    }
    st.plague[k] = (st.plague[k] || 0) + effect[k];
  }
  st.plague.combos = st.plague.combos || [];
  if (st.plague.owned.includes('cough') && st.plague.owned.includes('vomit') && !st.plague.combos.includes('projectile')) {
    st.plague.combos.push('projectile'); st.plague.infectivity += 2;
    st.log.push({ day: st.day, text: '症状组合「喷射性呕吐」触发，传播进一步增强。' });
  }
  if (st.plague.owned.includes('insomnia') && st.plague.owned.includes('anemia') && !st.plague.combos.includes('walkingDead')) {
    st.plague.combos.push('walkingDead'); st.cure.cureSlow += 1;
    st.log.push({ day: st.day, text: '症状组合「行尸走肉」触发，全球研究效率下降。' });
  }
  st.log.push({ day: st.day, type:'action', role:'plague', card:card.id, text: '瘟疫进化了「' + card.name + '」。' });
}

function buyCure(st, move) {
  const card = CURE_CARDS.find((c) => c.id === move.card);
  if (!card) throw new Error('没这张对策卡');
  if (!cureCardUnlocked(st, card)) throw new Error('这项对策还没进入可用阶段');
  if (card.maxBuys && ownedCount(st, 'cure', card.id) >= card.maxBuys) throw new Error('这项投入已经到顶了');
  if (st.cure.rp < card.cost) throw new Error('研究点不够');
  if (card.kind === 'global') {
    if (!card.repeat && st.cure.owned.includes(card.id)) throw new Error('已经投过了');
    const price = costOf(st, card, 'cure');
    if (st.cure.rp < price) throw new Error('研究点不够');
    st.cure.rp -= price;
    st.cure.owned.push(card.id);
    if (card.eff.sequence) { st.cure.paused = 0; st.cure.pauseStreak = 0; st.cure.lastPausedResearchDay = null; st.cure.sequenceUntil = st.day + 2; st.cure.lastSequenceDay = st.day; }
    if (card.eff.vigilance) { st.cure.vigilance = Math.min(3, (st.cure.vigilance || 0) + card.eff.vigilance); st.cure.lastPublicHealthDay = st.day; }
    if (card.eff.research) st.cure.research += card.eff.research;
    if (card.eff.rollbackShield) st.cure.rollbackShield += card.eff.rollbackShield;
    if (card.eff.deploySpeed) st.cure.deploySpeed += card.eff.deploySpeed;
    if (card.eff.deployPush) st.cure.deployment = Math.min(100, st.cure.deployment + card.eff.deployPush);
    if (card.eff.reveal) st.cure.reveal = 1;
    if (card.eff.watch) st.cure.watch = 1;
    st.log.push({ day: st.day, type:'action', role:'cure', card:card.id, text: '人类启动了「' + card.name + '」。' });
    return;
  }
  const c = st.countries[move.country];
  if (!c) throw new Error('没这个国家');
  const m = meta(move.country);
  const visible = c.known || st.cure.watch > 0;
  if (visible && c.healthy + c.vaccinated + c.infected <= 0) throw new Error(m.name + '已经没有人了');
  if (card.id === 'closeAir') {
    if (!m.air) throw new Error(m.name + '没有国际机场');
    if (c.closedAir) throw new Error(m.name + '的机场已经关了');
    c.closedAir = true;
  } else if (card.id === 'closePort') {
    if (!m.sea) throw new Error(m.name + '没有港口');
    if (c.closedSea) throw new Error(m.name + '的港口已经关了');
    c.closedSea = true;
  } else if (card.id === 'quarant') {
    if (c.quarantine > 0) throw new Error(m.name + '还在隔离中');
    c.quarantine = 5;
  } else if (card.id === 'vaccine') {
    const dose = Math.min(c.healthy, Math.max(TUNE.vaccDose, Math.round(m.pop * TUNE.vaccShare)));
    c.vaccinated += dose; c.healthy -= dose; c.importShield = 3;
  } else if (card.id === 'care') {
    if (c.care > 0) throw new Error(m.name + '的特效药还在生效');
    c.care = 3;
  } else if (card.id === 'closeLand') {
    c.border = 5;
  } else if (card.id === 'fieldLab') {
    c.researchBoost = 5;
  } else if (card.id === 'rescue') {
    c.rescue = 5; c.collapsed = false;
  }
  st.cure.fieldResponse = Math.min(1, (st.cure.fieldResponse || 0) +
    (['quarant','care','fieldLab','rescue','vaccine'].includes(card.id) ? 0.14 : 0.07));
  st.cure.rp -= card.cost;
  st.log.push({ day: st.day, type:'action', role:'cure', card:card.id, country:move.country, text: '人类在' + m.name + '用了「' + card.name + '」。' });
}

// ── 一天结算 ──────────────────────────────────────────────────────────────
function tick(st) {
  normalizeState(st);
  const rand = rngFrom(st.seed + st.day * 7919);
  const p = st.plague;
  const infectedCountriesAtDawn = Object.values(st.countries).filter((c) => c.infected > 0).length;
  const networkMultiplier = 1 + Math.min(0.6, infectedCountriesAtDawn / WORLD.length * 0.8);

  for (const c of Object.values(st.countries)) if (c.infected > 0) { c.lastInfectedDay = st.day; c.everInfected = true; }

  // 1. 国内蔓延
  for (const c of Object.values(st.countries)) {
    if (c.infected <= 0 || c.healthy <= 0) continue;
    const m = meta(c.id);
    const infectivity = p.severity > 0 ? p.infectivity : Math.min(p.infectivity, TUNE.asymptomaticInfectivityCap);
    let rate = TUNE.spreadBase + infectivity * TUNE.spreadPerInf;
    rate *= networkMultiplier;
    if (m.climate === 'hot') rate *= p.resHeat ? 1 + p.hotBonus * 0.05 : 0.65 + p.hotBonus * 0.05;
    if (m.climate === 'cold') rate *= p.resCold ? 1 + (p.coldBonus || 0) * 0.05 : 0.55 + (p.coldBonus || 0) * 0.04;
    if (m.wealth === 'rich') rate *= p.resDrug ? 0.9 + Math.min(0.2, p.resDrug * 0.08) : 0.7;
    if (m.wealth === 'poor') rate *= 1 + (p.poorBonus || 0) * 0.05;
    if (m.urbanity === 'urban') rate *= 1 + (p.urbanBonus || 0) * 0.05;
    if (m.urbanity === 'rural') rate *= 1 + (p.ruralBonus || 0) * 0.05;
    if (c.quarantine > 0) rate *= 0.5;
    const want = Math.ceil(c.infected * rate + (c.infected > 0 ? 1 : 0));
    const add = Math.min(c.healthy, want);
    c.infected += add; c.healthy -= add;
    // ★疫苗不是无敌护身符（不然瘟疫永远赢不了）：没易感人口时，突破感染按 15% 啃已接种的人
    const left = want - add;
    if (left > 0 && c.vaccinated > 0) {
      const breakthrough = Math.min(c.vaccinated, Math.ceil(left * TUNE.breakthrough));
      c.vaccinated -= breakthrough; c.infected += breakthrough;
    }
  }

  // 2. 跨国传播
  const seeded = new Set();
  const trySeed = (to, chance) => {
    if (!to || to.infected > 0 || to.importShield > 0 || (to.lastInfectedDay != null && st.day - to.lastInfectedDay <= 1) || seeded.has(to.id)) return;
    const tm = meta(to.id);
    if (tm.climate === 'cold' && !p.resCold) chance *= 0.4;
    if (tm.climate === 'hot' && !p.resHeat) chance *= 0.7;
    if (chance > 0 && rand() < Math.min(0.92, chance)) seeded.add(to.id);
  };
  const airTargets = WORLD.filter((m) => m.air).map((m) => st.countries[m.id]);
  const seaTargets = WORLD.filter((m) => m.sea).map((m) => st.countries[m.id]);
  for (const from of Object.values(st.countries)) {
    if (from.infected < 5) continue;
    const fm = meta(from.id);
    if (p.land > 0 && from.border <= 0) for (const id of fm.land) {
      const to = st.countries[id];
      if (to && to.border <= 0) trySeed(to, 0.09 * p.land);
    }
    if (p.air > 0 && fm.air && !from.closedAir) for (let i = 0; i < Math.min(3, 1 + Math.floor(p.air / 2)); i++) {
      const to = airTargets[Math.floor(rand() * airTargets.length)];
      if (to && !to.closedAir && to.id !== from.id) trySeed(to, 0.08 * p.air);
    }
    if (p.sea > 0 && fm.sea && !from.closedSea) for (let i = 0; i < Math.min(3, 1 + Math.floor(p.sea / 2)); i++) {
      const to = seaTargets[Math.floor(rand() * seaTargets.length)];
      if (to && !to.closedSea && to.id !== from.id) trySeed(to, 0.07 * p.sea);
    }
  }
  const spreadCountries = [];
  for (const id of seeded) {
    const c = st.countries[id];
    if (c.infected === 0 && c.healthy > 0) {
      c.infected = 1; c.healthy -= 1;
      spreadCountries.push(id);
      if (!c.everInfected) p.dna += TUNE.newCountryDna || 0;
      c.everInfected = true; c.lastInfectedDay = st.day; //   // 开疆拓土有奖（9/5 她要的：得给瘟疫点数）
    }
  }
  if (spreadCountries.length) st.log.push({
    day: st.day,
    type: 'spread',
    countries: spreadCountries,
    text: '瘟疫传到了' + spreadCountries.map(nameOf).join('、') + '。',
  });

  // 2.5 免疫衰减：疫苗保护会退（不然人类打一轮疫苗就永久无敌，瘟疫再没戏）
  for (const c of Object.values(st.countries)) {
    if (c.vaccinated <= 0) continue;
    const wane = Math.max(1, Math.round(c.vaccinated * TUNE.vaccWane));
    const back = Math.min(c.vaccinated, wane);
    c.vaccinated -= back; c.healthy += back;
  }

  // 3. 特效药每天治疗一部分感染者，同时降低死亡率。
  for (const c of Object.values(st.countries)) if (c.care > 0 && c.infected > 0) {
    const healed = Math.min(c.infected, Math.max(1, Math.ceil(c.infected * TUNE.careTreat)));
    c.infected -= healed; c.healthy += healed;
  }

  const deadBefore = sum(st, 'dead');
  // 3.1 死亡
  if (p.lethality > 0) {
    for (const c of Object.values(st.countries)) {
      if (c.infected <= 0) continue;
      let dr = p.lethality * TUNE.deathPerLethal;
      if (c.care > 0) dr *= 0.5;
      if (meta(c.id).wealth === 'rich' && !p.resDrug) dr *= 0.7;
      const die = Math.min(c.infected, Math.ceil(c.infected * dr));
      c.infected -= die; c.dead += die;
    }
  }

  if (deadBefore === 0 && sum(st,'dead') > 0) pushMilestone(st,'first-death','全球报告首例死亡，疫情进入致命阶段。');

  // 4. 被发现：症状够重就上新闻，人类拿研究点
  for (const c of Object.values(st.countries)) {
    // 有雾之后这条就是人类唯一的眼睛，门槛别太高（原来 5% 太晚，人类一直瞎着）
    if (!c.known && c.infected > 0 && (p.severity >= 3 || c.infected > c.healthy * 0.02)) {
      c.known = true;
      st.log.push({ day: st.day, text: nameOf(c.id) + '公开了疫情。' });
      pushNews(st, 'first-known', nameOf(c.id) + '报告不明传染病，卫生部门开始调查');
    }
  }

  if (p.severity >= 3) pushNews(st, 'severity-3', '多国出现相似症状，全球监测级别上调');
  if (p.severity >= 8) pushNews(st, 'severity-8', '世界卫生组织召开紧急会议，呼吁跨国协作');
  if (p.severity >= 18) pushNews(st, 'severity-18', '重症病例激增，多国医疗系统承压');
  if (researchIsOpen(st)) pushNews(st, 'research-open', '全球解药研究正式立项，各国实验室开始协作');

  // 5. 收入
  const infectedNow = sum(st, 'infected');
  for (const milestone of [{ n:100, reward:4, label:'100 万' }, { n:1000, reward:5, label:'1000 万' }, { n:10000, reward:6, label:'1 亿' }]) {
    if (infectedNow >= milestone.n && !p.dnaMilestones.includes(milestone.n)) {
      p.dnaMilestones.push(milestone.n);
      const reward = p.severity > 0 ? milestone.reward : 0;
      p.dna += reward;
      pushMilestone(st, 'infected-' + milestone.n, '全球感染突破' + milestone.label + (reward ? '，瘟疫获得 ' + reward + ' DNA。' : '，无症状不发放 DNA 奖励。'));
    }
  }
  const newDna = plagueIncomeFloor(st) + (rand() < 0.4 ? 1 : 0);
  p.dna += newDna;
  const knownCount = Object.values(st.countries).filter((c) => c.known).length;
  for (const m of WORLD) {
    const c = st.countries[m.id], alive = c.healthy + c.vaccinated + c.infected;
    if (c.rescue > 0) c.collapsed = false;
    else if (c.dead / m.pop >= TUNE.collapseDeadRatio || alive / m.pop <= TUNE.collapseAliveRatio) c.collapsed = true;
    if(c.collapsed && c.known) pushMilestone(st,'collapse-' + m.id,m.name + '医疗与研究体系崩溃，国际救援刻不容缓。',m.id);
  }
  st.cure.rp += cureIncome(st);

  // 6. 解药进度
  if (st.cure.paused > 0 && st.cure.pauseDays.length >= 4) {
    st.cure.paused = 0;
    st.log.push({day:st.day,type:'research-protection',text:'近十天停研已达四天，本日研究继续；本次暂停不再顺延。'});
  }
  if (researchIsOpen(st) && (st.cure.paused || 0) <= 0) {
    // ★平衡（9/5 01:2x 调的）：解药别自己跑完。基础慢，靠「加大投入」堆研究点才快。
    // 每个未崩溃国家按研究设施和实际可工作的存活人口贡献，不再是“剩一人也满额”。
    let gain = st.cure.research * TUNE.cureF * (1 + Math.min(0.8, knownCount * TUNE.curePerKnown));
    gain *= researchCapacity(st);
    const coverage = responseCoverage(st);
    // 知晓度已经负责研究开闸；地方应对只奖励主动玩法，不再成为第二道必选门槛。
    gain *= 1 + 0.1 * coverage;
    if (st.cure.cureSlow) gain *= Math.pow(TUNE.slowF || 0.82, Math.min(6, st.cure.cureSlow));
    st.cure.progress = Math.min(100, st.cure.progress + gain);
    st.cure.peakProgress = Math.max(st.cure.peakProgress, st.cure.progress);
  }
  if (st.cure.progress >= 25) pushNews(st, 'cure-25', '解药研究完成第一阶段，候选方案进入验证');
  if (st.cure.progress >= 50) pushNews(st, 'cure-50', '解药研究过半，全球试验网络扩大');
  if (st.cure.progress >= 75) pushNews(st, 'cure-75', '解药进入最终阶段，生产线开始准备');
  if ((st.cure.paused || 0) > 0) {
    if (researchIsOpen(st) && !st.cure.pauseDays.includes(st.day)) st.cure.pauseDays.push(st.day);
    st.cure.pauseStreak = st.cure.lastPausedResearchDay === st.day - 1 ? st.cure.pauseStreak + 1 : 1;
    st.cure.lastPausedResearchDay = st.day;
    st.log.push({ day: st.day, text: '新变种打乱了实验室方案，解药研究今天暂停。' });
    st.cure.paused -= 1;
  } else { st.cure.pauseStreak = 0; st.cure.lastPausedResearchDay = null; }

  if (st.cure.progress >= 100 && !st.cure.deploying) {
    st.cure.deploying = true;
    st.log.push({ day: st.day, text: '解药研究完成，全球进入生产与部署阶段。' });
    pushNews(st, 'deployment', '解药研发完成，首批制剂开始全球部署');
  }
  if (st.cure.deploying && st.cure.progress >= 100) {
    st.cure.deployment = Math.min(100, st.cure.deployment + TUNE.deployPerDay * st.cure.deploySpeed);
    for (const c of Object.values(st.countries)) if (c.infected > 0) {
      const healed = Math.min(c.infected, Math.max(1, Math.ceil(c.infected * (0.10 + st.cure.deploySpeed * 0.05))));
      c.infected -= healed; c.vaccinated += healed;
    }
  }
  st.cure.fieldResponse = Math.max(0, (st.cure.fieldResponse || 0) - 0.02);

  // 6.5 有期限的措施走一天
  //     （她 9/5 16:58 抓的：「我很早之前就选了中国……但是至今不能再选」）
  for (const c of Object.values(st.countries)) {
    if (c.importShield > 0) c.importShield -= 1;
    if (c.quarantine > 0) c.quarantine -= 1;
    if (c.care > 0) c.care -= 1;
    if (c.border > 0) c.border -= 1;
    if (c.researchBoost > 0) c.researchBoost -= 1;
    if (c.rescue > 0) c.rescue -= 1;
  }

  // 7. 判胜负
  let healthy = sum(st, 'healthy') + sum(st, 'vaccinated');
  let infected = sum(st, 'infected');
  const pop0 = st.worldPop || WORLD.reduce((a, c) => a + c.pop, 0);
  const deadRatio = sum(st, 'dead') / pop0;
  if (infected <= 0 && (p.reservoir || 0) > 0 && st.cure.deployment < 100) {
    const target = WORLD.filter((m) => st.countries[m.id].healthy > 0)
      .sort((a, b) => st.countries[b.id].healthy - st.countries[a.id].healthy)[0];
    if (target) {
      const c = st.countries[target.id], wake = Math.min(c.healthy, Math.max(1, Math.ceil(target.pop * 0.00002)));
      c.healthy -= wake; c.infected += wake; p.reservoir -= 1; infected += wake; healthy -= wake;
      st.log.push({ day: st.day, text: '潜伏宿主在' + target.name + '引发复燃，疫情没有真正熄灭。' });
    }
  }
  // A five-day last stand replaces a long, low-research terminal tail. Recovery cancels it.
  const collapseRatio = Object.values(st.countries).filter(c=>c.collapsed).length / WORLD.length;
  const lastStand = healthy / pop0 < 0.01 && (deadRatio > 0.3 || collapseRatio > 1/3)
    && infected > 0 && st.cure.progress < 40 && !st.cure.deploying && st.day >= st.lastStandImmuneUntil;
  if (lastStand) {
    st.lastStandDays = (st.lastStandDays || 0) + 1;
    st.log.push({ day:st.day, type:'last-stand', text:'最后防线：健康与接种人口不足 1%，解药未达 40%，且死亡超过 30% 或逾三分之一国家崩溃。还有 ' + Math.max(0, 5 - st.lastStandDays) + ' 天恢复，否则文明失守。' });
  } else {
    if (st.lastStandDays) {
      st.lastStandImmuneUntil = st.day + 11;
      st.log.push({day:st.day, type:'last-stand', text:'最后防线稳住了，失守倒计时解除，随后十天不会再次触发。'});
    }
    st.lastStandDays = 0;
  }
  const finalAliveRatio = (healthy + infected) / pop0;
  if (finalAliveRatio <= TUNE.civilizationFloor) finish(st, 'plague', '存活人口跌破文明维持线，人类社会崩溃。');
  else if (st.cure.deployment >= 100) finish(st, 'cure', '解药完成全球部署，感染者得到治疗。');
  else if (infected <= 0) finish(st, 'cure', '潜伏宿主耗尽，疫情真正熄灭，幸存文明保住了。');
  else if (st.lastStandDays >= 5) finish(st, 'plague', '最后防线连续五天未恢复，文明失守。');
  else if (st.day >= 200) {
    if (deadRatio >= 0.6) finish(st, 'plague', '两百天，六成以上的人没了，人类算输。');
    else finish(st, 'cure', '两百天过去，疫情被拖住了，人类赢在耐力上。');
  }

  st.day += 1;
}

function finish(st, winner, why) {
  st.done = true; st.winner = winner;
  st.result = {
    winner, why, day: st.day,
    dead: sum(st, 'dead'), infected: sum(st, 'infected'),
    healthy: sum(st, 'healthy') + sum(st, 'vaccinated'),
    cure: Math.round(st.cure.progress),
  };
  st.log.push({ day: st.day, text: (winner === 'plague' ? '☠️ 瘟疫赢了：' : '💉 人类赢了：') + why });
}

function sum(st, key) { return Object.values(st.countries).reduce((s, c) => s + c[key], 0); }

// ── 分视角 ────────────────────────────────────────────────────────────────
// 人类没做溯源检测之前，看不到瘟疫的具体数值，只能看到疫情。
function viewFor(st, role) {
  const v = normalizeState(clone(st));
  v.world = WORLD;
  v.plagueCards = PLAGUE_CARDS.map((card) => Object.assign({}, card, { eff:transmissionEffect(card), cost: costOf(v, card, 'plague'), unlocked: prereqsMet(v, card) }));
  v.cureCards = CURE_CARDS.map((card) => Object.assign({}, card, { cost: costOf(v, card, 'cure'), unlocked: cureCardUnlocked(v, card) }));
  v.cure.stage = cureStage(v);
  v.cure.awareness = awarenessOf(v);
  v.cure.researchOpen = researchIsOpen(v);
  v.cure.researchCapacity = researchCapacity(v);
  v.cure.responseCoverage = responseCoverage(v);
  const plagueFloor = plagueIncomeFloor(v);
  v.plague.dailyIncome = { min: plagueFloor, max: plagueFloor + 1 };
  v.plague.effectiveInfectivity = v.plague.severity > 0 ? v.plague.infectivity : Math.min(v.plague.infectivity,TUNE.asymptomaticInfectivityCap);
  v.plague.asymptomaticInfectivityCap = v.plague.severity > 0 ? null : TUNE.asymptomaticInfectivityCap;
  v.plague.newCountryReward = TUNE.newCountryDna;
  v.cure.dailyIncome = cureIncome(v);
  const breakdown = cureIncomeBreakdown(v);
  const visibleCollapsed = breakdown.collapsedCountries.filter(id=>role==='plague' || v.cure.watch || v.countries[id].known);
  const names = visibleCollapsed.slice(0,3).map(nameOf);
  const moreCollapsed = breakdown.collapsedCountries.length > names.length;
  breakdown.collapsedCountries = visibleCollapsed;
  breakdown.message = breakdown.collapseLoss ? `${names.length ? names.join('、') + (moreCollapsed ? '等国家' : '') : '部分国家'}崩溃 · 协作收入合计 −${breakdown.collapseLoss}/天，救援可逐步恢复` : '';
  v.cure.incomeBreakdown = breakdown;
  v.totals = {
    healthy: sum(v, 'healthy'), infected: sum(v, 'infected'),
    dead: sum(v, 'dead'), vaccinated: sum(v, 'vaccinated'),
  };
  v.legal = legalMoves(v, role);
  const sequence = v.cureCards.find(card => card.id === 'sequence');
  const pending = v.cure.paused > 0 && v.cure.pauseDays.length < 4;
  const elapsed = v.cure.lastPausedResearchDay === v.day - 1 ? v.cure.pauseStreak : 0;
  const cooldownDays = v.cure.lastSequenceDay == null ? 0 : Math.max(0, 3 - (v.day - v.cure.lastSequenceDay));
  const shortfall = Math.max(0, sequence.cost - v.cure.rp);
  const pauseCapped = v.cure.pauseDays.length >= 4;
  const disrupted = !v.done && v.cure.researchOpen && !pauseCapped && (pending || elapsed > 0);
  const remedy = cooldownDays ? `应急测序冷却剩 ${cooldownDays} 天` : shortfall ? `应急测序 ${sequence.cost} 点，尚差 ${shortfall} 点` : `应急测序 ${sequence.cost} 点可解`;
  v.cure.researchStatus = { pending, pausedDays:elapsed, cooldownDays, sequenceCost:sequence.cost, shortfall,
    pausedInWindow:v.cure.pauseDays.length, pauseLimit:4, pauseWindow:10,
    canSequence: v.legal.some(move => move.card === 'sequence'),
    message: !v.done && v.cure.researchOpen && pauseCapped ? '近十天停研已达四天，本轮研究受保护，无需测序解除暂停' : disrupted ? `${elapsed ? `研究已停 ${elapsed} 天` : '本轮研究将暂停'} · ${remedy}` : '' };
  sequence.recommended = disrupted;
  v.cure.lastStandRemaining = v.lastStandDays ? Math.max(0, 5 - v.lastStandDays) : null;
  v.cure.lastStandImmunityDays = Math.max(0, v.lastStandImmuneUntil - v.day);
  if (role !== 'plague' && !st.cure.reveal) {
    v.plague = { dna: null, owned: st.plague.owned.length, hidden: true, severity: st.plague.severity, lethality: st.plague.lethality };
  }
  /* ★2026-09-05 02:24 她：「要改！不然我玩起来是不是太不公平了」——
     原来人类第 1 天就能看见每个国家的确切感染数，等于开局就知道零号病人在哪，
     可以精准封锁起手国。现在没「公开疫情」的国家对人类是一团雾：
     只看得见人口和自己做过的措施，看不见病了多少、死了多少。
     全球总数照给（知道世界上出事了，但不知道在哪），这也是人类该有的信息。 */
  /* 围观的也照人类那样看（2026-09-05 08:30 大厅上线后拿邀请链接进来的第三个人是围观，不能替人类掀雾） */
  if (role !== 'plague' && !st.cure.watch) {
    for (const c of Object.values(v.countries)) {
      if (c.known) continue;
      c.hidden = true;
      delete c.everInfected; delete c.lastInfectedDay;
      c.infected = null;
      c.dead = null;
      c.healthy = null;
    }
  }
  /* 2026-09-05 13:26 补的漏：疫情通报里「第 1 天：印度出现了第一批感染者」「瘟疫传到了X」
     把雾遮住的国家名直接写在人类眼前，迷雾等于白加。没公开的国家在通报里一律写「某个国家」。 */
  /* 2026-09-05 13:34 她：「你能看到我做了什么，是不是有点不公平」——通报里「瘟疫进化了「水源传播」」
     把她的每一步都念给人类听，跟「没做溯源检测看不见瘟疫家底」的规则打架。没做检测之前只告诉人类
     「它进化了一项」，是什么得花 4 点去查。 */
  if (role !== 'plague' && !st.cure.reveal) {
    v.log = (v.log || []).map((entry) => /^瘟疫进化了「/.test(entry.text)
      ? Object.assign({}, entry, { text: '瘟疫悄悄进化了一项（做溯源检测才看得见是什么）。' })
      : entry);
  }
  if (role !== 'plague' && !st.cure.watch) {
    v.log = (v.log || []).map((entry) => {
      if (entry.type !== 'spread' || !Array.isArray(entry.countries)) return entry;
      const visible = entry.countries.filter((id) => v.countries[id] && !v.countries[id].hidden);
      const hiddenCount = entry.countries.length - visible.length;
      const names = visible.map(nameOf);
      const where = names.length
        ? names.join('、') + (hiddenCount ? '及' + hiddenCount + '个未公开国家' : '')
        : hiddenCount + '个未公开国家';
      return Object.assign({}, entry, { countries: visible, hiddenCount, text: '瘟疫传到了' + where + '。' });
    });
    const hiddenNames = Object.values(v.countries).filter((c) => c.hidden).map((c) => nameOf(c.id));
    v.log = (v.log || []).map((entry) => {
      let text = entry.text;
      for (const n of hiddenNames) text = text.split(n).join('某个国家');
      return text === entry.text ? entry : Object.assign({}, entry, { text });
    });
  }
  v.log = (v.log || []).map(entry => {
    const safe = Object.assign({}, entry);
    if (role !== 'plague' && !st.cure.reveal && safe.role === 'plague') delete safe.card;
    if (safe.country && v.countries[safe.country] && v.countries[safe.country].hidden) delete safe.country;
    return safe;
  });
  return v;
}

module.exports = { WORLD, PLAGUE_CARDS, CURE_CARDS, TUNE, createGame, legalMoves, apply, viewFor, tick, sum,
  meta: { name: '瘟疫对局', minPlayers: 2, maxPlayers: 2, roles: ['plague', 'cure'] } };
