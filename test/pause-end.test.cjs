'use strict';
/* 暂停/继续/结束 —— 她 9/5 16:15 定：「暂停和结束只有房主才有」。房间落临时目录。 */
process.env.BISCA_PASSWORD = 'test-pass';   // 有密码才分得出主人/客人；开放模式下人人都是主人
process.env.PLAGUE_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'plague-pause-'));
const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../server.cjs');

let server, base;
function up() {
  return new Promise((res) => { server = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + server.address().port; res(); }); });
}
let cookie = '';
const get = (p, asOwner) => fetch(base + p, { headers: asOwner ? { Cookie: cookie } : {} }).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { throw new Error("non-JSON " + r.status + " " + p + " " + t.slice(0, 60)); } });
const post = (p, b, asOwner) => fetch(base + p, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, asOwner ? { Cookie: cookie } : {}), body: JSON.stringify(b || {}) }).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { throw new Error("non-JSON " + r.status + " " + p + " " + t.slice(0, 60)); } });

test('暂停锁住走棋、只有房主能暂停/继续/结束，结束后不分胜负还能再开', async (t) => {
  await up();
  t.after(() => server.close());
  const login = await fetch(base + '/plague/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  const room = await post('/plague/api/rooms', { name: '测试局', by: '房主', role: 'plague' }, true);
  const guest = await post(`/plague/api/rooms/${room.code}/join?invite=${room.invite}`, { name: '客人' });
  assert.equal((await post(`/plague/api/rooms/${room.code}/start?invite=${room.invite}`, { startCountry: 'cn' })).ok, true);
  const inv = `invite=${room.invite}`;

  // 客人看 state：host=false；房主 host=true
  const gv = await get(`/plague/api/rooms/${room.code}/state?${inv}&token=${guest.playerToken}`);
  const hv = await get(`/plague/api/rooms/${room.code}/state?${inv}&token=${room.playerToken}`, true);
  assert.equal(gv.host, false); assert.equal(hv.host, true); assert.equal(hv.paused, false);

  // 主人 cookie 但坐的不是房主椅（她 16:29 指的）→ 也不是房主
  const ov = await get(`/plague/api/rooms/${room.code}/state?${inv}&token=${guest.playerToken}`, true);
  assert.equal(ov.host, false, '主人 cookie 不等于房主');
  assert((await post(`/plague/api/rooms/${room.code}/pause?${inv}`, { playerToken: guest.playerToken }, true)).error);
  // 客人暂停 → 403
  const gp = await post(`/plague/api/rooms/${room.code}/pause?${inv}`, { playerToken: guest.playerToken });
  assert(gp.error, '客人不该能暂停');
  // 房主暂停 → ok，走棋被挡
  assert.equal((await post(`/plague/api/rooms/${room.code}/pause?${inv}`, { playerToken: room.playerToken }, true)).paused, true);
  const blocked = await post(`/plague/api/rooms/${room.code}/action?${inv}`, { playerToken: room.playerToken, move: { type: 'pass' } }, true);
  assert(/暂停/.test(blocked.error || ''), '暂停中不许走');
  assert.equal((await get(`/plague/api/rooms/${room.code}/state?${inv}&token=${guest.playerToken}`)).paused, true);
  // 客人继续 → 403；房主继续 → 能走了
  assert((await post(`/plague/api/rooms/${room.code}/resume?${inv}`, { playerToken: guest.playerToken })).error);
  assert.equal((await post(`/plague/api/rooms/${room.code}/resume?${inv}`, { playerToken: room.playerToken }, true)).paused, false);
  const moved = await post(`/plague/api/rooms/${room.code}/action?${inv}`, { playerToken: room.playerToken, move: { type: 'pass' } }, true);
  assert.equal(moved.ok, true);

  // 客人结束 → 403；房主结束 → done、无胜负、有 result；再开一局成功
  assert((await post(`/plague/api/rooms/${room.code}/end?${inv}`, { playerToken: guest.playerToken })).error);
  const ended = await post(`/plague/api/rooms/${room.code}/end?${inv}`, { playerToken: room.playerToken }, true);
  assert.equal(ended.ok, true);
  const after = await get(`/plague/api/rooms/${room.code}/state?${inv}&token=${guest.playerToken}`);
  assert.equal(after.state.done, true); assert.equal(after.state.winner, null);
  assert(after.state.result && typeof after.state.result.dead === 'number');
  assert.equal(after.paused, false);
  assert.equal((await post(`/plague/api/rooms/${room.code}/end?${inv}`, { playerToken: room.playerToken }, true)).error !== undefined, true, '已结束的不能再结束');
  assert.equal((await post(`/plague/api/rooms/${room.code}/start?${inv}`, {}, true)).ok, true, '结束后能再开');
});
