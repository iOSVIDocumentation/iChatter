// Очищаем старые данные
localStorage.removeItem('ichatter_aes_key');
localStorage.removeItem('ichatter_e2ee_keys');
var keysToRemove = [];
for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf('ichatter_msg_') === 0) keysToRemove.push(k);
}
for (var j = 0; j < keysToRemove.length; j++) {
    localStorage.removeItem(keysToRemove[j]);
}

var API = 'https://ichatterios6.iosvidocum.workers.dev';
var STATIC_URL = 'https://ichatterios6.iosvidocum.workers.dev';

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
// ОСНОВНОЙ КОД
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

function addMsg(msg) { /* без изменений */ }
function updMsg(id, text, edited) { /* без изменений */ }
function delMsgUI(id) { /* без изменений */ }
function showPartnerProfile() { /* без изменений */ }
function closePartnerProfile() { /* без изменений */ }
function showTab(tab) { /* без изменений */ }
function openChat(em) {
    chatWith = em;
    // ... (как раньше, но загружаем через loadLocalEncrypted)
}
function goBack() { /* без изменений */ }
function updateNavTexts() { /* без изменений */ }
function addContactToServer(email) { /* без изменений */ }
function hasContact(email) { /* без изменений */ }
function loadContacts() { /* без изменений */ }
function renderContacts() { /* без изменений */ }
function loadArchive() { /* без изменений */ }
function archiveChat(em) { /* без изменений */ }
function unarchiveChat(em) { /* без изменений */ }
function findUser() { /* без изменений */ }
function loadSettings() { /* без изменений */ }
function loadAvatars() { /* без изменений */ }
function loadWallpapers() { /* без изменений */ }
function loadDevices() { /* без изменений */ }
function logoutDevice(tok) { /* без изменений */ }
function saveSettings() { /* без изменений */ }
function setLang(l) { /* без изменений */ }
function setTheme(th) { /* без изменений */ }
function uploadCustomAvatar(input) { /* без изменений */ }
function sendMessage() { /* без изменений */ }
function editMsg(id, text) { /* без изменений */ }
function delMsg(id) { /* без изменений */ }

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
