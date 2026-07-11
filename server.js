const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Раздача фронтенда

// Файлы-"базы данных"
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Загрузка данных из файлов при старте
let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : {};
let messages = fs.existsSync(MESSAGES_FILE) ? JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')) : [];
let verificationCodes = {}; // Хранение кодов в памяти (email -> {code, expires})

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveMessages() { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2)); }

// Настройка отправки писем через Gmail (замени на свои данные)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'YOUR_EMAIL@gmail.com',
        pass: 'YOUR_APP_PASSWORD' // Пароль приложений Google (не обычный пароль!)
    }
});

// --- API НАСТРОЕК И РЕГИСТРАЦИИ ---

// 1. Отправка кода на почту
app.post('/api/auth/send-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = { code, expires: Date.now() + 600000 }; // Срок действия 10 минут

    const mailOptions = {
        from: 'iChatter <YOUR_EMAIL@gmail.com>',
        to: email,
        subject: 'Код подтверждения iChatter',
        text: `Ваш одноразовый код для входа в ретро-мессенджер iChatter: ${code}`
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Не удалось отправить письмо' });
        }
        res.json({ message: 'Код успешно отправлен!' });
    });
});

// 2. Верификация кода и создание сессии
app.post('/api/auth/verify', (req, res) => {
    const { email, code, username } = req.body;
    const session = verificationCodes[email];

    if (!session || session.code !== code || Date.now() > session.expires) {
        return res.status(400).json({ error: 'Неверный или просроченный код' });
    }

    // Ищем, есть ли уже юзер с такой почтой
    let user = Object.values(users).find(u => u.email === email);
    
    if (!user) {
        // Создаем нового юзера с рандомным ID вида id_XXXXXX
        const userId = 'id_' + Math.floor(100000 + Math.random() * 900000);
        user = {
            id: userId,
            email,
            username: username || email.split('@')[0],
            profile: { name: username || 'Пользователь', age: '', bio: '', avatar: 'avatar1.png' },
            archivedChats: [],
            sessions: []
        };
        users[userId] = user;
    }

    // Добавляем текущую сессию (устройство)
    const userAgent = req.headers['user-agent'] || 'Неизвестное устройство';
    user.sessions.push({
        device: userAgent.split(')')[0] + ')', // Обрезаем длинную строку юзерагента для красоты
        loginAt: new Date().toLocaleString()
    });

    saveUsers();
    delete verificationCodes[email];

    res.json({ message: 'Вход выполнен', user });
});

// Поиск участника по Рандомному ID
app.get('/api/users/search', (req, res) => {
    const { id } = req.query;
    if (users[id]) {
        res.json({ id: users[id].id, username: users[id].username, profile: users[id].profile });
    } else {
        res.status(404).json({ error: 'Пользователь с таким ID не найден' });
    }
});

// Обновление профиля из настроек
app.post('/api/users/update-profile', (req, res) => {
    const { userId, name, age, bio, avatar } = req.body;
    if (!users[userId]) return res.status(404).json({ error: 'Юзер не найден' });

    users[userId].profile = { name, age, bio, avatar };
    saveUsers();
    res.json({ message: 'Профиль обновлен', profile: users[userId].profile });
});

// Управление архивом
app.post('/api/users/archive-chat', (req, res) => {
    const { userId, chatPartnerId, archive } = req.body;
    if (!users[userId]) return res.status(404).json({ error: 'Юзер не найден' });

    if (archive) {
        if (!users[userId].archivedChats.includes(chatPartnerId)) {
            users[userId].archivedChats.push(chatPartnerId);
        }
    } else {
        users[userId].archivedChats = users[userId].archivedChats.filter(id => id !== chatPartnerId);
    }
    saveUsers();
    res.json({ message: 'Статус архива изменен', archivedChats: users[userId].archivedChats });
});

// --- СВЯЗЬ ЧЕРЕЗ SOCKET.IO (СООБЩЕНИЯ) ---
io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету');

    // При подключении отдаем историю сообщений
    socket.emit('chat history', messages);

    // Новое сообщение
    socket.on('chat message', (data) => {
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            text: data.text,
            senderId: data.senderId,
            senderName: data.senderName,
            avatar: data.avatar || 'avatar1.png',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        messages.push(msg);
        saveMessages();
        io.emit('chat message', msg); // Рассылаем абсолютно всем вкладкам и устройствам
    });

    // Редактирование сообщения
    socket.on('edit message', (data) => {
        const msg = messages.find(m => m.id === data.msgId);
        if (msg && msg.senderId === data.userId) { // Проверка автора сообщения
            msg.text = data.newText;
            msg.isEdited = true;
            saveMessages();
            io.emit('message edited', { msgId: data.msgId, text: data.newText });
        }
    });

    // Удаление сообщения
    socket.on('delete message', (data) => {
        const msgIndex = messages.findIndex(m => m.id === data.msgId);
        if (msgIndex !== -1 && messages[msgIndex].senderId === data.userId) {
            messages.splice(msgIndex, 1);
            saveMessages();
            io.emit('message deleted', { msgId: data.msgId });
        }
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Сервер iChatter запущен на порту http://localhost:${PORT}`);
});
