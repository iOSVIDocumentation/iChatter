var BACKEND_URL = 'https://moss-perspective-stands-copying.trycloudflare.com';
var token = localStorage.getItem('ichatter_token');
var myEmail = localStorage.getItem('ichatter_email');
var currentLang = localStorage.getItem('ichatter_lang') || 'ru';
var socket = null;
var currentChat = null;
var contacts = [];
var myProfile = null;
var editingMessageId = null;

var texts = {
    ru: {
        selectContact: 'Выберите контакт', noContacts: 'Нет контактов', online: 'онлайн', offline: 'оффлайн',
        typing: 'печатает...', archive: 'Архивные чаты', settings: 'Настройки', searchId: 'ID пользователя',
        find: 'Найти', notFound: 'Пользователь не найден', edit: 'Ред.', delete: 'Удал.',
        edited: 'ред.', deleted: 'Сообщение удалено', save: 'Сохранить', message: 'Сообщение...',
        send: 'Отпр.', enterCode: 'Введите ID', selectContactFirst: 'Выберите контакт'
    },
    en: {
        selectContact: 'Select contact', noContacts: 'No contacts', online: 'online', offline: 'offline',
        typing: 'typing...', archive: 'Archived chats', settings: 'Settings', searchId: 'User ID',
        find: 'Find', notFound: 'User not found', edit: 'Edit', delete: 'Del',
        edited: 'edited', deleted: 'Message deleted', save: 'Save', message: 'Message...',
        send: 'Send', enterCode: 'Enter ID', selectContactFirst: 'Select contact first'
    }
};

function t(key) { return texts[currentLang][key] || key; }

if (!token || !myEmail) { window.location.href = 'login.html'; }

// ============ ФОРМАТИРОВАНИЕ ============
function formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    if (m < 10) m = '0' + m;
    return h + ':' + m;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ============ UI ============
function addMessageToUI(msg) {
    var msgList = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg';
    if (msg.from === myEmail) div.className += ' my';
    if (msg.deleted) div.className += ' deleted';
    div.id = 'msg-' + msg.id;

    var senderName = msg.fromUsername || msg.from.split('@')[0];
    var timeStr = formatTime(msg.timestamp);
    var text = msg.deleted ? '<i>' + t('deleted') + '</i>' : escapeHtml(msg.text);
    var edited = msg.edited ? ' <span class="edited">(' + t('edited') + ')</span>' : '';

    div.innerHTML = '<div class="sender">' + escapeHtml(senderName) + '<span class="time">' + timeStr + '</span></div>' +
                    '<div class="text">' + text + edited + '</div>';

    if (msg.from === myEmail && !msg.deleted) {
        div.innerHTML += '<div class="actions">' +
            '<button class="edit-btn" onclick="startEdit(\'' + msg.id + '\', \'' + escapeHtml(msg.text).replace(/'/g, "\\'") + '\')">' + t('edit') + '</button>' +
            '<button class="del-btn" onclick="deleteMsg(\'' + msg.id + '\')">' + t('delete') + '</button>' +
            '</div>';
    }

    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
}

function updateMessageUI(id, text, edited) {
    var el = document.getElementById('msg-' + id);
    if (el) {
        var textDiv = el.querySelector('.text');
        if (textDiv) {
            textDiv.innerHTML = escapeHtml(text) + (edited ? ' <span class="edited">(' + t('edited') + ')</span>' : '');
        }
    }
}

function removeMessageUI(id) {
    var el = document.getElementById('msg-' + id);
    if (el) {
        el.className += ' deleted';
        var textDiv = el.querySelector('.text');
        if (textDiv) textDiv.innerHTML = '<i>' + t('deleted') + '</i>';
        var actions = el.querySelector('.actions');
        if (actions) actions.style.display = 'none';
    }
}

// ============ СООБЩЕНИЯ ============
function loadMessages(chatWith) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/messages?token=' + token + '&chatWith=' + chatWith, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            document.getElementById('messages').innerHTML = '';
            if (data.messages) {
                for (var i = 0; i < data.messages.length; i++) {
                    addMessageToUI(data.messages[i]);
                }
            }
        }
    };
    xhr.send();
}

function startEdit(id, text) {
    editingMessageId = id;
    document.getElementById('input').value = text;
    document.getElementById('input').focus();
}

function deleteMsg(id) {
    if (!socket) return;
    socket.emit('delete_message', { id: id });
}

// ============ КОНТАКТЫ ============
function loadContacts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/contacts?token=' + token, true);
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
    var list = document.getElementById('contacts-list');
    list.innerHTML = '';
    if (contacts.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">' + t('noContacts') + '</div>';
        return;
    }
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var div = document.createElement('div');
        div.className = 'contact-item';
        var statusClass = c.isOnline ? 'online' : '';
        div.innerHTML = '<div class="name">' + escapeHtml(c.username) + '</div>' +
                        '<div class="status ' + statusClass + '">' + (c.isOnline ? t('online') : t('offline')) + '</div>' +
                        '<button class="archive-btn" onclick="event.stopPropagation();archiveChat(\'' + c.email + '\')">📦</button>';
        div.onclick = (function(email) { return function() { openChat(email); }; })(c.email);
        list.appendChild(div);
    }
}

function loadArchivedChats() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/archived-chats?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var list = document.getElementById('archive-list');
            list.innerHTML = '';
            if (!data.contacts || data.contacts.length === 0) {
                list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Пусто</div>';
                return;
            }
            for (var i = 0; i < data.contacts.length; i++) {
                var c = data.contacts[i];
                var div = document.createElement('div');
                div.className = 'contact-item';
                div.innerHTML = '<div class="name">' + escapeHtml(c.username) + '</div>' +
                                '<button class="archive-btn" style="background:#27ae60;" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
                div.onclick = (function(email) { return function() { openChat(email); }; })(c.email);
                list.appendChild(div);
            }
        }
    };
    xhr.send();
}

function archiveChat(email) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL + '/api/archive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) { loadContacts(); }
    };
    xhr.send(JSON.stringify({ token: token, email: email }));
}

function unarchiveChat(email) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL + '/api/unarchive-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) { loadArchivedChats(); loadContacts(); }
    };
    xhr.send(JSON.stringify({ token: token, email: email }));
}

function addContact() {
    var searchId = document.getElementById('search-input').value.trim();
    if (!searchId) { alert(t('enterCode')); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/find-user?token=' + token + '&searchId=' + searchId, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            if (data.found) {
                openChat(data.user.email);
                togglePanel('contacts');
            } else {
                alert(t('notFound'));
            }
        }
    };
    xhr.send();
}

function openChat(email) {
    currentChat = email;
    togglePanel(null);
    var name = email.split('@')[0];
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === email) { name = contacts[i].username; break; }
    }
    document.getElementById('chat-title').innerHTML = name;
    loadMessages(email);
}

function togglePanel(panel) {
    document.getElementById('contacts-panel').style.display = 'none';
    document.getElementById('archive-panel').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'none';

    if (panel === 'contacts') {
        document.getElementById('contacts-panel').style.display = 'block';
        loadContacts();
    } else if (panel === 'archive') {
        document.getElementById('archive-panel').style.display = 'block';
        loadArchivedChats();
    } else if (panel === 'settings') {
        document.getElementById('settings-panel').style.display = 'block';
        loadSettings();
    }
}

// ============ НАСТРОЙКИ ============
function loadSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/my-profile?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            myProfile = data.user;
            document.getElementById('settings-username').value = myProfile.username || '';
            document.getElementById('settings-age').value = myProfile.age || '';
            document.getElementById('settings-about').value = myProfile.about || '';
            document.getElementById('settings-lang').value = myProfile.language || 'ru';
            document.getElementById('settings-theme').value = myProfile.theme || 'light';
            document.getElementById('my-search-id').innerHTML = myProfile.searchId;
            applyTheme(myProfile.theme);
            loadAvatars();
            loadWallpapers();
            loadDevices();
        }
    };
    xhr.send();
}

function loadAvatars() {
    var grid = document.getElementById('avatar-grid');
    grid.innerHTML = '';
    for (var i = 1; i <= 10; i++) {
        var img = document.createElement('img');
        img.src = BACKEND_URL + '/avatars/av' + i + '.png';
        img.onerror = function() { this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect fill="%23' + Math.floor(Math.random()*16777215).toString(16) + '" width="50" height="50"/><text fill="white" x="15" y="30" font-size="20">' + i + '</text></svg>'; };
        if (myProfile && myProfile.avatar === 'av' + i + '.png') img.className = 'selected';
        img.onclick = function() {
            var all = grid.querySelectorAll('img');
            for (var j = 0; j < all.length; j++) all[j].className = '';
            this.className = 'selected';
            myProfile.avatar = 'av' + i + '.png';
        };
        grid.appendChild(img);
    }
}

function loadWallpapers() {
    var grid = document.getElementById('wallpaper-grid');
    grid.innerHTML = '';
    var wallpapers = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    var noneImg = document.createElement('img');
    noneImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><rect fill="%23ccc" width="80" height="50"/><text fill="black" x="20" y="30" font-size="12">Нет</text></svg>';
    noneImg.onclick = function() { selectWallpaper(''); };
    if (!myProfile.wallpaper) noneImg.className = 'selected';
    grid.appendChild(noneImg);

    for (var i = 0; i < wallpapers.length; i++) {
        var img = document.createElement('img');
        img.src = BACKEND_URL + '/wallpapers/' + wallpapers[i];
        if (myProfile.wallpaper === wallpapers[i]) img.className = 'selected';
        img.onclick = (function(w) { return function() { selectWallpaper(w); }; })(wallpapers[i]);
        grid.appendChild(img);
    }
}

function selectWallpaper(w) {
    myProfile.wallpaper = w;
    var all = document.getElementById('wallpaper-grid').querySelectorAll('img');
    for (var i = 0; i < all.length; i++) all[i].className = '';
    if (w) {
        document.getElementById('messages').style.backgroundImage = 'url(' + BACKEND_URL + '/wallpapers/' + w + ')';
        document.getElementById('messages').style.backgroundSize = 'cover';
    } else {
        document.getElementById('messages').style.backgroundImage = '';
    }
}

function uploadWallpaper() {
    alert('Загрузка обоев будет доступна позже');
}

function loadDevices() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/my-devices?token=' + token, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            var list = document.getElementById('devices-list');
            list.innerHTML = '';
            for (var i = 0; i < data.devices.length; i++) {
                var d = data.devices[i];
                var div = document.createElement('div');
                div.style.padding = '5px 0';
                div.innerHTML = d.device + ' (' + new Date(d.created).toLocaleString() + ')' +
                    (d.isCurrent ? ' <b>[текущий]</b>' : ' <button onclick="logoutDevice(\'' + d.token + '\')" style="font-size:10px;">Выйти</button>');
                list.appendChild(div);
            }
        }
    };
    xhr.send();
}

function logoutDevice(targetToken) {
    if (!confirm('Выйти с этого устройства?')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL + '/api/logout-device', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) loadDevices();
    };
    xhr.send(JSON.stringify({ token: token, targetToken: targetToken }));
}

function saveSettings() {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL + '/api/update-profile', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            if (data.success) {
                currentLang = myProfile.language;
                localStorage.setItem('ichatter_lang', currentLang);
                applyTheme(myProfile.theme);
                togglePanel(null);
            }
        }
    };
    xhr.send(JSON.stringify({
        token: token,
        username: document.getElementById('settings-username').value,
        age: parseInt(document.getElementById('settings-age').value) || 0,
        about: document.getElementById('settings-about').value,
        avatar: myProfile.avatar,
        theme: document.getElementById('settings-theme').value,
        language: document.getElementById('settings-lang').value,
        wallpaper: myProfile.wallpaper
    }));
}

function changeLanguage(lang) {
    currentLang = lang;
    myProfile.language = lang;
}

function changeTheme(theme) {
    myProfile.theme = theme;
    applyTheme(theme);
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.getElementById('body').className = 'dark';
    } else {
        document.getElementById('body').className = '';
    }
}

// ============ СТАТУСЫ ============
function updateContactStatus(email, status) {
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === email) { contacts[i].isOnline = (status === 'online'); break; }
    }
    if (document.getElementById('contacts-panel').style.display === 'block') renderContacts();
}

// ============ SOCKET ============
function connectSocket() {
    socket = io(BACKEND_URL, { query: { token: token } });
    socket.on('connect', function() { console.log('Socket connected'); });
    socket.on('receive_message', function(msg) {
        if (currentChat === msg.from) addMessageToUI(msg);
        loadContacts();
    });
    socket.on('message_sent', function(msg) {
        if (currentChat === msg.to) addMessageToUI(msg);
    });
    socket.on('update_message', function(data) {
        updateMessageUI(data.id, data.text, data.edited);
    });
    socket.on('remove_message', function(data) {
        removeMessageUI(data.id);
    });
    socket.on('user_status', function(data) {
        updateContactStatus(data.email, data.status);
    });
    socket.on('user_typing', function(data) {
        if (currentChat === data.from) {
            document.getElementById('chat-title').innerHTML = data.username + ' (' + t('typing') + ')';
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(function() {
                var name = data.from.split('@')[0];
                for (var i = 0; i < contacts.length; i++) {
                    if (contacts[i].email === data.from) { name = contacts[i].username; break; }
                }
                document.getElementById('chat-title').innerHTML = name;
            }, 2000);
        }
    });
}

// ============ ОТПРАВКА ============
document.getElementById('form').onsubmit = function(e) {
    e.preventDefault();
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text || !currentChat) {
        if (!currentChat) alert(t('selectContactFirst'));
        return;
    }

    if (editingMessageId) {
        socket.emit('edit_message', { id: editingMessageId, newText: text });
        editingMessageId = null;
    } else {
        socket.emit('send_message', { to: currentChat, text: text });
    }
    input.value = '';
};

var typingTimeout;
document.getElementById('input').oninput = function() {
    if (!currentChat) return;
    socket.emit('typing', { to: currentChat, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() { socket.emit('typing', { to: currentChat, isTyping: false }); }, 1500);
};

// ============ ЗАПУСК ============
connectSocket();
loadContacts();
document.getElementById('settings-lang').value = currentLang;
