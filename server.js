require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ["GET", "POST"] },
    transports: ['polling', 'websocket']
});

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '10mb' }));

const DB_PATH = path.join(__dirname, 'database.json');
const TOKENS_PATH = path.join(__dirname, 'tokens.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const AVATARS_DIR = path.join(PUBLIC_DIR, 'avatars');
const WALLPAPERS_DIR = path.join(PUBLIC_DIR, 'wallpapers');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'uploads', 'media');
const CUSTOM_AVATARS_DIR = path.join(PUBLIC_DIR, 'uploads', 'avatars');
const CUSTOM_WALLPAPERS_DIR = path.join(PUBLIC_DIR, 'uploads', 'wallpapers');

[AVATARS_DIR, WALLPAPERS_DIR, MEDIA_DIR, CUSTOM_AVATARS_DIR, CUSTOM_WALLPAPERS_DIR].forEach(function(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/avatars', express.static(AVATARS_DIR));
app.use('/wallpapers', express.static(WALLPAPERS_DIR));
app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads')));

const storageMedia = multer.diskStorage({
    destination: MEDIA_DIR,
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 6) + ext);
    }
});
const uploadMedia = multer({ storage: storageMedia, limits: { fileSize: 50 * 1024 * 1024 } });

const storageAvatar = multer.diskStorage({
    destination: CUSTOM_AVATARS_DIR,
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + Date.now() + ext);
    }
});
const uploadAvatar = multer({ storage: storageAvatar, limits: { fileSize: 5 * 1024 * 1024 } });

const storageWallpaper = multer.diskStorage({
    destination: CUSTOM_WALLPAPERS_DIR,
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, 'bg-' + Date.now() + ext);
    }
});
const uploadWallpaper = multer({ storage: storageWallpaper, limits: { fileSize: 5 * 1024 * 1024 } });

const tempCodes = {};
let activeTokens = {};
const connectedUsers = {};
const resetCodes = {};

function readDatabase() {
    try {
        if (!fs.existsSync(DB_PATH)) return { users: [], messages: [], archivedChats: {}, groups: [] };
        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        if (!data.messages) data.messages = [];
        if (!data.archivedChats) data.archivedChats = {};
        if (!data.groups) data.groups = [];
        return data;
    } catch (err) { return { users: [], messages: [], archivedChats: {}, groups: [] }; }
}

function writeDatabase(data) {
    try {
        const tmpPath = DB_PATH + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpPath, DB_PATH);
    } catch (err) { console.error('Oshibka zapisi v bazu:', err); }
}

function loadTokens() {
    try {
        if (fs.existsSync(TOKENS_PATH)) {
            activeTokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
            console.log('[SISTEMA] Tokeny zagruzeny.');
        }
    } catch (err) { console.log('[OSHIBKA] Tokeny ne zagruzeny'); }
}

function saveTokens() {
    try {
        const tmpPath = TOKENS_PATH + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(activeTokens, null, 2), 'utf8');
        fs.renameSync(tmpPath, TOKENS_PATH);
    } catch (e) {}
}

loadTokens();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function generateSearchId(db) {
    let newId;
    while (true) {
        newId = Math.floor(100000 + Math.random() * 900000).toString();
        if (!db.users.find(function(u) { return u.searchId === newId; })) return newId;
    }
}

function hashPassword(password) {
    if (!password) return '';
    return crypto.createHash('sha256').update(password + (process.env.HASH_SECRET || 'ichatter_secure_salt_2026')).digest('hex');
}

const EMAIL_KEY = crypto.createHash('sha256').update(process.env.EMAIL_SECRET || 'ichatter_email_secret_2026').digest();
function encryptEmail(email) {
    if (!email) return '';
    const norm = email.toLowerCase().trim();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', EMAIL_KEY, iv);
    let enc = cipher.update(norm, 'utf8', 'hex');
    enc += cipher.final('hex');
    return iv.toString('hex') + ':' + enc;
}

function decryptEmail(encText) {
    if (!encText) return '';
    if (!encText.includes(':')) return encText;
    try {
        const parts = encText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', EMAIL_KEY, iv);
        let dec = decipher.update(parts[1], 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (e) {
        return encText;
    }
}

function findUserByEmail(db, email) {
    if (!email) return null;
    const target = email.toLowerCase().trim();
    return db.users.find(function(u) {
        const dec = decryptEmail(u.email);
        return dec.toLowerCase().trim() === target;
    });
}

app.post('/api/send-code', function(req, res) {
    const { email, username, password, mode, language } = req.body;
    const targetEmail = email.toLowerCase().trim();
    const targetUsername = (username || '').trim().toLowerCase();
    const db = readDatabase();
    const existingUser = findUserByEmail(db, targetEmail);
    const lang = language === 'en' ? 'en' : 'ru';

    if (mode === 'register') {
        if (existingUser) {
            const msg = lang === 'en' ? 'Email is already taken' : 'Email zanyat';
            return res.status(400).json({ error: msg });
        }
        if (db.users.find(function(u) { return (u.username || '').toLowerCase() === targetUsername; })) {
            const msg = lang === 'en' ? 'Username is already taken' : 'Nik uzhe zanyat';
            return res.status(400).json({ error: msg });
        }
        db.users.push({
            searchId: generateSearchId(db),
            username: targetUsername,
            displayName: username.trim(),
            email: encryptEmail(targetEmail),
            password: hashPassword(password),
            age: 0,
            about: lang === 'en' ? 'Hey, I am in iChatter!' : 'Privet, ya v iChatter!',
            avatar: 'av1.png',
            wallpaper: '',
            theme: 'dark',
            language: lang,
            publicKey: '',
            contacts: []
        });
        writeDatabase(db);
    } else {
        const hashedInput = hashPassword(password);
        if (!existingUser || (existingUser.password !== hashedInput && existingUser.password !== password)) {
            const msg = lang === 'en' ? 'Invalid login/password' : 'Neverni login/parol';
            return res.status(401).json({ error: msg });
        }
        if (existingUser.password === password) {
            existingUser.password = hashedInput;
            writeDatabase(db);
        }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const userNick = existingUser ? (existingUser.displayName || existingUser.username) : targetUsername;
    tempCodes[targetEmail] = { code: code, username: existingUser ? existingUser.username : targetUsername };
    
    console.log('[АВТОРИЗАЦИЯ] Пользователю "' + userNick + '" отправлен код: ' + code);

    const subject = 'iChatter Authorization Code';
    const text = lang === 'en'
        ? 'Your iChatter verification code: ' + code + '\nValid for 10 minutes.'
        : 'Vash kod dlya iChatter: ' + code + '\nDeystvuet 10 minut.';

    transporter.sendMail({
        from: '"iChatter" <1r1krol4k2@gmail.com@gmail.com>',
        to: targetEmail,
        subject: subject,
        text: text
    }, function(err) {
        if (err) {
            console.error('Oshibka otpravki:', err);
            const msg = lang === 'en' ? 'Mail error' : 'Oshibka pochty';
            return res.status(500).json({ error: msg });
        }
        res.json({ success: true });
    });
});

app.post('/api/forgot-password', function(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Укажите email' });
    const targetEmail = email.toLowerCase().trim();
    const db = readDatabase();
    const user = findUserByEmail(db, targetEmail);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const userNick = user.displayName || user.username;
    resetCodes[targetEmail] = { code: code, userNick: userNick };
    
    console.log('[ВОССТАНОВЛЕНИЕ] Пользователю "' + userNick + '" отправлен код сброса: ' + code);

    transporter.sendMail({
        from: '"iChatter" <1rol4k2@gmail.com>',
        to: targetEmail,
        subject: 'iChatter Password Reset',
        text: 'Ваш код восстановления пароля iChatter: ' + code
    }, function(err) {
        res.json({ success: true });
    });
});

app.post('/api/reset-password', function(req, res) {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    const targetEmail = email.toLowerCase().trim();
    const record = resetCodes[targetEmail];
    if (!record || record.code !== code.trim()) {
        return res.status(400).json({ error: 'Неверный или истекший код сброса' });
    }
    const db = readDatabase();
    const user = findUserByEmail(db, targetEmail);
    if (user) {
        user.password = hashPassword(newPassword);
        writeDatabase(db);
        delete resetCodes[targetEmail];
        console.log('[ВОССТАНОВЛЕНИЕ] Пользователь "' + record.userNick + '" успешно сменил пароль.');
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Пользователь не найден' });
});

app.post('/api/verify-code', function(req, res) {
    const { email, code, device } = req.body;
    const targetEmail = email.toLowerCase().trim();
    const record = tempCodes[targetEmail];
    if (!record || record.code !== code.trim()) {
        return res.status(400).json({ error: 'Oshibka koda' });
    }

    const db = readDatabase();
    const user = findUserByEmail(db, targetEmail);
    const token = crypto.randomBytes(64).toString('hex');
    activeTokens[token] = {
        email: targetEmail,
        username: user ? user.username : record.username,
        searchId: user ? user.searchId : '000000',
        device: device || 'Web',
        created: Date.now()
    };
    saveTokens();
    console.log('[ВХОД] ' + (user ? user.username : record.username));

    res.json({ success: true, token: token, user: user || { username: record.username } });
    delete tempCodes[targetEmail];
});

app.get('/api/my-profile', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const db = readDatabase();
    const user = findUserByEmail(db, activeTokens[token].email);
    if (user) res.json({ user: user });
    else res.status(404).json({ error: 'Polzovatel ne najden' });
});

app.post('/api/update-profile', function(req, res) {
    const { token, displayName, age, about, avatar, theme, language, wallpaper } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const db = readDatabase();
    const user = findUserByEmail(db, activeTokens[token].email);
    if (user) {
        if (displayName) user.displayName = displayName;
        if (age !== undefined) user.age = age;
        if (about !== undefined) user.about = about;
        if (avatar) user.avatar = avatar;
        if (theme) user.theme = theme;
        if (language) user.language = language;
        if (wallpaper !== undefined) user.wallpaper = wallpaper;
        writeDatabase(db);
        res.json({ success: true, user: user });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
});

app.get('/api/my-devices', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentToken = token;
    const userEmail = activeTokens[token].email;
    const devices = [];
    for (let t in activeTokens) {
        if (activeTokens[t].email === userEmail) {
            devices.push({
                token: t === currentToken ? null : t.substring(0, 16) + '...',
                device: activeTokens[t].device || 'Unknown',
                created: activeTokens[t].created,
                isCurrent: t === currentToken
            });
        }
    }
    res.json({ devices: devices });
});

app.post('/api/logout-device', function(req, res) {
    const { token, targetToken } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const userEmail = activeTokens[token].email;
    let fullToken = null;
    for (let t in activeTokens) {
        if (t.startsWith(targetToken) && activeTokens[t].email === userEmail) {
            fullToken = t;
            break;
        }
    }
    if (fullToken && fullToken !== token) {
        delete activeTokens[fullToken];
        saveTokens();
        res.json({ success: true });
    } else res.status(400).json({ error: 'Nelzya vyjti s tekushego ustroystva' });
});

app.post('/api/add-contact', function(req, res) {
    const { token, email } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email;
    const db = readDatabase();
    const user = findUserByEmail(db, currentUserEmail);
    if (user) {
        if (!user.contacts) user.contacts = [];
        if (!user.contacts.includes(email)) {
            user.contacts.push(email);
            writeDatabase(db);
        }
        res.json({ success: true });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
});

app.get('/api/contacts', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email;
    const db = readDatabase();
    const user = findUserByEmail(db, currentUserEmail);
    if (!user) return res.status(404).json({ error: 'Polzovatel ne najden' });

    const contacts = (user.contacts || []).map(function(email) {
        const contactUser = findUserByEmail(db, email);
        const unreadCount = (db.messages || []).filter(function(m) {
            return (m.from || '').toLowerCase().trim() === email.toLowerCase().trim() &&
                   (m.to || '').toLowerCase().trim() === currentUserEmail.toLowerCase().trim() &&
                   !m.read && !m.deleted;
        }).length;

        return {
            email: email,
            username: contactUser ? contactUser.username : email.split('@')[0],
            displayName: contactUser ? (contactUser.displayName || contactUser.username) : email.split('@')[0],
            searchId: contactUser ? contactUser.searchId : '',
            avatar: contactUser ? contactUser.avatar : 'av1.png',
            age: contactUser ? contactUser.age : 0,
            about: contactUser ? contactUser.about : '',
            unreadCount: unreadCount,
            isOnline: Object.values(connectedUsers).some(function(s) { return s.user && s.user.email === email; })
        };
    });
    res.json({ contacts: contacts });
});

app.get('/api/find-user', function(req, res) {
    const { token, id } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    if (!id || !/^\d{6}$/.test(id.trim())) {
        return res.status(400).json({ error: 'Vvedite 6-znachny ID' });
    }
    const db = readDatabase();
    const user = db.users.find(function(u) { return u.searchId === id.trim(); });
    if (user) {
        res.json({
            found: true,
            user: {
                email: user.email,
                username: user.username,
                displayName: user.displayName || user.username,
                searchId: user.searchId,
                avatar: user.avatar,
                about: user.about,
                age: user.age,
                publicKey: user.publicKey || ''
            }
        });
    } else res.json({ found: false });
});

app.get('/api/messages', function(req, res) {
    const token = req.query.token;
    const withEmail = req.query['with'];
    const limit = req.query.limit;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email.toLowerCase().trim();
    const targetEmail = (withEmail || '').toLowerCase().trim();
    const db = readDatabase();

    const chatMsgs = (db.messages || []).filter(function(m) {
        const from = (m.from || '').toLowerCase().trim();
        const to = (m.to || '').toLowerCase().trim();
        return (from === currentUserEmail && to === targetEmail) || (from === targetEmail && to === currentUserEmail);
    });

    const maxLimit = parseInt(limit) || 100;
    res.json({ messages: chatMsgs.slice(-maxLimit) });
});

io.use(function(socket, next) {
    const token = socket.handshake.query.token;
    if (!token) return next(new Error("No token"));
    if (activeTokens[token]) {
        const db = readDatabase();
        const fullUser = findUserByEmail(db, activeTokens[token].email);
        socket.user = fullUser || {
            username: activeTokens[token].username || 'Unknown',
            email: activeTokens[token].email,
            searchId: activeTokens[token].searchId || '000000'
        };
        next();
    } else next(new Error("Unauthorized"));
});

io.on('connection', function(socket) {
    console.log('[ПОДКЛЮЧЕН] ' + socket.user.username);
    connectedUsers[socket.id] = socket;
    socket.join(socket.user.email);

    socket.on('send_message', function(data) {
        const isGroup = data.isGroup || (data.to && data.to.indexOf('group_') === 0);
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            from: socket.user.email.toLowerCase().trim(),
            fromUsername: socket.user.displayName || socket.user.username,
            fromSearchId: socket.user.searchId,
            to: data.to.trim(),
            isGroup: isGroup,
            text: data.text,
            media: data.media || null,
            mediaType: data.mediaType || null,
            timestamp: Date.now(),
            read: false
        };

        const dbData = readDatabase();
        if (!dbData.messages) dbData.messages = [];
        dbData.messages.push(message);
        writeDatabase(dbData);

        if (isGroup) {
            socket.to(data.to).emit('receive_message', message);
            socket.emit('message_sent', message);
        } else {
            if (data.to !== socket.user.email) {
                io.to(data.to).emit('receive_message', message);
            }
            socket.emit('message_sent', message);
        }
    });

    socket.on('disconnect', function() {
        console.log('[ОТКЛЮЧЕН] ' + socket.user.username);
        delete connectedUsers[socket.id];
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', function() { console.log('Server started on port ' + PORT); });
