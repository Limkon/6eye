import { encryptMessage, decryptMessage, jsonResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../constants.js';

// 定义完整的建表语句
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

/**
 * 核心修复：数据库操作包装器
 * 遇到"无表"错误时自动尝试修复，实现零配置部署
 */
async function withAutoInit(db, operation) {
    try {
        return await operation();
    } catch (e) {
        if (e.message && e.message.includes('no such table')) {
            console.log('检测到数据库表缺失，正在自动初始化...');
            try {
                const statements = INIT_SQL.map(sql => db.prepare(sql));
                await db.batch(statements);
                return await operation();
            } catch (initError) {
                throw new Error(`自动初始化失败: ${initError.message}`);
            }
        }
        throw e;
    }
}

export async function handleApiRequest(request, context, url) {
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    // 恢复：手动初始化接口 (保留用于强制重置环境)
    if (pathParts[2] === 'init') {
        try {
            const statements = INIT_SQL.map(sql => db.prepare(sql));
            await db.batch(statements);
            return jsonResponse({ success: true, message: '数据库初始化成功！' });
        } catch (e) {
            return jsonResponse({ error: '初始化失败: ' + e.message }, 500);
        }
    }

    if (!roomId) return jsonResponse({ error: 'Missing Room ID' }, 400);

    // --- GET /messages (轮询消息与同步在线列表) ---
    if (request.method === 'GET' && action === 'messages') {
        return await withAutoInit(db, async () => {
            const currentUser = url.searchParams.get('user');
            
            // 1. 更新用户最后活跃时间 (心跳)
            if (currentUser) {
                await db.prepare(
                    `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                     ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
                ).bind(roomId, currentUser, Date.now(), Date.now()).run();
            }

            // 2. 获取当前活跃用户列表
            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            const { results: users } = await db.prepare(
                `SELECT username FROM users WHERE room_id = ? AND last_seen > ?`
            ).bind(roomId, activeThreshold).all();

            // 3. 获取历史消息 (按需解密)
            const { results: messages } = await db.prepare(
                `SELECT username, content, iv, timestamp FROM messages 
                 WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`
            ).bind(roomId, CONSTANTS.MAX_MESSAGES_RETRIEVE || 50).all();

            // 4. 服务端层解密 (支持 Double Encryption 架构)
            const decryptedMessages = messages.reverse().map(msg => {
                const content = decryptMessage(msg.content, msg.iv, encryptionKey);
                return content ? { username: msg.username, message: content, timestamp: msg.timestamp } : null;
            }).filter(Boolean);

            return jsonResponse({
                type: 'sync',
                messages: decryptedMessages,
                users: users.map(u => u.username)
            });
        });
    }

    // --- POST /send (发送消息) ---
    if (request.method === 'POST' && action === 'send') {
        return await withAutoInit(db, async () => {
            const { username, message } = await request.json();
            if (!username || !message) return jsonResponse({ error: 'Invalid data' }, 400);

            // 服务端层加密
            const encrypted = encryptMessage(message, encryptionKey);
            if (!encrypted) return jsonResponse({ error: 'Encryption failed' }, 500);

            await db.prepare(
                `INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`
            ).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();

            // 同步更新发送者活跃时间
            await db.prepare(
                `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                 ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
            ).bind(roomId, username, Date.now(), Date.now()).run();

            return jsonResponse({ success: true });
        });
    }

    // --- POST /join (加入房间) ---
    if (request.method === 'POST' && action === 'join') {
        return await withAutoInit(db, async () => {
            const { username } = await request.json();
            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            
            // 校验同名用户活跃状态
            const { results } = await db.prepare(
                `SELECT username FROM users WHERE room_id = ? AND username = ? AND last_seen > ?`
            ).bind(roomId, username, activeThreshold).all();

            if (results.length > 0) {
                return jsonResponse({ error: '该称呼已被占用' }, 409);
            }

            // 使用心跳机制注册用户
            await db.prepare(
                `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                 ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
            ).bind(roomId, username, Date.now(), Date.now()).run();

            return jsonResponse({ success: true });
        });
    }

    // --- POST /destroy (彻底销毁) ---
    if (request.method === 'POST' && action === 'destroy') {
        return await withAutoInit(db, async () => {
            await db.batch([
                db.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(roomId),
                db.prepare(`DELETE FROM users WHERE room_id = ?`).bind(roomId)
            ]);
            return jsonResponse({ success: true, message: 'Room destroyed' });
        });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}
