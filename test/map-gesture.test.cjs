const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('map pinch anchors midpoint, pans within bounds, and blocks drag clicks but preserves taps',()=>{
 const handlers={},captured=new Set();let boxValue;
 const classes=new Set();
 const box={addEventListener:(n,f)=>handlers[n]=f,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500}),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),setAttribute:()=>{},classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},querySelector:()=>({setAttribute:(_,v)=>boxValue=v})};
 const ctx=vm.createContext({$:()=>box,Date,Math,Map,renderMap:()=>{},requestAnimationFrame:f=>f()});
 const source=fs.readFileSync(require.resolve('../public/js/game.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('const mapViewport='),source.indexOf('function renderMap()'))+';globalThis.view=mapViewport',ctx);
 const touch=(identifier,x,y)=>({identifier,clientX:x,clientY:y}),event=(touches)=>({touches,preventDefault:()=>{}});
 handlers.touchstart(event([touch(1,400,250)]));assert(classes.has('is-gesturing'));
 handlers.touchend(event([]));let blocked=false;handlers.click({preventDefault:()=>blocked=true,stopImmediatePropagation:()=>{}});assert.equal(blocked,false);
 handlers.touchstart(event([touch(1,400,250),touch(2,600,250)]));
 handlers.touchmove(event([touch(1,300,250),touch(2,700,250)]));
 assert.equal(ctx.view.zoom,2);assert.equal(ctx.view.x,250);assert.equal(ctx.view.y,125);assert.ok(boxValue);
 handlers.touchend(event([touch(1,300,250)]));handlers.touchmove(event([touch(1,400,250)]));assert.equal(ctx.view.x,200);
 handlers.touchend(event([]));handlers.click({preventDefault:()=>blocked=true,stopImmediatePropagation:()=>{}});assert.equal(blocked,true);assert(!classes.has('is-gesturing'));
 handlers.keydown({key:'Home',preventDefault:()=>{}});assert.equal(ctx.view.zoom,1);assert.equal(ctx.view.x,0);
});
