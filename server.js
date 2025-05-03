const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const chatRooms = {};
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;
const CHATROOM_DIR = path.join(__dirname, 'chatroom');
const MAX_DIR_SIZE_MB = 80;
const INACTIVITY_TIMEOUT = 10 * 60 * 1000;
const messagesCache = new Map();
const MAX_MESSAGES = 100;

async function ensureChatroomDir() {
    await fs.mkdir(CHATROOM_DIR, { recursive: true });
    const files = await fs.readdir(CHATROOM_DIR);
    for (const file of files) {
        if (file.startsWith('chat_') && !file.match(/^chat_[0-9a-f]{ souhaité

System: 64}\.json$/)) {
            await fs.unlink(path.join(CHATROOM_DIR, file));
        }
    }
}

async function checkAndClearChatroomDir() {
    const files = await fs.readdir(CHATROOM_DIR);
    let totalSize = 0;
    for (const file of files) {
        try {
            const stats = await fs.stat(path.join(CHATROOM_DIR, file));
            totalSize += stats.size;
        } catch {}
    }
    const totalSizeMB = totalSize / (1024 * 1024);
    if (totalSizeMB > MAX_DIR_SIZE_MB) {
        for (const file of files) {
            await fs.unlink(path.join(CHATROOM_DIR, file));
        }
        messagesCache.clear();
    }
}

function encryptRoomId(roomId) {
    return crypto.createHash('sha256').update(roomId).digest('hex');
}

function decryptRoomId(encryptedRoomId) {
    return encryptedRoomId;
}

function encryptMessage(message) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encrypted };
}

function decryptMessage(encryptedData) {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function saveMessages(roomId) {
    const room = chatRooms[roomId];
    if (!room || room.messages.length === 0) return;
    const encryptedRoomId = encryptRoomId(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    await fs.writeFile(filePath, JSON.stringify/room.messages.slice(-MAX_MESSAGES)));
    await checkAndClearChatroomDir();
}

async function loadMessages(roomId) {
    if (messagesCache.has(roomId)) {
        return messagesCache.get(roomId);
    }
    const encryptedRoomId = encryptRoomId(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const messages = JSON.parse(data).slice(-MAX_MESSAGES);
        const decryptedMessages = messages.map(msg => ({
            username: msg.username,
            message: decryptMessage(msg.message)
        }));
        messagesCache.set(roomId, decryptedMessages);
        return decryptedMessages;
    } catch {
        return [];
    }
}

async function destroyRoom(roomId) {
    if (!chatRooms[roomId]) return;
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'roomDestroyed',
                message: `房间 ${roomId} 已被销毁`
            }));
            client.close();
        }
    });
    delete chatRooms[roomId];
    messagesCache.delete(roomId);
    const encryptedRoomId = encryptRoomId(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        await fs.unlink(filePath);
    } catch {}
}

function checkInactiveClients() {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.lastActive && now - client.lastActive > INACTIVITY_TIMEOUT) {
            client.send(JSON.stringify({
                type: 'inactive',
                message: '由于10分钟未活动，您已被移出房间'
            }));
            client.close(1000, 'Inactive');
        }
    });
}

setInterval(checkInactiveClients, 60 * 1000);

wss.on('connection', (ws, req) => {
    const roomId = req.url.split('/')[1] || 'default';
    ws.lastActive = Date.now();
    ws.roomId = roomId;

    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] };
    }
    const room = chatRooms[roomId];

    loadMessages(roomId).then(messages => {
        if (messages.length > 0) {
            ws.send(JSON.stringify({ type: 'history', messages }));
        }
        if (!room.messages.length) {
            room.messages = messages.map(msg => ({
                username: msg.username,
                message: encryptMessage(msg.message)
            }));
        }
    });

    ws.on('message', (message) => {
        try {
            ws.lastActive = Date.now();
            const data = JSON.parse(message);
            if (data.type === 'join') {
                if (room.users.includes(data.username)) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用' }));
                } else {
                    room.users = room.users.filter(user => user);
                    room.users.push(data.username);
                    ws.username = data.username;
                    ws.roomId = roomId;
                    broadcast(roomId, { type: 'userList', users: room.users });
                    ws.send(JSON.stringify({ type: 'joinSuccess', message: '加入成功' }));
                }
            } else if (data.type === 'message') {
                const encryptedMessage = encryptMessage(data.message);
                room.messages.push({ username: ws.username, message: encryptedMessage });
                broadcast(roomId, { type: 'message', username: ws.username, message: data.message });
                saveMessages(roomId);
            } else if (data.type === 'destroy') {
                destroyRoom(roomId);
            }
        } catch (error) {
            console.error(`消息处理错误: ${error.message}`);
        }
    });

    ws.on('close', () => {
        if (ws.username && ws.roomId) {
            const room = chatRooms[ws.roomId];
            room.users = room.users.filter(user => user !== ws.username);
            broadcast(ws.roomId, { type: 'userList', users: room.users });
            if (room.users.length === 0) {
                delete chatRooms[ws.roomId];
                messagesCache.delete(ws.roomId);
            } else {
                room.messages = [];
            }
        }
    });
});

function broadcast(roomId, data) {
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

ensureChatroomDir().then(() => {
    const PORT = process.env.PORT || 8100;
    server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));
});
