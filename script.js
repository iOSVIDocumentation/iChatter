var BASE = window.location.protocol + '//' + window.location.host;
var API = BASE;
var STATIC_URL = BASE;

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

        if (i + 1 >= bytes.length) {
            enc3 = 64; enc4 = 64;
        } else if (i + 2 >= bytes.length) {
            enc4 = 64;
        }

        result += base64chars.charAt(enc1) + base64chars.charAt(enc2) +
            (enc3 === 64 ? '=' : base64chars.charAt(enc3)) +
            (enc4 === 64 ? '=' : base64chars.charAt(enc4));
    }
    return result;
}

function fromBase64(str) {
    var bytes = [];
    var i = 0;
    str = (str || '').replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < str.length) {
        var c1 = str.charAt(i++);
        var c2 = str.charAt(i++);
        var c3 = str.charAt(i++);
        var c4 = str.charAt(i++);

        var enc1 = base64chars.indexOf(c1);
        var enc2 = base64chars.indexOf(c2);
        var enc3 = (c3 === '=' || c3 === '') ? 64 : base64chars.indexOf(c3);
        var enc4 = (c4 === '=' || c4 === '') ? 64 : base64chars.indexOf(c4);

        if (enc1 === -1 || enc2 === -1) break;

        var b1 = (enc1 << 2) | (enc2 >> 4);
        var b2 = ((enc2 & 15) << 4) | (enc3 === 64 ? 0 : (enc3 >> 2));
        var b3 = ((enc3 & 3) << 6) | (enc4 === 64 ? 0 : enc4);

        bytes.push(b1);
        if (enc3 !== 64) bytes.push(b2);
        if (enc4 !== 64) bytes.push(b3);
    }
    return bytes;
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
        if (code < 128) str += String.fromCharCode(code);
        else if (code >= 192 && code < 224) {
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

function encryptLocal(text, key) {
    var textBytes = stringToBytes(text);
    var encrypted = [];
    for (var i = 0; i < textBytes.length; i++) {
        encrypted.push(textBytes[i] ^ key.charCodeAt(i % key.length));
    }
    return toBase64(encrypted);
}

function decryptLocal(encBase64, key) {
    var encrypted = fromBase64(encBase64);
    var decrypted = [];
    for (var i = 0; i < encrypted.length; i++) {
        decrypted.push(encrypted[i] ^ key.charCodeAt(i % key.length));
    }
    return bytesToString(decrypted);
}

function getChatKey(email1, email2) {
    var a = (email1 || '').toLowerCase().trim();
    var b = (email2 || '').toLowerCase().trim();
    if (a > b) { var tmp = a; a = b; b = tmp; }
    return a + '|' + b;
}

function encryptMsg(text, partnerEmail) {
    if (!text) return text;
    if (partnerEmail && partnerEmail.indexOf('group_') === 0) return text;
    var key = getChatKey(myEmail, partnerEmail);
    return 'ENC:' + encryptLocal(text, key);
}

function decryptMsg(text, partnerEmail) {
    if (!text) return '';
    if (text.indexOf('ENC:') === 0) {
        var key = getChatKey(myEmail, partnerEmail);
        try { return decryptLocal(text.substring(4), key); }
        catch (e) { return text; }
    }
    return text;
}

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
var isGroupChat = false;
var editingId = null;
var profile = null;
var contacts = [];
var groups = [];
var pendingName = null;
var loadedMessageIds = {};

if (!token || !myEmail) { window.location.href = 'login.html'; }

function byId(id) { return document.getElementById(id); }

function api(method, url, data, callback, isFormData) {
    var separator = url.indexOf('?') !== -1 ? '&' : '?';
    var fullUrl = API + url;
    if (token) {
        if (method === 'GET' || isFormData) {
            fullUrl += separator + 'token=' + encodeURIComponent(token);
        } else if (method === 'POST' && data && typeof data === 'object') {
            data.token = token;
        }
    }
    var xhr = new XMLHttpRequest();
    xhr.open(method, fullUrl, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    if (!isFormData) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('email');
                window.location.href = 'login.html';
                return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                var resp = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                callback(null, resp);
            } else {
                callback(new Error('HTTP ' + xhr.status));
            }
        }
    };
    xhr.onerror = function () { callback(new Error('Network error')); };
    if (data) {
        xhr.send(isFormData ? data : JSON.stringify(data));
    } else {
        xhr.send();
    }
}

var T = {
    ru: {
        chats: 'Сообщения', archive: 'Архив', settings: 'Настройки', back: '◀ Назад',
        select: 'Выберите контакт', noContacts: 'Нет чатов', online: 'онлайн', offline: 'офлайн',
        typing: 'печатает...', empty: 'Пусто', notFound: 'Пользователь не найден',
        enterId: 'Введите 6-значный ID', msg: 'Сообщение...', send: 'Отпр.', edited: 'ред.',
        deleted: 'Сообщение удалено', save: 'Сохранить', saved: 'Настройки сохранены',
        selfSearch: 'Нельзя искать самого себя', invalidId: 'ID должен состоять из 6 цифр',
        langLabel: 'Язык', themeLabel: 'Тема оформления', wallpaper: 'Обои чата',
        nickname: 'Ник (не меняется)', displayName: 'Отображаемое имя',
        age: 'Возраст', about: 'О себе', avatar: 'Аватар', myId: 'Мой ID', notSpecified: 'не указан',
        devices: 'Устройства', searchPlaceholder: 'Введите ID (6 цифр)',
        uploadAvatar: 'Загрузить свой аватар', noAvatar: 'Аватар не установлен'
    },
    en: {
        chats: 'Messages', archive: 'Archive', settings: 'Settings', back: '◀ Back',
        select: 'Select contact', noContacts: 'No chats', online: 'online', offline: 'offline',
        typing: 'typing...', empty: 'Empty', notFound: 'User not found',
        enterId: 'Enter 6-digit ID', msg: 'Message...', send: 'Send', edited: 'edited',
        deleted: 'Message deleted', save: 'Save', saved: 'Settings saved',
        selfSearch: 'You cannot search for yourself', invalidId: 'ID must be 6 digits',
        langLabel: 'Language', themeLabel: 'Theme', wallpaper: 'Chat Wallpaper',
        nickname: 'Nickname (unchangeable)', displayName: 'Display Name',
        age: 'Age', about: 'About', avatar: 'Avatar', myId: 'My ID', notSpecified: 'not specified',
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
    canvas.width = size; canvas.height = size; canvas.style.display = 'none';
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

function getStorageKey() { return 'ichatter_key_' + (myEmail || '').toLowerCase().trim(); }

function saveLocalMessages(chat, msgs) {
    try {
        var json = JSON.stringify(msgs);
        var key = getStorageKey();
        var chatKey = (chat || '').toLowerCase().trim();
        var encrypted = encryptLocal(json, key);
        localStorage.setItem('ichatter_msg_' + (myEmail || '').toLowerCase() + '_' + chatKey, encrypted);
    } catch (e) {}
}

function loadLocalMessages(chat) {
    var key = getStorageKey();
    var chatKey = (chat || '').toLowerCase().trim();
    var encrypted = localStorage.getItem('ichatter_msg_' + (myEmail || '').toLowerCase() + '_' + chatKey);
    if (!encrypted) return [];
    try { var json = decryptLocal(encrypted, key); return JSON.parse(json) || []; }
    catch (e) { return []; }
}

function mergeMessages(local, server) {
    var map = {};
    for (var i = 0; i < local.length; i++) map[local[i].id] = local[i];
    for (var j = 0; j < server.length; j++) map[server[j].id] = server[j];
    var merged = [];
    for (var k in map) if (map.hasOwnProperty(k)) merged.push(map[k]);
    merged.sort(function(a, b) { return a.timestamp - b.timestamp; });
    return merged;
}

function parseMessageText(text) {
    if (!text) return '';
    var imgMatch = text.match(/\[img\](.*?)\[\/img\]/);
    if (imgMatch) {
        var cleanText = text.replace(/\[img\](.*?)\[\/img\]/g, '').trim();
        var imgUrl = esc(imgMatch[1]);
        return (cleanText ? esc(cleanText) + '<br>' : '') + '<img src="' + imgUrl + '" class="msg-img" onclick="window.open(this.src)">';
    }
    if (text.indexOf('data:image/') === 0) {
        return '<img src="' + esc(text) + '" class="msg-img" onclick="window.open(this.src)">';
    }
    return esc(text);
}

function addMsg(msg) {
    if (!msg || !msg.id) return;
    if (loadedMessageIds[msg.id]) return;
    loadedMessageIds[msg.id] = true;
    var container = byId('messages');
    var isMe = (msg.from || '').toLowerCase().trim() === (myEmail || '').toLowerCase().trim();
    var div = document.createElement('div');
    div.className = 'msg ' + (isMe ? 'my' : 'partner');
    div.id = 'msg-' + msg.id;
    var senderName = msg.fromUsername || (msg.from ? msg.from.split('@')[0] : 'User');
    var timeStr = formatTime(msg.timestamp || Date.now());
    var partnerEmail = isMe ? (msg.to || chatWith) : (msg.from || chatWith);
    var rawText = msg.text || '';
    var displayText = msg.deleted ? '' : decryptMsg(rawText, partnerEmail || chatWith);
    var textContent = msg.deleted ? '<i>' + t('deleted') + '</i>' : parseMessageText(displayText);

    if (msg.media && !msg.deleted) {
        var mediaUrl = (msg.media.indexOf('/uploads/') === 0) ? API + msg.media : msg.media;
        var type = msg.mediaType || '';
        if (!type) {
            if (/\.(webm|mp4|mov)$/i.test(msg.media)) type = 'video-circle';
            else if (/\.(ogg|mp3|wav|m4a|aac)$/i.test(msg.media)) type = 'audio';
        }

        if (type === 'audio') {
            textContent += (textContent ? '<br>' : '') +
                '<div class="msg-audio-player"><audio src="' + esc(mediaUrl) + '" controls playsinline></audio></div>';
        } else if (type === 'video-circle') {
            textContent += (textContent ? '<br>' : '') +
                '<video src="' + esc(mediaUrl) + '" class="msg-video-circle" controls playsinline loop></video>';
        } else {
            textContent += (textContent ? '<br>' : '') + '<img src="' + esc(mediaUrl) + '" class="msg-img" onclick="window.open(this.src)">';
        }
    }

    var edited = msg.edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '';
    var senderClick = (!isMe && !isGroupChat) ? ' onclick="showPartnerProfile()" style="cursor:pointer;"' : '';

    var tickHtml = '';
    if (isMe && !msg.deleted && !isGroupChat) {
        var tickClass = msg.read ? 'read' : '';
        var tickSymbol = msg.read ? '✓✓' : '✓';
        tickHtml = '<span class="status-ticks ' + tickClass + '" id="tick-' + msg.id + '">' + tickSymbol + '</span>';
    }

    div.innerHTML = '<div class="sender"' + senderClick + '>' + esc(senderName) + '</div>' +
                    '<div class="text">' + textContent + edited + '</div>' +
                    '<span class="time">' + timeStr + tickHtml + '</span>';

    if (isMe && !msg.deleted) {
        div.onclick = function (e) {
            var target = (e && e.target) ? e.target : window.event.srcElement;
            if (target && (target.tagName === 'BUTTON' || target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) return;
            if (div.className.indexOf('show-actions') !== -1) {
                div.className = div.className.replace(' show-actions', '');
            } else {
                div.className += ' show-actions';
            }
        };
        div.innerHTML += '<div class="actions"><button class="edit-btn" onclick="if(event.stopPropagation)event.stopPropagation();else event.cancelBubble=true;editMsg(\'' + msg.id + '\',\'' + esc(displayText).replace(/'/g, "\\'") + '\')">✎</button><button class="del-btn" onclick="if(event.stopPropagation)event.stopPropagation();else event.cancelBubble=true;delMsg(\'' + msg.id + '\')">✕</button></div>';
    }
    container.appendChild(div);
    var clr = document.createElement('div');
    clr.style.clear = 'both';
    clr.style.height = '0';
    clr.style.fontSize = '0';
    container.appendChild(clr);
    container.scrollTop = container.scrollHeight;
}

function updMsg(id, text, edited) {
    var el = byId('msg-' + id);
    if (!el) return;
    var decrypted = decryptMsg(text, chatWith);
    var textDivs = el.getElementsByClassName('text');
    if (textDivs.length > 0) {
        textDivs[0].innerHTML = parseMessageText(decrypted) + (edited ? ' <span class="edited-tag">(' + t('edited') + ')</span>' : '');
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
    if (!chatWith || isGroupChat) return;
    var partner = null;
    for (var i = 0; i < contacts.length; i++) if (contacts[i].email === chatWith) { partner = contacts[i]; break; }
    if (!partner) {
        byId('partner-displayname').textContent = chatWith.split('@')[0];
        byId('partner-username').textContent = chatWith.split('@')[0];
        byId('partner-id').textContent = '';
        byId('partner-status').textContent = '';
        byId('partner-age').textContent = t('age') + ': ' + t('notSpecified');
        byId('partner-about').textContent = '';
        byId('partner-avatar').src = generateEmptyAvatar();
        byId('partner-profile-overlay').style.display = 'block';
        return;
    }
    byId('partner-displayname').textContent = partner.displayName || partner.username;
    byId('partner-username').textContent = partner.username || '';
    byId('partner-id').textContent = partner.searchId || '';
    byId('partner-status').textContent = partner.isOnline ? t('online') : t('offline');
    byId('partner-age').textContent = t('age') + ': ' + (partner.age ? partner.age : t('notSpecified'));
    byId('partner-about').textContent = partner.about || '';
    var avUrl = generateEmptyAvatar();
    if (partner.avatar) {
        if (partner.avatar.indexOf('/uploads/avatars/') === 0) avUrl = API + partner.avatar;
        else avUrl = STATIC_URL + '/avatars/' + partner.avatar;
    }
    var avatarImg = byId('partner-avatar');
    avatarImg.src = avUrl;
    avatarImg.onerror = function () { this.onerror = null; this.src = generateEmptyAvatar(); };
    byId('partner-profile-overlay').style.display = 'block';
}
function closePartnerProfile() { byId('partner-profile-overlay').style.display = 'none'; }

function showGroupInfo() {
    if (!chatWith || !isGroupChat) return;
    api('GET', '/api/group-info?groupId=' + encodeURIComponent(chatWith), null, function (err, data) {
        if (err || !data.group) return;
        byId('group-info-title').textContent = '👥 ' + data.group.name;
        byId('group-info-count').textContent = data.memberDetails.length;
        var list = byId('group-info-members');
        list.innerHTML = '';
        for (var i = 0; i < data.memberDetails.length; i++) {
            var m = data.memberDetails[i];
            var div = document.createElement('div');
            div.className = 'group-member-view';
            var stClass = m.isOnline ? 'online' : '';
            div.innerHTML = esc(m.displayName) + ' (@' + esc(m.username) + ') <span class="m-status ' + stClass + '">' + (m.isOnline ? t('online') : t('offline')) + '</span>';
            list.appendChild(div);
        }
        byId('group-info-overlay').style.display = 'block';
    });
}
function closeGroupInfoModal() { byId('group-info-overlay').style.display = 'none'; }

function openCreateGroupModal() {
    var container = byId('group-members-list');
    container.innerHTML = '';
    if (!contacts.length) {
        container.innerHTML = '<div style="font-size:12px;color:#aaa;">Нет контактов для добавления</div>';
    } else {
        for (var i = 0; i < contacts.length; i++) {
            var c = contacts[i];
            var div = document.createElement('div');
            div.className = 'group-member-item';
            div.innerHTML = '<label><input type="checkbox" value="' + esc(c.email) + '"> ' + esc(c.displayName || c.username) + '</label>';
            container.appendChild(div);
        }
    }
    byId('group-name-input').value = '';
    byId('create-group-overlay').style.display = 'block';
}
function closeCreateGroupModal() { byId('create-group-overlay').style.display = 'none'; }

function submitCreateGroup() {
    var name = byId('group-name-input').value.trim();
    if (!name) { alert('Введите название группы'); return; }
    var checkboxes = byId('group-members-list').getElementsByTagName('input');
    var selected = [];
    for (var i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) selected.push(checkboxes[i].value);
    }
    api('POST', '/api/create-group', { name: name, members: selected }, function (err, res) {
        if (err || !res.success) { alert('Ошибка создания группы'); return; }
        closeCreateGroupModal();
        loadContacts();
        openChat(res.group.id);
    });
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
    isGroupChat = (em && em.indexOf('group_') === 0);
    byId('chats-panel').style.display = 'none';
    byId('archive-panel').style.display = 'none';
    byId('settings-panel').style.display = 'none';
    byId('chat-area').style.display = 'block';
    byId('bottom-nav').style.display = 'table';
    byId('btn-back').style.display = 'block';

    var name = pendingName;
    if (!name) {
        if (isGroupChat) {
            for (var gIdx = 0; gIdx < groups.length; gIdx++) if (groups[gIdx].id === em) { name = '👥 ' + groups[gIdx].name; break; }
        } else {
            for (var i = 0; i < contacts.length; i++) if (contacts[i].email === em) { name = contacts[i].displayName || contacts[i].username; break; }
        }
    }
    if (!name) name = isGroupChat ? '👥 Группа' : em.split('@')[0];
    pendingName = null;
    byId('chat-title').innerHTML = name;
    byId('chat-title').onclick = isGroupChat ? showGroupInfo : showPartnerProfile;
    loadedMessageIds = {};
    byId('messages').innerHTML = '';

    if (!isGroupChat) {
        for (var cIdx = 0; cIdx < contacts.length; cIdx++) {
            if (contacts[cIdx].email === em) { contacts[cIdx].unreadCount = 0; break; }
        }
        renderContacts();
        if (socket) socket.emit('mark_read', { with: em });
    }

    if (profile && profile.wallpaper) {
        var wp = profile.wallpaper;
        var wpUrl = (wp.indexOf('/uploads/') === 0) ? API + wp : STATIC_URL + '/wallpapers/' + wp;
        byId('messages').style.backgroundImage = 'url(' + wpUrl + ')';
        byId('messages').style.backgroundSize = 'cover';
    } else {
        byId('messages').style.backgroundImage = '';
    }

    if (!isGroupChat && !hasContact(em)) {
        addContactToServer(em);
        contacts.push({ email: em, username: em.split('@')[0], displayName: em.split('@')[0], searchId: '', avatar: 'av1.png', age: 0, about: '', unreadCount: 0, isOnline: false });
        renderContacts();
    }

    var localMsgs = loadLocalMessages(em);
    for (var j = 0; j < localMsgs.length; j++) addMsg(localMsgs[j]);

    var reqUrl = isGroupChat
        ? API + '/api/group-messages?groupId=' + encodeURIComponent(em) + '&token=' + encodeURIComponent(token)
        : API + '/api/messages?with=' + encodeURIComponent(em) + '&limit=100&token=' + encodeURIComponent(token);

    var xhr2 = new XMLHttpRequest();
    xhr2.open('GET', reqUrl, true);
    xhr2.onreadystatechange = function() {
        if (xhr2.readyState === 4 && xhr2.status === 200) {
            var data = {};
            try { data = JSON.parse(xhr2.responseText); } catch(e) {}
            var serverMsgs = data.messages || [];
            var merged = mergeMessages(localMsgs, serverMsgs);
            saveLocalMessages(em, merged);
            for (var k = 0; k < merged.length; k++) addMsg(merged[k]);
        }
    };
    xhr2.send();
}

function goBack() { showTab('chats'); byId('chat-title').onclick = null; }

function updateNavTexts() {
    byId('search-input').placeholder = t('searchPlaceholder');
    byId('input').placeholder = t('msg');
    byId('send-btn').textContent = t('send');
    byId('btn-back').textContent = t('back');
}

function addContactToServer(email) { api('POST', '/api/add-contact', { email: email }, function () {}); }
function hasContact(email) { for (var i = 0; i < contacts.length; i++) if (contacts[i].email === email) return true; return false; }

function loadContacts() {
    api('GET', '/api/contacts', null, function (err, data) {
        if (!err) { contacts = data.contacts || []; }
        api('GET', '/api/my-groups', null, function (gErr, gData) {
            if (!gErr) { groups = gData.groups || []; }
            renderContacts();
        });
    });
}

function renderContacts() {
    var list = byId('chats-list');
    list.innerHTML = '';
    if (!contacts.length && !groups.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">' + t('noContacts') + '</div>';
        return;
    }

    for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        var divG = document.createElement('div');
        divG.className = 'chat-item';
        divG.innerHTML = '<div class="name">👥 ' + esc(grp.name) + '</div><div class="status">' + grp.members.length + ' участников</div>';
        divG.onclick = (function (id, gName) { return function () { pendingName = '👥 ' + gName; openChat(id); }; })(grp.id, grp.name);
        list.appendChild(divG);
    }

    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var div = document.createElement('div');
        div.className = 'chat-item';
        var statusClass = c.isOnline ? 'online' : '';
        var badgeHtml = (c.unreadCount && c.unreadCount > 0) ? '<span class="unread-badge">' + c.unreadCount + '</span>' : '';
        div.innerHTML = '<div class="name">' + esc(c.displayName || c.username) + '</div><div class="status ' + statusClass + '">' + (c.isOnline ? t('online') : t('offline')) + '</div>' + badgeHtml + '<button class="archive-btn" onclick="event.stopPropagation();archiveChat(\'' + c.email + '\')">📦</button>';
        div.onclick = (function (email) { return function () { openChat(email); }; })(c.email);
        list.appendChild(div);
    }
}

function loadArchive() {
    api('GET', '/api/archived-chats', null, function (err, data) {
        if (err) return;
        var items = data.contacts || [];
        var list = byId('archive-list');
        list.innerHTML = '';
        if (!items.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">' + t('empty') + '</div>'; return; }
        for (var i = 0; i < items.length; i++) {
            var c = items[i];
            var div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = '<div class="name">' + esc(c.displayName || c.username) + '</div><button class="archive-btn unarchive-btn" onclick="event.stopPropagation();unarchiveChat(\'' + c.email + '\')">↩</button>';
            div.onclick = (function (email, name) { return function () { pendingName = name; openChat(email); }; })(c.email, c.displayName || c.username);
            list.appendChild(div);
        }
    });
}
function archiveChat(em) { api('POST', '/api/archive-chat', { email: em }, function () { loadContacts(); }); }
function unarchiveChat(em) { api('POST', '/api/unarchive-chat', { email: em }, function () { loadArchive(); loadContacts(); }); }
function findUser() {
    var id = byId('search-input').value.trim();
    if (!id) { alert(t('enterId')); return; }
    if (!/^\d{6}$/.test(id)) { alert(t('invalidId')); return; }
    api('GET', '/api/find-user?id=' + encodeURIComponent(id), null, function (err, d) {
        if (err) return;
        if (d.found) {
            if (d.user.email === myEmail) { alert(t('selfSearch')); return; }
            pendingName = d.user.displayName || d.user.username;
            openChat(d.user.email);
        } else if (d.error) { alert(d.error); } else { alert(t('notFound')); }
    });
}

function loadSettings() {
    api('GET', '/api/my-profile', null, function (err, data) {
        if (err) return;
        profile = data.user;
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
    });
}
function loadAvatars() {
    var grid = byId('avatar-grid');
    grid.innerHTML = '';
    var avatarUrl = generateEmptyAvatar();
    if (profile.avatar) {
        if (profile.avatar.indexOf('/uploads/avatars/') === 0) avatarUrl = API + profile.avatar;
        else avatarUrl = STATIC_URL + '/avatars/' + profile.avatar;
    }
    var img = document.createElement('img');
    img.src = avatarUrl;
    img.className = 'selected';
    img.onerror = function () { this.onerror = null; this.src = generateEmptyAvatar(); };
    grid.appendChild(img);
}
function loadWallpapers() {
    var grid = byId('wallpaper-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var walls = ['bg1.jpg','bg2.jpg','bg3.jpg','bg4.jpg','bg5.jpg','bg6.jpg','bg7.jpg','bg8.jpg'];
    for (var i = 0; i < walls.length; i++) {
        var img = document.createElement('img');
        img.src = STATIC_URL + '/wallpapers/' + walls[i];
        img.onerror = function () { this.style.display = 'none'; };
        if (profile.wallpaper === walls[i]) img.className = 'selected';
        img.onclick = (function (w) { return function () {
            var imgs = grid.getElementsByTagName('img');
            for (var k = 0; k < imgs.length; k++) imgs[k].className = '';
            this.className = 'selected';
            profile.wallpaper = w;
            byId('messages').style.backgroundImage = 'url(' + STATIC_URL + '/wallpapers/' + w + ')';
            byId('messages').style.backgroundSize = 'cover';
        }; })(walls[i]);
        grid.appendChild(img);
    }
}
function loadDevices() {
    api('GET', '/api/my-devices', null, function (err, data) {
        if (err) return;
        var devices = data.devices || [];
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
    });
}
function logoutDevice(tok) { if (!confirm('Выйти с устройства?')) return; api('POST', '/api/logout-device', { targetToken: tok }, function () { loadDevices(); }); }
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
    api('POST', '/api/update-profile', {
        displayName: profile.displayName, age: profile.age, about: profile.about,
        avatar: profile.avatar, theme: newTheme, language: newLang, wallpaper: profile.wallpaper
    }, function () { alert(t('saved')); showTab('settings'); });
}
function setLang(l) { lang = l; localStorage.setItem('lang', lang); updateNavTexts(); if (byId('lang-select')) byId('lang-select').value = lang; }
function setTheme(th) {
    var themeClass = (th || 'dark') + '-mode';
    document.body.className = themeClass;
    if (profile) profile.theme = th;
    if (byId('theme-select')) byId('theme-select').value = th || 'dark';
}
function uploadCustomAvatar(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('avatar', file);
    api('POST', '/api/upload-avatar', formData, function (err, resp) {
        if (!err && resp.success) { alert('Аватар обновлён!'); profile.avatar = resp.url; loadAvatars(); }
    }, true);
    input.value = '';
}

function sendImageAttachment(input) {
    if (!input.files || !input.files[0] || !chatWith || !socket) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function (e) {
        var dataUrl = e.target.result;
        var formattedMsg = '[img]' + dataUrl + '[/img]';
        var encImg = encryptMsg(formattedMsg, chatWith);
        socket.emit('send_message', { to: chatWith, text: encImg, isGroup: isGroupChat });
    };
    reader.readAsDataURL(file);
    input.value = '';
}

var audioRecorder = null;
var audioChunks = [];
var voiceTimerInterval = null;
var voiceSec = 0;

function toggleVoiceRecord() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        byId('voice-file-input').click();
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        audioChunks = [];
        audioRecorder = new MediaRecorder(stream);
        audioRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
        audioRecorder.start();
        byId('voice-record-panel').style.display = 'flex';
        voiceSec = 0;
        byId('voice-timer').textContent = '00:00';
        clearInterval(voiceTimerInterval);
        voiceTimerInterval = setInterval(function() {
            voiceSec++;
            var m = Math.floor(voiceSec / 60); var s = voiceSec % 60;
            byId('voice-timer').textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
        }, 1000);
    }).catch(function() {
        byId('voice-file-input').click();
    });
}

function cancelVoiceRecord() {
    if (audioRecorder && audioRecorder.state !== 'inactive') {
        audioRecorder.stop();
        if (audioRecorder.stream) audioRecorder.stream.getTracks().forEach(function(t){t.stop();});
    }
    clearInterval(voiceTimerInterval);
    byId('voice-record-panel').style.display = 'none';
}

function stopAndSendVoiceRecord() {
    if (!audioRecorder || audioRecorder.state === 'inactive') return;
    audioRecorder.onstop = function() {
        var blob = new Blob(audioChunks, { type: 'audio/webm' });
        if (audioRecorder.stream) audioRecorder.stream.getTracks().forEach(function(t){t.stop();});
        var formData = new FormData();
        formData.append('file', blob, 'voice.webm');
        api('POST', '/api/upload-media', formData, function(err, resp) {
            if (!err && resp.success) {
                socket.emit('send_message', { to: chatWith, text: '', media: resp.url, mediaType: 'audio', isGroup: isGroupChat });
            }
        }, true);
    };
    audioRecorder.stop();
    clearInterval(voiceTimerInterval);
    byId('voice-record-panel').style.display = 'none';
}

function uploadAudioFileFallback(input) {
    if (!input.files || !input.files[0] || !chatWith) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('file', file);
    api('POST', '/api/upload-media', formData, function(err, resp) {
        if (!err && resp.success) {
            socket.emit('send_message', { to: chatWith, text: '', media: resp.url, mediaType: 'audio', isGroup: isGroupChat });
        }
    }, true);
    input.value = '';
}

var videoRecorder = null;
var videoChunks = [];
var videoStream = null;
var videoTimerInterval = null;
var videoSec = 0;

function toggleVideoCircleRecord() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        byId('video-circle-file-input').click();
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 360, height: 360 }, audio: true }).then(function(stream) {
        videoStream = stream;
        videoChunks = [];
        byId('video-preview').srcObject = stream;
        byId('video-circle-modal').style.display = 'flex';
        videoRecorder = new MediaRecorder(stream);
        videoRecorder.ondataavailable = function(e) { if (e.data.size > 0) videoChunks.push(e.data); };
        videoRecorder.start();
        videoSec = 0;
        byId('video-circle-timer').textContent = '00:00';
        clearInterval(videoTimerInterval);
        videoTimerInterval = setInterval(function() {
            videoSec++;
            var m = Math.floor(videoSec / 60); var s = videoSec % 60;
            byId('video-circle-timer').textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
        }, 1000);
    }).catch(function() {
        byId('video-circle-file-input').click();
    });
}

function cancelVideoCircleRecord() {
    if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
    if (videoStream) videoStream.getTracks().forEach(function(t){t.stop();});
    clearInterval(videoTimerInterval);
    byId('video-circle-modal').style.display = 'none';
}

function stopAndSendVideoCircleRecord() {
    if (!videoRecorder || videoRecorder.state === 'inactive') return;
    videoRecorder.onstop = function() {
        var blob = new Blob(videoChunks, { type: 'video/webm' });
        if (videoStream) videoStream.getTracks().forEach(function(t){t.stop();});
        var formData = new FormData();
        formData.append('file', blob, 'circle.webm');
        api('POST', '/api/upload-media', formData, function(err, resp) {
            if (!err && resp.success) {
                socket.emit('send_message', { to: chatWith, text: '', media: resp.url, mediaType: 'video-circle', isGroup: isGroupChat });
            }
        }, true);
    };
    videoRecorder.stop();
    clearInterval(videoTimerInterval);
    byId('video-circle-modal').style.display = 'none';
}

function uploadVideoFileFallback(input) {
    if (!input.files || !input.files[0] || !chatWith) return;
    var file = input.files[0];
    var formData = new FormData();
    formData.append('file', file);
    api('POST', '/api/upload-media', formData, function(err, resp) {
        if (!err && resp.success) {
            socket.emit('send_message', { to: chatWith, text: '', media: resp.url, mediaType: 'video-circle', isGroup: isGroupChat });
        }
    }, true);
    input.value = '';
}

function initEmojiPicker() {
    var emojis = [
        '😊','😂','😃','😄','😅','😆','😉','😋','😍','😎',
        '🍿','🚀','👍','👎','❤️','🔥','💬','📱','🎉','🙏',
        '📷','🎵','🌟','💡','💯','⚡','🎁','⚽','🏀','🎮',
        '😇','😈','😭','😱','😡','😴','😷','💩','👻','💀'
    ];
    var picker = byId('emoji-picker');
    if (!picker) return;
    picker.innerHTML = '';
    for (var i = 0; i < emojis.length; i++) {
        var span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emojis[i];
        span.onclick = (function (em) {
            return function () {
                var inp = byId('input');
                inp.value += em;
                inp.focus();
            };
        })(emojis[i]);
        picker.appendChild(span);
    }
}

function toggleEmojiPicker() {
    var picker = byId('emoji-picker');
    if (!picker) return;
    if (picker.style.display === 'block') {
        picker.style.display = 'none';
    } else {
        initEmojiPicker();
        picker.style.display = 'block';
    }
}

var _sending = false;
function sendMessage() {
    if (_sending) return;
    var input = byId('input');
    var text = input.value.trim();
    if (!text || !chatWith || !socket) return;
    _sending = true;
    input.value = '';
    byId('emoji-picker').style.display = 'none';
    if (editingId) {
        var encEdited = encryptMsg(text, chatWith);
        socket.emit('edit_message', { id: editingId, newText: encEdited, to: chatWith });
        editingId = null;
    } else {
        var encText = encryptMsg(text, chatWith);
        socket.emit('send_message', { to: chatWith, text: encText, isGroup: isGroupChat });
    }
    setTimeout(function () { _sending = false; }, 300);
}
function editMsg(id, text) { editingId = id; byId('input').value = text; byId('input').focus(); }
function delMsg(id) { if (confirm('Удалить сообщение?')) socket.emit('delete_message', { id: id, to: chatWith }); }

function connectSocket() {
    if (typeof io !== 'undefined') {
        socket = io(API, { query: { token: token } });
    } else {
        console.warn('Socket.IO library not loaded yet');
        return;
    }

    socket.on('receive_message', function (msg) {
        if (chatWith === msg.from || (msg.isGroup && chatWith === msg.to)) {
            addMsg(msg);
            if (!msg.isGroup) socket.emit('mark_read', { with: msg.from });
        } else if (!msg.isGroup) {
            var found = false;
            for (var i = 0; i < contacts.length; i++) {
                if (contacts[i].email === msg.from) {
                    contacts[i].unreadCount = (contacts[i].unreadCount || 0) + 1;
                    found = true;
                    break;
                }
            }
            if (!found) { addContactToServer(msg.from); loadContacts(); }
            renderContacts();
        }

        var arr = loadLocalMessages(msg.isGroup ? msg.to : msg.from);
        arr.push(msg);
        if (arr.length > 500) arr = arr.slice(-500);
        saveLocalMessages(msg.isGroup ? msg.to : msg.from, arr);
    });

    socket.on('message_sent', function (msg) {
        if (chatWith === msg.to) addMsg(msg);
        var arr = loadLocalMessages(msg.to);
        arr.push(msg);
        if (arr.length > 500) arr = arr.slice(-500);
        saveLocalMessages(msg.to, arr);
        if (!msg.isGroup && !hasContact(msg.to)) { addContactToServer(msg.to); loadContacts(); }
        loadContacts();
    });

    socket.on('messages_read', function (d) {
        if (chatWith === d.by) {
            var ticks = document.getElementsByClassName('status-ticks');
            for (var i = 0; i < ticks.length; i++) {
                ticks[i].textContent = '✓✓';
                ticks[i].className = 'status-ticks read';
            }
        }
    });

    socket.on('update_message', function (d) {
        updMsg(d.id, d.text, d.edited);
        var arr = loadLocalMessages(chatWith);
        for (var i = 0; i < arr.length; i++) if (arr[i].id === d.id) { arr[i].text = d.text; arr[i].edited = d.edited; break; }
        saveLocalMessages(chatWith, arr);
    });

    socket.on('remove_message', function (d) {
        delMsgUI(d.id);
        var arr = loadLocalMessages(chatWith);
        for (var i = 0; i < arr.length; i++) if (arr[i].id === d.id) { arr[i].deleted = true; arr[i].text = ''; break; }
        saveLocalMessages(chatWith, arr);
    });

    socket.on('user_typing', function (data) {
        if (isGroupChat && data.groupId === chatWith && data.isTyping) {
            var originalName = '👥 Группа';
            for (var gIdx = 0; gIdx < groups.length; gIdx++) if (groups[gIdx].id === chatWith) { originalName = '👥 ' + groups[gIdx].name; break; }
            byId('chat-title').innerHTML = originalName + ' <span style="font-size:11px;color:#4cd964;">(' + esc(data.username) + ' ' + t('typing') + ')</span>';
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(function () {
                if (chatWith === data.groupId) {
                    byId('chat-title').innerHTML = originalName;
                }
            }, 2000);
        } else if (!isGroupChat && chatWith === data.from && data.isTyping) {
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

    socket.on('user_status', function (data) {
        var email = (data.email || '').toLowerCase().trim();
        for (var i = 0; i < contacts.length; i++) {
            if ((contacts[i].email || '').toLowerCase().trim() === email) {
                contacts[i].isOnline = (data.status === 'online');
                break;
            }
        }
        renderContacts();
    });
}

function updateIosKeyboardOffset(isFocused) {
    var isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIos) return;

    if (isFocused) {
        var isLandscape = (window.orientation === 90 || window.orientation === -90 || window.innerWidth > window.innerHeight);
        var isPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var kbdHeight = isPad ? (isLandscape ? 260 : 260) : (isLandscape ? 162 : 216);

        byId('form-container').style.bottom = kbdHeight + 'px';
        byId('messages').style.bottom = (kbdHeight + 50) + 'px';
    } else {
        byId('form-container').style.bottom = '0px';
        byId('messages').style.bottom = '50px';
    }
    setTimeout(function() {
        byId('messages').scrollTop = byId('messages').scrollHeight;
    }, 100);
}

var sendBtn = byId('send-btn');
function handleSendTouch(e) {
    if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
    }
    sendMessage();
    return false;
}
sendBtn.onmousedown = handleSendTouch;
if ('ontouchstart' in window) {
    sendBtn.ontouchstart = handleSendTouch;
}
sendBtn.onclick = sendMessage;

byId('input').onkeydown = function (e) { if (e.keyCode === 13) { e.preventDefault(); sendMessage(); } };
byId('input').oninput = function () {
    if (chatWith && socket) socket.emit('typing', { to: chatWith, isGroup: isGroupChat, isTyping: true });
};
byId('input').addEventListener('focus', function () { updateIosKeyboardOffset(true); });
byId('input').addEventListener('blur', function () { updateIosKeyboardOffset(false); });

setTheme('dark');
connectSocket();
showTab('chats');
