// ==============================================
// ВСТРОЕННАЯ БИБЛИОТЕКА AES (CBC, 256 бит, PKCS7)
// ==============================================
var Aes = {
    cipher: function (input, w) {
        var Nb = 4;
        var Nr = w.length / Nb - 1;
        var state = [[], [], [], []];
        for (var i = 0; i < 4 * Nb; i++) state[i % 4][Math.floor(i / 4)] = input[i];
        state = Aes.addRoundKey(state, w, 0, Nb);
        for (var round = 1; round < Nr; round++) {
            state = Aes.subBytes(state, Nb);
            state = Aes.shiftRows(state, Nb);
            state = Aes.mixColumns(state, Nb);
            state = Aes.addRoundKey(state, w, round, Nb);
        }
        state = Aes.subBytes(state, Nb);
        state = Aes.shiftRows(state, Nb);
        state = Aes.addRoundKey(state, w, Nr, Nb);
        var output = new Array(4 * Nb);
        for (var i = 0; i < 4 * Nb; i++) output[i] = state[i % 4][Math.floor(i / 4)];
        return output;
    },
    keyExpansion: function (key) {
        var Nb = 4;
        var Nk = key.length / 4;
        var Nr = Nk + 6;
        var w = new Array(Nb * (Nr + 1));
        var temp = new Array(4);
        for (var i = 0; i < Nk; i++) {
            var r = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
            w[i] = r;
        }
        for (var i = Nk; i < (Nb * (Nr + 1)); i++) {
            w[i] = new Array(4);
            for (var t = 0; t < 4; t++) temp[t] = w[i - 1][t];
            if (i % Nk == 0) {
                temp = Aes.subWord(Aes.rotWord(temp));
                for (var t = 0; t < 4; t++) temp[t] ^= Aes.rCon[i / Nk][t];
            } else if (Nk > 6 && i % Nk == 4) {
                temp = Aes.subWord(temp);
            }
            for (var t = 0; t < 4; t++) w[i][t] = w[i - Nk][t] ^ temp[t];
        }
        return w;
    },
    subBytes: function (s, Nb) {
        for (var r = 0; r < 4; r++)
            for (var c = 0; c < Nb; c++) s[r][c] = Aes.sBox[s[r][c]];
        return s;
    },
    shiftRows: function (s, Nb) {
        var t = new Array(4);
        for (var r = 1; r < 4; r++) {
            for (var c = 0; c < 4; c++) t[c] = s[r][(c + r) % Nb];
            for (var c = 0; c < 4; c++) s[r][c] = t[c];
        }
        return s;
    },
    mixColumns: function (s, Nb) {
        for (var c = 0; c < 4; c++) {
            var a = new Array(4);
            var b = new Array(4);
            for (var i = 0; i < 4; i++) {
                a[i] = s[i][c];
                b[i] = s[i][c] & 0x80 ? s[i][c] << 1 ^ 0x011b : s[i][c] << 1;
            }
            s[0][c] = b[0] ^ a[1] ^ b[1] ^ a[2] ^ a[3];
            s[1][c] = a[0] ^ b[1] ^ a[2] ^ b[2] ^ a[3];
            s[2][c] = a[0] ^ a[1] ^ b[2] ^ a[3] ^ b[3];
            s[3][c] = a[0] ^ b[0] ^ a[1] ^ a[2] ^ b[3];
        }
        return s;
    },
    addRoundKey: function (state, w, rnd, Nb) {
        for (var r = 0; r < 4; r++)
            for (var c = 0; c < Nb; c++) state[r][c] ^= w[rnd * 4 + c][r];
        return state;
    },
    subWord: function (w) {
        for (var i = 0; i < 4; i++) w[i] = Aes.sBox[w[i]];
        return w;
    },
    rotWord: function (w) {
        var tmp = w[0];
        for (var i = 0; i < 3; i++) w[i] = w[i + 1];
        w[3] = tmp;
        return w;
    },
    sBox: [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
        0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
        0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
        0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
        0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
        0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
        0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
        0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
        0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
        0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
        0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
        0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
        0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
        0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
        0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
        0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16],
    rCon: [[0x00, 0x00, 0x00, 0x00], [0x01, 0x00, 0x00, 0x00], [0x02, 0x00, 0x00, 0x00],
        [0x04, 0x00, 0x00, 0x00], [0x08, 0x00, 0x00, 0x00], [0x10, 0x00, 0x00, 0x00],
        [0x20, 0x00, 0x00, 0x00], [0x40, 0x00, 0x00, 0x00], [0x80, 0x00, 0x00, 0x00],
        [0x1b, 0x00, 0x00, 0x00], [0x36, 0x00, 0x00, 0x00]]
};

function pkcs7Pad(data, blockSize) {
    var pad = blockSize - data.length % blockSize;
    var arr = [];
    for (var i = 0; i < data.length; i++) arr.push(data[i]);
    for (var i = 0; i < pad; i++) arr.push(pad);
    return arr;
}
function pkcs7Unpad(data) {
    var pad = data[data.length - 1];
    return data.slice(0, data.length - pad);
}

function aesEncrypt(plainBytes, keyBytes, ivBytes) {
    var w = Aes.keyExpansion(keyBytes);
    var plainBlocks = [];
    var padded = pkcs7Pad(plainBytes, 16);
    for (var i = 0; i < padded.length; i += 16) {
        var block = [];
        for (var j = 0; j < 16; j++) block.push(padded[i + j]);
        if (i === 0) {
            for (var j = 0; j < 16; j++) block[j] ^= ivBytes[j];
        } else {
            for (var j = 0; j < 16; j++) block[j] ^= plainBlocks[i / 16 - 1][j];
        }
        var encBlock = Aes.cipher(block, w);
        plainBlocks.push(encBlock);
    }
    var cipher = [];
    for (var i = 0; i < plainBlocks.length; i++) {
        for (var j = 0; j < 16; j++) cipher.push(plainBlocks[i][j]);
    }
    return cipher;
}

function aesDecrypt(cipherBytes, keyBytes, ivBytes) {
    var w = Aes.keyExpansion(keyBytes);
    var cipherBlocks = [];
    for (var i = 0; i < cipherBytes.length; i += 16) {
        var block = [];
        for (var j = 0; j < 16; j++) block.push(cipherBytes[i + j]);
        cipherBlocks.push(block);
    }
    var decrypted = [];
    for (var i = 0; i < cipherBlocks.length; i++) {
        var decBlock = Aes.cipher(cipherBlocks[i], w);
        if (i === 0) {
            for (var j = 0; j < 16; j++) decBlock[j] ^= ivBytes[j];
        } else {
            for (var j = 0; j < 16; j++) decBlock[j] ^= cipherBlocks[i - 1][j];
        }
        decrypted = decrypted.concat(decBlock);
    }
    return pkcs7Unpad(decrypted);
}

// ==============================================
// НАСТРОЙКА URL
// ==============================================
var API = 'https://ichatterios6.iosvidocum.workers.dev';
var STATIC_URL = 'https://ichatterios6.iosvidocum.workers.dev';

// ==============================================
// ЛОКАЛЬНОЕ ХРАНЕНИЕ С AES-256-CBC
// ==============================================
var AES_KEY_STORAGE = 'ichatter_aes_key';

function getAesKey() {
    var keyHex = localStorage.getItem(AES_KEY_STORAGE);
    if (!keyHex) {
        var bytes = [];
        for (var i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
        keyHex = '';
        for (var i = 0; i < bytes.length; i++) keyHex += ('00' + bytes[i].toString(16)).slice(-2);
        localStorage.setItem(AES_KEY_STORAGE, keyHex);
    }
    var keyBytes = [];
    for (var i = 0; i < keyHex.length; i += 2) keyBytes.push(parseInt(keyHex.substr(i, 2), 16));
    return keyBytes;
}

function generateIV() {
    var iv = [];
    for (var i = 0; i < 16; i++) iv.push(Math.floor(Math.random() * 256));
    return iv;
}

function encryptData(plainText, key) {
    var plainBytes = [];
    for (var i = 0; i < plainText.length; i++) plainBytes.push(plainText.charCodeAt(i) & 0xFF);
    var iv = generateIV();
    var cipher = aesEncrypt(plainBytes, key, iv);
    var result = iv.concat(cipher);
    var base64 = btoa(String.fromCharCode.apply(null, result));
    return base64;
}

function decryptData(base64, key) {
    var raw = atob(base64);
    var bytes = [];
    for (var i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i) & 0xFF);
    if (bytes.length < 16) return '';
    var iv = bytes.slice(0, 16);
    var cipher = bytes.slice(16);
    var decrypted = aesDecrypt(cipher, key, iv);
    var text = '';
    for (var i = 0; i < decrypted.length; i++) text += String.fromCharCode(decrypted[i]);
    return text;
}

function loadLocalEncrypted(chat) {
    var encrypted = localStorage.getItem('ichatter_msg_' + chat);
    if (!encrypted) return [];
    try {
        var json = decryptData(encrypted, getAesKey());
        return JSON.parse(json) || [];
    } catch (e) { return []; }
}

function saveLocalEncrypted(chat, msgs) {
    var json = JSON.stringify(msgs);
    var encrypted = encryptData(json, getAesKey());
    try {
        localStorage.setItem('ichatter_msg_' + chat, encrypted);
    } catch (e) {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('ichatter_msg_') === 0) keys.push(k);
        }
        if (keys.length > 10) {
            localStorage.removeItem(keys[0]);
            saveLocalEncrypted(chat, msgs);
        }
    }
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
