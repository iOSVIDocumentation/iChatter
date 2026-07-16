var API = 'https://moss-perspective-stands-copying.trycloudflare.com';
var token = localStorage.getItem('token');
var email = localStorage.getItem('email');
var lang = localStorage.getItem('lang') || 'ru';
var socket = null;
var chatWith = null;
var editingId = null;
var profile = null;
var contacts = [];

var T = {
    ru: { select: 'Выберите контакт', noContacts: 'Нет контактов', online: 'онлайн', offline: 'оффлайн', typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден', enterId: 'Введите ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.', deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены' },
    en: { select: 'Select contact', noContacts: 'No contacts', online: 'online', offline: 'offline', typing: 'typing...', empty: 'Empty', notFound: 'User not found', enterId: 'Enter ID', msg: 'Message...', send: 'Send', edited: 'edited', deleted: 'Message deleted', save: 'Save', saved: 'Settings saved' }
};
function t(k) { return T[lang][k] || k; }

if (!token || !email) location.href = 'login.html';

function $(id) { return document.getElementById(id); }
function fmtTime(ts) { var d = new Date(ts); var h = d.getHours(); var m = d.getMinutes(); if (m < 10) m = '0' + m; return h + ':' + m; }
function esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s || '')); return d.innerHTML; }

// ========== UI ==========
function addMsg(msg) {
    var el = document.createElement('div');
    el.className = 'msg' + (msg.from === email ? ' my' : '');
    el.id = 'msg-' + msg.id;
    var name = msg.fromUsername || msg.from.split('@')[0];
    var time = fmtTime(msg.timestamp);
    var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : esc(msg.text);
    var edit = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';
    el.innerHTML = '<div class="sender">' + esc(name) + '</div>' + text + edit + '<span class="time">' + time + '</span>';
    if (msg.from === email && !msg.deleted) {
        el.innerHTML += '<div class="actions"><button class="edit-btn" onclick="editMsg(\'' + msg.id + '\',\'' + esc(msg.text).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="delMsg(\'' + msg.id + '\')">✕</button></div>';
    }
    $('messages').appendChild(el);
    $('messages').scrollTop = $('messages').scrollHeight;
}

function updMsg(id, text, edited) {
    var el = $('msg-' + id); if (!el) return;
    var edit = edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';
    el.innerHTML = el.innerHTML.replace(/<div class="text">.*?<\/div>/, '') + edit;
    // rebuild inner
    var name = el.querySelector('.sender');
    var time = el.querySelector('.time');
    el.innerHTML = (name ? name.outerHTML : '') + esc(text) + edit + (time ? time.outerHTML : '');
    if (el.querySelector('.actions')) {
        el.innerHTML += '<div class="actions"><button class="edit-btn" onclick="editMsg(\'' + id + '\',\'' + esc(text).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="delMsg(\'' + id + '\')">✕</button></div>';
    }
}

function delMsgUI(id) {
    var el = $('msg-' + id); if (!el) return;
    el.innerHTML = el.innerHTML.replace(/<div class="actions">.*?<\/div>/, '');
    el.innerHTML += ' <i>' + t('deleted') + '</i>';
}

// ========== API ==========
function loadMessages(to) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/messages?token=' + token + '&chatWith=' + to);
    xhr.onload = function() {
        if (xhr.status === 200) {
            var d = JSON.parse(xhr.responseText);
            $('messages').innerHTML = '';
            (d.messages || []).forEach(addMsg);
        }
    };
    xhr.send();
}

function loadContacts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/contacts?token=' + token);
    xhr.onload = function() {
        if (xhr.status === 200) {
            contacts = JSON.parse(xhr.responseText).contacts || [];
            renderContacts();
        }
    };
    xhr.send();
}

function renderContacts() {
    var list = $('contacts-list');
    list.innerHTML = '';
    if (!contacts.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">' + t('noContacts') + '</div>'; return; }
    contacts.forEach(function(c) {
        var div = document.createElement('div');
        div.className = 'contact-item';
        div.innerHTML = '<div><div class="name">' + esc(c.username) + '</div><div class="status ' + (c.isOnline ? 'online' : '') + '">' + (c.isOnline ? t('online') : t('offline')) + '</div></div><button class="archive-btn" onclick="event.stopPropagation();archiveChat(\'' + c.email + '\')">📦</button>';
        div.onclick = function() { openChat(c.email); };
        list.appendChild(div);
    });
}

function loadArchive() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/archived-chats?token=' + token);
    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText).contacts || [];
            var list = $('archive-list');
            list.innerHTML = '';
            if (!data.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">' + t('empty') + '</div>'; return; }
            data.forEach(function(c) {
                var div = document.createElement('div');
                div.className = 'contact-item';
                div.innerHTML = '<div class="name">' + esc(c.username) + '</div><button class="archive-btn unarchive-btn" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
                div.onclick = function() { openChat(c.email); };
                list.appendChild(div);
            });
        }
    };
    xhr.send();
}

function archiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/archive-chat');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() { loadContacts(); };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function unarchiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/unarchive-chat');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() { loadArchive(); loadContacts(); };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function findUser() {
    var id = $('search-input').value.trim();
    if (!id) { alert(t('enterId')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/find-user?token=' + token + '&searchId=' + id);
    xhr.onload = function() {
        if (xhr.status === 200) {
            var d = JSON.parse(xhr.responseText);
            if (d.found) { openChat(d.user.email); showPanel(null); }
            else alert(t('notFound'));
        }
    };
    xhr.send();
}

function openChat(em) {
    chatWith = em;
    var name = em.split('@')[0];
    contacts.forEach(function(c) { if (c.email === em) name = c.username; });
    $('chat-title').innerText = name;
    showPanel(null);
    loadMessages(em);
}

// ========== НАСТРОЙКИ ==========
function loadSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-profile?token=' + token);
    xhr.onload = function() {
        if (xhr.status === 200) {
            profile = JSON.parse(xhr.responseText).user;
            $('set-name').value = profile.username || '';
            $('set-age').value = profile.age || '';
            $('set-about').value = profile.about || '';
            $('lang-select').value = profile.language || 'ru';
            $('theme-select').value = profile.theme || 'dark';
            $('my-id').innerText = profile.searchId;
            applyTheme(profile.theme);
            loadAvatars();
            loadWallpapers();
            loadDevices();
        }
    };
    xhr.send();
}

function loadAvatars() {
    var grid = $('avatar-grid'); grid.innerHTML = '';
    for (var i = 1; i <= 10; i++) {
        var img = document.createElement('img');
        img.src = API + '/avatars/av' + i + '.png';
        img.onerror = function() { this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%230088cc" width="48" height="48"/><text fill="white" x="12" y="30" font-size="24">' + i + '</text></svg>'; };
        if (profile.avatar === 'av' + i + '.png') img.className = 'selected';
        img.onclick = function() {
            grid.querySelectorAll('img').forEach(function(im) { im.className = ''; });
            this.className = 'selected';
            profile.avatar = 'av' + i + '.png';
        };
        grid.appendChild(img);
    }
}

function loadWallpapers() {
    var grid = $('wallpaper-grid'); grid.innerHTML = '';
    var wall = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    wall.forEach(function(w) {
        var img = document.createElement('img');
        img.src = API + '/wallpapers/' + w;
        if (profile.wallpaper === w) img.className = 'selected';
        img.onclick = function() {
            grid.querySelectorAll('img').forEach(function(im) { im.className = ''; });
            this.className = 'selected';
            profile.wallpaper = w;
            $('messages').style.backgroundImage = 'url(' + API + '/wallpapers/' + w + ')';
            $('messages').style.backgroundSize = 'cover';
        };
        grid.appendChild(img);
    });
}

function loadDevices() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-devices?token=' + token);
    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText).devices || [];
            var list = $('devices-list'); list.innerHTML = '';
            data.forEach(function(d) {
                var div = document.createElement('div');
                div.style.cssText = 'padding:6px 0;font-size:13px;';
                div.innerHTML = d.device + ' (' + new Date(d.created).toLocaleString() + ')' + (d.isCurrent ? ' <b>[текущий]</b>' : ' <button onclick="logoutDevice(\'' + d.token + '\')" style="font-size:10px;background:#e74c3c;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">Выйти</button>');
                list.appendChild(div);
            });
        }
    };
    xhr.send();
}

function logoutDevice(tok) {
    if (!confirm('Выйти с устройства?')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/logout-device');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() { loadDevices(); };
    xhr.send(JSON.stringify({ token: token, targetToken: tok }));
}

function saveSettings() {
    profile.username = $('set-name').value;
    profile.age = parseInt($('set-age').value) || 0;
    profile.about = $('set-about').value;
    profile.language = $('lang-select').value;
    profile.theme = $('theme-select').value;
    lang = profile.language;
    localStorage.setItem('lang', lang);
    applyTheme(profile.theme);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/update-profile');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        if (xhr.status === 200) { alert(t('saved')); showPanel(null); }
    };
    xhr.send(JSON.stringify({ token: token, username: profile.username, age: profile.age, about: profile.about, avatar: profile.avatar, theme: profile.theme, language: profile.language, wallpaper: profile.wallpaper }));
}

function setLang(l) { lang = l; profile.language = l; }
function setTheme(th) { profile.theme = th; applyTheme(th); }
function applyTheme(th) { document.body.className = th === 'light' ? 'light' : ''; }

// ========== ПАНЕЛИ ==========
function showPanel(name) {
    $('contacts-panel').style.display = name === 'contacts' ? 'block' : 'none';
    $('archive-panel').style.display = name === 'archive' ? 'block' : 'none';
    $('settings-panel').style.display = name === 'settings' ? 'block' : 'none';
    if (name === 'contacts') loadContacts();
    if (name === 'archive') loadArchive();
    if (name === 'settings') loadSettings();
}

// ========== СООБЩЕНИЯ ==========
function sendMessage() {
    var text = $('input').value.trim();
    if (!text || !chatWith) return;
    if (editingId) {
        socket.emit('edit_message', { id: editingId, newText: text });
        editingId = null;
    } else {
        socket.emit('send_message', { to: chatWith, text: text });
    }
    $('input').value = '';
}

function editMsg(id, text) {
    editingId = id;
    $('input').value = text;
    $('input').focus();
}

function delMsg(id) {
    if (!confirm('Удалить?')) return;
    socket.emit('delete_message', { id: id });
}

// ========== SOCKET ==========
function connectSocket() {
    socket = io(API, { query: { token: token } });
    socket.on('receive_message', function(msg) { if (chatWith === msg.from) addMsg(msg); loadContacts(); });
    socket.on('message_sent', function(msg) { if (chatWith === msg.to) addMsg(msg); });
    socket.on('update_message', function(d) { updMsg(d.id, d.text, d.edited); });
    socket.on('remove_message', function(d) { delMsgUI(d.id); });
    socket.on('user_typing', function(d) { if (chatWith === d.from && d.isTyping) { $('chat-title').innerText = d.username + ' (' + t('typing') + ')'; setTimeout(function() { if (chatWith === d.from) openChat(d.from); }, 2000); } });
}

$('send-btn').onclick = sendMessage;
$('input').addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMessage(); });
$('input').addEventListener('input', function() { if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true }); });

connectSocket();
loadContacts();
