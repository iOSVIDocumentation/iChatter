const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { maxHttpBufferSize: 1e8 });
const PORT = process.env.PORT || 8080; 
const DB_FILE = path.join(__dirname, 'database.json');

const ALLOW_VOICE_EFFECTS = false; 
const GOOGLE_SCRIPT_URL = ""; 

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/iOSVIDocumentation/iChatter/main/';

let userProfiles = {};
let messagesDatabase = {};
let activeConnections = {};
const userRateLimits = {}; 

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const rawData = fs.readFileSync(DB_FILE, 'utf8');
            if (rawData.trim()) {
                const parsed = JSON.parse(rawData);
                messagesDatabase = parsed.messagesDatabase || {};
                userProfiles = parsed.userProfiles || {};
                if (!messagesDatabase.scheduled) messagesDatabase.scheduled = [];
                console.log(`[БД] Загружена. Юзеров: ${Object.keys(userProfiles).length}`);
            }
        } else {
            messagesDatabase = { scheduled: [] };
            userProfiles = {};
            saveDatabaseImmediately();
        }
    } catch (e) {
        console.error('[БД] Ошибка:', e.message);
        messagesDatabase = { scheduled: [] };
        userProfiles = {};
    }
}

let saveTimeout = null;
function saveDatabase() {
    if (saveTimeout) return; 
    saveTimeout = setTimeout(() => {
        saveDatabaseImmediately();
        saveTimeout = null;
    }, 2000); 
}

function saveDatabaseImmediately() {
    try {
        const dataToSave = { messagesDatabase, userProfiles };
        fs.writeFile(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf8', (err) => {
            if (err) console.error('[БД] Ошибка записи:', err.message);
        });
    } catch (err) {
        console.error('[БД] Ошибка serialization:', err.message);
    }
}

loadDatabase();

function fetchFromGitHub(fileName, res) {
    const url = GITHUB_RAW_BASE + fileName + '?nocache=' + Date.now();
    https.get(url, (gitRes) => {
        if (gitRes.statusCode !== 200) {
            res.status(gitRes.statusCode).send(`<h1>Ошибка загрузки ${fileName} с GitHub</h1>`);
            return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        gitRes.pipe(res);
    }).on('error', (e) => {
        res.status(500).send('<h1>Ошибка сети при обращении к GitHub</h1>');
    });
}

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// --- ОБНОВЛЕННЫЕ РОУТЫ С ПРОВЕРКОЙ ---
app.get('/', (req, res) => { 
    res.redirect('/login'); 
});

app.get('/login', (req, res) => { 
    fetchFromGitHub('login.html', res); 
});

app.get(['/main', '/index.html'], (req, res) => {
    fetchFromGitHub('index.html', res);
});

// Интервал проверки отложенных сообщений
setInterval(() => {
    const now = Date.now();
    if (messagesDatabase.scheduled && messagesDatabase.scheduled.length > 0) {
        const dueMessages = messagesDatabase.scheduled.filter(m => new Date(m.scheduledTime).getTime() <= now);
        if (dueMessages.length > 0) {
            messagesDatabase.scheduled = messagesDatabase.scheduled.filter(m => new Date(m.scheduledTime).getTime() > now);
            dueMessages.forEach(msg => {
                delete msg.scheduledTime;
                if (!messagesDatabase[msg.room]) messagesDatabase[msg.room] = [];
                messagesDatabase[msg.room].push(msg);

                if (msg.to && msg.to.startsWith('ht.')) {
                    const groupMembers = (userProfiles[msg.to] && userProfiles[msg.to].members) || [msg.from];
                    groupMembers.forEach(user => {
                        if (!userProfiles[user]) userProfiles[user] = { chatList: [], displayName: user, bio: '', avatar: '' };
                        if (!userProfiles[user].chatList) userProfiles[user].chatList = [];
                        if (!userProfiles[user].chatList.includes(msg.to)) userProfiles[user].chatList.push(msg.to);
                        if (activeConnections[user]) io.to(activeConnections[user]).emit('restore_chats', userProfiles[user].chatList);
                    });
                    io.to(msg.room).emit('chat_message', msg);
                } else {
                    [msg.from, msg.to].forEach(user => {
                        if (!userProfiles[user]) userProfiles[user] = { chatList: [], displayName: user, bio: '', avatar: '' };
                        if (!userProfiles[user].chatList) userProfiles[user].chatList = [];
                        const partner = user === msg.from ? msg.to : msg.from;
                        if (!userProfiles[user].chatList.includes(partner)) userProfiles[user].chatList.push(partner);
                    });
                    io.to(msg.room).emit('chat_message', msg);
                    if (activeConnections[msg.to]) io.to(activeConnections[msg.to]).emit('restore_chats', userProfiles[msg.to].chatList);
                    if (activeConnections[msg.from]) io.to(activeConnections[msg.from]).emit('restore_chats', userProfiles[msg.from].chatList);
                }
            });
            saveDatabase();
        }
    }
}, 1000);

// ЛОГИКА SOCKET.IO
io.on('connection', (socket) => {
    let sessionUser = null;

    socket.on('online_ping', (data) => {
        if (!data || !data.username) return;
        sessionUser = data.username;
        activeConnections[sessionUser] = socket.id;
        socket.join(`user_${sessionUser}`);

        if (!userProfiles[sessionUser]) {
            userProfiles[sessionUser] = { chatList: [], displayName: sessionUser, bio: '', avatar: '', banner: '', glowColor: 'blue', lastSeen: Date.now() };
        }
        userProfiles[sessionUser].lastSeen = Date.now(); 
        if (!userProfiles[sessionUser].chatList) userProfiles[sessionUser].chatList = [];

        Object.keys(userProfiles).forEach(id => {
            if (id.startsWith('ht.')) {
                if (userProfiles[id].members && userProfiles[id].members.includes(sessionUser)) {
                    if (!userProfiles[sessionUser].chatList.includes(id)) userProfiles[sessionUser].chatList.push(id);
                    socket.join(id);
                }
            }
        });

        saveDatabase();
        io.emit('online_list', Object.keys(activeConnections));
        socket.emit('restore_chats', userProfiles[sessionUser].chatList);

        Object.keys(userProfiles).forEach(username => {
            socket.emit('profile_broadcast', { username, data: userProfiles[username] });
        });
    });

    socket.on('request_profile', (data) => {
        if (!data || !data.username) return;
        const uProfile = userProfiles[data.username];
        if (uProfile) socket.emit('profile_broadcast', { username: data.username, data: uProfile });
    });

    socket.on('check_user_exists', (data) => {
        if (!data || !data.username) return;
        
        const inputUsername = data.username.trim();
        const inputPassword = data.password ? String(data.password) : ''; 

        let exists = !!userProfiles[inputUsername];
        let profile = exists ? userProfiles[inputUsername] : null;
        let passwordCorrect = false;

        if (exists) {
            if (!profile.password || profile.password === inputPassword) {
                passwordCorrect = true;
                if (!profile.password) {
                    profile.password = inputPassword;
                    saveDatabase();
                }
            }
        } else {
            exists = true;
            passwordCorrect = true;
            
            userProfiles[inputUsername] = { 
                chatList: [], 
                password: inputPassword, 
                displayName: inputUsername, 
                bio: 'Привет, я использую iChatter!', 
                avatar: '', 
                banner: '', 
                glowColor: 'blue', 
                lastSeen: Date.now() 
            };
            saveDatabaseImmediately();
            profile = userProfiles[inputUsername];
        }

        if (exists && passwordCorrect) {
            socket.emit('user_exists_result', { 
                username: inputUsername, 
                exists: true,
                profile: {
                    displayName: profile.displayName || inputUsername,
                    avatar: profile.avatar || '',
                    bio: profile.bio || '',
                    banner: profile.banner || '',
                    glowColor: profile.glowColor || 'blue',
                    lastSeen: profile.lastSeen || null,
                    members: profile.members || [], 
                    isGroup: profile.isGroup || inputUsername.startsWith('ht.') 
                }
            });
        } else {
            socket.emit('user_exists_result', { 
                username: inputUsername, 
                exists: false,
                profile: null
            });
        }
    });

    socket.on('search_users', (data) => {
        if (!data || typeof data.query !== 'string') return;
        const query = data.query.toLowerCase().trim();
        if (!query) return;

        let results = [];
        Object.keys(userProfiles).forEach(username => {
            const p = userProfiles[username];
            if (!p) return; 
            if (String(username).toLowerCase().includes(query) || String(p.displayName || '').toLowerCase().includes(query)) {
                results.push({
                    username: username,
                    displayName: p.displayName || username,
                    avatar: p.avatar || '',
                    bio: p.bio || '',
                    banner: p.banner || '',
                    glowColor: p.glowColor || 'blue'
                });
            }
        });
        socket.emit('search_results', { query: data.query, results });
    });

    socket.on('global_search', (data) => {
        if (!data || typeof data.query !== 'string' || !sessionUser) return;
        const query = data.query.toLowerCase().trim();
        if (!query) {
            socket.emit('global_search_results', { query: data.query, users: [], messages: [] });
            return;
        }
        
        const foundUsers = [];
        const foundMessages = [];

        Object.keys(userProfiles).forEach(username => {
            const p = userProfiles[username];
            if (!p) return;
            if (String(username).toLowerCase().includes(query) || String(p.displayName || '').toLowerCase().includes(query)) {
                foundUsers.push({ username, displayName: p.displayName || username, avatar: p.avatar || '', bio: p.bio || '' });
            }
        });

        Object.keys(messagesDatabase).forEach(room => {
            if (room.includes(sessionUser) || (userProfiles[room] && userProfiles[room].members && userProfiles[room].members.includes(sessionUser))) {
                const roomMsgs = messagesDatabase[room] || [];
                roomMsgs.forEach(msg => {
                    if (msg && msg.text && typeof msg.text === 'string' && msg.text.toLowerCase().includes(query)) {
                        const partner = msg.from === sessionUser ? msg.to : msg.from;
                        foundMessages.push({ id: msg.id, room: room, partner: partner, from: msg.from, text: msg.text, timestamp: msg.timestamp });
                    }
                });
            }
        });
        foundMessages.sort((a, b) => b.timestamp - a.timestamp);
        socket.emit('global_search_results', { query: data.query, users: foundUsers, messages: foundMessages });
    });

    socket.on('update_profile', (data) => {
        if (!sessionUser || !data) return;
        if (!userProfiles[sessionUser]) userProfiles[sessionUser] = { chatList: [] };
        
        const profileData = data.data || data;
        userProfiles[sessionUser].displayName = profileData.displayName || sessionUser;
        userProfiles[sessionUser].bio = profileData.bio || '';
        userProfiles[sessionUser].avatar = profileData.avatar || ''; 
        userProfiles[sessionUser].banner = profileData.banner || ''; 
        userProfiles[sessionUser].glowColor = profileData.glowColor || 'blue'; 
        
        saveDatabase();
        io.emit('profile_broadcast', { username: sessionUser, data: userProfiles[sessionUser] });
    });

    socket.on('join_room', (data) => {
        if (!data || !data.room) return;
        socket.join(data.room);
        const pinnedKey = data.room + '_pinned';
        if (messagesDatabase[pinnedKey] && messagesDatabase[pinnedKey].length > 0) {
            socket.emit('pin_message', { room: data.room, pinned: messagesDatabase[pinnedKey] });
        }
    });

    socket.on('request_history', (data) => {
        if (!data || !data.room) return;
        socket.emit('room_history', messagesDatabase[data.room] || []);
    });

    socket.on('chat_message', (msg) => {
        if (!msg || !msg.room || !msg.from || !msg.to) return;

        const now = Date.now();
        if (!userRateLimits[msg.from]) userRateLimits[msg.from] = [];
        userRateLimits[msg.from] = userRateLimits[msg.from].filter(t => now - t < 3000);
        if (userRateLimits[msg.from].length >= 5) return; 
        userRateLimits[msg.from].push(now);

        if (!ALLOW_VOICE_EFFECTS) {
            if (msg.voiceEffect || msg.audioEffect) {
                delete msg.voiceEffect;
                delete msg.audioEffect;
            }
            if (msg.meta) {
                delete msg.meta.voiceEffect;
                delete msg.meta.audioEffect;
            }
        }

        if (msg.scheduledTime && new Date(msg.scheduledTime).getTime() > Date.now()) {
            if (!messagesDatabase.scheduled) messagesDatabase.scheduled = [];
            messagesDatabase.scheduled.push(msg);
            saveDatabase();
            return;
        }

        if (!messagesDatabase[msg.room]) messagesDatabase[msg.room] = [];
        messagesDatabase[msg.room].push(msg);

        if (msg.disappearTime && parseInt(msg.disappearTime) > 0) {
            setTimeout(() => {
                if (messagesDatabase[msg.room]) {
                    messagesDatabase[msg.room] = messagesDatabase[msg.room].filter(m => m.id !== msg.id);
                    saveDatabase();
                    io.to(msg.room).emit('delete_message', { room: msg.room, msgId: msg.id });
                }
            }, parseInt(msg.disappearTime) * 1000);
        }

        if (msg.to.startsWith('ht.')) {
            if (!userProfiles[msg.to]) {
                userProfiles[msg.to] = { 
                    displayName: msg.groupName || msg.to, 
                    bio: msg.groupBio || '', 
                    avatar: msg.groupAvatar || '', 
                    banner: msg.groupBanner || '', 
                    glowColor: msg.groupGlow || 'blue', 
                    members: msg.members || [msg.from],
                    isGroup: true 
                };
            }
            
            if (msg.members && Array.isArray(msg.members)) userProfiles[msg.to].members = msg.members;
            if (msg.groupName) userProfiles[msg.to].displayName = msg.groupName;
            if (msg.groupBio) userProfiles[msg.to].bio = msg.groupBio;
            if (msg.groupAvatar) userProfiles[msg.to].avatar = msg.groupAvatar;
            if (msg.groupGlow) userProfiles[msg.to].glowColor = msg.groupGlow;

            const groupMembers = userProfiles[msg.to].members || [msg.from];
            
            groupMembers.forEach(user => {
                if (!userProfiles[user]) userProfiles[user] = { chatList: [], displayName: user, bio: '', avatar: '', banner: '', glowColor: 'blue', lastSeen: Date.now() };
                if (!userProfiles[user].chatList) userProfiles[user].chatList = [];
                if (!userProfiles[user].chatList.includes(msg.to)) userProfiles[user].chatList.push(msg.to);
                
                const targetSocketId = activeConnections[user];
                if (targetSocketId) io.to(targetSocketId).emit('restore_chats', userProfiles[user].chatList);
            });

            saveDatabase();
            io.emit('profile_broadcast', { username: msg.to, data: userProfiles[msg.to] });
            socket.to(msg.room).emit('chat_message', msg);
        } else {
            [msg.from, msg.to].forEach(user => {
                if (!userProfiles[user]) userProfiles[user] = { chatList: [] };
                if (!userProfiles[user].chatList) userProfiles[user].chatList = [];
                const partner = user === msg.from ? msg.to : msg.from;
                if (!userProfiles[user].chatList.includes(partner)) userProfiles[user].chatList.push(partner);
            });

            saveDatabase();

            io.emit('profile_broadcast', { username: msg.from, data: userProfiles[msg.from] });
            io.emit('profile_broadcast', { username: msg.to, data: userProfiles[msg.to] });
            
            const targetSocketId = activeConnections[msg.to];
            if (targetSocketId) {
                io.to(targetSocketId).emit('restore_chats', userProfiles[msg.to].chatList);
                io.to(targetSocketId).emit('chat_message', msg);
            }
            socket.to(msg.room).emit('chat_message', msg);
        }
    });

    socket.on('typing', (data) => { if (data && data.room) socket.to(data.room).emit('typing', data); });
    socket.on('user_activity', (data) => { if (data && data.room) socket.to(data.room).emit('user_activity', data); });

    socket.on('sync_chat_list', (data) => {
        if (sessionUser && data && data.chatList) {
            if (!userProfiles[sessionUser]) userProfiles[sessionUser] = { chatList: [] };
            userProfiles[sessionUser].chatList = data.chatList;
            saveDatabase();
        }
    });

    socket.on('mark_read', (data) => {
        if (!data || !data.room || !data.reader) return;
        if (Array.isArray(messagesDatabase[data.room])) {
            messagesDatabase[data.room].forEach(m => { if (m && m.from !== data.reader) m.status = 'read'; });
            saveDatabase();
        }
        socket.to(data.room).emit('messages_read', data);
    });

    socket.on('edit_message', (data) => {
        if (!data || !data.room || !data.msgId) return;
        if (Array.isArray(messagesDatabase[data.room])) {
            const msg = messagesDatabase[data.room].find(m => m && m.id === data.msgId);
            if (msg) { msg.text = data.newText; msg.edited = true; saveDatabase(); }
        }
        socket.to(data.room).emit('edit_message', data);
    });

    socket.on('delete_message', (data) => {
        if (!data || !data.room || !data.msgId) return;
        if (Array.isArray(messagesDatabase[data.room])) {
            messagesDatabase[data.room] = messagesDatabase[data.room].filter(m => m && m.id !== data.msgId);
            saveDatabase();
        }
        socket.to(data.room).emit('delete_message', data);
    });

    socket.on('message_reaction', (data) => {
        if (!data || !data.room || !data.msgId) return;
        if (Array.isArray(messagesDatabase[data.room])) {
            const msg = messagesDatabase[data.room].find(m => m && m.id === data.msgId);
            if (msg) { msg.reactions = data.reactions || {}; saveDatabase(); }
        }
        socket.to(data.room).emit('message_reaction', data);
    });

    socket.on('pin_message', (data) => {
        if (!data || !data.room) return;
        const pinnedKey = data.room + '_pinned';
        if (!messagesDatabase[pinnedKey]) messagesDatabase[pinnedKey] = [];

        if (data.action === 'remove') {
            const targetId = data.msgId || (data.pinData ? data.pinData.id : null) || (data.msg ? data.msg.id : null);
            if (targetId) messagesDatabase[pinnedKey] = messagesDatabase[pinnedKey].filter(p => p.id !== targetId);
        } else if (data.action === 'add') {
            const activeMsg = data.msg || data.pinData;
            if (activeMsg && !messagesDatabase[pinnedKey].some(p => p.id === activeMsg.id)) messagesDatabase[pinnedKey].push(activeMsg);
        }

        saveDatabase();
        io.to(data.room).emit('pin_message', { room: data.room, pinned: messagesDatabase[pinnedKey] });
    });

    socket.on('clear_chat_history', (data) => {
        if (!data || !data.room) return;
        if (messagesDatabase[data.room]) { messagesDatabase[data.room] = []; saveDatabase(); }
        io.to(data.room).emit('chat_history_cleared', { room: data.room });
    });

    socket.on('create_group', (data) => {
        if (!data || !data.groupId) return;
        const gId = data.groupId;
        userProfiles[gId] = {
            displayName: data.displayName || data.name || gId,
            bio: data.bio || data.description || '',
            avatar: data.avatar || '',
            banner: data.banner || '',
            glowColor: data.glowColor || 'blue',
            members: data.members || [sessionUser],
            isGroup: true
        };
        userProfiles[gId].members.forEach(member => {
            if (!userProfiles[member]) userProfiles[member] = { chatList: [] };
            if (!userProfiles[member].chatList) userProfiles[member].chatList = [];
            if (!userProfiles[member].chatList.includes(gId)) userProfiles[member].chatList.push(gId);
            const memberSocket = activeConnections[member];
            if (memberSocket) io.to(memberSocket).emit('restore_chats', userProfiles[member].chatList);
        });
        saveDatabase();
        io.emit('profile_broadcast', { username: gId, data: userProfiles[gId] });
    });

    socket.on('disconnect', () => {
        if (sessionUser) {
            delete activeConnections[sessionUser];
            if (userProfiles[sessionUser]) {
                userProfiles[sessionUser].lastSeen = Date.now(); 
                saveDatabase();
                io.emit('profile_broadcast', { username: sessionUser, data: { lastSeen: userProfiles[sessionUser].lastSeen } });
            }
            io.emit('online_list', Object.keys(activeConnections));
        }
    });
});

server.listen(PORT, () => console.log(`[OK] iChatter запущен на порту: ${PORT}`));
