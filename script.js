function getParam(name) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === name) return decodeURIComponent(pair[1] || '');
    }
    return null;
}

var API = 'https://moss-perspective-stands-copying.trycloudflare.com';
var urlToken = getParam('token');
var urlEmail = getParam('email');

if (urlToken) {
    localStorage.setItem('token', urlToken);
    if (urlEmail) localStorage.setItem('email', urlEmail);
    if (window.history && window.history.replaceState) {
        var newUrl = window.location.pathname + '?token=' + urlToken + (urlEmail ? '&email=' + encodeURIComponent(urlEmail) : '');
        window.history.replaceState({}, '', newUrl);
    }
}

var token = localStorage.getItem('token');
var myEmail = localStorage.getItem('email');
var lang = localStorage.getItem('lang') || 'ru';
var socket = null;
var chatWith = null;
var editingId = null;
var profile = null;
var contacts = [];
var pendingName = null;

if (!token || !myEmail) { window.location.href = 'login.html'; }

function byId(id) { return document.getElementById(id); }

var T = {
    ru: { select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'оффлайн', typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден', enterNick: 'Введите ник или ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.', deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены', selfSearch: 'Нельзя искать самого себя' },
    en: { select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline', typing: 'typing...', empty: 'Empty', notFound: 'User not found', enterNick: 'Enter nickname or ID', msg: 'Message...', send: 'Send', edited: 'edited', deleted: 'Message deleted', save: 'Save', saved: 'Settings saved', selfSearch: 'You cannot search for yourself' }
};
function t(k) { return T[lang][k] || k; }

function formatTime(ts) { var d = new Date(ts); var h = d.getHours(); var m = d.getMinutes(); if (m < 10) m = '0' + m; return h + ':' + m; }
function esc(s) { if (!s) return ''; var div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; }

// UI сообщений (с поддержкой медиа)
function addMsg(msg) {
    var container = byId('messages');
    var div = document.createElement('div');
    div.className = 'msg';
    if (msg.from === myEmail) div.className += ' my';
    div.id = 'msg-' + msg.id;

    var senderName = msg.fromUsername || msg.from.split('@')[0];
    var timeStr = formatTime(msg.timestamp);
    var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : esc(msg.text);
    var edited = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';

    div.innerHTML = '<div class="sender">' + esc(senderName) + '</div>';
    if (msg.media) {
        var mediaUrl = API + msg.media.url;
        var type = msg.media.type;
        if (type.startsWith('image/')) {
            div.innerHTML += '<img src="' + mediaUrl + '" class="media" style="max-width:200px;max-height:200px;cursor:pointer;" onclick="openFullImage(\'' + mediaUrl + '\')">';
        } else if (type.startsWith('video/')) {
            div.innerHTML += '<video controls class="media" style="max-width:200px;max-height:200px;"><source src="' + mediaUrl + '" type="' + type + '"></video>';
        } else if (type.startsWith('audio/')) {
            div.innerHTML += '<audio controls class="media"><source src="' + mediaUrl + '" type="' + type + '"></audio>';
        } else {
            div.innerHTML += '<a href="' + mediaUrl + '" target="_blank" class="media">📎 ' + (msg.media.url.split('/').pop()) + '</a>';
        }
    }
    div.innerHTML += '<div class="text">' + text + edited + '</div><span class="time">' + timeStr + '</span>';
    if (msg.from === myEmail && !msg.deleted) {
        div.innerHTML += '<div class="actions"><button class="edit-btn" onclick="editMsg(\'' + msg.id + '\',\'' + esc(msg.text).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="delMsg(\'' + msg.id + '\')">✕</button></div>';
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function openFullImage(url) {
    var win = window.open('', '_blank');
    win.document.write('<img src="' + url + '" style="max-width:100%;height:auto;">');
}

function updMsg(id, text, edited) { /* без изменений */ }
function delMsgUI(id) { /* без изменений */ }

function loadMessages(to) { /* без изменений */ }
function loadContacts() { /* без изменений */ }
function renderContacts() { /* без изменений */ }
function loadArchive() { /* без изменений */ }
function archiveChat(em) { /* без изменений */ }
function unarchiveChat(em) { /* без изменений */ }

function findUser() { /* без изменений */ }

function openChat(em) { /* без изменений */ }

// ========== Настройки (с кастомными аватарками и обоями) ==========
function loadSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-profile?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            profile = JSON.parse(xhr.responseText).user;
            byId('set-username').value = profile.username || '';
            byId('set-displayname').value = profile.displayName || '';
            byId('set-age').value = profile.age || '';
            byId('set-about').value = profile.about || '';
            byId('lang-select').value = profile.language || 'ru';
            byId('theme-select').value = profile.theme || 'dark';
            byId('my-id-display').innerHTML = profile.searchId || '';
            applyTheme(profile.theme);
            loadAvatars();
            loadWallpapers();
            loadDevices();
        }
    };
    xhr.send();
}

function loadAvatars() {
    var grid = byId('avatar-grid');
    grid.innerHTML = '';
    // стандартные
    for (var i = 1; i <= 10; i++) {
        var img = document.createElement('img');
        img.src = API + '/avatars/av' + i + '.png';
        img.onerror = function() { this.src = 'data:image/svg+xml,...'; };
        if (profile.avatar === 'av' + i + '.png') img.className = 'selected';
        img.onclick = (function(idx) { return function() { var imgs = grid.getElementsByTagName('img'); for (var j = 0; j < imgs.length; j++) imgs[j].className = ''; this.className = 'selected'; profile.avatar = 'av' + idx + '.png'; }; })(i);
        grid.appendChild(img);
    }
    // кастомная аватарка (если есть)
    if (profile.avatar && profile.avatar.startsWith('/uploads/avatars/')) {
        var custImg = document.createElement('img');
        custImg.src = API + profile.avatar;
        custImg.className = 'selected';
        custImg.onclick = function() { var imgs = grid.getElementsByTagName('img'); for (var j = 0; j < imgs.length; j++) imgs[j].className = ''; this.className = 'selected'; profile.avatar = this.src.replace(API, ''); };
        grid.appendChild(custImg);
    }
}

function loadWallpapers() {
    var grid = byId('wallpaper-grid');
    grid.innerHTML = '';
    // стандартные обои
    var walls = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = API + '/wallpapers/' + walls[i];
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function(w) { return function() { var imgs = grid.getElementsByTagName('img'); for (var k = 0; k < imgs.length; k++) imgs[k].className = ''; this.className = 'selected'; profile.wallpaper = w; byId('messages').style.backgroundImage = 'url(' + API + '/wallpapers/' + w + ')'; byId('messages').style.backgroundSize = 'cover'; }; })(walls[i]);
        grid.appendChild(img);
    }
    // кастомные обои (если есть)
    if (profile.wallpaper && profile.wallpaper.startsWith('/uploads/wallpapers/')) {
        var custBg = document.createElement('img');
        custBg.src = API + profile.wallpaper;
        custBg.className = 'selected';
        custBg.onclick = function() { var imgs = grid.getElementsByTagName('img'); for (var j = 0; j < imgs.length; j++) imgs[j].className = ''; this.className = 'selected'; profile.wallpaper = this.src.replace(API, ''); byId('messages').style.backgroundImage = 'url(' + this.src + ')'; byId('messages').style.backgroundSize = 'cover'; };
        grid.appendChild(custBg);
    }
}

function uploadCustomAvatar(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('avatar', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload-avatar?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var resp = JSON.parse(xhr.responseText);
            if (resp.success) {
                alert('Аватар обновлён!');
                profile.avatar = resp.url;
                loadAvatars();
            }
        }
        input.value = '';
    };
    xhr.send(formData);
}

function uploadCustomWallpaper(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('wallpaper', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload-wallpaper?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var resp = JSON.parse(xhr.responseText);
            if (resp.success) {
                alert('Обои обновлены!');
                profile.wallpaper = resp.url;
                byId('messages').style.backgroundImage = 'url(' + API + resp.url + ')';
                byId('messages').style.backgroundSize = 'cover';
            }
        }
        input.value = '';
    };
    xhr.send(formData);
}

function loadDevices() { /* без изменений */ }
function logoutDevice(tok) { /* без изменений */ }

function saveSettings() {
    profile.displayName = byId('set-displayname').value;
    profile.age = parseInt(byId('set-age').value) || 0;
    profile.about = byId('set-about').value;
    profile.language = byId('lang-select').value;
    profile.theme = byId('theme-select').value;
    lang = profile.language;
    localStorage.setItem('lang', lang);
    applyTheme(profile.theme);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/update-profile', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) { alert(t('saved')); showPanel(null); }
    };
    xhr.send(JSON.stringify({ token: token, displayName: profile.displayName, age: profile.age, about: profile.about, avatar: profile.avatar, theme: profile.theme, language: profile.language, wallpaper: profile.wallpaper }));
}

function setLang(l) { lang = l; if (profile) profile.language = l; }
function setTheme(th) { if (profile) profile.theme = th; applyTheme(th); }
function applyTheme(th) { document.body.className = th === 'dark' ? 'dark-mode' : ''; if (byId('theme-select')) byId('theme-select').value = th; }

function showPanel(name) { /* без изменений */ }

// Отправка медиа
function sendMediaMessage(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('file', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload-media?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                var resp = JSON.parse(xhr.responseText);
                if (resp.success && socket && chatWith) {
                    socket.emit('send_message', { to: chatWith, text: '', media: { url: resp.url, type: resp.type } });
                }
            } else { alert('Ошибка загрузки файла'); }
            input.value = '';
        }
    };
    xhr.send(formData);
}

function sendMessage() { /* обычная отправка текста */ }
function editMsg(id, text) { /* ... */ }
function delMsg(id) { /* ... */ }

function connectSocket() {
    socket = io(API, { query: { token: token } });
    socket.on('receive_message', function(msg) { if (chatWith === msg.from) addMsg(msg); loadContacts(); });
    socket.on('message_sent', function(msg) { if (chatWith === msg.to) addMsg(msg); });
    socket.on('update_message', function(d) { updMsg(d.id, d.text, d.edited); });
    socket.on('remove_message', function(d) { delMsgUI(d.id); });
    socket.on('user_typing', function(data) { /* ... */ });
}

byId('send-btn').onclick = sendMessage;
byId('input').onkeydown = function(e) { if (e.keyCode === 13) { e.preventDefault(); sendMessage(); } };
byId('input').oninput = function() { if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true }); };

connectSocket();
byId('form-container').style.display = 'none';
byId('messages').style.bottom = '0';
