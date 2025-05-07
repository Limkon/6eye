// server.js (已修正 SyntaxError)
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

const chatRooms = {}; // 内存中存储聊天室状态: { roomId: { users: [], messages: [] (encrypted) } }

/**
 * 加载或生成聊天记录加密密钥。
 */
async function loadOrGenerateChatEncryptionKey() {
    const envKeyHex = process.env.CHATROOM_ENCRYPTION_KEY_HEX;
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
    const newKeyBuffer = crypto.randomBytes(32);
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
        const fileRegex = /^chat_[0-9a-f]{64}\.json$/;
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
                // console.warn(`[CHAT_APP] 获取文件 ${file} 大小失败: ${statError.message}`);
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
            messagesCache.clear();
            for (const roomId_iterator in chatRooms) {
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
        return null;
    }
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { iv: iv.toString('hex'), encryptedData: encrypted };
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
        const messagesToSave = room.messages.slice(-MAX_MESSAGES_PER_ROOM_FILE);
        const contentToWrite = JSON.stringify(messagesToSave, null, 2);
        await fs.writeFile(filePath, contentToWrite, 'utf8');
        // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Successfully wrote messages for room '${roomId}' to '${filePath}'`);

        if (messagesCache.has(roomId)) {
            messagesCache.delete(roomId);
            // console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Invalidated messagesCache for room '${roomId}' after saving new messages.`);
        }
        await checkAndClearChatroomDir();
    } catch (error) {
        console.error(`[CHAT_APP] [${new Date().toISOString()}] ERROR: 保存房间 '${roomId}' 的消息失败: ${error.message}`, error.stack);
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

        if (decryptedMessages.length > 0) {
            messagesCache.set(roomId, decryptedMessages);
        }
        return decryptedMessages;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[CHAT_APP] 错误: 为客户端加载房间 ${roomId} 的解密消息失败: ${error.message}`);
        }
        return [];
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
    delete chatRooms[roomId];
    messagesCache.delete(roomId);

    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        await fs.unlink(filePath);
        console.log(`[CHAT_APP] 信息: 已删除房间 ${roomId} 的聊天记录文件: ${filePath}`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
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
        }
    });
}
setInterval(checkInactiveClients, 60 * 1000);

wss.on('connection', async (ws, req) => {
    let roomIdFromUrl;
    try {
        const base = `ws://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, base);
        roomIdFromUrl = parsedUrl.pathname.split('/')[1] || 'default';
        roomIdFromUrl = decodeURIComponent(roomIdFromUrl);
        if (!roomIdFromUrl.match(/^[a-zA-Z0-9_.-]{1,50}$/)) {
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
    ws.username = null;

    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: New client connected to room '${roomId}'`);

    let createdNewRoomInMemory = false;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] };
        createdNewRoomInMemory = true;
        console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}' created in memory.`);
    }
    const room = chatRooms[roomId];

    if (createdNewRoomInMemory || room.messages.length === 0) {
        const encryptedRoomId = encryptRoomIdForFilename(roomId);
        const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const messagesFromFile = JSON.parse(data);

            if (messagesFromFile && messagesFromFile.length > 0) {
                room.messages = messagesFromFile.slice(-MAX_MESSAGES_IN_MEMORY_FROM_FILE);
                console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${roomId}': Loaded ${room.messages.length} (encrypted) messages from file into memory.`);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`[CHAT_APP] [${new Date().toISOString()}] WARNING: Room '${roomId}': Error loading (encrypted) messages from file '${filePath}': ${err.message}.`);
            }
        }
    }

    const decryptedHistory = await loadDecryptedMessagesForClient(roomId);
    if (decryptedHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: decryptedHistory }));
    } else {
        ws.send(JSON.stringify({ type: 'system', message: '欢迎来到聊天室！当前没有历史消息。' }));
    }

    // ****************************************************************
    // ****** 关键修改点！！！                     ******
    // ****************************************************************
    ws.on('message', async (messageData) => { // 将此回调函数声明为 async
        ws.lastActive = Date.now();
        let data;
        try {
            data = JSON.parse(messageData.toString());
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
                    ws.username = cleanUsername;
                    currentRoomForMessage.users.push(cleanUsername);
                    broadcast(ws.roomId, { type: 'userList', users: currentRoomForMessage.users });
                    ws.send(JSON.stringify({ type: 'joinSuccess', username: cleanUsername, message: '加入成功！' }));
                    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: User '${cleanUsername}' joined room '${ws.roomId}'`);
                    broadcast(ws.roomId, { type: 'system', message: `用户 ${cleanUsername} 加入了房间。` }, ws);
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
                if (data.message.length > 1000) {
                    ws.send(JSON.stringify({ type: 'error', message: '消息过长 (最大1000字符)。' }));
                    return;
                }

                const plainMessageContent = data.message.trim();
                const encryptedMessageObject = encryptMessage(plainMessageContent);

                if (encryptedMessageObject) {
                    const messageToStore = {
                        username: ws.username,
                        message: encryptedMessageObject,
                        timestamp: Date.now()
                    };
                    currentRoomForMessage.messages.push(messageToStore);

                    if (currentRoomForMessage.messages.length > MAX_MESSAGES_PER_ROOM_FILE) {
                        currentRoomForMessage.messages.shift();
                    }
                    broadcast(ws.roomId, { type: 'message', username: ws.username, message: plainMessageContent, timestamp: messageToStore.timestamp });
                    await saveMessages(ws.roomId); // saveMessages 是 async，所以这里可以用 await
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: '消息加密失败，无法发送。' }));
                }
            } else if (data.type === 'destroyRoom') {
                console.log(`[CHAT_APP] 信息: 收到来自用户 ${ws.username || '未知'} 的销毁房间 ${ws.roomId} 请求。`);
                // 此处应该有权限校验
                await destroyRoom(ws.roomId); // destroyRoom 是 async, 所以这里可以用 await
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
                    console.log(`[CHAT_APP] [${new Date().toISOString()}] INFO: Room '${ws.roomId}' is now empty. Consider scheduling for cleanup if inactive.`);
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
            }
        }
    });
}

async function main() {
    try {
        ENCRYPTION_KEY = await loadOrGenerateChatEncryptionKey();
        if (!ENCRYPTION_KEY) {
            console.error("[CHAT_APP] 致命错误: 未能初始化聊天记录加密密钥。服务器无法启动。");
            process.exit(1);
        }
        await ensureChatroomDir();
        await checkAndClearChatroomDir();

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

process.on('SIGTERM', () => {
    console.log('[CHAT_APP] 收到 SIGTERM 信号，准备关闭聊天应用...');
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
            process.exit(0);
        });
    }).catch(err => {
        console.error('[CHAT_APP] 关闭前保存消息时发生错误:', err);
        process.exit(1);
    });

    setTimeout(() => {
        console.warn('[CHAT_APP] 关闭超时，强制退出。');
        process.exit(1);
    }, 4000);
});
