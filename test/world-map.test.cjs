'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../engines/plague.cjs');

test('世界地图包含完整国家边界和全部对局国家', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/world-countries.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const countries = sandbox.window.WORLD_COUNTRY_PATHS;
  assert(Array.isArray(countries));
  assert(countries.length >= 170, `只有 ${countries.length} 个国家边界`);

  const available = new Set(countries.map((country) => country.iso));
  const playable = ['CHN', 'IND', 'USA', 'BRA', 'RUS', 'NGA', 'IDN', 'JPN', 'DEU', 'EGY', 'MEX', 'ARG', 'KAZ', 'AUS', 'GRL'];
  for (const iso of playable) assert(available.has(iso), `缺少对局国家 ${iso}`);
  assert.equal(countries.find((country) => country.iso === 'TWN').name, '台湾');
  assert.equal(engine.WORLD.find((country) => country.iso === 'TWN').name, '台湾');
});
