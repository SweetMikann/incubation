'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const engine = require('../engines/plague.cjs');
function runtime() {
  const ctx = {window:{}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/plague-icons.js'),'utf8'),ctx);
  ctx.PlagueIcons = ctx.window.PlagueIcons;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/worldmap.js'),'utf8'),ctx);
  return ctx;
}
test('both factions have valid icon assignments for every purchasable card',()=>{
  const icons = runtime().PlagueIcons;
  for(const card of [...engine.PLAGUE_CARDS,...engine.CURE_CARDS]) {
    assert(icons.cards[card.id],`Missing icon: ${card.id}`);
    assert(icons.art[icons.cards[card.id]],`Missing drawing: ${card.id}`);
  }
});
test('depleted-country skulls respect fog and remain selectable',()=>{
  const ctx=runtime();
  const world=[{id:'tiny',iso:'TST',name:'测试国',lon:30,lat:20,pop:100}];
  let callback;
  const marker={addEventListener:(_,fn)=>{callback=fn;},getAttribute:()=> 'tiny'};
  const box={innerHTML:'',querySelectorAll:()=>[marker]};
  const gone={healthy:0,vaccinated:0,infected:0,dead:100};
  let picked;
  ctx.window.drawWorld(box,world,{tiny:gone},{onPick:id=>picked=id});
  assert.match(box.innerHTML,/class="wm-skull"/);
  callback();assert.equal(picked,'tiny');
  ctx.window.drawWorld(box,world,{tiny:{...gone,hidden:true}},{selected:'tiny'});
  assert.doesNotMatch(box.innerHTML,/class="wm-skull"/);
  ctx.window.drawWorld(box,world,{tiny:{...gone,infected:1}},{selected:'tiny'});
  assert.doesNotMatch(box.innerHTML,/class="wm-skull"/);
});

test('round 6 #10: dead land leaves the heat scale and skull uses its polygon center',()=>{
 const ctx=runtime();ctx.window.WORLD_COUNTRY_PATHS=[{iso:'TST',name:'测试国',color:1,d:'M100 100L200 100L200 200L100 200Z'}];
 const world=[{id:'cn',iso:'TST',name:'测试国',lon:120,lat:30,pop:100}];
 const box={innerHTML:'',querySelectorAll:()=>[]};const gone={healthy:0,vaccinated:0,infected:0,dead:100};
 ctx.window.drawWorld(box,world,{cn:gone},{});
 assert.match(box.innerHTML,/wm-country[^" ]*[^"]*is-gone/);assert.match(box.innerHTML,/--heat:0.00/);
 assert.match(box.innerHTML,/wm-skull[^>]+translate\(150 150\)/);assert.doesNotMatch(box.innerHTML,/class="wm-spot |is-sick/);
 ctx.window.drawWorld(box,world,{cn:{...gone,vaccinated:1}},{});assert.doesNotMatch(box.innerHTML,/is-gone|wm-skull/);
});

test('every symptom has its own drawing and vaccine uses a clean vial',()=>{
 const icons=runtime().PlagueIcons, symptoms=engine.PLAGUE_CARDS.filter(c=>c.tree==='symptom');
 const drawings=symptoms.map(c=>icons.art[icons.cards[c.id]]);
 assert.equal(new Set(drawings).size,symptoms.length);
 assert.equal(icons.cards.vaccine,'vaccineVial');
});
