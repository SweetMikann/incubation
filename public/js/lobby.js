/* 潜伏期 —— 大厅：建房 + 房间列表轮询。
   ★2026-09-05 08:17 她点的：「设计成开房和可以看到房间的吧，这样偶尔我还能和堂妹一起玩」。
   照麻将馆 lobby.js 的骨架，去掉规则开关和 AI 座位（这局只有两把椅子，没有机器人）。
   房卡链接指 game.html?room=…&invite=…；客人拿这条链接进来自动坐到空着的那把椅子上。 */
(function (global) {
  'use strict';

  var UI = global.CdUI;
  var esc = UI.esc;
  var $ = function (id) { return document.getElementById(id); };
  var K = 'plague2.';
  var side = 'plague';
  var lastRooms = [];
  var timer = null;

  function api(path, body) {
    return fetch('/plague/api' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { credentials: 'same-origin' })
      .then(function (r) { return r.text().then(function (raw) {
        var j = {}; try { j = raw ? JSON.parse(raw) : {}; } catch (e) { j = {}; }
        if (!r.ok || j.error) { var err = new Error(j.error || ('请求失败了（' + r.status + '）')); err.status = r.status; throw err; }
        return j;
      }); }, function () { throw new Error('连不上服务器，等会儿再试试'); });
  }

  // ── 座位存取（按房号分键；game.js 同一套）────────────────────────────────
  function loadSeat(code) { try { return JSON.parse(localStorage.getItem(K + 'seat.' + code) || 'null'); } catch (e) { return null; } }
  function saveSeat(code, seat) { try { localStorage.setItem(K + 'seat.' + code, JSON.stringify(seat)); } catch (e) { /* ignore */ } }
  function loadMe() { try { return localStorage.getItem(K + 'me') || ''; } catch (e) { return ''; } }
  function saveMe(n) { try { localStorage.setItem(K + 'me', n); } catch (e) { /* ignore */ } }

  /* 大厅之前那版把房号/座位存在 plague2.room / plague2.token 里（配对那套）。
     她 MMPHE4 那局的座位就在那儿——搬进按房号分键的座位表，房卡上才认得出「有你的座位」。 */
  function migrateOldSeat() {
    try {
      var room = localStorage.getItem(K + 'room'), token = localStorage.getItem(K + 'token');
      if (room && token && !loadSeat(room)) saveSeat(room, { playerToken: token, migrated: true });
    } catch (e) { /* ignore */ }
  }

  function roomHref(room) {
    return 'game.html?room=' + encodeURIComponent(room.code) + (room.invite ? '&invite=' + encodeURIComponent(room.invite) : '');
  }

  function statusOf(room) {
    if (room.done) return { cls: 'is-done', tx: '已结束' };
    if (room.started) return { cls: 'is-live', tx: '进行中' };
    return { cls: 'is-open', tx: '等人中' };
  }
  var SIDE = { plague: '瘟疫', cure: '人类' };

  function roomCard(room) {
    var st = statusOf(room);
    var mine = loadSeat(room.code);
    var bits = [
      '<span class="cd-tag ' + st.cls + '">' + st.tx + '</span>',
      '<span>' + esc(room.code) + '</span>',
      '<span>' + (room.seats || []).length + '/2 人</span>'
    ];
    if (room.started && !room.done && room.day) bits.push('<span>第 ' + room.day + ' 天</span>');
    if (room.done && room.winner) bits.push('<span>' + (SIDE[room.winner] || '') + '赢了</span>');
    if (mine) bits.push('<span class="cd-mine">有你的座位</span>');
    var names = (room.seats || []).map(function (s) {
      return '<span class="cd-pill">' + esc(s.name || '') + ' · ' + (SIDE[s.role] || '') + '</span>';
    }).join('');
    return '<a class="cn-card cd-room-card" href="' + esc(roomHref(room)) + '">' +
      '<div class="main">' +
      '<div class="nm">' + esc(room.name || '未命名房间') + '</div>' +
      '<div class="sub">' + bits.join('') + '</div>' +
      (names ? '<div class="who">' + names + '</div>' : '') +
      '</div>' +
      '<button class="cd-room-close" type="button" data-close="' + esc(room.code) + '" aria-label="关闭房间">' + UI.icon('door', 16) + '</button>' +
      '<span class="chev">' + UI.icon('chevron', 18) + '</span></a>';
  }

  function closeFromLobby(code) {
    UI.modal({
      html: '<h2>关闭房间 ' + esc(code) + '？</h2>' +
        '<p class="sub">这一局和聊天记录会一起删掉，里面的人会被请回大厅。</p>' +
        '<div class="cd-modal-acts">' +
        '<button class="cd-btn" id="lc-no">留着</button>' +
        '<button class="cd-btn cd-btn--danger" id="lc-yes">关闭</button></div>',
      onMount: function (h) {
        h.el.querySelector('#lc-no').addEventListener('click', function () { h.close(); });
        h.el.querySelector('#lc-yes').addEventListener('click', function () {
          var mine = loadSeat(code);
          api('/rooms/' + code + '/close', { playerToken: mine && mine.playerToken }).then(function () {
            h.close();
            UI.toast('房间 ' + code + ' 关掉了');
            loadRooms(true);
          }, function (e) { UI.toast(e.message, true); });
        });
      }
    });
  }

  function renderRooms() {
    var box = $('lb-rooms');
    if (!lastRooms.length) { box.innerHTML = '<div class="cd-empty">还没有房间，上面开一间吧</div>'; return; }
    var rank = function (r) { var c = statusOf(r).cls; return c === 'is-open' ? 0 : (c === 'is-live' ? 1 : 2); };
    var list = lastRooms.slice().sort(function (a, b) { return rank(a) - rank(b); });
    box.innerHTML = list.map(roomCard).join('');
    /* 2026-09-05 15:53 她：「进房可以写名字吧？我这边开局直接就是进来」——从房卡进房不问名字，
       坐下时用大厅昵称框里的字；她在框里填了再点房卡就有名字，没填才叫「玩家」。 */
    box.querySelectorAll('.cd-room-card').forEach(function (a) {
      a.addEventListener('click', function () {
        var n = ($('lb-name').value || '').trim();
        if (n) saveMe(n);
      });
    });
    box.querySelectorAll('.cd-room-close').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();   // 按钮长在 <a> 卡片里，不拦会顺便进房
        closeFromLobby(el.dataset.close);
      });
    });
  }

  function loadRooms(quiet) {
    return api('/rooms').then(function (d) {
      lastRooms = d.rooms || [];
      renderRooms();
    }, function (e) {
      if (!quiet) $('lb-rooms').innerHTML = '<div class="cd-empty">' + esc(e.message) + '</div>';
    });
  }

  // ── 建房 ──────────────────────────────────────────────────────────────────
  function create() {
    var btn = $('lb-create');
    var roomName = ($('lb-room').value || '').trim();
    var myName = ($('lb-name').value || '').trim() || '玩家';
    saveMe(myName);
    btn.disabled = true;
    api('/rooms', { name: roomName || '未命名房间', by: myName, role: side }).then(function (r) {
      saveSeat(r.code, { playerToken: r.playerToken, role: r.role, name: myName, isHost: true });
      location.href = roomHref({ code: r.code, invite: r.invite });
    }, function (e) {
      btn.disabled = false;
      UI.toast(e.message, true);
    });
  }

  function bindSides() {
    $('lb-sides').querySelectorAll('.cd-gamepick').forEach(function (el) {
      el.addEventListener('click', function () {
        side = el.dataset.side;
        $('lb-sides').querySelectorAll('.cd-gamepick').forEach(function (x) { x.classList.toggle('is-on', x === el); });
      });
    });
  }

  function boot() {
    migrateOldSeat();
    $('lb-ic-new').innerHTML = UI.icon('plus', 18);
    $('lb-name').value = loadMe();
    bindSides();
    $('lb-create').addEventListener('click', create);
    $('lb-refresh').addEventListener('click', function () { loadRooms(); });
    loadRooms();
    timer = setInterval(function () { loadRooms(true); }, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (timer) { clearInterval(timer); timer = null; } }
      else if (!timer) { loadRooms(true); timer = setInterval(function () { loadRooms(true); }, 5000); }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window);
