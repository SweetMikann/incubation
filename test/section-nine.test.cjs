'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const e=require('../engines/plague.cjs');
const game=()=>e.createGame({seed:911,startCountry:'cn'});
function buy(st,role,card,country){st.phase=role;st.actionsLeft=2;return e.apply(st,role,{type:'buy',card,...(country?{country}:{})}).state;}

test('IX.1: second-tier transmission is 60 percent and legacy saves migrate only once',()=>{
 let st=game();st.plague.dna=100;st=buy(st,'plague','air');
 const before=st.plague.infectivity;st=buy(st,'plague','air2');
 assert(Math.abs(st.plague.infectivity-before-1.2)<1e-9);
 assert.equal(e.viewFor(st,'plague').plagueCards.find(c=>c.id==='air2').eff.air,1.2);
 const old=game();delete old.plague.transmissionTier2Scaled;old.plague.owned=['air','air2'];old.plague.infectivity=6;old.plague.air=3;
 const migrated=buy(old,'plague','cough');assert.equal(migrated.plague.air,2.2);
 const next=JSON.parse(JSON.stringify(migrated));e.tick(next);assert.equal(next.plague.air,2.2);
});

test('IX.1: symptom-free milestones give no DNA and never pay retroactively',()=>{
 const st=game();st.countries.cn.infected=20000;st.countries.cn.healthy-=19999;
 const paid=JSON.parse(JSON.stringify(st));paid.plague.dnaMilestones=[100,1000,10000];
 e.tick(st);e.tick(paid);assert.equal(st.plague.dna,paid.plague.dna);
 assert.deepEqual(st.plague.dnaMilestones,[100,1000,10000]);
 assert(st.log.filter(x=>x.key?.startsWith('infected-')).every(x=>x.text.includes('无症状不发放')));
 st.plague.severity=paid.plague.severity=1;e.tick(st);e.tick(paid);assert.equal(st.plague.dna,paid.plague.dna);
 const symptomatic=game();symptomatic.plague.severity=1;symptomatic.countries.cn.infected=20000;symptomatic.countries.cn.healthy-=19999;
 const spent=JSON.parse(JSON.stringify(symptomatic));spent.plague.dnaMilestones=[100,1000,10000];
 e.tick(symptomatic);e.tick(spent);assert.equal(symptomatic.plague.dna-spent.plague.dna,15);
});

test('IX.1: stacked asymptomatic infectivity hits its effective cap, symptoms lift the cap',()=>{
 const high=game();high.plague.infectivity=100;
 const capped=JSON.parse(JSON.stringify(high));capped.plague.infectivity=e.TUNE.asymptomaticInfectivityCap;
 assert.equal(e.viewFor(high,'plague').plague.effectiveInfectivity,e.TUNE.asymptomaticInfectivityCap);
 e.tick(high);e.tick(capped);assert.equal(high.countries.cn.infected,capped.countries.cn.infected);
 const visible=game();visible.plague.infectivity=100;visible.plague.severity=1;
 const limited=JSON.parse(JSON.stringify(visible));limited.plague.infectivity=e.TUNE.asymptomaticInfectivityCap;
 e.tick(visible);e.tick(limited);assert(visible.countries.cn.infected>limited.countries.cn.infected);
});

function tail(deaths){const st=game();for(const m of e.WORLD){const c=st.countries[m.id];c.healthy=c.vaccinated=0;c.dead=m.pop*deaths;c.infected=m.pop-c.dead;c.known=true;}st.cure.research=0;st.cure.progress=20;return st;}
test('IX.2: 99 percent infection and 1 percent deaths do not mean civilization has fallen',()=>{
 const alive=tail(.01);for(let i=0;i<12;i++){e.tick(alive);assert(!alive.done);assert.equal(alive.lastStandDays,0);}
 const dying=tail(.31);e.tick(dying);assert.equal(dying.lastStandDays,1);
 const collapsed=tail(.01);for(const m of e.WORLD.slice(0,60))collapsed.countries[m.id].collapsed=true;
 e.tick(collapsed);assert.equal(collapsed.lastStandDays,1);
});

test('IX.3: recovery grants ten full subsequent ticks of immunity, including after reload',()=>{
 let st=tail(.4);e.tick(st);assert.equal(st.lastStandDays,1);
 st.cure.progress=40;const recoveryDay=st.day;e.tick(st);
 assert.equal(st.lastStandImmuneUntil,recoveryDay+11);
 assert.equal(e.viewFor(st,'cure').cure.lastStandImmunityDays,10);
 st=JSON.parse(JSON.stringify(st));st.cure.progress=20;
 for(let i=0;i<10;i++){e.tick(st);assert.equal(st.lastStandDays,0);assert(!st.done);}
 e.tick(st);assert.equal(st.lastStandDays,1);assert(!st.done);
});

test('IX.4: actual paused days never exceed four in any rolling ten-day window, even with queued legacy pauses',()=>{
 let st=game();st.plague.severity=8;st.cure.progress=20;st.cure.research=.1;
 const paused=[];
 for(let i=0;i<24;i++){
   st.cure.paused=6;const day=st.day,before=st.cure.progress;e.tick(st);
   if(st.cure.progress===before)paused.push(day);
   else assert.equal(st.cure.paused,0,'over-limit queued pauses must be discarded');
   assert(paused.filter(d=>d>day-10).length<=4);
   st=JSON.parse(JSON.stringify(st));
 }
 assert(paused.length>=8,'rolling protection should expire, not permanently disable disruption');
 const capped=game();capped.day=10;capped.plague.severity=8;capped.cure.pauseDays=[2,4,6,8];capped.plague.dna=100;
 const blocked=buy(capped,'plague','drug');assert.equal(blocked.cure.paused,0);
 assert.match(e.viewFor(blocked,'cure').cure.researchStatus.message,/无需测序/);
 assert(!e.viewFor(blocked,'cure').cureCards.find(c=>c.id==='sequence').recommended);
});

test('IX.5: wallet income sums exactly, names only visible collapsed nations, and rescue restores the loss',()=>{
 let st=game();st.day=20;st.cure.rp=100;st.cure.progress=60;
 const baseline=e.viewFor(st,'cure').cure.dailyIncome;
 st.countries.us.collapsed=true;
 let v=e.viewFor(st,'cure');assert(!v.cure.incomeBreakdown.message.includes('美国'));
 st.countries.us.known=true;v=e.viewFor(st,'cure');
 assert.match(v.cure.incomeBreakdown.message,/美国崩溃.*−1\/天.*救援/);
 assert.equal(v.cure.incomeBreakdown.collapseLoss,baseline-v.cure.dailyIncome);
 const b=v.cure.incomeBreakdown;assert.equal(v.cure.dailyIncome,b.base+b.epidemic+b.collaboration);
 st=buy(st,'cure','rescue','us');v=e.viewFor(st,'cure');assert.equal(v.cure.dailyIncome,baseline);assert.equal(v.cure.incomeBreakdown.message,'');
});

test('IX.6: silent bot never buys symptoms before day 22 and begins symptoms on day 22',()=>{
 const {silentUntil22,check}=require('../scripts/plague-sweep.cjs');let st=game();st.plague.dna=10000;
 for(let day=1;day<=21;day++)for(let action=0;action<2;action++){
   st.day=day;st.phase='plague';st.actionsLeft=2;const move=silentUntil22(st);
   if(move.card)assert.notEqual(e.PLAGUE_CARDS.find(c=>c.id===move.card).tree,'symptom');
   st=e.apply(st,'plague',move).state;
 }
 st.day=22;st.phase='plague';st.actionsLeft=2;assert.equal(silentUntil22(st).card,'cough');
 const report={games:100,standard:{games:100,spendy:{cureWins:30},thrifty:{cureWins:55}},antiResearch:{thrifty:{cureWins:50,plagueActions:{hard1:1,hard2:1,shuffle:1}}},silentUntil22:{thrifty:{cureWins:40,symptomsBefore22:0,firstSymptomDay:22}}};
 assert.doesNotThrow(()=>check(report));report.silentUntil22.thrifty.cureWins=39;assert.throws(()=>check(report),/40/);
 report.silentUntil22.thrifty.cureWins=40;report.silentUntil22.thrifty.symptomsBefore22=1;assert.throws(()=>check(report),/early symptom/);
});
