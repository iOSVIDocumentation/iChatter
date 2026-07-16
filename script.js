// Все переменные через var, функции через function
var API = 'https://moss-perspective-stands-copying.trycloudflare.com';
var token = localStorage.getItem('token');
var myEmail = localStorage.getItem('email');
var lang = localStorage.getItem('lang') || 'ru';
var socket = null;
var chatWith = null;
var editingId = null;
var profile = null;
var contacts = [];

var T = {
    ru: {
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'оффлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterId: 'Введите ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены'
    },
    en: {
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterId: 'Enter ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved'
    }
};
function t(k) { return T[lang][k] || k; }

if (!token || !myEmail) { window.location.href = 'login.html'; }

function byId(id) { return document.getElementById(id); }

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

// ========== UI сообщений ==========
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

    div.innerHTML = '<div class="sender">' + esc(senderName) + '</div>' +
                    '<div class="text">' + text + edited + '</div>' +
                    '<span class="time">' + timeStr + '</span>';

    if (msg.from === myEmail && !msg.deleted) {
        // Добавляем кнопки действий только для своих сообщений
        div.innerHTML += '<div class="actions">' +
            '<button class="edit-btn" onclick="editMsg(\'' + msg.id + '\',\'' + esc(msg.text).replace(/'/g, "\\'") + '\')">✎</button>' +
            '<button class="del-btn" onclick="delMsg(\'' + msg.id + '\')">✕</button>' +
            '</div>';
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updMsg(id, text, edited) {
    var el = byId('msg-' + id);
    if (!el) return;
    // Обновляем только текст и метку редактирования
    var textDiv = el.querySelector('.text');
    if (textDiv) {
        textDiv.innerHTML = esc(text) + (edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '');
    }
}

function delMsgUI(id) {
    var el = byId('msg-' + id);
    if (!el) return;
    var textDiv = el.querySelector('.text');
    if (textDiv) {
        textDiv.innerHTML = '<i>' + t('deleted') + '</i>';
    }
    var actions = el.querySelector('.actions');
    if (actions) {
        actions.style.display = 'none';
    }
}

// ========== API запросы ==========
function loadMessages(to) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/messages?token=' + token + '&chatWith=' + to, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            byId('messages').innerHTML = '';
            var msgs = data.messages || [];
            for (var i = 0; i < msgs.length; i++) {
                addMsg(msgs[i]);
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
            var data = JSON.parse(xhr.responseText);
            contacts = data.contacts || [];
            renderContacts();
        }
    };
    xhr.send();
}

function renderContacts() {
    var list = byId('chats-list');
    list.innerHTML = '';
    if (contacts.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">' + t('noContacts') + '</div>';
        return;
    }
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var div = document.createElement('div');
        div.className = 'chat-item';
        var statusClass = c.isOnline ? 'online' : '';
        div.innerHTML = '<div class="name">' + esc(c.username) + '</div>' +
                        '<div class="status ' + statusClass + '">' + (c.isOnline ? t('online') : t('offline')) + '</div>' +
                        '<button class="archive-btn" onclick="event.stopPropagation();archiveChat(\'' + c.email + '\')">📦</button>';
        div.onclick = (function(email) {
            return function() { openChat(email); };
        })(c.email);
        list.appendChild(div);
    }
}

function loadArchive() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/archived-chats?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var archived = data.contacts || [];
            var list = byId('archive-list');
            list.innerHTML = '';
            if (archived.length === 0) {
                list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">' + t('empty') + '</div>';
                return;
            }
            for (var i = 0; i < archived.length; i++) {
                var c = archived[i];
                var div = document.createElement('div');
                div.className = 'chat-item';
                div.innerHTML = '<div class="name">' + esc(c.username) + '</div>' +
                                '<button class="archive-btn unarchive-btn" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
                div.onclick = (function(email) {
                    return function() { openChat(email); };
                })(c.email);
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
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            loadContacts();
        }
    };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function unarchiveChat(em) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/unarchive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            loadArchive();
            loadContacts();
        }
    };
    xhr.send(JSON.stringify({ token: token, email: em }));
}

function findUser() {
    var id = byId('search-input').value.trim();
    if (!id) { alert(t('enterId')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/find-user?token=' + token + '&searchId=' + id, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var d = JSON.parse(xhr.responseText);
            if (d.found) {
                openChat(d.user.email);
                showPanel(null);
            } else {
                alert(t('notFound'));
            }
        }
    };
    xhr.send();
}

// ========== Открытие чата ==========
function openChat(em) {
    chatWith = em;
    // Показываем форму ввода
    byId('form-container').style.display = 'block';
    byId('messages').style.bottom = '50px';

    var name = em.split('@')[0];
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === em) { name = contacts[i].username; break; }
    }
    byId('chat-title').innerHTML = name;
    showPanel(null);
    loadMessages(em);
}

// ========== Настройки ==========
function loadSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-profile?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            profile = JSON.parse(xhr.responseText).user;
            byId('set-name').value = profile.username || '';
            byId('set-age').value = profile.age || '';
            byId('set-about').value = profile.about || '';
            byId('lang-select').value = profile.language || 'ru';
            byId('theme-select').value = profile.theme || 'light';
            byId('my-id').innerHTML = profile.searchId;
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
    for (var i = 1; i <= 10; i++) {
        var img = document.createElement('img');
        img.src = API + '/avatars/av' + i + '.png';
        img.onerror = function() {
            this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect fill="%230088cc" width="44" height="44"/><text fill="white" x="8" y="28" font-size="20">' + i + '</text></svg>';
        };
        if (profile.avatar === 'av' + i + '.png') img.className = 'selected';
        img.onclick = (function(index) {
            return function() {
                var imgs = grid.querySelectorAll('img');
                for (var j = 0; j < imgs.length; j++) imgs[j].className = '';
                this.className = 'selected';
                profile.avatar = 'av' + index + '.png';
            };
        })(i);
        grid.appendChild(img);
    }
}

function loadWallpapers() {
    var grid = byId('wallpaper-grid');
    grid.innerHTML = '';
    var walls = ['bg1.jpg', 'bg2.jpg', 'bg3.jpg', 'bg4.jpg', 'bg5.jpg', 'bg6.jpg', 'bg7.jpg', 'bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = API + '/wallpapers/' + walls[i];
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function(w) {
            return function() {
                var imgs = grid.querySelectorAll('img');
                for (var k = 0; k < imgs.length; k++) imgs[k].className = '';
                this.className = 'selected';
                profile.wallpaper = w;
                byId('messages').style.backgroundImage = 'url(' + API + '/wallpapers/' + w + ')';
                byId('messages').style.backgroundSize = 'cover';
            };
        })(walls[i]);
        grid.appendChild(img);
    }
}

function loadDevices() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/my-devices?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText).devices || [];
            var list = byId('devices-list');
            list.innerHTML = '';
            for (var i = 0; i < data.length; i++) {
                var d = data[i];
                var div = document.createElement('div');
                div.style.padding = '6px 0';
                div.style.fontSize = '13px';
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
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) loadDevices();
    };
    xhr.send(JSON.stringify({ token: token, targetToken: tok }));
}

function saveSettings() {
    profile.username = byId('set-name').value;
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
        if (xhr.readyState === 4 && xhr.status === 200) {
            alert(t('saved'));
            showPanel(null);
        }
    };
    xhr.send(JSON.stringify({
        token: token,
        username: profile.username,
        age: profile.age,
        about: profile.about,
        avatar: profile.avatar,
        theme: profile.theme,
        language: profile.language,
        wallpaper: profile.wallpaper
    }));
}

function setLang(l) { lang = l; profile.language = l; }
function setTheme(th) { profile.theme = th; applyTheme(th); }
function applyTheme(th) {
    document.body.style.background = th === 'dark' ? '#1a1a2e' : '#E2E7ED';
    document.body.style.color = th === 'dark' ? '#fff' : '#222';
}

// ========== Панели ==========
function showPanel(name) {
    byId('chats-panel').style.display = 'none';
    byId('archive-panel').style.display = 'none';
    byId('settings-panel').style.display = 'none';

    if (name === 'chats') {
        byId('chats-panel').style.display = 'block';
        loadContacts();
    } else if (name === 'archive') {
        byId('archive-panel').style.display = 'block';
        loadArchive();
    } else if (name === 'settings') {
        byId('settings-panel').style.display = 'block';
        loadSettings();
    }
}

// ========== Отправка сообщений ==========
function sendMessage() {
    var input = byId('input');
    var text = input.value.trim();
    if (!text || !chatWith) return;

    if (editingId) {
        socket.emit('edit_message', { id: editingId, newText: text });
        editingId = null;
    } else {
        socket.emit('send_message', { to: chatWith, text: text });
    }
    input.value = '';
}

function editMsg(id, text) {
    editingId = id;
    byId('input').value = text;
    byId('input').focus();
}

function delMsg(id) {
    if (!confirm('Удалить сообщение?')) return;
    socket.emit('delete_message', { id: id });
}

// ========== Сокет ==========
function connectSocket() {
    socket = io(API, { query: { token: token } });

    socket.on('connect', function() { /* connected */ });

    socket.on('receive_message', function(msg) {
        if (chatWith === msg.from) addMsg(msg);
        loadContacts();
    });

    socket.on('message_sent', function(msg) {
        if (chatWith === msg.to) addMsg(msg);
    });

    socket.on('update_message', function(d) {
        updMsg(d.id, d.text, d.edited);
    });

    socket.on('remove_message', function(d) {
        delMsgUI(d.id);
    });

    socket.on('user_typing', function(data) {
        if (chatWith === data.from && data.isTyping) {
            var title = byId('chat-title');
            title.innerHTML = data.username + ' (' + t('typing') + ')';
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(function() {
                if (chatWith === data.from) {
                    var name = data.from.split('@')[0];
                    for (var i = 0; i < contacts.length; i++) {
                        if (contacts[i].email === data.from) { name = contacts[i].username; break; }
                    }
                    title.innerHTML = name;
                }
            }, 2000);
        }
    });
}

// ========== Кнопка отправки ==========
byId('send-btn').onclick = sendMessage;
byId('input').onkeydown = function(e) {
    if (e.keyCode === 13) { // Enter
        e.preventDefault();
        sendMessage();
    }
};

// Индикатор печати
byId('input').oninput = function() {
    if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true });
};

// ========== Инициализация ==========
connectSocket();
// По умолчанию чат не выбран, форма скрыта
byId('form-container').style.display = 'none';
byId('messages').style.bottom = '0';
