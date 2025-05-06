const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const { URL } = require('url');

// --- 配置常量 ---
const KEY_FILE_PATH = path.join(__dirname, '.encryption_key'); // 存储加密密钥的文件
let ENCRYPTION_KEY; // 将在此处加载或生成

const IV_LENGTH = 16;
const CHATROOM_DIR = path.join(__dirname, 'chatroom');
const MAX_DIR_SIZE_MB = 80; // MB
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 分钟
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

/**
 * 加载或生成加密密钥。
 * 优先顺序: 环境变量 -> 密钥文件 -> 生成新密钥并保存。
 * @returns {Promise<Buffer>} 加密密钥 Buffer
 */
async function loadOrGenerateEncryptionKey() {
    // 1. 尝试从环境变量加载
    const envKeyHex = process.env.CHAT_ENCRYPTION_KEY;
    if (envKeyHex) {
        if (envKeyHex.length === 64 && /^[0-9a-fA-F]+$/.test(envKeyHex)) {
            console.log("已从 CHAT_ENCRYPTION_KEY 环境变量加载加密密钥。");
            return Buffer.from(envKeyHex, 'hex');
        } else {
            console.warn("警告: CHAT_ENCRYPTION_KEY 环境变量格式无效 (需要64位十六进制字符串)，将尝试从文件加载或生成新密钥。");
        }
    }

    // 2. 尝试从文件加载
    try {
        const fileKeyHex = await fs.readFile(KEY_FILE_PATH, 'utf8');
        if (fileKeyHex && fileKeyHex.trim().length === 64 && /^[0-9a-fA-F]+$/.test(fileKeyHex.trim())) {
            console.log(`已从文件 ${KEY_FILE_PATH} 加载加密密钥。`);
            return Buffer.from(fileKeyHex.trim(), 'hex');
        } else {
            console.warn(`警告: 文件 ${KEY_FILE_PATH} 中的密钥无效或格式不正确。将生成新密钥。`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') { // ENOENT 表示文件不存在，这是正常的首次运行情况
            console.warn(`警告: 读取密钥文件 ${KEY_FILE_PATH} 失败 (错误: ${error.message})。将生成新密钥。`);
        } else {
            console.log(`信息: 密钥文件 ${KEY_FILE_PATH} 未找到。这是首次运行的正常情况，将生成新密钥。`);
        }
    }

    // 3. 生成新密钥并保存到文件
    console.log(`正在生成新的加密密钥...`);
    const newKeyBuffer = crypto.randomBytes(32);
    const newKeyHex = newKeyBuffer.toString('hex');
    try {
        await fs.writeFile(KEY_FILE_PATH, newKeyHex, { encoding: 'utf8', mode: 0o600 }); // 设置文件权限为仅所有者可读写
        console.log(`新的加密密钥已生成并保存到 ${KEY_FILE_PATH}。`);
        console.warn(`重要提示:`);
        console.warn(`  - 请务必备份 ${KEY_FILE_PATH} 文件，或将其中的密钥字符串记录在安全的地方。`);
        console.warn(`  - 如果此文件或密钥丢失，所有已加密的聊天记录将永久无法恢复！`);
        console.warn(`  - 强烈建议将 '.encryption_key' 添加到您的 .gitignore 文件中，以避免意外将其提交到版本控制系统。`);
        return newKeyBuffer;
    } catch (writeError) {
        console.error(`致命错误: 无法将新的加密密钥保存到 ${KEY_FILE_PATH}: ${writeError.message}`);
        console.error("由于无法持久化加密密钥，服务器无法安全启动。请检查文件系统权限。");
        console.error("您也可以尝试手动设置 CHAT_ENCRYPTION_KEY 环境变量来绕过文件写入问题。");
        process.exit(1); // 无法保存密钥则退出
    }
}


/**
 * 确保聊天室目录存在，并清理无效的聊天文件。
 */
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

/**
 * 检查聊天室目录大小，如果超过限制则清空。
 */
async function checkAndClearChatroomDir() {
    try {
        const files = await fs.readdir(CHATROOM_DIR);
        let totalSize = 0;
        for (const file of files) {
            try {
                const stats = await fs.stat(path.join(CHATROOM_DIR, file));
                totalSize += stats.size;
            } catch (statError) {
                console.error(`获取文件 ${file} 大小失败: ${statError.message}`);
            }
        }
        const totalSizeMB = totalSize / (1024 * 1024);
        if (totalSizeMB > MAX_DIR_SIZE_MB) {
            console.warn(`聊天室目录大小 (${totalSizeMB.toFixed(2)}MB) 已超过限制 (${MAX_DIR_SIZE_MB}MB)，将清空目录。`);
            for (const file of files) {
                try {
                    await fs.unlink(path.join(CHATROOM_DIR, file));
                } catch (unlinkError) {
                    console.error(`清空目录时删除文件 ${file} 失败: ${unlinkError.message}`);
                }
            }
            messagesCache.clear();
            for (const roomId_iterator in chatRooms) { // Renamed to avoid conflict in loops
                if (chatRooms[roomId_iterator]) {
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
    if (!room || room.messages.length === 0) return;
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const messagesToSave = room.messages.slice(-MAX_MESSAGES_PER_ROOM_FILE);
        await fs.writeFile(filePath, JSON.stringify(messagesToSave));
        await checkAndClearChatroomDir(); // 每次保存后检查目录大小
    } catch (error) {
        console.error(`保存房间 ${roomId} 的消息失败: ${error.message}`);
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
            console.error(`加载房间 ${roomId} 的消息 (用于客户端历史) 失败: ${error.message}`);
        }
        return []; // 文件不存在或读取失败则返回空历史
    }
}

async function destroyRoom(roomId) {
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
setInterval(checkInactiveClients, 60 * 1000); // 每分钟检查一次

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

    console.log(`新客户端连接到房间: ${roomId}`);

    let createdNewRoomInMemory = false;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] }; // 初始化房间对象，消息列表为空
        createdNewRoomInMemory = true;
    }

    const room = chatRooms[roomId];

    // 如果房间对象是刚在内存中创建的，或者房间对象已存在但其内存消息列表为空
    // 则尝试从文件加载消息以同步内存状态
    if (createdNewRoomInMemory || room.messages.length === 0) {
        const encryptedRoomId = encryptRoomIdForFilename(roomId);
        const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const messagesFromFile = JSON.parse(data);

            if (messagesFromFile && messagesFromFile.length > 0) {
                room.messages = messagesFromFile.slice(-MAX_MESSAGES_IN_MEMORY);
                console.log(`信息: 房间 ${roomId} 的内存消息列表为空或房间为新实例，已成功从文件 ${filePath} 加载/更新了 ${room.messages.length} 条加密消息到内存。`);
            } else if (createdNewRoomInMemory) {
                console.log(`信息: 房间 ${roomId} (新内存实例) 的聊天文件为空或未找到（或解析后为空）。内存消息列表初始为空。`);
            } else {
                console.log(`信息: 房间 ${roomId} (现有内存实例) 的内存消息列表和文件均为空或文件不存在。无需从文件加载。`);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                if (createdNewRoomInMemory) {
                    console.log(`信息: 房间 ${roomId} (新内存实例) 的聊天文件 ${filePath} 未找到。内存消息列表初始为空。`);
                } else {
                    console.log(`信息: 房间 ${roomId} (现有内存实例，消息为空) 的聊天文件 ${filePath} 未找到。内存消息列表保持为空。`);
                }
            } else {
                console.error(`警告: 尝试从文件 ${filePath} 为房间 ${roomId} 加载/更新消息时发生错误: ${err.message}。房间内存消息列表未更改。`);
            }
        }
    }

    const decryptedHistory = await loadDecryptedMessagesForClient(roomId);
    if (decryptedHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: decryptedHistory }));
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
            if (data.type === 'join') {
                if (typeof data.username !== 'string' || data.username.trim() === '' || data.username.length > 30) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '无效的用户名。' }));
                    return;
                }
                const cleanUsername = data.username.trim();
                if (room.users.includes(cleanUsername)) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用。' }));
                } else {
                    ws.username = cleanUsername;
                    room.users = room.users.filter(user => user); // 清理可能存在的 null/undefined 用户
                    room.users.push(cleanUsername);
                    broadcast(roomId, { type: 'userList', users: room.users });
                    ws.send(JSON.stringify({ type: 'joinSuccess', username: cleanUsername, message: '加入成功！' }));
                    console.log(`用户 ${cleanUsername} 加入房间 ${roomId}`);
                    broadcast(roomId, { type: 'system', message: `用户 ${cleanUsername} 加入了房间。` });
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
                const encryptedMessage = encryptMessage(data.message);
                if (encryptedMessage) {
                    const messageObject = { username: ws.username, message: encryptedMessage, timestamp: Date.now() };
                    room.messages.push(messageObject);
                    if (room.messages.length > MAX_MESSAGES_IN_MEMORY) {
                        room.messages.shift();
                    }
                    broadcast(roomId, { type: 'message', username: ws.username, message: data.message, timestamp: messageObject.timestamp });
                    saveMessages(roomId); // 保存消息
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: '消息加密失败，无法发送。' }));
                }
            } else if (data.type === 'destroy') {
                console.log(`收到来自用户 ${ws.username || '未知'} 的销毁房间 ${roomId} 请求。`);
                destroyRoom(roomId);
            }
        } catch (handlerError) {
            console.error(`消息处理逻辑错误 (房间: ${roomId}, 用户: ${ws.username}): ${handlerError.message}`, handlerError.stack);
            ws.send(JSON.stringify({ type: 'error', message: '服务器内部错误。' }));
        }
    });

    ws.on('close', (code, reason) => {
        const reasonString = reason ? reason.toString() : '无';
        console.log(`客户端断开连接 (房间: ${ws.roomId}, 用户: ${ws.username || '未加入'}, code: ${code}, reason: ${reasonString})`);
        if (ws.username && ws.roomId) { // 确保用户已成功加入过房间
            const currentRoom = chatRooms[ws.roomId];
            if (currentRoom) {
                currentRoom.users = currentRoom.users.filter(user => user !== ws.username);
                if (currentRoom.users.length > 0) {
                    broadcast(ws.roomId, { type: 'userList', users: currentRoom.users });
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${ws.username} 离开了房间。` });
                } else {
                    console.log(`房间 ${ws.roomId} 现在为空。`);
                    // 注意：此处房间对象和其 messages 数组仍然保留在内存中，
                    // 直到被 destroyRoom 或 checkAndClearChatroomDir 清理（如果后者清内存）
                    // 或者服务器重启。
                }
            }
        }
    });
    ws.on('error', (error) => {
        console.error(`WebSocket 错误 (房间: ${ws.roomId}, 用户: ${ws.username}): ${error.message}`);
    });
});

function broadcast(roomId, data) {
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

// 主启动函数
async function main() {
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
    console.log("收到 SIGINT，正在关闭服务器...");
    wss.clients.forEach(client => {
        client.close(1012, "服务器正在关闭");
    });
    server.close(() => {
        console.log("服务器已关闭。");
        process.exit(0);
    });
});
