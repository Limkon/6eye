let ws;
let username = '';
let joined = false;
let roomId = '';

async function generateRoomId(password) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}

function connect(roomId) {
    ws =YPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

process.on('uncaughtException', (error) => {
    console.error('未捕获异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理拒绝:', promise, '原因:', reason);
});

function encryptMessage(message) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encrypted: encrypted };
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
        try {
            await fs.writeFile(`chat_${roomId}.json`, JSON.stringify(room.messages));
            console.log(`保存消息成功: 房间 ${roomId}`);
        } catch (error) {
            console.error(`保存消息失败: 房间 ${roomId}, 错误:`, error);
        }
    }
}

async function loadMessages(roomId) {
    try {
        const data = await fs.readFile(`chat_${roomId}.json`, 'utf8');
        return JSON.parse(data);
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
        try {
            await fs.unlink(`chat_${roomId}.json`);
            console.log(`删除聊天记录成功: 房间 ${roomId}`);
        } catch (error) {
            console.log(`无聊天记录可删除: 房间 ${roomId}`);
        }
        console.log(`房间 ${roomId} 已销毁`);
    }
}

wss.on('connection', (ws, req) => {
    const roomId = req.url.split('/')[1] || 'default';
    console.log(`新连接至房间: ${roomId}`);

    if (!chatRooms[roomId]) {
        chatRooms[roomId] = {
            users: [],
            messages: []
        };
        loadMessages(roomId).then(messages => {
            chatRooms[roomId].messages = messages;
            messages.forEach(msg => {
                try {
                    const decryptedMessage = decryptMessage(msg.message);
                    ws.send(JSON.stringify({
                        type: 'message',
                        username: msg.username,
                        message: decryptedMessage
                    }));
                } catch (error) {
                    console.error(`解密消息失败: 房间 ${roomId}, 错误:`, error);
                }
            });
        });
    }
    const room = chatRooms[roomId];

    ws.on('message', (message) => {
        try {
            console.log(`收到消息事件: 房间 ${roomId}`);
            const data = JSON.parse(message);
            if (data.type === 'join') {
                if (room.users.includes(data.username)) {
                    console.log(`错误: 用户名 ${data.username} 在房间 ${roomId} 中已被占用`);
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用' }));
                } else {
                    room.users = room.users.filter(user => user !== null);
                    room.users.push(data.username);
                    ws.username = data.username;
                    ws.roomId = roomId;
                    console.log(`用户 ${data.username} 加入房间 ${roomId}, 当前用户列表: ${room.users}`);
                    broadcast(roomId, { type: 'userList', users: room.users });
                    console.log(`发送 joinSuccess 给 ${data.username}`);
                    ws.send(JSON.stringify({ type: 'joinSuccess', message: '加入成功' }));
                }
            } else if (data.type === 'message') {
                const encryptedMessage = encryptMessage(data.message);
                room.messages.push({ username: ws.username, message: encryptedMessage });
                console.log(`来自 ${ws.username} 在房间 ${roomId} 的消息事件`);
                broadcast(roomId, { type: 'message', username: ws.username, message: data.message });
                saveMessages(roomId);
            } else if (data.type === 'destroy') {
                destroyRoom(roomId);
            }
        } catch (error) {
            console.error(`消息处理错误: 房间 ${roomId}, 错误:`, error.message);
        }
    });

    ws.on('close', () => {
        console.log(`用户 ${ws.username} 在房间 ${ws.roomId} 的连接关闭`);
        if (ws.username && ws.roomId) {
            const room = chatRooms[ws.roomId];
            room.users = room.users.filter(user => user !== ws.username && user !== null);
            console.log(`用户 ${ws.username} 离开，更新用户列表: ${room.users}`);
            broadcast(ws.roomId, { type: 'userList', users: room.users });
            if (room.users.length === 0) {
                delete chatRooms[ws.roomId];
                console.log(`房间 ${ws.roomId} 已销毁（无用户）`);
            }
        }
    });
});

function broadcast(roomId, data) {
    console.log(`广播至房间 ${roomId}: 类型 ${data.type}`);
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

const PORT = process.env.PORT || 8100;
server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));
