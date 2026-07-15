var BACKEND_URL = "https://moss-perspective-stands-copying.trycloudflare.com";

// Самописная функция для чтения ?token= из ссылки (URLSearchParams не работает в iOS 6)
function getQueryParam(name) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === name) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null;
}

var token = getQueryParam('token');

// Если токена нет, отправляем обратно на страницу входа
if (!token) {
    window.location.href = 'login.html';
}

// Подключаемся к серверу, передавая токен
var socket = io(BACKEND_URL, { query: { token: token } });

// Обработка входящего сообщения
socket.on('receive_message', function(data) {
    var msgList = document.getElementById('messages');
    var div = document.createElement('div');
    
    div.className = 'msg';
    div.id = 'msg-' + data.id;
    
    // Используем конкатенацию строк (iOS 6 не понимает ` `)
    div.innerHTML = '<b>' + data.sender + '</b>: ' + data.text;
    
    msgList.appendChild(div);
    
    // Автоскролл вниз при новом сообщении
    msgList.scrollTop = msgList.scrollHeight;
});

// Обработка редактирования сообщения
socket.on('update_message', function(data) {
    var el = document.getElementById('msg-' + data.id);
    if (el) {
        // Сохраняем никнейм отправителя (тег <b>), чтобы он не затерся при обновлении текста
        var senderHtml = '';
        var boldTag = el.getElementsByTagName('b')[0];
        if (boldTag) {
            senderHtml = '<b>' + boldTag.innerHTML + '</b>: ';
        }
        
        el.innerHTML = senderHtml + data.text;
    }
});

// Обработка удаления сообщения
socket.on('remove_message', function(data) {
    var el = document.getElementById('msg-' + data.id);
    // Используем removeChild, так как el.remove() может не работать в старом Safari
    if (el && el.parentNode) {
        el.parentNode.removeChild(el); 
    }
});

// Отправка сообщения
document.getElementById('form').onsubmit = function(e) {
    e.preventDefault(); // Останавливаем перезагрузку страницы при нажатии "Отпр."
    
    var input = document.getElementById('input');
    
    // Отправляем, только если поле не пустое
    if (input.value !== '') {
        socket.emit('send_message', { text: input.value, room: 'general' });
        input.value = ''; // Очищаем поле ввода
    }
};
