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

function migrateDatabaseToEncryptedEmails() {
    try {
        const db = readDatabase();
        let updated = false;
        if (db.users && Array.isArray(db.users)) {
            db.users.forEach(function(user) {
                if (user.email && typeof user.email === 'string' && !user.email.includes(':')) {
                    console.log('[МИГРАЦИЯ] Зашифрован email для: ' + (user.displayName || user.username));
                    user.email = encryptEmail(user.email);
                    updated = true;
                }
                if (user.password && typeof user.password === 'string' && !/^[0-9a-f]{64}$/i.test(user.password)) {
                    console.log('[МИГРАЦИЯ] Захеширован пароль для: ' + (user.displayName || user.username));
                    user.password = hashPassword(user.password);
                    updated = true;
                }
                if (user.contacts && Array.isArray(user.contacts)) {
                    user.contacts = user.contacts.map(function(c) {
                        if (c && typeof c === 'string' && !c.includes(':')) {
                            updated = true;
                            return encryptEmail(c);
                        }
                        return c;
                    });
                }
            });
        }
        if (db.archivedChats && typeof db.archivedChats === 'object') {
            for (let k in db.archivedChats) {
                if (Array.isArray(db.archivedChats[k])) {
                    db.archivedChats[k] = db.archivedChats[k].map(function(c) {
                        if (c && typeof c === 'string' && !c.includes(':')) {
                            updated = true;
                            return encryptEmail(c);
                        }
                        return c;
                    });
                }
            }
        }
        if (db.messages && Array.isArray(db.messages)) {
            db.messages.forEach(function(m) {
                if (m.from && m.from.includes(':')) {
                    m.from = decryptEmail(m.from).toLowerCase().trim();
                    updated = true;
                }
                if (m.to && m.to.includes(':') && !m.to.startsWith('group_')) {
                    m.to = decryptEmail(m.to).toLowerCase().trim();
                    updated = true;
                }
            });
        }
        if (updated) {
            writeDatabase(db);
            console.log('[МИГРАЦИЯ] Все пароли, контакты и почты успешно зашифрованы без потери данных!');
        }
    } catch (e) {
        console.error('[МИГРАЦИЯ ОШИБКА]', e);
    }
}

migrateDatabaseToEncryptedEmails();

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

    const senderEmail = process.env.EMAIL_USER || '1r1krol4k2@gmail.com';
    transporter.sendMail({
        from: '"iChatter" <' + senderEmail + '>',
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

    const senderEmail = process.env.EMAIL_USER || '1r1krol4k2@gmail.com';
    transporter.sendMail({
        from: '"iChatter" <' + senderEmail + '>',
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
        username: user ? (user.displayName || user.username) : record.username,
        searchId: user ? user.searchId : '000000',
        device: device || 'Web',
        created: Date.now()
    };
    saveTokens();
    console.log('[ВХОД] ' + (user ? (user.displayName || user.username) : record.username));

    res.json({ success: true, token: token, user: user ? Object.assign({}, user, { email: targetEmail }) : { username: record.username, email: targetEmail } });
    delete tempCodes[targetEmail];
});

app.get('/api/my-profile', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const db = readDatabase();
    const user = findUserByEmail(db, activeTokens[token].email);
    if (user) {
        const safeUser = Object.assign({}, user, { email: decryptEmail(user.email) });
        res.json({ user: safeUser });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
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
        const safeUser = Object.assign({}, user, { email: decryptEmail(user.email) });
        res.json({ success: true, user: safeUser });
    } else res.status(404).json({ error: 'Polzovatel ne найden' });
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
        const normTarget = email.toLowerCase().trim();
        const exists = user.contacts.some(function(c) {
            return decryptEmail(c).toLowerCase().trim() === normTarget;
        });
        if (!exists) {
            user.contacts.push(encryptEmail(normTarget));
            writeDatabase(db);
        }
        res.json({ success: true });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
});

app.get('/api/contacts', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = (activeTokens[token].email || '').toLowerCase().trim();
    const db = readDatabase();
    const user = findUserByEmail(db, currentUserEmail);
    if (!user) return res.status(404).json({ error: 'Polzovatel ne найden' });

    const contacts = (user.contacts || []).map(function(encEmail) {
        const email = decryptEmail(encEmail).toLowerCase().trim();
        const contactUser = findUserByEmail(db, email);
        const unreadCount = (db.messages || []).filter(function(m) {
            const mFrom = decryptEmail(m.from || '').toLowerCase().trim();
            const mTo = decryptEmail(m.to || '').toLowerCase().trim();
            return mFrom === email &&
                   mTo === currentUserEmail &&
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

app.get('/api/archived-chats', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email;
    const db = readDatabase();
    const archived = (db.archivedChats[currentUserEmail] || []).filter(function(email) { return email; });
    const archivedContacts = archived.map(function(encEmail) {
        const email = decryptEmail(encEmail);
        const user = findUserByEmail(db, email);
        return {
            email: email,
            username: user ? user.username : (email ? email.split('@')[0] : 'Unknown'),
            displayName: user ? (user.displayName || user.username) : (email ? email.split('@')[0] : 'Unknown'),
            searchId: user ? user.searchId : '',
            avatar: user ? user.avatar : 'av1.png',
            age: user ? user.age : 0,
            about: user ? user.about : ''
        };
    });
    res.json({ contacts: archivedContacts });
});

app.post('/api/archive-chat', function(req, res) {
    const { token, email } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email;
    const db = readDatabase();
    const user = findUserByEmail(db, currentUserEmail);
    if (user) {
        const norm = email.toLowerCase().trim();
        user.contacts = (user.contacts || []).filter(function(e) { return decryptEmail(e).toLowerCase().trim() !== norm; });
        if (!db.archivedChats[currentUserEmail]) db.archivedChats[currentUserEmail] = [];
        const existsInArchived = db.archivedChats[currentUserEmail].some(function(e) { return decryptEmail(e).toLowerCase().trim() === norm; });
        if (!existsInArchived) {
            db.archivedChats[currentUserEmail].push(encryptEmail(norm));
        }
        writeDatabase(db);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
});

app.post('/api/unarchive-chat', function(req, res) {
    const { token, email } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email;
    const db = readDatabase();
    const user = findUserByEmail(db, currentUserEmail);
    if (user) {
        const norm = email.toLowerCase().trim();
        if (db.archivedChats[currentUserEmail]) {
            db.archivedChats[currentUserEmail] = db.archivedChats[currentUserEmail].filter(function(e) { return decryptEmail(e).toLowerCase().trim() !== norm; });
        }
        if (!user.contacts) user.contacts = [];
        const existsInContacts = user.contacts.some(function(e) { return decryptEmail(e).toLowerCase().trim() === norm; });
        if (!existsInContacts) user.contacts.push(encryptEmail(norm));
        writeDatabase(db);
        res.json({ success: true });
    } else res.status(404).json({ error: 'Polzovatel ne najden' });
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
                email: decryptEmail(user.email),
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
    const currentUserEmail = (activeTokens[token].email || '').toLowerCase().trim();
    const targetEmail = (withEmail || '').toLowerCase().trim();
    const db = readDatabase();

    const chatMsgs = (db.messages || []).filter(function(m) {
        const from = decryptEmail(m.from || '').toLowerCase().trim();
        const to = decryptEmail(m.to || '').toLowerCase().trim();
        return (from === currentUserEmail && to === targetEmail) || (from === targetEmail && to === currentUserEmail);
    }).map(function(m) {
        return Object.assign({}, m, {
            from: decryptEmail(m.from || '').toLowerCase().trim(),
            to: decryptEmail(m.to || '').toLowerCase().trim()
        });
    });

    const maxLimit = parseInt(limit) || 100;
    res.json({ messages: chatMsgs.slice(-maxLimit) });
});

app.post('/api/create-group', function(req, res) {
    const { token, name, members } = req.body;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email.toLowerCase().trim();
    if (!name || !name.trim()) return res.status(400).json({ error: 'Vvedite nazvanie gruppy' });

    const db = readDatabase();
    if (!db.groups) db.groups = [];
    const groupMembers = Array.isArray(members) ? members.map(function(m){ return m.toLowerCase().trim(); }) : [];
    if (!groupMembers.includes(currentUserEmail)) groupMembers.push(currentUserEmail);

    const group = {
        id: 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: name.trim(),
        avatar: 'av1.png',
        creator: currentUserEmail,
        members: groupMembers,
        created: Date.now()
    };
    db.groups.push(group);
    writeDatabase(db);

    groupMembers.forEach(function(email) {
        for (let sId in connectedUsers) {
            if (connectedUsers[sId].user && connectedUsers[sId].user.email === email) {
                connectedUsers[sId].join(group.id);
            }
        }
    });

    res.json({ success: true, group: group });
});

app.get('/api/my-groups', function(req, res) {
    const { token } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const currentUserEmail = activeTokens[token].email.toLowerCase().trim();
    const db = readDatabase();
    const myGroups = (db.groups || []).filter(function(g) {
        return g.members && g.members.includes(currentUserEmail);
    });
    res.json({ groups: myGroups });
});

app.get('/api/group-info', function(req, res) {
    const { token, groupId } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const db = readDatabase();
    const group = (db.groups || []).find(function(g) { return g.id === groupId; });
    if (!group) return res.status(404).json({ error: 'Gруппа не найдена' });

    const memberDetails = group.members.map(function(email) {
        const u = findUserByEmail(db, email);
        return {
            email: email,
            username: u ? u.username : email.split('@')[0],
            displayName: u ? (u.displayName || u.username) : email.split('@')[0],
            isOnline: Object.values(connectedUsers).some(function(s) { return s.user && s.user.email === email; })
        };
    });

    res.json({ group: group, memberDetails: memberDetails });
});

app.get('/api/group-messages', function(req, res) {
    const { token, groupId, limit } = req.query;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    const db = readDatabase();
    const msgs = (db.messages || []).filter(function(m) {
        return m.to === groupId;
    });
    const maxLimit = parseInt(limit) || 100;
    res.json({ messages: msgs.slice(-maxLimit) });
});

app.post('/api/upload-media', function(req, res) {
    const token = req.query.token;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    uploadMedia.single('file')(req, res, function(err) {
        if (err) return res.status(400).json({ error: 'Oshibka zagruzki fayla' });
        if (!req.file) return res.status(400).json({ error: 'Fayl ne vibran' });
        const fileUrl = '/uploads/media/' + req.file.filename;
        res.json({ success: true, url: fileUrl, type: req.file.mimetype });
    });
});

app.post('/api/upload-avatar', function(req, res) {
    const token = req.query.token;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    uploadAvatar.single('avatar')(req, res, function(err) {
        if (err) return res.status(400).json({ error: 'Oshibka zagruzki avatara' });
        if (!req.file) return res.status(400).json({ error: 'Fayl ne vibran' });
        const avatarUrl = '/uploads/avatars/' + req.file.filename;
        const db = readDatabase();
        const user = findUserByEmail(db, activeTokens[token].email);
        if (user) { user.avatar = avatarUrl; writeDatabase(db); }
        res.json({ success: true, url: avatarUrl });
    });
});

app.post('/api/upload-wallpaper', function(req, res) {
    const token = req.query.token;
    if (!activeTokens[token]) return res.status(401).json({ error: 'Unauthorized' });
    uploadWallpaper.single('wallpaper')(req, res, function(err) {
        if (err) return res.status(400).json({ error: 'Oshibka zagruzki oboev' });
        if (!req.file) return res.status(400).json({ error: 'Fayl ne vibran' });
        const wallpaperUrl = '/uploads/wallpapers/' + req.file.filename;
        const db = readDatabase();
        const user = findUserByEmail(db, activeTokens[token].email);
        if (user) { user.wallpaper = wallpaperUrl; writeDatabase(db); }
        res.json({ success: true, url: wallpaperUrl });
    });
});

io.use(function(socket, next) {
    const token = socket.handshake.query.token;
    if (!token) return next(new Error("No token"));
    if (activeTokens[token]) {
        const db = readDatabase();
        const fullUser = findUserByEmail(db, activeTokens[token].email);
        const plainEmail = (activeTokens[token].email || '').toLowerCase().trim();
        socket.user = {
            username: fullUser ? (fullUser.displayName || fullUser.username) : (activeTokens[token].username || 'Unknown'),
            displayName: fullUser ? (fullUser.displayName || fullUser.username) : (activeTokens[token].username || 'Unknown'),
            email: plainEmail,
            searchId: fullUser ? fullUser.searchId : (activeTokens[token].searchId || '000000')
        };
        next();
    } else next(new Error("Unauthorized"));
});

io.on('connection', function(socket) {
    console.log('[ПОДКЛЮЧЕН] ' + socket.user.username);
    connectedUsers[socket.id] = socket;
    socket.join(socket.user.email);

    const db = readDatabase();
    (db.groups || []).forEach(function(g) {
        if (g.members && g.members.includes(socket.user.email)) {
            socket.join(g.id);
        }
    });

    io.emit('user_status', { email: socket.user.email, username: socket.user.username, status: 'online' });

    socket.on('send_message', function(data) {
        const isGroup = data.isGroup || (data.to && data.to.indexOf('group_') === 0);
        const plainFrom = socket.user.email.toLowerCase().trim();
        const plainTo = (data.to || '').toLowerCase().trim();
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            from: plainFrom,
            fromUsername: socket.user.displayName || socket.user.username,
            fromSearchId: socket.user.searchId,
            to: plainTo,
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
            socket.to(plainTo).emit('receive_message', message);
            socket.emit('message_sent', message);
        } else {
            if (plainTo !== plainFrom) {
                io.to(plainTo).emit('receive_message', message);
            }
            socket.emit('message_sent', message);
        }
    });

    socket.on('mark_read', function(data) {
        const targetWith = (data.with || '').toLowerCase().trim();
        if (!targetWith) return;
        const myEmail = socket.user.email.toLowerCase().trim();
        const dbData = readDatabase();
        let changed = false;

        (dbData.messages || []).forEach(function(m) {
            const mFrom = decryptEmail(m.from || '').toLowerCase().trim();
            const mTo = decryptEmail(m.to || '').toLowerCase().trim();
            if (mFrom === targetWith && mTo === myEmail && !m.read) {
                m.read = true;
                changed = true;
            }
        });

        if (changed) {
            writeDatabase(dbData);
            io.to(targetWith).emit('messages_read', { by: myEmail });
        }
    });

    socket.on('edit_message', function(data) {
        const dbData = readDatabase();
        if (dbData.messages) {
            const m = dbData.messages.find(function(msg) { return msg.id === data.id; });
            if (m) { m.text = data.newText; m.edited = true; writeDatabase(dbData); }
        }
        io.to(data.to).emit('update_message', { id: data.id, text: data.newText, edited: true });
        socket.emit('update_message', { id: data.id, text: data.newText, edited: true });
    });

    socket.on('delete_message', function(data) {
        const dbData = readDatabase();
        if (dbData.messages) {
            const m = dbData.messages.find(function(msg) { return msg.id === data.id; });
            if (m) { m.deleted = true; m.text = ''; writeDatabase(dbData); }
        }
        io.to(data.to).emit('remove_message', { id: data.id });
        socket.emit('remove_message', { id: data.id });
    });

    socket.on('typing', function(data) {
        if (data.isGroup || (data.to && data.to.indexOf('group_') === 0)) {
            socket.to(data.to).emit('user_typing', { from: socket.user.email, username: socket.user.displayName || socket.user.username, isTyping: data.isTyping, groupId: data.to });
        } else if (data.to !== socket.user.email) {
            io.to((data.to || '').toLowerCase().trim()).emit('user_typing', { from: socket.user.email, username: socket.user.displayName || socket.user.username, isTyping: data.isTyping });
        }
    });

    socket.on('disconnect', function() {
        console.log('[ОТКЛЮЧЕН] ' + socket.user.username);
        delete connectedUsers[socket.id];
        io.emit('user_status', { email: socket.user.email, username: socket.user.username, status: 'offline' });
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', function() { console.log('Server started on port ' + PORT); });
