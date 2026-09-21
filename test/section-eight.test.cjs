'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const e=require('../engines/plague.cjs');
function game(){return e.createGame({seed:811,startCountry:'eg'});}
function buy(st,role,card,country){st.phase=role;st.actionsLeft=2;return e.apply(st,role,{type:'buy',card,...(country?{country}:{})}).state;}

test('VIII.1: monitoring unlocks ports before confirmation without unlocking isolation or research',()=>{
 let st=game();st.day=4;st.cure.rp=100;st.cure.vigilance=2;
 assert(!e.legalMoves({...st,phase:'cure'},'cure').some(m=>m.card==='closeAir'));
 assert.throws(()=>buy(st,'cure','closeAir','eg'),/阶段/);
 st=buy(st,'cure','watch');
 const v=e.viewFor(st,'cure');assert.equal(v.cure.researchOpen,false);
 assert(v.legal.some(m=>m.card==='closeAir' && m.country==='eg'));
 assert(v.legal.some(m=>m.card==='closePort' && m.country==='eg'));
 assert(!v.legal.some(m=>['quarant','lab'].includes(m.card)));
 st=buy(st,'cure','closeAir','eg');assert(st.countries.eg.closedAir);
 const ui=require('../public/js/plague-ui-model.js');
 const card=v.cureCards.find(c=>c.id==='closePort');
 assert.equal(ui.cardAvailability(card,{side:'cure',list:v.cureCards,owned:[],pool:100,myTurn:true,legal:v.legal.filter(m=>m.card===card.id),day:v.day,cure:v.cure}).kind,'ready');
});

test('VIII.2: one isolation purchase protects five ticks and can then be renewed',()=>{
 let st=game();st.day=10;st.cure.rp=100;st.cure.watch=1;
 st.countries.eg.healthy-=999;st.countries.eg.infected=1000;
 st=buy(st,'cure','quarant','eg');assert.equal(st.countries.eg.quarantine,5);
 for(let i=0;i<4;i++)e.tick(st);
 assert.equal(st.countries.eg.quarantine,1);
 assert.throws(()=>buy(st,'cure','quarant','eg'),/隔离/);
 e.tick(st);assert.equal(st.countries.eg.quarantine,0);
 st=buy(st,'cure','quarant','eg');assert.equal(st.countries.eg.quarantine,5);
});

test('VIII.3: every rollback is capped at 15 percent and preserves half the historical peak across saves',()=>{
 let st=game();st.cure.progress=41;st.plague.dna=10000;st.plague.owned.push('drug');
 st=buy(st,'plague','shuffle');assert.equal(st.cure.progress,34.85);assert.equal(st.cure.peakProgress,41);
 st=JSON.parse(JSON.stringify(st));
 for(const id of ['shuffle2','shuffle3','drug2','escape',...Array(12).fill('antigenDrift')]){
   if(id==='escape')st.plague.owned.push('hard1');
   const before=st.cure.progress;st=buy(st,'plague',id);
   assert(st.cure.progress>=before*.85-1e-9);
   assert(st.cure.progress>=20.5);
 }
 assert.equal(st.cure.progress,20.5);
 const old=game();old.cure.progress=60;old.plague.dna=100;delete old.cure.peakProgress;
 const migrated=buy(old,'plague','drug');assert.equal(migrated.cure.peakProgress,60);
});

test('VIII.3: treaty absorbs exactly one effective rollback; research grows the protected peak',()=>{
 let st=game();st.cure.progress=60;st.cure.rp=100;st.plague.dna=100;
 st=buy(st,'cure','treaty');assert.equal(st.cure.rollbackShield,1);
 st=buy(st,'plague','drug');assert.equal(st.cure.progress,60);assert.equal(st.cure.rollbackShield,0);
 st=buy(st,'plague','shuffle');assert.equal(st.cure.progress,51);
 const eligibleAgain=JSON.parse(JSON.stringify(st));eligibleAgain.cure.progress=60;
 assert.throws(()=>buy(eligibleAgain,'cure','treaty'),/已经/);
 st.cure.paused=0;st.cure.research=30;st.plague.severity=8;e.tick(st);
 assert(st.cure.peakProgress>60);assert.equal(st.cure.peakProgress,st.cure.progress);
});

test('VIII.3/4: sequencing remains 20 points, reports cooldown/shortfall, and clears the interruption notice',()=>{
 let st=game();st.plague.severity=8;st.cure.progress=30;st.cure.rp=11;st.plague.dna=100;
 st=buy(st,'plague','drug');st.phase='cure';
 let v=e.viewFor(st,'cure');assert.match(v.cure.researchStatus.message,/本轮研究将暂停/);
 assert.equal(v.cure.researchStatus.shortfall,9);assert.equal(v.cure.researchStatus.canSequence,false);
 assert(v.cureCards.find(c=>c.id==='sequence').recommended);
 e.tick(st);st.phase='cure';v=e.viewFor(st,'cure');
 assert.equal(st.cure.paused,0,'the UI must retain the last tick interruption after its counter decrements');
 assert.equal(v.cure.researchStatus.pausedDays,1);assert.match(v.cure.researchStatus.message,/研究已停 1 天/);
 st.cure.rp=100;st=buy(st,'cure','sequence');
 assert.equal(e.viewFor(st,'cure').cure.researchStatus.message,'');
 st.cure.paused=1;assert.match(e.viewFor(st,'cure').cure.researchStatus.message,/冷却剩 3 天/);
 st.day+=3;st=buy(st,'cure','sequence');assert.equal(st.cure.rp,60);
 assert.equal(e.viewFor(st,'cure').cureCards.find(c=>c.id==='sequence').cost,20);
});

test('VIII.5/IX.2: terminal warning requires significant deaths and recovery cancels it',()=>{
 function tail(){const st=game();for(const m of e.WORLD){const c=st.countries[m.id];c.healthy=0;c.vaccinated=0;c.dead=Math.floor(m.pop*.4);c.infected=m.pop-c.dead;c.known=true;}st.cure.research=0;st.cure.progress=23;return st;}
 const st=tail();for(let i=0;i<4;i++){e.tick(st);assert(!st.done);}
 assert.equal(e.viewFor(st,'cure').cure.lastStandRemaining,1);
 e.tick(st);assert.equal(st.winner,'plague');assert.match(st.result.why,/连续五天/);
 const recovering=tail();e.tick(recovering);recovering.cure.progress=40;e.tick(recovering);
 assert.equal(recovering.lastStandDays,0);assert(!recovering.done);
});
