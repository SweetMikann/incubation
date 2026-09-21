'use strict';
/* 大厅那道门（2026-09-05 她要的「开房、看得到房间、堂妹能一起玩」）：
   主人 = 密码 cookie；客人 = 邀请链接、只摸得到自己那间；陌生人 = 403。 */
process.env.BISCA_PASSWORD = 'test-pass';
process.env.PLAGUE_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'plague-auth-'));
const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../server.cjs');

let server, base;
function up() {
  return new Promise((res) => { server = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + server.address().port; res(); }); });
}
const call = (p, body, headers) => fetch(base + p, {
  method: body ? 'POST' : 'GET',
  headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
  body: body ? JSON.stringify(body) : undefined,
  redirect: 'manual',
});
const json = (r) => r.json();

test('主人凭密码进，客人凭邀请只摸自己那间，陌生人吃闭门羹', async (t) => {
  await up();
  t.after(() => server.close());

  // 陌生人：列表和建房都进不去；页面被送去登录页
  assert.equal((await call('/plague/api/rooms')).status, 403);
  assert.equal((await call('/plague/api/rooms', { name: 'x' })).status, 403);
  const page = await call('/plague/index.html', null, { Accept: 'text/html' });
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /\/plague\/login/);
  // 子资源不设门（客人页面里的 js/css 也得加载得出来）
  assert.equal((await call('/plague/js/game.js')).status, 200);

  // 密码不对
  assert.equal((await call('/plague/api/login', { password: 'nope' })).status, 401);
  const login = await call('/plague/api/login', { password: 'test-pass' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^bisca_auth=/);
  const asOwner = { Cookie: cookie };

  // 主人建两间房，列表看得到、带邀请码
  const a = await json(await call('/plague/api/rooms', { name: '甲', by: '她', role: 'plague' }, asOwner));
  const b = await json(await call('/plague/api/rooms', { name: '乙', by: '她', role: 'cure' }, asOwner));
  assert.equal(a.ok, true);
  const list = await json(await call('/plague/api/rooms', null, asOwner));
  assert.deepEqual(list.rooms.map((r) => r.code).sort(), [a.code, b.code].sort());
  assert.equal(list.rooms.find((r) => r.code === a.code).invite, a.invite);
  assert.equal(list.rooms.find((r) => r.code === a.code).seats[0].name, '她');

  // 客人拿甲的邀请：坐得下、看得见甲；乙进不去；列表看不到
  const sit = await json(await call(`/plague/api/rooms/${a.code}/join?invite=${a.invite}`, { name: '堂妹' }));
  assert.equal(sit.role, 'cure');
  const view = await json(await call(`/plague/api/rooms/${a.code}/state?invite=${a.invite}&token=${sit.playerToken}`));
  assert.equal(view.role, 'cure');
  assert.equal(view.level, 'guest');
  assert.equal(view.invite, undefined, '客人那份不用再带邀请码');
  assert.equal((await call(`/plague/api/rooms/${b.code}/state?invite=${a.invite}`)).status, 403);
  assert.equal((await call(`/plague/api/rooms?invite=${a.invite}`)).status, 403);
  assert.equal((await call('/plague/api/rooms', { name: '客人建房' }, { 'x-invite-token': a.invite })).status, 403);

  // 主人那份 state 带邀请码（大厅点房卡要拼链接），不用带 invite 也进得去
  const ownerView = await json(await call(`/plague/api/rooms/${a.code}/state?token=${a.playerToken}`, null, asOwner));
  assert.equal(ownerView.invite, a.invite);
  assert.equal(ownerView.level, 'owner');

  // 关房：客人（非房主位）关不了；主人一关就没了
  assert.equal((await call(`/plague/api/rooms/${a.code}/close?invite=${a.invite}`, { playerToken: sit.playerToken })).status, 403);
  assert.equal((await call(`/plague/api/rooms/${a.code}/close`, {}, asOwner)).status, 200);
  assert.equal((await call(`/plague/api/rooms/${a.code}/state?invite=${a.invite}`)).status, 403, '房没了，邀请码也跟着作废');
  const after = await json(await call('/plague/api/rooms', null, asOwner));
  assert.deepEqual(after.rooms.map((r) => r.code), [b.code]);
});
