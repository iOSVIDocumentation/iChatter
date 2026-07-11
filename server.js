const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
// Раздача остальных файлов (например, login.html, картинок или скриптов)
app.use(express.static(__dirname));

// ЖЕСТКИЙ МАРШРУТ ДЛЯ ГЛАВНОЙ СТРАНИЦЫ (решает проблему Cannot GET /)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Очередь для поиска собеседника
let waitingUsers = [];
let users = {};

// Настройка почты
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'твоя_почта@gmail.com',
        pass: 'abcd efgh ijkl mnop' // Твой 16-значный ПАРОЛЬ ПРИЛОЖЕНИЯ
    }
});

// Роут для отправки кода
app.post('/api/send-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    users[email] = { code: code, verified: false };

    const mailOptions = {
        from: 'твоя_почта@gmail.com',
        to: email,
        subject: 'iChatter - Код авторизации',
        text: `Ваш проверочный код для входа в ретро-мессенджер iChatter: ${code}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Ошибка отправки почты:', error);
            return res.status(500).json({ error: 'Не удалось отправить код' });
        }
        res.json({ success: true });
    });
});

// Роут для проверки кода
app.post('/api/verify-code', (req, res) => {
    const { email, code, username } = req.body;
    if (users[email] && users[email].code === code) {
        users[email].verified = true;
        users[email].username = username || email.split('@')[0];
        return res.json({ success: true, username: users[email].username });
    }
    res.status(400).json({ error: 'Неверный код подтверждения' });
});

// Socket.io
io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('search_partner', (username) => {
        socket.username = username || 'Аноним';
        if (waitingUsers.length > 0) {
            let partnerSocket = waitingUsers.shift();
            let roomId = socket.id + '#' + partnerSocket.id;
            
            socket.join(roomId);
            partnerSocket.join(roomId);
            
            socket.roomId = roomId;
            partnerSocket.roomId = roomId;
            
            socket.partner = partnerSocket;
            partnerSocket.partner = socket;
            
            socket.emit('chat_started', { partnerName: partnerSocket.username });
            partnerSocket.emit('chat_started', { partnerName: socket.username });
        } else {
            waitingUsers.push(socket);
            socket.emit('waiting', 'Поиск собеседника...');
        }
    });

    socket.on('send_message', (messageText) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('receive_message', {
                sender: socket.username,
                text: messageText,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    socket.on('disconnect', () => {
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        if (socket.partner) {
            socket.partner.emit('partner_disconnected', 'Собеседник покинул чат.');
            socket.partner.leave(socket.roomId);
            socket.partner.roomId = null;
            socket.partner.partner = null;
        }
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(` iChatter сервер запущен на порту http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
