'use strict';
const assert=require('node:assert');
const e=require('../engines/plague.cjs');
  const order = ['air','water','cough','nausea','rodent','insect','blood','bird','livestock','cold','heat','air2','water2','rodent2','insect2','blood2','bird2','livestock2','sneeze','vomit','pneu','rash','insomnia','anemia','drug','hard1','bioaerosol','zoonosis','hematophagy','diarrhea','sweat','paranoia','pulmonary','skin','seizure','hard2','drug2','insanity','paralysis','coma','dysentery','hemo','necrosis','shock','failure','escape'];
  function pbot(s) {
    const legal = e.legalMoves(s, 'plague').filter((m) => m.type === 'buy');
    const spread = Object.values(s.countries).filter((c) => c.infected > 0).length;
    const urgentShuffle = ['shuffle3','shuffle2','shuffle'].map((id) => legal.find((m) => m.card === id)).find(Boolean);
    if (urgentShuffle && s.cure.progress >= 28) return urgentShuffle;
    const hold = spread < e.WORLD.length * 0.68 ? ['pulmonary','dysentery','hemo','necrosis','shock','failure','coma'] : [];
    for (const id of order) { if (hold.includes(id)) continue; const m = legal.find((x) => x.card === id); if (m) return m; }
    const sh = ['shuffle3','shuffle2','shuffle'].map((id) => legal.find((x) => x.card === id)).find(Boolean);
    if (sh && s.cure.progress > 25) return sh;
    return { type: 'pass' };
  }
  function cbot(s, providedView) {
    // 必须按人类真实可见的迷雾视角决策，不能偷看引擎里的感染位置。
    const view = providedView || e.viewFor(s, 'cure');
    const legal = view.legal.filter((m) => m.type === 'buy');
    if (!legal.length) return { type: 'pass' };
    const t = Object.values(view.countries);
    const deploy = legal.find((m) => m.card === 'deployTeams');
    if (deploy) return deploy;
    const treaty = legal.find((m) => m.card === 'treaty') || legal.find((m) => m.card === 'manufacture');
    if (treaty) return treaty;
    const lab = legal.find((m) => m.card === 'lab');
    if (lab && s.cure.research < 7) return lab;
    for (const c of t.filter((x) => x.infected === 0 && x.healthy > 0).sort((a, b) => b.healthy - a.healthy)) {
      const m = legal.find((x) => x.card === 'closeAir' && x.country === c.id) ||
                legal.find((x) => x.card === 'closePort' && x.country === c.id);
      if (m) return m;
    }
    const worst = t.filter((x) => x.infected > 0).sort((a, b) => b.infected - a.infected)[0];
    if (worst) {
      const m = legal.find((x) => x.card === 'quarant' && x.country === worst.id) ||
                legal.find((x) => x.card === 'care' && x.country === worst.id);
      if (m) return m;
    }
    const big = t.filter((x) => x.healthy > 0).sort((a, b) => b.healthy - a.healthy)[0];
    if (big) { const v = legal.find((x) => x.card === 'vaccine' && x.country === big.id); if (v) return v; }
    return lab || { type: 'pass' };
  }
  // Legacy spending policies stay unchanged for paired comparisons.
  function cbotThrifty(s, providedView) {
    const view = providedView || e.viewFor(s, 'cure');
    const legal = view.legal.filter((m) => m.type === 'buy');
    if (!legal.length) return { type: 'pass' };
    const t = Object.values(view.countries);
    const deploy = legal.find((m) => m.card === 'deployTeams');
    if (deploy) return deploy;
    const treaty = legal.find((m) => m.card === 'treaty') || legal.find((m) => m.card === 'manufacture');
    if (treaty) return treaty;
    const lab = legal.find((m) => m.card === 'lab');
    if (lab && s.cure.research < 7) return lab;
    const researchOrder = view.world.slice().sort((a, b) => b.research - a.research);
    const collapsed = researchOrder.find((m) => view.countries[m.id].collapsed);
    if (collapsed) {
      const rescue = legal.find((x) => x.card === 'rescue' && x.country === collapsed.id);
      if (rescue) return rescue;
    }
    const labCountry = researchOrder.find((m) => !view.countries[m.id].collapsed && view.countries[m.id].healthy > 0);
    if (labCountry) {
      const field = legal.find((x) => x.card === 'fieldLab' && x.country === labCountry.id);
      if (field) return field;
    }
    const worst = t.filter((x) => x.infected > 0).sort((a, b) => b.infected - a.infected)[0];
    if (worst && s.cure.rp >= 16) {
      const m = legal.find((x) => x.card === 'care' && x.country === worst.id) ||
                legal.find((x) => x.card === 'quarant' && x.country === worst.id) ||
                legal.find((x) => x.card === 'vaccine' && x.country === worst.id);
      if (m) return m;
    }
    for (const m of researchOrder.slice(0, 12)) {
      const c = view.countries[m.id];
      if (c.infected !== 0 || c.healthy <= 0) continue;
      const close = legal.find((x) => x.card === 'closeAir' && x.country === m.id) ||
                    legal.find((x) => x.card === 'closePort' && x.country === m.id);
      if (close) return close;
    }
    const big = t.filter((x) => x.healthy > 0).sort((a, b) => b.healthy - a.healthy)[0];
    if (big) { const v = legal.find((x) => x.card === 'vaccine' && x.country === big.id); if (v) return v; }
    return lab || { type: 'pass' };
  }
  function series(cb, games, offset = 0, plagueBot = pbot) {
    let plagueWins = 0, cureWins = 0, days = 0, cureProgress = 0, deadRatio = 0;
    const actions = {}, plagueActions = {};
    let firstSymptomDay = null, symptomsBefore22 = 0;
    for (let g = 0; g < games; g++) {
      const startCountry = e.WORLD[(g + offset) % e.WORLD.length].id;
      let s = e.createGame({ seed: (g + offset) * 37 + 3, startCountry });
      for (let i = 0; i < 12000 && !s.done; i++) { const r = s.phase, move = r === 'plague' ? plagueBot(s) : cb(s);
        if(r === 'cure' && move.card) actions[move.card]=(actions[move.card]||0)+1;
        if(r === 'plague' && move.card) plagueActions[move.card]=(plagueActions[move.card]||0)+1;
        if(r === 'plague' && move.card && e.PLAGUE_CARDS.find(c=>c.id===move.card).tree==='symptom') {
          firstSymptomDay=firstSymptomDay===null?s.day:Math.min(firstSymptomDay,s.day);
          if(s.day<22)symptomsBefore22++;
        }
        s = e.apply(s, r, move).state; }
      assert.equal(s.done, true, '第 ' + g + ' 局没打完');
      assert(s.day <= 201, '不该拖过两百天');
      if (s.winner === 'plague') plagueWins++; else cureWins++;
      days += s.day; cureProgress += s.cure.progress; deadRatio += e.sum(s, 'dead') / s.worldPop;
    }
    return { plagueWins, cureWins, actions, plagueActions, firstSymptomDay, symptomsBefore22, avgDay:Math.round(days / games), avgCure:Math.round(cureProgress / games), avgDead:Number((deadRatio / games).toFixed(2)) };
  }

function modernCure(base, options = {}) { return s=>{
 const view=e.viewFor(s,'cure'),legal=view.legal;
 if(options.publicHealth !== false && !view.cure.researchOpen){const health=legal.find(m=>m.card==='publicHealth');if(health)return health;}
 if(options.sequence !== false && view.cure.paused>0 && view.cure.progress>=15){const sequence=legal.find(m=>m.card==='sequence');if(sequence)return sequence;}
 const next=base(s,view);
 const sequenceCard=view.cureCards.find(c=>c.id==='sequence');
 // After seeing research disruption, retain a countermeasure budget instead of
 // spending every last point on a renewed local buff that cannot stop it.
 if(options.sequence !== false && view.cure.lastPauseDay!=null && view.day-view.cure.lastPauseDay<=3 && view.cure.progress>=15 && view.cure.rp<sequenceCard.cost && !['lab','treaty','manufacture'].includes(next.card)) return {type:'pass'};
 return next;
};}
function modernPlague(s){
 const legal=e.legalMoves(s,'plague').filter(m=>m.type==='buy');
 // Do not waste a research rollback during sequencing protection.
 if(s.day < (s.cure.sequenceUntil||0)){
  const move=legal.find(m=>{const c=e.PLAGUE_CARDS.find(c=>c.id===m.card);return !c.eff.cureBack;});
  return move||{type:'pass'};
 }
 const move=pbot(s);if(move.type!=='pass')return move;
 return legal.find(m=>m.card==='lethalSurge')||legal.find(m=>m.card==='spreadSurge')||move;
}
function scan(games=100,offset=0,modern=false){
 return {games,offset,modern,cureF:e.TUNE.cureF,sequenceCost:e.CURE_CARDS.find(c=>c.id==='sequence').cost,
 spendy:series(modern?modernCure(cbot):cbot,games,offset,modern?modernPlague:pbot),
 thrifty:series(modern?modernCure(cbotThrifty):cbotThrifty,games,offset,modern?modernPlague:pbot)};
}
const TARGETS={spendy:[0.25,0.40],thrifty:[0.45,0.60]};
function checkTargets(report){
 assert(report.games>=100,'Use at least 100 games per policy for target validation');
 for(const [policy,[low,high]] of Object.entries(TARGETS)){
  const rate=report[policy].cureWins/report.games;
  assert(rate>=low && rate<=high,policy+' human win rate '+rate+' outside '+low+'–'+high);
 }
 if(report.modern)for(const policy of ['spendy','thrifty']){
  assert(report[policy].actions.publicHealth>0,'Modern policy did not use public health');
  assert(report[policy].actions.sequence>0,'Modern policy did not use sequencing');
 }
}
module.exports={scan,series,pbot,cbot,cbotThrifty,modernCure,modernPlague,checkTargets,TARGETS};
if(require.main===module){
 if(process.env.CURE_F)e.TUNE.cureF=Number(process.env.CURE_F);
 const report=scan(Number(process.argv[2])||100,Number(process.argv[3])||0,process.argv.includes('--modern'));
 console.log(JSON.stringify(report));
 if(process.argv.includes('--check'))checkTargets(report);
}
