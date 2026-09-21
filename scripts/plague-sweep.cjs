'use strict';

const assert = require('node:assert/strict');
const e = require('../engines/plague.cjs');
const balance = require('./balance.cjs');

// Section VIII: preserve the spreading/lethal policy, but from 30% research
// spend the next action on an affordable rollback before anything else.
function antiResearch(s) {
  const legal = e.legalMoves(s, 'plague').filter(m => m.type === 'buy');
  const find = ids => ids.map(id => legal.find(m => m.card === id)).find(Boolean);
  const protectedNow = s.day < (s.cure.sequenceUntil || 0);
  if (!protectedNow && s.cure.progress >= 30) {
    const rollback = find(['shuffle','shuffle2','shuffle3','escape','drug','drug2','antigenDrift']);
    if (rollback) return rollback;
  }
  return balance.modernPlague(s);
}

const SILENT_SPREAD = ['air','water','rodent','insect','bird','blood','livestock','air2','water2','cold','heat','rodent2','insect2','bird2','blood2','livestock2','bioaerosol','spreadSurge'];
function silentUntil22(s) {
  const legal=e.legalMoves(s,'plague').filter(m=>m.type==='buy');
  const find=ids=>ids.map(id=>legal.find(m=>m.card===id)).find(Boolean);
  if(s.day>=22) {
    if(!s.plague.owned.some(id=>e.PLAGUE_CARDS.find(c=>c.id===id)?.tree==='symptom')) {
      const symptom=find(['cough','nausea']);if(symptom)return symptom;
    }
    return antiResearch(s);
  }
  // This opening still uses the day 14 resistance/hardening purchases from
  // the playtest. It must never fall back to cheap symptoms before day 22.
  if(s.day>=14) {
    const counter=find(['drug','drug2','hard1','hard2']);
    if(counter)return counter;
    if(s.cure.progress>=30 && s.day>=(s.cure.sequenceUntil||0)) {
      const rollback=find(['shuffle','shuffle2','shuffle3','escape','antigenDrift']);
      if(rollback)return rollback;
    }
  }
  return find(SILENT_SPREAD) || {type:'pass'};
}

function sweep(games = 100, offset = 0) {
  assert(Number.isInteger(games) && games >= 100, 'plague-sweep requires at least 100 games per matchup');
  assert(Number.isInteger(offset) && offset >= 0, 'offset must be a non-negative integer');
  const report = {
    games, offset, policy:'section9-four-gates', seedFormula:'(g + offset) * 37 + 3',
    standard: balance.scan(games, offset),
    antiResearch: {
      spendy: balance.series(balance.modernCure(balance.cbot), games, offset, antiResearch),
      thrifty: balance.series(balance.modernCure(balance.cbotThrifty), games, offset, antiResearch),
    },
    silentUntil22: {thrifty:balance.series(balance.modernCure(balance.cbotThrifty),games,offset,silentUntil22)},
  };
  return report;
}
function check(report) {
  balance.checkTargets(report.standard);
  assert(report.games >= 100, 'at least 100 games required');
  assert(report.antiResearch.thrifty.cureWins / report.games > 0.40,
    'anti-research plague: thrifty human wins must exceed 40%');
  for (const id of ['hard1','hard2','shuffle']) {
    assert(report.antiResearch.thrifty.plagueActions[id] > 0, 'adversary never bought ' + id);
  }
  const silent=report.silentUntil22.thrifty;
  assert(silent.cureWins/report.games>=0.4,'zero-symptom opening: thrifty human wins must reach 40%');
  assert.equal(silent.symptomsBefore22,0,'silent policy bought an early symptom');
  assert(silent.firstSymptomDay>=22 && silent.firstSymptomDay!==null,'silent policy must actually transition to symptoms');
}
module.exports = { antiResearch, silentUntil22, sweep, check };
if (require.main === module) {
  const report = sweep(Number(process.argv[2] || 100), Number(process.argv[3] || 0));
  console.log(JSON.stringify(report, null, 2));
  check(report);
}
