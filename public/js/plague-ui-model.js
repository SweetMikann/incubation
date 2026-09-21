(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlagueUIModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STAGE_RANK = { early:0, response:1, late:2, deployment:3 };
  const STAGE_NAME = { early:'早期侦察', response:'疫情应对', late:'解药攻坚', deployment:'全球部署' };

  function cardAvailability(card, ctx) {
    const owned = ctx.owned || [];
    const count = owned.filter((id) => id === card.id).length;
    const name = (id) => (ctx.list.find((item) => item.id === id) || {}).name || id;
    if ((count && !card.repeat) || (card.maxBuys && count >= card.maxBuys)) return { kind:'done', label:'已完成' };
    if (card.requires) {
      const missing = card.requires.filter((id) => !owned.includes(id));
      if (missing.length) return { kind:'prereq', label:'缺少前置：' + missing.map(name).join('、') };
    }
    if (card.requiresAny && !card.requiresAny.some((id) => owned.includes(id))) {
      return { kind:'prereq', label:'需要其一：' + card.requiresAny.map(name).join('／') };
    }
    if (ctx.side === 'cure') {
      const lastDay = card.id === 'sequence' ? ctx.cure.lastSequenceDay
        : card.id === 'publicHealth' ? ctx.cure.lastPublicHealthDay : null;
      if (lastDay != null && ctx.day - lastDay < 3) return { kind:'cooldown', label:`冷却剩 ${3 - (ctx.day - lastDay)} 天` };
      if ((card.awareness || 0) > (ctx.cure.awareness || 0)) return { kind:'awareness', label:`察觉不足：需要 ${card.awareness}` };
      if (card.stage === 'deployment' && !ctx.cure.deploying) return { kind:'stage', label:'阶段未到：需要完成研究' };
      const monitoredPort = ctx.cure.watch && ['closeAir','closePort'].includes(card.id);
      if (!monitoredPort && STAGE_RANK[ctx.cure.stage] < STAGE_RANK[card.stage || 'early']) return { kind:'stage', label:'阶段未到：' + STAGE_NAME[card.stage] };
    }
    if (!ctx.myTurn) return { kind:'waiting', label:'等待你的回合' };
    if (card.cost > ctx.pool) return { kind:'shortage', label:`点数不足：还差 ${card.cost - ctx.pool}` };
    if (!ctx.legal.length) return { kind:'unavailable', label:card.kind === 'country' ? '暂无合适国家' : '当前不可用' };
    return { kind:'ready', label:`${card.cost} 点` };
  }

  function effectSummary(card) {
    const eff = card.eff || {};
    const labels = {
      infectivity:'传播', lethality:'致命', air:'航空传播', sea:'海运传播', land:'陆路传播',
      urbanBonus:'城市传播', ruralBonus:'乡村传播', hotBonus:'热带传播', coldBonus:'寒带传播', poorBonus:'贫穷地区传播',
      resHeat:'耐热', resCold:'耐寒', resDrug:'抗药', cureSlow:'研究减速', cureBack:'解药倒退',
      reservoir:'潜伏宿主', corpse:'尸体传播', escape:'免疫逃逸', spread:'传播', research:'研究',
      deploySpeed:'部署速度', vigilance:'察觉', sequence:'停研解除', rollbackShield:'倒退抵消次数', reveal:'病原信息', watch:'全球监测'
    };
    const gains = Object.entries(eff).filter(([key]) => key !== 'severity').map(([key,value]) => {
      if(typeof value==='number') value=Number(value.toFixed(2));
      if (key === 'cureBack') return `${labels[key]} ${value}%`;
      return `${labels[key] || key}${typeof value === 'number' ? ` +${value}` : ''}`;
    });
    const tradeoff = eff.severity ? `暴露度 +${eff.severity}` : '无额外暴露';
    return { gain:gains.join(' · ') || card.desc, tradeoff };
  }

  function countryRecommendation(cardId, move, world, countries) {
    const meta = world.find((item) => item.id === move.country);
    const country = countries[move.country];
    if (!meta || !country) return { move, score:-Infinity, reason:'资料不足' };
    if (country.hidden) return { move, score:-1e15, reason:'疫情未公开' };
    const alive = country.healthy + country.vaccinated + country.infected;
    const workforce = meta.pop ? Math.max(0, Math.min(1, (country.healthy + country.vaccinated + country.infected * .25) / meta.pop)) : 0;
    const aliveRatio = meta.pop ? alive / meta.pop : 0;
    let score = country.infected + country.dead, reason = `疫情负担 ${compact(country.infected + country.dead)}`;
    if (cardId === 'fieldLab') {
      score = meta.research * workforce;
      reason = `研究贡献 ${meta.research} · 可用劳动力 ${Math.round(workforce * 100)}%`;
    } else if (cardId === 'rescue') {
      score = (country.collapsed ? 1e9 : 0) + (1 - aliveRatio) * 1e6 + country.dead;
      reason = country.collapsed ? `政府已崩溃 · 可恢复研究能力` : `崩溃风险较高 · 存活 ${Math.round(aliveRatio * 100)}%`;
    } else if (cardId === 'care') {
      score = country.infected * 1.2 + country.dead;
      reason = `感染 ${compact(country.infected)} · 立即减死亡并治疗`;
    } else if (cardId === 'quarant') {
      score = country.infected;
      reason = `感染 ${compact(country.infected)} · 五天降低本地传播`;
    } else if (cardId === 'vaccine') {
      score = country.healthy;
      reason = `可保护健康人口 ${compact(country.healthy)}`;
    } else if (cardId === 'closeAir') {
      score = country.healthy + country.vaccinated;
      reason = `航空口岸开放 · 可保护 ${compact(score)} 人`;
    } else if (cardId === 'closePort') {
      score = country.healthy + country.vaccinated;
      reason = `海运口岸开放 · 可保护 ${compact(score)} 人`;
    } else if (cardId === 'closeLand') {
      score = country.healthy + country.infected;
      reason = `陆路边境开放 · 当前感染 ${compact(country.infected)}`;
    }
    return { move, score, reason };
  }

  function rankCountries(cardId, moves, world, countries, mode = 'recommended') {
    return moves.map((move) => countryRecommendation(mode === 'burden' ? null : cardId, move, world, countries))
      .sort((a,b) => b.score - a.score || world.findIndex(x=>x.id===a.move.country)-world.findIndex(x=>x.id===b.move.country));
  }

  function compact(value) {
    if (value >= 10000) return `${Number((value / 10000).toFixed(value >= 100000 ? 1 : 2))}亿`;
    return `${Math.round(value)}万`;
  }

  return { cardAvailability, effectSummary, countryRecommendation, rankCountries };
});
