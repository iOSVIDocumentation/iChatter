// ==============================================
// АВТО-РЕДИРЕКТ ДЛЯ iOS 6 (уже сработал в HTML, но для надёжности)
// ==============================================
function isOldIOS() {
    var ua = navigator.userAgent;
    var match = ua.match(/iPhone OS (\d+)_/);
    return match && parseInt(match[1]) < 10;
}

if (isOldIOS() && window.location.protocol === 'https:') {
    window.location.href = 'http://192.168.1.7:8080' + window.location.pathname + window.location.search;
}

// ==============================================
// НАСТРОЙКА API (новый туннель)
// ==============================================
var API = isOldIOS()
    ? 'http://192.168.1.7:8080'
    : 'https://here-valium-discussion-theory.trycloudflare.com';

// ==============================================
// УТИЛИТЫ
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

// ====== ПЕРЕВОДЫ ======
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
        uploadAvatar: 'Загрузить свой аватар'
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
        uploadAvatar: 'Upload Custom Avatar'
    }
};
function t(k) { return T[lang][k] || k; }

function formatTime(ts) { var d = new Date(ts); var h = d.getHours(); var m = d.getMinutes(); if (m < 10) m = '0' + m; return h + ':' + m; }
function esc(s) { if (!s) return ''; var div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; }

// ====== UI сообщений ======
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
    var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : esc(msg.text);
    var edited = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';

    div.innerHTML = '<div class="sender">' + esc(senderName) + '</div>' +
                    '<div class="text">' + text + edited + '</div>' +
                    '<span class="time">' + timeStr + '</span>';

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

// ====== ПРОФИЛЬ СОБЕСЕДНИКА ======
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
        byId('partner-avatar').src = '';
        byId('partner-profile-overlay').style.display = 'flex';
        return;
    }

    byId('partner-displayname').textContent = partner.displayName || partner.username;
    byId('partner-username').textContent = partner.username || '';
    byId('partner-id').textContent = partner.searchId || '';
    byId('partner-status').textContent = partner.isOnline ? t('online') : t('offline');
    byId('partner-age').textContent = partner.age ? (t('age') + ': ' + partner.age) : '';
    byId('partner-about').textContent = partner.about || '';

    if (partner.avatar && partner.avatar.indexOf('/uploads/avatars/') === 0) {
        byId('partner-avatar').src = API + partner.avatar;
    } else if (partner.avatar) {
        byId('partner-avatar').src = API + '/avatars/' + partner.avatar;
    } else {
        byId('partner-avatar').src = '';
    }
    byId('partner-profile-overlay').style.display = 'flex';
}

function closePartnerProfile() {
    byId('partner-profile-overlay').style.display = 'none';
}

// ====== НАВИГАЦИЯ ======
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
    loadMessages(em);
}

function goBack() {
    showTab('chats');
    byId('chat-title').onclick = null;
}

function updateNavTexts() {
    byId('nav-chats').textContent = t('chats');
    byId('nav-archive').textContent = t('archive');
    byId('nav-settings').textContent = t('settings');
    byId('search-input').placeholder = t('searchPlaceholder');
    byId('input').placeholder = t('msg');
    byId('send-btn').textContent = t('send');
    byId('btn-back').textContent = t('back');
}

// ====== ЗАГРУЗКА ДАННЫХ ======
function loadMessages(to) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/messages?token=' + token + '&chatWith=' + to, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var msgs = data.messages || [];
            for (var i = 0; i < msgs.length; i++) {
                if (!byId('msg-' + msgs[i].id)) addMsg(msgs[i]);
            }
        }
    };
    xhr.send();
}

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
            } else if (d.error) {
                alert(d.error);
            } else {
                alert(t('notFound'));
            }
        }
    };
    xhr.send();
}

// ====== НАСТРОЙКИ ======
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
    for (var i = 1; i <= 10; i++) {
        var img = document.createElement('img');
        img.src = API + '/avatars/av' + i + '.png';
        img.onerror = function() { this.style.display = 'none'; };
        if (profile.avatar === 'av' + i + '.png') img.className = 'selected';
        img.onclick = (function(idx) { return function() { var imgs = grid.getElementsByTagName('img'); for (var j = 0; j < imgs.length; j++) imgs[j].className = ''; this.className = 'selected'; profile.avatar = 'av' + idx + '.png'; }; })(i);
        grid.appendChild(img);
    }
    if (profile.avatar && profile.avatar.indexOf('/uploads/avatars/') === 0) {
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
    var walls = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = API + '/wallpapers/' + walls[i];
        img.onerror = function() { this.style.display = 'none'; };
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function(w) { return function() { var imgs = grid.getElementsByTagName('img'); for (var k = 0; k < imgs.length; k++) imgs[k].className = ''; this.className = 'selected'; profile.wallpaper = w; byId('messages').style.backgroundImage = 'url(' + API + '/wallpapers/' + w + ')'; byId('messages').style.backgroundSize = 'cover'; }; })(walls[i]);
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
        if (xhr.readyState === 4 && xhr.status === 200) {
            alert(t('saved'));
            showTab('settings');
        }
    };
    xhr.send(JSON.stringify({ token: token, displayName: profile.displayName, age: profile.age, about: profile.about, avatar: profile.avatar, theme: newTheme, language: newLang, wallpaper: profile.wallpaper }));
}

function setLang(l) {
    lang = l;
    localStorage.setItem('lang', lang);
    updateNavTexts();
    if (byId('lang-select')) byId('lang-select').value = lang;
}

function setTheme(th) {
    if (th === 'light') {
        document.body.className = 'light-mode';
    } else {
        document.body.className = 'dark-mode';
    }
    if (profile) profile.theme = th;
    if (byId('theme-select')) byId('theme-select').value = th;
}

// ====== ЗАГРУЗКА СВОЕЙ АВАТАРКИ (с поддержкой iOS 6) ======
function uploadCustomAvatar(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];

    if (isOldIOS()) {
        var iframe = document.createElement('iframe');
        iframe.name = 'avatar-iframe-' + Date.now();
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = API + '/api/upload-avatar?token=' + token;
        form.enctype = 'multipart/form-data';
        form.target = iframe.name;
        form.style.display = 'none';
        var clone = input.cloneNode(true);
        clone.name = 'avatar';
        form.appendChild(clone);
        document.body.appendChild(form);
        form.submit();
        iframe.onload = function() {
            try {
                var response = JSON.parse(iframe.contentDocument.body.textContent || iframe.contentWindow.document.body.textContent);
                if (response.success) {
                    alert('Аватар обновлён!');
                    profile.avatar = response.url;
                    loadAvatars();
                }
            } catch(e) {}
            document.body.removeChild(iframe);
            document.body.removeChild(form);
            input.value = '';
        };
    } else {
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
}

// ====== ОТПРАВКА СООБЩЕНИЙ ======
function sendMessage() {
    var input = byId('input');
    var text = input.value.trim();
    if (!text || !chatWith || !socket) return;
    if (editingId) {
        socket.emit('edit_message', { id: editingId, newText: text });
        editingId = null;
    } else {
        socket.emit('send_message', { to: chatWith, text: text });
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

connectSocket();
showTab('chats');
