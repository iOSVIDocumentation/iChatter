const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Разрешаем Express отдавать HTML-файлы прямо из корня проекта, где они у тебя лежат
app.use(express.static(__dirname));
app.use(express.json());

// Очередь для поиска собеседника (анонимный чат)
let waitingUsers = [];

// Массив для хранения зарегистрированных или временных пользователей
let users = {};

// Настройка почты (замени почту и пароль приложения на свои)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'твоя_почта@gmail.com', // Твоя почта Gmail
        pass: 'abcd efgh ijkl mnop'   // Твой 16-значный ПАРОЛЬ ПРИЛОЖЕНИЯ
    }
});

// Роут для отправки кода подтверждения при регистрации/входе
app.post('/api/send-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Сохраняем код для этого email временно в памяти сервера
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
        console.log('Код отправлен на:', email);
        res.json({ success: true });
    });
});

// Роут для проверки введённого пользователем кода
app.post('/api/verify-code', (req, res) => {
    const { email, code, username } = req.body;
    
    if (users[email] && users[email].code === code) {
        users[email].verified = true;
        users[email].username = username || email.split('@')[0];
        return res.json({ success: true, username: users[email].username });
    }
    
    res.status(400).json({ error: 'Неверный код подтверждения' });
});

// Работа со встроенными сокетами (Socket.io) для чата
io.on('connection', (socket) => {
    console.log('Новое подключение к сокету:', socket.id);

    // Вход в систему поиска анонимного собеседника
    socket.on('search_partner', (username) => {
        socket.username = username || 'Аноним';
        
        // Если кто-то уже ждёт, соединяем их
        if (waitingUsers.length > 0) {
            let partnerSocket = waitingUsers.shift();
            
            // Генерируем ID для комнаты чата
            let roomId = socket.id + '#' + partnerSocket.id;
            
            socket.join(roomId);
            partnerSocket.join(roomId);
            
            socket.roomId = roomId;
            partnerSocket.roomId = roomId;
            
            socket.partner = partnerSocket;
            partnerSocket.partner = socket;
            
            // Уведомляем обоих, что собеседник найден
            socket.emit('chat_started', { partnerName: partnerSocket.username });
            partnerSocket.emit('chat_started', { partnerName: socket.username });
            
            console.log(`Комната ${roomId} создана для ${socket.username} и ${partnerSocket.username}`);
        } else {
            // Если никого нет, добавляем в очередь ожидания
            waitingUsers.push(socket);
            socket.emit('waiting', 'Поиск собеседника...');
        }
    });

    // Получение сообщения и пересылка его в комнату
    socket.on('send_message', (messageText) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit('receive_message', {
                sender: socket.username,
                text: messageText,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        
        // Удаляем из очереди, если он там был
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        
        // Если был в чате, пишем его партнеру, что он вышел
        if (socket.partner) {
            socket.partner.emit('partner_disconnected', 'Собеседник покинул чат.');
            socket.partner.leave(socket.roomId);
            socket.partner.roomId = null;
            socket.partner.partner = null;
        }
    });
});

// Запуск сервера на порту 8080
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(` iChatter сервер успешно запущен!`);
    console.log(` Локальный адрес: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
