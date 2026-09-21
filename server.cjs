/* 瘟疫对局服务（bisca-plague，端口 8085，庭院代理 /plague）。
   两个座位：plague（瘟疫）/ cure（人类）。房间落盘，重启不丢。 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const engine = require('./engines/plague.cjs');

const PORT = Number(process.env.PORT || 8085);
const ROOT = __dirname;
/* ★测试用 PLAGUE_DATA_DIR 指到临时目录——以前 http 测试每跑一次就往线上 data/rooms 里
   丢一间「测试局」，大厅一做出来她就会看见一排假房。 */
const DATA_DIR = process.env.PLAGUE_DATA_DIR || path.join(ROOT, 'data');
const ROOMS_DIR = path.join(DATA_DIR, 'rooms');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(ROOMS_DIR, { recursive: true });

/* ── 认证（照麻将馆那套，一个字不多）──
   cookie = 主人（她；庭院代理拿 BISCA_PASSWORD 替她登录后挂上 bisca_auth）；
   X-Internal-Key = agent（我在 VPS 上的脚本，视同主人）；
   合法 invite = 那一间房的客人（堂妹拿邀请链接进来，只摸得到自己那间）；
   没设 BISCA_PASSWORD = open mode，谁都是主人（只给本机跑测试用）。
   ★2026-09-05 08:17 她：「设计成开房和可以看到房间的吧，这样偶尔我还能和堂妹一起玩」 */
const COOKIE_NAME = 'bisca_auth';
const LOGIN_PATH = '/plague/login';
const COOKIE_MAX_AGE_MS = 90 * 24 * 3600 * 1000;
const loginPassword = process.env.BISCA_PASSWORD || '';
const openMode = !loginPassword;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function writeJsonAtomic(p, obj) {
  const tmp = p + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);            // 原子替换：读到半截的存档比丢档更难查
}
const config = readJson(CONFIG_PATH, {});
let configDirty = false;
if (typeof config.cookie_secret !== 'string' || config.cookie_secret.length < 32) { config.cookie_secret = crypto.randomBytes(32).toString('hex'); configDirty = true; }
if (typeof config.internal_key !== 'string' || config.internal_key.length < 16) { config.internal_key = crypto.randomBytes(24).toString('hex'); configDirty = true; }
if (typeof config.allow_guests !== 'boolean') { config.allow_guests = true; configDirty = true; }
if (configDirty) writeJsonAtomic(CONFIG_PATH, config);
const INTERNAL_KEY = config.internal_key || null;
const COOKIE_SECRET = config.cookie_secret;

function signCookie(value) {
  return value + '.' + crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('base64url');
}
function verifyCookie(signed) {
  if (!signed || !signed.includes('.')) return null;
  const dot = signed.lastIndexOf('.');
  const value = signed.substring(0, dot);
  const a = Buffer.from(signCookie(value));
  const b = Buffer.from(signed);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? value : null;
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function (c) {
    const parts = c.trim().split('=');
    if (parts.length >= 2) out[parts[0]] = parts.slice(1).join('=');
  });
  return out;
}
function checkCookie(req) {
  const val = verifyCookie(parseCookies(req)[COOKIE_NAME]);
  if (!val) return false;
  const i = val.indexOf('.');
  if (i === -1 || val.substring(0, i) !== 'authenticated') return false;
  const issuedAt = parseInt(val.substring(i + 1), 10);
  return !!issuedAt && Date.now() - issuedAt <= COOKIE_MAX_AGE_MS;
}
function passwordMatches(given) {
  if (typeof given !== 'string' || !given) return false;
  const a = crypto.createHmac('sha256', COOKIE_SECRET).update(given).digest();
  const b = crypto.createHmac('sha256', COOKIE_SECRET).update(loginPassword).digest();
  return crypto.timingSafeEqual(a, b);
}
function checkInternalKey(req) {
  const k = req.headers['x-internal-key'];
  return !!INTERNAL_KEY && typeof k === 'string' && k.length === INTERNAL_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(k), Buffer.from(INTERNAL_KEY));
}
function isHttps(req) {
  return !!req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}
function setAuthCookie(req, res) {
  const parts = [COOKIE_NAME + '=' + signCookie('authenticated.' + Date.now()), 'Path=/', 'HttpOnly', 'SameSite=Lax',
    'Max-Age=' + Math.floor(COOKIE_MAX_AGE_MS / 1000)];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

const rooms = new Map();
function roomPath(code) { return path.join(ROOMS_DIR, code + '.json'); }
function isCode(code) { return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code); }
function loadRoom(code) {
  if (!isCode(code)) return null;
  if (rooms.has(code)) return rooms.get(code);
  const r = readJson(roomPath(code), null);
  if (!r || r.code !== code) return null;
  rooms.set(code, r);
  return r;
}
function listRoomCodes() {
  return fs.readdirSync(ROOMS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter(isCode);
}
function findRoomByInvite(tok) {
  if (!tok || typeof tok !== 'string') return null;
  for (const code of listRoomCodes()) {
    const r = loadRoom(code);
    if (r && r.inviteToken && r.inviteToken === tok) return r;
  }
  return null;
}
function saveRoom(r) { r.updatedAt = Date.now(); rooms.set(r.code, r); writeJsonAtomic(roomPath(r.code), r); }
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = ''; for (let i = 0; i < 6; i++) c += A[crypto.randomInt(A.length)];
    if (!fs.existsSync(roomPath(c))) return c;
  }
}
const token = () => crypto.randomBytes(16).toString('hex');

const app = express();
app.use(express.json({ limit: '256kb' }));
/* ★2026-09-05 01:50 她：「设计语言统一」——牌桌那套主题是共享的三件套
   （/assets-theme/boot.js 注入 token + base.css + swp2.css，字体在 /fonts）。
   照麻将馆的挂法，裸路径和 /plague 前缀都挂上，反代按路径分流也能拿到。 */
const PROD_THEME_DIR = '/root/bisca/assets';
const PROD_FONTS_DIR = '/root/bisca/fonts';
const THEME_DIR = fs.existsSync(PROD_THEME_DIR) ? PROD_THEME_DIR : path.resolve(ROOT, '../bisca/assets');
const FONTS_DIR = fs.existsSync(PROD_FONTS_DIR) ? PROD_FONTS_DIR : path.resolve(ROOT, '../bisca/fonts');
['', '/plague'].forEach(function (prefix) {
  app.use(prefix + '/assets-theme', express.static(THEME_DIR, { maxAge: 0 }));
  app.use(prefix + '/fonts', express.static(FONTS_DIR, { maxAge: 86400000 }));
});
app.get('/plague/api/health', function (req, res) { res.json({ ok: true, game: 'plague', rooms: rooms.size }); });

// ── 登录页 + 登录接口（挂在认证门之前）──────────────────────────────────
function safeReturnTo(raw) {
  const t = typeof raw === 'string' ? raw : '';
  return /^\/(?!\/)/.test(t) ? t : '/plague/';
}
function loginPage(returnTo, message) {
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return '<!DOCTYPE html>\n<html lang="zh"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>登录 · 瘟疫对局</title><style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0a0a0f;color:#e8e8f0;font:15px/1.6 system-ui,-apple-system,sans-serif}' +
    'form{width:min(340px,88vw);padding:28px 24px;border:1px solid #24243a;border-radius:16px;background:#12121c}' +
    'h1{margin:0 0 4px;font-size:19px}p{margin:0 0 18px;color:#8b8ba7;font-size:13px}' +
    'input{width:100%;padding:11px 13px;border:1px solid #2c2c44;border-radius:10px;background:#0d0d16;color:#e8e8f0;font-size:15px}' +
    'button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:10px;background:#6f6fd8;color:#fff;font-size:15px;font-weight:600}' +
    '.msg{margin-top:12px;min-height:18px;color:#ff7a92;font-size:13px}</style></head><body>' +
    '<form id="f" method="post" action="/plague/api/login"><h1>瘟疫对局</h1><p>这间屋子是自家的。有邀请链接的从链接进，没有的输密码</p>' +
    '<input type="hidden" name="r" value="' + esc(returnTo) + '">' +
    '<input id="pw" name="password" type="password" autocomplete="current-password" autofocus>' +
    '<button type="submit">进去</button><div class="msg" id="m">' + esc(message || '') + '</div>' +
    '<script>var R=' + JSON.stringify(returnTo) + ';document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();' +
    'var m=document.getElementById("m");m.textContent="";fetch("/plague/api/login",{method:"POST",headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({password:document.getElementById("pw").value})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})' +
    '.then(function(o){if(o.ok){location.href=R}else{m.textContent=(o.j&&o.j.error)||"登录失败"}}).catch(function(){m.textContent="网络错误，再试一次"})});</script>' +
    '</form></body></html>';
}
app.get([LOGIN_PATH, '/login'], function (req, res) {
  const back = safeReturnTo(req.query.r);
  if (openMode || checkCookie(req)) return res.redirect(back);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(loginPage(back, ''));
});
app.post(['/plague/api/login', '/api/login'], express.urlencoded({ extended: false }), function (req, res) {
  const body = req.body || {};
  const back = safeReturnTo(body.r);
  const wantsHtml = String(req.headers.accept || '').includes('text/html');
  if (openMode) {
    if (wantsHtml) return res.redirect(back);
    return res.status(400).json({ error: '本服务没有设置 BISCA_PASSWORD，不需要登录' });
  }
  if (!passwordMatches(body.password)) {
    if (wantsHtml) { res.status(401).set('Content-Type', 'text/html; charset=utf-8'); return res.send(loginPage(back, '密码不对')); }
    return res.status(401).json({ error: '密码不对' });
  }
  setAuthCookie(req, res);
  if (wantsHtml) return res.redirect(back);
  res.json({ ok: true, redirect: back });
});

// ── 认证门：js/css/图这些子资源没有秘密，直接放行；.html 和 api 都要过门 ─────
const PUBLIC_ASSET_RE = /\.(js|css|map|png|jpg|jpeg|svg|webp|ico|woff2?)$/i;
function deny(res, req) {
  if (req && req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
    return res.redirect(LOGIN_PATH + '?r=' + encodeURIComponent(req.originalUrl || '/plague/'));
  }
  return res.status(403).json({ error: '未授权：需要登录，或有效的房间邀请链接' });
}
app.use(function authGate(req, res, next) {
  if (req.method === 'GET' && PUBLIC_ASSET_RE.test(req.path || '')) { req.authLevel = 'asset'; return next(); }
  if (checkInternalKey(req)) { req.authLevel = 'agent'; return next(); }
  if (openMode || checkCookie(req)) { req.authLevel = 'owner'; return next(); }
  if (config.allow_guests) {
    const tok = req.query.invite || req.headers['x-invite-token'] || (req.body && req.body.invite);
    const room = findRoomByInvite(typeof tok === 'string' ? tok : null);
    if (room) { req.authLevel = 'guest'; req.inviteRoom = room.code; return next(); }
  }
  return deny(res, req);
});
// 客人只能摸自己 invite 对应的那一间
function scopeGuard(req, res, next) {
  if (req.authLevel === 'guest' && req.inviteRoom !== req.params.code) return deny(res, req);
  next();
}
function privileged(req) { return req.authLevel === 'owner' || req.authLevel === 'agent'; }
function ownerOnly(req, res, next) { if (!privileged(req)) return deny(res, req); next(); }

app.use('/plague', express.static(path.join(ROOT, 'public')));

function seatOf(room, playerToken) {
  return (room.seats || []).find((s) => s.playerToken && s.playerToken === playerToken) || null;
}
/* 房主＝开房的人＝坐第一把椅子的那位，只认座位 token。暂停/结束只归房主（她 9/5 16:15 定的）。
   ★16:29 她：「我不是房主，不应该有暂停和结束吧」——她拿主人 cookie 进我开的房也被当成了房主。
   主人身份只管大厅（看房、开房、关房），桌上谁是房主看椅子不看 cookie。 */
function isHost(room, req, playerToken) {
  const host = (room.seats || [])[0];
  return !!(host && playerToken && host.playerToken === playerToken);
}
function inviteOk(room, req) {
  if (privileged(req)) return true;
  const inv = req.query.invite || (req.body && req.body.invite) || req.headers['x-invite-token'];
  return !room.inviteToken || inv === room.inviteToken;
}
function summarize(r) {
  return {
    code: r.code, name: r.name, started: !!r.started,
    seats: (r.seats || []).map((s) => ({ role: s.role, name: s.name })),
    done: !!(r.state && r.state.done), winner: r.state ? r.state.winner : null,
    day: r.state ? r.state.day : 0, phase: r.state ? r.state.phase : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

// ── 建房 ──────────────────────────────────────────────────────────────────
app.post('/plague/api/rooms', ownerOnly, function (req, res) {
  const name = String((req.body && req.body.name) || '瘟疫对局').slice(0, 24);
  const who = String((req.body && req.body.by) || '玩家').slice(0, 16);
  const role = (req.body && req.body.role) === 'cure' ? 'cure' : 'plague';
  const code = newCode();
  const room = {
    code, name, game: 'plague',
    createdAt: Date.now(), updatedAt: Date.now(),
    inviteToken: token(),
    seats: [{ role, name: who, playerToken: token() }],
    state: null, chat: [], started: false,
  };
  saveRoom(room);
  res.json({ ok: true, code, invite: room.inviteToken, playerToken: room.seats[0].playerToken, role });
});

// ── 配对：从小游戏列表点进来的没有房号，这里给「咱俩那间房」──────────────
//   她 2026-09-05 01:42 截图：从列表进去是一间空房、一直「等对手进来」。
//   原因是没带房号就新建一间，两个人各建各的，永远碰不上头。
const PAIR_PATH = path.join(ROOT, 'data', 'pair.json');
function currentPair() {
  const p = readJson(PAIR_PATH, null);
  if (!p || !p.code) return null;
  const room = loadRoom(p.code);
  if (!room) return null;
  if (room.state && room.state.done) return null;   // 打完了就换新的一间
  return room;
}
app.post('/plague/api/pair', ownerOnly, function (req, res) {
  const who = String((req.body && req.body.name) || '玩家').slice(0, 16);
  const client = String((req.body && req.body.client) || '').slice(0, 40);
  let room = currentPair();
  if (!room) {
    const code = newCode();
    room = { code, name: '咱俩的对局', game: 'plague', createdAt: Date.now(), updatedAt: Date.now(),
      inviteToken: token(), seats: [], state: null, chat: [], started: false };
    saveRoom(room);
    writeJsonAtomic(PAIR_PATH, { code, at: Date.now() });
  }
  // 同一个人刷新页面要回到原座位，靠浏览器自己存的 client 标识认人
  let seat = client && (room.seats || []).find((s) => s.client === client);
  if (!seat) {
    const taken = (room.seats || []).map((s) => s.role);
    // 可以点名要哪个位置（我在 VPS 上先占人类那把椅子，把瘟疫留给她）
    const want = (req.body && req.body.role) === 'cure' ? 'cure' : (req.body && req.body.role) === 'plague' ? 'plague' : null;
    let role = want && !taken.includes(want) ? want
      : taken.includes('plague') ? (taken.includes('cure') ? null : 'cure') : 'plague';
    if (!role) return bad(res, 409, '这间房两个位置都有人了');
    seat = { role, name: who, playerToken: token(), client: client || null };
    room.seats.push(seat);
    saveRoom(room);
  }
  res.json({ ok: true, code: room.code, invite: room.inviteToken, playerToken: seat.playerToken,
    role: seat.role, seats: room.seats.length });
});

// ── 坐下 ──────────────────────────────────────────────────────────────────
app.post('/plague/api/rooms/:code/join', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  const who = String((req.body && req.body.name) || '玩家').slice(0, 16);
  let role = (req.body && req.body.role) || null;
  const taken = room.seats.map((s) => s.role);
  if (!role || taken.includes(role)) role = taken.includes('plague') ? 'cure' : 'plague';
  if (taken.includes(role)) return bad(res, 409, '两个位置都有人了');
  const seat = { role, name: who, playerToken: token() };
  room.seats.push(seat);
  saveRoom(room);
  res.json({ ok: true, role, playerToken: seat.playerToken });
});

// ── 开局 ──────────────────────────────────────────────────────────────────
app.post('/plague/api/rooms/:code/start', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  if (room.seats.length < 2) return bad(res, 400, '要两个人才能开');
  /* 重开：两个人的房，谁都能提；只是别让人一言不合就把打到一半的局清了，
     所以只有还在第 1 天（等于什么都没发生）或者已经打完了才让重开。 */
  const force = !!(req.body && req.body.restart);
  const fresh = room.state && room.state.day <= 1;
  if (room.state && !room.state.done && !(force && fresh)) {
    return bad(res, 409, room.state.day > 1 ? '这局已经打到第 ' + room.state.day + ' 天了，要重开先跟对面说一声' : '这局还没打完');
  }
  room.state = engine.createGame({
    seed: crypto.randomInt(1, 2147483647),
    startCountry: (req.body && req.body.startCountry) || null,
  });
  room.started = true;
  saveRoom(room);
  res.json({ ok: true, day: room.state.day });
});

// ── 看局面 ────────────────────────────────────────────────────────────────
app.get('/plague/api/rooms/:code/state', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  const seat = seatOf(room, req.query.token);
  const role = seat ? seat.role : 'watch';
  res.json({
    ok: true, code: room.code, name: room.name, started: room.started,
    seats: room.seats.map((s) => ({ role: s.role, name: s.name })),
    role, level: req.authLevel, chat: (room.chat || []).slice(-40),
    paused: !!(room.paused && room.state && !room.state.done),
    host: isHost(room, req, req.query.token),
    invite: privileged(req) ? room.inviteToken : undefined,   // 客人本来就是拿着它进来的
    state: room.state ? engine.viewFor(room.state, role) : null,
  });
});

// ── 走一步 ────────────────────────────────────────────────────────────────
app.post('/plague/api/rooms/:code/action', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  if (!room.state) return bad(res, 400, '还没开局');
  const seat = seatOf(room, req.body && req.body.playerToken);
  if (!seat) return bad(res, 403, '你不在这桌上');
  if (room.paused) return bad(res, 409, '这局暂停着，房主点「继续」才能走');
  try {
    const out = engine.apply(room.state, seat.role, req.body && req.body.move);
    room.state = out.state;
    saveRoom(room);
    res.json({ ok: true, state: engine.viewFor(room.state, seat.role) });
  } catch (e) {
    return bad(res, 400, e.message);
  }
});

// ── 桌上说话 ──────────────────────────────────────────────────────────────
app.post('/plague/api/rooms/:code/chat', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  const seat = seatOf(room, req.body && req.body.playerToken);
  const text = String((req.body && req.body.text) || '').slice(0, 300);
  if (!text) return bad(res, 400, '说点什么');
  room.chat = room.chat || [];
  room.chat.push({ ts: Date.now(), role: seat ? seat.role : null, name: seat ? seat.name : '围观', text });
  if (room.chat.length > 400) room.chat = room.chat.slice(-400);
  saveRoom(room);
  res.json({ ok: true });
});

// ── 暂停 / 继续 / 结束：只有房主（她 9/5 16:15 定：「暂停和结束只有房主才有」）──────
//   暂停＝局面原样锁住，谁都走不了；继续＝解锁；结束＝这局判为无胜负收掉，房间和座位留着可以再开。
function hostOnly(req, res, room) {
  if (!isHost(room, req, req.body && req.body.playerToken)) { bad(res, 403, '这是房主的事'); return false; }
  return true;
}
app.post('/plague/api/rooms/:code/pause', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  if (!hostOnly(req, res, room)) return;
  if (!room.state || room.state.done) return bad(res, 400, '还没开局，没什么好暂停的');
  room.paused = true;
  room.chat = room.chat || [];
  room.chat.push({ ts: Date.now(), role: null, name: '桌子', text: '房主把这局暂停了，局面留着，回来接着打。' });
  saveRoom(room);
  res.json({ ok: true, paused: true });
});
app.post('/plague/api/rooms/:code/resume', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  if (!hostOnly(req, res, room)) return;
  room.paused = false;
  room.chat = room.chat || [];
  room.chat.push({ ts: Date.now(), role: null, name: '桌子', text: '继续了。' });
  saveRoom(room);
  res.json({ ok: true, paused: false });
});
app.post('/plague/api/rooms/:code/end', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  if (!inviteOk(room, req)) return bad(res, 403, '邀请码不对');
  if (!hostOnly(req, res, room)) return;
  if (!room.state || room.state.done) return bad(res, 400, '没有正在打的局');
  const st = room.state, t = (engine.viewFor(st, 'watch').totals) || {};
  st.done = true; st.winner = null; st.phase = 'done';
  st.result = { winner: null, why: '房主结束了这一局。', day: st.day, dead: t.dead || 0, healthy: (t.healthy || 0) + (t.vaccinated || 0), cure: Math.round((st.cure && st.cure.progress) || 0) };
  st.log = st.log || []; st.log.push({ day: st.day, text: '房主结束了这一局。' });
  room.paused = false;
  room.chat = room.chat || [];
  room.chat.push({ ts: Date.now(), role: null, name: '桌子', text: '房主结束了这一局，可以再开一局。' });
  saveRoom(room);
  res.json({ ok: true, state: engine.viewFor(room.state, 'watch') });
});

// ── 房间列表（主人才看得到；客人只知道自己那一间）─────────────────────────
app.get('/plague/api/rooms', ownerOnly, function (req, res) {
  const list = listRoomCodes().map(loadRoom).filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 30)
    .map((r) => Object.assign(summarize(r), { invite: r.inviteToken }));
  res.json({ ok: true, rooms: list });
});

// ── 关房：删档。主人随手关；客人只有坐在房主位（第一把椅子）上才关得了 ───────
app.post('/plague/api/rooms/:code/close', scopeGuard, function (req, res) {
  const room = loadRoom(req.params.code);
  if (!room) return bad(res, 404, '没有这个房间');
  const tok = (req.body && req.body.playerToken) || '';
  const host = (room.seats || [])[0];
  if (!privileged(req) && (!host || tok !== host.playerToken)) return bad(res, 403, '只有房主可以关闭房间');
  rooms.delete(room.code);
  try { fs.rmSync(roomPath(room.code), { force: true }); } catch (e) { /* 没了拉倒 */ }
  const pair = readJson(PAIR_PATH, null);
  if (pair && pair.code === room.code) { try { fs.rmSync(PAIR_PATH, { force: true }); } catch (e) { /* ignore */ } }
  res.json({ ok: true });
});


if (require.main === module) {
  app.listen(PORT, '127.0.0.1', function () {
    console.log('[plague] listening on 127.0.0.1:' + PORT);
  });
}
module.exports = app;
