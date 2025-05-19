// server.js
require('dotenv').config(); // <<<<<< 新增：加载 .env 文件
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const { URL } = require('url');

// --- Configuration Constants ---
const KEY_FILE_PATH = path.join(__dirname, '.encryption_key');
let ENCRYPTION_KEY; // For text message encryption

const IV_LENGTH = 16;
const CHATROOM_DIR = path.join(__dirname, 'chatroom_data');
const MAX_DIR_SIZE_MB = 80; // Maximum directory size in MB
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const messagesCache = new Map(); // Cache for decrypted text messages for client history
const MAX_MESSAGES_PER_ROOM_FILE = 200;
const MAX_MESSAGES_IN_MEMORY_CACHE = 100;
const MAX_MESSAGES_IN_ROOM_OBJECT = 50;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
    server,
    maxPayload: 15 * 1024 * 1024 // Max payload for WebSocket
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const chatRooms = {};
// Message structure for text: { username, message: {iv, encrypted}, timestamp, type: 'message' }
// Message structure for file: { username, file: {name, type, data_base64}, timestamp, type: 'file_message' }

const MESSAGE_TYPES = {
    USER_LIST: 'userList',
    MESSAGE: 'message',
    HISTORY: 'history',
    JOIN_SUCCESS: 'joinSuccess',
    JOIN_ERROR: 'joinError',
    ROOM_DESTROYED: 'roomDestroyed',
    INACTIVE: 'inactive',
    JOIN: 'join',
    DESTROY: 'destroy',
    SYSTEM: 'system',
    FILE_MESSAGE: 'file_message',
    ERROR: 'error',
    STORAGE_FULL: 'storage_full' // For storage full error
};

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
            console.warn(`警告: 文件 ${KEY_FILE_PATH} 中的密钥无效。将生成新密钥。`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`警告: 读取密钥文件 ${KEY_FILE_PATH} 失败: ${error.message}。将生成新密钥。`);
        } else {
            console.log(`信息: 密钥文件 ${KEY_FILE_PATH} 未找到。将生成新密钥。`);
        }
    }
    console.log(`正在生成新的加密密钥...`);
    const newKeyBuffer = crypto.randomBytes(32);
    try {
        await fs.writeFile(KEY_FILE_PATH, newKeyBuffer.toString('hex'), { encoding: 'utf8', mode: 0o600 });
        console.log(`新的加密密钥已生成并保存到 ${KEY_FILE_PATH}。`);
        console.warn(`重要提示: 请务必备份 ${KEY_FILE_PATH} 文件或其内容。`);
        return newKeyBuffer;
    } catch (writeError) {
        console.error(`致命错误: 无法将新的加密密钥保存到 ${KEY_FILE_PATH}: ${writeError.message}`);
        process.exit(1);
    }
}

async function ensureChatroomDir() {
    try {
        await fs.mkdir(CHATROOM_DIR, { recursive: true });
    } catch (error) {
        console.error(`错误: 初始化聊天室目录 '${CHATROOM_DIR}' 失败: ${error.message}`);
        throw error;
    }
}

async function getChatroomDirSizeMB() {
    let totalSize = 0;
    try {
        const files = await fs.readdir(CHATROOM_DIR);
        for (const file of files) {
            try {
                const stats = await fs.stat(path.join(CHATROOM_DIR, file));
                if (stats.isFile()) { // Only count files
                    totalSize += stats.size;
                }
            } catch (statError) { /* ignore errors for individual files */ }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') { // If dir doesn't exist, size is 0.
             console.error(`错误: 读取聊天室目录 ${CHATROOM_DIR} 大小失败: ${error.message}`);
        }
    }
    return totalSize / (1024 * 1024);
}

/**
 * Attempts to make space by deleting the oldest chat history file.
 * @returns {Promise<boolean>} True if a file was deleted, false otherwise.
 */
async function attemptToClearSpaceByDeletingOldestFile() {
    console.log("信息: 存储空间已满或接近满，尝试删除最旧的聊天记录文件...");
    let oldestFileEntry = null;

    try {
        const filesInDir = await fs.readdir(CHATROOM_DIR);
        const chatFiles = [];
        for (const fileName of filesInDir) {
            // Ensure we are only considering chat history files
            if (fileName.startsWith('chat_') && fileName.endsWith('.json')) {
                const filePath = path.join(CHATROOM_DIR, fileName);
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isFile()) {
                        chatFiles.push({ name: fileName, path: filePath, mtime: stats.mtime.getTime() });
                    }
                } catch (statError) {
                    console.warn(`警告: 获取文件 ${fileName} 的状态信息失败: ${statError.message}`);
                }
            }
        }

        if (chatFiles.length === 0) {
            console.log("信息: 没有聊天记录文件可供删除。");
            return false;
        }

        // Sort by modification time, oldest first
        chatFiles.sort((a, b) => a.mtime - b.mtime);
        oldestFileEntry = chatFiles[0];

        if (oldestFileEntry) {
            await fs.unlink(oldestFileEntry.path);
            console.log(`信息: 已删除最旧的聊天记录文件: ${oldestFileEntry.name} 以尝试释放空间。`);
            
            // Clear the entire message cache because we don't easily know which room's history was affected
            // (filename is a hash of roomId). This is a broad but safe approach for cache consistency.
            messagesCache.clear();
            console.log("信息: 整个消息历史缓存已清除，因为旧文件已被删除。");
            
            // Note: In-memory `chatRooms[roomId].messages` for the room whose file was deleted
            // might still exist if that room is active. This data will be out of sync with the (now deleted) file.
            // The next time history is loaded for that room, it will be empty from the file.
            // A more sophisticated cleanup would involve mapping filename back to roomId and clearing
            // chatRooms[roomId].messages, but this adds complexity.
            return true;
        }
    } catch (error) {
        console.error(`错误: 尝试删除最旧文件 (${oldestFileEntry ? oldestFileEntry.name : '未知'}) 时出错: ${error.message}`);
        return false;
    }
    return false; // Should not be reached if chatFiles had entries
}


function encryptRoomIdForFilename(roomId) {
    return crypto.createHash('sha256').update(roomId).digest('hex');
}

function encryptData(text) { // For text messages
    if (!ENCRYPTION_KEY) throw new Error("文本消息加密密钥未初始化。");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encrypted };
}

function decryptData(encryptedObject) { // For text messages
    if (!ENCRYPTION_KEY) throw new Error("文本消息解密密钥未初始化。");
    if (!encryptedObject || !encryptedObject.iv || !encryptedObject.encrypted) {
        console.error("错误: 文本消息解密数据无效或不完整。");
        return null;
    }
    try {
        const iv = Buffer.from(encryptedObject.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedObject.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error(`错误: 文本消息数据解密失败: ${error.message}.`);
        return null;
    }
}

async function saveMessagesToFile(roomId) {
    const room = chatRooms[roomId];
    if (!room || !room.messages || room.messages.length === 0) return;

    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const messagesToSave = room.messages.slice(-MAX_MESSAGES_PER_ROOM_FILE);
        const contentToWrite = JSON.stringify(messagesToSave, null, 2);
        await fs.writeFile(filePath, contentToWrite);
        // messagesCache.delete(roomId); // This was for text-only cache, now cleared globally if a file is deleted.
                                      // If only text messages are saved, this specific invalidation is better.
                                      // Given mixed content, global clear in attemptToClearSpace... is safer.
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ERROR: 保存房间 '${roomId}' 的消息失败: ${error.message}`, error.stack);
    }
}

async function loadMessagesForClientHistory(roomId) {
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const messagesFromFile = JSON.parse(fileContent);
        const historyForClient = [];

        for (const msgObj of messagesFromFile) {
            if (!msgObj || typeof msgObj.username !== 'string' || !msgObj.type || !msgObj.timestamp) {
                console.warn(`[HISTORY] Skipping malformed message in room ${roomId}: `, msgObj);
                continue;
            }
            if (msgObj.type === MESSAGE_TYPES.MESSAGE) { // Encrypted Text message
                if (msgObj.message && typeof msgObj.message.iv === 'string') {
                    const decryptedContent = decryptData(msgObj.message);
                    if (decryptedContent !== null) {
                        historyForClient.push({
                            username: msgObj.username,
                            message: decryptedContent,
                            timestamp: msgObj.timestamp,
                            type: MESSAGE_TYPES.MESSAGE
                        });
                    } else { // Failed to decrypt
                        historyForClient.push({
                            username: msgObj.username,
                            message: "[消息无法解密]", // Placeholder for undecryptable message
                            timestamp: msgObj.timestamp,
                            type: MESSAGE_TYPES.MESSAGE
                        });
                    }
                } else {
                     console.warn(`[HISTORY] Text message in room ${roomId} is not in expected encrypted format: `, msgObj);
                }
            } else if (msgObj.type === MESSAGE_TYPES.FILE_MESSAGE) { // File message (stored raw)
                if (msgObj.file && typeof msgObj.file.name === 'string') {
                    historyForClient.push({
                        username: msgObj.username,
                        file: msgObj.file, // Send the raw file object {name, type, data_base64}
                        timestamp: msgObj.timestamp,
                        type: MESSAGE_TYPES.FILE_MESSAGE
                    });
                } else {
                    console.warn(`[HISTORY] File message in room ${roomId} is missing 'file' object or 'file.name': `, msgObj);
                }
            } else {
                console.warn(`[HISTORY] Unknown message type '${msgObj.type}' in room ${roomId}`);
            }
        }
        return historyForClient.slice(-MAX_MESSAGES_IN_MEMORY_CACHE); // Limit history sent to client
    } catch (error) {
        if (error.code !== 'ENOENT') { // File not found is normal for new rooms or after deletion
            console.error(`错误: 为客户端加载房间 ${roomId} 的历史消息失败: ${error.message}`);
        }
        return []; // Return empty array if file not found or any other error
    }
}

async function destroyRoom(roomId) {
    if (!chatRooms[roomId]) return;
    console.log(`信息: 正在销毁房间: ${roomId}`);
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify({ type: MESSAGE_TYPES.ROOM_DESTROYED, message: `房间 "${roomId}" 已被管理员销毁。` }));
            } catch (e) { console.error("发送 ROOM_DESTROYED 消息失败:", e); }
            client.close(1000, 'Room destroyed by admin');
        }
    });
    delete chatRooms[roomId];
    messagesCache.delete(roomId); // Clear specific room cache if it exists
    const encryptedRoomId = encryptRoomIdForFilename(roomId);
    const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
    try {
        await fs.unlink(filePath);
        console.log(`信息: 已删除房间 ${roomId} 的聊天记录文件: ${filePath}`);
    } catch (error) {
        if (error.code !== 'ENOENT') { // File not found is okay if already gone
            console.error(`错误: 删除房间 ${roomId} 的聊天记录文件 ${filePath} 失败: ${error.message}`);
        }
    }
}

function checkInactiveClients() {
    const now = Date.now();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.lastActive && (now - client.lastActive > INACTIVITY_TIMEOUT)) {
            console.log(`信息: 客户端 ${client.username || '未知用户'} (房间: ${client.roomId}) 由于不活动被断开。`);
            try {
                client.send(JSON.stringify({ type: MESSAGE_TYPES.INACTIVE, message: `由于长时间未活动（超过 ${INACTIVITY_TIMEOUT / 60000} 分钟），您已被移出房间。` }));
            } catch (e) { console.error("发送 INACTIVE 消息失败:", e); }
            client.close(1000, MESSAGE_TYPES.INACTIVE);
        }
    });
}
setInterval(checkInactiveClients, 60 * 1000); // Check every minute

wss.on('connection', async (ws, req) => {
    let roomIdFromUrl;
    try {
        const fullUrl = `ws://${req.headers.host}${req.url}`;
        const parsedUrl = new URL(fullUrl);
        const pathSegments = parsedUrl.pathname.split('/');
        roomIdFromUrl = pathSegments[1] ? decodeURIComponent(pathSegments[1]) : 'default';
        if (!/^[a-zA-Z0-9-_]+$/.test(roomIdFromUrl) && roomIdFromUrl !== 'default') {
             ws.close(1008, "无效的房间ID格式"); return;
        }
    } catch (urlParseError) {
        console.error("错误: 解析 WebSocket URL 失败:", urlParseError, "URL:", req.url);
        ws.close(1011, "无效的房间ID格式"); return;
    }

    const roomId = roomIdFromUrl;
    ws.roomId = roomId;
    ws.lastActive = Date.now();
    ws.username = null;
    console.log(`[${new Date().toISOString()}] INFO: 新客户端连接到房间 '${roomId}'`);

    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { users: [], messages: [] }; // Initialize room in memory
        // Attempt to load existing messages from file into memory for this new room object
        const encryptedRoomId = encryptRoomIdForFilename(roomId);
        const filePath = path.join(CHATROOM_DIR, `chat_${encryptedRoomId}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const messagesFromFile = JSON.parse(data); // Contains mixed type messages
            if (messagesFromFile && Array.isArray(messagesFromFile) && messagesFromFile.length > 0) {
                chatRooms[roomId].messages = messagesFromFile.slice(-MAX_MESSAGES_IN_ROOM_OBJECT);
                // console.log(`[${new Date().toISOString()}] INFO: 房间 '${roomId}': 从文件加载了 ${chatRooms[roomId].messages.length} 条消息到内存。`);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') { // ENOENT (file not found) is normal for a brand new room
                console.error(`[${new Date().toISOString()}] WARNING: 房间 '${roomId}': 从文件 '${filePath}' 加载消息错误: ${err.message}`);
            }
        }
    }
    
    // Send history to the newly connected client
    const history = await loadMessagesForClientHistory(roomId);
    if (history.length > 0) {
        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.HISTORY, messages: history })); } catch (e) { console.error("发送 HISTORY 消息失败:", e); }
    }

    ws.on('message', async (messageData) => {
        ws.lastActive = Date.now();
        let data;
        try { data = JSON.parse(messageData.toString()); } catch (error) {
            console.error(`错误: 解析消息失败: ${error.message}.`);
            try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '无效的消息格式。' })); } catch (e) {/*ignore*/}
            return;
        }

        const currentRoomForMessage = chatRooms[ws.roomId];
        if (!currentRoomForMessage) {
            console.error(`[CRITICAL] 房间 '${ws.roomId}' 对象未找到。客户端可能连接到已销毁的房间。`);
            try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '房间不存在或已销毁。请尝试重新加入。' })); } catch (e) {/*ignore*/}
            ws.close(1011, "房间不存在"); return;
        }

        try {
            switch (data.type) {
                case MESSAGE_TYPES.JOIN:
                    if (typeof data.username !== 'string' || data.username.trim() === '' || data.username.length > 30) {
                        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN_ERROR, message: '用户名无效或过长。' })); } catch (e) { /*ignore*/ } return;
                    }
                    const cleanUsername = data.username.trim();
                    if (currentRoomForMessage.users.includes(cleanUsername)) {
                        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN_ERROR, message: '用户名已被占用。' })); } catch (e) { /*ignore*/ }
                    } else {
                        ws.username = cleanUsername;
                        currentRoomForMessage.users = currentRoomForMessage.users.filter(u => u).concat(cleanUsername); // Add user, ensuring no nulls
                        broadcast(ws.roomId, { type: MESSAGE_TYPES.USER_LIST, users: currentRoomForMessage.users });
                        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN_SUCCESS, username: cleanUsername, message: '加入成功！' })); } catch (e) { /*ignore*/ }
                        console.log(`[INFO] 用户 '${cleanUsername}' 加入房间 '${ws.roomId}'`);
                        broadcast(ws.roomId, { type: MESSAGE_TYPES.SYSTEM, message: `用户 ${cleanUsername} 加入了房间。` }, ws); // Exclude sender
                    }
                    break;

                case MESSAGE_TYPES.MESSAGE: // Text message
                    if (!ws.username) { try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '请先加入房间。' })); } catch (e) {/*ignore*/} return; }
                    if (typeof data.message !== 'string' || data.message.trim() === '') return; // Ignore empty messages
                    if (data.message.length > 1000) { try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '消息过长。' })); } catch (e) {/*ignore*/} return; }
                    
                    const encryptedTextMessage = encryptData(data.message);
                    if (!encryptedTextMessage) {
                        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '文本消息加密失败。' })); } catch (e) { /*ignore*/ } return;
                    }
                    const textMessageObject = { username: ws.username, message: encryptedTextMessage, timestamp: Date.now(), type: MESSAGE_TYPES.MESSAGE };
                    currentRoomForMessage.messages.push(textMessageObject);
                    if (currentRoomForMessage.messages.length > MAX_MESSAGES_IN_ROOM_OBJECT) currentRoomForMessage.messages.shift(); // Trim in-memory messages
                    broadcast(ws.roomId, { type: MESSAGE_TYPES.MESSAGE, username: ws.username, message: data.message, timestamp: textMessageObject.timestamp });
                    await saveMessagesToFile(ws.roomId);
                    break;

                case MESSAGE_TYPES.FILE_MESSAGE:
                    if (!ws.username) { try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '请先加入房间再发送文件。' })); } catch (e) {/*ignore*/} return; }
                    if (!data.file || typeof data.file.name !== 'string' || typeof data.file.type !== 'string' || typeof data.file.data !== 'string') {
                        try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '文件数据不完整。' })); } catch (e) { /*ignore*/ } return;
                    }

                    let currentSizeMB = await getChatroomDirSizeMB();
                    let canUpload = currentSizeMB < MAX_DIR_SIZE_MB;

                    if (!canUpload) { // Storage is full or over limit
                        console.warn(`警告: 存储空间已满 (${currentSizeMB.toFixed(2)}MB / ${MAX_DIR_SIZE_MB}MB)。尝试清理空间以为 '${data.file.name}' 腾出位置...`);
                        const spaceMade = await attemptToClearSpaceByDeletingOldestFile();
                        if (spaceMade) {
                            currentSizeMB = await getChatroomDirSizeMB(); // Re-check size
                            canUpload = currentSizeMB < MAX_DIR_SIZE_MB;
                            if(canUpload) {
                                console.log(`信息: 空间已成功清理。当前大小: ${currentSizeMB.toFixed(2)}MB。继续上传 '${data.file.name}'.`);
                            } else {
                                console.warn(`警告: 清理空间后，存储仍然已满 (${currentSizeMB.toFixed(2)}MB / ${MAX_DIR_SIZE_MB}MB)。文件 '${data.file.name}' 上传失败。`);
                            }
                        } else {
                             console.warn(`警告: 无法清理空间 (可能没有旧文件可删)，存储仍然已满。文件 '${data.file.name}' 上传失败。`);
                        }
                    }

                    if (!canUpload) { // If still cannot upload after attempting to clear space
                        console.warn(`最终决定: 房间 '${ws.roomId}', 用户 '${ws.username}': 文件 '${data.file.name}' 上传失败，存储已满或无法清理足够空间。`);
                        try {
                            ws.send(JSON.stringify({
                                type: MESSAGE_TYPES.STORAGE_FULL,
                                message: `服务器存储空间已满 (${MAX_DIR_SIZE_MB}MB)，暂时无法上传文件 '${data.file.name}'。已尝试清理旧文件但空间仍不足。请稍后再试或联系管理员。`
                            }));
                        } catch (e) { console.error("发送 STORAGE_FULL 消息失败:", e); }
                        return; // Block upload
                    }
                    
                    // If space is sufficient (either initially or after clearing)
                    const fileObjectForStorageAndBroadcast = { name: data.file.name, type: data.file.type, data: data.file.data }; // Raw Base64 data
                    const fileMessageToStore = { username: ws.username, file: fileObjectForStorageAndBroadcast, timestamp: Date.now(), type: MESSAGE_TYPES.FILE_MESSAGE };
                    
                    currentRoomForMessage.messages.push(fileMessageToStore);
                    if (currentRoomForMessage.messages.length > MAX_MESSAGES_IN_ROOM_OBJECT) currentRoomForMessage.messages.shift(); // Trim in-memory
                    
                    broadcast(ws.roomId, { type: MESSAGE_TYPES.FILE_MESSAGE, username: ws.username, file: fileObjectForStorageAndBroadcast, timestamp: fileMessageToStore.timestamp });
                    await saveMessagesToFile(ws.roomId); // Save to file (includes the new file message)
                    break;

                case MESSAGE_TYPES.DESTROY:
                    if (!ws.username) return; // Must be joined to destroy
                    console.log(`信息: 用户 ${ws.username} 请求销毁房间 ${ws.roomId}。`);
                    await destroyRoom(ws.roomId);
                    break;

                default:
                    console.warn(`[WARN] 未知消息类型: ${data.type} 从用户 ${ws.username || '未加入'} 在房间 ${ws.roomId}`);
                    try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: `服务器无法识别的消息类型: ${data.type}` })); } catch (e) { /*ignore*/ }
            }
        } catch (handlerError) {
            console.error(`[ERROR] 消息处理错误 (房间: ${ws.roomId}, 用户: ${ws.username || '未指定'}): ${handlerError.message}`, handlerError.stack);
            try { ws.send(JSON.stringify({ type: MESSAGE_TYPES.ERROR, message: '服务器内部错误，无法处理您的请求。' })); } catch (e) { /*ignore*/ }
        }
    });

    ws.on('close', (code, reasonBuffer) => {
        const reason = reasonBuffer ? reasonBuffer.toString() : '无明确原因';
        console.log(`[INFO] 客户端断开 (房间: ${ws.roomId}, 用户: ${ws.username || 'N/A'}, 代码: ${code}, 原因: ${reason})`);
        if (ws.username && ws.roomId) { // If user had joined
            const roomOnClose = chatRooms[ws.roomId];
            if (roomOnClose) {
                roomOnClose.users = roomOnClose.users.filter(user => user !== ws.username); // Remove user
                if (roomOnClose.users.length > 0) {
                    broadcast(ws.roomId, { type: MESSAGE_TYPES.USER_LIST, users: roomOnClose.users });
                    // Don't broadcast leave message if room was destroyed or user was inactive (already handled by those events)
                    if (reason !== 'Room destroyed by admin' && reason !== MESSAGE_TYPES.INACTIVE) {
                         broadcast(ws.roomId, { type: MESSAGE_TYPES.SYSTEM, message: `用户 ${ws.username} 离开房间。` });
                    }
                } else {
                    console.log(`[INFO] 房间 '${ws.roomId}' 现在为空。`);
                    // Optionally, could implement logic to remove empty room from chatRooms after a timeout
                }
            }
        }
    });
    ws.on('error', (error) => console.error(`[ERROR] WebSocket 错误 (房间: ${ws.roomId}, 用户: ${ws.username || 'N/A'}): ${error.message}`));
});

function broadcast(roomId, data, excludeWs) {
    wss.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN && client !== excludeWs) {
            try { client.send(JSON.stringify(data)); } catch (sendError) { console.error(`错误: 广播消息失败: ${sendError.message}`); }
        }
    });
}

async function main() {
    try {
        ENCRYPTION_KEY = await loadOrGenerateEncryptionKey();
        if (!ENCRYPTION_KEY) process.exit(1); // loadOrGenerateEncryptionKey handles exit on critical failure
        
        await ensureChatroomDir();
        const initialSize = await getChatroomDirSizeMB(); // Check initial size
        console.log(`信息: 当前聊天数据目录 (${CHATROOM_DIR}) 大小: ${initialSize.toFixed(2)}MB / ${MAX_DIR_SIZE_MB}MB`);

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`服务器已启动，运行在 http://localhost:${PORT}`);
            console.log(`聊天室数据目录: ${CHATROOM_DIR}`);
            console.log(`WebSocket 最大负载限制: ${wss.options.maxPayload / 1024 / 1024} MB`);
            console.log(`存储空间上限 (自动清理/阻止上传): ${MAX_DIR_SIZE_MB} MB`);
        });
    } catch (error) {
        console.error("致命错误: 服务器启动失败:", error.message, error.stack);
        process.exit(1);
    }
}

main();

process.on('SIGINT', () => { // Handle Ctrl+C for graceful shutdown
    console.log("信息: 收到 SIGINT，正在关闭服务器...");
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.close(1012, "服务器正在关闭"); }); // 1012: Service Restart
    server.close(() => { 
        console.log("信息: HTTP 服务器已关闭。"); 
        // Any other final cleanup can go here
        process.exit(0); 
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => { console.error("错误: 关闭超时，强制退出。"); process.exit(1); }, 5000); // 5 seconds timeout
});
