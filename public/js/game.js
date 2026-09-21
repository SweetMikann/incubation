/* 潜伏期前端：一页搞定，两秒拉一次局面。
   ★2026-09-05 08:17 她要的大厅：进这页一律带 ?room=XXXXXX（&invite=… 客人必带）。
   座位按房号存（plague2.seat.<房号>），没座位就自动坐到空着的那把椅子上（堂妹拿链接进来就是这样坐下的）。
   没带房号＝从大厅之外瞎点进来的，送回大厅。 */
'use strict';

const qs = new URLSearchParams(location.search);
const K = 'plague2.';
const S = {
  room: (qs.get('room') || '').toUpperCase(),
  invite: qs.get('invite') || '',
  token: qs.get('token') || '',
  role: null, level: null, state: null, chat: [], picking: null, busy: false, selected: null,
};
const $ = (id) => document.getElementById(id);
const api = (path, body) => fetch('/plague/api' + path, body
  ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  : undefined).then((r) => r.json());

function loadSeat(code) { try { return JSON.parse(localStorage.getItem(K + 'seat.' + code) || 'null'); } catch (e) { return null; } }
function saveSeat(code, seat) { try { localStorage.setItem(K + 'seat.' + code, JSON.stringify(seat)); } catch (e) { /* ignore */ } }
function loadMe() { try { return localStorage.getItem(K + 'me') || ''; } catch (e) { return ''; } }
function remember() { if (S.room && S.token) saveSeat(S.room, Object.assign(loadSeat(S.room) || {}, { playerToken: S.token, role: S.role })); }
const wan = (n) => {
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '亿';
  if (n >= 1) return Math.round(n) + '万';
  return '0';
};
const inviteQ = () => (S.invite ? 'invite=' + encodeURIComponent(S.invite) : '');
function toLobby(msg) {
  if (msg) $('phase').textContent = msg;
  setTimeout(() => location.replace('./'), msg ? 900 : 0);
}

// ── 进场 ──────────────────────────────────────────────────────────────────
async function boot() {
  if (!S.room) return toLobby('');
  // 大厅之前那版把座位存在 plague2.room / plague2.token（她 MMPHE4 那局的座位就在那儿）
  try {
    const oldRoom = localStorage.getItem(K + 'room'), oldTok = localStorage.getItem(K + 'token');
    if (oldRoom === S.room && oldTok && !loadSeat(S.room)) saveSeat(S.room, { playerToken: oldTok, migrated: true });
  } catch (e) { /* ignore */ }
  if (!S.token) { const seat = loadSeat(S.room); if (seat && seat.playerToken) S.token = seat.playerToken; }
  await pull();
  setInterval(pull, 2000);
}

/* 没座位而房里还有空椅子 → 坐下（客人第一次点开链接走的就是这条）。两把椅子都有人就围观。 */
async function sitDown(d) {
  if (S.sitTried) return false;
  S.sitTried = true;
  if ((d.seats || []).length >= 2) return false;
  const r = await api(`/rooms/${S.room}/join?${inviteQ()}`, { name: loadMe() || '玩家' });
  if (r.error || !r.playerToken) return false;
  S.token = r.playerToken; S.role = r.role;
  remember();
  return true;
}

async function pull() {
  if (S.busy) return;
  let d;
  try { d = await api(`/rooms/${S.room}/state?${inviteQ()}&token=${encodeURIComponent(S.token)}`); }
  catch (e) { $('conn').dataset.conn = 'retry'; $('connTx').textContent = '重连'; return; }
  if (d.error) {
    // 房被关了（大厅左滑删的）→ 回大厅；客人没大厅可回，就把话留在页面上
    if (/没有这个房间/.test(d.error)) { if (S.level !== 'guest') return toLobby('这间房关掉了，回大厅'); }
    $('conn').dataset.conn = 'retry'; $('connTx').textContent = '重连';
    $('phase').textContent = d.error;
    return;
  }
  $('conn').dataset.conn = 'live'; $('connTx').textContent = '实时';
  S.level = d.level || S.level;
  S.host = !!d.host; S.paused = !!d.paused; S.seats = d.seats || [];
  if (d.invite && !S.invite) S.invite = d.invite;
  if (d.role === 'watch' && !S.token && await sitDown(d)) return;   // 坐下了，下一轮再画
  S.role = d.role; S.chat = d.chat || [];
  remember();
  renderTop(d);
  if (!d.state) {
    const two = S.seats.length > 1;
    $('phase').textContent = two ? '正在开局' : '等对面进来';
    $('hint').hidden = false;
    $('hint').innerHTML = two
      ? '两个人都到齐了，正在发牌…'
      : `<b>${d.role === 'plague' ? '你是瘟疫，负责把病传出去。' : d.role === 'cure' ? '你是人类，负责把病按住。' : '两把椅子都空着。'}</b><br>` +
        (S.invite ? '点右上角「邀请」把链接发给对面，' : '等房主把链接发过来，') + '对面一点开就坐下、自动开局。每天你先走两步、对面走两步，然后世界过一天。';
    if (two && !S.startTried) { S.startTried = true; await api(`/rooms/${S.room}/start?${inviteQ()}`, {}); }
    return;
  }
  $('hint').hidden = true;
  S.state = d.state;
  render();
}

/* 顶栏（她 9/5 16:14 圈的：照麻将馆）。房名靠左、小字「房号 · 你是谁」；
   邀请只在开房阶段（对面还没坐下）亮；暂停/结束只有房主有。 */
function renderTop(d) {
  $('roomName').textContent = d.name || '潜伏期';
  const who = S.role === 'plague' ? '你是瘟疫' : S.role === 'cure' ? '你是人类' : '围观';
  $('roomCode').textContent = S.room + ' · ' + who;
  const opening = S.seats.length < 2 && !!S.invite;
  $('invite').hidden = !opening;
  const playing = !!(d.state && !d.state.done);
  $('pause').hidden = !(S.host && playing);
  $('pause').textContent = S.paused ? '继续' : '暂停';
  $('end').hidden = !(S.host && playing);
  $('back').hidden = S.level === 'guest';   // 客人没有大厅可回
}

// ── 画面 ──────────────────────────────────────────────────────────────────
function render() {
  const st = S.state, t = st.totals, pop = st.worldPop;
  document.body.dataset.side = S.role || 'watch';
  const seeding = st.phase === 'seed';
  if (seeding) {
    $('hint').hidden = false;
    $('hint').innerHTML = S.role === 'plague'
      ? '<b>先选一个国家投放。</b><br>人多的国家传得快但富国医疗强；热带和寒带没有对应抗性会拖慢你；格陵兰小又冷，但只要一个口岸关了就再也进不去。点下面任意一个国家。'
      : '<b>等对面挑投放的国家。</b><br>她选完你就能看见零号病人在哪儿。';
  } else {
    $('hint').hidden = true;
  }
  $('phase').textContent = st.done ? `第 ${st.day} 天 · 打完了`
    : S.paused ? `第 ${st.day} 天 · 暂停中`
    : seeding ? (S.role === 'plague' ? '选一个国家投放' : '等对面选投放国家')
    : st.phase === S.role ? `第 ${st.day} 天 · 轮到你，还有 ${st.actionsLeft} 步`
      : `第 ${st.day} 天 · 等对面走`;
  document.body.classList.toggle('is-paused', !!S.paused);
  renderNews();

  const alive = t.healthy + t.vaccinated;
  set('barHealthy', 'numHealthy', alive / pop, wan(alive) + (t.vaccinated ? `（接种 ${wan(t.vaccinated)}）` : ''));
  set('barInfected', 'numInfected', t.infected / pop, wan(t.infected));
  set('barDead', 'numDead', t.dead / pop, wan(t.dead));
  const cureText = st.cure.deploying
    ? `研究完成 · 部署 ${Math.round(st.cure.deployment || 0)}%${st.cure.progress < 100 ? '（被打断）' : ''}`
    : Math.round(st.cure.progress) + '%' + (st.cure.paused > 0 ? ' · 停研' : '');
  set('barCure', 'numCure', st.cure.deploying ? (st.cure.deployment || 0) / 100 : st.cure.progress / 100, cureText);
  $('focusResource').textContent = S.role === 'plague' ? `DNA ${st.plague.dna}` : S.role === 'cure' ? `研究点 ${st.cure.rp}` : '围观';

  renderMap();
  renderCards();
  renderLog();

  if (st.done) showOver();
}
const newsPlayer = {items:[], signature:'', index:0, animation:null, timer:null, paused:false};
function showNews() {
  const ticker=$('newsTicker'), player=newsPlayer;
  if(player.animation) player.animation.cancel(); clearTimeout(player.timer);
  const item=player.items[player.index];
  ticker.textContent=item?`第${item.day}天　${item.text}`:'暂无公开疫情，世界仍未察觉异常';
  ticker.dataset.key=item?item.key:'';
  if(!item) return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  ticker.parentElement.classList.toggle('news-static',reduced);
  const advance=()=>{player.index=(player.index+1)%player.items.length;showNews();};
  if(reduced){if(!player.paused) player.timer=setTimeout(advance,Math.max(8000,item.text.length*250));}
  else {
    const start=ticker.parentElement.clientWidth, end=-ticker.scrollWidth;
    player.animation=ticker.animate([{transform:`translateX(${start}px)`},{transform:`translateX(${end}px)`}],{duration:Math.max(8000,(start-end)/42*1000),easing:'linear',fill:'forwards'});
    player.animation.onfinish=advance;
    if(player.paused) player.animation.pause();
  }
}
function renderNews() {
  if(!$('newsTicker')) return;
  const items=PlaguePresentation.newsQueue(S.state.news);
  const signature=JSON.stringify(items);
  if(signature===newsPlayer.signature) return;
  const current=newsPlayer.items[newsPlayer.index];
  const newMilestone=items.find(x=>x.priority && !newsPlayer.items.some(old=>old.key===x.key));
  newsPlayer.signature=signature;newsPlayer.items=items;
  const retained=current?items.findIndex(x=>x.key===current.key):-1;
  if(retained>=0 && !newMilestone){newsPlayer.index=retained;return;}
  newsPlayer.index=0;showNews();
}
$('newsPause').onclick=()=>{
  const player=newsPlayer;player.paused=!player.paused;
  $('newsPause').textContent=player.paused?'▶':'Ⅱ';$('newsPause').setAttribute('aria-label',player.paused?'播放新闻':'暂停新闻');
  if(player.animation){if(player.paused)player.animation.pause();else player.animation.play();}
  else showNews();
};
$('newsNext').onclick=()=>{if(newsPlayer.items.length){newsPlayer.index=(newsPlayer.index+1)%newsPlayer.items.length;showNews();}};
function set(barId, numId, ratio, text) {
  $(barId).style.width = Math.max(0, Math.min(100, ratio * 100)).toFixed(1) + '%';
  $(numId).textContent = text;
}

// Keep the viewport independent of selection and network renders.
const mapViewport={zoom:1,x:0,y:0,w:1000,h:500};
const mapBox=$('map'),mapPointers=new Map();
let mapGesture=null,mapMoved=false,suppressMapClickUntil=0,mapPaintPending=false;
function gestureFrame(){
 const pts=[...mapPointers.values()],rect=mapBox.getBoundingClientRect();
 return {x:(pts.reduce((s,p)=>s+p.x,0)/pts.length-rect.left)/rect.width,
 y:(pts.reduce((s,p)=>s+p.y,0)/pts.length-rect.top)/rect.height,
 distance:pts.length>1?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0};
}
function beginMapGesture(){mapGesture={...gestureFrame(),view:{...mapViewport}};}
function paintViewport(){
 mapPaintPending=false;
 const svg=mapBox.querySelector('svg');
 if(svg) svg.setAttribute('viewBox',`${mapViewport.x} ${mapViewport.y} ${mapViewport.w} ${mapViewport.h}`);
}
function scheduleViewportPaint(){
 if(mapPaintPending)return;
 mapPaintPending=true;
 requestAnimationFrame(paintViewport);
}
function updateMapGesture(){
 if(!mapGesture || !mapPointers.size)return;
 const f=gestureFrame(),b=mapGesture,v=b.view;
 if(Math.abs(f.x-b.x)+Math.abs(f.y-b.y)>.012 || (b.distance>0 && Math.abs(f.distance-b.distance)>4))mapMoved=true;
 const zoom=Math.max(1,Math.min(6,v.zoom*(b.distance>0?f.distance/b.distance:1)));
 const w=1000/zoom,h=500/zoom;
 Object.assign(mapViewport,{zoom,w,h,x:Math.max(0,Math.min(1000-w,v.x+b.x*v.w-f.x*w)),y:Math.max(0,Math.min(500-h,v.y+b.y*v.h-f.y*h))});
 scheduleViewportPaint();
}
function syncTouches(touches){
 mapPointers.clear();
 for(const touch of touches)mapPointers.set(touch.identifier,{x:touch.clientX,y:touch.clientY});
}
mapBox.addEventListener('touchstart',e=>{
 if(!mapPointers.size)mapMoved=false;
 syncTouches(e.touches);beginMapGesture();mapBox.classList.add('is-gesturing');
},{passive:true});
mapBox.addEventListener('touchmove',e=>{
 syncTouches(e.touches);updateMapGesture();
 if(mapViewport.zoom>1 || mapPointers.size>1)e.preventDefault();
},{passive:false});
function endMapTouch(e){
 if(mapMoved)suppressMapClickUntil=Date.now()+450;
 syncTouches(e.touches);
 if(mapPointers.size)beginMapGesture();
 else {mapGesture=null;mapBox.classList.remove('is-gesturing');if(mapMoved)renderMap();}
}
mapBox.addEventListener('touchend',endMapTouch,{passive:true});
mapBox.addEventListener('touchcancel',endMapTouch,{passive:true});
mapBox.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch')return;
 if(e.pointerType==='mouse' && e.button!==0)return;
 if(!mapPointers.size)mapMoved=false;
 mapPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(mapPointers.size>1)mapMoved=true;
 beginMapGesture();
});
mapBox.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch')return;
 if(!mapPointers.has(e.pointerId))return;
 mapPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 updateMapGesture();
 if(mapMoved && !mapBox.hasPointerCapture(e.pointerId))mapBox.setPointerCapture(e.pointerId);
});
function endMapGesture(e){
 if(e.pointerType==='touch')return;
 if(!mapPointers.has(e.pointerId))return;
 mapPointers.delete(e.pointerId);
 if(mapMoved)suppressMapClickUntil=Date.now()+400;
 if(mapPointers.size)beginMapGesture();
 else {mapGesture=null; if(mapMoved)renderMap();}
}
mapBox.addEventListener('pointerup',endMapGesture);
mapBox.addEventListener('pointercancel',endMapGesture);
mapBox.addEventListener('lostpointercapture',endMapGesture);
mapBox.addEventListener('click',e=>{if(Date.now()<suppressMapClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
mapBox.addEventListener('wheel',e=>{
 e.preventDefault();const r=mapBox.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height,v={...mapViewport};
 const zoom=Math.max(1,Math.min(6,v.zoom*Math.exp(-e.deltaY*.002))),w=1000/zoom,h=500/zoom;
 Object.assign(mapViewport,{zoom,w,h,x:Math.max(0,Math.min(1000-w,v.x+px*(v.w-w))),y:Math.max(0,Math.min(500-h,v.y+py*(v.h-h)))});renderMap();
},{passive:false});
mapBox.tabIndex=0;mapBox.setAttribute('aria-label','世界疫情地图，双指缩放，拖动移动，点击国家查看详情');
mapBox.addEventListener('keydown',e=>{
 if(e.key==='Home'){Object.assign(mapViewport,{zoom:1,x:0,y:0,w:1000,h:500});renderMap();e.preventDefault();}
});
function renderMap() {
  const st = S.state;
  const seedable = !S.paused && st.phase === 'seed' && S.role === 'plague';
  const {zoom,x,y,w,h}=mapViewport;
  drawWorld($('map'), st.world, st.countries, {
    zoom, viewBox: `${x} ${y} ${w} ${h}`,
    pickable: true,
    selected: S.selected,
    onPick: (id) => {
      if (seedable) return confirmSeed(id);   // ★2026-09-11 14:47 她：「不会问你确定选择投放这个区域，直接选了，我都没看是啥国家」
      if (S.picking) return doPick(id);
      S.selected = S.selected === id ? null : id;   // 平时点一下＝看这个国家的数
      renderMap(); renderDetail();
    },
  });
  renderDetail();
  if (seedable && S.selected) {
    const button = document.createElement('button');
    button.className = 'cd-btn'; button.type = 'button';
    button.textContent = '在' + nameOf(S.selected) + '投放';
    button.onclick = () => confirmSeed(S.selected);
    $('detail').appendChild(button);
  }
}

function renderDetail() {
  const st = S.state;
  const box = $('detail');
  const id = S.selected;
  if (!id || !st.countries[id]) {
    // 没点国家时，这一行说全球最要紧的一句
    const worst = Object.values(st.countries).filter((c) => !c.hidden && c.infected > 0)
      .sort((a, b) => b.infected - a.infected)[0];
    const known = Object.values(st.countries).filter((c) => c.known).length;
    const fogged = Object.values(st.countries).filter((c) => c.hidden).length;
    box.textContent = worst
      ? `${nameOf(worst.id)} 病得最重（${wan(worst.infected)}）　已有 ${known} 国公开疫情　点地图上的国家看细节`
      : fogged
        ? `${fogged} 个国家还没通报疫情，里面什么情况你不知道　点地图上的国家看细节`
        : '点地图上的国家看细节';
    return;
  }
  const m = st.world.find((w) => w.id === id);
  const c = st.countries[id];
  const tags = [];
  if (m.climate === 'hot') tags.push('热带');
  if (m.climate === 'cold') tags.push('寒带');
  tags.push(m.wealth === 'rich' ? '富国' : '穷国');
  if (c.closedAir) tags.push('机场已关');
  if (c.closedSea) tags.push('港口已关');
  if (c.quarantine) tags.push('隔离中');
  if (c.care) tags.push('特效药');
  if (c.border) tags.push('边境封锁');
  if (c.researchBoost) tags.push('流动实验室');
  if (c.rescue) tags.push('国际救援');
  if (c.collapsed) tags.push('政府崩溃');
  if (c.known) tags.push('已公开疫情');
  if (c.hidden) {
    box.innerHTML = `<b>${m.name}</b>　${tags.join(' · ')}　人口 ${wan(m.pop)}<br>` +
      '这个国家还没通报疫情，你看不到里面的数字。等它公开，或者等你自己发现。';
  } else {
    box.innerHTML =
      `<b>${m.name}</b>　${tags.join(' · ')}<br>` +
      `健康 ${wan(c.healthy)}　接种 ${wan(c.vaccinated)}　感染 ${wan(c.infected)}　死亡 ${wan(c.dead)}`;
  }
  const moves=(st.legal||[]).filter(move=>move.type==='buy' && move.country===id);
  if(moves.length){
    const actions=document.createElement('div');actions.className='country-actions';
    const title=document.createElement('span');title.className='country-actions-title';title.textContent='这里可以做';actions.appendChild(title);
    for(const move of moves){
      const card=st.cureCards.find(item=>item.id===move.card);if(!card)continue;
      const recommendation=PlagueUIModel.countryRecommendation(card.id,move,st.world,st.countries);
      const button=document.createElement('button');button.type='button';button.className='country-action';
      button.innerHTML=`<strong>${PlagueIcons.svg(PlagueIcons.cards[card.id],15)}${esc(card.name)} · ${card.cost}点</strong><small>${esc(recommendation.reason)}</small>`;
      button.onclick=()=>act({type:'buy',card:card.id,country:id});actions.appendChild(button);
    }
    box.appendChild(actions);
  }
}

function nameOf(id) {
  const m = (S.state.world || []).find((w) => w.id === id);
  return m ? m.name : id;
}

function evolutionDepth(card, byId, memo=new Map()) {
  if(memo.has(card.id)) return memo.get(card.id);
  const parents=[...(card.requires||[]),...(card.requiresAny||[])].map(id=>byId.get(id)).filter(Boolean);
  const depth=parents.length ? 1+Math.max(...parents.map(parent=>evolutionDepth(parent,byId,memo))) : 0;
  memo.set(card.id,depth);return depth;
}
function drawEvolutionLinks(stage,cards) {
  /* ★2026-09-11 15:28 她：「有些相关联的线没有连接在一起，也可能是我缩放后导致的」——
     之前用 getBoundingClientRect 量，stage 一上 CSS zoom 量出来的是屏幕坐标、画进去的却是局部坐标，差一个倍数就对不上。
     改用 offsetLeft/Top 的排版坐标（卡的 offsetParent 是 .evolution-column，column 的是 stage），跟缩放、滚动都无关。 */
  const svg=stage.querySelector('.evolution-links');
  svg.setAttribute('width',stage.scrollWidth);svg.setAttribute('height',stage.scrollHeight);
  const box=el=>{const col=el.offsetParent&&el.offsetParent!==stage?el.offsetParent:null;const x=el.offsetLeft+(col?col.offsetLeft:0),y=el.offsetTop+(col?col.offsetTop:0);return {left:x,right:x+el.offsetWidth,cy:y+el.offsetHeight/2};};
  const paths=[];
  for(const card of cards){
    const target=stage.querySelector(`[data-card="${card.id}"]`);if(!target)continue;
    for(const parentId of [...(card.requires||[]),...(card.requiresAny||[])]){
      const source=stage.querySelector(`[data-card="${parentId}"]`);if(!source)continue;
      const a=box(source),b=box(target);
      const x1=a.right,y1=a.cy,x2=b.left,y2=b.cy,curve=Math.max(18,(x2-x1)*.46);
      paths.push(`<path d="M${x1} ${y1} C${x1+curve} ${y1} ${x2-curve} ${y2} ${x2} ${y2}"/>`);
    }
  }
  svg.innerHTML=paths.join('');
}
function makeCardButton(card,list,mine,myTurn,legal,pool) {
  const st=S.state,status=PlagueUIModel.cardAvailability(card,{side:S.role,list,owned:mine.owned||[],pool,myTurn,legal,day:st.day,cure:st.cure});
  const owned=(mine.owned||[]).filter(id=>id===card.id).length;
  const button=document.createElement('button');button.type='button';button.className=`card-btn is-${status.kind}`;button.dataset.card=card.id;button.dataset.tree=card.tree||'cure';
  if(card.recommended && S.role==='cure') button.classList.add('research-remedy');   // Codex 4c66ba2：停研时测序卡高亮
  button.disabled=status.kind!=='ready';
  const statusIcon=status.kind==='done'?PlagueIcons.svg('check',13):['prereq','stage','awareness'].includes(status.kind)?PlagueIcons.svg('lock',12):'';
  const effects=S.role==='plague'?PlagueUIModel.effectSummary(card):null;
  button.innerHTML=`<span class="card-art">${PlagueIcons.svg(PlagueIcons.cards[card.id],28)}</span>`+
    `<span class="t"><span class="card-name">${esc(card.name)}${owned&&card.repeat?` ×${owned}`:''}</span><i>${statusIcon}${esc(status.label)}</i></span>`+
    `<span class="d">${esc(card.desc)}</span>`+
    (effects?`<span class="effect-summary"><span class="effect-gain">增加：${esc(effects.gain)}</span><span class="effect-tradeoff">代价：${esc(effects.tradeoff)}</span></span>`:'');
  button.onclick=()=>{if(card.kind==='country')startPick(card);else act({type:'buy',card:card.id});};
  return button;
}
/* ★2026-09-11 15:13 她：「给下面的也加个缩放吧，方便我截图进化树」；15:50「人类那部分的界面也做一下缩放」——
   双指捏合缩放（CSS zoom 走排版，滚动宽度跟着变，连线一起缩），0.45～1.6 倍，缩放值记在 S[key]，重画不丢。
   surface 收手势，target 被缩放。 */
function attachPinch(surface,target,key){
  target.style.zoom=S[key]||1;
  let pinch=null;
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  surface.addEventListener('touchstart',e=>{ if(e.touches.length===2) pinch={d0:dist(e.touches),z0:S[key]||1}; },{passive:true});
  surface.addEventListener('touchmove',e=>{
    if(!pinch||e.touches.length!==2) return;
    e.preventDefault();
    S[key]=Math.max(.45,Math.min(1.6,pinch.z0*dist(e.touches)/pinch.d0));
    target.style.zoom=S[key];
  },{passive:false});
  const endPinch=e=>{ if(e.touches.length<2) pinch=null; };
  surface.addEventListener('touchend',endPinch,{passive:true});surface.addEventListener('touchcancel',endPinch,{passive:true});
}
function renderEvolutionTree(box,cards,list,mine,myTurn,pool) {
  const byId=new Map(cards.map(card=>[card.id,card])),memo=new Map(),groups=[];
  for(const card of cards){const depth=evolutionDepth(card,byId,memo);(groups[depth]||(groups[depth]=[])).push(card);}
  const scroll=document.createElement('div');scroll.className='evolution-scroll';scroll.setAttribute('aria-label','进化路线，可左右滑动');
  const stage=document.createElement('div');stage.className='evolution-stage';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('evolution-links');svg.setAttribute('aria-hidden','true');stage.appendChild(svg);
  for(const [depth,group] of groups.entries()){
    if(!group)continue;const column=document.createElement('div');column.className='evolution-column';column.dataset.depth=depth;
    for(const card of group){const legal=(S.state.legal||[]).filter(move=>move.card===card.id);column.appendChild(makeCardButton(card,list,mine,myTurn,legal,pool));}
    stage.appendChild(column);
  }
  scroll.appendChild(stage);box.appendChild(scroll);scroll.scrollLeft=S.evolutionScroll||0;
  scroll.addEventListener('scroll',()=>{S.evolutionScroll=scroll.scrollLeft;},{passive:true});
  /* ★2026-09-11 15:13 她：「给下面的也加个缩放吧，方便我截图进化树」——双指捏合缩放整棵树（CSS zoom 走排版，滚动宽度跟着变，连线一起缩），
     0.45～1.6 倍，缩放值记在 S.treeZoom，重画不丢。 */
  attachPinch(scroll,stage,'treeZoom');
  requestAnimationFrame(()=>drawEvolutionLinks(stage,cards));
}

function renderCards() {
  const st = S.state;
  const mine = S.role === 'plague' ? st.plague : st.cure;
  $('wallet').textContent = S.role === 'plague'
    ? `DNA ${st.plague.dna}　传染 ${Number((st.plague.effectiveInfectivity ?? st.plague.infectivity).toFixed(2))}　致命 ${st.plague.lethality}`
    : S.role === 'cure'
      ? `研究点 ${st.cure.rp}　研究力 ${Math.round((st.cure.researchCapacity || 0) * 100)}%　应对 ${Math.round((st.cure.responseCoverage || 0) * 100)}%　${st.cure.deploying ? `部署 ${Math.round(st.cure.deployment || 0)}%` : `解药 ${Math.round(st.cure.progress)}%`}`
      : '围观中';
  const income = $('incomeHint');
  if (S.role === 'plague' && st.plague.dailyIncome) {
    const d = st.plague.dailyIncome;
    income.textContent = `每天 +${d.min}${d.max > d.min ? `～${d.max}` : ''} DNA · 新国家另奖 ${st.plague.newCountryReward || 1}`;
    if(st.plague.asymptomaticInfectivityCap != null) income.textContent += ` · 无症状传染上限 ${st.plague.asymptomaticInfectivityCap}，里程碑不奖 DNA`;   // Codex 5769f36 第九节①
  } else if (S.role === 'cure' && Number.isFinite(st.cure.dailyIncome)) {
    income.textContent = `每天 +${st.cure.dailyIncome} 研究点`;
    if(st.cure.incomeBreakdown && st.cure.incomeBreakdown.message) income.textContent += ' · ' + st.cure.incomeBreakdown.message;   // Codex 5769f36 第九节⑤ 崩溃扣款提示
  } else income.textContent = '';
  const box = $('cards');
  /* ★2026-09-11 14:45 她（试玩中）：「选择症状传染方式那边滑动不流畅，往下滑没一会儿，会自己弹上去」——
     pull 每 2 秒 render 一次，这里每次都 innerHTML='' 重建整块，页面高度抖一下，iOS 就把她滑到的位置弹回去。
     跟疫情通报/聊天一样：内容没变就一个字都别动。 */
  const myTurn = !st.done && !S.paused && st.phase === S.role;
  const sig=JSON.stringify([S.role,S.tree,st.phase,st.day,st.actionsLeft,myTurn,st.legal,st.cure&&[st.cure.rp,st.cure.owned,st.cure.stage,st.cure.progress|0,st.cure.dailyIncome],st.plague&&[st.plague.dna,st.plague.infectivity,st.plague.lethality,st.plague.owned,st.plague.dailyIncome],(S.role==='plague'?st.plagueCards:st.cureCards)]);
  if(box.dataset.sig===sig) return;
  box.dataset.sig=sig;
  const oldTree=box.querySelector('.evolution-scroll');if(oldTree)S.evolutionScroll=oldTree.scrollLeft;
  box.innerHTML = '';
  $('pass').disabled = !myTurn;
  if (!myTurn) $('pass').classList.remove('nudge');
  if (S.role !== 'plague' && S.role !== 'cure') return;

  if (st.phase === 'seed') { box.innerHTML = ''; $('wallet').textContent = S.role === 'plague' ? '先投放，再进化' : '等对面投放'; return; }
  const list = S.role === 'plague' ? st.plagueCards : st.cureCards;
  let shown = S.role==='cure' ? list.slice().sort((a,b)=>Number(!!b.recommended)-Number(!!a.recommended)) : list;   // Codex 4c66ba2：推荐的解法卡置顶
  if (S.role === 'plague') {
    const trees = [{id:'transmission',name:'传播'}, {id:'symptom',name:'症状'}, {id:'ability',name:'能力'}];
    if (!trees.some((t) => t.id === S.tree)) S.tree = 'transmission';
    const nav = document.createElement('div'); nav.className = 'tree-tabs';
    for (const tree of trees) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.innerHTML = PlagueIcons.svg({transmission:'virus',symptom:'pulse',ability:'shield'}[tree.id], 17) + tree.name;
      tab.className = tree.id === S.tree ? 'is-on' : '';
      tab.onclick = () => { S.tree = tree.id; renderCards(); };
      nav.appendChild(tab);
    }
    box.appendChild(nav);
    shown = list.filter((card) => card.tree === S.tree);
  } else {
    const stageName = { early:'早期侦察', response:'疫情应对', late:'解药攻坚', deployment:'全球部署' }[st.cure.stage] || '疫情应对';
    const stage = document.createElement('div'); stage.className = 'cure-stage'; stage.textContent = `当前阶段：${stageName}`;
    box.appendChild(stage);
  }
  /* 2026-09-05 13:28 她：「点数也没有变化给我选择？」——手里的点买不起任何一张时整排全灰，
     她以为是坏了。把「差几点、为什么灰」直接写在钱包那行，点国家只是看数也说明白。 */
  if (myTurn) {
    const buyable = (st.legal || []).filter((m) => m.type === 'buy');
    $('pass').classList.toggle('nudge', !buyable.length);   // 没东西可买＝该结束回合了，按钮一闪一闪（她 13:55「为啥我点不了了」）
    if (!buyable.length) {
      const pool = S.role === 'plague' ? st.plague.dna : st.cure.rp;
      const cheapest = Math.min(...list.filter((c) => c.unlocked && (!(mine.owned || []).includes(c.id) || c.repeat)).map((c) => c.cost));
      const gap = isFinite(cheapest) ? cheapest - pool : null;
      $('wallet').textContent += gap != null && gap > 0
        ? `　·　最便宜的还差 ${gap} 点，先「结束本回合」，明天再买`
        : '　·　这回合没有能买的，先「结束本回合」';
    } else {
      $('wallet').textContent += `　·　还能走 ${st.actionsLeft} 步，点国家只是看数，不算动作`;
    }
  }
  // Codex 4c66ba2（第八节 4/5 条）：停研提示 + 最后防线倒计时写进钱包那行
  if(S.role==='cure' && st.cure.researchStatus && st.cure.researchStatus.message) $('wallet').textContent += '　·　' + st.cure.researchStatus.message;
  if(S.role==='cure' && st.cure.lastStandRemaining != null) $('wallet').textContent += `　·　最后防线剩 ${st.cure.lastStandRemaining} 天：研究达到 40% 或恢复健康与接种人口至 1%`;
  if(S.role==='cure' && st.cure.lastStandImmunityDays > 0) $('wallet').textContent += `　·　最后防线保护期还剩 ${st.cure.lastStandImmunityDays} 天`;   // Codex 5769f36 第九节③
  const walletText = $('wallet').textContent;
  const metricIcons = {DNA:'dna', '传染':'virus', '致命':'skull', '研究点':'flask', '研究力':'flask', '应对':'shield', '解药':'syringe', '部署':'cross'};
  $('wallet').innerHTML = esc(walletText).replace(/(DNA|传染|致命|研究点|研究力|应对|解药|部署) ([\d.]+%?)/g,
    (_, label, value) => `<span class="wallet-metric">${PlagueIcons.svg(metricIcons[label], 19)}<span>${label} <b>${value}</b></span></span>`);
  const pool=S.role==='plague'?st.plague.dna:st.cure.rp;
  if(S.role==='plague') renderEvolutionTree(box,shown,list,mine,myTurn,pool);
  else {
    const grid=document.createElement('div');grid.className='card-grid';box.appendChild(grid);
    for(const card of shown){const legal=(st.legal||[]).filter(move=>move.card===card.id);grid.appendChild(makeCardButton(card,list,mine,myTurn,legal,pool));}
    attachPinch(grid,grid,'gridZoom');
  }
}

function renderLog() {
  // ★2026-09-11 搬自 Codex c674496：「对方最近三手」固定在通报页顶上，最新在前，只用过了迷雾的日志；围观不显示
  const recent = PlaguePresentation.recentActions(S.state.log, S.role);
  $('opponentRecent').hidden = !['cure','plague'].includes(S.role);
  $('opponentActions').innerHTML = recent.map(entry => `<div class="opponent-action"><span><small>第 ${entry.day} 天</small><strong>${esc(entry.text)}</strong></span></div>`).join('') || '<p class="dim">对方还没有行动</p>';
  const box=$('log'),groups=PlaguePresentation.dayGroups(S.state.log);
  const signature=JSON.stringify(groups);
  if(box.dataset.signature!==signature){
    const following=!box.dataset.signature || box.scrollHeight-box.clientHeight-box.scrollTop<24;
    const oldTop=box.scrollTop;
    box.innerHTML=groups.map(group=>`<section class="log-day"><h3>第 ${group.day} 天</h3>${group.entries.map((entry,index)=>{
      const opponent=entry.type==='action' && entry.role!==S.role;
      const cls=entry.type==='milestone'?'milestone':opponent?'them':entry.type==='spread'?'spread':'';
      return `<div class="log-entry ${cls}" data-entry="${group.day}-${index}">${opponent && entry.card ? PlagueIcons.svg(PlagueIcons.cards[entry.card] || 'search',18) : ''}<span>${esc(entry.text)}</span></div>`;
    }).join('')}</section>`).join('')||'<p class="dim">暂无通报</p>';
    box.dataset.signature=signature;
    box.scrollTop=following?box.scrollHeight:oldTop;
    const total=(S.state.log||[]).length, seenLog=S.logSeen==null?total:S.logSeen;
    if(!$('chatWin').hidden && $('chatCard').dataset.tab==='log') S.logSeen=total; else $('logBadge').hidden=!(total>seenLog);
  }
  const chatBox=$('chat');
  if(chatBox){
    const chats=JSON.stringify(S.chat);
    if(chatBox.dataset.signature!==chats){
      const following=!chatBox.dataset.signature||chatBox.scrollHeight-chatBox.clientHeight-chatBox.scrollTop<24;
      chatBox.innerHTML=S.chat.slice(-12).map(m=>`<div class="talk${m.role===S.role?' me':''}"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join('');
      chatBox.dataset.signature=chats;if(following) chatBox.scrollTop=chatBox.scrollHeight;
      // 小窗关着时，对面新说的话在气泡上计数（自己说的不算）
      const seen=S.chatSeen==null?S.chat.length:S.chatSeen;
      if($('chatWin').hidden){ const n=S.chat.slice(seen).filter(m=>m.role!==S.role).length; $('chatBadge').hidden=!n; }
      else S.chatSeen=S.chat.length;

    }
  }
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ── 动作 ──────────────────────────────────────────────────────────────────
/* ★2026-09-11 搬自 Codex c674496：她 9/6 第 14 天原话「他不会把死亡或者感染人数多的排在前面」——
   默认按「感染＋死亡」降序、前五国展开、其余折叠；一个选择框可切回按卡牌作用推荐。 */
function startPick(card, sortMode = 'burden') {
  S.picking = card;
  const legal = (S.state.legal || []).filter((m) => m.card === card.id);
  const ranked=PlagueUIModel.rankCountries(card.id,legal,S.state.world,S.state.countries,sortMode);
  const featuredCount=5;
  $('pickTitle').textContent = card.name + '：选一个国家';
  const box = $('pickList');
  box.innerHTML = '';
  const top = document.createElement('div'); top.className = 'pick-top';
  const caption = document.createElement('label'); caption.className = 'pick-caption'; caption.textContent = '国家排序 ';
  const sort = document.createElement('select'); sort.setAttribute('aria-label','国家排序');
  for (const [value,label] of [['burden','感染＋死亡'],['recommended','按卡牌作用推荐']]) {
    const option = document.createElement('option'); option.value=value; option.textContent=label; sort.append(option);
  }
  sort.value=sortMode; sort.onchange=()=>startPick(card,sort.value); caption.append(sort);
  box.append(caption, top);
  const more = document.createElement('details'); more.className = 'pick-more';
  const summary = document.createElement('summary'); summary.textContent = `展开其余 ${Math.max(0, ranked.length - featuredCount)} 国`; more.append(summary);
  const rest = document.createElement('div'); rest.className = 'pick-rest'; more.append(rest);
  if (ranked.length > featuredCount) box.append(more);
  for (const [index, item] of ranked.entries()) {
    const m=item.move;
    const meta = S.state.world.find((w) => w.id === m.country);
    const b = document.createElement('button');
    b.innerHTML=`<strong>${index===0 && sortMode==='recommended'?'<i>首选</i>':''}${esc(meta.name)}</strong><small>${esc(item.reason)}</small>`;
    b.onclick = () => doPick(m.country);
    (index < featuredCount ? top : rest).appendChild(b);
  }
  $('picker').hidden = false;
}
function confirmSeed(id) {
  const m = S.state.world.find((w) => w.id === id); if (!m) return;
  S.selected = id; renderMap();
  S.picking = null;
  const tags = [m.climate === 'hot' ? '热带' : m.climate === 'cold' ? '寒带' : '温带', m.wealth === 'rich' ? '富国' : '穷国', `人口 ${wan(m.pop)}`];
  $('pickTitle').textContent = `在「${m.name}」投放零号病人？`;
  const box = $('pickList'); box.innerHTML = '';
  const caption = document.createElement('p'); caption.className = 'pick-caption'; caption.textContent = tags.join(' · ') + ' · 投下去就改不了了';
  const ok = document.createElement('button'); ok.className = 'pick-seed-ok'; ok.innerHTML = `<strong>就选这里</strong><small>确定在 ${esc(m.name)} 投放</small>`;
  ok.onclick = () => { $('picker').hidden = true; act({ type: 'seed', country: id }); };
  box.append(caption, ok);
  $('picker').hidden = false;
}
function doPick(country) {
  const card = S.picking;
  S.picking = null;
  $('picker').hidden = true;
  if (card) act({ type: 'buy', card: card.id, country });
}
async function act(move) {
  if (S.busy) return;
  S.busy = true;
  let r;
  /* ★2026-09-11 17:58 她：「我肯定点了，我看他灰了才点的结束」——api() 一抛（网络抖一下）S.busy 永远是 true，
     之后每一下点击和每一次 pull 都被静默吞掉，页面就冻在旧画面上。finally 兜住，失败弹一句。 */
  try { r = await api(`/rooms/${S.room}/action?${inviteQ()}`, { playerToken: S.token, move }); }
  catch (e) { r = { error: '网络没送到，再点一次' }; }
  finally { S.busy = false; }
  if (r.error) { $('phase').textContent = r.error; toast(r.error); return; }
  S.state = r.state; render();
}
/* ★2026-09-11 17:57 她：「我以为点了就是买了实际上要双击？」——她第一下点在灰卡上（还没轮到），没任何反应；
   #phase 又是隐藏的，买失败也看不见。加一条小吐司：点灰卡说为什么灰，买失败说原因。 */
function toast(text) {
  let el = $('pgToast'); if (!el) { el = document.createElement('div'); el.id = 'pgToast'; el.className = 'pg-toast'; document.body.appendChild(el); }
  el.textContent = text; el.classList.add('is-on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('is-on'), 2200);
}
$('cards').addEventListener('click', (ev) => {
  // disabled 的按钮不发事件，CSS 给它 pointer-events:none 让事件落到父级，再从坐标反查是哪张卡
  // elementsFromPoint 会跳过 pointer-events:none 的元素，所以按坐标自己找那张灰卡
  const btn = Array.from(document.querySelectorAll('#cards .card-btn:disabled')).find((b) => { const r = b.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
  if (!btn) return;
  const why = btn.querySelector('.t i')?.textContent?.trim();
  toast(why || '现在不能买这张');
});

function showOver() {
  const st = S.state, r = st.result || {};
  if (S.overSeen === st.day) return;   // 点过「看终局」就别每两秒再弹一次
  const iWon = r.winner === S.role;
  $('overTitle').textContent = r.winner === 'plague' ? '瘟疫赢了' : r.winner === 'cure' ? '人类赢了' : '这局结束了';
  $('overWhy').textContent = (r.winner ? (iWon ? '你赢了。' : '你输了。') : '没分胜负。') + (r.why || '');
  $('overStats').innerHTML =
    `<li><span>撑了</span><b>${r.day} 天</b></li>` +
    `<li><span>死亡</span><b>${wan(r.dead)}</b></li>` +
    `<li><span>幸存</span><b>${wan(r.healthy)}</b></li>` +
    `<li><span>解药进度</span><b>${r.cure}%</b></li>`;
  $('over').hidden = false;
}

for (const [id, icon] of [['numHealthy','shield'], ['numInfected','virus'], ['numDead','skull'], ['numCure','syringe']]) {
  const label = $(id).parentElement.querySelector('em');
  label.insertAdjacentHTML('afterbegin', PlagueIcons.svg(icon, 17));
}
const goneLegend = document.querySelector('.legend-gone');
if (goneLegend) goneLegend.innerHTML = PlagueIcons.svg('skull', 13);
$('pass').onclick = () => act({ type: 'pass' });
if (window.BiscaIcons && BiscaIcons.svg) $('back').innerHTML = BiscaIcons.svg('back', 22);
$('invite').onclick = async () => {
  const link = `${location.origin}/plague/game.html?room=${encodeURIComponent(S.room)}&invite=${encodeURIComponent(S.invite)}`;
  try { await navigator.clipboard.writeText(link); CdUI.toast('邀请链接复制好了，发给对面'); }
  catch (e) { window.prompt('长按复制这条链接', link); }
};
$('pause').onclick = async () => {
  if (S.paused) {
    const r = await api(`/rooms/${S.room}/resume?${inviteQ()}`, { playerToken: S.token });
    if (r.error) return CdUI.toast(r.error, true);
    CdUI.toast('继续了'); return pull();
  }
  if (!window.confirm('暂停这一局？局面原样留着，下次进来接着打。')) return;
  const r = await api(`/rooms/${S.room}/pause?${inviteQ()}`, { playerToken: S.token });
  if (r.error) return CdUI.toast(r.error, true);
  CdUI.toast('暂停了，局面留着'); pull();
};
$('end').onclick = async () => {
  if (!window.confirm('结束这一局？不分胜负，房间和座位留着，可以再开一局。')) return;
  const r = await api(`/rooms/${S.room}/end?${inviteQ()}`, { playerToken: S.token });
  if (r.error) return CdUI.toast(r.error, true);
  pull();
};
$('pickCancel').onclick = () => { S.picking = null; $('picker').hidden = true; };
$('overClose').onclick = () => { S.overSeen = S.state && S.state.day; $('over').hidden = true; };
$('again').onclick = async () => {
  S.overSeen = null;
  $('over').hidden = true;
  await api(`/rooms/${S.room}/start?${inviteQ()}`, {});
  pull();
};
$('sayForm').addEventListener('submit', (ev) => { ev.preventDefault(); say(); });
function showTab(tab) {
  $('chatCard').dataset.tab = tab;
  for (const t of document.querySelectorAll('.pg-chat-tabs button')) t.classList.toggle('is-on', t.dataset.tab === tab);
  $('chatFab').classList.toggle('is-on', tab === 'chat'); $('logFab').classList.toggle('is-on', tab === 'log');
  const box = tab === 'chat' ? $('chat') : $('log'); box.scrollTop = box.scrollHeight;
  if (tab === 'chat') { S.chatSeen = S.chat.length; $('chatBadge').hidden = true; }
  else { S.logSeen = (S.state && S.state.log || []).length; $('logBadge').hidden = true; }
}
function openChat(on, tab) {
  $('chatWin').hidden = !on; document.body.classList.toggle('chat-open', on);
  if (on) showTab(tab || $('chatCard').dataset.tab || 'chat');
}
$('chatFab').addEventListener('click', () => openChat($('chatWin').hidden || $('chatCard').dataset.tab !== 'chat', 'chat'));
$('logFab').addEventListener('click', () => openChat($('chatWin').hidden || $('chatCard').dataset.tab !== 'log', 'log'));
for (const tab of document.querySelectorAll('.pg-chat-tabs button')) tab.addEventListener('click', () => showTab(tab.dataset.tab));

$('chatWin').addEventListener('click', (ev) => { if (ev.target === $('chatWin')) openChat(false); });   // 点卡外面收起
// iOS 键盘弹起时 fixed 的小窗会被键盘盖住：跟着可视视口抬
if (window.visualViewport) {
  const lift = () => { const vv = window.visualViewport; const gap = Math.max(0, innerHeight - vv.height - vv.offsetTop); $('chatCard').style.transform = gap ? `translateY(-${Math.min(gap, innerHeight * .35)}px)` : ''; };
  visualViewport.addEventListener('resize', lift); visualViewport.addEventListener('scroll', lift);
}
$('say').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); say(); }
});
async function say() {
  const v = $('say').value.trim();
  if (!v) return;
  $('say').value = '';
  await api(`/rooms/${S.room}/chat?${inviteQ()}`, { playerToken: S.token, text: v });
  pull();
}

boot();
