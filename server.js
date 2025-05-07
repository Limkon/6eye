// server.js
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises; // 使用 fs.promises
const { URL } = require('url');

// --- 配置常量 ---
const KEY_FILE_PATH = path.join(__dirname, '.encryption_key_chatroom'); // 存储聊天记录加密密钥的文件
let ENCRYPTION_KEY; // 将在此处加载或生成 (用于聊天记录加密)

const IV_LENGTH = 16; // AES CBC IV length
const CHATROOM_DIR = path.join(__dirname, 'chatroom_data'); // 聊天记录存储目录
const MAX_DIR_SIZE_MB = 80; // 聊天记录目录最大大小 (MB)
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 分钟不活动超时
const messagesCache = new Map(); // 内存中的消息缓存 (roomID -> decrypted messages array)
const MAX_MESSAGES_PER_ROOM_FILE = 200; // 每个聊天室文件保存的最大消息数
const MAX_MESSAGES_IN_MEMORY_FROM_FILE = 100; // 从文件加载到内存中的最大消息数

const app = express();
const server = http.createServer(app); // Express应用也附加到此服务器
const wss = new WebSocket.Server({ server }); // WebSocket服务器附加到同一个HTTP服务器

// --- 静态文件服务 和 SPA 回退 ---
// 建议将 public 目录的内容（如 index.html, client.js, style.css）放在主应用 server.js 的同级目录下
// 如果 public 目录是 start.js 提供的，则 server.js 不需要这部分
// 但如果 server.js 是独立应用，则需要
// app.use(express.static(path.join(__dirname, 'public_chatroom'))); // 提供聊天室的前端文件
// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public_chatroom', 'index.html')); // SPA 回退
// });
// **注意**：在当前 `start.js` 代理所有请求的模式下，`server.js` 不需要自己提供静态文件服务。
// `start.js` 应该处理静态文件的请求，或者如果聊天室有独立的前端，
// 那么前端应该连接到 `start.js` 暴露的公共 WebSocket 地址。
// 为简单起见，这里假设聊天室的前端资源是独立的，或者通过其他方式提供。

const chatRooms = {}; // 内存中存储聊天室状态: { roomId: { users: [], messages: [] (encrypted) } }

/**
 * 加载或生成聊天记录加密密钥。
 */
async function loadOrGenerateChatEncryptionKey() {
    const envKeyHex = process.env.CHATROOM_ENCRYPTION_KEY_HEX; // 使用更明确的环境变量名
    if (envKeyHex) {
        if (envKeyHex.length === 64 && /^[0-9a-fA-F]+$/.test(envKeyHex)) {
            console.log("[CHAT_APP] 已从 CHATROOM_ENCRYPTION_KEY_HEX 环境变量加载加密密钥。");
            return Buffer.from(envKeyHex, 'hex');
        } else {
            console.warn("[CHAT_APP] 警告: CHATROOM_ENCRYPTION_KEY_HEX 环境变量格式无效 (需要64位十六进制字符串)，将尝试从文件加载或生成新密钥。");
        }
    }

    try {
        const fileKeyHex = await fs.readFile(KEY_FILE_PATH, 'utf8');
        if (fileKeyHex && fileKeyHex.trim().length === 64 && /^[0-9a-fA-F]+$/.test(fileKeyHex.trim())) {
            console.log(`[CHAT_APP] 已从文件 ${KEY_FILE_PATH} 加载加密密钥。`);
            return Buffer.from(fileKeyHex.trim(), 'hex');
        } else {
            console.warn(`[CHAT_APP] 警告: 文件 ${KEY_FILE_PATH} 中的密钥无效或格式不正确。将生成新密钥。`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`[CHAT_APP] 警告: 读取密钥文件 ${KEY_FILE_PATH} 失败 (错误: ${error.message})。将生成新密钥。`);
        } else {
            console.log(`[CHAT_APP] 信息: 密钥文件 ${KEY_FILE_PATH} 未找到。将生成新密钥。`);
        }
    }

    console.log(`[CHAT_APP] 正在生成新的聊天记录加密密钥...`);
    const newKeyBuffer = crypto.randomBytes(32); // 256-bit key
    const newKeyHex = newKeyBuffer.toString('hex');
    try {
        await fs.writeFile(KEY_FILE_PATH, newKeyHex, { encoding: 'utf8', mode: 0o600 });
        console.log(`[CHAT_APP] 新的聊天记录加密密钥已生成并保存到 ${KEY_FILE_PATH}。`);
        console.warn(`[CHAT_APP] 重要提示:`);
        console.warn(`[CHAT_APP]   - 请务必备份 ${KEY_FILE_PATH} 文件，或将其中的密钥字符串记录在安全的地方。`);
        console.warn(`[CHAT_APP]   - 如果此文件或密钥丢失，所有已加密的聊天记录将永久无法恢复！`);
        console.warn(`[CHAT_APP]   - 强烈建议将 '${path.basename(KEY_FILE_PATH)}' 添加到您的 .gitignore 文件中。`);
        return newKeyBuffer;
    } catch (writeError) {
        console.error(`[CHAT_APP] 致命错误: 无法将新的加密密钥保存到 ${KEY_FILE_PATH}: ${writeError.message}`);
        console.error("[CHAT_APP] 由于无法持久化加密密钥，聊天服务器无法安全启动。请检查文件系统权限。");
        console.error("[CHAT_APP] 您也可以尝试手动设置 CHATROOM_ENCRYPTION_KEY_HEX 环境变量来绕过文件写入问题。");
        process.exit(1);
    }
}

/**
 * 确保聊天室目录存在，并清理无效的聊天文件名。
 */
async function ensureChatroomDir() {
    try {
        await fs.mkdir(CHATROOM_DIR, { recursive: true });
        const files = await fs.readdir(CHATROOM_DIR);
        const fileRegex = /^chat_[0-9a-f]{64}\.json$/; // 文件名应为 chat_ + SHA256哈希 + .json
        for (const file of files) {
            if (file.startsWith('chat_') && !file.match(fileRegex)) {
                try {
                    console.log(`[CHAT_APP] 信息: 删除无效的聊天文件: ${file}`);
                    await fs.unlink(path.join(CHATROOM_DIR, file));
                } catch (unlinkError) {
                    console.error(`[CHAT_APP] 错误: 删除文件 ${file} 失败: ${unlinkError.message}`);
                }
            }
        }
    } catch (error) {
        console.error(`[CHAT_APP] 错误: 初始化聊天室目录 ${CHATROOM_DIR} 失败: ${error.message}`);
        throw error; // Re-throw to be caught by main startup
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
                // console.warn(`[CHAT_APP] 获取文件 ${file} 大小失败: ${statError.message}`); // 可能比较吵
            }
        }
        const totalSizeMB = totalSize / (1024 * 1024);
        if (totalSizeMB > MAX_DIR_SIZE_MB) {
            console.warn(`[CHAT_APP] 警告: 聊天室目录大小 (${totalSizeMB.toFixed(2)}MB) 已超过限制 (${MAX_DIR_SIZE_MB}MB)，将清空目录。`);
            for (const file of files) {
                try {
                    await fs.unlink(path.join(CHATROOM_DIR, file));
                } catch (unlinkError) {
                    console.error(`[CHAT_APP] 错误: 清空目录时删除文件 ${file} 失败: ${unlinkError.message}`);
                }
            }
            messagesCache.clear(); // 清空内存缓存
            for (const roomId_iterator in chatRooms) { // 清空内存中的房间消息
                if (chatRooms[roomId_iterator]) {
                    chatRooms[roomId_iterator].messages = [];
                }
            }
            console.log("[CHAT_APP] 信息: 聊天室目录已清空。");
        }
    } catch (error) {
        console.error(`[CHAT_APP] 错误: 检查并清理聊天室目录失败: ${error.message}`);
    }
}

function encryptRoomIdForFilename(roomId) {
    return crypto.createHash('sha256').update(roomId).digest('hex');
}

function encryptMessage(message) {
    if (!ENCRYPTION_KEY) {
        console.error("[CHAT_APP] 致命错误: 聊天记录加密密钥未初始化。");
        return null; // 或者抛出错误
    }
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { iv: iv.toString('hex'), encryptedData: encrypted }; // Renamed 'encrypted' to 'encryptedData' for clarity
    } catch (error) {
        console.error(`[CHAT_APP] 错误: 消息加密失败: ${error.message}`);
        return null;
    }
}

function decryptMessage(encryptedPayload) {
    if (!ENCRYPTION_KEY) {
        console.error("[CHAT_APP] 致命错误: 聊天记录解密密钥未初始化。");
        return null;
    }
    if (!encryptedPayload || !encryptedPayload.iv || !encryptedPayload.encryptedData) {
        console.error("[CHAT_APP] 错误: 解密数据无效。 Payload:", encryptedPayload);
        return null;
    }
    try {
        const iv = Buffer.from(encryptedPayload.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedPayload.encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error(`[CHAT_APP] 错误: 消息解密失败: ${error.message}. 可能原因：密钥不匹配或数据损坏。`);
        return null;
    }
}

async function saveMessages(roomId) {
    const room = chatRooms[roomId];
    if (!room || room.messages.length === 0) return;

    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        // 从内存中获取要保存的加密消息 (room.messages 存储的是加密后的对象)
        const messagesToSave = room.messages.slice(-MAX_MESSAGES_PER_ROOM_FILE);
        const contentToWrite = JSON.stringify(messagesToSave, null, 2); // Pretty print JSON
        await fs.writeFile(filePath, contentToWrite, 'utf8');
        // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Successfully wrote messages for room '${roomId}' to '${filePath}'`);

        // 保存成功后，从内存缓存中移除此房间的解密后消息，以便下次从文件加载
        if (messagesCache.has(roomId)) {
            messagesCache.delete(roomId);
            // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Invalidated messagesCache for room '${roomId}' after saving new messages.`);
        }
        await checkAndClearChatroomDir(); // 每次保存后检查目录大小
    } catch (error) {
        console.error(`[CHAT_APP] [${new Date().toISOString()}] ERROR: 保存房间 '${roomId}' 的消息失败: ${error.message}`, error.stack);
    }
}

// 加载的是解密后的消息，供客户端使用
async function loadDecryptedMessagesForClient(roomId) {
    if (messagesCache.has(roomId)) {
        return messagesCache.get(roomId);
    }
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const encryptedMessagesFromFile = JSON.parse(data); // 这些是加密对象数组

        const decryptedMessages = encryptedMessagesFromFile.map(msgObj => {
            // msgObj 结构: { username: string, message: { iv: string, encryptedData: string }, timestamp: number }
            const decryptedContent = decryptMessage(msgObj.message); // 解密 message 部分
            if (decryptedContent !== null) {
                return { username: msgObj.username, message: decryptedContent, timestamp: msgObj.timestamp };
            }
            return null;
        }).filter(msg => msg !== null);

        if (decryptedMessages.length > 0) {
            messagesCache.set(roomId, decryptedMessages); // 缓存解密后的消息
        }
        return decryptedMessages;
    } catch (error) {
        if (error.code !== 'ENOENT') { // File not found is normal for new rooms or empty rooms
            console.error(`[CHAT_APP] 错误: 为客户端加载房间 ${roomId} 的解密消息失败: ${error.message}`);
        }
        return []; // 如果文件不存在或解析失败，返回空数组
    }
}


async function destroyRoom(roomId) {
    if (!chatRooms[roomId]) return;
    console.log(`[CHAT_APP] 信息: 正在销毁房间: ${roomId}`);
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'roomDestroyed',
                message: `房间 "${roomId}" 已被管理员销毁。`
            }));
            client.close(1000, 'Room destroyed');
        }
    });
    delete chatRooms[roomId]; // 从内存中删除房间
    messagesCache.delete(roomId); // 从缓存中删除

    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        await fs.unlink(filePath); // 删除聊天记录文件
        console.log(`[CHAT_APP] 信息: 已删除房间 ${roomId} 的聊天记录文件: ${filePath}`);
    } catch (error) {
        if (error.code !== 'ENOENT') { // 如果文件本不存在，则不是错误
            console.error(`[CHAT_APP] 错误: 删除房间 ${roomId} 的聊天记录文件 ${filePath} 失败: ${error.message}`);
        }
    }
}

function checkInactiveClients() {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.lastActive && (now - client.lastActive > INACTIVITY_TIMEOUT)) {
            console.log(`[CHAT_APP] 信息: 客户端 ${client.username || '未知用户'} (房间: ${client.roomId}) 由于不活动被断开。`);
            client.send(JSON.stringify({
                type: 'inactive',
                message: '由于长时间未活动（超过10分钟），您已被移出房间。'
            }));
            client.close(1000, 'Inactive due to timeout');
            // 从房间用户列表中移除，这部分逻辑在 ws.on('close') 中处理
        }
    });
}
setInterval(checkInactiveClients, 60 * 1000); // 每分钟检查一次

wss.on('connection', async (ws, req) => {
    let roomIdFromUrl;
    try {
        // req.url 对于 ws 来说是路径部分，例如 /roomName?token=abc
        // 对于通过代理的 ws，req.url 可能是完整的 URL
        // 需要一个健壮的方式来获取 roomId，这里简化处理
        const base = `ws://${req.headers.host || 'localhost'}`; // 构造一个基础 URL 以便解析
        const parsedUrl = new URL(req.url, base);
        roomIdFromUrl = parsedUrl.pathname.split('/')[1] || 'default'; // 取路径的第一部分作为 roomId
        roomIdFromUrl = decodeURIComponent(roomIdFromUrl);
        if (!roomIdFromUrl.match(/^[a-zA-Z0-9_.-]{1,50}$/)) { // 简单的房间名验证
            console.warn(`[CHAT_APP] 警告: 无效的房间名格式: ${roomIdFromUrl}`);
            ws.close(1008, "无效的房间名格式");
            return;
        }
    } catch (urlParseError) {
        console.error("[CHAT_APP] 错误: 解析 WebSocket URL 失败:", urlParseError, "URL:", req.url);
        ws.close(1011, "无效的房间ID格式");
        return;
    }

    const roomId = roomIdFromUrl;
    ws.roomId = roomId;
    ws.lastActive = Date.now();
    ws.username = null; // 用户名在 'join' 消息后设置

    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: New client connected to room '${roomId}'`);

    let createdNewRoomInMemory = false;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] }; // messages 存储加密对象
        createdNewRoomInMemory = true;
        console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}' created in memory.`);
    }
    const room = chatRooms[roomId]; // room.messages 存储的是加密后的消息对象

    // 如果房间是新创建的，或者内存中消息为空，则尝试从文件加载加密消息到内存
    if (createdNewRoomInMemory || room.messages.length === 0) {
        const encryptedRoomId = encryptRoomIdForFilename(roomId);
        const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const messagesFromFile = JSON.parse(data); // 这些是加密对象

            if (messagesFromFile && messagesFromFile.length > 0) {
                room.messages = messagesFromFile.slice(-MAX_MESSAGES_IN_MEMORY_FROM_FILE); // 加载最近的N条到内存
                console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}': Loaded ${room.messages.length} (encrypted) messages from file into memory.`);
            } else {
                // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}': Chat file is empty. Starting with empty message list in memory.`);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}': Chat file not found. Starting with empty message list in memory.`);
            } else {
                console.error(`[CHAT_APP] [${new Date().toISOString()}] WARNING: Room '${roomId}': Error loading (encrypted) messages from file '${filePath}': ${err.message}.`);
            }
        }
    }

    // 发送解密后的历史消息给新连接的客户端
    const decryptedHistory = await loadDecryptedMessagesForClient(roomId);
    if (decryptedHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: decryptedHistory }));
    } else {
        // 可选：发送一条消息说明没有历史记录或房间是新的
        ws.send(JSON.stringify({ type: 'system', message: '欢迎来到聊天室！当前没有历史消息。' }));
    }


    ws.on('message', (messageData) => {
        ws.lastActive = Date.now();
        let data;
        try {
            data = JSON.parse(messageData.toString()); // 确保 messageData 是字符串
        } catch (error) {
            console.error(`[CHAT_APP] 错误: 解析消息失败: ${error.message}`);
            ws.send(JSON.stringify({ type: 'error', message: '无效的消息格式。请发送JSON字符串。' }));
            return;
        }

        try {
            const currentRoomForMessage = chatRooms[ws.roomId];
            if (!currentRoomForMessage) {
                console.error(`[CHAT_APP] [${new Date().toISOString()}] CRITICAL: Room object for '${ws.roomId}' not found in chatRooms during message handling.`);
                ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已销毁。请重新连接到有效房间。' }));
                ws.close(1011, "Room not found");
                return;
            }

            if (data.type === 'join') {
                if (typeof data.username !== 'string' || data.username.trim() === '' || data.username.length > 30 || !data.username.match(/^[a-zA-Z0-9_.-]+$/)) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '无效的用户名 (长度1-30, 允许字符: a-z, A-Z, 0-9, _, ., -)。' }));
                    return;
                }
                const cleanUsername = data.username.trim();
                if (currentRoomForMessage.users.includes(cleanUsername)) {
                    ws.send(JSON.stringify({ type: 'joinError', message: '用户名已被占用。' }));
                } else {
                    ws.username = cleanUsername; // 设置此 WebSocket 连接的用户名
                    // currentRoomForMessage.users = currentRoomForMessage.users.filter(user => user); // 过滤无效用户 (如果需要)
                    currentRoomForMessage.users.push(cleanUsername);
                    broadcast(ws.roomId, { type: 'userList', users: currentRoomForMessage.users });
                    ws.send(JSON.stringify({ type: 'joinSuccess', username: cleanUsername, message: '加入成功！' }));
                    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: User '${cleanUsername}' joined room '${ws.roomId}'`);
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${cleanUsername} 加入了房间。` }, ws); // 通知其他人，除了自己
                }

            } else if (data.type === 'message') {
                if (!ws.username) {
                    ws.send(JSON.stringify({ type: 'error', message: '发送消息前请先加入房间 (发送 "join" 类型消息)。' }));
                    return;
                }
                if (typeof data.message !== 'string' || data.message.trim() === '') {
                    ws.send(JSON.stringify({ type: 'error', message: '消息内容不能为空。' }));
                    return;
                }
                if (data.message.length > 1000) { // 限制消息长度
                    ws.send(JSON.stringify({ type: 'error', message: '消息过长 (最大1000字符)。' }));
                    return;
                }

                const plainMessageContent = data.message.trim();
                const encryptedMessageObject = encryptMessage(plainMessageContent);

                if (encryptedMessageObject) {
                    const messageToStore = {
                        username: ws.username,
                        message: encryptedMessageObject, // 存储加密后的对象 {iv, encryptedData}
                        timestamp: Date.now()
                    };
                    currentRoomForMessage.messages.push(messageToStore);

                    if (currentRoomForMessage.messages.length > MAX_MESSAGES_PER_ROOM_FILE) { // 内存中也做截断，与文件保存上限一致或更大
                        currentRoomForMessage.messages.shift();
                    }
                    // 广播给房间内所有客户端的是明文消息
                    broadcast(ws.roomId, { type: 'message', username: ws.username, message: plainMessageContent, timestamp: messageToStore.timestamp });
                    saveMessages(ws.roomId); // 异步保存加密消息到文件
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: '消息加密失败，无法发送。' }));
                }
            } else if (data.type === 'destroyRoom') { // 假设有某种管理员权限检查
                console.log(`[CHAT_APP] 信息: 收到来自用户 ${ws.username || '未知'} 的销毁房间 ${ws.roomId} 请求。`);
                // 在实际应用中，这里应该有权限验证逻辑
                await destroyRoom(ws.roomId); // 异步销毁房间
            }
        } catch (handlerError) {
            console.error(`[CHAT_APP] [${new Date().toISOString()}] ERROR: 消息处理逻辑错误 (房间: ${ws.roomId}, 用户: ${ws.username}): ${handlerError.message}`, handlerError.stack);
            ws.send(JSON.stringify({ type: 'error', message: '服务器内部错误处理您的请求。' }));
        }
    });

    ws.on('close', (code, reason) => {
        const reasonString = reason ? reason.toString() : '无';
        console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Client disconnected (Room: ${ws.roomId}, User: ${ws.username || 'N/A'}, Code: ${code}, Reason: ${reasonString})`);
        if (ws.username && ws.roomId) {
            const currentRoomOnClose = chatRooms[ws.roomId];
            if (currentRoomOnClose) {
                currentRoomOnClose.users = currentRoomOnClose.users.filter(user => user !== ws.username);
                if (currentRoomOnClose.users.length > 0) {
                    broadcast(ws.roomId, { type: 'userList', users: currentRoomOnClose.users });
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${ws.username} 离开了房间。` });
                } else {
                    // 当房间内没有用户时，可以选择是否立即销毁房间或等待一段时间
                    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${ws.roomId}' is now empty. Consider scheduling for cleanup if inactive.`);
                    // 例如，可以在这里设置一个定时器，如果一段时间后房间仍然为空，则调用 saveMessages 和 delete chatRooms[ws.roomId]
                    // saveMessages(ws.roomId).then(() => {
                    //     delete chatRooms[ws.roomId];
                    //     messagesCache.delete(ws.roomId);
                    //     console.log(`[CHAT_APP] Room '${ws.roomId}' and its cache cleaned up from memory as it became empty.`);
                    // });
                }
            }
        }
    });
    ws.on('error', (error) => {
        console.error(`[CHAT_APP] [${new Date().toISOString()}] ERROR: WebSocket error (Room: ${ws.roomId}, User: ${ws.username || 'N/A'}): ${error.message}`);
    });
});

function broadcast(roomId, data, excludeWs = null) {
    const messageString = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageString);
            } catch (sendError) {
                console.error(`[CHAT_APP] 错误: 向客户端 ${client.username || '未知'} (房间: ${roomId}) 广播消息失败: ${sendError.message}`);
                // 可以考虑在这里从房间用户列表中移除发送失败的客户端或关闭其连接
            }
        }
    });
}

async function main() {
    try {
        ENCRYPTION_KEY = await loadOrGenerateChatEncryptionKey(); // 加载聊天记录的加密密钥
        if (!ENCRYPTION_KEY) {
            console.error("[CHAT_APP] 致命错误: 未能初始化聊天记录加密密钥。服务器无法启动。");
            process.exit(1);
        }
        await ensureChatroomDir();
        await checkAndClearChatroomDir(); // 启动时检查一次

        // 端口由 start.js 通过环境变量 PORT 设置，默认为 8200
        const PORT = process.env.PORT || 8200;
        server.listen(PORT, () => {
            console.log(`[CHAT_APP] 聊天应用服务器已启动，运行在 http://localhost:${PORT}`);
            console.log(`[CHAT_APP] 聊天室数据目录: ${CHATROOM_DIR}`);
            console.log(`[CHAT_APP] 聊天记录加密密钥文件: ${KEY_FILE_PATH}`);
        });
    } catch (error) {
        console.error("[CHAT_APP] 致命错误: 服务器启动过程中发生错误:", error.message, error.stack);
        process.exit(1);
    }
}

main();

// SIGINT 和 SIGTERM 信号由父进程 start.js 处理，start.js 会向此子进程发送信号
// 此子进程本身也可以设置信号处理器以进行特定于聊天应用的清理工作
// 但基本的关闭由父进程管理
process.on('SIGTERM', () => {
    console.log('[CHAT_APP] 收到 SIGTERM 信号，准备关闭聊天应用...');
    // 在这里可以执行特定于聊天应用的清理，例如确保所有消息都已保存
    const savePromises = [];
    for (const roomId in chatRooms) {
        if (chatRooms[roomId] && chatRooms[roomId].messages.length > 0) {
            console.log(`[CHAT_APP] 关闭前保存房间 ${roomId} 的消息...`);
            savePromises.push(saveMessages(roomId));
        }
    }

    Promise.all(savePromises).then(() => {
        console.log('[CHAT_APP] 所有待处理消息已尝试保存。');
        wss.clients.forEach(client => {
            client.close(1012, "服务器正在关闭");
        });
        server.close(() => {
            console.log("[CHAT_APP] 聊天应用 HTTP 服务器已关闭。");
            process.exit(0); // 正常退出
        });
    }).catch(err => {
        console.error('[CHAT_APP] 关闭前保存消息时发生错误:', err);
        process.exit(1); // 出错退出
    });


    // 设置一个超时，以防万一清理工作耗时过长
    setTimeout(() => {
        console.warn('[CHAT_APP] 关闭超时，强制退出。');
        process.exit(1);
    }, 4000); // 比父进程的超时短一些
});
