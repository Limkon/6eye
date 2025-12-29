import { encryptMessage, decryptMessage, jsonResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../constants.js';

// 定义建表语句
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

// 核心修改：主动初始化数据库，而非出错后重试
async function ensureTables(db) {
    // 批量执行建表语句，IF NOT EXISTS 保证了重复执行无副作用且速度快
    const statements = INIT_SQL.map(sql => db.prepare(sql));
    await db.batch(statements);
}

export async function handleApiRequest(request, context, url) {
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    // 手动初始化接口 (保留)
    if (pathParts[2] === 'init') {
        try {
            await ensureTables(db);
            return jsonResponse({ success: true, message: '初始化成功' });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    if (!roomId) return jsonResponse({ error: 'Missing Room ID' }, 400);

    // GET /messages
    if (request.method === 'GET' && action === 'messages') {
        try {
            const currentUser = url.searchParams.get('user');
            if (currentUser) {
                // 更新用户活跃时间 (如果表不存在这里会报错，catch 会处理)
                await db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                        .bind(roomId, currentUser, Date.now(), Date.now()).run();
            }
            
            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            const { results: users } = await db.prepare(`SELECT username FROM users WHERE room_id = ? AND last_seen > ?`).bind(roomId, activeThreshold).all();
            const { results: messages } = await db.prepare(`SELECT username, content, iv, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`).bind(roomId, 50).all();
            
            const decryptedMessages = messages.reverse().map(msg => {
                const content = decryptMessage(msg.content, msg.iv, encryptionKey);
                return content ? { username: msg.username, message: content, timestamp: msg.timestamp } : null;
            }).filter(Boolean);
            
            return jsonResponse({ messages: decryptedMessages, users: users.map(u => u.username) });
        } catch (e) {
            // 如果是因为表不存在导致的错误，说明房间是新的，直接返回空列表
            if (e.message && e.message.includes('no such table')) {
                return jsonResponse({ messages: [], users: [] });
            }
            throw e;
        }
    }

    // POST /send
    if (request.method === 'POST' && action === 'send') {
        // 1. 确保表存在 (修复：消息发送失败/不可见的问题)
        await ensureTables(db); 
        
        // 2. 解析 Body
        const { username, message } = await request.json();
        
        // 3. 执行插入
        const encrypted = encryptMessage(message, encryptionKey);
        await db.prepare(`INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();
        
        return jsonResponse({ success: true });
    }

    // POST /join
    if (request.method === 'POST' && action === 'join') {
        // 1. 确保表存在 (修复：首次加入失败的问题)
        await ensureTables(db);
        
        // 2. 解析 Body
        const { username } = await request.json();
        
        // 3. 执行插入
        await db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                .bind(roomId, username, Date.now(), Date.now()).run();
        
        return jsonResponse({ success: true });
    }

    // POST /destroy
    if (request.method === 'POST' && action === 'destroy') {
        try {
            await db.batch([
                db.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(roomId), 
                db.prepare(`DELETE FROM users WHERE room_id = ?`).bind(roomId)
            ]);
            return jsonResponse({ success: true });
        } catch (e) {
             // 如果表本身就不存在，也算销毁成功
             return jsonResponse({ success: true });
        }
    }
}
