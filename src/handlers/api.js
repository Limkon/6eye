import { encryptMessage, decryptMessage, jsonResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../constants.js';

// 定义建表语句 (使用 IF NOT EXISTS 防止重复创建报错)
const INIT_SQL = [
    `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        iv TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS users (
        room_id TEXT NOT NULL,
        username TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (room_id, username)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, timestamp);`,
    `CREATE INDEX IF NOT EXISTS idx_users_room ON users(room_id, last_seen);`
];

export async function handleApiRequest(request, context, url) {
    const pathParts = url.pathname.split('/');
    // 路径格式: /api/room/:roomId/action 
    // 或者: /api/init (初始化)
    
    // 处理初始化请求 /api/init
    if (pathParts[2] === 'init') {
        try {
            const { db } = context;
            // 批量执行建表语句
            const statements = INIT_SQL.map(sql => db.prepare(sql));
            await db.batch(statements);
            return jsonResponse({ success: true, message: '数据库初始化成功！表结构已创建。' });
        } catch (e) {
            return jsonResponse({ error: '初始化失败: ' + e.message }, 500);
        }
    }

    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    if (!roomId) return jsonResponse({ error: 'Missing Room ID' }, 400);

    // --- GET /messages (轮询) ---
    if (request.method === 'GET' && action === 'messages') {
        const currentUser = url.searchParams.get('user');
        
        try {
            // 1. 更新心跳
            if (currentUser) {
                await db.prepare(
                    `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                     ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
                ).bind(roomId, currentUser, Date.now(), Date.now()).run();
            }

            // 2. 获取在线用户
            const activeThreshold = Date.now() - CONSTANTS.USER_TIMEOUT_MS;
            const { results: users } = await db.prepare(
                `SELECT username FROM users WHERE room_id = ? AND last_seen > ?`
            ).bind(roomId, activeThreshold).all();
            const userList = users.map(u => u.username);

            // 3. 获取消息
            const { results: messages } = await db.prepare(
                `SELECT username, content, iv, timestamp FROM messages 
                 WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`
            ).bind(roomId, CONSTANTS.MAX_MESSAGES_RETRIEVE).all();

            // 4. 解密
            const decryptedMessages = messages.reverse().map(msg => {
                const content = decryptMessage(msg.content, msg.iv, encryptionKey);
                return content ? { username: msg.username, message: content, timestamp: msg.timestamp } : null;
            }).filter(Boolean);

            return jsonResponse({
                type: 'sync',
                messages: decryptedMessages,
                users: userList
            });
        } catch (e) {
            // 如果遇到 "no such table" 错误，提示用户初始化
            if (e.message.includes('no such table')) {
                return jsonResponse({ error: '数据库未初始化。请访问 /api/init 进行初始化。' }, 500);
            }
            throw e;
        }
    }

    // --- POST /send (发送) ---
    if (request.method === 'POST' && action === 'send') {
        const data = await request.json();
        const { username, message } = data;

        if (!username || !message) return jsonResponse({ error: 'Invalid data' }, 400);

        const encrypted = encryptMessage(message, encryptionKey);
        if (!encrypted) return jsonResponse({ error: 'Encryption failed' }, 500);

        await db.prepare(
            `INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`
        ).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();

        // 顺带更新心跳
        await db.prepare(
            `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
             ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
        ).bind(roomId, username, Date.now(), Date.now()).run();

        return jsonResponse({ success: true });
    }

    // --- POST /join (加入) ---
    if (request.method === 'POST' && action === 'join') {
        const { username } = await request.json();
        const activeThreshold = Date.now() - CONSTANTS.USER_TIMEOUT_MS;
        
        const { results } = await db.prepare(
            `SELECT username FROM users WHERE room_id = ? AND username = ? AND last_seen > ?`
        ).bind(roomId, username, activeThreshold).all();

        if (results.length > 0) {
            return jsonResponse({ error: '用户名已被占用' }, 409);
        }

        await db.prepare(
            `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)`
        ).bind(roomId, username, Date.now()).run();

        return jsonResponse({ success: true });
    }

    // --- POST /destroy (销毁) ---
    if (request.method === 'POST' && action === 'destroy') {
        await db.batch([
            db.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(roomId),
            db.prepare(`DELETE FROM users WHERE room_id = ?`).bind(roomId)
        ]);
        return jsonResponse({ success: true, message: 'Room destroyed' });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}
