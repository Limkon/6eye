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

// 数据库操作自动初始化装饰器
async function withAutoInit(db, operation) {
    try {
        return await operation();
    } catch (e) {
        if (e.message && e.message.includes('no such table')) {
            const statements = INIT_SQL.map(sql => db.prepare(sql));
            await db.batch(statements);
            return await operation();
        }
        throw e;
    }
}

export async function handleApiRequest(request, context, url) {
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    // 手动初始化接口
    if (pathParts[2] === 'init') {
        try {
            const statements = INIT_SQL.map(sql => db.prepare(sql));
            await db.batch(statements);
            return jsonResponse({ success: true, message: '初始化成功' });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    if (!roomId) return jsonResponse({ error: 'Missing Room ID' }, 400);

    // GET /messages
    if (request.method === 'GET' && action === 'messages') {
        return await withAutoInit(db, async () => {
            const currentUser = url.searchParams.get('user');
            if (currentUser) {
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
        });
    }

    // POST /send
    if (request.method === 'POST' && action === 'send') {
        return await withAutoInit(db, async () => {
            const { username, message } = await request.json();
            const encrypted = encryptMessage(message, encryptionKey);
            await db.prepare(`INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();
            return jsonResponse({ success: true });
        });
    }

    // POST /join
    if (request.method === 'POST' && action === 'join') {
        return await withAutoInit(db, async () => {
            const { username } = await request.json();
            await db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                    .bind(roomId, username, Date.now(), Date.now()).run();
            return jsonResponse({ success: true });
        });
    }

    // POST /destroy
    if (request.method === 'POST' && action === 'destroy') {
        return await withAutoInit(db, async () => {
            await db.batch([db.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(roomId), db.prepare(`DELETE FROM users WHERE room_id = ?`).bind(roomId)]);
            return jsonResponse({ success: true });
        });
    }
}
