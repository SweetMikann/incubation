'use strict';

// Generate compact browser-ready SVG paths from Natural Earth Admin 0 GeoJSON.
// Source data: https://github.com/nvkelso/natural-earth-vector
// Natural Earth data is public domain. The input file is intentionally not vendored.
const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
const output = process.argv[3] || path.resolve(__dirname, '../public/js/world-countries.js');
const dataOutput = process.argv[4] || path.resolve(__dirname, '../data/world.cjs');
if (!input) throw new Error('usage: node scripts/build-world-map.cjs <natural-earth.geojson> [output.js]');

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const round = (n) => Math.round(n * 10) / 10;
const project = ([lon, lat]) => [round((lon + 180) / 360 * 1000), round((82 - lat) / 142 * 500)];
const ringPath = (ring) => ring.map((point, index) => {
  const [x, y] = project(point);
  return (index ? 'L' : 'M') + x + ' ' + y;
}).join('') + 'Z';
const geometryPath = (geometry) => {
  if (!geometry) return '';
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map(ringPath).join('')).join('');
};
const displayNames = { CHN:'中国', TWN:'台湾', IND:'印度', USA:'美国', BRA:'巴西', RUS:'俄罗斯', NGA:'尼日利亚', IDN:'印度尼西亚', JPN:'日本', DEU:'德国', EGY:'埃及', MEX:'墨西哥', ARG:'阿根廷', KAZ:'哈萨克斯坦', AUS:'澳大利亚', GRL:'格陵兰' };

const countries = data.features
  .filter((feature) => feature.properties.ADMIN !== 'Antarctica')
  .map((feature) => ({
    iso: feature.properties.ADM0_A3,
    color: feature.properties.MAPCOLOR7 || 1,
    name: displayNames[feature.properties.ADM0_A3] || feature.properties.NAME_ZH || feature.properties.NAME || feature.properties.ADMIN,
    d: geometryPath(feature.geometry),
  }))
  .filter((country) => country.d);

const banner = '/* Generated from Natural Earth Admin 0 (public domain). Do not hand-edit. */\n';
fs.writeFileSync(output, banner + 'window.WORLD_COUNTRY_PATHS=' + JSON.stringify(countries) + ';\n');

const aliases = { CHN: 'cn', IND: 'in', USA: 'us', BRA: 'br', RUS: 'ru', NGA: 'ng', IDN: 'id', JPN: 'jp', DEU: 'de', EGY: 'eg', MEX: 'mx', ARG: 'ar', KAZ: 'kz', AUS: 'au', GRL: 'gl' };
const landlocked = new Set(('AFG AND ARM AUT AZE BDI BFA BLR BOL BTN BWA CAF CHE CZE ETH HUN KAZ KGZ LAO LSO LUX MDA MKD MLI MNG MWI NER NPL PRY RWA SRB SSD SVK SWZ TCD TJK TKM UGA UZB ZMB ZWE').split(' '));
const features = data.features.filter((feature) => feature.properties.ADMIN !== 'Antarctica');
const owners = new Map();
for (const feature of features) {
  const iso = feature.properties.ADM0_A3;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1].map((n) => round(n * 100) / 100).join(','), b = ring[i].map((n) => round(n * 100) / 100).join(',');
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (!owners.has(key)) owners.set(key, []);
    owners.get(key).push(iso);
  }
}
const neighbours = new Map(features.map((feature) => [feature.properties.ADM0_A3, new Set()]));
for (const list of owners.values()) if (list.length > 1) for (const a of list) for (const b of list) if (a !== b) neighbours.get(a).add(b);
const idOf = (iso) => aliases[iso] || iso.toLowerCase();
const world = features.map((feature) => {
  const p = feature.properties, iso = p.ADM0_A3, popPeople = Math.max(10000, Number(p.POP_EST) || 10000);
  const pop = Math.max(1, Math.round(popPeople / 10000));
  const gdpPerCap = Math.max(0, Number(p.GDP_MD) || 0) * 1000000 / popPeople;
  const lat = Number(p.LABEL_Y) || 0, absLat = Math.abs(lat);
  const wealth = gdpPerCap >= 20000 ? 'rich' : gdpPerCap >= 6000 ? 'middle' : 'poor';
  const research = Math.max(2, Math.min(10, Math.round((wealth === 'rich' ? 7 : wealth === 'middle' ? 4 : 2) + Math.log10(popPeople / 1000000 + 1))));
  return {
    id: idOf(iso), iso, name: displayNames[iso] || p.NAME_ZH || p.NAME || p.ADMIN, pop,
    climate: absLat >= 48 ? 'cold' : absLat <= 23 ? 'hot' : 'temperate', wealth,
    urbanity: popPeople >= 50000000 ? 'urban' : popPeople <= 3000000 ? 'rural' : 'mixed',
    air: popPeople >= 300000 || iso === 'GRL', sea: !landlocked.has(iso), research,
    lon: round(Number(p.LABEL_X) || 0), lat: round(lat),
    land: [...(neighbours.get(iso) || [])].map(idOf).sort(),
  };
});
fs.mkdirSync(path.dirname(dataOutput), { recursive: true });
const dataBanner = "'use strict';\n/* Generated from Natural Earth Admin 0 (public domain). Population/GDP are approximate game inputs. */\n";
fs.writeFileSync(dataOutput, dataBanner + 'module.exports=' + JSON.stringify(world, null, 2) + ';\n');
console.log('wrote ' + countries.length + ' map paths to ' + output + ' and ' + world.length + ' playable countries to ' + dataOutput);
