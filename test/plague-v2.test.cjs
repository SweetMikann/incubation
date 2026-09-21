'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const e = require('../engines/plague.cjs');

test('176 个国家全部进入引擎，并带齐策略字段', () => {
  assert.equal(e.WORLD.length, 176);
  for (const m of e.WORLD) {
    assert(m.iso && m.name && m.pop > 0);
    assert(['hot', 'cold', 'temperate'].includes(m.climate));
    assert(['rich', 'middle', 'poor'].includes(m.wealth));
    assert(Number.isFinite(m.research) && Array.isArray(m.land));
  }
});

test('国家死亡和崩溃会真实降低解药研究贡献', () => {
  const healthy = e.createGame({ seed: 201, startCountry: 'cn' });
  for (const c of Object.values(healthy.countries)) c.known = true;
  healthy.cure.research = 2;
  const broken = JSON.parse(JSON.stringify(healthy));
  for (const m of e.WORLD.filter((x) => x.research >= 8)) {
    const c = broken.countries[m.id], killed = Math.floor(m.pop * 0.75);
    c.dead = killed; c.healthy = Math.max(0, m.pop - killed); c.infected = 0;
  }
  e.tick(healthy); e.tick(broken);
  assert(broken.cure.progress < healthy.cure.progress * 0.75,
    `研究国崩溃后仍太快：健康 ${healthy.cure.progress}，崩溃 ${broken.cure.progress}`);
  assert(Object.values(broken.countries).some((c) => c.collapsed));
});

test('特效药会实际治疗感染者，不再只是减死亡', () => {
  const st = e.createGame({ seed: 202, startCountry: 'cn' });
  st.day = 10; st.phase = 'cure'; st.cure.rp = 100;
  st.countries.cn.infected = e.WORLD.find((m) => m.id === 'cn').pop;
  st.countries.cn.healthy = 0;
  const treated = e.apply(st, 'cure', { type:'buy', card:'care', country:'cn' }).state;
  const before = treated.countries.cn.infected;
  e.tick(treated);
  assert(treated.countries.cn.infected < before);
  assert(treated.countries.cn.healthy > 0);
});

test('后期双方都还有多条不同类型的行动路线', () => {
  const st = e.createGame({ seed: 203, startCountry: 'cn' });
  st.day = 45; st.plague.dna = 999; st.cure.rp = 999; st.cure.progress = 65;
  st.phase = 'plague';
  st.plague.owned.push('air','water','rodent','insect','blood','bird','livestock','cough','nausea','rash','insomnia','anemia','heat','cold','drug');
  const plagueChoices = new Set(e.legalMoves(st, 'plague').filter((m) => m.type === 'buy').map((m) => m.card));
  assert(plagueChoices.size >= 15, `瘟疫后期只有 ${plagueChoices.size} 种牌`);
  st.phase = 'cure';
  const cureChoices = new Set(e.legalMoves(st, 'cure').filter((m) => m.type === 'buy').map((m) => m.card));
  assert(cureChoices.size >= 9, `人类后期只有 ${cureChoices.size} 种牌`);
});

test('买完基础树后 DNA 仍有三个可重复且涨价的出口', () => {
  let st = e.createGame({ seed: 204, startCountry: 'cn' });
  st.plague.dna = 1069;
  st.plague.owned = e.PLAGUE_CARDS.filter((card) => !card.repeat).map((card) => card.id);
  let legal = new Set(e.legalMoves(st, 'plague').filter((m) => m.type === 'buy').map((m) => m.card));
  assert(legal.has('spreadSurge') && legal.has('lethalSurge') && legal.has('antigenDrift'));
  const first = e.viewFor(st, 'plague').plagueCards.find((card) => card.id === 'spreadSurge').cost;
  st = e.apply(st, 'plague', { type:'buy', card:'spreadSurge' }).state;
  const second = e.viewFor(st, 'plague').plagueCards.find((card) => card.id === 'spreadSurge').cost;
  assert(second > first);
});

test('高阶传播留下潜伏宿主，感染归零时不会在解药未完成前自烧光', () => {
  const st = e.createGame({ seed:205, startCountry:'cn' });
  for (const c of Object.values(st.countries)) { c.healthy += c.infected; c.infected = 0; }
  st.plague.reservoir = 1; st.cure.progress = 66;
  e.tick(st);
  assert.equal(st.done, false);
  assert(e.sum(st, 'infected') > 0);
  assert.equal(st.plague.reservoir, 0);
  assert(st.log.some((entry) => entry.text.includes('复燃')));
});

test('无症状时不能提前建研究所，严重度和公开疫情共同打开解药线', () => {
  const st = e.createGame({ seed:206, startCountry:'cn' });
  st.phase = 'cure'; st.cure.rp = 100; st.cure.research = 20;
  let view = e.viewFor(st, 'cure');
  assert.equal(view.cure.researchOpen, false);
  assert(!view.legal.some((move) => move.card === 'lab'));
  const before = st.cure.progress;
  e.tick(st);
  assert.equal(st.cure.progress, before, '无人关注时解药不该自己增长');
  st.plague.severity = 4; st.countries.cn.known = true; st.phase = 'cure';
  view = e.viewFor(st, 'cure');
  assert.equal(view.cure.researchOpen, true);
  assert(view.legal.some((move) => move.card === 'lab'));
});

test('严重度和解药里程碑会生成一次性全球新闻', () => {
  const st = e.createGame({ seed:207, startCountry:'cn' });
  st.plague.severity = 9; st.countries.cn.known = true; st.cure.progress = 49; st.cure.research = 5;
  e.tick(st);
  const text = st.news.map((item) => item.text).join('|');
  assert.match(text, /紧急会议/);
  assert.match(text, /研究过半/);
  const count = st.news.length;
  e.tick(st);
  assert(st.news.length >= count);
  assert.equal(st.news.filter((item) => item.key === 'severity-8').length, 1);
});

test('只有抗解药进化会停研，且同一天最多记一次暂停', () => {
  let st = e.createGame({ seed:208, startCountry:'cn' });
  st.plague.dna = 200;
  st = e.apply(st, 'plague', { type:'buy', card:'cough' }).state;
  assert.equal(st.cure.paused, 0);
  st.plague.owned.push('drug'); st.actionsLeft = 2;
  st = e.apply(st, 'plague', { type:'buy', card:'shuffle' }).state;
  assert.equal(st.cure.paused, 1);
  st.actionsLeft = 2;
  st = e.apply(st, 'plague', { type:'buy', card:'hard1' }).state;
  assert.equal(st.cure.paused, 1);
  assert.equal(st.cure.lastPauseDay, st.day);
});

test('前期感染里程碑发一次性 DNA，不会每天重复刷', () => {
  const st = e.createGame({ seed:209, startCountry:'cn' });
  st.plague.severity = 1;
  st.countries.cn.infected = 120; st.countries.cn.healthy -= 119;
  const before = st.plague.dna;
  e.tick(st);
  assert(st.plague.dna >= before + 6, '应含 4 点里程碑和至少 2 点日收入');
  assert.deepEqual(st.plague.dnaMilestones, [100]);
  const after = st.plague.dna;
  e.tick(st);
  assert(st.plague.dna < after + 8, '第二天不该重复发 4 点里程碑');
});

test('地方应对奖励主动玩法，但不是解药完成的第二道硬门槛', () => {
  const passive = e.createGame({ seed:210, startCountry:'cn' });
  passive.plague.severity = 12; passive.cure.research = 6;
  for (const id of ['cn','in','us','br']) {
    const c = passive.countries[id]; c.known = true; c.infected = Math.min(c.healthy, 1000); c.healthy -= c.infected;
  }
  const active = JSON.parse(JSON.stringify(passive));
  for (const id of ['cn','in','us','br']) active.countries[id].quarantine = 3;
  e.tick(passive); e.tick(active);
  assert(active.cure.progress > passive.cure.progress * 1.08,
    `前线应对应有温和加成：被动 ${passive.cure.progress}，主动 ${active.cure.progress}`);
  assert(e.viewFor(passive, 'cure').cure.responseCoverage < e.viewFor(active, 'cure').cure.responseCoverage);
  passive.cure.progress = 99.9;
  e.tick(passive);
  assert.equal(passive.cure.deploying, true, '研究开闸后，即使没有地方卡也不该被硬卡在 80%');
});

test('late 牌继续锁定在解药 55% 或死亡 12%，不提前开放', () => {
  const st = e.createGame({ seed:211, startCountry:'cn' });
  st.day = 8;
  st.cure.progress = 54.9;
  assert.equal(e.viewFor(st, 'cure').cure.stage, 'response');
  st.cure.progress = 55;
  assert.equal(e.viewFor(st, 'cure').cure.stage, 'late');
  st.cure.progress = 0;
  st.countries.cn.dead = Math.ceil(st.worldPop * 0.12);
  assert.equal(e.viewFor(st, 'cure').cure.stage, 'late');
});
