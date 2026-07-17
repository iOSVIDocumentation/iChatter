// ====== Определение старой iOS ======
function isOldIOS() {
    var ua = navigator.userAgent;
    var match = ua.match(/iPhone OS (\d+)_/);
    return match && parseInt(match[1]) < 10;
}

var API = 'https://moss-perspective-stands-copying.trycloudflare.com';

// ====== Параметры URL ======
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
var lang = localStorage.getItem('lang') || 'en'; // English default
var socket = null;
var chatWith = null;
var editingId = null;
var profile = null;
var contacts = [];
var pendingName = null;
var firstLoad = true;

if (!token || !myEmail) { window.location.href = 'login.html'; }

function byId(id) { return document.getElementById(id); }

// ====== Локализация ======
var T = {
    ru: {
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'офлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterId: 'Введите 6-значный ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены',
        selfSearch: 'Нельзя искать самого себя', invalidId: 'ID должен состоять из 6 цифр',
        chats: 'Чаты', archive: 'Архив', settings: 'Настройки', back: '← Назад',
        wallpaper: 'Обои чата', nickname: 'Ник (не меняется)', displayName: 'Отображаемое имя',
        age: 'Возраст', about: 'О себе', avatar: 'Аватар', devices: 'Устройства',
        uploadCustom: 'Загрузить свой', uploadAvatar: 'Загрузить аватар', uploadWallpaper: 'Загрузить фон',
        langLabel: 'Язык', themeLabel: 'Тема', dark: 'Тёмная', light: 'Светлая',
        searchPlaceholder: 'Введите ID (6 цифр)'
    },
    en: {
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterId: 'Enter 6-digit ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved',
        selfSearch: 'You cannot search for yourself', invalidId: 'ID must be 6 digits',
        chats: 'Chats', archive: 'Archive', settings: 'Settings', back: '← Back',
        wallpaper: 'Chat Wallpaper', nickname: 'Nickname (unchangeable)', displayName: 'Display Name',
        age: 'Age', about: 'About', avatar: 'Avatar', devices: 'Devices',
        uploadCustom: 'Upload Custom', uploadAvatar: 'Upload Avatar', uploadWallpaper: 'Upload Wallpaper',
        langLabel: 'Language', themeLabel: 'Theme', dark: 'Dark', light: 'Light',
        searchPlaceholder: 'Enter ID (6 digits)'
    }
};
function t(key) { return T[lang][key] || key; }

// ====== Утилиты ======
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

// ====== UI ======
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
            div.innerHTML += '<img src="' + mediaUrl + '" class="media" style="max-width:200px;max-height:200px;cursor:pointer;" onerror="this.style.display=\'none\'">';
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

// ====== Переключение вкладок ======
function showTab(tab) {
    byId('chats-panel').style.display = 'none';
    byId('archive-panel').style.display = 'none';
    byId('settings-panel').style.display = 'none';
    byId('chat-area').style.display = 'none';
    var navs = document.getElementsByClassName('nav-btn');
    for (var i = 0; i < navs.length; i++) navs[i].className = 'nav-btn';
    byId('bottom-nav').style.display = 'flex';
    byId('btn-back').style.display = 'none';

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
    loadMessages(em);
}

function goBack() { showTab('chats'); }

// ====== Загрузка данных ======
function loadMessages(to) { /* без изменений, как раньше */ }
function loadContacts() { /* без изменений */ }
function renderContacts() { /* без изменений, но добавим переводы */ }
function loadArchive() { /* без изменений */ }
function archiveChat(em) { /* без изменений */ }
function unarchiveChat(em) { /* без изменений */ }
function findUser() { /* без изменений */ }

// ====== Настройки ======
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
            byId('lang-select').value = lang;
            byId('theme-select').value = (document.body.className.indexOf('light-mode') !== -1) ? 'light' : 'dark';
            byId('my-id-display').innerHTML = profile.searchId || '';
            loadAvatars();
            loadWallpapers();
            loadDevices();
            updateUILanguage(); // обновить все тексты
        }
    };
    xhr.send();
}

function updateUILanguage() {
    // Обновляем подписи в интерфейсе
    byId('nav-chats').innerHTML = t('chats');
    byId('nav-archive').innerHTML = t('archive');
    byId('nav-settings').innerHTML = t('settings');
    byId('search-input').placeholder = t('searchPlaceholder');
    var labels = {
        'lang-select': t('langLabel'),
        'theme-select': t('themeLabel'),
        'set-displayname': t('displayName'),
        'set-age': t('age'),
        'set-about': t('about'),
        'wallpaper-label': t('wallpaper'),
        'avatar-label': t('avatar'),
        'devices-label': t('devices'),
        'save-btn': t('save')
    };
    // Проходим по элементам и обновляем, если есть атрибут label
    var rows = document.getElementsByClassName('settings-row');
    for (var i = 0; i < rows.length; i++) {
        var label = rows[i].getElementsByTagName('label')[0];
        if (label) {
            var htmlFor = label.getAttribute('for') || '';
            if (htmlFor === 'lang-select') label.textContent = t('langLabel');
            else if (htmlFor === 'theme-select') label.textContent = t('themeLabel');
            else if (htmlFor === 'set-displayname') label.textContent = t('displayName');
            else if (htmlFor === 'set-age') label.textContent = t('age');
            else if (htmlFor === 'set-about') label.textContent = t('about');
            // и т.д.
        }
    }
}

function loadAvatars() { /* без изменений */ }
function loadWallpapers() { /* без изменений */ }
function loadDevices() { /* без изменений */ }
function logoutDevice(tok) { /* без изменений */ }

function saveSettings() {
    profile.displayName = byId('set-displayname').value;
    profile.age = parseInt(byId('set-age').value) || 0;
    profile.about = byId('set-about').value;
    var newLang = byId('lang-select').value;
    var newTheme = byId('theme-select').value;

    lang = newLang;
    localStorage.setItem('lang', lang);
    setTheme(newTheme);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/update-profile', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            alert(t('saved'));
            showTab('settings');
        }
    };
    xhr.send(JSON.stringify({
        token: token,
        displayName: profile.displayName,
        age: profile.age,
        about: profile.about,
        avatar: profile.avatar,
        theme: newTheme,
        language: newLang,
        wallpaper: profile.wallpaper
    }));
}

function setLang(l) {
    lang = l;
    if (profile) profile.language = l;
    updateUILanguage();
    // обновить плейсхолдеры и кнопки
    byId('input').placeholder = t('msg');
    byId('send-btn').innerHTML = t('send');
}

function setTheme(th) {
    if (th === 'light') {
        document.body.className = 'light-mode';
    } else {
        document.body.className = 'dark-mode';
    }
    if (byId('theme-select')) byId('theme-select').value = th;
}

// ====== Отправка сообщений и файлов ======
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
    if (confirm(t('deleted') + '?')) socket.emit('delete_message', { id: id });
}

// Универсальная отправка медиа с поддержкой iOS 6
function sendMediaMessage(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (isOldIOS()) {
        // Старый способ через iframe
        var iframe = byId('upload-iframe');
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = API + '/api/upload-media?token=' + token;
        form.enctype = 'multipart/form-data';
        form.target = 'upload-iframe';
        form.style.display = 'none';

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.name = 'file';
        fileInput.files = input.files; // не работает, нужно клонировать
        // Для старого iOS проще использовать оригинальный input и перенести его в форму
        input.name = 'file';
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        // После отправки нужно удалить форму и обработать ответ
        iframe.onload = function() {
            var response = iframe.contentDocument.body.textContent || iframe.contentWindow.document.body.textContent;
            try {
                var resp = JSON.parse(response);
                if (resp.success && socket && chatWith) {
                    socket.emit('send_message', { to: chatWith, text: '', media: { url: resp.url, type: resp.type } });
                }
            } catch(e) {}
            document.body.removeChild(form);
            input.value = '';
        };
    } else {
        // Современный способ
        var formData = new FormData();
        formData.append('file', file);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API + '/api/upload-media?token=' + token, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var resp = JSON.parse(xhr.responseText);
                    if (resp.success && socket && chatWith) {
                        socket.emit('send_message', { to: chatWith, text: '', media: { url: resp.url, type: resp.type } });
                    }
                } else { alert('Upload error'); }
                input.value = '';
            }
        };
        xhr.send(formData);
    }
}

function uploadCustomAvatar(input) { /* аналогично sendMediaMessage, но URL /api/upload-avatar */ }
function uploadCustomWallpaper(input) { /* аналогично */ }

// ====== Сокет ======
function connectSocket() {
    socket = io(API, { query: { token: token } });
    socket.on('receive_message', function(msg) { if (chatWith === msg.from) addMsg(msg); loadContacts(); });
    socket.on('message_sent', function(msg) { if (chatWith === msg.to) addMsg(msg); });
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
byId('input').oninput = function() { if (chatWith) socket.emit('typing', { to: chatWith, isTyping: true }); };

connectSocket();
showTab('chats');
