var API = 'https://moss-perspective-stands-copying.trycloudflare.com';
var token = localStorage.getItem('token');
var myEmail = localStorage.getItem('email');
var lang = localStorage.getItem('lang') || 'ru';
var socket = null;
var chatWith = null;
var editingId = null;
var profile = null;
var contacts = [];
var pendingName = null;

var T = {
    ru: {
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'оффлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterNick: 'Введите ник или ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены',
        selfSearch: 'Нельзя искать самого себя',
        showEmailLabel: 'Показывать почту другим'
    },
    en: {
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterNick: 'Enter nickname or ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved',
        selfSearch: 'You cannot search for yourself',
        showEmailLabel: 'Show email to others'
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
    var textDivs = el.getElementsByClassName('text');
    if (textDivs.length > 0) {
        var textDiv = textDivs[0];
        textDiv.innerHTML = esc(text) + (edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '');
    }
}

function delMsgUI(id) {
    var el = byId('msg-' + id);
    if (!el) return;
    var textDivs = el.getElementsByClassName('text');
    if (textDivs.length > 0) {
        textDivs[0].innerHTML = '<i>' + t('deleted') + '</i>';
    }
    var actions = el.getElementsByClassName('actions');
    if (actions.length > 0) {
        actions[0].style.display = 'none';
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
        var displayName = c.displayName || c.username;
        div.innerHTML = '<div class="name">' + esc(displayName) + '</div>' +
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
                var displayName = c.displayName || c.username;
                div.innerHTML = '<div class="name">' + esc(displayName) + '</div>' +
                                '<button class="archive-btn unarchive-btn" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
                div.onclick = (function(email, name) {
                    return function() {
                        pendingName = name;
                        openChat(email);
                    };
                })(c.email, displayName);
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
        if (xhr.readyState === 4 && xhr.status === 200) loadContacts();
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
    var query = byId('search-input').value.trim();
    if (!query) { alert(t('enterNick')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/find-user?token=' + token + '&username=' + encodeURIComponent(query), true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var d = JSON.parse(xhr.responseText);
            if (d.found) {
                if (d.user.email === myEmail) {
                    alert(t('selfSearch'));
                    return;
                }
                pendingName = d.user.displayName || d.user.username;
                openChat(d.user.email);
                showPanel(null);
            } else {
                alert(t('notFound'));
            }
        }
    };
    xhr.send();
}

function openChat(em) {
    chatWith = em;
    byId('form-container').style.display = 'block';
    byId('messages').style.bottom = '50px';

    var name = pendingName;
    if (!name) {
        for (var i = 0; i < contacts.length; i++) {
            if (contacts[i].email === em) {
                name = contacts[i].displayName || contacts[i].username;
                break;
            }
        }
    }
    if (!name) name = em.split('@')[0];
    pendingName = null;

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
            byId('set-username').value = profile.username || '';
            byId('set-displayname').value = profile.displayName || '';
            byId('set-age').value = profile.age || '';
            byId('set-about').value = profile.about || '';
            byId('lang-select').value = profile.language || 'ru';
            byId('theme-select').value = profile.theme || 'dark';
            byId('my-id-display').innerHTML = profile.searchId || '';
            byId('show-email-check').checked = !!profile.showEmail;
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
                var imgs = grid.getElementsByTagName('img');
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
                var imgs = grid.getElementsByTagName('img');
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
    profile.displayName = byId('set-displayname').value;
    profile.age = parseInt(byId('set-age').value) || 0;
    profile.about = byId('set-about').value;
    profile.language = byId('lang-select').value;
    profile.theme = byId('theme-select').value;
    profile.showEmail = byId('show-email-check').checked;
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
        displayName: profile.displayName,
        age: profile.age,
        about: profile.about,
        avatar: profile.avatar,
        theme: profile.theme,
        language: profile.language,
        wallpaper: profile.wallpaper,
        showEmail: profile.showEmail
    }));
}

function setLang(l) { lang = l; profile.language = l; }
function setTheme(th) { profile.theme = th; applyTheme(th); }

function applyTheme(th) {
    if (th === 'dark') {
        document.body.className = 'dark-mode';
    } else {
        document.body.className = '';
    }
    if (byId('theme-select')) {
        byId('theme-select').value = th;
    }
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
                    var name = chatWith.split('@')[0];
                    for (var i = 0; i < contacts.length; i++) {
                        if (contacts[i].email === chatWith) {
                            name = contacts[i].displayName || contacts[i].username;
                            break;
                        }
                    }
                    title.innerHTML = name;
                }
            }, 2000);
        }
    });
}

byId('send-btn').onclick = sendMessage;
byId('input').onkeydown = function(e) {
    if (e.keyCode === 13) {
        e.preventDefault();
        sendMessage();
    }
};

byId('input').oninput = function() {
    if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true });
};

connectSocket();
byId('form-container').style.display = 'none';
byId('messages').style.bottom = '0';
