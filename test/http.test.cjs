'use strict';
/* 房间落到临时目录，别往线上 data/rooms 里塞「测试局」（大厅一做出来她就会看见一排假房） */
process.env.PLAGUE_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'plague-http-'));
const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../server.cjs');

let server, base;
function up() {
  return new Promise((res) => { server = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + server.address().port; res(); }); });
}
const get = (p) => fetch(base + p).then((r) => r.json());
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());

test('两个人建房坐下开局，各自只看得见自己那份，走完一天', async (t) => {
  await up();
  t.after(() => server.close());
  const room = await post('/plague/api/rooms', { name: '测试局', by: '瘟疫', role: 'plague' });
  assert.equal(room.ok, true);
  assert.equal(room.role, 'plague');

  const join = await post(`/plague/api/rooms/${room.code}/join?invite=${room.invite}`, { name: '人类' });
  assert.equal(join.role, 'cure');

  const bad = await post(`/plague/api/rooms/${room.code}/join?invite=wrong`, { name: '闯入者' });
  assert(bad.error, '邀请码不对就该被挡');

  const started = await post(`/plague/api/rooms/${room.code}/start?invite=${room.invite}`, { startCountry: 'cn' });
  assert.equal(started.ok, true);

  const pv = await get(`/plague/api/rooms/${room.code}/state?invite=${room.invite}&token=${room.playerToken}`);
  const cv = await get(`/plague/api/rooms/${room.code}/state?invite=${room.invite}&token=${join.playerToken}`);
  assert.equal(pv.role, 'plague');
  assert.equal(cv.role, 'cure');
  assert(typeof pv.state.plague.dna === 'number', '瘟疫看得见自己的 DNA');
  assert.equal(cv.state.plague.dna, null, '人类没做检测就不该看见 DNA');

  const wrongTurn = await post(`/plague/api/rooms/${room.code}/action?invite=${room.invite}`, { playerToken: join.playerToken, move: { type: 'pass' } });
  assert(wrongTurn.error, '还没轮到人类');

  await post(`/plague/api/rooms/${room.code}/action?invite=${room.invite}`, { playerToken: room.playerToken, move: { type: 'pass' } });
  const after = await post(`/plague/api/rooms/${room.code}/action?invite=${room.invite}`, { playerToken: join.playerToken, move: { type: 'pass' } });
  assert.equal(after.ok, true);
  assert.equal(after.state.day, 2, '两边都走完才过一天');

  const nobody = await post(`/plague/api/rooms/${room.code}/action?invite=${room.invite}`, { playerToken: 'ffff', move: { type: 'pass' } });
  assert(nobody.error, '不在桌上的人不能出手');

  await post(`/plague/api/rooms/${room.code}/chat?invite=${room.invite}`, { playerToken: room.playerToken, text: '开始了' });
  const withChat = await get(`/plague/api/rooms/${room.code}/state?invite=${room.invite}&token=${room.playerToken}`);
  assert.equal(withChat.chat[withChat.chat.length - 1].text, '开始了');

  const list = await get('/plague/api/rooms');
  assert(list.rooms.some((r) => r.code === room.code));
});
