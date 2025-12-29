// src/handlers/api.js

async function ensureSchema(db) {
    // 1. 基础表结构初始化
    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);

    // 2. 动态检查并修复缺失列 (解决 SQLITE_ERROR)
    const { results: columns } = await db.prepare("PRAGMA table_info(messages)").all();
    const hasMessageCol = columns.some(c => c.name === 'message');
    
    if (!hasMessageCol) {
        // 如果表存在但缺少 message 列，则自动添加
        await db.exec("ALTER TABLE messages ADD COLUMN message TEXT NOT NULL DEFAULT ''");
    }
}

export async function handleApiRequest(request, context, url) {
    const { db } = context;
    const path = url.pathname;
    const method = request.method;

    // 自动初始化/修复数据库结构
    await ensureSchema(db);

    const parts = path.split('/').filter(Boolean);
    if (parts.length < 3) return new Response(JSON.stringify({ error: '无效的 API 路径' }), { status: 400 });

    const roomId = decodeURIComponent(parts[2]);
    const action = parts[3];

    // 获取消息列表
    if (action === 'messages' && method === 'GET') {
        try {
            const { results: msgs } = await db.prepare(
                "SELECT username, message, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp ASC"
            ).bind(roomId).all();

            // 获取最近 5 分钟在线用户
            const { results: users } = await db.prepare(
                "SELECT DISTINCT username FROM messages WHERE room_id = ? AND timestamp > ?"
            ).bind(roomId, Date.now() - 300000).all();

            return new Response(JSON.stringify({
                messages: msgs || [],
                users: users.map(u => u.username) || []
            }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: '查询失败: ' + e.message }), { status: 500 });
        }
    }

    // 发送消息
    if (action === 'send' && method === 'POST') {
        const { username, message } = await request.json();
        await db.prepare(
            "INSERT INTO messages (room_id, username, message, timestamp) VALUES (?, ?, ?, ?)"
        ).bind(roomId, username, message, Date.now()).run();
        return new Response(JSON.stringify({ success: true }));
    }

    // 销毁房间
    if (action === 'destroy' && method === 'POST') {
        await db.prepare("DELETE FROM messages WHERE room_id = ?").bind(roomId).run();
        return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ error: '未找到操作' }), { status: 404 });
}
