'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const e = require('../engines/plague.cjs');

function play(st, role, move) { return e.apply(st, role, move).state; }
function totals(st, key) { return e.sum(st, key); }

test('开局：只有一个国家有感染者，两边各有起手资源', () => {
  const st = e.createGame({ seed: 1, startCountry: 'in' });
  const infected = Object.values(st.countries).filter((c) => c.infected > 0);
  assert.equal(infected.length, 1);
  assert.equal(infected[0].id, 'in');
  assert.equal(st.phase, 'plague');
  assert.equal(st.actionsLeft, 2);
  assert(st.plague.dna > 0 && st.cure.rp > 0);
});

test('轮次：瘟疫两步走完轮到人类，人类走完才过一天', () => {
  let st = e.createGame({ seed: 2, startCountry: 'cn' });
  st = play(st, 'plague', { type: 'pass' });
  assert.equal(st.phase, 'cure');
  assert.equal(st.day, 1, '人类还没动，天数不该涨');
  st = play(st, 'cure', { type: 'pass' });
  assert.equal(st.phase, 'plague');
  assert.equal(st.day, 2);
});

test('不是自己的回合不许动', () => {
  const st = e.createGame({ seed: 3, startCountry: 'cn' });
  assert.throws(() => e.apply(st, 'cure', { type: 'pass' }), /还没轮到/);
});

test('买不起就不是合法动作，硬买要报错', () => {
  const st = e.createGame({ seed: 4, startCountry: 'cn' });
  st.plague.dna = 5;
  st.plague.owned.push('coma');
  const legal = e.legalMoves(st, 'plague');
  assert(!legal.some((m) => m.card === 'failure'), '16 点的卡不该出现在 5 DNA 的清单里');
  assert.throws(() => e.apply(st, 'plague', { type: 'buy', card: 'failure' }), /DNA 不够/);
});

test('进化树遵守前置，基因重排只有三个一次性阶段', () => {
  let st = e.createGame({ seed: 5, startCountry: 'cn' });
  st.plague.dna = 100;
  st = play(st, 'plague', { type: 'buy', card: 'air' });
  assert.throws(() => e.apply(st, 'plague', { type: 'buy', card: 'air' }), /已经进化过/);
  assert(!e.legalMoves(st, 'plague').some((m) => m.card === 'shuffle'), '没抗药性不能重排');
  st.plague.owned.push('drug');
  st.phase = 'plague'; st.actionsLeft = 2;
  st = play(st, 'plague', { type: 'buy', card: 'shuffle' });
  st.phase = 'plague'; st.actionsLeft = 2;
  assert.throws(() => play(st, 'plague', { type: 'buy', card: 'shuffle' }), /已经进化/);
  st = play(st, 'plague', { type: 'buy', card: 'shuffle2' });
  st.phase = 'plague'; st.actionsLeft = 2;
  st = play(st, 'plague', { type: 'buy', card: 'shuffle3' });
  assert(!e.legalMoves(Object.assign(st, { phase:'plague', actionsLeft:2 }), 'plague').some((m) => /^shuffle/.test(m.card)));
});

test('视图给出真实的下一次价格和每日点数收入', () => {
  let st = e.createGame({ seed: 51, startCountry: 'cn' });
  let view = e.viewFor(st, 'plague');
  assert.deepEqual(view.plague.dailyIncome, { min: 2, max: 3 });
  assert.equal(view.plagueCards.find((c) => c.id === 'shuffle').cost, 14);
  st.plague.dna = 100; st.plague.owned.push('drug');
  st = play(st, 'plague', { type: 'buy', card: 'shuffle' });
  view = e.viewFor(st, 'plague');
  assert.equal(view.plagueCards.find((c) => c.id === 'shuffle2').cost, 22);
  assert.equal(typeof e.viewFor(st, 'cure').cure.dailyIncome, 'number');
});

test('传到一个新国家奖励 DNA', () => {
  const st = e.createGame({ seed: 52, startCountry: 'cn' });
  st.plague.land = 20;
  st.plague.dnaMilestones = [100];
  st.countries.cn.infected = 100;
  const before = st.plague.dna;
  e.tick(st);
  const seeded = Object.values(st.countries).filter((c) => c.id !== 'cn' && c.infected > 0).length;
  assert(seeded > 0, '高陆路传播应至少传到一个邻国');
  const spreadLogs = st.log.filter((l) => l.type === 'spread');
  assert.equal(spreadLogs.length, 1, '同一天跨国传播应合并成一条引擎通报');
  assert.equal(spreadLogs[0].countries.length, seeded, '合并通报要带齐新感染国家列表');
  const cureSpread = e.viewFor(st, 'cure').log.find((l) => l.type === 'spread');
  assert.equal(cureSpread.countries.length, 0, '人类视角不能从国家列表偷看雾中目标');
  assert.equal(cureSpread.hiddenCount, seeded);
  const dailyMax = e.viewFor(st, 'plague').plague.dailyIncome.max;
  assert(st.plague.dna >= before + seeded + 2 && st.plague.dna <= before + seeded + dailyMax);
});

test('关了机场就不该再有人从那儿飞出去', () => {
  const st = e.createGame({ seed: 6, startCountry: 'jp' });
  st.cure.rp = 50;
  st.day = 10;
  st.phase = 'cure';                       // 合法动作只在自己的回合里给
  const legal = e.legalMoves(st, 'cure');
  assert(legal.some((m) => m.card === 'closeAir' && m.country === 'gl'));
  const after = play(st, 'cure', { type: 'buy', card: 'closeAir', country: 'gl' });
  assert.equal(after.countries.gl.closedAir, true);
  const again = e.legalMoves(Object.assign(after, { phase: 'cure', actionsLeft: 2 }), 'cure');
  assert(!again.some((m) => m.card === 'closeAir' && m.country === 'gl'), '关过的机场不该再出现');
});

test('格陵兰把两个口岸都关了，空气水路都进不去', () => {
  let st = e.createGame({ seed: 7, startCountry: 'cn' });
  st.plague.air = 5; st.plague.sea = 5; st.plague.resCold = 1;
  st.countries.cn.infected = 50000;
  st.countries.gl.closedAir = true;
  st.countries.gl.closedSea = true;
  for (let i = 0; i < 40; i++) e.tick(st);
  assert.equal(st.countries.gl.infected, 0, '关死了口岸的格陵兰不该被感染');
});

test('疫苗护住人，但免疫会退', () => {
  let st = e.createGame({ seed: 8, startCountry: 'in' });
  st.phase = 'cure'; st.cure.rp = 50; st.cure.progress = 60;
  st = play(st, 'cure', { type: 'buy', card: 'vaccine', country: 'us' });
  const dosed = st.countries.us.vaccinated;
  assert(dosed > 0);
  e.tick(st);
  assert(st.countries.us.vaccinated < dosed, '每天都该有人的免疫退掉');
});

test('免疫逃逸让一半接种者重新变回易感', () => {
  let st = e.createGame({ seed: 9, startCountry: 'cn' });
  st.countries.us.vaccinated = 1000;
  st.countries.us.healthy = 100;
  st.plague.dna = 50; st.plague.owned.push('drug', 'hard1');
  st = play(st, 'plague', { type: 'buy', card: 'escape' });
  assert.equal(st.countries.us.vaccinated, 500);
  assert.equal(st.countries.us.healthy, 600);
});

test('基因重排把解药打回去并停研，但不再无限叠减速', () => {
  let st = e.createGame({ seed: 10, startCountry: 'cn' });
  st.cure.progress = 30; st.plague.dna = 50; st.plague.owned.push('drug');
  st = play(st, 'plague', { type: 'buy', card: 'shuffle' });
  assert.equal(st.cure.progress, 25.5);
  assert.equal(st.cure.cureSlow, 0);
  assert.equal(st.cure.paused, 1);
});

test('普通进化不停研；抗解药进化停研且当天不会偷偷涨回来', () => {
  let st = e.createGame({ seed: 101, startCountry: 'cn' });
  st.cure.progress = 50; st.cure.research = 20; st.countries.cn.known = true;
  st.plague.dna = 100;
  st = play(st, 'plague', { type:'buy', card:'cough' });
  assert.equal(st.cure.paused, 0, '普通症状不该停研');
  st.phase = 'plague'; st.actionsLeft = 2; st.plague.owned.push('drug');
  st = play(st, 'plague', { type: 'buy', card: 'shuffle' });
  assert.equal(st.cure.progress, 42.5);
  st = play(st, 'plague', { type: 'pass' });
  st = play(st, 'cure', { type: 'pass' });
  assert.equal(st.cure.progress, 42.5, '当天应完全停研，不能把刚打掉的进度又涨回来');
  assert.equal(st.cure.paused, 0);
});

test('抗药性和免疫逃逸都会明确打退解药', () => {
  let drug = e.createGame({ seed: 102, startCountry: 'cn' });
  drug.cure.progress = 30; drug.plague.dna = 50;
  drug = play(drug, 'plague', { type: 'buy', card: 'drug' });
  assert.equal(drug.cure.progress, 27);
  let escape = e.createGame({ seed: 103, startCountry: 'cn' });
  escape.cure.progress = 30; escape.plague.dna = 50; escape.plague.owned.push('drug', 'hard1');
  escape = play(escape, 'plague', { type: 'buy', card: 'escape' });
  assert.equal(escape.cure.progress, 25.5);
});

test('解药做满进入部署期，部署完成才赢', () => {
  const st = e.createGame({ seed: 11, startCountry: 'cn' });
  st.cure.progress = 99.9; st.cure.research = 20; st.cure.fieldResponse = 1; st.plague.severity = 4;
  st.countries.in.infected = 100; st.countries.in.known = true;
  e.tick(st);
  assert.equal(st.done, false);
  assert.equal(st.cure.deploying, true);
  assert(st.cure.deployment > 0);
  st.cure.deployment = 99;
  e.tick(st);
  assert.equal(st.done, true);
  assert.equal(st.winner, 'cure');
});

test('人全没了就是瘟疫赢', () => {
  const st = e.createGame({ seed: 12, startCountry: 'cn' });
  for (const c of Object.values(st.countries)) { c.dead = c.healthy + c.infected; c.healthy = 0; c.infected = 0; c.vaccinated = 0; }
  st.countries.in.infected = 1;
  e.tick(st);
  assert.equal(st.winner, 'plague');
});

test('死了九成九不许判人类赢（只剩零头就是输）', () => {
  const st = e.createGame({ seed: 13, startCountry: 'cn' });
  const pop = st.worldPop;
  for (const c of Object.values(st.countries)) { c.dead = c.healthy; c.healthy = 0; }
  st.countries.gl.healthy = 5;          // 全世界只剩五万人
  st.countries.in.infected = 10;
  e.tick(st);
  assert.equal(st.done, true);
  assert.equal(st.winner, 'plague');
  assert(st.result.dead / pop > 0.9);
});

test('到两百天按战果判：没死够就算人类赢', () => {
  const st = e.createGame({ seed: 14, startCountry: 'cn' });
  st.day = 200;
  st.countries.in.infected = 100;
  e.tick(st);
  assert.equal(st.winner, 'cure');
});

test('人类看不见瘟疫的家底，做了溯源检测才看得见', () => {
  let st = e.createGame({ seed: 15, startCountry: 'cn' });
  st.plague.dna = 42;
  let v = e.viewFor(st, 'cure');
  assert.equal(v.plague.hidden, true);
  assert.equal(v.plague.dna, null);
  assert.equal(e.viewFor(st, 'plague').plague.dna, 42);
  st.phase = 'cure'; st.cure.rp = 50; st.plague.severity = 2;
  st = play(st, 'cure', { type: 'buy', card: 'detect' });
  v = e.viewFor(st, 'cure');
  assert.equal(v.plague.dna, 42, '检测之后就该看得见了');
});

test('结束之后谁也别想再走一步', () => {
  const st = e.createGame({ seed: 16, startCountry: 'cn' });
  st.done = true;
  assert.throws(() => e.apply(st, 'plague', { type: 'pass' }), /结束/);
  assert.deepEqual(e.legalMoves(st, 'plague'), []);
});

test('两个会玩的机器人对打：两边都赢得到，且都能在两百天内分出胜负', () => {
  const {scan}=require('../scripts/balance.cjs');
  const games = Math.max(1, Number(process.env.PLAGUE_BALANCE_GAMES) || 20);
  const {spendy,thrifty}=scan(games);
  if (process.env.PLAGUE_BALANCE_REPORT) console.log('BALANCE ' + JSON.stringify({ games, spendy, thrifty }));
  assert(spendy.plagueWins / games >= 0.3, '乱花钱的人类都赢，瘟疫没牙了：' + JSON.stringify(spendy));
  assert(thrifty.cureWins / games >= 0.3, '省着花的人类也赢不了，人类没路了：' + JSON.stringify(thrifty));
  assert(spendy.cureWins / games <= 0.55, '乱花人类胜率过高：' + JSON.stringify(spendy));
  assert(thrifty.cureWins / games <= 0.75, '节俭人类胜率过高：' + JSON.stringify(thrifty));
});

test('开局第一步是瘟疫自己挑投放的国家', () => {
  const st = e.createGame({ seed: 21 });          // 不指定 startCountry
  assert.equal(st.phase, 'seed');
  assert.equal(Object.values(st.countries).every((c) => c.infected === 0), true, '还没投放就不该有感染者');
  assert.equal(e.legalMoves(st, 'plague').length, e.WORLD.length, '十五个国家随便挑');
  assert.deepEqual(e.legalMoves(st, 'cure'), [], '这一步人类插不上手');
  assert.throws(() => e.apply(st, 'cure', { type: 'pass' }), /等瘟疫/);
  assert.throws(() => e.apply(st, 'plague', { type: 'pass' }), /先选一个国家/);

  const after = e.apply(st, 'plague', { type: 'seed', country: 'gl' }).state;
  assert.equal(after.countries.gl.infected, 1);
  assert.equal(after.phase, 'plague');
  assert.equal(after.actionsLeft, 2);
  assert.equal(after.day, 1, '投放不占一天');
  assert.match(after.log[after.log.length - 1].text, /格陵兰/);
});

test('指定了起手国家就不进投放阶段（机器人对打、老存档照跑）', () => {
  const st = e.createGame({ seed: 22, startCountry: 'in' });
  assert.equal(st.phase, 'plague');
  assert.equal(st.countries.in.infected, 1);
});

test('战争迷雾：没公开疫情的国家，人类看不见里面的数字', () => {
  const st = e.createGame({ seed: 31, startCountry: 'in' });
  const cure = e.viewFor(st, 'cure');
  assert.equal(cure.countries.in.hidden, true);
  assert.equal(cure.countries.in.infected, null, '人类不该看见零号病人在哪');
  assert.equal(cure.countries.in.dead, null);
  assert.equal(cure.countries.in.healthy, null);
  assert.equal(cure.totals.infected, 1, '全球总数照给：知道世界上出事了，但不知道在哪');
  // 自己做的措施要看得见，不然没法管
  assert.equal(cure.countries.in.closedAir, false);
  const plague = e.viewFor(st, 'plague');
  assert.equal(plague.countries.in.infected, 1, '瘟疫看自己的局当然是全的');
});

test('国家一公开疫情，人类立刻看得见那个国家', () => {
  const st = e.createGame({ seed: 32, startCountry: 'in' });
  st.countries.in.known = true;
  const cure = e.viewFor(st, 'cure');
  assert.equal(cure.countries.in.hidden, undefined);
  assert.equal(cure.countries.in.infected, 1);
});

test('买了全球监测网，雾就散了', () => {
  let st = e.createGame({ seed: 33, startCountry: 'in' });
  st.phase = 'cure'; st.cure.rp = 50; st.plague.severity = 4;
  assert.equal(e.viewFor(st, 'cure').countries.in.hidden, true);
  st = e.apply(st, 'cure', { type: 'buy', card: 'watch' }).state;
  const cure = e.viewFor(st, 'cure');
  assert.equal(cure.countries.in.hidden, undefined);
  assert.equal(cure.countries.in.infected, 1, '花了钱就该看得见');
});

test('围观的人也隔着雾看：拿邀请链接进来的第三个人不能替人类掀雾', () => {
  const st = e.createGame({ seed: 7, startCountry: 'in' });
  const w = e.viewFor(st, 'watch');
  const hidden = Object.values(w.countries).filter((c) => c.hidden);
  assert(hidden.length > 0, '围观视角该有被雾遮住的国家');
  assert.equal(w.plague.dna, null, '围观也看不见瘟疫的 DNA');
});

test('疫情通报不许把雾里的国家名念出来（人类/围观只看到「某个国家」）', () => {
  const st = e.createGame({ seed: 11, startCountry: 'in' });
  const cure = e.viewFor(st, 'cure');
  assert(cure.log.every((l) => !l.text.includes('印度')), '人类的通报里不该出现印度');
  assert(cure.log.some((l) => l.text.includes('某个国家')), '该换成「某个国家」');
  const plague = e.viewFor(st, 'plague');
  assert(plague.log.some((l) => l.text.includes('印度')), '瘟疫自己当然看得见');
});

test('没做溯源检测，人类看不见瘟疫进化了什么；做了就看得见', () => {
  const st = e.createGame({ seed: 5, startCountry: 'in' });
  const s1 = e.apply(st, 'plague', { type: 'buy', card: 'cough' }).state;
  const blind = e.viewFor(s1, 'cure');
  assert(blind.log.some((l) => l.text.includes('悄悄进化')), '该只说进化了一项');
  assert(!blind.log.some((l) => l.text.includes('咳嗽')), '不该念出名字');
  assert(e.viewFor(s1, 'plague').log.some((l) => l.text.includes('咳嗽')), '瘟疫自己看得见');
  const s2 = Object.assign({}, s1, { cure: Object.assign({}, s1.cure, { reveal: 1 }) });
  assert(e.viewFor(s2, 'cure').log.some((l) => l.text.includes('咳嗽')), '溯源之后看得见');
});

test('基因强化永久拖慢解药研究', () => {
  const st = e.createGame({ seed: 3, startCountry: 'in' });
  st.plague.dna = 30; st.plague.owned.push('drug');
  const s1 = e.apply(st, 'plague', { type: 'buy', card: 'hard1' }).state;
  assert.equal(s1.cure.cureSlow, 1);
});

test('就地隔离/特效药三天到期、到期后能再选；死光的国家不进目标列表（她 9/5 16:58 抓的）', () => {
  const st = e.createGame({ seed: 6, startCountry: 'cn' });
  st.cure.rp = 200; st.phase = 'cure'; st.actionsLeft = 2; st.day = 10;
  const after = play(st, 'cure', { type: 'buy', card: 'care', country: 'cn' });
  assert.equal(after.countries.cn.care, 3);
  assert.throws(() => play(Object.assign(after, { phase: 'cure', actionsLeft: 2 }), 'cure', { type: 'buy', card: 'care', country: 'cn' }), /还在生效/);
  let s2 = after;
  for (let i = 0; i < 3; i++) e.tick(s2);
  assert.equal(s2.countries.cn.care, 0, '三天过完该到期');
  Object.assign(s2, { phase: 'cure', actionsLeft: 2, cure: Object.assign(s2.cure, { rp: 200 }) });
  assert(e.legalMoves(s2, 'cure').some((m) => m.card === 'care' && m.country === 'cn'), '到期后中国该重新出现');
  // 死光的国家：一张国家卡都不该给
  s2.countries.de.healthy = 0; s2.countries.de.vaccinated = 0; s2.countries.de.infected = 0; s2.countries.de.dead = 9999;
  s2.countries.de.known = true; s2.countries.us.known = true;   // 这两条过滤只对掀了雾的国家生效
  const legal = e.legalMoves(s2, 'cure');
  assert(!legal.some((m) => m.country === 'de'), '死光的德国不该在任何列表里');
  assert.throws(() => play(s2, 'cure', { type: 'buy', card: 'care', country: 'de' }), /没有人了/);
  // 没有病人的国家：隔离/特效药没意义，不列；关机场照样能关
  const clean = legal.filter((m) => m.country === 'us');
  assert(!clean.some((m) => m.card === 'care' || m.card === 'quarant'), '美国还没病人，隔离/特效药不该列');
});

test('雾里的国家不许被合法动作列表漏出来：第 1 天隔离/特效药对所有国家都列（第四局我自己踩的）', () => {
  const st = e.createGame({ seed: 9, startCountry: 'eg' });
  st.cure.rp = 200; st.phase = 'cure'; st.actionsLeft = 2; st.day = 10;
  const hiddenMoves = e.legalMoves(st, 'cure').filter((m) => m.card === 'quarant');
  const qs = hiddenMoves.map((m) => m.country);
  assert.equal(qs.length, e.WORLD.length, '雾没掀之前，隔离该对每个国家都列，否则就等于告诉人类瘟疫在哪');
  assert(hiddenMoves.every((m) => m.targetInfected === null), '雾中合法动作不能携带感染排序值');
  st.cure.watch = 1;
  st.countries.cn.infected = 900; st.countries.cn.healthy -= 900;
  st.countries.in.infected = 100; st.countries.in.healthy -= 100;
  const qs2 = e.legalMoves(st, 'cure').filter((m) => m.card === 'quarant').map((m) => m.country);
  assert.deepEqual(qs2, ['cn','in','eg'], '掀了雾后，引擎应直接按感染数从高到低给国家列表');
});
