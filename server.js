const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const { URL } = require('url');

// --- 配置常量 ---
const KEY_FILE_PATH = path.join(__dirname, '.encryption_key');
let ENCRYPTION_KEY;

const IV_LENGTH = 16;
const CHATROOM_DIR = path.join(__dirname, 'chatroom');
const MAX_DIR_SIZE_MB = 80;
const INACTIVITY_TIMEOUT = 10 * 60 * 1000;
const messagesCache = new Map();
const MAX_MESSAGES_PER_ROOM_FILE = 100;
const MAX_MESSAGES_IN_MEMORY = 100;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const chatRooms = {};

async function loadOrGenerateEncryptionKey() {
    const envKeyHex = process.env.CHAT_ENCRYPTION_KEY;
    if (envKeyHex) {
        if (envKeyHex.length === 64 && /^[0-9a-fA-F]+$/.test(envKeyHex)) {
            console.log("已从 CHAT_ENCRYPTION_KEY 环境变量加载加密密钥。");
            return Buffer.from(envKeyHex, 'hex');
        } else {
            console.warn("警告: CHAT_ENCRYPTION_KEY 环境变量格式无效，将尝试从文件加载或生成新密钥。");
        }
    }
    try {
        const fileKeyHex = await fs.readFile(KEY_FILE_PATH, 'utf8');
        if (fileKeyHex && fileKeyHex.trim().length === 64 && /^[0-9a-fA-F]+$/.test(fileKeyHex.trim())) {
            console.log(`已从文件 ${KEY_FILE_PATH} 加载加密密钥。`);
            return Buffer.from(fileKeyHex.trim(), 'hex');
        } else {
            console.warn(`警告: 文件 ${KEY_FILE_PATH} 中的密钥无效或格式不正确。将生成新密钥。`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`警告: 读取密钥文件 ${KEY_FILE_PATH} 失败 (错误: ${error.message})。将生成新密钥。`);
        } else {
            console.log(`信息: 密钥文件 ${KEY_FILE_PATH} 未找到。将生成新密钥。`);
        }
    }
    console.log(`正在生成新的加密密钥...`);
    const newKeyBuffer = crypto.randomBytes(32);
    const newKeyHex = newKeyBuffer.toString('hex');
    try {
        await fs.writeFile(KEY_FILE_PATH, newKeyHex, { encoding: 'utf8', mode: 0o600 });
        console.log(`新的加密密钥已生成并保存到 ${KEY_FILE_PATH}。`);
        console.warn(`重要提示: 请务必备份 ${KEY_FILE_PATH} 文件或密钥字符串。`);
        return newKeyBuffer;
    } catch (writeError) {
        console.error(`致命错误: 无法将新的加密密钥保存到 ${KEY_FILE_PATH}: ${writeError.message}`);
        process.exit(1);
    }
}

async function ensureChatroomDir() {
    try {
        await fs.mkdir(CHATROOM_DIR, { recursive: true });
        const files = await fs.readdir(CHATROOM_DIR);
        const fileRegex = new RegExp('^chat_[0-9a-f]{64}\\.json$');
        for (const file of files) {
            if (file.startsWith('chat_') && !file.match(fileRegex)) {
                try {
                    console.log(`删除无效的聊天文件: ${file}`);
                    await fs.unlink(path.join(CHATROOM_DIR, file));
                } catch (unlinkError) {
                    console.error(`删除文件 ${file} 失败: ${unlinkError.message}`);
                }
            }
        }
    } catch (error) {
        console.error(`初始化聊天室目录失败: ${error.message}`);
        throw error;
    }
}

async function checkAndClearChatroomDir() {
    // ---- DEBUGGING: Temporarily disable clearing to isolate save issue ----
    const TEMPORARILY_DISABLE_CLEARING = true; // <--- SET TO true FOR TESTING THIS SPECIFIC SAVE ISSUE
    if (TEMPORARILY_DISABLE_CLEARING) {
        console.log(`[${new Date().toISOString()}] DEBUG: checkAndClearChatroomDir: 清理功能已临时禁用。`);
        return;
    }
    // --------------------------------------------------------------------
    try {
        const files = await fs.readdir(CHATROOM_DIR);
        let totalSize = 0;
        for (const file of files) {
            try {
                const stats = await fs.stat(path.join(CHATROOM_DIR, file));
                totalSize += stats.size;
            } catch (statError) {
                // console.error(`获取文件 ${file} 大小失败: ${statError.message}`); // Potentially too noisy
            }
        }
        const totalSizeMB = totalSize / (1024 * 1024);
        if (totalSizeMB > MAX_DIR_SIZE_MB) {
            console.warn(`[${new Date().toISOString()}] DEBUG: checkAndClearChatroomDir: 目录大小 (${totalSizeMB.toFixed(2)}MB) 超限 (${MAX_DIR_SIZE_MB}MB)，将清空。`);
            for (const file of files) {
                try {
                    console.log(`[${new Date().toISOString()}] DEBUG: checkAndClearChatroomDir: Unlinking file '${file}'`);
                    await fs.unlink(path.join(CHATROOM_DIR, file));
                } catch (unlinkError) {
                    console.error(`清空目录时删除文件 ${file} 失败: ${unlinkError.message}`);
                }
            }
            messagesCache.clear();
            for (const roomId_iterator in chatRooms) {
                if (chatRooms[roomId_iterator]) {
                    console.log(`[${new Date().toISOString()}] DEBUG: checkAndClearChatroomDir: Clearing in-memory messages for room '${roomId_iterator}'`);
                    chatRooms[roomId_iterator].messages = [];
                }
            }
            console.log("聊天室目录已清空。");
        }
    } catch (error) {
        console.error(`检查并清理聊天室目录失败: ${error.message}`);
    }
}

function encryptRoomIdForFilename(roomId) {
    return crypto.createHash('sha256').update(roomId).digest('hex');
}

function encryptMessage(message) {
    if (!ENCRYPTION_KEY) {
        console.error("致命错误: 加密密钥未初始化。");
        return null;
    }
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { iv: iv.toString('hex'), encrypted };
    } catch (error) {
        console.error(`消息加密失败: ${error.message}`);
        return null;
    }
}

function decryptMessage(encryptedData) {
    if (!ENCRYPTION_KEY) {
        console.error("致命错误: 解密密钥未初始化。");
        return null;
    }
    if (!encryptedData || !encryptedData.iv || !encryptedData.encrypted) {
        console.error("解密数据无效。");
        return null;
    }
    try {
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error(`消息解密失败: ${error.message}. 可能原因：密钥不匹配或数据损坏。`);
        return null;
    }
}

async function saveMessages(roomId) {
    const room = chatRooms[roomId];
    console.log(`[${new Date().toISOString()}] DEBUG: saveMessages CALLED for room '${roomId}'. In-memory messages count: ${room ? room.messages.length : 'ROOM IS UNDEFINED'}`);
    if (!room || room.messages.length === 0) {
        console.log(`[${new Date().toISOString()}] DEBUG: saveMessages for room '${roomId}' RETURNED EARLY (room undefined or no messages).`);
        return;
    }

    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    console.log(`[${new Date().toISOString()}] DEBUG: saveMessages for room '${roomId}' will write to file: '${filePath}'`);
    try {
        const messagesToSave = room.messages.slice(-MAX_MESSAGES_PER_ROOM_FILE);
        console.log(`[${new Date().toISOString()}] DEBUG: saveMessages for room '${roomId}', messagesToSave count: ${messagesToSave.length}.`);
        if (messagesToSave.length > 0) {
            const lastMsgToSave = messagesToSave[messagesToSave.length - 1];
            // Log something identifiable from the last message to confirm it's the new one
            console.log(`[${new Date().toISOString()}] DEBUG: Last message in messagesToSave (user: ${lastMsgToSave.username}, timestamp: ${lastMsgToSave.timestamp})`);
            // For very detailed debugging, you could log the entire messagesToSave, but it might be large:
            // console.log(`[${new Date().toISOString()}] DEBUG: messagesToSave content for room '${roomId}': ${JSON.stringify(messagesToSave)}`);
        } else {
            console.log(`[${new Date().toISOString()}] DEBUG: saveMessages for room '${roomId}', messagesToSave is EMPTY.`);
        }
        
        const contentToWrite = JSON.stringify(messagesToSave);
        console.log(`[${new Date().toISOString()}] DEBUG: Writing to '${filePath}', content length: ${contentToWrite.length}`);
        await fs.writeFile(filePath, contentToWrite);
        console.log(`[${new Date().toISOString()}] DEBUG: Successfully WROTE messages for room '${roomId}' to '${filePath}'`);
        
        await checkAndClearChatroomDir();
    } catch (error) {
        console.error(`[${new Date().toISOString()}] DEBUG: 保存房间 '${roomId}' 的消息失败: ${error.message}`, error.stack);
    }
}

async function loadDecryptedMessagesForClient(roomId) {
    if (messagesCache.has(roomId)) {
        return messagesCache.get(roomId);
    }
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const encryptedMessagesFromFile = JSON.parse(data);
        const decryptedMessages = encryptedMessagesFromFile.map(msgObj => {
            const decryptedContent = decryptMessage(msgObj.message);
            if (decryptedContent !== null) {
                return { username: msgObj.username, message: decryptedContent, timestamp: msgObj.timestamp };
            }
            return null;
        }).filter(msg => msg !== null);
        messagesCache.set(roomId, decryptedMessages);
        return decryptedMessages;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[${new Date().toISOString()}] DEBUG: loadDecryptedMessagesForClient: 加载房间 ${roomId} 的消息失败: ${error.message}`);
        } else {
            // console.log(`[${new Date().toISOString()}] DEBUG: loadDecryptedMessagesForClient: 文件未找到用于房间 ${roomId}`);
        }
        return [];
    }
}

async function destroyRoom(roomId) {
    // ... (destroyRoom logic - unchanged)
    if (!chatRooms[roomId]) return;
    console.log(`正在销毁房间: ${roomId}`);
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'roomDestroyed',
                message: `房间 "${roomId}" 已被管理员销毁。`
            }));
            client.close(1000, 'Room destroyed');
        }
    });
    delete chatRooms[roomId];
    messagesCache.delete(roomId);
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        await fs.unlink(filePath);
        console.log(`已删除房间 ${roomId} 的聊天记录文件: ${filePath}`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`删除房间 ${roomId} 的聊天记录文件 ${filePath} 失败: ${error.message}`);
        }
    }
}

function checkInactiveClients() {
    // ... (checkInactiveClients logic - unchanged)
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.lastActive && (now - client.lastActive > INACTIVITY_TIMEOUT)) {
            console.log(`客户端 ${client.username || '未知用户'} (房间: ${client.roomId}) 由于不活动被断开。`);
            client.send(JSON.stringify({
                type: 'inactive',
                message: '由于长时间未活动（超过10分钟），您已被移出房间。'
            }));
            client.close(1000, 'Inactive due to timeout');
            if (client.username && client.roomId && chatRooms[client.roomId]) {
                const room = chatRooms[client.roomId];
                room.users = room.users.filter(user => user !== client.username);
                if (room.users.length > 0) {
                    broadcast(client.roomId, { type: 'userList', users: room.users });
                }
            }
        }
    });
}
setInterval(checkInactiveClients, 60 * 1000);

wss.on('connection', async (ws, req) => {
    let roomIdFromUrl;
    try {
        const parsedUrl = new URL(req.url, `ws://${req.headers.host}`);
        roomIdFromUrl = parsedUrl.pathname.split('/')[1] || 'default';
        roomIdFromUrl = decodeURIComponent(roomIdFromUrl);
    } catch (urlParseError) {
        console.error("解析 WebSocket URL 失败:", urlParseError);
        ws.close(1011, "无效的房间ID格式");
        return;
    }

    const roomId = roomIdFromUrl;
    ws.roomId = roomId;
    ws.lastActive = Date.now();
    ws.username = null;

    console.log(`[${new Date().toISOString()}] DEBUG: 新客户端连接到房间: '${roomId}'`);

    let createdNewRoomInMemory = false;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] };
        createdNewRoomInMemory = true;
        console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' 在内存中新创建。`);
    } else {
        console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' 已存在于内存中。当前内存消息数: ${chatRooms[roomId].messages.length}`);
    }

    const room = chatRooms[roomId];

    if (createdNewRoomInMemory || room.messages.length === 0) {
        const encryptedRoomId = encryptRoomIdForFilename(roomId);
        const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
        console.log(`[${new Date().toISOString()}] DEBUG: Room '${roomId}', createdNew: ${createdNewRoomInMemory}, memMsgLen: ${room.messages.length}. 尝试从文件 '${filePath}' 加载。`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const messagesFromFile = JSON.parse(data);
            if (messagesFromFile && messagesFromFile.length > 0) {
                room.messages = messagesFromFile.slice(-MAX_MESSAGES_IN_MEMORY);
                console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' 已从文件 '${filePath}' 加载/更新了 ${room.messages.length} 条加密消息到内存。`);
            } else if (createdNewRoomInMemory) {
                console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' (新内存实例) 的聊天文件 '${filePath}' 为空或解析后为空。内存消息列表初始为空。`);
            } else {
                 console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' (现有内存实例) 的内存消息和文件 '${filePath}' 均为空。无需从文件加载。`);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                if (createdNewRoomInMemory) {
                    console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' (新内存实例) 的聊天文件 '${filePath}' 未找到。内存消息列表初始为空。`);
                } else {
                    console.log(`[${new Date().toISOString()}] DEBUG: 房间 '${roomId}' (现有内存实例，消息为空) 的聊天文件 '${filePath}' 未找到。内存消息列表保持为空。`);
                }
            } else {
                console.error(`[${new Date().toISOString()}] DEBUG: 尝试从文件 '${filePath}' 为房间 '${roomId}' 加载/更新消息时发生错误: ${err.message}。房间内存消息列表未更改。`);
            }
        }
    }

    const decryptedHistory = await loadDecryptedMessagesForClient(roomId);
    if (decryptedHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: decryptedHistory }));
    } else {
        console.log(`[${new Date().toISOString()}] DEBUG: No history sent to client for room '${roomId}'. Decrypted history length: 0.`);
    }

    ws.on('message', (messageData) => {
        ws.lastActive = Date.now();
        let data;
        try {
            data = JSON.parse(messageData);
        } catch (error) {
            console.error(`解析消息失败: ${error.message}`);
            ws.send(JSON.stringify({ type: 'error', message: '无效的消息格式。' }));
            return;
        }
        try {
            const currentRoomForMessage = chatRooms[ws.roomId]; // Use ws.roomId for safety
            if (!currentRoomForMessage) {
                console.error(`[${new Date().toISOString()}] DEBUG: CRITICAL ERROR - Room object for '${ws.roomId}' not found in chatRooms during message handling.`);
                ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已销毁。' }));
                return;
            }

            if (data.type === 'join') {
                // ... (join logic - unchanged, uses currentRoomForMessage)
                if (typeof data.username !== 'string' || data.username.trim() === '' || data.username.length > 30) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '无效的用户名。' }));
                    return;
                }
                const cleanUsername = data.username.trim();
                if (currentRoomForMessage.users.includes(cleanUsername)) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用。' }));
                } else {
                    ws.username = cleanUsername;
                    currentRoomForMessage.users = currentRoomForMessage.users.filter(user => user); 
                    currentRoomForMessage.users.push(cleanUsername);
                    broadcast(ws.roomId, { type: 'userList', users: currentRoomForMessage.users });
                    ws.send(JSON.stringify({ type: 'joinSuccess', username: cleanUsername, message: '加入成功！' }));
                    console.log(`[${new Date().toISOString()}] DEBUG: 用户 ${cleanUsername} 加入房间 ${ws.roomId}`);
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${cleanUsername} 加入了房间。` });
                }

            } else if (data.type === 'message') {
                if (!ws.username) {
                    ws.send(JSON.stringify({ type: 'error', message: '发送消息前请先加入房间。' }));
                    return;
                }
                if (typeof data.message !== 'string' || data.message.trim() === '') {
                    ws.send(JSON.stringify({ type: 'error', message: '消息内容不能为空。' }));
                    return;
                }
                if (data.message.length > 1000) {
                    ws.send(JSON.stringify({ type: 'error', message: '消息过长。' }));
                    return;
                }
                console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', User '${ws.username}', Received message content: "${data.message.substring(0,30)}..."`);
                const encryptedMessage = encryptMessage(data.message);

                if (encryptedMessage) {
                    const messageObject = { username: ws.username, message: encryptedMessage, timestamp: Date.now() };
                    
                    console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', User '${ws.username}', Message (ts: ${messageObject.timestamp}) to be pushed. currentRoomForMessage.messages length BEFORE push: ${currentRoomForMessage.messages.length}`);
                    
                    currentRoomForMessage.messages.push(messageObject);
                    
                    console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', Message (ts: ${messageObject.timestamp}) pushed. currentRoomForMessage.messages length AFTER push: ${currentRoomForMessage.messages.length}`);
                    if (currentRoomForMessage.messages.length > 0) {
                        const lastMsgInMemory = currentRoomForMessage.messages[currentRoomForMessage.messages.length - 1];
                        console.log(`[${new Date().toISOString()}] DEBUG: Last message in memory after push (user: ${lastMsgInMemory.username}, ts: ${lastMsgInMemory.timestamp})`);
                    }


                    if (currentRoomForMessage.messages.length > MAX_MESSAGES_IN_MEMORY) {
                        console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', messages length ${currentRoomForMessage.messages.length} > ${MAX_MESSAGES_IN_MEMORY}, shifting oldest.`);
                        currentRoomForMessage.messages.shift();
                    }
                    broadcast(ws.roomId, { type: 'message', username: ws.username, message: data.message, timestamp: messageObject.timestamp });
                    
                    console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', Calling saveMessages for message (ts: ${messageObject.timestamp}).`);
                    saveMessages(ws.roomId);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: '消息加密失败，无法发送。' }));
                    console.log(`[${new Date().toISOString()}] DEBUG: Room '${ws.roomId}', User '${ws.username}', Encryption failed for message content: "${data.message.substring(0,30)}..."`);
                }
            } else if (data.type === 'destroy') {
                // ... (destroy logic - unchanged)
                console.log(`收到来自用户 ${ws.username || '未知'} 的销毁房间 ${ws.roomId} 请求。`);
                destroyRoom(ws.roomId);
            }
        } catch (handlerError) {
            console.error(`[${new Date().toISOString()}] DEBUG: 消息处理逻辑错误 (房间: ${ws.roomId}, 用户: ${ws.username}): ${handlerError.message}`, handlerError.stack);
            ws.send(JSON.stringify({ type: 'error', message: '服务器内部错误。' }));
        }
    });

    ws.on('close', (code, reason) => {
        // ... (close logic - unchanged)
        const reasonString = reason ? reason.toString() : '无';
        console.log(`[${new Date().toISOString()}] DEBUG: 客户端断开连接 (房间: ${ws.roomId}, 用户: ${ws.username || '未加入'}, code: ${code}, reason: ${reasonString})`);
        if (ws.username && ws.roomId) { 
            const currentRoomOnClose = chatRooms[ws.roomId];
            if (currentRoomOnClose) {
                currentRoomOnClose.users = currentRoomOnClose.users.filter(user => user !== ws.username);
                if (currentRoomOnClose.users.length > 0) {
                    broadcast(ws.roomId, { type: 'userList', users: currentRoomOnClose.users });
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${ws.username} 离开了房间。` });
                } else {
                    console.log(`[${new Date().toISOString()}] DEBUG: 房间 ${ws.roomId} 现在为空。`);
                }
            }
        }
    });
    ws.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] DEBUG: WebSocket 错误 (房间: ${ws.roomId}, 用户: ${ws.username}): ${error.message}`);
    });
});

function broadcast(roomId, data) {
    // ... (broadcast logic - unchanged)
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (sendError) {
                console.error(`向客户端 ${client.username} 广播消息失败: ${sendError.message}`);
            }
        }
    });
}

async function main() {
    // ... (main logic - unchanged)
    try {
        ENCRYPTION_KEY = await loadOrGenerateEncryptionKey();
        if (!ENCRYPTION_KEY) {
            console.error("未能初始化加密密钥。服务器无法启动。");
            process.exit(1);
        }
        await ensureChatroomDir();

        const PORT = process.env.PORT || 8100;
        server.listen(PORT, () => {
            console.log(`服务器已启动，运行在 http://localhost:${PORT}`);
            console.log(`聊天室目录: ${CHATROOM_DIR}`);
        });
    } catch (error) {
        console.error("服务器启动过程中发生致命错误:", error.message);
        process.exit(1);
    }
}

main();

process.on('SIGINT', () => {
    // ... (SIGINT logic - unchanged)
    console.log("收到 SIGINT，正在关闭服务器...");
    wss.clients.forEach(client => {
        client.close(1012, "服务器正在关闭");
    });
    server.close(() => {
        console.log("服务器已关闭。");
        process.exit(0);
    });
});
