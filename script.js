// ==============================================
// ВСТРОЕННАЯ БИБЛИОТЕКА CRYPTOJS (AES-256-CBC)
// ==============================================
var CryptoJS = CryptoJS || (function (h, s) { var f = {}, t = f.lib = {}, g = function () { }, j = t.Base = { extend: function (a) { g.prototype = this; var c = new g; a && c.mixIn(a); c.hasOwnProperty("init") || (c.init = function () { c.$super.init.apply(this, arguments) }); c.init.prototype = c; c.$super = this; return c }, create: function () { var a = this.extend(); a.init.apply(a, arguments); return a }, init: function () { }, mixIn: function (a) { for (var c in a) a.hasOwnProperty(c) && (this[c] = a[c]); a.hasOwnProperty("toString") && (this.toString = a.toString) }, clone: function () { return this.init.prototype.extend(this) } }, q = t.WordArray = j.extend({ init: function (a, c) { a = this.words = a || []; this.sigBytes = c != s ? c : 4 * a.length }, toString: function (a) { return (a || p).stringify(this) }, concat: function (a) { var c = this.words, d = a.words, b = this.sigBytes; a = a.sigBytes; this.clamp(); if (b % 4) for (var e = 0; e < a; e++) c[b + e >>> 2] |= (d[e >>> 2] >>> 24 - 8 * (e % 4) & 255) << 24 - 8 * ((b + e) % 4); else if (65535 < d.length) for (e = 0; e < a; e += 4) c[b + e >>> 2] = d[e >>> 2]; else c.push.apply(c, d); this.sigBytes += a; return this }, clamp: function () { var a = this.words, c = this.sigBytes; a[c >>> 2] &= 4294967295 << 32 - 8 * (c % 4); a.length = h.ceil(c / 4) }, clone: function () { var a = j.clone.call(this); a.words = this.words.slice(0); return a }, random: function (a) { for (var c = [], d = 0; d < a; d += 4) c.push(4294967296 * h.random() | 0); return new q.init(c, a) } }), v = f.enc = {}, p = v.Hex = { stringify: function (a) { var c = a.words; a = a.sigBytes; for (var d = [], b = 0; b < a; b++) { var e = c[b >>> 2] >>> 24 - 8 * (b % 4) & 255; d.push((e >>> 4).toString(16)); d.push((e & 15).toString(16)) } return d.join("") }, parse: function (a) { for (var c = a.length, d = [], b = 0; b < c; b += 2) d[b >>> 3] |= parseInt(a.substr(b, 2), 16) << 24 - 4 * (b % 8); return new q.init(d, c / 2) } }, b = v.Latin1 = { stringify: function (a) { var c = a.words; a = a.sigBytes; for (var d = [], b = 0; b < a; b++) d.push(String.fromCharCode(c[b >>> 2] >>> 24 - 8 * (b % 4) & 255)); return d.join("") }, parse: function (a) { for (var c = a.length, d = [], b = 0; b < c; b++) d[b >>> 2] |= (a.charCodeAt(b) & 255) << 24 - 8 * (b % 4); return new q.init(d, c) } }, l = v.Utf8 = { stringify: function (a) { try { return decodeURIComponent(escape(b.stringify(a))) } catch (c) { throw Error("Malformed UTF-8 data") } }, parse: function (a) { return b.parse(unescape(encodeURIComponent(a))) } }, x = t.BufferedBlockAlgorithm = j.extend({ reset: function () { this._data = new q.init; this._nDataBytes = 0 }, _append: function (a) { "string" == typeof a && (a = l.parse(a)); this._data.concat(a); this._nDataBytes += a.sigBytes }, _process: function (a) { var c = this._data, d = c.words, b = c.sigBytes, e = this.blockSize, f = b / (4 * e), f = a ? h.ceil(f) : h.max((f | 0) - this._minBufferSize, 0); a = f * e; b = h.min(4 * a, b); if (a) { for (var g = 0; g < a; g += e) this._doProcessBlock(d, g); g = d.splice(0, a); c.sigBytes -= b } return new q.init(g, b) }, clone: function () { var a = j.clone.call(this); a._data = this._data.clone(); return a }, _minBufferSize: 0 }); t.Hasher = x.extend({ cfg: j.extend(), init: function (a) { this.cfg = this.cfg.extend(a); this.reset() }, reset: function () { x.reset.call(this); this._doReset() }, update: function (a) { this._append(a); this._process(); return this }, finalize: function (a) { a && this._append(a); return this._doFinalize() }, blockSize: 16, _createHelper: function (a) { return function (c, d) { return (new a.init(d)).finalize(c) } }, _createHmacHelper: function (a) { return function (c, d) { return (new k.HMAC.init(a, d)).finalize(c) } } }); var k = f.algo = {}; return f })(Math);
(function () { var h = CryptoJS, s = h.lib.WordArray; h.enc.Base64 = { stringify: function (f) { var t = f.words, g = f.sigBytes, j = this._map; f.clamp(); f = []; for (var q = 0; q < g; q += 3) for (var v = (t[q >>> 2] >>> 24 - 8 * (q % 4) & 255) << 16 | (t[q + 1 >>> 2] >>> 24 - 8 * ((q + 1) % 4) & 255) << 8 | t[q + 2 >>> 2] >>> 24 - 8 * ((q + 2) % 4) & 255, p = 0; 4 > p && q + 0.75 * p < g; p++) f.push(j.charAt(v >>> 6 * (3 - p) & 63)); if (t = j.charAt(64)) for (; f.length % 4;) f.push(t); return f.join("") }, parse: function (f) { var t = f.length, g = this._map, j = g.charAt(64); j && (j = f.indexOf(j), -1 != j && (t = j)); for (var j = [], q = 0, v = 0; v < t; v++) if (v % 4) { var p = g.indexOf(f.charAt(v - 1)) << 2 * (v % 4), b = g.indexOf(f.charAt(v)) >>> 6 - 2 * (v % 4); j[q >>> 2] |= (p | b) << 24 - 8 * (q % 4); q++ } return s.create(j, q) }, _map: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=" } })();
(function () { var h = CryptoJS, s = h.lib, f = s.WordArray, t = s.Hasher, g = h.algo, j = []; (function () { for (var s = 0; 256 > s; s++) { var f = s, t = s; t = (t << 1 | t >>> 31) & 255; t = (t << 1 | t >>> 31) & 255; t = (t << 1 | t >>> 31) & 255; t = (t << 1 | t >>> 31) & 255; for (var g = 0; 8 > g; g++) { var v = (t >>> 24 & 255) << 24 | (t >>> 16 & 255) << 16 | (t >>> 8 & 255) << 8 | t & 255; v = (v << 1 | v >>> 31) & 4294967295; t ^= v } j[s] = t } })(); var q = [], v = []; for (var p = 0; 256 > p; p++) { var b = j[p]; v[p] = (b >>> 24 & 255) << 24 | (b >>> 16 & 255) << 16 | (b >>> 8 & 255) << 8 | b & 255; q[p] = (b >>> 24 & 255) << 24 | (b >>> 16 & 255) << 16 | (b >>> 8 & 255) << 8 | b & 255 } var l = [0, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54], x = g.AES = t.extend({ _doReset: function () { for (var a = this._key, c = a.words, d = a.sigBytes / 4, a = 4 * ((this._nRounds = d + 6) + 1), b = this._keySchedule = [], e = 0; e < a; e++) if (e < d) b[e] = c[e]; else { var f = b[e - 1]; e % d ? 6 < d && 4 == e % d && (f = v[f >>> 24] << 24 | v[f >>> 16 & 255] << 16 | v[f >>> 8 & 255] << 8 | v[f & 255]) : (f = v[(f = f << 8 | f >>> 24) >>> 24] << 24 | v[f >>> 16 & 255] << 16 | v[f >>> 8 & 255] << 8 | v[f & 255], f ^= l[e / d | 0] << 24); b[e] = b[e - d] ^ f } c = this._invKeySchedule = []; for (d = 0; d < a; d++) e = a - d, f = d % 4 ? b[e] : b[e - 4], c[d] = 4 > d || 4 >= e ? f : q[v[f >>> 24]] ^ v[v[f >>> 16 & 255]] ^ v[v[f >>> 8 & 255]] ^ v[v[f & 255]] }, encryptBlock: function (a, c) { this._doCryptBlock(a, c, this._keySchedule, v, q) }, decryptBlock: function (a, c) { var d = a[c + 1]; a[c + 1] = a[c + 3]; a[c + 3] = d; this._doCryptBlock(a, c, this._invKeySchedule, q, v); d = a[c + 1]; a[c + 1] = a[c + 3]; a[c + 3] = d }, _doCryptBlock: function (a, c, d, b, e) { for (var f = this._nRounds, g = a[c] ^ d[0], h = a[c + 1] ^ d[1], j = a[c + 2] ^ d[2], k = a[c + 3] ^ d[3], l = 4, m = 1; m < f; m++) { var n = b[g >>> 24] ^ b[h >>> 16 & 255] ^ b[j >>> 8 & 255] ^ b[k & 255] ^ d[l++]; var o = b[h >>> 24] ^ b[j >>> 16 & 255] ^ b[k >>> 8 & 255] ^ b[g & 255] ^ d[l++]; var p = b[j >>> 24] ^ b[k >>> 16 & 255] ^ b[g >>> 8 & 255] ^ b[h & 255] ^ d[l++]; k = b[k >>> 24] ^ b[g >>> 16 & 255] ^ b[h >>> 8 & 255] ^ b[j & 255] ^ d[l++]; g = n; h = o; j = p } n = (e[g >>> 24] << 24 | e[h >>> 16 & 255] << 16 | e[j >>> 8 & 255] << 8 | e[k & 255]) ^ d[l++]; o = (e[h >>> 24] << 24 | e[j >>> 16 & 255] << 16 | e[k >>> 8 & 255] << 8 | e[g & 255]) ^ d[l++]; p = (e[j >>> 24] << 24 | e[k >>> 16 & 255] << 16 | e[g >>> 8 & 255] << 8 | e[h & 255]) ^ d[l++]; k = (e[k >>> 24] << 24 | e[g >>> 16 & 255] << 16 | e[h >>> 8 & 255] << 8 | e[j & 255]) ^ d[l++]; a[c] = n; a[c + 1] = o; a[c + 2] = p; a[c + 3] = k }, keySize: 8 }); h.AES = t._createHelper(x) })();
(function () { var h = CryptoJS, s = h.lib, f = s.WordArray, t = s.Hasher, g = h.algo, j = f.create([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63]), q = f.create([63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]); var v = g.SHA256 = t.extend({ _doReset: function () { this._hash = new f.init([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]) }, _doProcessBlock: function (a, c) { for (var d = this._hash.words, b = d[0], e = d[1], f = d[2], g = d[3], h = d[4], j = d[5], k = d[6], l = d[7], m = 0; 64 > m; m++) { if (16 > m) v[m] = a[c + m] | 0; else { var n = v[m - 15], o = v[m - 2]; v[m] = ((n << 25 | n >>> 7) ^ (n << 14 | n >>> 18) ^ n >>> 3) + v[m - 7] + ((o << 15 | o >>> 17) ^ (o << 13 | o >>> 19) ^ o >>> 10) + v[m - 16] } n = l + ((h << 26 | h >>> 6) ^ (h << 21 | h >>> 11) ^ (h << 7 | h >>> 25)) + (h & j ^ ~h & k) + j[m] + v[m]; o = ((b << 30 | b >>> 2) ^ (b << 19 | b >>> 13) ^ (b << 10 | b >>> 22)) + (b & e ^ b & f ^ e & f); l = k; k = j; j = h; h = g + n | 0; g = f; f = e; e = b; b = n + o | 0 } d[0] = d[0] + b | 0; d[1] = d[1] + e | 0; d[2] = d[2] + f | 0; d[3] = d[3] + g | 0; d[4] = d[4] + h | 0; d[5] = d[5] + j | 0; d[6] = d[6] + k | 0; d[7] = d[7] + l | 0 }, _doFinalize: function () { var a = this._data, c = a.words, d = 8 * this._nDataBytes, b = 8 * a.sigBytes; c[b >>> 5] |= 128 << 24 - b % 32; c[(b + 64 >>> 9 << 4) + 14] = h.floor(d / 4294967296); c[(b + 64 >>> 9 << 4) + 15] = d; a.sigBytes = 4 * c.length; this._process(); return this._hash }, clone: function () { var a = t.clone.call(this); a._hash = this._hash.clone(); return a } }); h.SHA256 = t._createHelper(v); h.HmacSHA256 = t._createHmacHelper(v) })();
(function () { var h = CryptoJS, s = h.lib, f = s.Base, t = s.WordArray, g = h.algo, j = g.HMAC, q = g.PBKDF2 = f.extend({ cfg: f.extend({ keySize: 4, hasher: g.SHA256, iterations: 1 }), init: function (a) { this.cfg = this.cfg.extend(a) }, compute: function (a, c) { for (var d = this.cfg, b = j.create(d.hasher, a), e = t.create(), f = t.create([0]), g = q; e.sigBytes < 4 * d.keySize;) { var h = b.update(c).finalize(f); b.reset(); for (var k = h, l = 1; l < d.iterations; l++) { k = b.update(k).finalize(f); for (var m = 0; m < h.sigBytes; m++) h.words[m] ^= k.words[m] } e.concat(h); f.words[0]++ } e.sigBytes = 4 * d.keySize; return e } }); h.PBKDF2 = function (a, c, d) { return q.create(d).compute(a, c) } })();
(function () { var h = CryptoJS, s = h.lib, f = s.WordArray, t = h.enc, g = t.Utf8, j = t.Base64, q = h.algo, v = q.PBKDF2, p = q.AES, b = h.mode, l = b.CBC, x = h.pad, k = x.Pkcs7; h.AES.encrypt = function (a, c, d) { var b = (d && d.iv) ? f.create(d.iv) : f.random(16); c = v.create({ keySize: 256 / 32, iterations: (d && d.iterations) || 1 }).compute(c, b); var e = g.parse(a); a = l.encrypt(e, c, { iv: b }); return b.concat(a).toString(j) }; h.AES.decrypt = function (a, c, d) { var b = j.parse(a); a = b.clone(); b.sigBytes = 16; b.clamp(); var e = b; a.words.splice(0, 4); a.sigBytes -= 16; c = v.create({ keySize: 256 / 32, iterations: (d && d.iterations) || 1 }).compute(c, e); return l.decrypt(a, c, { iv: e }).toString(g) } })();

// ==============================================
// НАСТРОЙКА URL
// ==============================================
var API = 'https://ichatterios6.iosvidocum.workers.dev';
var STATIC_URL = 'https://ichatterios6.iosvidocum.workers.dev';

// ==============================================
// ЛОКАЛЬНОЕ ШИФРОВАНИЕ (AES-256-CBC)
// ==============================================
var LOCAL_KEY_STORAGE = 'ichatter_local_key';
var MSG_STORAGE_PREFIX = 'ichatter_msg_';

function getLocalKey() {
    var key = localStorage.getItem(LOCAL_KEY_STORAGE);
    if (!key) {
        key = CryptoJS.lib.WordArray.random(32).toString();
        localStorage.setItem(LOCAL_KEY_STORAGE, key);
    }
    return key;
}

function encryptText(plainText, key) {
    return CryptoJS.AES.encrypt(plainText, key).toString();
}

function decryptText(cipherText, key) {
    var bytes = CryptoJS.AES.decrypt(cipherText, key);
    return bytes.toString(CryptoJS.enc.Utf8);
}

function getChatStorageKey(chatWith) {
    return MSG_STORAGE_PREFIX + chatWith;
}

function loadLocalMessages(chatWith) {
    var key = getLocalKey();
    var storageKey = getChatStorageKey(chatWith);
    var encrypted = localStorage.getItem(storageKey);
    if (!encrypted) return [];
    try {
        var json = decryptText(encrypted, key);
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

function saveLocalMessages(chatWith, messages) {
    var key = getLocalKey();
    var storageKey = getChatStorageKey(chatWith);
    var json = JSON.stringify(messages);
    var encrypted = encryptText(json, key);
    try {
        localStorage.setItem(storageKey, encrypted);
    } catch (e) {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(MSG_STORAGE_PREFIX) === 0) keys.push(k);
        }
        if (keys.length > 10) {
            localStorage.removeItem(keys[0]);
            saveLocalMessages(chatWith, messages);
        }
    }
}

function addLocalMessage(chatWith, msg) {
    var messages = loadLocalMessages(chatWith);
    for (var i = 0; i < messages.length; i++) {
        if (messages[i].id === msg.id) return;
    }
    messages.push(msg);
    messages.sort(function (a, b) { return a.timestamp - b.timestamp; });
    if (messages.length > 500) messages = messages.slice(-500);
    saveLocalMessages(chatWith, messages);
}

function updateLocalMessage(chatWith, id, newText, edited) {
    var messages = loadLocalMessages(chatWith);
    for (var i = 0; i < messages.length; i++) {
        if (messages[i].id === id) {
            messages[i].text = newText;
            messages[i].edited = edited;
            break;
        }
    }
    saveLocalMessages(chatWith, messages);
}

function deleteLocalMessage(chatWith, id) {
    var messages = loadLocalMessages(chatWith);
    for (var i = 0; i < messages.length; i++) {
        if (messages[i].id === id) {
            messages[i].deleted = true;
            messages[i].text = '';
            break;
        }
    }
    saveLocalMessages(chatWith, messages);
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
    ctx.arc(size/2, size/2, size/2-2, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('U', size/2, size/2+1);
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

    // Загружаем локальную историю
    var localMsgs = loadLocalMessages(em);
    for (var j = 0; j < localMsgs.length; j++) {
        addMsg(localMsgs[j]);
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

// loadMessages больше не нужна – удалена

function loadContacts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/contacts?token=' + token, true);
    xhr.onreadystatechange = function() {
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
        div.onclick = (function(email) { return function() { openChat(email); }; })(c.email);
        list.appendChild(div);
    }
}

function loadArchive() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/archived-chats?token=' + token, true);
    xhr.onreadystatechange = function() {
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
                div.onclick = (function(email, name) { return function() { pendingName = name; openChat(email); }; })(c.email, c.displayName || c.username);
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
    xhr.onreadystatechange = function() { if (xhr.readyState === 4 && xhr.status === 200) loadContacts(); };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function unarchiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/unarchive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() { if (xhr.readyState === 4 && xhr.status === 200) { loadArchive(); loadContacts(); } };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function findUser() {
    var id = byId('search-input').value.trim();
    if (!id) { alert(t('enterId')); return; }
    if (!/^\d{6}$/.test(id)) { alert(t('invalidId')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/find-user?token=' + token + '&id=' + encodeURIComponent(id), true);
    xhr.onreadystatechange = function() {
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
    xhr.onreadystatechange = function() {
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
    var walls = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = STATIC_URL + '/wallpapers/' + walls[i];
        img.onerror = function() { this.style.display = 'none'; };
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function(w) { return function() { var imgs = grid.getElementsByTagName('img'); for (var k = 0; k < imgs.length; k++) imgs[k].className = ''; this.className = 'selected'; profile.wallpaper = w; byId('messages').style.backgroundImage = 'url(' + STATIC_URL + '/wallpapers/' + w + ')'; byId('messages').style.backgroundSize = 'cover'; }; })(walls[i]);
        grid.appendChild(img);
    }
    if (profile.wallpaper && profile.wallpaper.indexOf('/uploads/wallpapers/') === 0) {
        var custBg = document.createElement('img');
        custBg.src = API + profile.wallpaper;
        custBg.className = 'selected';
        custBg.onclick = function() { var imgs = grid.getElementsByTagName('img'); for (var j = 0; j < imgs.length; j++) imgs[j].className = ''; this.className = 'selected'; profile.wallpaper = this.src.replace(API, ''); byId('messages').style.backgroundImage = 'url(' + this.src + ')'; byId('messages').style.backgroundSize = 'cover'; };
        grid.appendChild(custBg);
    }
}

function loadDevices() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-devices?token=' + token, true);
    xhr.onreadystatechange = function() {
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
    xhr.onreadystatechange = function() { if (xhr.readyState === 4) loadDevices(); };
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
    xhr.onreadystatechange = function() {
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
    xhr.onreadystatechange = function() {
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

    socket.on('receive_message', function(msg) {
        if (chatWith === msg.from) addMsg(msg);
        // сохраняем локально
        if (msg.from === myEmail) {
            addLocalMessage(msg.to, msg);
        } else {
            addLocalMessage(msg.from, msg);
        }
        loadContacts();
    });

    socket.on('message_sent', function(msg) {
        if (chatWith === msg.to) addMsg(msg);
        addLocalMessage(msg.to, msg);
        loadContacts();
    });

    socket.on('update_message', function(d) {
        updMsg(d.id, d.text, d.edited);
        updateLocalMessage(chatWith, d.id, d.text, d.edited);
    });

    socket.on('remove_message', function(d) {
        delMsgUI(d.id);
        deleteLocalMessage(chatWith, d.id);
    });

    socket.on('user_typing', function(data) {
        if (chatWith === data.from && data.isTyping) {
            byId('chat-title').innerHTML = data.username + ' (' + t('typing') + ')';
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(function() {
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
byId('input').onkeydown = function(e) { if (e.keyCode === 13) { e.preventDefault(); sendMessage(); } };
byId('input').oninput = function() { if (chatWith && socket) socket.emit('typing', { to: chatWith, isTyping: true }); };

byId('input').onfocus = function() {
    if (byId('chat-area').style.display === 'block') {
        byId('main-content').style.paddingBottom = '250px';
        setTimeout(function() { byId('messages').scrollTop = byId('messages').scrollHeight; }, 100);
    }
};
byId('input').onblur = function() { byId('main-content').style.paddingBottom = '0px'; };

connectSocket();
showTab('chats');
