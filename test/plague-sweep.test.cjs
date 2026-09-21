'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('../engines/plague.cjs');
const {antiResearch, check, sweep} = require('../scripts/plague-sweep.cjs');

test('section eight adversary prioritizes research rollback at 30 percent', () => {
  const s = e.createGame({seed:711,startCountry:'cn'});
  s.day=21;s.plague.dna=100;s.plague.owned.push('drug','hard1');
  s.cure.progress=30;
  assert.equal(antiResearch(s).card,'shuffle');
  s.cure.sequenceUntil=23;
  const protectedMove=antiResearch(s);
  assert(!e.PLAGUE_CARDS.find(c=>c.id===protectedMove.card).eff.cureBack,'avoid wasting a rollback during sequencing protection');
});

test('sweep acceptance requires a full sample, over 40 human wins and actual counter purchases', () => {
  assert.throws(()=>sweep(20), /at least 100/);
  const report={games:100,standard:{games:100,spendy:{cureWins:30},thrifty:{cureWins:55}},
    antiResearch:{thrifty:{cureWins:41,plagueActions:{hard1:100,hard2:80,shuffle:70}}},
    silentUntil22:{thrifty:{cureWins:40,symptomsBefore22:0,firstSymptomDay:22}}};
  assert.doesNotThrow(()=>check(report));
  report.antiResearch.thrifty.cureWins=40;
  assert.throws(()=>check(report),/exceed 40/);
  report.antiResearch.thrifty.cureWins=41;report.antiResearch.thrifty.plagueActions.hard2=0;
  assert.throws(()=>check(report),/never bought hard2/);
});

test('burden sorting applies to every card, keeps hidden countries last, and preserves recommendations', () => {
  const ui = require('../public/js/plague-ui-model.js');
  const world=[{id:'a',research:9,pop:1000},{id:'b',research:2,pop:1000},{id:'c',research:99,pop:1000}];
  const countries={a:{healthy:900,vaccinated:0,infected:20,dead:80},b:{healthy:100,vaccinated:0,infected:500,dead:400},
    c:{hidden:true,infected:null,dead:null}};
  const moves=world.map(m=>({country:m.id}));
  for(const card of ['fieldLab','vaccine','quarant']) assert.deepEqual(ui.rankCountries(card,moves,world,countries,'burden').map(x=>x.move.country),['b','a','c']);
  assert.equal(ui.rankCountries('fieldLab',moves,world,countries,'recommended')[0].move.country,'a');
});
