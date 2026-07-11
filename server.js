const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Хранилище временных кодов верификации в памяти сервера
const tempCodes = {};

// НАСТРОЙКА ПОЧТОВОГО РОБОТА
// ВНИМАНИЕ: pass — это 16-значный пароль приложения, созданный в безопасности Google
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '1rol4k2@gmail.com', 
        pass: 'ЗДЕСЬ_ТВОЙ_16_ЗНАЧНЫЙ_ПАРОЛЬ_ПРИЛОЖЕНИЯ' 
    }
});

// Проверка подключения к почтовому серверу при запуске
transporter.verify((error, success) => {
    if (error) {
        console.log('⚠ Предупреждение: Транспорт почты не авторизован:', error.message);
    } else {
        console.log('⚙ Почтовый сервер успешно готов к отправке писем!');
    }
});

// Роут отправки проверочного кода
app.post('/api/send-code', (req, res) => {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ error: 'Укажите адрес почты' });

    // Генерация 6-значного цифрового кода
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Запись кода в память со сроком жизни 10 минут
    tempCodes[email] = { 
        code: code, 
        username: username || 'Пользователь',
        expires: Date.now() + 600000 
    };

    const mailOptions = {
        from: '"iChatter" <1rol4k2@gmail.com>',
        to: email,
        subject: 'Код авторизации iChatter',
        text: `Приветствуем! Ваш одноразовый код для входа в ретро-мессенджер iChatter: ${code}\nКод действует 10 минут.`
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.error('\n======= ОШИБКА ОТПРАВКИ ПОЧТЫ =======');
            console.error(err);
            console.error('=====================================\n');
            return res.status(500).json({ error: 'Не удалось отправить код на почту. Проверьте консоль сервера.' });
        }
        console.log(`[ПОЧТА] Код верификации ${code} успешно отправлен пользователю ${email}`);
        res.json({ success: true });
    });
});

// Роут проверки кода и выдачи авторизации
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({ error: 'Заполните все поля!' });
    }

    const record = tempCodes[email];

    if (!record) {
        return res.status(400).json({ error: 'Код не запрашивался или устарел!' });
    }

    if (Date.now() > record.expires) {
        delete tempCodes[email];
        return res.status(400).json({ error: 'Время действия кода истекло!' });
    }

    if (record.code !== code.trim()) {
        return res.status(400).json({ error: 'Неверный проверочный код!' });
    }

    // Успешный вход — генерируем объект пользователя
    const userSession = {
        id: 'usr_' + Math.random().toString(36).substr(2, 9),
        email: email,
        username: record.username,
        authTime: Date.now()
    };

    // Очищаем использованный код из памяти
    delete tempCodes[email];

    console.log(`[УСПЕХ] Пользователь ${userSession.username} (${email}) успешно вошел.`);
    res.json({ success: true, user: userSession });
});

// Старт сервера
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Локальный бэкенд iChatter запущен на порту ${PORT}`);
    console.log(`=============================================`);
});
