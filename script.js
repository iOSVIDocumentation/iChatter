var BACKEND_URL = 'http://192.168.1.15:8080';
var token = localStorage.getItem('ichatter_token');
var myEmail = localStorage.getItem('ichatter_email');
var socket = null;
var currentChat = null;
var contacts = [];

if (!token || !myEmail) {
    window.location.href = 'login.html';
}

function formatTime(timestamp) {
    var d = new Date(timestamp);
    var h = d.getHours();
    var m = d.getMinutes();
    if (m < 10) m = '0' + m;
    return h + ':' + m;
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function addMessageToUI(msg) {
    var msgList = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg';
    if (msg.from === myEmail) div.className += ' my';
    div.id = 'msg-' + msg.id;
    var senderName = msg.fromUsername || msg.from.split('@')[0];
    var timeStr = formatTime(msg.timestamp);
    div.innerHTML = '<div class="sender">' + escapeHtml(senderName) + '<span class="time">' + timeStr + '</span></div>' +
                    '<div class="text">' + escapeHtml(msg.text) + '</div>';
    msgList.appendChild(div);
    msgList.scrollTop = msgList.scrollHeight;
}

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
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Нет контактов</div>';
        return;
    }
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var div = document.createElement('div');
        div.className = 'contact-item';
        var statusClass = c.isOnline ? 'online' : '';
        div.innerHTML = '<div class="name">' + escapeHtml(c.username) + '</div>' +
                        '<div class="status ' + statusClass + '">' + (c.isOnline ? 'онлайн' : 'оффлайн') + '</div>';
        div.onclick = (function(email) { return function() { openChat(email); }; })(c.email);
        list.appendChild(div);
    }
}

function toggleContacts() {
    var panel = document.getElementById('contacts-panel');
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
    if (panel.style.display === 'block') loadContacts();
}

function addContact() {
    var searchId = document.getElementById('search-input').value.trim();
    if (!searchId) { alert('Введите ID'); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', BACKEND_URL + '/api/find-user?token=' + token + '&searchId=' + searchId, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            if (data.found) {
                openChat(data.user.email);
                document.getElementById('contacts-panel').style.display = 'none';
            } else {
                alert('Пользователь не найден');
            }
        }
    };
    xhr.send();
}

function openChat(email) {
    currentChat = email;
    document.getElementById('contacts-panel').style.display = 'none';
    var name = email.split('@')[0];
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === email) { name = contacts[i].username; break; }
    }
    document.getElementById('chat-title').innerHTML = name;
    loadMessages(email);
}

function updateContactStatus(email, status) {
    for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].email === email) { contacts[i].isOnline = (status === 'online'); break; }
    }
    if (document.getElementById('contacts-panel').style.display === 'block') renderContacts();
}

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
    socket.on('user_status', function(data) {
        updateContactStatus(data.email, data.status);
    });
    socket.on('user_typing', function(data) {
        if (currentChat === data.from) {
            document.getElementById('chat-title').innerHTML = data.username + ' (печатает...)';
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

document.getElementById('form').onsubmit = function(e) {
    e.preventDefault();
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text || !currentChat) { if (!currentChat) alert('Выберите контакт'); return; }
    socket.emit('send_message', { to: currentChat, text: text });
    input.value = '';
};

var typingTimeout;
document.getElementById('input').oninput = function() {
    if (!currentChat) return;
    socket.emit('typing', { to: currentChat, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() { socket.emit('typing', { to: currentChat, isTyping: false }); }, 1500);
};

connectSocket();
loadContacts();
