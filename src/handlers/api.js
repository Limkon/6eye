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

// 全局变量：记录表是否已初始化。
// Cloudflare Workers 会在内存中保留这个变量，避免每次请求都去运行 create table，极大降低数据库压力。
let tablesInitialized = false;

// 辅助函数：带重试的数据库执行器
async function runWithRetry(dbOperation, retries = 3, delay = 150) {
    for (let i = 0; i < retries; i++) {
        try {
            return await dbOperation();
        } catch (e) {
            // 如果是最后一次尝试，抛出错误
            if (i === retries - 1) throw e;
            
            // 如果错误包含 "locked" (死锁) 或 "busy"，则等待后重试
            const isLockError = e.message && (e.message.includes('locked') || e.message.includes('busy'));
            if (isLockError) {
                // 增加随机抖动
                const jitter = Math.random() * 50;
                await new Promise(r => setTimeout(r, delay + jitter));
            } else {
                // 其他错误直接抛出，不重试
                throw e;
            }
        }
    }
}

async function ensureTables(db) {
    if (tablesInitialized) return;

    try {
        // 使用 runWithRetry 包裹建表操作
        await runWithRetry(async () => {
             const statements = INIT_SQL.map(sql => db.prepare(sql));
             await db.batch(statements);
        });
        tablesInitialized = true;
    } catch (e) {
        console.error('Table init warning:', e.message);
        // 即便出错（可能是并发导致其他线程已经创建了），也暂时标记为 true，依靠后续查询验证
        tablesInitialized = true;
    }
}

export async function handleApiRequest(request, context, url, ctx) {
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[3];
    const action = pathParts[4];
    const { db, encryptionKey } = context;

    if (!roomId) return jsonResponse({ error: 'Missing Room ID' }, 400);

    // GET /messages
    if (request.method === 'GET' && action === 'messages') {
        try {
            const currentUser = url.searchParams.get('user');
            
            // 只有当提供了 username 时才尝试更新状态
            if (currentUser) {
                // 确保表存在后再更新
                if (!tablesInitialized) await ensureTables(db);

                // 核心修复：使用 waitUntil 异步执行心跳更新，避免阻塞读取请求
                if (ctx && ctx.waitUntil) {
                    ctx.waitUntil((async () => {
                        try {
                            await db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                                .bind(roomId, currentUser, Date.now(), Date.now()).run();
                        } catch(e) {
                            // 忽略后台更新失败
                        }
                    })());
                } else {
                    // 降级处理：如果没有 ctx，不使用 await 阻塞
                    db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                        .bind(roomId, currentUser, Date.now(), Date.now()).run().catch(() => {});
                }
            }
            
            const activeThreshold = Date.now() - (CONSTANTS.USER_TIMEOUT_MS || 30000);
            
            // 使用 Promise.all 并行查询，提高速度
            const [usersResult, messagesResult] = await Promise.all([
                db.prepare(`SELECT username FROM users WHERE room_id = ? AND last_seen > ?`).bind(roomId, activeThreshold).all(),
                db.prepare(`SELECT username, content, iv, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?`).bind(roomId, 50).all()
            ]);
            
            const users = usersResult.results || [];
            const messages = messagesResult.results || [];

            const decryptedMessages = messages.reverse().map(msg => {
                const content = decryptMessage(msg.content, msg.iv, encryptionKey);
                return content ? { username: msg.username, message: content, timestamp: msg.timestamp } : null;
            }).filter(Boolean);
            
            return jsonResponse({ messages: decryptedMessages, users: users.map(u => u.username) });
        } catch (e) {
            // 如果是因为表不存在(no such table)导致的错误，说明房间是新的，直接返回空列表
            if (e.message && e.message.includes('no such table')) {
                return jsonResponse({ messages: [], users: [] });
            }
            throw e;
        }
    }

    // POST /send
    if (request.method === 'POST' && action === 'send') {
        // 1. 确保表存在
        await ensureTables(db); 
        
        // 2. 解析 Body
        const { username, message } = await request.json();
        if (!message || !username) return jsonResponse({ error: 'Invalid data' }, 400);

        // 3. 执行插入 (带重试)
        const encrypted = encryptMessage(message, encryptionKey);
        
        await runWithRetry(async () => {
            await db.prepare(`INSERT INTO messages (room_id, username, content, iv, timestamp) VALUES (?, ?, ?, ?, ?)`).bind(roomId, username, encrypted.encrypted, encrypted.iv, Date.now()).run();
        });
        
        return jsonResponse({ success: true });
    }

    // POST /join
    if (request.method === 'POST' && action === 'join') {
        // 1. 确保表存在
        await ensureTables(db);
        
        // 2. 解析 Body
        const { username } = await request.json();
        if (!username) return jsonResponse({ error: 'Missing username' }, 400);

        // 3. 执行插入 (带重试)
        await runWithRetry(async () => {
            await db.prepare(`INSERT INTO users (room_id, username, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, username) DO UPDATE SET last_seen = ?`)
                    .bind(roomId, username, Date.now(), Date.now()).run();
        });
        
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
             return jsonResponse({ success: true });
        }
    }
    
    // 手动初始化接口
    if (pathParts[2] === 'init') {
        tablesInitialized = false; // 强制重置标志
        try {
            await ensureTables(db);
            return jsonResponse({ success: true, message: '初始化成功' });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }
}
