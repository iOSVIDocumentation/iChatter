var http = require('http');
var https = require('https');
var crypto = require('crypto');
var fs = require('fs');

var GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/iOSVIDocumentation/iChatter/main/';
var USERS_FILE = './users.json';

var clients = [];

// Проверяем или создаем файл базы данных пользователей
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
}

function fetchFromGitHub(fileName, res, contentType) {
    var url = GITHUB_RAW_BASE + fileName;
    https.get(url, function(gitRes) {
        if (gitRes.statusCode !== 200) {
            res.writeHead(gitRes.statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end('<h1>Ошибка загрузки файла с GitHub: ' + fileName + '</h1>');
        }
        res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
        gitRes.pipe(res);
    }).on('error', function(e) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Ошибка сети сервера</h1>');
    });
}

var server = http.createServer(function(req, res) {
    // ОБРАБОТКА ВХОДА / РЕГИСТРАЦИИ (POST запрос от login.html)
    if (req.url === '/api/login' && req.method === 'POST') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body);
                var username = data.username ? data.username.trim() : '';
                var password = data.password ? data.password.trim() : '';

                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'Пустые поля!' }));
                }

                var users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

                // Если пользователя нет — регистрируем его, если есть — проверяем пароль
                if (!users[username]) {
                    users[username] = password; // В учебных целях сохраняем просто текстом
                    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, message: 'Регистрация успешна!' }));
                } else {
                    if (users[username] === password) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: true, message: 'Вход успешен!' }));
                    } else {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, message: 'Неверный пароль!' }));
                    }
                }
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // РАЗДАЧА СТРАНИЦ С GITHUB
    var url = req.url;
    if (url === '/' || url === '/login') {
        fetchFromGitHub('login.html', res, 'text/html');
    } else if (url === '/chat' || url === '/index' || url === '/index.html') {
        fetchFromGitHub('index.html', res, 'text/html');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Страница не найдена</h1>');
    }
});

// Логика веб-сокетов для самого чата
server.on('upgrade', function(req, socket, head) {
    if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
        var key = req.headers['sec-websocket-key'];
        var shasum = crypto.createHash('sha1');
        shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
        var acceptKey = shasum.digest('base64');

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
        );

        clients.push(socket);

        socket.on('data', function(buffer) {
            var message = decodeWebSocketFrame(buffer);
            if (message === null) return;
            var responseFrame = encodeWebSocketFrame(message);
            clients.forEach(function(client) {
                if (client.writable && client.destroyed === false) {
                    try { client.write(responseFrame); } catch (e) {}
                }
            });
        });

        function removeClient() { clients = clients.filter(function(client) { return client !== socket; }); }
        socket.on('close', removeClient);
        socket.on('error', function() { removeClient(); socket.destroy(); });
    }
});

function decodeWebSocketFrame(buffer) {
    if (buffer.length < 2) return null;
    var secondByte = buffer[1];
    var isMasked = (secondByte & 0x80) === 0x80;
    var length = secondByte & 0x7F;
    var dataStart = 2;
    if (length === 126) {
        if (buffer.length < 4) return null;
        length = buffer.readUInt16BE(2);
        dataStart = 4;
    } else if (length === 127) { return null; }
    if (buffer.length < dataStart + (isMasked ? 4 : 0) + length) return null;
    if (isMasked) {
        var masks = buffer.slice(dataStart, dataStart + 4);
        dataStart += 4;
        var payload = buffer.slice(dataStart, dataStart + length);
        for (var i = 0; i < payload.length; i++) { payload[i] = payload[i] ^ masks[i % 4]; }
        return payload.toString('utf8');
    } else {
        return buffer.slice(dataStart, dataStart + length).toString('utf8');
    }
}

function encodeWebSocketFrame(message) {
    var payload = Buffer.from(message, 'utf8');
    var length = payload.length;
    var header;
    if (length <= 125) {
        header = Buffer.alloc(2); header[0] = 0x81; header[1] = length;
    } else if (length <= 65535) {
        header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(length, 2);
    } else { return null; }
    return Buffer.concat([header, payload]);
}

server.listen(8080, '0.0.0.0', function() {
    console.log('iChatter запущен с поддержкой авторизации!');
});
