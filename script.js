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
    ru: {
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'оффлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterId: 'Введите 6-значный ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены',
        selfSearch: 'Нельзя искать самого себя', invalidId: 'ID должен состоять из 6 цифр'
    },
    en: {
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterId: 'Enter 6-digit ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved',
        selfSearch: 'You cannot search for yourself', invalidId: 'ID must be 6 digits'
    }
};
function t(k) { return T[lang][k] || k; }

function formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    if (m < 10) m = '0' + m;
    return h + ':' + m;
}

function esc(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
}

// ========== UI сообщений с заглушками для изображений ==========
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
            div.innerHTML += '<img src="' + mediaUrl + '" class="media" style="max-width:200px;max-height:200px;cursor:pointer;" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23cccccc%22 width=%22200%22 height=%22200%22/%3E%3Ctext fill=%22%23555555%22 x=%2220%22 y=%22100%22 font-size=%2220%22%3EОшибка загрузки%3C/text%3E%3C/svg%3E\'">';
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

// ========== API запросы ==========
function loadMessages(to) { /* ... без изменений ... */ }
function loadContacts() { /* ... */ }
function renderContacts() { /* ... */ }
function loadArchive() { /* ... */ }
function archiveChat(em) { /* ... */ }
function unarchiveChat(em) { /* ... */ }

// ===== ТОЛЬКО ПОИСК ПО ID =====
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
                showPanel(null);
            } else if (d.error) {
                alert(d.error);
            } else {
                alert(t('notFound'));
            }
        }
    };
    xhr.send();
}

function openChat(em) { /* ... */ }

// ========== Настройки (без изменений) ==========
function loadSettings() { /* ... */ }
function loadAvatars() { /* ... */ }
function loadWallpapers() { /* ... */ }
function uploadCustomAvatar(input) { /* ... */ }
function uploadCustomWallpaper(input) { /* ... */ }
function loadDevices() { /* ... */ }
function logoutDevice(tok) { /* ... */ }
function saveSettings() { /* ... */ }
function setLang(l) { /* ... */ }
function setTheme(th) { /* ... */ }
function applyTheme(th) { /* ... */ }
function showPanel(name) { /* ... */ }

// ========== Медиа и отправка ==========
function sendMediaMessage(input) { /* ... */ }
function sendMessage() { /* ... */ }
function editMsg(id, text) { /* ... */ }
function delMsg(id) { /* ... */ }

// ========== Сокет ==========
function connectSocket() { /* ... */ }

byId('send-btn').onclick = sendMessage;
byId('input').onkeydown = function(e) { if (e.keyCode === 13) { e.preventDefault(); sendMessage(); } };
byId('input').oninput = function() { if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true }); };

connectSocket();
byId('form-container').style.display = 'none';
byId('messages').style.bottom = '0';
