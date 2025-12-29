import { encryptMessage, decryptMessage, jsonResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../constants.js';

// 1. 定义完整的数据库初始化语句
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
 * 如果检测到表不存在，自动初始化并重试
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
    // 路由格式: /api/room/:roomId/:action
    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    // 手动初始化接口 (备用)
    if (pathParts[2] === 'init') {
        try {
            const statements = INIT_SQL.map(sql => db.prepare(sql));
            await db.batch(statements);
            return jsonResponse({ success: true, message: '数据库初始化成功！' });
        } catch (e) {
            return jsonResponse({ error: '初始化失败: ' + e.message }, 500);
        }
    }

    if (!roomId) return jsonResponse({ error: '缺少房间ID' }, 400);

    // --- GET /messages (轮询消息和在线用户) ---
    if (request.method === 'GET' && action === 'messages') {
        return await withAutoInit(db, async () => {
            const currentUser = url.searchParams.get('user');
            
            // 更新当前用户的心跳
            if (currentUser) {
                await db.prepare(
                    `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                     ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
                ).bind(roomId, currentUser, Date.now(), Date.now()).run();
            }

            // 获取活跃用户列表
            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            const { results: users } = await db.prepare(
                `SELECT username FROM users WHERE room_id = ? AND last_seen > ?`
            ).bind(roomId, activeThreshold).all();

            // 获取历史消息
            const { results: messages } = await db.prepare(
                `SELECT username, content, iv, timestamp FROM messages 
                 WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`
            ).bind(roomId, CONSTANTS.MAX_MESSAGES_RETRIEVE || 50).all();

            // 解密消息并转换字段名给前端
            const decryptedMessages = messages.reverse().map(msg => {
                const text = decryptMessage(msg.content, msg.iv, encryptionKey);
                return text ? { username: msg.username, message: text, timestamp: msg.timestamp } : null;
            }).filter(Boolean);

            return jsonResponse({
                type: 'sync',
                messages: decryptedMessages,
                users: users.map(u => u.username)
            });
        });
    }

    // --- POST /send (发送加密消息) ---
    if (request.method === 'POST' && action === 'send') {
        return await withAutoInit(db, async () => {
            const { username, message } = await request.json();
            if (!username || !message) return jsonResponse({ error: '数据不完整' }, 400);

            const encrypted = encryptMessage(message, encryptionKey);
            if (!encrypted) return jsonResponse({ error: '加密失败' }, 500);

            await db.prepare(
                `INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`
            ).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();

            // 更新发送者心跳
            await db.prepare(
                `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                 ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
            ).bind(roomId, username, Date.now(), Date.now()).run();

            return jsonResponse({ success: true });
        });
    }

    // --- POST /join (加入房间 - 核心修复) ---
    if (request.method === 'POST' && action === 'join') {
        return await withAutoInit(db, async () => {
            const { username } = await request.json();
            if (!username) return jsonResponse({ error: '请输入用户名' }, 400);

            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            
            // 检查用户名是否被其他活跃用户占用
            const { results } = await db.prepare(
                `SELECT username FROM users WHERE room_id = ? AND username = ? AND last_seen > ?`
            ).bind(roomId, username, activeThreshold).all();

            if (results.length > 0) {
                return jsonResponse({ error: '该称呼在房间内正活跃，请更换' }, 409);
            }

            // 注册用户：使用 ON CONFLICT 处理“已存在但已离线”的旧记录冲突
            await db.prepare(
                `INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?)
                 ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`
            ).bind(roomId, username, Date.now(), Date.now()).run();

            return jsonResponse({ success: true });
        });
    }

    // --- POST /destroy (销毁记录) ---
    if (request.method === 'POST' && action === 'destroy') {
        return await withAutoInit(db, async () => {
            await db.batch([
                db.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(roomId),
                db.prepare(`DELETE FROM users WHERE room_id = ?`).bind(roomId)
            ]);
            return jsonResponse({ success: true, message: '房间记录已清除' });
        });
    }

    return jsonResponse({ error: '方法不允许' }, 405);
}
