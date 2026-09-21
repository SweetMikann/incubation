const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('../public/js/plague-ui-model.js');

test('card labels distinguish cooldown, prerequisites and insufficient points',()=>{
 const base={side:'cure',list:[],owned:[],pool:4,myTurn:true,legal:[],day:12,cure:{stage:'response',awareness:4,lastSequenceDay:11,lastPublicHealthDay:null}};
 assert.equal(ui.cardAvailability({id:'sequence',cost:20,stage:'early'},base).label,'冷却剩 2 天');
 const plague={...base,side:'plague',list:[{id:'air',name:'空气传播 I'}],owned:[],pool:20};
 assert.equal(ui.cardAvailability({id:'air2',cost:11,requires:['air']},plague).label,'缺少前置：空气传播 I');
 assert.equal(ui.cardAvailability({id:'air',cost:11},plague).label,'当前不可用');
 assert.equal(ui.cardAvailability({id:'air',cost:11},{...plague,pool:5,legal:[{}]}).label,'点数不足：还差 6');
});

test('country recommendations follow the selected action instead of one global burden order',()=>{
 const world=[{id:'a',research:9,pop:1000},{id:'b',research:2,pop:1000}],countries={
  a:{healthy:900,vaccinated:0,infected:20,dead:80,hidden:false,collapsed:false},
  b:{healthy:100,vaccinated:0,infected:500,dead:400,hidden:false,collapsed:true}
 },moves=[{country:'a'},{country:'b'}];
 assert.equal(ui.rankCountries('fieldLab',moves,world,countries)[0].move.country,'a');
 assert.match(ui.rankCountries('fieldLab',moves,world,countries)[0].reason,/研究贡献/);
 assert.equal(ui.rankCountries('rescue',moves,world,countries)[0].move.country,'b');
 assert.match(ui.rankCountries('rescue',moves,world,countries)[0].reason,/政府已崩溃/);
});

test('evolution screen exposes route links and gain/tradeoff copy',()=>{
 const effect=ui.effectSummary({desc:'咳嗽',eff:{infectivity:2,severity:1}});
 assert.match(effect.gain,/传播 \+2/);assert.equal(effect.tradeoff,'暴露度 +1');
 const js=fs.readFileSync(require.resolve('../public/js/game.js'),'utf8');
 assert.match(js,/evolution-links/);assert.match(js,/增加：/);assert.match(js,/代价：/);
 const html=fs.readFileSync(require.resolve('../public/game.html'),'utf8');
 assert(html.indexOf('id="map"') < html.indexOf('class="pg-news"'));
});
