'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const e=require('../engines/plague.cjs');
test('round 6 #1: humans can initiate awareness without symptoms, with a three-day cooldown',()=>{
 let st=e.createGame({seed:601,startCountry:'cn'}); st.phase='cure';st.cure.rp=100;
 assert(e.legalMoves(st,'cure').some(m=>m.card==='publicHealth'));
 for (const day of [1,4,7]) {
  st.day=day;st.phase='cure';st.actionsLeft=2;
  st=e.apply(st,'cure',{type:'buy',card:'publicHealth'}).state;
  assert(!e.legalMoves(st,'cure').some(m=>m.card==='publicHealth'));
  assert.throws(()=>e.apply(st,'cure',{type:'buy',card:'publicHealth'}));
 }
 const v=e.viewFor(st,'cure');
 assert.equal(st.plague.severity,0);assert.equal(v.cure.researchOpen,true);
 assert(v.legal.some(m=>m.card==='lab'));
 assert.equal(v.countries.cn.hidden,true,'routine screening must not expose origin');
 st.day=10;assert(!e.legalMoves(st,'cure').some(m=>m.card==='publicHealth'));
});

test('round 6 #2: hardening is passive, disruption has cooldown and sequencing counters it',()=>{
 let st=e.createGame({seed:602,startCountry:'cn'});st.plague.dna=1000;st.plague.severity=8;st.cure.progress=60;
 function buy(id,day){st.phase='plague';st.actionsLeft=2;st.day=day;st=e.apply(st,'plague',{type:'buy',card:id}).state;}
 buy('drug',1);assert.equal(st.cure.paused,1);st.cure.paused=0;
 buy('hard1',2);assert.equal(st.cure.paused,0);assert.equal(st.cure.cureSlow,1);
 buy('shuffle',2);assert.equal(st.cure.paused,0);
 buy('shuffle2',4);assert.equal(st.cure.paused,1);
 st.phase='cure';st.actionsLeft=2;st.cure.rp=100;
 st=e.apply(st,'cure',{type:'buy',card:'sequence'}).state;assert.equal(st.cure.paused,0);
 const progress=st.cure.progress;buy('shuffle3',5);assert.equal(st.cure.progress,progress-Math.min(15,progress*.15)*.5);assert.equal(st.cure.paused,0);
 st.phase='cure';assert(!e.legalMoves(st,'cure').some(m=>m.card==='sequence'));
 st.day=7;assert(e.legalMoves(st,'cure').some(m=>m.card==='sequence'));
});

function tailState(){
 const st=e.createGame({seed:603,startCountry:'cn'});
 for(const m of e.WORLD){const c=st.countries[m.id];c.healthy=0;c.vaccinated=0;c.infected=Math.ceil(m.pop*.3);c.dead=m.pop-c.infected;c.known=true;}
 st.plague.lethality=0;st.cure.research=0;st.cure.progress=20;return st;
}
test('round 6 #3: terminal tail has five days and a recoverable threshold',()=>{
 const st=tailState();for(let i=0;i<4;i++){e.tick(st);assert(!st.done);}
 e.tick(st);assert.equal(st.winner,'plague');assert.match(st.result.why,/五天/);
 const recovery=tailState();e.tick(recovery);recovery.cure.progress=40;e.tick(recovery);
 assert.equal(recovery.lastStandDays,0);assert(!recovery.done);
 const people=tailState();e.tick(people);people.countries.cn.infected-=20000;people.countries.cn.vaccinated=20000;e.tick(people);
 assert.equal(people.lastStandDays,0);assert(!people.done);
});

test('round 6 #4: recently cleared countries and vaccination resist immediate reimport',()=>{
 const st=e.createGame({seed:604,startCountry:'cn'});st.day=30;st.plague.land=100;st.plague.air=100;st.plague.sea=100;st.plague.resCold=1;st.plague.resHeat=1;
 for(const c of Object.values(st.countries)){c.infected=10;c.healthy-=10;}
 const target=st.countries.vnm;target.healthy+=target.infected;target.infected=0;target.lastInfectedDay=29;
 e.tick(st);assert.equal(target.infected,0);
 st.phase='cure';st.actionsLeft=2;st.cure.progress=60;st.cure.rp=100;target.known=true;
 const vaccinated=e.apply(st,'cure',{type:'buy',card:'vaccine',country:'vnm'}).state;
 assert.equal(vaccinated.countries.vnm.importShield,3);
 for(let i=0;i<3;i++){e.tick(vaccinated);assert.equal(vaccinated.countries.vnm.infected,0);}
 assert.equal(vaccinated.countries.vnm.importShield,0);
});
test('round 6 #4: repeat imports do not farm new-country DNA',()=>{
 const st=e.createGame({seed:640,startCountry:'cn'});st.plague.land=100;st.plague.air=100;st.plague.sea=100;st.plague.resCold=1;st.plague.resHeat=1;
 for(const c of Object.values(st.countries)){c.everInfected=true;c.infected=0;c.dead=0;}
 st.countries.cn.infected=100;st.plague.dnaMilestones=[100,1000,10000];
 const before=st.plague.dna;e.tick(st);assert(st.log.some(x=>x.type==='spread'));
 assert(st.log.find(x=>x.type==='spread').countries.length > 1);
 const income=e.TUNE.dnaBase+Math.min(e.TUNE.dnaCap,Math.floor(e.sum(st,'infected')/e.TUNE.dnaPer));
 assert(st.plague.dna-before>=income && st.plague.dna-before<=income+1);
});

test('round 6 #5: country targets rank combined burden and never disclose hidden counts',()=>{
 const st=e.createGame({seed:605,startCountry:'cn'});st.day=10;st.phase='cure';st.cure.rp=100;
 Object.assign(st.countries.cn,{known:true,infected:100,dead:10});Object.assign(st.countries.in,{known:true,infected:1,dead:1000});
 const targets=e.legalMoves(st,'cure').filter(m=>m.card==='fieldLab');
 assert.equal(targets[0].country,'in');assert.equal(targets[1].country,'cn');
 assert(targets.slice(2).every(m=>m.targetInfected===null && m.targetDead===null));
});

const presentation=require('../public/js/plague-presentation.js');
test('round 6 #6: latest three actions exclude spread and protect hidden card metadata',()=>{
 let st=e.createGame({seed:606,startCountry:'cn'});st.plague.dna=100;
 st=e.apply(st,'plague',{type:'buy',card:'air'}).state;
 const v=e.viewFor(st,'cure'),action=v.log.find(x=>x.type==='action');
 assert.equal(action.card,undefined);assert(!action.text.includes('空气'));
 assert.equal(v.countries.cn.everInfected,undefined);assert.equal(v.countries.cn.lastInfectedDay,undefined);
 const log=[{day:1,text:'人类启动了「溯源检测」。'},...Array.from({length:4},(_,i)=>({day:i+2,type:'action',role:'cure',card:'care',country:'cn',text:'人类在中国用了「特效药」。'})),{day:6,type:'spread',text:'瘟疫传到了印度。'}];
 assert.deepEqual(presentation.recentActions(log,'plague').map(x=>x.day),[5,4,3]);
 assert.equal(presentation.recentActions(log,'cure').length,0);
});

test('round 6 #7: milestones are one-time priority headlines and distinct logs',()=>{
 const st=e.createGame({seed:607,startCountry:'cn'});st.countries.cn.infected=20000;st.countries.cn.healthy-=20000;st.plague.lethality=1;
 e.tick(st);e.tick(st);
 for(const key of ['infected-10000','first-death']){assert.equal(st.news.filter(x=>x.key===key).length,1);assert.equal(st.log.filter(x=>x.key===key && x.type==='milestone').length,1);}
 const queue=presentation.newsQueue([...st.news,{day:100,key:'ordinary',text:'ordinary'}]);assert.equal(queue[0].priority,1);
 const c=st.countries.eg;c.healthy=c.infected=c.vaccinated=0;c.dead=10000;c.known=true;e.tick(st);
 assert(st.news.some(x=>x.key==='collapse-eg' && x.priority===1));
});

test('round 6 #8: news reads newest first within priority, including same-day arrivals',()=>{
 const news=[{day:8,key:'old'},{day:23,key:'new'},{day:22,key:'milestone',priority:1},{day:23,key:'newest'}];
 assert.deepEqual(presentation.newsQueue(news).map(x=>x.key),['milestone','newest','new','old']);
 assert.equal(news[0].key,'old','sorting must not mutate the stored timeline');
});

test('round 6 #9: full history groups every day and merges duplicate spread notices',()=>{
 const log=Array.from({length:120},(_,i)=>({day:i+1,text:'每日通报'}));
 log.push({day:1,text:'瘟疫传到了瓦努阿图。'},{day:1,text:'瘟疫传到了瓦努阿图、印度。'});
 const groups=presentation.dayGroups(log);assert.equal(groups.length,120);assert.equal(groups[0].day,1);
 assert.equal(groups[0].entries.length,2);assert.equal(groups[0].entries[1].text,'瘟疫传到了瓦努阿图、印度。');
 assert.equal(groups.at(-1).day,120);
});

test('sequencing preserves counterplay but cannot erase every rollback indefinitely',()=>{
 let st=e.createGame({seed:707,startCountry:'cn'});st.phase='cure';st.cure.rp=100;st.plague.severity=8;st.actionsLeft=2;
 st=e.apply(st,'cure',{type:'buy',card:'sequence'}).state;
 assert.equal(st.cure.sequenceUntil,st.day+2);
 st.day+=3;const card=e.viewFor(st,'cure').cureCards.find(c=>c.id==='sequence');assert.equal(card.cost,20);
 const bots=require('../scripts/balance.cjs');const early=e.createGame({seed:708,startCountry:'cn'});early.phase='cure';early.cure.rp=100;
 assert.equal(bots.modernCure(bots.cbot)(early).card,'publicHealth');
 early.plague.severity=8;early.cure.progress=30;early.cure.paused=1;
 assert.equal(bots.modernCure(bots.cbot)(early).card,'sequence');
});

test('balance acceptance rejects the old human-dominant result and requires new-card usage',()=>{
 const {checkTargets}=require('../scripts/balance.cjs');
 assert.throws(()=>checkTargets({games:100,spendy:{cureWins:64},thrifty:{cureWins:96}}),/outside/);
 const report={games:100,modern:true,spendy:{cureWins:30,actions:{publicHealth:1,sequence:1}},thrifty:{cureWins:55,actions:{publicHealth:1,sequence:1}}};
 assert.doesNotThrow(()=>checkTargets(report));report.thrifty.actions.sequence=0;
 assert.throws(()=>checkTargets(report),/did not use sequencing/);
});
