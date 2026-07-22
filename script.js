// ==============================================
// E2EE – End‑to‑End Encryption (RSA‑OAEP)
// ==============================================
var KEY_STORAGE_KEY = 'ichatter_private_key';  // ключ для localStorage

// Генерация ключевой пары (если ещё нет)
async function ensureKeyPair() {
    // Пробуем загрузить сохранённый приватный ключ
    var storedKey = localStorage.getItem(KEY_STORAGE_KEY);
    if (storedKey) {
        try {
            var privateKey = await importPrivateKey(storedKey);
            // Если всё хорошо – возвращаем пару (публичный ключ извлечём из приватного)
            var publicKey = await exportPublicKey(privateKey);
            return { privateKey: privateKey, publicKey: publicKey };
        } catch (e) {
            // Ключ повреждён – удаляем и сгенерируем заново
            localStorage.removeItem(KEY_STORAGE_KEY);
        }
    }

    // Генерируем новую пару
    var keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),  // 65537
            hash: "SHA-256",
        },
        true,  // ключи экспортируемые
        ["encrypt", "decrypt"]
    );

    // Экспортируем приватный ключ в формат для сохранения
    var exportedPrivate = await window.crypto.subtle.exportKey(
        "jwk",
        keyPair.privateKey
    );
    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(exportedPrivate));

    // Публичный ключ тоже экспортируем для передачи на сервер
    var publicKey = await exportPublicKey(keyPair.privateKey);
    return { privateKey: keyPair.privateKey, publicKey: publicKey };
}

// Экспорт публичного ключа в Base64 (SPKI формат)
async function exportPublicKey(privateKey) {
    // Чтобы получить публичный ключ из CryptoKeyPair, мы можем экспортировать его отдельно.
    // Но у нас уже есть privateKey, а нам нужен publicKey. Проще сохранять пару целиком.
    // Поэтому мы будем хранить не только приватный, но и публичный ключ вместе.
    // Немного перепишем ensureKeyPair, чтобы сохранять оба ключа.
    return await _exportPublicKeyFromPrivate(privateKey);
}

// Вспомогательная функция: извлечь публичный ключ из CryptoKeyPair
async function _exportPublicKeyFromPrivate(privateKey) {
    // Нам нужен публичный ключ – придётся его получить через экспорт приватного?
    // Нет, у нас нет публичного ключа отдельно. Мы должны были сохранить пару.
    // Исправим ensureKeyPair, чтобы сохранять оба ключа.
    // (ниже исправленная версия)
    return null; // временно
}

// Исправленная ensureKeyPair, которая сохраняет и приватный, и публичный ключ
async function ensureKeyPair() {
    var storedData = localStorage.getItem(KEY_STORAGE_KEY);
    if (storedData) {
        try {
            var keys = JSON.parse(storedData);
            var privateKey = await importPrivateKey(keys.privateJwk);
            var publicKey = await importPublicKey(keys.publicJwk);
            return { privateKey: privateKey, publicKey: publicKey };
        } catch (e) {
            localStorage.removeItem(KEY_STORAGE_KEY);
        }
    }

    var keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    var privateJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    var publicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);

    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({
        privateJwk: privateJwk,
        publicJwk: publicJwk
    }));

    return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
}

// Импорт приватного ключа
async function importPrivateKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
    );
}

// Импорт публичного ключа
async function importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

// Экспорт публичного ключа в Base64 (SPKI) – для отправки на сервер
async function exportPublicKeyToBase64(publicKey) {
    var exported = await window.crypto.subtle.exportKey("spki", publicKey);
    var bytes = new Uint8Array(exported);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Импорт публичного ключа собеседника из Base64 (SPKI)
async function importPublicKeyFromBase64(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return await window.crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

// Шифрование текста публичным ключом собеседника
async function encryptMessage(publicKey, plainText) {
    var encoded = new TextEncoder().encode(plainText);
    var encrypted = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        encoded
    );
    var bytes = new Uint8Array(encrypted);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Расшифровка сообщения своим приватным ключом
async function decryptMessage(privateKey, encryptedBase64) {
    var binary = atob(encryptedBase64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    var decrypted = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        bytes.buffer
    );
    return new TextDecoder().decode(decrypted);
}

// ==============================================
// НАСТРОЙКА URL (без изменений)
// ==============================================
var API = 'https://ichatterios6.iosvidocum.workers.dev';
var STATIC_URL = 'https://ichatterios6.iosvidocum.workers.dev'; // обои с GitHub

// ==============================================
// УТИЛИТЫ (без изменений)
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

// ====== ПЕРЕВОДЫ (без изменений) ======
var T = { /* ... весь объект T, как в прошлом ответе ... */ };
function t(k) { return T[lang][k] || k; }

function formatTime(ts) { var d = new Date(ts); var h = d.getHours(); var m = d.getMinutes(); if (m < 10) m = '0' + m; return h + ':' + m; }
function esc(s) { if (!s) return ''; var div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; }

// ====== ПУСТАЯ АВАТАРКА (без изменений) ======
var emptyAvatarPNG = (function() { /* ... */ })();

// ====== UI сообщений (теперь с асинхронной расшифровкой) ======
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

    // Расшифровываем текст, если он зашифрован
    var textPromise = Promise.resolve('');
    if (msg.text && msg.text.indexOf('-----BEGIN') === -1) { // признак зашифрованного сообщения (Base64)
        textPromise = decryptMessage(userKeys.privateKey, msg.text).catch(function(e) {
            return '[Ошибка расшифровки]';
        });
    } else {
        textPromise = Promise.resolve(msg.text);
    }

    textPromise.then(function(plainText) {
        var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : esc(plainText);
        var edited = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';

        div.innerHTML = '<div class="sender">' + esc(senderName) + '</div>' +
                        '<div class="text">' + text + edited + '</div>' +
                        '<span class="time">' + timeStr + '</span>';

        if (msg.from === myEmail && !msg.deleted) {
            div.innerHTML += '<div class="actions"><button class="edit-btn" onclick="editMsg(\'' + msg.id + '\',\'' + esc(plainText).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="delMsg(\'' + msg.id + '\')">✕</button></div>';
        }
    });
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updMsg(id, text, edited) { /* ... без изменений ... */ }
function delMsgUI(id) { /* ... */ }

// ====== ПРОФИЛЬ СОБЕСЕДНИКА (без изменений) ======
function showPartnerProfile() { /* ... */ }
function closePartnerProfile() { /* ... */ }

// ====== НАВИГАЦИЯ (без изменений) ======
function showTab(tab) { /* ... */ }
function openChat(em) { /* ... */ }
function goBack() { /* ... */ }
function updateNavTexts() { /* ... */ }

// ====== ЗАГРУЗКА ДАННЫХ (API) – без изменений ======
function loadMessages(to) { /* ... */ }
function loadContacts() { /* ... */ }
function renderContacts() { /* ... */ }
function loadArchive() { /* ... */ }
function archiveChat(em) { /* ... */ }
function unarchiveChat(em) { /* ... */ }
function findUser() { /* ... */ }

// ====== НАСТРОЙКИ (без изменений) ======
function loadSettings() { /* ... */ }
function loadAvatars() { /* ... */ }
function loadWallpapers() { /* ... */ }
function loadDevices() { /* ... */ }
function logoutDevice(tok) { /* ... */ }
function saveSettings() { /* ... */ }
function setLang(l) { /* ... */ }
function setTheme(th) { /* ... */ }

// ====== ЗАГРУЗКА СВОЕЙ АВАТАРКИ (современный способ) ======
function uploadCustomAvatar(input) { /* ... */ }

// ====== ОТПРАВКА СООБЩЕНИЙ (с шифрованием) ======
async function sendMessage() {
    var input = byId('input');
    var text = input.value.trim();
    if (!text || !chatWith || !socket) return;

    // Получаем публичный ключ собеседника
    var partnerPublicKey = null;
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === chatWith) {
            if (contacts[i].publicKey) {
                partnerPublicKey = await importPublicKeyFromBase64(contacts[i].publicKey);
            }
            break;
        }
    }

    if (!partnerPublicKey) {
        alert('Невозможно отправить сообщение: отсутствует публичный ключ собеседника.');
        return;
    }

    // Шифруем
    var encrypted = await encryptMessage(partnerPublicKey, text);

    if (editingId) {
        socket.emit('edit_message', { id: editingId, newText: encrypted });
        editingId = null;
    } else {
        socket.emit('send_message', { to: chatWith, text: encrypted });
    }
    input.value = '';
}

function editMsg(id, text) { editingId = id; byId('input').value = text; byId('input').focus(); }
function delMsg(id) { if (confirm('Удалить сообщение?')) socket.emit('delete_message', { id: id }); }

// ====== СОКЕТ ======
function connectSocket() {
    socket = io(API, { query: { token: token } });

    socket.on('receive_message', function(msg) {
        if (chatWith === msg.from) addMsg(msg);
        loadContacts();
    });

    socket.on('message_sent', function(msg) {
        if (chatWith === msg.to) addMsg(msg);
        loadContacts();
    });

    socket.on('update_message', function(d) { updMsg(d.id, d.text, d.edited); });
    socket.on('remove_message', function(d) { delMsgUI(d.id); });
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

// ====== ИНИЦИАЛИЗАЦИЯ КЛЮЧЕЙ И ОТПРАВКА ПУБЛИЧНОГО КЛЮЧА ======
var userKeys = null;  // будет { privateKey, publicKey }

(async function initEncryption() {
    userKeys = await ensureKeyPair();
    // Отправляем публичный ключ на сервер (если ещё не отправлен)
    var publicKeyBase64 = await exportPublicKeyToBase64(userKeys.publicKey);
    // Проверяем, сохранён ли публичный ключ на сервере
    // Для простоты будем отправлять при каждой загрузке (можно оптимизировать)
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/update-public-key', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ token: token, publicKey: publicKeyBase64 }));
})();

// ====== ФИКС КЛАВИАТУРЫ (без изменений) ======
byId('input').onfocus = function() {
    if (byId('chat-area').style.display === 'block') {
        byId('main-content').style.paddingBottom = '250px';
        setTimeout(function() { byId('messages').scrollTop = byId('messages').scrollHeight; }, 100);
    }
};
byId('input').onblur = function() {
    byId('main-content').style.paddingBottom = '0px';
};

connectSocket();
showTab('chats');
