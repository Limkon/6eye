const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use((req, res, next) => {
    res.removeHeader('Permissions-Policy');
    next();
});

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

process.on('uncaughtException', (error) => {
    console.error('未捕获异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理拒绝:', promise, '原因:', reason);
});

async function ensureChatroomDir() {
    try {
        await fs.mkdir(CHATROOM_DIR, { recursive: true });
        console.log(`chatroom 目录已确认: ${CHATROOM_DIR}`);
    } catch (error) {
        console.error(`创建 chatroom 目录失败: ${error.message}`);
    }
}

async function checkAndClearChatroomDir() {
    try {
        const files = await fs.readdir(CHATROOM_DIR);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(CHATROOM_DIR, file);
            const stats = await fs.stat(filePath);
            totalSize += stats.size;
        }
        const totalSizeMB = totalSize / (1024 * 1024);
        console.log(`chatroom 目录大小: ${totalSizeMB.toFixed(2)} MB`);
        if (totalSizeMB > MAX_DIR_SIZE_MB) {
            console.log('chatroom 目录超过 80MB，正在清空...');
            for (const file of files) {
                const filePath = path.join(CHATROOM_DIR, file);
                await fs.unlink(filePath);
                console.log(`删除文件: ${filePath}`);
            }
            console.log('chatroom 目录已清空');
            messagesCache.clear();
        }
    } catch (error) {
        console.error(`检查或清空 chatroom 目录失败: ${error.message}`);
    }
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
    if (room && room.messages.length > 0) {
        const filePath = path.join(CHATROOM_DIR, `chat_${roomId}.json`);
        try {
            await fs.writeFile(filePath, JSON.stringify(room.messages));
            console.log(`保存消息成功: 房间 ${roomId}`);
            await checkAndClearChatroomDir();
        } catch (error) {
            console.error(`保存消息失败: 房间 ${roomId}, 错误:`, error);
        }
    }
}

async function loadMessages(roomId) {
    if (messagesCache.has(roomId)) {
        console.log(`从缓存加载消息: 房间 ${roomId}`);
        return messagesCache.get(roomId);
    }

    const filePath = path.join(CHATROOM_DIR, `chat_${roomId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const messages = JSON.parse(data);
        const limitedMessages = messages.slice(-100);
        const decryptedMessages = limitedMessages.map(msg => ({
            username: msg.username,
            message: decryptMessage(msg.message)
        }));
        messagesCache.set(roomId, decryptedMessages);
        console.log(`从文件加载消息: 房间 ${roomId}, 消息数: ${decryptedMessages.length}`);
        return decryptedMessages;
    } catch (error) {
        console.log(`无历史消息: 房间 ${roomId}`);
        return [];
    }
}

async function destroyRoom(roomId) {
    if (chatRooms[roomId]) {
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
        const filePath = path.join(CHATROOM_DIR, `chat_${roomId}.json`);
        try {
            await fs.unlink(filePath);
            console.log(`删除聊天记录成功: 房间 ${roomId}`);
        } catch (error) {
            console.log(`无聊天记录可删除: 房间 ${roomId}`);
        }
        console.log(`房间 ${roomId} 已销毁`);
    }
}

function checkInactiveClients() {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.lastActive) {
            if (now - client.lastActive > INACTIVITY_TIMEOUT) {
                console.log(`用户 ${client.username} 在房间 ${client.roomId} 超过10分钟未活动，断开连接`);
                if (client.username && client.roomId && chatRooms[client.roomId]) {
                    chatRooms[client.roomId].users = chatRooms[client.roomId].users.filter(user => user !== client.username && user !== null);
                    broadcast(client.roomId, { type: 'userList', users: chatRooms[client.roomId].users });
                }
                client.send(JSON.stringify({
                    type: 'inactive',
                    message: '由于10分钟未活动，您已被移出房间'
                }));
                client.close(1000, 'Inactive');
            }
        }
    });
}

setInterval(checkInactiveClients, 60 * 1000);

wss.on('connection', (ws, req) => {
    const roomId = req.url.split('/')[1] || 'default';
    console.log(`新连接至房间: ${roomId}`);

    ws.lastActive = Date.now();
    ws.roomId = roomId;

    if (!chatRooms[roomId]) {
        chatRooms[roomId] = {
            users: [],
            messages: []
        };
    }
    const room = chatRooms[roomId];

    loadMessages(roomId).then(messages => {
        room.messages = messages.map(msg => ({
            username: msg.username,
            message: encryptMessage(msg.message)
        }));
        if (messages.length > 0) {
            ws.send(JSON.stringify({
                type: 'history',
                messages
            }));
            console.log(`发送历史消息给新连接: 房间 ${roomId}, 消息数: ${messages.length}`);
        }
    });

    ws.on('message', (message) => {
        try {
            console.log(`收到消息事件: 房间 ${roomId}`);
            ws.lastActive = Date.now();
            const data = JSON.parse(message);
            if (data.type === 'join') {
                console.log(`尝试加入: 用户 ${data.username}, 房间 ${roomId}, 当前用户列表: ${room.users}`);
                if (room.users.includes(data.username)) {
                    console.log(`错误: 用户名 ${data.username} 在房间 ${roomId} 中已被占用`);
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用' }));
                } else {
                    room.users = room.users.filter(user => user !== null);
                    room.users.push(data.username);
                    ws.username = data.username;
                    ws.roomId = roomId;
                    console.log(`用户 ${data.username} 加入房间 ${roomId}, 更新用户列表: ${room.users}`);
                    ws.send(JSON.stringify({ type: 'joinSuccess', message: '加入成功' }));
                    console.log(`发送 joinSuccess 给 ${data.username}`);
                    loadMessages(roomId).then(messages => {
                        if (messages.length > 0) {
                            ws.send(JSON.stringify({
                                type: 'history',
                                messages
                            }));
                            console.log(`发送历史消息给 ${data.username}: 房间 ${roomId}, 消息数: ${messages.length}`);
                        }
                    });
                    broadcast(roomId, { type: 'userList', users: room.users });
                    console.log(`广播用户列表: 房间 ${roomId}, 用户: ${room.users}`);
                }
            } else if (data.type === 'message') {
                const encryptedMessage = encryptMessage(data.message);
                room.messages.push({ username: ws.username, message: encryptedMessage });
                console.log(`来自 ${ws.username} 在房间 ${roomId} 的消息事件`);
                broadcast(roomId, { type: 'message', username: ws.username, message: data.message });
                saveMessages(roomId);
            } else if (data.type === 'getHistory') {
                console.log(`收到 getHistory 请求: 房间 ${roomId}`);
                loadMessages(roomId).then(messages => {
                    ws.send(JSON.stringify({
                        type: 'history',
                        messages
                    }));
                    console.log(`发送历史消息响应 getHistory: 房间 ${roomId}, 消息数: ${messages.length}`);
                });
            } else if (data.type === 'getUserList') {
                console.log(`收到 getUserList 请求: 房间 ${roomId}`);
                ws.send(JSON.stringify({
                    type: 'userList',
                    users: room.users.filter(user => user !== null)
                }));
                console.log(`发送用户列表响应 getUserList: 房间 ${roomId}, 用户: ${room.users}`);
            } else if (data.type === 'destroy') {
                destroyRoom(roomId);
            }
        } catch (error) {
            console.error(`消息处理错误: 房间 ${roomId}, 错误:`, error.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`用户 ${ws.username} 在房间 ${ws.roomId} 的连接关闭，代码: ${code}, 原因: ${reason}`);
        if (ws.username && ws.roomId) {
            const room = chatRooms[ws.roomId];
            if (room) {
                room.users = room.users.filter(user => user !== ws.username && user !== null);
                console.log(`用户 ${ws.username} 离开，更新用户列表: ${room.users}`);
                broadcast(ws.roomId, { type: 'userList', users: room.users });
                if (room.users.length === 0) {
                    delete chatRooms[ws.roomId];
                    console.log(`房间 ${ws.roomId} 已销毁（无用户），内存记录已清除`);
                }
            }
        }
    });
});

function broadcast(roomId, data) {
    console.log(`广播至房间 ${roomId}: 类型 ${data.type}, 数据:`, data);
    if (data && typeof data === 'object') {
        wss.clients.forEach(client => {
            if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    } else {
        console.error('无效广播数据');
    }
}

ensureChatroomDir().then(() => {
    const PORT = process.env.PORT || 8100;
    server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));
});
