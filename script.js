var API = 'https://stops-waiting-papers-pens.trycloudflare.com';
var STATIC_URL = 'https://stops-waiting-papers-pens.trycloudflare.com';

// ==============================================
// БЕЗОПАСНЫЙ BASE64 (работает с любыми байтами)
// ==============================================
var base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes) {
    var result = '';
    for (var i = 0; i < bytes.length; i += 3) {
        var b1 = bytes[i];
        var b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        var b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        var enc1 = b1 >> 2;
        var enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        var enc3 = ((b2 & 15) << 2) | (b3 >> 6);
        var enc4 = b3 & 63;
        if (i + 1 >= bytes.length) enc3 = enc4 = 64;
        else if (i + 2 >= bytes.length) enc4 = 64;
        result += base64chars.charAt(enc1) + base64chars.charAt(enc2) + base64chars.charAt(enc3) + base64chars.charAt(enc4);
    }
    return result;
}

function fromBase64(str) {
    var bytes = [];
    var i = 0;
    while (i < str.length) {
        var enc1 = base64chars.indexOf(str.charAt(i++));
        var enc2 = base64chars.indexOf(str.charAt(i++));
        var enc3 = base64chars.indexOf(str.charAt(i++));
        var enc4 = base64chars.indexOf(str.charAt(i++));
        var b1 = (enc1 << 2) | (enc2 >> 4);
        var b2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        var b3 = ((enc3 & 3) << 6) | enc4;
        bytes.push(b1);
        if (enc3 != 64) bytes.push(b2);
        if (enc4 != 64) bytes.push(b3);
    }
    return bytes;
}

// ==============================================
// XOR ШИФРОВАНИЕ (через байты)
// ==============================================
var SECRET_KEY_STORAGE = 'ichatter_xor_key';

function getSecretKey() {
    var key = localStorage.getItem(SECRET_KEY_STORAGE);
    if (!key) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        key = '';
        for (var i = 0; i < 64; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem(SECRET_KEY_STORAGE, key);
    }
    return key;
}

function stringToBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) bytes.push(code);
        else if (code < 2048) {
            bytes.push(192 | (code >> 6));
            bytes.push(128 | (code & 63));
        } else {
            bytes.push(224 | (code >> 12));
            bytes.push(128 | ((code >> 6) & 63));
            bytes.push(128 | (code & 63));
        }
    }
    return bytes;
}

function bytesToString(bytes) {
    var str = '';
    var i = 0;
    while (i < bytes.length) {
        var code = bytes[i++];
        if (code < 128) {
            str += String.fromCharCode(code);
        } else if (code >= 192 && code < 224) {
            var code2 = bytes[i++];
            str += String.fromCharCode(((code & 31) << 6) | (code2 & 63));
        } else {
            var code2 = bytes[i++];
            var code3 = bytes[i++];
            str += String.fromCharCode(((code & 15) << 12) | ((code2 & 63) << 6) | (code3 & 63));
        }
    }
    return str;
}

function simpleEncrypt(text, key) {
    var textBytes = stringToBytes(text);
    var encryptedBytes = [];
    for (var i = 0; i < textBytes.length; i++) {
        var keyChar = key.charCodeAt(i % key.length);
        encryptedBytes.push(textBytes[i] ^ keyChar);
    }
    return toBase64(encryptedBytes);
}

function simpleDecrypt(encryptedBase64, key) {
    var encryptedBytes = fromBase64(encryptedBase64);
    var decryptedBytes = [];
    for (var i = 0; i < encryptedBytes.length; i++) {
        var keyChar = key.charCodeAt(i % key.length);
        decryptedBytes.push(encryptedBytes[i] ^ keyChar);
    }
    return bytesToString(decryptedBytes);
}

function saveLocalEncrypted(chat, msgs) {
    var key = getSecretKey();
    var json = JSON.stringify(msgs);
    var encrypted = simpleEncrypt(json, key);
    localStorage.setItem('ichatter_msg_' + chat, encrypted);
}

function loadLocalEncrypted(chat) {
    var encrypted = localStorage.getItem('ichatter_msg_' + chat);
    if (!encrypted) return [];
    try {
        var key = getSecretKey();
        var json = simpleDecrypt(encrypted, key);
        return JSON.parse(json) || [];
    } catch (e) { return []; }
}

// ==============================================
// ОСНОВНОЙ КОД (без удаления сообщений)
// ==============================================
function getParam(name) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === name) return decodeURIComponent(pair[1] || '');
    }
    return null;
}

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
var loadedMessageIds = {};

if (!token || !myEmail) { window.location.href = 'login.html'; }

function byId(id) { return document.getElementById(id); }

var T = {
    ru: {
        chats: 'Чаты', archive: 'Архив', settings: 'Настройки', back: '← Назад',
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'офлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterId: 'Введите 6‑значный ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены',
        selfSearch: 'Нельзя искать самого себя', invalidId: 'ID должен состоять из 6 цифр',
        langLabel: 'Язык', themeLabel: 'Тема', wallpaper: 'Обои чата',
        nickname: 'Ник (не меняется)', displayName: 'Отображаемое имя',
        age: 'Возраст', about: 'О себе', avatar: 'Аватар', myId: 'Мой ID',
        devices: 'Устройства', searchPlaceholder: 'Введите ID (6 цифр)',
        uploadAvatar: 'Загрузить свой аватар', noAvatar: 'Аватар не установлен'
    },
    en: {
        chats: 'Chats', archive: 'Archive', settings: 'Settings', back: '← Back',
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterId: 'Enter 6‑digit ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved',
        selfSearch: 'You cannot search for yourself', invalidId: 'ID must be 6 digits',
        langLabel: 'Language', themeLabel: 'Theme', wallpaper: 'Chat Wallpaper',
        nickname: 'Nickname (unchangeable)', displayName: 'Display Name',
        age: 'Age', about: 'About', avatar: 'Avatar', myId: 'My ID',
        devices: 'Devices', searchPlaceholder: 'Enter ID (6 digits)',
        uploadAvatar: 'Upload Custom Avatar', noAvatar: 'No avatar'
    }
};
function t(k) { return T[lang][k] || k; }

function formatTime(ts) { var d = new Date(ts); var h = d.getHours(); var m = d.getMinutes(); if (m < 10) m = '0' + m; return h + ':' + m; }
function esc(s) { if (!s) return ''; var div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; }

function generateEmptyAvatar() {
    var size = 44;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#95a5a6';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('U', size / 2, size / 2 + 1);
    var dataUrl = canvas.toDataURL('image/png');
    document.body.removeChild(canvas);
    return dataUrl;
}

function addMsg(msg) {
    if (loadedMessageIds[msg.id]) return;
    loadedMessageIds[msg.id] = true;
    var container = byId('messages');
    var div = document.createElement('div');
    div.className = 'msg';
    if (msg.from === myEmail) div.className += ' my';
    div.id = 'msg-' + msg.id;
    var senderName = msg.fromUsername || msg.from.split('@')[0];
    var timeStr = formatTime(msg.timestamp);
    var displayText = msg.text || '';
    var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : esc(displayText);
    var edited = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';
    div.innerHTML = '<div class="sender">' + esc(senderName) + '</div>' +
                    '<div class="text">' + text + edited + '</div>' +
                    '<span class="time">' + timeStr + '</span>';
    if (msg.from === myEmail && !msg.deleted) {
        div.innerHTML += '<div class="actions"><button class="edit-btn" onclick="editMsg(\'' + msg.id + '\',\'' + esc(displayText).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="delMsg(\'' + msg.id + '\')">✕</button></div>';
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updMsg(id, text, edited) {
    var el = byId('msg-' + id);
    if (!el) return;
    var textDivs = el.getElementsByClassName('text');
    if (textDivs.length > 0) {
        textDivs[0].innerHTML = esc(text) + (edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '');
    }
}

function delMsgUI(id) {
    var el = byId('msg-' + id);
    if (!el) return;
    var textDivs = el.getElementsByClassName('text');
    if (textDivs.length > 0) textDivs[0].innerHTML = '<i>' + t('deleted') + '</i>';
    var actions = el.getElementsByClassName('actions');
    if (actions.length > 0) actions[0].style.display = 'none';
}

function showPartnerProfile() {
    if (!chatWith) return;
    var partner = null;
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === chatWith) { partner = contacts[i]; break; }
    }
    if (!partner) {
        byId('partner-displayname').textContent = chatWith.split('@')[0];
        byId('partner-username').textContent = chatWith.split('@')[0];
        byId('partner-id').textContent = '';
        byId('partner-status').textContent = '';
        byId('partner-age').textContent = '';
        byId('partner-about').textContent = '';
        byId('partner-avatar').src = generateEmptyAvatar();
        byId('partner-profile-overlay').style.display = 'flex';
        return;
    }
    byId('partner-displayname').textContent = partner.displayName || partner.username;
    byId('partner-username').textContent = partner.username || '';
    byId('partner-id').textContent = partner.searchId || '';
    byId('partner-status').textContent = partner.isOnline ? t('online') : t('offline');
    byId('partner-age').textContent = partner.age ? (t('age') + ': ' + partner.age) : '';
    byId('partner-about').textContent = partner.about || '';
    var avUrl = generateEmptyAvatar();
    if (partner.avatar && partner.avatar.indexOf('/uploads/avatars/') === 0) {
        avUrl = API + partner.avatar;
    }
    byId('partner-avatar').src = avUrl;
    byId('partner-profile-overlay').style.display = 'flex';
}

function closePartnerProfile() {
    byId('partner-profile-overlay').style.display = 'none';
}

function showTab(tab) {
    byId('chats-panel').style.display = 'none';
    byId('archive-panel').style.display = 'none';
    byId('settings-panel').style.display = 'none';
    byId('chat-area').style.display = 'none';
    var navs = document.getElementsByClassName('nav-btn');
    for (var i = 0; i < navs.length; i++) navs[i].className = 'nav-btn';
    byId('bottom-nav').style.display = 'table';
    byId('btn-back').style.display = 'none';
    byId('chat-title').innerHTML = 'iChatter';
    if (tab === 'chats') {
        byId('chats-panel').style.display = 'block';
        byId('nav-chats').className = 'nav-btn active';
        loadContacts();
    } else if (tab === 'archive') {
        byId('archive-panel').style.display = 'block';
        byId('nav-archive').className = 'nav-btn active';
        loadArchive();
    } else if (tab === 'settings') {
        byId('settings-panel').style.display = 'block';
        byId('nav-settings').className = 'nav-btn active';
        loadSettings();
    }
    updateNavTexts();
}

function openChat(em) {
    chatWith = em;
    byId('chats-panel').style.display = 'none';
    byId('archive-panel').style.display = 'none';
    byId('settings-panel').style.display = 'none';
    byId('chat-area').style.display = 'block';
    byId('bottom-nav').style.display = 'none';
    byId('btn-back').style.display = 'block';
    var name = pendingName;
    if (!name) {
        for (var i = 0; i < contacts.length; i++) {
            if (contacts[i].email === em) { name = contacts[i].displayName || contacts[i].username; break; }
        }
    }
    if (!name) name = em.split('@')[0];
    pendingName = null;
    byId('chat-title').innerHTML = name;
    byId('chat-title').onclick = showPartnerProfile;
    loadedMessageIds = {};
    byId('messages').innerHTML = '';

    if (!hasContact(em)) {
        addContactToServer(em);
        contacts.push({
            email: em,
            username: em.split('@')[0],
            displayName: em.split('@')[0],
            searchId: '',
            avatar: 'av1.png',
            age: 0,
            about: '',
            isOnline: false
        });
        renderContacts();
    }

    var msgs = loadLocalEncrypted(em);
    for (var j = 0; j < msgs.length; j++) {
        addMsg(msgs[j]);
    }
}

function goBack() { showTab('chats'); byId('chat-title').onclick = null; }

function updateNavTexts() {
    byId('nav-chats').textContent = t('chats');
    byId('nav-archive').textContent = t('archive');
    byId('nav-settings').textContent = t('settings');
    byId('search-input').placeholder = t('searchPlaceholder');
    byId('input').placeholder = t('msg');
    byId('send-btn').textContent = t('send');
    byId('btn-back').textContent = t('back');
}

function addContactToServer(email) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/add-contact', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ token: token, email: email }));
}

function hasContact(email) {
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === email) return true;
    }
    return false;
}

function loadContacts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/contacts?token=' + token, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            contacts = JSON.parse(xhr.responseText).contacts || [];
            renderContacts();
        }
    };
    xhr.send();
}

function renderContacts() {
    var list = byId('chats-list');
    list.innerHTML = '';
    if (!contacts.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;">' + t('noContacts') + '</div>';
        return;
    }
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var div = document.createElement('div');
        div.className = 'chat-item';
        var statusClass = c.isOnline ? 'online' : '';
        div.innerHTML = '<div class="name">' + esc(c.displayName || c.username) + '</div><div class="status ' + statusClass + '">' + (c.isOnline ? t('online') : t('offline')) + '</div><button class="archive-btn" onclick="event.stopPropagation();archiveChat(\'' + c.email + '\')">📦</button>';
        div.onclick = (function (email) { return function () { openChat(email); }; })(c.email);
        list.appendChild(div);
    }
}

function loadArchive() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/archived-chats?token=' + token, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText).contacts || [];
            var list = byId('archive-list');
            list.innerHTML = '';
            if (!data.length) {
                list.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;">' + t('empty') + '</div>';
                return;
            }
            for (var i = 0; i < data.length; i++) {
                var c = data[i];
                var div = document.createElement('div');
                div.className = 'chat-item';
                div.innerHTML = '<div class="name">' + esc(c.displayName || c.username) + '</div><button class="archive-btn unarchive-btn" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
                div.onclick = (function (email, name) { return function () { pendingName = name; openChat(email); }; })(c.email, c.displayName || c.username);
                list.appendChild(div);
            }
        }
    };
    xhr.send();
}

function archiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/archive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () { if (xhr.readyState === 4 && xhr.status === 200) loadContacts(); };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function unarchiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/unarchive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () { if (xhr.readyState === 4 && xhr.status === 200) { loadArchive(); loadContacts(); } };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function findUser() {
    var id = byId('search-input').value.trim();
    if (!id) { alert(t('enterId')); return; }
    if (!/^\d{6}$/.test(id)) { alert(t('invalidId')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/find-user?token=' + token + '&id=' + encodeURIComponent(id), true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var d = JSON.parse(xhr.responseText);
            if (d.found) {
                if (d.user.email === myEmail) { alert(t('selfSearch')); return; }
                pendingName = d.user.displayName || d.user.username;
                openChat(d.user.email);
            } else if (d.error) { alert(d.error); } else { alert(t('notFound')); }
        }
    };
    xhr.send();
}

function loadSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-profile?token=' + token, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            profile = JSON.parse(xhr.responseText).user;
            byId('set-username').value = profile.username || '';
            byId('set-displayname').value = profile.displayName || '';
            byId('set-age').value = profile.age || '';
            byId('set-about').value = profile.about || '';
            byId('lang-select').value = profile.language || lang;
            var savedTheme = profile.theme || 'dark';
            byId('theme-select').value = savedTheme;
            setTheme(savedTheme);
            byId('my-id-display').innerHTML = profile.searchId || '';
            loadAvatars();
            loadWallpapers();
            loadDevices();
            updateNavTexts();
        }
    };
    xhr.send();
}

function loadAvatars() {
    var grid = byId('avatar-grid');
    grid.innerHTML = '';
    if (profile.avatar && profile.avatar.indexOf('/uploads/avatars/') === 0) {
        var custImg = document.createElement('img');
        custImg.src = API + profile.avatar;
        custImg.className = 'selected';
        custImg.title = t('avatar');
        grid.appendChild(custImg);
    } else {
        var emptyImg = document.createElement('img');
        emptyImg.src = generateEmptyAvatar();
        emptyImg.className = 'selected';
        emptyImg.title = t('noAvatar');
        grid.appendChild(emptyImg);
    }
}

function loadWallpapers() {
    var grid = byId('wallpaper-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var walls = ['bg1.jpg', 'bg2.jpg', 'bg3.jpg', 'bg4.jpg', 'bg5.jpg', 'bg6.jpg', 'bg7.jpg', 'bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = STATIC_URL + '/wallpapers/' + walls[i];
        img.onerror = function () { this.style.display = 'none'; };
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function (w) {
            return function () {
                var imgs = grid.getElementsByTagName('img');
                for (var k = 0; k < imgs.length; k++) imgs[k].className = '';
                this.className = 'selected';
                profile.wallpaper = w;
                byId('messages').style.backgroundImage = 'url(' + STATIC_URL + '/wallpapers/' + w + ')';
                byId('messages').style.backgroundSize = 'cover';
            };
        })(walls[i]);
        grid.appendChild(img);
    }
    if (profile.wallpaper && profile.wallpaper.indexOf('/uploads/wallpapers/') === 0) {
        var custBg = document.createElement('img');
        custBg.src = API + profile.wallpaper;
        custBg.className = 'selected';
        custBg.onclick = function () {
            var imgs = grid.getElementsByTagName('img');
            for (var j = 0; j < imgs.length; j++) imgs[j].className = '';
            this.className = 'selected';
            profile.wallpaper = this.src.replace(API, '');
            byId('messages').style.backgroundImage = 'url(' + this.src + ')';
            byId('messages').style.backgroundSize = 'cover';
        };
        grid.appendChild(custBg);
    }
}

function loadDevices() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-devices?token=' + token, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var devices = JSON.parse(xhr.responseText).devices || [];
            var list = byId('devices-list');
            list.innerHTML = '';
            for (var i = 0; i < devices.length; i++) {
                var d = devices[i];
                var div = document.createElement('div');
                div.style.padding = '6px 0';
                var extra = d.isCurrent ? ' <b>[текущий]</b>' : ' <button onclick="logoutDevice(\'' + d.token + '\')" style="font-size:10px;background:#e74c3c;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">Выйти</button>';
                div.innerHTML = d.device + ' (' + new Date(d.created).toLocaleString() + ')' + extra;
                list.appendChild(div);
            }
        }
    };
    xhr.send();
}

function logoutDevice(tok) {
    if (!confirm('Выйти с устройства?')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/logout-device', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () { if (xhr.readyState === 4) loadDevices(); };
    xhr.send(JSON.stringify({ token: token, targetToken: tok }));
}

function saveSettings() {
    profile.displayName = byId('set-displayname').value;
    profile.age = parseInt(byId('set-age').value) || 0;
    profile.about = byId('set-about').value;
    var newLang = byId('lang-select').value;
    var newTheme = byId('theme-select').value;
    lang = newLang;
    localStorage.setItem('lang', lang);
    setTheme(newTheme);
    profile.language = newLang;
    profile.theme = newTheme;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/update-profile', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) { alert(t('saved')); showTab('settings'); }
    };
    xhr.send(JSON.stringify({ token: token, displayName: profile.displayName, age: profile.age, about: profile.about, avatar: profile.avatar, theme: newTheme, language: newLang, wallpaper: profile.wallpaper }));
}

function setLang(l) { lang = l; localStorage.setItem('lang', lang); updateNavTexts(); if (byId('lang-select')) byId('lang-select').value = lang; }
function setTheme(th) {
    if (th === 'light') { document.body.className = 'light-mode'; } else { document.body.className = 'dark-mode'; }
    if (profile) profile.theme = th;
    if (byId('theme-select')) byId('theme-select').value = th;
}

function uploadCustomAvatar(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('avatar', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload-avatar?token=' + token, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var resp = JSON.parse(xhr.responseText);
            if (resp.success) { alert('Аватар обновлён!'); profile.avatar = resp.url; loadAvatars(); }
        }
        input.value = '';
    };
    xhr.send(formData);
}

function sendMessage() {
    var input = byId('input');
    var text = input.value.trim();
    if (!text || !chatWith || !socket) return;
    if (editingId) {
        socket.emit('edit_message', { id: editingId, newText: text, to: chatWith });
        editingId = null;
    } else {
        socket.emit('send_message', { to: chatWith, text: text });
    }
    input.value = '';
}

function editMsg(id, text) { editingId = id; byId('input').value = text; byId('input').focus(); }
function delMsg(id) { if (confirm('Удалить сообщение?')) socket.emit('delete_message', { id: id, to: chatWith }); }

function connectSocket() {
    socket = io(API, { query: { token: token } });

    socket.on('receive_message', function (msg) {
        if (chatWith === msg.from) addMsg(msg);
        var target = msg.from === myEmail ? msg.to : msg.from;
        var arr = loadLocalEncrypted(target);
        arr.push(msg);
        if (arr.length > 500) arr = arr.slice(-500);
        saveLocalEncrypted(target, arr);
        if (!hasContact(msg.from)) {
            addContactToServer(msg.from);
            loadContacts();
        }
        loadContacts();
    });

    socket.on('message_sent', function (msg) {
        if (chatWith === msg.to) addMsg(msg);
        var arr = loadLocalEncrypted(msg.to);
        arr.push(msg);
        if (arr.length > 500) arr = arr.slice(-500);
        saveLocalEncrypted(msg.to, arr);
        if (!hasContact(msg.to)) {
            addContactToServer(msg.to);
            loadContacts();
        }
        loadContacts();
    });

    socket.on('update_message', function (d) {
        updMsg(d.id, d.text, d.edited);
        var arr = loadLocalEncrypted(chatWith);
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === d.id) { arr[i].text = d.text; arr[i].edited = d.edited; break; }
        }
        saveLocalEncrypted(chatWith, arr);
    });

    socket.on('remove_message', function (d) {
        delMsgUI(d.id);
        var arr = loadLocalEncrypted(chatWith);
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === d.id) { arr[i].deleted = true; arr[i].text = ''; break; }
        }
        saveLocalEncrypted(chatWith, arr);
    });

    socket.on('user_typing', function (data) {
        if (chatWith === data.from && data.isTyping) {
            byId('chat-title').innerHTML = data.username + ' (' + t('typing') + ')';
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(function () {
                if (chatWith === data.from) {
                    var name = chatWith.split('@')[0];
                    for (var i = 0; i < contacts.length; i++) if (contacts[i].email === chatWith) { name = contacts[i].displayName || contacts[i].username; break; }
                    byId('chat-title').innerHTML = name;
                }
            }, 2000);
        }
    });
}

byId('send-btn').onclick = sendMessage;
byId('input').onkeydown = function (e) { if (e.keyCode === 13) { e.preventDefault(); sendMessage(); } };
byId('input').oninput = function () { if (chatWith && socket) socket.emit('typing', { to: chatWith, isTyping: true }); };

byId('input').onfocus = function () {
    if (byId('chat-area').style.display === 'block') {
        byId('main-content').style.paddingBottom = '250px';
        setTimeout(function () { byId('messages').scrollTop = byId('messages').scrollHeight; }, 100);
    }
};
byId('input').onblur = function () { byId('main-content').style.paddingBottom = '0px'; };

connectSocket();
showTab('chats');
