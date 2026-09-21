/* 世界地图：底图来自 Natural Earth 公有领域国家边界，游戏视觉与交互为原创。
   全部对局国家直接映射到真实国土，颜色随疫情走：干净=雾色、感染=红、死绝=灰。 */
'use strict';

// 大陆轮廓：viewBox 1000×520，只求形状认得出、圆润干净，不求测绘精度
const LAND = [
  // 北美：阿拉斯加→加拿大→美国→佛罗里达→墨西哥→中美地峡
  'M60 80 C90 55 200 40 300 60 C340 70 330 110 310 140 C295 165 300 190 275 210 C250 230 235 235 215 225 C195 215 175 190 155 165 C130 135 80 115 60 80 Z',
  // 南美
  'M280 250 C320 240 380 280 400 320 C415 350 380 400 340 430 C315 450 295 455 300 425 C305 395 290 350 275 310 C265 280 265 258 280 250 Z',
  // 格陵兰
  'M360 40 C395 25 450 40 440 70 C430 95 380 95 365 75 C355 60 350 48 360 40 Z',
  // 欧洲（带北欧那一勾）
  'M470 160 C480 120 510 60 540 70 C560 76 555 110 570 120 C590 132 600 145 585 160 C560 185 500 190 470 160 Z',
  // 非洲
  'M465 190 C500 175 580 185 600 210 C620 235 635 260 620 285 C600 320 580 380 565 410 C550 435 530 400 525 350 C518 300 480 260 465 220 C458 205 455 195 465 190 Z',
  // 亚洲
  'M585 150 C620 100 700 55 790 55 C880 55 950 80 950 100 C950 125 890 130 860 150 C830 170 840 190 820 200 C790 215 760 205 740 225 C720 245 700 275 680 260 C660 245 660 210 640 195 C615 178 590 175 585 150 Z',
  // 日本
  'M870 145 C890 135 905 165 890 190 C875 210 860 185 870 145 Z',
  // 南洋群岛
  'M790 290 C830 280 870 295 860 312 C848 330 800 320 790 302 Z',
  // 澳洲
  'M800 360 C840 340 910 355 915 390 C918 420 870 430 840 415 C815 402 790 380 800 360 Z',
];

/* 国家落点：按真经纬度换算过（x=(lon+180)/360*1000，y=(85-lat)/145*500），
   所以点落在自己那块大陆上，不是我瞎摆的。 */
const SPOT = {
  us: [228, 159], mx: [214, 216], br: [356, 328], ar: [322, 414], gl: [383, 52],
  de: [528, 117], ru: [772, 96], kz: [686, 132], eg: [583, 200], ng: [522, 259],
  in: [719, 222], cn: [806, 170], jp: [890, 158], id: [832, 300], au: [872, 382],
};

/* 名字挂在点的上面还是下面：挤在一起的自己让一让 */
const LABEL_UP = { us: 1, gl: 1, ru: 1, kz: 1, jp: 1 };
const GAME_ISO = {
  cn: 'CHN', in: 'IND', us: 'USA', br: 'BRA', ru: 'RUS', ng: 'NGA', id: 'IDN', jp: 'JPN',
  de: 'DEU', eg: 'EGY', mx: 'MEX', ar: 'ARG', kz: 'KAZ', au: 'AUS', gl: 'GRL',
};

/* 画一帧。countries=引擎给的国家状态，world=国家元数据，
   opts: { pickable, onPick, selected } */
// Put a marker inside the largest land polygon, not at an old label/capital point.
const landCenterCache = new Map();
function landCenter(shape) {
  if(landCenterCache.has(shape.iso)) return landCenterCache.get(shape.iso);
  const rings=(shape.d.match(/M[^Z]+Z/g)||[]).map(r=>Array.from(r.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g),m=>[+m[1],+m[2]]));
  const area=r=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0);
  const ring=rings.slice().sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)))[0];
  if(!ring||ring.length<3)return null;
  let x=0,y=0;const a=area(ring);
  for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length],cross=p[0]*q[1]-q[0]*p[1];x+=(p[0]+q[0])*cross;y+=(p[1]+q[1])*cross;}
  const inside=(point,r)=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const p=r[i],q=r[j];if((p[1]>point[1])!==(q[1]>point[1]) && point[0]<(q[0]-p[0])*(point[1]-p[1])/(q[1]-p[1])+p[0])hit=!hit;}return hit;};
  let point=[x/(3*a),y/(3*a)];
  if(!Number.isFinite(point[0]) || !rings.reduce((hit,r)=>hit!==inside(point,r),false)){
    const ys=ring.map(p=>p[1]);y=(Math.min(...ys)+Math.max(...ys))/2;
    const cuts=[];for(const r of rings)for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];if((p[1]>y)!==(q[1]>y))cuts.push(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]));}
    cuts.sort((a,b)=>a-b);let span=-1;
    for(let i=0;i+1<cuts.length;i+=2)if(cuts[i+1]-cuts[i]>span){span=cuts[i+1]-cuts[i];point=[(cuts[i]+cuts[i+1])/2,y];}
  }
  landCenterCache.set(shape.iso,point);return point;
}
function drawWorld(box, world, countries, opts) {
  opts = opts || {};
  const parts = [];
  parts.push(`<svg class="wm" style="--map-zoom:${opts.zoom || 1}" viewBox="${opts.viewBox || '0 0 1000 500'}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="世界地图">`);
  parts.push(`<defs>
    <linearGradient id="wm-ocean" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="wm-ocean-a"/><stop offset="1" class="wm-ocean-b"/></linearGradient>
    <pattern id="wm-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" class="wm-grid-line"/></pattern>
  </defs>`);
  parts.push('<rect class="wm-ocean" width="1000" height="500" rx="24"/><rect class="wm-grid" width="1000" height="500" rx="24"/>');
  const gameByIso = {};
  for (const m of world) gameByIso[m.iso || GAME_ISO[m.id]] = m;
  parts.push('<g class="wm-land">');
  const countryPaths = window.WORLD_COUNTRY_PATHS || [];
  const centers = {};
  if (countryPaths.length) {
    for (const shape of countryPaths) {
      const m = gameByIso[shape.iso];
      const c = m && countries[m.id];
      const fog = !!(c && c.hidden);
      const total = m ? m.pop : 0;
      const gone = !!c && !fog && c.healthy + c.vaccinated + c.infected <= 0;
      if(gone) centers[m.id] = landCenter(shape);
      const heat = !c || fog || gone || total <= 0 ? 0 : c.infected > 0 || c.dead > 0
        ? Math.max(0.34, Math.min(1, 0.34 + c.infected / total * 2.4 + c.dead / total * 0.9)) : 0;
      const state = !c ? '' : fog ? ' is-fog' : gone
        ? ' is-gone' : c.infected > 0 ? ' is-sick' : ' is-clean';
      const pick = m && opts.pickable ? ' is-pick' : '';
      const sel = m && opts.selected === m.id ? ' is-sel' : '';
      parts.push(`<path class="wm-country color-${shape.color}${state}${pick}${sel}" d="${shape.d}"` +
        ` fill-rule="evenodd" style="--heat:${heat.toFixed(2)}"${m ? ` data-id="${m.id}"` : ''}><title>${shape.name}</title></path>`);
    }
  } else {
    for (const d of LAND) parts.push(`<path class="wm-country" d="${d}"/>`);
  }
  parts.push('</g>');

  parts.push('<g class="wm-spots">');
  for (const m of world) {
    let p = SPOT[m.id] || (Number.isFinite(m.lon) && Number.isFinite(m.lat)
      ? [(m.lon + 180) / 360 * 1000, (82 - m.lat) / 142 * 500] : null);
    if (!p) continue;
    // 176 国都由国土轮廓承担状态和点击；只给原来的重点国家画标签节点，避免地图变成字墙。
    const c = countries[m.id];
    if (!c) continue;
    const gone = !c.hidden && c.healthy + c.vaccinated <= 0 && c.infected <= 0;
    if (!SPOT[m.id] && opts.selected !== m.id && !gone) continue;
    if (gone && window.PlagueIcons) {
      p = centers[m.id] || (Number.isFinite(m.lon) && Number.isFinite(m.lat) ? [(m.lon+180)/360*1000,(82-m.lat)/142*500] : p);
      const size = 32 / (opts.zoom || 1);
      {
        parts.push(`<g class="wm-skull" data-id="${m.id}" transform="translate(${p[0]} ${p[1]})"><title>${m.name} · 人口耗尽</title><circle r="${size*.57}"/><svg x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PlagueIcons.art.skull}</svg></g>`);
      }
      continue;
    }
    // ★没通报疫情的国家，人类那边是一团雾（c.hidden），画成问号，别装作知道
    const fog = !!c.hidden;
    const total = m.pop;
    const alive = fog ? total : c.healthy + c.vaccinated;
    const sick = fog || total <= 0 ? 0 : c.infected / total;
    const dead = fog || total <= 0 ? 0 : c.dead / total;
    // 国土已经承担主要状态显示；节点只保留人口提示和口岸/疫苗状态。
    const r = (3.5 + Math.min(2.5, Math.sqrt(m.pop) / 20)) / Math.sqrt(opts.zoom || 1);
    const state = fog ? 'fog' : alive <= 0 && c.infected <= 0 ? 'gone' : c.infected > 0 ? 'sick' : 'clean';
    // 只要有病人就得一眼看出来：起步就烧到 .38，再按比例往上走
    const heat = fog ? 0 : c.infected > 0 || c.dead > 0
      ? Math.max(0.38, Math.min(1, 0.38 + sick * 2.4 + dead * 0.9))
      : 0;
    const sel = opts.selected === m.id ? ' is-sel' : '';
    const pick = opts.pickable ? ' is-pick' : '';
    parts.push(
      `<g class="wm-spot is-${state}${sel}${pick}" data-id="${m.id}" transform="translate(${p[0]},${p[1]})">` +
        (!fog && c.infected > 0 ? `<circle class="wm-pulse" r="${r + 6}"/>` : '') +
        `<circle class="wm-dot" r="${r}" style="--heat:${heat.toFixed(2)}"/>` +
        (!fog && (c.closedAir || c.closedSea) ? `<circle class="wm-shut" r="${r + 3.5}"/>` : '') +
        (!fog && c.vaccinated > 0 ? `<circle class="wm-vax" r="${r - 3.5}"/>` : '') +
        (fog ? `<text class="wm-fog" y="6">?</text>` : '') +
        `<text class="wm-name" y="${LABEL_UP[m.id] ? -(r + 11) : r + 19}">${m.name}</text>` +
      `</g>`,
    );
  }
  parts.push('</g></svg>');
  box.innerHTML = parts.join('');

  if (opts.onPick) {
    box.querySelectorAll('.wm-spot, .wm-skull, .wm-country[data-id]').forEach((el) => {
      el.addEventListener('click', () => opts.onPick(el.getAttribute('data-id')));
    });
  }
}

window.drawWorld = drawWorld;
